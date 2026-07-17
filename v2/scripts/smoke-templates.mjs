// Every generator must become a self-filling one-pager
// (docs/sheets/GENERATORS-AS-ONEPAGERS.md): derive each slot generator's
// SheetTemplate, then fill it the way the Sheet Builder's fill-on-instantiate
// pass will — roll every text token with one seed — and assert:
//   1. no slot is lost — the template carries a field per slot (+ the title)
//   2. it self-fills clean — no unresolved {table|count|num|pick|var} / ${…}
//   3. determinism — same seed → byte-identical fill (share links, smoke, undo)
// This is the guarantee that lets the roll-table page and the one-pager page
// collapse to one: the one-pager is the generator, filled.
// Run: node scripts/smoke-templates.mjs  (part of npm run smoke)

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderTemplate, setStrictTags } from '../src/engine/roll.ts';
import { generatorTemplate, sectionPalette, templateTextFields } from '../src/engine/generatorTemplate.ts';

setStrictTags(true); // a tag-filter that matches nothing is a bug, not a soft spot

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

const UNRESOLVED = /\{(table|count|num|pick|var):|\$\{/;
let failures = 0;
let count = 0;

for (const file of readdirSync(GENERATORS)) {
  if (!file.endsWith('.json') || statSync(join(GENERATORS, file)).isDirectory()) continue;
  const config = JSON.parse(readFileSync(join(GENERATORS, file), 'utf8'));

  const template = generatorTemplate(config);
  count += 1;

  // 1. no slot lost — one text field per non-name slot, plus the title field.
  const fields = templateTextFields(template.blocks);
  const nonNameSlots = config.slots.filter((s) => s.id !== 'name').length;
  const expected = nonNameSlots + 1; // sections + the statblock name/title
  if (fields.length < expected) {
    failures += 1;
    console.error(`✗ ${config.id}: template has ${fields.length} fields, expected ≥ ${expected}`);
    continue;
  }

  // 2 + 3. fill it (twice) — clean and deterministic.
  let bad = 0;
  let sample = '';
  let nondet = false;
  for (let i = 0; i < 50; i++) {
    const seed = `${config.id}-tmpl-${i}`;
    const a = fields.map((t) => renderTemplate(t, tables, seed)).join('');
    const b = fields.map((t) => renderTemplate(t, tables, seed)).join('');
    if (a !== b) nondet = true;
    if (UNRESOLVED.test(a)) {
      bad += 1;
      sample = a.split('').find((s) => UNRESOLVED.test(s)) ?? a;
    }
  }
  if (nondet) {
    failures += 1;
    console.error(`✗ ${config.id}: template fill is not deterministic for a fixed seed`);
  } else if (bad) {
    failures += 1;
    console.error(`✗ ${config.id}: ${bad}/50 fills left an unresolved token — e.g. ${sample.slice(0, 100)}`);
  } else {
    console.log(`✓ ${config.id}: fills clean (${fields.length} fields, ${sectionPalette(config).length} in palette)`);
  }
}

if (failures) {
  console.error(`\n${failures} failure(s) across ${count} generator templates.`);
  process.exit(1);
}
console.log(`\nAll ${count} generators derive a deterministic, self-filling one-pager. ✓`);
