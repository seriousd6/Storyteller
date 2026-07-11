// Validates every table in src/data against schemas/table.schema.json, checks
// that table ids match their file paths, and that every {table:<id>} reference
// resolves. Run: npm run validate

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

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

// Token checks: {table:} refs resolve, {count:}/{num:} ranges are sane,
// {pick:} has 2+ non-empty options, and no unknown token kinds slip through.
const refRe = /\{(?:table|var:[a-z][a-z0-9-]*=table):([a-z0-9/-]+)(?:#([a-z0-9-]+))?\}/g;
const rangeRe = /\{(count|num):([^{}]*)\}/g;
const pickRe = /\{pick:([^{}]*)\}/g;
const kindRe = /\{([a-z]+):/g;
const KNOWN = new Set(['table', 'count', 'num', 'pick', 'var']);
let warnings = 0;
for (const [id, table] of tables) {
  for (const entry of table.entries) {
    const text = typeof entry === 'string' ? entry : entry.text;
    for (const m of text.matchAll(refRe)) {
      const target = tables.get(m[1]);
      if (!target) {
        errors += 1;
        console.error(`✗ ${id}: unresolved reference {table:${m[1]}}`);
      } else if (m[2] && !target.entries.some((e) => typeof e === 'object' && e.tags?.includes(m[2]))) {
        errors += 1;
        console.error(`✗ ${id}: no entries in ${m[1]} carry tag #${m[2]}`);
      }
    }
    if (/roll (?:once |twice )?on (?:the )?[\w\s'-]{0,40}table/i.test(text)) {
      warnings += 1;
      console.warn(`⚠ ${id}: entry tells the reader to roll on a table — wire a {table:} ref instead: "${text.slice(0, 80)}..."`);
    }
    for (const m of text.matchAll(rangeRe)) {
      const parts = m[2].split('-').map(Number);
      if (parts.length !== 2 || parts.some(Number.isNaN) || parts[0] > parts[1]) {
        errors += 1;
        console.error(`✗ ${id}: bad range token {${m[1]}:${m[2]}}`);
      }
    }
    for (const m of text.matchAll(pickRe)) {
      const options = m[1].split('|').map((s) => s.trim());
      if (options.length < 2 || options.some((o) => !o)) {
        errors += 1;
        console.error(`✗ ${id}: bad pick token {pick:${m[1].slice(0, 40)}}`);
      }
    }
    for (const m of text.matchAll(kindRe)) {
      if (!KNOWN.has(m[1])) {
        errors += 1;
        console.error(`✗ ${id}: unknown token kind {${m[1]}:...}`);
      }
    }
  }
}

const entryCount = [...tables.values()].reduce((n, t) => n + t.entries.length, 0);
if (errors) {
  console.error(`\n${errors} problem(s) across ${tables.size} tables.`);
  process.exit(1);
}
console.log(
  `✓ ${tables.size} tables, ${entryCount} entries, all references resolve.${warnings ? ` (${warnings} warning(s))` : ''}`,
);
