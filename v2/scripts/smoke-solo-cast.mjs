// The world-aware oracle (GM/solo audit batch D): pure, deterministic checks
// that named events hold together — the e2e only proves the WIRING (world →
// cast → hash → note); the content invariants live here where 400 seeds cost
// milliseconds. Guards: the focus-named table's {{who}}/pool contract, the
// registry closures actually carrying it, no placeholder residue in output,
// the cast NEVER steering the dice, and named events actually firing.
// Run: node scripts/smoke-solo-cast.mjs (part of npm run smoke)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as buildOracle } from '../src/composites/oracle.ts';
import { build as buildScene } from '../src/composites/scene.ts';

const here = dirname(fileURLToPath(import.meta.url));
const reg = (tool) =>
  new Map(Object.entries(JSON.parse(readFileSync(resolve(here, `../src/generators/registries/${tool}.json`), 'utf8'))));

let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

const oracleTables = reg('oracle');
const sceneTables = reg('scene');

// ── 1. the focus-named contract: {{who}} everywhere, pooled p/f/s ─────────
const named = oracleTables.get('solo/oracle/focus-named');
if (!named) {
  fail('solo/oracle/focus-named missing from the oracle registry (closure scan broke)');
} else {
  const noWho = named.entries.filter((e) => typeof e === 'string' || !e.text.includes('{{who}}'));
  if (noWho.length) fail(`${noWho.length} focus-named entries lack {{who}}`);
  else ok('every focus-named entry carries {{who}}');
  const noPool = named.entries.filter((e) => typeof e === 'string' || !(e.tags ?? []).some((t) => ['p', 'f', 's'].includes(t)));
  if (noPool.length) fail(`${noPool.length} focus-named entries lack a p/f/s pool tag`);
  else ok('every focus-named entry is pooled (p/f/s)');
  for (const t of ['p', 'f', 's']) {
    if (!named.entries.some((e) => typeof e !== 'string' && (e.tags ?? []).includes(t))) {
      fail(`focus-named has no entries tagged '${t}' — that whole actor category would dead-end`);
    }
  }
}
if (!sceneTables.get('solo/oracle/focus-named')) fail('focus-named missing from the SCENE registry');
else ok('the scene registry carries focus-named too');

const CAST = 'p:Vekk the Knife|f:The Ashen Compact|s:Duskbridge';
const NAMES = ['Vekk the Knife', 'The Ashen Compact', 'Duskbridge'];

// ── 2. oracle: no residue, and the cast actually gets named ───────────────
let meanwhiles = 0;
let namedHits = 0;
for (let i = 0; i < 400; i++) {
  const sb = buildOracle(oracleTables, `cast-smoke-${i}`, { likelihood: 'even', question: '', cast: CAST })[0];
  const mw = sb.sections.find((s) => s.label === 'Meanwhile');
  if (!mw) continue;
  meanwhiles++;
  if (mw.text.includes('{{who}}')) fail(`{{who}} residue at seed cast-smoke-${i}: "${mw.text}"`);
  if (NAMES.some((n) => mw.text.includes(n))) namedHits++;
}
if (!meanwhiles) fail('no Meanwhile fired across 400 seeds (the r % 11 band broke?)');
else if (!namedHits) fail(`cast present but 0 of ${meanwhiles} Meanwhile events spoke by name`);
else ok(`oracle: ${namedHits}/${meanwhiles} Meanwhile events named the cast, no residue`);

// ── 3. the cast must never steer the dice ─────────────────────────────────
let steered = false;
for (let i = 0; i < 50 && !steered; i++) {
  const seed = `cast-answer-${i}`;
  const bare = buildOracle(oracleTables, seed, { likelihood: 'even', question: '' })[0];
  const cast = buildOracle(oracleTables, seed, { likelihood: 'even', question: '', cast: CAST })[0];
  if (bare.name !== cast.name || bare.meta !== cast.meta) {
    fail(`the cast CHANGED THE ANSWER at ${seed}: "${bare.name}" vs "${cast.name}"`);
    steered = true;
  }
}
if (!steered) ok('the cast never steers the dice (50 seeds, castless vs cast: same answer + roll)');

// ── 4. scene: interruptions name the cast, cleanly ────────────────────────
let interrupts = 0;
let sceneNamed = 0;
for (let i = 0; i < 400; i++) {
  const sb = buildScene(sceneTables, `scene-smoke-${i}`, { chaos: 'chaotic', expect: '', cast: CAST })[0];
  if (sb.name !== 'Interrupted!') continue;
  interrupts++;
  const s = sb.sections.find((x) => x.label === 'Instead, this happens');
  if (!s) { fail(`interrupted scene without its section at scene-smoke-${i}`); continue; }
  if (s.text.includes('{{who}}')) fail(`{{who}} residue in scene at scene-smoke-${i}: "${s.text}"`);
  if (NAMES.some((n) => s.text.includes(n))) sceneNamed++;
}
if (!interrupts) fail('no interruptions across 400 chaotic scenes (the bands broke?)');
else if (!sceneNamed) fail(`cast present but 0 of ${interrupts} interruptions spoke by name`);
else ok(`scene: ${sceneNamed}/${interrupts} interruptions named the cast, no residue`);

if (failures) {
  console.error(`solo-cast smoke: ${failures} failure(s)`);
  process.exit(1);
}
console.log('solo-cast smoke: all green');
