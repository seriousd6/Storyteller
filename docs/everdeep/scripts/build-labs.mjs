#!/usr/bin/env node
// Rebuild v2/public/labs/world-viewer.html from the template + fixture data.
// Run after editing prototypes/world-viewer.template.html, the fixture world,
// or the kind registry:  node docs/everdeep/scripts/build-labs.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// minify the fixture (batch 75) so the embedded viewer + the served example are
// small and parse fast, regardless of how the source file is formatted.
const world = JSON.stringify(JSON.parse(readFileSync(join(root, 'examples/world.example.json'), 'utf8')));
const registry = readFileSync(join(root, '../../v2/src/everdeep/registry.json'), 'utf8').trim();
const tpl = readFileSync(join(root, 'prototypes/world-viewer.template.html'), 'utf8');
const worldName = JSON.parse(world).name ?? 'the example world';
const out = tpl
  .replace('/*__WORLD__*/null', world)
  .replace('/*__REGISTRY__*/null', registry)
  .replace(/Everdeep world editor — Vessia/g, `Everdeep world editor — ${worldName}`)
  .replace(/Vessia/g, worldName); // the fixture is now Earth — 2026, not Vessia
const dest = join(root, '../../v2/public/labs/world-viewer.html');
writeFileSync(dest, out);
console.log('built', dest, `(${out.length} bytes)`);
// also publish the fixture world so /world/ can offer "load the example"
const fx = join(root, '../../v2/public/labs/earth.example.json');
writeFileSync(fx, world + '\n');
console.log('copied fixture to', fx);
