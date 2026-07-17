// Validates every table in src/data against schemas/table.schema.json, checks
// that table ids match their file paths, and that every {table:<id>} reference
// resolves. Run: npm run validate

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse as parseDice } from '../src/engine/dice.ts';
import { lintEntryText, tagSetOf } from '../src/engine/tableLint.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../src/data');
const schema = JSON.parse(readFileSync(resolve(here, '../schemas/table.schema.json'), 'utf8'));

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (name.endsWith('.json')) yield p;
  }
}

const tables = new Map();
let errors = 0;

for (const file of walk(DATA)) {
  const rel = relative(DATA, file).split(sep).join('/');
  let table;
  try {
    table = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`✗ ${rel}: invalid JSON — ${e.message}`);
    errors += 1;
    continue;
  }
  if (!validate(table)) {
    errors += 1;
    console.error(`✗ ${rel}:`);
    for (const err of validate.errors) console.error(`    ${err.instancePath || '/'} ${err.message}`);
    continue;
  }
  if (`${table.id}.json` !== rel) {
    errors += 1;
    console.error(`✗ ${rel}: id "${table.id}" does not match file path`);
    continue;
  }
  tables.set(table.id, table);
}

// Token checks live in the SHARED linter (src/engine/tableLint.ts) — the
// same code the in-browser brew editor runs, so site data and user tables
// obey one grammar (PLAN.md §7). Site-content policies (prose warnings)
// stay here.
const refRe = /\{(?:table|var:[a-z][a-z0-9-]*=table):([a-z0-9/-]+)(?:#([a-z0-9-]+))?\}/g;
const resolver = (refId) => {
  const t = tables.get(refId);
  return t ? { tags: tagSetOf(t) } : undefined;
};
let warnings = 0;
for (const [id, table] of tables) {
  for (const entry of table.entries) {
    const text = typeof entry === 'string' ? entry : entry.text;
    for (const issue of lintEntryText(text, resolver)) {
      errors += 1;
      console.error(`✗ ${id}: ${issue.message}`);
    }
    if (/roll (?:once |twice )?on (?:the )?(?!this\b)[\w\s'-]{0,40}table/i.test(text)) {
      warnings += 1;
      console.warn(`⚠ ${id}: entry tells the reader to roll on a table — wire a {table:} ref instead: "${text.slice(0, 80)}..."`);
    }
  }
}

// No table may carry a TRUE duplicate entry (identical text + tags + weight).
// Cross-tag repeats — the same text tagged for different races/merchants/biomes —
// are legitimate and allowed. This guards against the dup debt the audit found.
for (const [id, table] of tables) {
  const seen = new Set();
  for (const entry of table.entries) {
    const k =
      typeof entry === 'string'
        ? `S:${entry}`
        : `O:${JSON.stringify({ t: entry.text, g: entry.tags, w: entry.weight })}`;
    if (seen.has(k)) {
      errors += 1;
      const text = typeof entry === 'string' ? entry : entry.text;
      console.error(`✗ ${id}: duplicate entry "${text.slice(0, 60)}"`);
    } else {
      seen.add(k);
    }
  }
}

// Sheet templates (docs/sheets/PLAN.md §9): every template block must match
// the block schema, and every {table:} token and rollTable ref must resolve
// against the tables loaded above — a template that names a missing table
// would fail at instantiation time, in the user's face.
const TEMPLATES = resolve(here, '../src/sheets/templates');
const blockSchema = JSON.parse(readFileSync(resolve(here, '../schemas/block.schema.json'), 'utf8'));
const validateBlock = ajv.compile(blockSchema);

function* templateTexts(block) {
  switch (block.type) {
    case 'title':
      yield block.text;
      if (block.subtitle) yield block.subtitle;
      break;
    case 'paragraph':
      yield block.text;
      break;
    case 'keyValue':
      for (const p of block.pairs ?? []) yield p.value;
      break;
    case 'list':
      yield* block.items ?? [];
      break;
    case 'table':
      for (const row of block.rows ?? []) yield* row;
      break;
    case 'statblock':
      yield block.name;
      if (block.meta) yield block.meta;
      for (const s of block.sections ?? []) yield* templateTexts(s);
      break;
    case 'rollTable':
      yield `{table:${block.ref}}`;
      break;
    // tracker / statGrid / actions carry no {table:} tokens; their dice
    // formulas are linted separately below
  }
}

/** Every dice formula a template block carries must parse — a template that
 *  ships a broken formula fails in the player's face, mid-session. */
function* templateFormulas(block) {
  if (block.type === 'actions') {
    for (const item of block.items ?? []) for (const r of item.rolls ?? []) yield r.formula;
  }
  if (block.type === 'statblock') {
    for (const s of block.sections ?? []) yield* templateFormulas(s);
  }
}

const inlineDiceRe = /\[\[([^[\]]+)\]\]/g;

let templateCount = 0;
try {
  for (const file of walk(TEMPLATES)) {
    templateCount += 1;
    const rel = relative(TEMPLATES, file);
    let template;
    try {
      template = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      console.error(`✗ template ${rel}: invalid JSON — ${e.message}`);
      errors += 1;
      continue;
    }
    if (!template.id || !template.title || !Array.isArray(template.blocks)) {
      console.error(`✗ template ${rel}: needs id, title, blocks[]`);
      errors += 1;
      continue;
    }
    for (const block of template.blocks) {
      if (!validateBlock(block)) {
        errors += 1;
        console.error(`✗ template ${rel}: invalid block (${block.type ?? 'no type'})`);
        for (const err of validateBlock.errors) console.error(`    ${err.instancePath || '/'} ${err.message}`);
        continue;
      }
      for (const text of templateTexts(block)) {
        for (const m of text.matchAll(refRe)) {
          if (!tables.get(m[1])) {
            errors += 1;
            console.error(`✗ template ${rel}: unresolved reference {table:${m[1]}}`);
          }
        }
        // [[…]] tokens: table refs resolve; anything else must parse as dice
        for (const m of text.matchAll(inlineDiceRe)) {
          const inner = m[1].trim();
          if (inner.toLowerCase().startsWith('table:')) {
            const id = inner.slice(6).trim();
            if (!tables.get(id)) {
              errors += 1;
              console.error(`✗ template ${rel}: unresolved inline [[table:${id}]]`);
            }
          } else {
            try {
              parseDice(inner);
            } catch (e) {
              errors += 1;
              console.error(`✗ template ${rel}: bad inline dice [[${inner}]] — ${e.message}`);
            }
          }
        }
      }
      for (const formula of templateFormulas(block)) {
        try {
          parseDice(formula);
        } catch (e) {
          errors += 1;
          console.error(`✗ template ${rel}: bad action formula "${formula}" — ${e.message}`);
        }
      }
    }
  }
} catch {
  /* no templates dir yet — nothing to validate */
}

// Genre packs (docs/sheets/PLAN.md §15): a pack is a PURE token contract.
// Diff each pack's declared custom properties against the contract list —
// a missing token means some surface silently keeps the fantasy value; an
// extra one means the pack is growing beyond a token contract (the
// documented Homebrewery failure mode).
const GENRE_CONTRACT = new Set([
  '--color-bg',
  '--color-surface',
  '--color-surface-sunken',
  '--color-ink',
  '--color-ink-muted',
  '--color-border',
  '--color-accent',
  '--color-accent-contrast',
  '--color-statblock',
  '--color-statblock-rule',
  '--font-display',
  '--font-body',
  '--radius',
  '--radius-lg',
  '--rule-ornament',
  '--mask-set',
  '--dice-skin',
]);
const GENRES_DIR = resolve(here, '../src/styles/genres');
let packCount = 0;
for (const file of readdirSync(GENRES_DIR)) {
  if (!file.endsWith('.css')) continue;
  packCount += 1;
  const css = readFileSync(resolve(GENRES_DIR, file), 'utf8');
  const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const token of GENRE_CONTRACT) {
    if (!declared.has(token)) {
      errors += 1;
      console.error(`✗ genre pack ${file}: missing contract token ${token}`);
    }
  }
  for (const token of declared) {
    if (!GENRE_CONTRACT.has(token)) {
      errors += 1;
      console.error(`✗ genre pack ${file}: token ${token} is not in the contract — packs are tokens only`);
    }
  }
  for (const marker of ['prefers-color-scheme: dark', 'data-theme="dark"', '@media print']) {
    if (!css.includes(marker)) {
      errors += 1;
      console.error(`✗ genre pack ${file}: no ${marker} section — every pack ships light, dark, and print`);
    }
  }
}

// …and every mask the genres module names must actually ship in public/masks/
const genresSrc = readFileSync(resolve(here, '../src/engine/genres.ts'), 'utf8');
let maskCount = 0;
for (const m of genresSrc.matchAll(/\/masks\/([\w-]+\.svg)/g)) {
  maskCount += 1;
  try {
    readFileSync(resolve(here, '../public/masks', m[1]));
  } catch {
    errors += 1;
    console.error(`✗ genres.ts names /masks/${m[1]} but the file does not exist`);
  }
}

const entryCount = [...tables.values()].reduce((n, t) => n + t.entries.length, 0);
if (errors) {
  console.error(`\n${errors} problem(s) across ${tables.size} tables.`);
  process.exit(1);
}
console.log(
  `✓ ${tables.size} tables, ${entryCount} entries, all references resolve; ${packCount} genre pack(s) match the token contract, ${maskCount} mask(s) ship.${warnings ? ` (${warnings} warning(s))` : ''}`,
);
