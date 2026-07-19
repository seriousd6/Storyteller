// SRD statblock lines (GM/solo audit batch E): deterministic content
// invariants for the "5 × Sprite must not dead-end" fix. The e2e proves only
// the wiring (a page shows the section); everything about the DATA and the
// contract lives here where 300 seeds cost milliseconds. Guards: the
// slug↔tag round-trip between fetch-srd-monsters.mjs and composites/srd.ts,
// registry closures actually carrying gm/monsters/srd, coverage not silently
// collapsing on a refetch, every SRD-covered monster in a result getting its
// line, and — the big one — the stats NEVER steering the dice: a build with
// the srd table deleted must produce the identical result minus the tail.
// Run: node scripts/smoke-srd-statblocks.mjs (part of npm run smoke)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as buildEncounter } from '../src/composites/encounter.ts';
import { build as buildLair } from '../src/composites/lair.ts';
import { build as buildDungeon } from '../src/composites/dungeon.ts';

const here = dirname(fileURLToPath(import.meta.url));
const reg = (tool) =>
  new Map(Object.entries(JSON.parse(readFileSync(resolve(here, `../src/generators/registries/${tool}.json`), 'utf8'))));

let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

// the same slug composites/srd.ts derives and fetch-srd-monsters.mjs stamps
const slug = (name) => 'n-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ── 1. the table: tags round-trip to rollable names, no orphans, no dupes ──
const srd = JSON.parse(readFileSync(resolve(here, '../src/data/gm/monsters/srd.json'), 'utf8'));
const all = JSON.parse(readFileSync(resolve(here, '../src/data/gm/monsters/all.json'), 'utf8'));
const rollableSlugs = new Set(all.entries.map((e) => slug(typeof e === 'string' ? e : e.text)));

if (srd.entries.length < 300) fail(`only ${srd.entries.length} statblock lines — a refetch dropped coverage`);
else ok(`${srd.entries.length} statblock lines`);

const seenTags = new Set();
let orphans = 0, dupes = 0, malformed = 0;
for (const e of srd.entries) {
  const tag = typeof e === 'string' ? null : e.tags?.[0];
  if (!tag || e.tags.length !== 1 || !tag.startsWith('n-')) { malformed++; continue; }
  if (seenTags.has(tag)) dupes++;
  seenTags.add(tag);
  if (!rollableSlugs.has(tag)) orphans++;
  if (!/^AC \d/.test(e.text) || !e.text.includes('CR ')) malformed++;
}
if (malformed) fail(`${malformed} entries malformed (need exactly one n- tag and an AC…CR line)`);
else ok('every entry: one n- tag, AC…CR shape');
if (orphans) fail(`${orphans} statblocks for names the CR table never rolls (slug drift?)`);
else ok('every tag matches a rollable monster name — the slug round-trips');
if (dupes) fail(`${dupes} duplicate tags`);
else ok('no duplicate tags');

// ── 2. closures: every composite that names monsters can see the stats ────
for (const tool of ['encounter', 'lair', 'dungeon']) {
  if (!reg(tool).get('gm/monsters/srd')) fail(`gm/monsters/srd missing from the ${tool} registry closure`);
}
ok('encounter, lair, and dungeon registries all carry gm/monsters/srd');

// ── 3. encounter: covered names get lines, and the stats never steer ──────
const tables = reg('encounter');
const bare = new Map(tables); // the same registry WITHOUT the stats
bare.delete('gm/monsters/srd');

const forcesName = (line) => line.replace(/^\d+ × /, '').replace(/ — CR .*$/, '');
let sectioned = 0, covered = 0, missing = 0;
for (let i = 0; i < 200; i++) {
  const seed = `srd-smoke-${i}`;
  const opts = { size: '4', level: String(1 + (i % 20)), difficulty: 'medium', theme: '' };
  const sb = buildEncounter(tables, seed, opts)[0];
  const kv = sb.sections.find((s) => s.type === 'keyValue' && s.pairs.some((p) => /^AC \d/.test(p.value)));
  if (kv) sectioned++;
  for (const line of sb.sections[0].items) {
    const name = forcesName(line);
    if (!seenTags.has(slug(name))) continue; // non-SRD flavor stays prose, fine
    covered++;
    if (!kv || !kv.pairs.some((p) => p.key === name)) {
      missing++;
      fail(`${seed}: "${name}" is SRD-covered but got no statblock line`);
    }
  }
  // determinism: strip the tail and the bare build must match EXACTLY
  const withStats = sb.sections.filter((s) => !(s.type === 'keyValue' && s.pairs.some((p) => /^AC \d/.test(p.value))) && s.label !== 'Statblocks');
  const bareSb = buildEncounter(bare, seed, opts)[0];
  if (JSON.stringify(withStats) !== JSON.stringify(bareSb.sections) || bareSb.name !== sb.name) {
    fail(`${seed}: removing the srd table changed the ROLLS — stats are steering the dice`);
    break;
  }
}
if (!missing) ok(`every SRD-covered monster got its line (${covered} across 200 encounters)`);
// ~50% of encounters roll an SRD-covered monster (the rest are non-SRD
// flavor names — honest prose, no licensed stats). The floor catches a
// COLLAPSE (slug drift, refetch damage), not a dip.
if (sectioned < 80) fail(`only ${sectioned}/200 encounters carry a statblock section — coverage collapsed`);
else ok(`${sectioned}/200 encounters carry the section`);
ok('the stats never steer the dice (200-seed bare-registry comparison)');

// ── 4. lair and dungeon wiring ─────────────────────────────────────────────
const lairTables = reg('lair');
let lairHits = 0;
for (let i = 0; i < 50; i++) {
  const sb = buildLair(lairTables, `srd-lair-${i}`, { kind: 'beast', level: String(1 + (i % 20)) })[0];
  if (sb.sections.some((s) => s.type === 'keyValue' && s.pairs.some((p) => /^AC \d/.test(p.value)))) lairHits++;
}
if (!lairHits) fail('no lair carried a statblock section across 50 seeds');
else ok(`lair: ${lairHits}/50 carry stats`);

const dgTables = reg('dungeon');
let dgHits = 0;
for (let i = 0; i < 50; i++) {
  const sb = buildDungeon(dgTables, `srd-dg-${i}`, { theme: '', size: 'medium', level: String(1 + (i % 20)), treasure: 'standard' })[0];
  if (sb.sections.some((s) => s.type === 'keyValue' && s.pairs.some((p) => /^AC \d/.test(p.value)))) dgHits++;
}
if (!dgHits) fail('no dungeon carried a statblock section across 50 seeds');
else ok(`dungeon: ${dgHits}/50 carry stats`);

// ── 5. license hygiene: the attribution travels with the content ──────────
const att = buildEncounter(tables, 'srd-smoke-att', { size: '4', level: '3', difficulty: 'medium', theme: '' })[0]
  .sections.find((s) => s.label === 'Statblocks');
if (att && !/CC BY 4\.0/.test(att.text)) fail('the Statblocks header lost its CC BY 4.0 attribution');
else ok('attribution rides with the section');

if (failures) {
  console.error(`\nSRD statblock smoke: ${failures} failure(s).`);
  process.exit(1);
}
console.log('SRD statblock smoke: all green.');
