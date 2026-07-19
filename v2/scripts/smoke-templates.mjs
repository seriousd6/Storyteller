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
import { generatorTemplate, sectionPalette, templateTextFields, slotSeeds } from '../src/engine/generatorTemplate.ts';

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

/** The optional `page` layout block (GENERATORS-AS-ONEPAGERS.md §7) is
 *  presentation-only, so it isn't schema-validated — but a typo'd slot id in it
 *  is silently swallowed by Generator.astro's "More" catch-all: the slot still
 *  renders, just in the wrong band, and nothing fails. Catch it here: every id a
 *  `page` names must be a real slot, and no slot may be claimed by two sections
 *  (a double-place also drops silently). Returns an error string, or null. */
function checkPage(config) {
  const page = config.page;
  if (!page) return null;
  const ids = new Set(config.slots.map((s) => s.id));
  const named = [];
  if (page.lead !== undefined) named.push(page.lead);
  if (page.sub !== undefined) named.push(page.sub);
  for (const sec of page.sections ?? []) named.push(...(sec.slots ?? []));
  const missing = named.filter((id) => !ids.has(id));
  if (missing.length) return `page references unknown slot id(s): ${[...new Set(missing)].join(', ')}`;
  const seen = new Set();
  const dup = named.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  if (dup.length) return `page places a slot in more than one spot: ${[...new Set(dup)].join(', ')}`;
  return null;
}

for (const file of readdirSync(GENERATORS)) {
  if (!file.endsWith('.json') || statSync(join(GENERATORS, file)).isDirectory()) continue;
  const config = JSON.parse(readFileSync(join(GENERATORS, file), 'utf8'));

  const template = generatorTemplate(config);
  count += 1;

  // 0. the page layout, if any, must reference only real slots (no silent drop).
  const pageErr = checkPage(config);
  if (pageErr) {
    failures += 1;
    console.error(`✗ ${config.id}: ${pageErr}`);
    continue;
  }

  // 1. no slot lost — one text field per non-name slot, plus the title field.
  const fields = templateTextFields(template.blocks);
  const nonNameSlots = config.slots.filter((s) => s.id !== 'name').length;
  const expected = nonNameSlots + 1; // sections + the statblock name/title
  if (fields.length < expected) {
    failures += 1;
    console.error(`✗ ${config.id}: template has ${fields.length} fields, expected ≥ ${expected}`);
    continue;
  }

  // 1b. the slotSeeds↔fields contract (share-link reproducibility): the fill
  // pass rolls text field i with `${pageSeed}:${i}`, and the generator PAGE rolls
  // each slot from slotSeeds() — so `/sheet/?template=&seed=` reproduces the page
  // ONLY if slotSeeds hands out distinct, in-range indices that reach the last
  // field. A slot seeded past the fields, a collision, or a stranded last field
  // silently desyncs the two surfaces. (Was only guarded by the rollers e2e.)
  const seedIdx = [...slotSeeds(config, 's').values()].map((v) => Number(v.slice(v.indexOf(':') + 1)));
  const badIdx = seedIdx.some((n) => !Number.isInteger(n) || n < 0 || n >= fields.length);
  const collide = new Set(seedIdx).size !== seedIdx.length;
  const reachesEnd = Math.max(...seedIdx) === fields.length - 1;
  if (badIdx || collide || !reachesEnd) {
    failures += 1;
    console.error(`✗ ${config.id}: slotSeeds↔fields misaligned — indices [${seedIdx.join(',')}] vs ${fields.length} fields${collide ? ' (collision)' : ''}${badIdx ? ' (out of range)' : ''}${!reachesEnd ? ' (last field unseeded)' : ''}`);
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
