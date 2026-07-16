// Everdeep contract smoke test: pins the published seed-contract vectors
// (docs/everdeep/CONTRACTS.md §3) against src/everdeep/seeds.ts, and checks
// path builders + RNG stream determinism. A failure here means user worlds
// would silently redraw — do not "fix" the vectors, fix the regression.
// Run: node scripts/smoke-everdeep.mjs (part of npm run smoke)

import { h32, h64, ghostId, childPath, hexPath, hexFeaturePath, rolePath, rngFor, STREAM } from '../src/everdeep/seeds.ts';
import { blocksToEntity } from '../src/everdeep/adapters.ts';

let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

// CONTRACTS.md §3 test vectors — frozen.
const VECTORS = [
  ['vessia-prime', 1138472817, 'e_0a1jbsg1wf8upn'],
  ['vessia-prime/p:p_surface', 3925283698, 'e_1vbv1050m2vcfb'],
  ['vessia-prime/p:p_surface/h:region:12,-4', 2436773461, 'e_12gcu71171v671'],
  ['vessia-prime/p:p_surface/h:region:12,-4/f:settlement:3', 2760255946, 'e_1gl6hz11t41vf2'],
  ['vessia-prime/e_a1b2c3d4e5/c:person:0', 3851579379, 'e_1xwb45d0l9i7re'],
  ['vessia-prime/e_a1b2c3d4e5/c:person:0/r:2', 1662088585, 'e_00l8rkb1cf1mj4'],
  ['vessia-prime/e_q9r8s7t6u5/role:villain', 3528998643, 'e_0m2pmaq0l5hi4u'],
];
for (const [path, want32, wantId] of VECTORS) {
  if (h32(path, 0) !== want32) fail(`h32(${path}) = ${h32(path, 0)}, want ${want32}`);
  if (ghostId(path) !== wantId) fail(`ghostId(${path}) = ${ghostId(path)}, want ${wantId}`);
}
if (!failures) ok(`${VECTORS.length} contract vectors pinned`);

// Path builders must reproduce the vector inputs exactly.
const built = [
  [hexPath('vessia-prime', 'p_surface', 'region', 12, -4), 'vessia-prime/p:p_surface/h:region:12,-4'],
  [hexFeaturePath('vessia-prime', 'p_surface', 'region', 12, -4, 'settlement', 3), 'vessia-prime/p:p_surface/h:region:12,-4/f:settlement:3'],
  [childPath('vessia-prime', 'e_a1b2c3d4e5', 'person', 0), 'vessia-prime/e_a1b2c3d4e5/c:person:0'],
  [childPath('vessia-prime', 'e_a1b2c3d4e5', 'person', 0, 2), 'vessia-prime/e_a1b2c3d4e5/c:person:0/r:2'],
  [rolePath('vessia-prime', 'e_q9r8s7t6u5', 'villain'), 'vessia-prime/e_q9r8s7t6u5/role:villain'],
];
for (const [got, want] of built) if (got !== want) fail(`path builder: ${got} != ${want}`);
ok('path builders reproduce vector inputs');

// RNG: deterministic per (path, stream); streams independent.
const a1 = rngFor('vessia-prime/e_x/c:person:0', STREAM.CONTENT);
const a2 = rngFor('vessia-prime/e_x/c:person:0', STREAM.CONTENT);
const b = rngFor('vessia-prime/e_x/c:person:0', STREAM.LAYOUT);
const seqA1 = [a1(), a1(), a1()], seqA2 = [a2(), a2(), a2()], seqB = [b(), b(), b()];
if (JSON.stringify(seqA1) !== JSON.stringify(seqA2)) fail('rngFor not deterministic');
if (JSON.stringify(seqA1) === JSON.stringify(seqB)) fail('streams not independent');
ok('rngFor deterministic; streams independent');

// h64 id shape + quick collision sweep.
const seen = new Set();
let coll = 0;
for (let i = 0; i < 20000; i++) {
  const id = ghostId(`w/${i}/c:person:${i % 7}`);
  if (!/^e_[0-9a-z]{14}$/.test(id)) { fail(`bad id shape: ${id}`); break; }
  if (seen.has(id)) coll++;
  seen.add(id);
}
if (coll) fail(`${coll} collisions in 20k ids`);
ok('id shape valid; 0 collisions in 20k');

// ---------- every field a generator writes must have a registry def ----------
// A field with no def falls back to a plain text input showing String(value).
// For a string that merely looks scruffy — the raw key as its label. For an
// ENTITY REF it renders the literal text "[object Object]", which is what the
// owner found on 233 realm pages (item #28). Nothing failed: an undefined field
// degrades silently, which is exactly why it sat there.
{
  const { readFileSync } = await import('node:fs');
  const REG = JSON.parse(readFileSync(new URL('../src/everdeep/registry.json', import.meta.url), 'utf8'));
  const w = JSON.parse(readFileSync(new URL('../public/labs/earth.example.json', import.meta.url), 'utf8'));
  const defs = {};
  for (const k of REG.kinds) defs[k.id] = new Map((k.suggestedFields ?? []).map((f) => [f.key, f]));
  const orphans = new Map();
  let refs = 0, dangling = 0, objectObject = 0;
  for (const e of Object.values(w.entities)) {
    for (const [key, v] of Object.entries(e.fields ?? {})) {
      const def = defs[e.kind]?.get(key);
      if (!def) {
        const k = `${e.kind}.${key}`;
        orphans.set(k, (orphans.get(k) ?? 0) + 1);
        // the specific horror: an undefined entityRef stringifies to this
        if (v && typeof v === 'object' && 'ref' in v) objectObject++;
      }
      if (v && typeof v === 'object' && 'ref' in v) {
        refs++;
        if (!w.entities[v.ref]) dangling++;
        // a ref whose def names the wrong kinds can never be picked in the UI
        const rk = def?.refKind;
        if (rk) {
          const kinds = Array.isArray(rk) ? rk : [rk];
          const target = w.entities[v.ref];
          if (target && !kinds.includes(target.kind)) {
            fail(`${e.kind}.${key} points at a ${target.kind}, but its refKind says ${kinds.join('/')} — the dropdown can never show it`);
          }
        }
      }
    }
  }
  orphans.size === 0
    ? ok(`every field on all ${Object.keys(w.entities).length} entities has a registry def`)
    : fail(`fields with no def (they render with a raw key): ${[...orphans].map(([k, n]) => `${k}×${n}`).join(', ')}`);
  objectObject === 0
    ? ok(`no entityRef renders as "[object Object]" (${refs} refs checked)`)
    : fail(`${objectObject} entityRef fields have no def — they render as literal "[object Object]"`);
  dangling === 0
    ? ok('every entityRef points at an entity that exists')
    : fail(`${dangling} entityRefs point at a missing entity`);
}

// ---- a generated world is REPRODUCIBLE ----
//
// The seed contract exists so the same seed draws the same world, and this file
// already says a failure means "user worlds would silently redraw". But the two
// things that carried a generated entity — its ID and its BLOCK ids — were both
// minted from crypto.getRandomValues, so the same seed built the same world
// under a different name every single time.
//
// It was not academic. The shipped Earth churned all 4,151 ids and 262 wall-clock
// timestamps on every bake: 5 MB of diff for a one-line change, two bakes that
// could not be compared, and so no way to answer "did that refactor move the
// world?" — exactly when 400 lines of orchestration were being moved. Worse,
// gen.overrides addresses a hand-edited block as `block:b_…`, and a reroll
// minted fresh ids for the same blocks, orphaning every override it was written
// to protect.
{
  const blocks = [
    { type: 'title', text: 'The Salt Gate' },
    { type: 'paragraph', text: 'Toll-takers and gossip.' },
  ];
  const a = blocksToEntity('gm/landmark', 'earth/GB/London', structuredClone(blocks), 'X');
  const b = blocksToEntity('gm/landmark', 'earth/GB/London', structuredClone(blocks), 'X');
  const c = blocksToEntity('gm/landmark', 'earth/FR/Paris', structuredClone(blocks), 'X');
  const idsOf = (e) => e.body.map((x) => x.id).join(',');
  idsOf(a) === idsOf(b)
    ? ok(`same seed → same block ids (${idsOf(a)}) — an override survives a reroll`)
    : fail(`same seed gave different block ids: ${idsOf(a)} vs ${idsOf(b)}`);
  idsOf(a) !== idsOf(c)
    ? ok('a different seed → different block ids')
    : fail('two different seeds produced the same block ids');
  new Set(a.body.map((x) => x.id)).size === a.body.length
    ? ok('block ids are unique within an entity')
    : fail('an entity has two blocks with the same id — secretBlocks/overrides would be ambiguous');
  a.body.every((x) => /^b_[a-z0-9_]{3,}$/.test(x.id))
    ? ok('block ids match the stored schema')
    : fail(`a block id breaks the schema pattern: ${idsOf(a)}`);
}

console.log(failures ? `\nEverdeep smoke FAILED: ${failures}` : 'Everdeep contract smoke: all green.');
process.exit(failures ? 1 : 0);
