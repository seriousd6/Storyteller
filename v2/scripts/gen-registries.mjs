// Computes each generator's and composite's transitive table closure and
// writes a per-tool registry JSON (src/generators/registries/<tool>.json).
// Pages lazy-load only their own registry chunk instead of bundling all
// tables everywhere.
// Run after extraction: node scripts/gen-registries.mjs

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../src/data');
const GENERATORS = resolve(here, '../src/generators');
const COMPOSITES = resolve(here, '../src/composites');
const OUT = join(GENERATORS, 'registries');

const tables = new Map();
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.json')) {
      const t = JSON.parse(readFileSync(p, 'utf8'));
      tables.set(t.id, t);
    }
  }
})(DATA);

const REF = /\{(?:table|var:[a-z][a-z0-9-]*=table):([a-z0-9/-]+)(?:#[a-z0-9-]+)?\}/g;

function refsIn(text) {
  return [...text.matchAll(REF)].map((m) => m[1]);
}

/** Root table ids referenced by a composite's TS source: quoted 'gm/...'
 *  literals (programmatic lookups) plus any {table:...} template prefixes
 *  (covers interpolated tags like {table:gm/shop/inventory#${slug}}).
 *  SIBLING imports (./hoard.ts style) are followed one hop: shared tier
 *  tables live in one file now, and a registry that only scanned the
 *  importer's own source would silently drop the tables the shared code
 *  rolls on — the "valid but wrong" failure this repo keeps paying for. */
function compositeRoots(src, dir) {
  const ids = new Set();
  const scan = (text) => {
    for (const m of text.matchAll(/['"`]((?:gm|solo|writing)\/[a-z0-9/-]+)['"`]/g)) ids.add(m[1]);
    for (const m of text.matchAll(/\{table:([a-z0-9/-]+)/g)) ids.add(m[1]);
  };
  scan(src);
  if (dir) {
    for (const m of src.matchAll(/from\s+['"]\.\/([a-z0-9-]+)\.ts['"]/g)) {
      try { scan(readFileSync(join(dir, `${m[1]}.ts`), 'utf8')); } catch { /* sibling gone — validator will flag the refs */ }
    }
  }
  return [...ids];
}

function closure(rootIds) {
  const seen = new Set();
  const queue = [...rootIds];
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    const table = tables.get(id);
    if (!table) continue; // validator reports missing refs; composite ids self-match harmlessly
    seen.add(id);
    for (const entry of table.entries) {
      queue.push(...refsIn(typeof entry === 'string' ? entry : entry.text));
    }
  }
  return seen;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let total = 0;
function writeRegistry(tool, ids) {
  const registry = {};
  for (const id of [...ids].sort()) registry[id] = tables.get(id);
  const bytes = JSON.stringify(registry).length;
  writeFileSync(join(OUT, `${tool}.json`), JSON.stringify(registry));
  total += bytes;
  console.log(`  ✓ ${tool}: ${ids.size} tables, ${(bytes / 1024).toFixed(0)} KB`);
}

for (const file of readdirSync(GENERATORS)) {
  if (!file.endsWith('.json')) continue;
  const config = JSON.parse(readFileSync(join(GENERATORS, file), 'utf8'));
  writeRegistry(config.id.split('/')[1], closure(config.slots.flatMap((s) => refsIn(s.template))));
}

for (const file of readdirSync(COMPOSITES)) {
  if (!file.endsWith('.ts')) continue;
  const src = readFileSync(join(COMPOSITES, file), 'utf8');
  writeRegistry(basename(file, '.ts'), closure(compositeRoots(src, COMPOSITES)));
}

console.log(`Total registry payload: ${(total / 1024 / 1024).toFixed(1)} MB (loaded per page, not combined)`);
