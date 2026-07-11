// Computes each generator's transitive table closure and writes a per-tool
// registry JSON (src/generators/registries/<tool>.json). Pages lazy-load only
// their own registry chunk instead of bundling all tables everywhere.
// Run after extraction: node scripts/gen-registries.mjs

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../src/data');
const GENERATORS = resolve(here, '../src/generators');
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

function closure(seedTexts) {
  const seen = new Set();
  const queue = seedTexts.flatMap(refsIn);
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    const table = tables.get(id);
    if (!table) continue; // validator reports missing refs
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
for (const file of readdirSync(GENERATORS)) {
  if (!file.endsWith('.json')) continue;
  const config = JSON.parse(readFileSync(join(GENERATORS, file), 'utf8'));
  const ids = closure(config.slots.map((s) => s.template));
  const registry = {};
  for (const id of [...ids].sort()) registry[id] = tables.get(id);
  const tool = config.id.split('/')[1];
  const bytes = JSON.stringify(registry).length;
  writeFileSync(join(OUT, `${tool}.json`), JSON.stringify(registry));
  total += bytes;
  console.log(`  ✓ ${tool}: ${ids.size} tables, ${(bytes / 1024).toFixed(0)} KB`);
}
console.log(`Total registry payload: ${(total / 1024 / 1024).toFixed(1)} MB (loaded per page, not combined)`);
