#!/usr/bin/env node
// One-time bake: expand the Vessia fixture using the platform's OWN web
// machinery (PLAN.md §3.5 — the fixture is the layering acceptance test).
// Adds: a second generated settlement, a life web on Bram's Hollow (rival
// shops, keepers, a family, a feud), a side-quest chain on the Thornwald
// that REUSES a local as patron, and a kingdom claim on the map.
// Output is frozen into examples/world.example.json (validator must pass),
// then build-labs republishes the viewer + /labs/vessia.example.json.
//   node docs/everdeep/scripts/expand-vessia.mjs

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const v2 = join(root, '../../v2');

const fixturePath = join(root, 'examples/world.example.json');
const world = JSON.parse(readFileSync(fixturePath, 'utf8'));

const { blocksToEntity } = await import(pathToFileURL(join(v2, 'src/everdeep/adapters.ts')));
const { buildQuestChain, buildLifeWeb } = await import(pathToFileURL(join(v2, 'src/everdeep/webs.ts')));
const { newEntity } = await import(pathToFileURL(join(v2, 'src/everdeep/../engine/worldStore.ts')));

async function run(tool, seedPath) {
  const mod = await import(pathToFileURL(join(v2, `src/composites/${tool}.ts`)));
  const registry = JSON.parse(readFileSync(join(v2, `src/generators/registries/${tool}.json`), 'utf8'));
  const tables = new Map(Object.entries(registry));
  const opts = {};
  for (const o of mod.meta.options) opts[o.id] = o.default;
  return { metaId: mod.meta.id, blocks: mod.build(tables, seedPath, opts) };
}

const before = Object.keys(world.entities).length;

// 1. a second settlement in the Thornwald, from the settlement composite
const s2Seed = 'vessia-prime/p:p_surface/h:region:13,-5/f:settlement:0';
const s2Run = await run('settlement', s2Seed);
const s2 = blocksToEntity(s2Run.metaId, s2Seed, s2Run.blocks, 'Settlement', 'e_regionthornw01');
s2.kind = 'settlement';
s2.tags = ['river-town'];
world.entities[s2.id] = s2;

// 2. local life on Bram's Hollow: rival shops, keepers, a family, a feud
const life = await buildLifeWeb(world, run, world.entities.e_townbramhollow);
if (!life) throw new Error('life web failed');

// 3. a side-quest chain on the Thornwald — the patron pool now includes
// Maren and the life-web locals, so reuse should trigger
const chain = await buildQuestChain(world, run, world.entities.e_regionthornw01);
if (!chain) throw new Error('chain failed');
const chainRoot = world.entities[chain.rootId];
const patron = world.entities[chainRoot.fields.patron.ref];
console.log('chain patron:', patron.name, '| reused local:', chain.reusedPatron);

// 4. the kingdom over the vale, claiming hexes on the surface map
const kingdom = newEntity('faction', 'The Reevehold Compact');
kingdom.fields = {
  goal: 'Keep the vale\'s roads open and its barrows shut.',
  leader: { ref: 'e_1xwb45d0l9i7re' },
};
kingdom.tags = ['kingdom'];
kingdom.body = [{
  type: 'paragraph', id: 'b_reeve01',
  text: 'The loose compact of reeves that passes for a crown in these parts. {@e e_townbramhollow|Bram\'s Hollow} hosts its moot; {@e e_1xwb45d0l9i7re|Maren Vosk} holds its gavel, reluctantly.',
}];
world.entities[kingdom.id] = kingdom;
const surface = world.planes.find((p) => p.id === 'p_surface');
surface.claims[kingdom.id] = ['region:11,-4', 'region:12,-4', 'region:12,-5', 'region:13,-4', 'region:13,-5'];
// anchor the new settlement on the map (center of region:13,-5)
surface.anchors.push({ entityId: s2.id, x: 332640.0, y: -137178.0, tier: 'region', icon: 'town' });

world.rev += 1;
world.updated = new Date().toISOString();
writeFileSync(fixturePath, JSON.stringify(world, null, 2) + '\n');
console.log(`Vessia expanded: ${before} -> ${Object.keys(world.entities).length} entities (+${Object.keys(world.entities).length - before})`);
console.log('second settlement:', s2.name, '| chain quests:', chain.created, '| life pages:', life.created);
