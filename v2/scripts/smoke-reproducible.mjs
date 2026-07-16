// The shipped Earth rebuilds BYTE-IDENTICALLY (batch 122).
//
// This is the check that was missing at the worst possible moment. Earth's
// entity ids came from crypto.getRandomValues and its timestamps from the wall
// clock, so every build of the same world produced a different 5 MB file: two
// bakes could not be compared, and neither could two versions of the generator.
// Which is precisely the question you want answered while moving 400 lines of
// orchestration out of a bake script and into the browser — "did that change the
// world?" — and there was no way to ask it.
//
// It rebuilds the fixture from the same shared module the browser's worker
// calls, and demands the bytes match what is committed. So this fails on:
//   - anything that makes generation non-deterministic again (a random id, a
//     Date.now(), a Map iterated in insertion order that changed),
//   - a change to any generation pass that moves the world without the fixture
//     being rebaked — the committed Earth and the code that claims to produce it
//     cannot silently disagree.
//
// If it fails and the change was intended: re-run
//   node docs/everdeep/scripts/bake-earth-2026.mjs
// and commit the fixture WITH the change, so the diff shows what moved.
//
// Part of `npm run smoke`. ~45s — the price of being able to trust the fixture.

import { readFileSync } from 'node:fs';
import { buildEarth2026 } from '../src/everdeep/earth2026.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const dataDir = new URL('../public/data/', import.meta.url);
const bundles = new Map();
const io = {
  read: async (name) => readFileSync(new URL(name, dataDir), 'utf8'),
  composite: async (tool) => {
    if (!bundles.has(tool)) {
      const mod = await import(`../src/composites/${tool}.ts`);
      const reg = JSON.parse(readFileSync(new URL(`../src/generators/registries/${tool}.json`, import.meta.url), 'utf8'));
      bundles.set(tool, { meta: mod.meta, build: mod.build, tables: new Map(Object.entries(reg)) });
    }
    return bundles.get(tool);
  },
};

const t0 = Date.now();
const { world } = await buildEarth2026(io);
const built = JSON.stringify(world);
console.log(`   rebuilt Earth in ${((Date.now() - t0) / 1000).toFixed(1)}s (${(built.length / 1e6).toFixed(1)} MB)`);

// The canonical artifact the bake writes...
const shipped = readFileSync(new URL('../../docs/everdeep/examples/world.example.json', import.meta.url), 'utf8');
// ...and the copy the APP actually fetches. build-labs.mjs publishes it with a
// trailing newline. These two have fallen out of step before — the bake's
// auto-publish silently failed for every run on a checkout path with a space in
// it — so check the copy is the fixture rather than assuming the sync held.
const served = readFileSync(new URL('../public/labs/earth.example.json', import.meta.url), 'utf8');
served.trimEnd() === shipped
  ? ok('/labs/earth.example.json is the current fixture (the app serves what the bake wrote)')
  : fail('/labs/earth.example.json is STALE — "Load example" opens a different Earth to the one committed');

if (built === shipped) {
  ok('the shipped Earth rebuilds byte-identically — generation is reproducible');
} else {
  // Say WHERE, not just "differs". A 5 MB diff with no location is a wall.
  let at = -1;
  for (let i = 0; i < Math.min(built.length, shipped.length); i++) {
    if (built[i] !== shipped[i]) { at = i; break; }
  }
  if (at < 0) {
    fail(`same prefix, different length: rebuilt ${built.length} vs shipped ${shipped.length} bytes`);
  } else {
    fail('the shipped Earth does NOT match what the code builds');
    console.error(`      first difference at byte ${at}:`);
    console.error(`        shipped: …${shipped.slice(Math.max(0, at - 70), at + 70)}…`);
    console.error(`        rebuilt: …${built.slice(Math.max(0, at - 70), at + 70)}…`);
    console.error('      → if the change was intended, re-run the bake and commit the fixture with it:');
    console.error('        node docs/everdeep/scripts/bake-earth-2026.mjs');
  }
}

console.log(failures ? `\nReproducibility smoke FAILED: ${failures}` : 'Reproducibility smoke: all green.');
process.exit(failures ? 1 : 0);
