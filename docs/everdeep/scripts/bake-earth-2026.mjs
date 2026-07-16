#!/usr/bin/env node
// Snapshot Earth — 2026 to examples/world.example.json.
//   node docs/everdeep/scripts/bake-earth-2026.mjs
//
// This script used to BE Earth: 413 lines orchestrating every pass, which is
// exactly what the owner objected to — "the problem with bake is that the end
// user doesn't get to benefit from it when they create their worlds"; "why are
// we still using bake… point it at the workers, no more drift".
//
// The world is built by v2/src/everdeep/earth2026.ts now, which the browser's
// worker calls too. This file is a CACHE-FILLER: it supplies Node's way of
// reading bytes and loading composites, and writes the result down so "Load
// example" is instant instead of ~45s. It cannot drift from what a user gets,
// because it is not a second implementation of anything — delete it and the
// only thing lost is the head start.
//
// Everything that was ever bake-only was orchestration, and every divergence it
// caused shipped silently: China/India/USA had no roads for months, the browser
// read 1,500 cities as 3 towns, and the bake's own feeder villages were invisible
// to its own road pass.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const v2 = join(root, '../../v2');
const imp = (p) => import(pathToFileURL(join(v2, p)));

const { buildEarth2026 } = await imp('src/everdeep/earth2026.ts');

// Node's half of EarthIO: read from the repo, import composites off disk.
// The browser's half (fetch + import.meta.glob) lives in the worker. These two
// are the ONLY things that differ — some fifteen lines each, and neither of them
// decides anything about the world.
const bundles = new Map();
const io = {
  // the data's ONE home is v2/public/data — the same bytes the browser fetches.
  // A copy under docs/ would be a second source of truth, which is the whole
  // thing we are removing.
  read: async (name) => readFileSync(join(v2, 'public/data', name), 'utf8'),
  composite: async (tool) => {
    if (!bundles.has(tool)) {
      const mod = await imp(`src/composites/${tool}.ts`);
      const reg = JSON.parse(readFileSync(join(v2, `src/generators/registries/${tool}.json`), 'utf8'));
      bundles.set(tool, { meta: mod.meta, build: mod.build, tables: new Map(Object.entries(reg)) });
    }
    return bundles.get(tool);
  },
  progress: (stage, detail) => console.log(detail ? `${stage}: ${detail}` : stage),
};

const t0 = Date.now();
const { world, stats } = await buildEarth2026(io);
const surface = world.planes[0];

console.log(`  ${stats.powers} powers, ${stats.cities} cities`);
console.log(`  ${stats.features} named features, ${stats.greatRivers} great rivers on real courses`);
console.log(`  ${stats.realms} realms hold ${stats.claimedHexes.toLocaleString()} world hexes (${stats.landless} landless)`);
console.log(`  ${stats.placed} cities placed (${stats.snapped} snapped to shore), ${stats.rulers} rulers, ${stats.feeders} feeder villages`);
console.log(`  ${stats.roads} roads, ${stats.bridges} bridges (one pass, whole planet)`);
console.log(`  party at ${surface.party.x},${surface.party.y}`);
console.log(`built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

const outPath = join(root, 'examples/world.example.json');
const json = JSON.stringify(world);
writeFileSync(outPath, json);
console.log(`entities ${Object.keys(world.entities).length}, anchors ${surface.anchors.length}, routes ${surface.routes.length}`);
console.log('wrote', outPath, `(${(json.length / 1e6).toFixed(1)} MB)`);

// --- publish to the app: the served example (/labs/earth.example.json) and the
// embedded world-viewer are the SAME fixture, so "Load example" always opens
// this current Earth (not a stale copy). Auto-syncs so a rebake stays coherent.
const { execSync } = await import('node:child_process');
// quote it: the checkout path can contain a space (…/David Seis/…), which made
// this run `node C:\Users\David` and fail at the very end of every bake — so the
// "a rebake always keeps them in sync" promise never actually held
execSync(`node "${join(here, 'build-labs.mjs')}"`, { stdio: 'inherit' });
