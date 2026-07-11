// Engine smoke test (no framework needed — Node 23.6+ strips TS types natively):
//   1. determinism — same seed, same output
//   2. coverage — every slot of every generator renders 200 rolls with no
//      unresolved {table:...}/{count:...} tokens and no legacy ${...} residue
// Run: npm run smoke

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTemplate } from '../src/engine/roll.ts';

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../src/data');
const GENERATORS = resolve(here, '../src/generators');

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

let failures = 0;

// 1. Determinism
{
  const a = renderTemplate('{table:gm/tavern/name}', tables, 'seed-1');
  const b = renderTemplate('{table:gm/tavern/name}', tables, 'seed-1');
  const c = renderTemplate('{table:gm/tavern/name}', tables, 'seed-2');
  if (a !== b) {
    failures += 1;
    console.error(`✗ determinism: "${a}" !== "${b}"`);
  }
  console.log(`  seed-1 → "${a}"  seed-2 → "${c}"`);
}

// 2. Coverage
for (const file of readdirSync(GENERATORS)) {
  const config = JSON.parse(readFileSync(join(GENERATORS, file), 'utf8'));
  for (const slot of config.slots) {
    let bad = 0;
    let sample = '';
    for (let i = 0; i < 200; i++) {
      const out = renderTemplate(slot.template, tables, `${slot.id}-${i}`);
      if (/\{(table|count|num|pick):/.test(out) || out.includes('${')) {
        bad += 1;
        sample = out;
      }
    }
    if (bad) {
      failures += 1;
      console.error(`✗ ${config.id}#${slot.id}: ${bad}/200 unresolved — e.g. ${sample.slice(0, 120)}`);
    } else {
      console.log(`✓ ${config.id}#${slot.id}`);
    }
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
