// Engine smoke test (no framework needed — Node 23.6+ strips TS types natively):
//   1. determinism — same seed, same output
//   2. coverage — every slot of every generator renders 200 rolls with no
//      unresolved {table:...}/{count:...} tokens and no legacy ${...} residue
//   3. composites — every composite builds 100 times against its OWN registry
//      chunk (so closure gaps fail here), cycling through every option value
// Run: npm run smoke (runs gen-registries first)

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderTemplate, setStrictTags } from '../src/engine/roll.ts';

// A `{table:id#tag}` roll that matches nothing is a bug, not a soft spot: fail
// here rather than let the browser render a gap.
setStrictTags(true);

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../src/data');
const GENERATORS = resolve(here, '../src/generators');
const COMPOSITES = resolve(here, '../src/composites');
const REGISTRIES = join(GENERATORS, 'registries');

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
  if (!file.endsWith('.json') || statSync(join(GENERATORS, file)).isDirectory()) continue;
  const config = JSON.parse(readFileSync(join(GENERATORS, file), 'utf8'));
  for (const slot of config.slots) {
    let bad = 0;
    let sample = '';
    for (let i = 0; i < 200; i++) {
      const out = renderTemplate(slot.template, tables, `${slot.id}-${i}`);
      if (/\{(table|count|num|pick|var):/.test(out) || out.includes('${')) {
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

// 3. Composites
const UNRESOLVED = /\{(table|count|num|pick|var):|\$\{|\u0000/;
for (const file of readdirSync(COMPOSITES)) {
  if (!file.endsWith('.ts')) continue;
  // a file without a meta export is a shared helper (srd.ts), not a tool —
  // same rule gen-registries applies when deciding what gets a chunk
  if (!readFileSync(join(COMPOSITES, file), 'utf8').includes('export const meta')) continue;
  const tool = basename(file, '.ts');
  const registryPath = join(REGISTRIES, `${tool}.json`);
  if (!existsSync(registryPath)) {
    failures += 1;
    console.error(`✗ composite ${tool}: no registry — run npm run registries first`);
    continue;
  }
  const registry = new Map(Object.entries(JSON.parse(readFileSync(registryPath, 'utf8'))));
  const { meta, build } = await import(pathToFileURL(join(COMPOSITES, file)).href);

  const defaults = Object.fromEntries(meta.options.map((o) => [o.id, o.default]));
  const a = JSON.stringify(build(registry, 'seed-1', defaults));
  const b = JSON.stringify(build(registry, 'seed-1', defaults));
  if (a !== b) {
    failures += 1;
    console.error(`✗ composite ${tool}: not deterministic for the same seed`);
  }

  let bad = 0;
  let sample = '';
  for (let i = 0; i < 100; i++) {
    const opts = Object.fromEntries(
      meta.options.map((o) => [o.id, o.choices[i % o.choices.length].value]),
    );
    const blocks = build(registry, `${tool}-${i}`, opts);
    const json = JSON.stringify(blocks);
    if (!Array.isArray(blocks) || blocks.length === 0 || UNRESOLVED.test(json) || json.includes('undefined')) {
      bad += 1;
      sample = json?.slice(0, 160) ?? String(blocks);
    }
  }
  if (bad) {
    failures += 1;
    console.error(`✗ composite ${meta.id}: ${bad}/100 bad builds — e.g. ${sample}`);
  } else {
    console.log(`✓ composite ${meta.id} (100 builds, all options cycled)`);
  }
}

if (failures) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nAll smoke checks passed.');
