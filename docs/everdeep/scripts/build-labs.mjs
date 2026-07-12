#!/usr/bin/env node
// Rebuild v2/public/labs/world-viewer.html from the template + fixture data.
// Run after editing prototypes/world-viewer.template.html, the fixture world,
// or the kind registry:  node docs/everdeep/scripts/build-labs.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const world = readFileSync(join(root, 'examples/world.example.json'), 'utf8').trim();
const registry = readFileSync(join(root, 'kinds/registry.json'), 'utf8').trim();
const tpl = readFileSync(join(root, 'prototypes/world-viewer.template.html'), 'utf8');
const out = tpl.replace('/*__WORLD__*/null', world).replace('/*__REGISTRY__*/null', registry);
const dest = join(root, '../../v2/public/labs/world-viewer.html');
writeFileSync(dest, out);
console.log('built', dest, `(${out.length} bytes)`);
