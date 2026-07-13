#!/usr/bin/env node
// Continental bake (owner directive, 2026-07-13): regenerate Vessia so a
// whole continent is filled — five kingdoms tiling the largest landmass
// (Voronoi over world hexes), each with a capital city, towns, villages,
// landmarks, a ruler, local life webs, and side-quest chains — all built
// with the platform's OWN composites/webs against the pinned G1 terrain,
// so every pin sits on real land of the actual rendered map.
// The existing hand-crafted Thornwald cluster (sites, routes, dungeon,
// Reevehold Compact) is RELOCATED intact onto the same continent.
//   node docs/everdeep/scripts/continent-vessia.mjs
//
// One-time bake: output frozen into examples/world.example.json.

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
const { newEntity } = await import(pathToFileURL(join(v2, 'src/engine/worldStore.ts')));
const { biomeAt, detailAt, octFor, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } =
  await import(pathToFileURL(join(v2, 'src/everdeep/terrain.ts')));
const { h32 } = await import(pathToFileURL(join(v2, 'src/everdeep/seeds.ts')));

async function run(tool, seedPath) {
  const mod = await import(pathToFileURL(join(v2, `src/composites/${tool}.ts`)));
  const registry = JSON.parse(readFileSync(join(v2, `src/generators/registries/${tool}.json`), 'utf8'));
  const tables = new Map(Object.entries(registry));
  const opts = {};
  for (const o of mod.meta.options) opts[o.id] = o.default;
  return { metaId: mod.meta.id, blocks: mod.build(tables, seedPath, opts) };
}

// ---------- terrain, matching the map renderer exactly ----------
const surface = world.planes.find((p) => p.id === 'p_surface');
surface.terrain = {
  landform: 'continents', continents: 3,
  circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT,
  waterPct: 55, climate: 'temperate',
};
const cfg = { seed: world.seed, ...surface.terrain };

const SQ3 = Math.sqrt(3);
// mapView TIERS: macro2, macro, world(2), region(3), mile, locale — the
// detail-bias salt is the tier INDEX, so world=2, region=3, locale=5.
const TIER = {
  world: { hexFt: 316800, idx: 2 },
  region: { hexFt: 31680, idx: 3 },
  locale: { hexFt: 500, idx: 5 },
};
const hexC = (t, q, r) => {
  const R = TIER[t].hexFt / SQ3;
  return [SQ3 * R * (q + r / 2), 1.5 * R * r];
};
function hexBiome(t, q, r) {
  const [cx, cy] = hexC(t, q, r);
  const d = detailAt(cfg, cx, cy, TIER[t].hexFt, TIER[t].idx);
  return biomeAt(cfg, cx, cy, octFor(TIER[t].hexFt), (d - 0.5) * 0.055);
}
const WATER = new Set(['deep', 'water']);
const GOOD = new Set(['grass', 'forest', 'savanna', 'hills', 'beach', 'taiga', 'jungle']);
const rnd = (s) => h32(s, 0) / 4294967295;

// ---------- 1. map the continents (world-hex grid) ----------
console.log('scanning the world grid…');
const Rw = TIER.world.hexFt / SQ3;
const rMax = Math.floor((cfg.heightFt / 2) / (1.5 * Rw)) - 1;
const qPeriod = Math.round(cfg.circumFt / (SQ3 * Rw)); // hexes around the cylinder
const land = new Map(); // 'q,r' -> biome
for (let r = -rMax; r <= rMax; r++) {
  const qBase = -Math.round(r / 2);
  for (let i = 0; i < qPeriod; i++) {
    const q = qBase + i;
    const b = hexBiome('world', q, r);
    if (!WATER.has(b)) land.set(q + ',' + r, b);
  }
}
console.log(`  ${land.size} land hexes of ${qPeriod * (2 * rMax + 1)}`);

// connected components — axial neighbors, WRAP-AWARE: q is periodic with
// period qPeriod, and each row stores its canonical copy, so normalize the
// neighbor key back into that row's window before lookup
const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const qBaseOf = (r) => -Math.round(r / 2);
const canon = (q, r) => {
  const base = qBaseOf(r);
  const i = ((q - base) % qPeriod + qPeriod) % qPeriod;
  return (base + i) + ',' + r;
};
const comp = new Map();
let nComp = 0;
for (const key of land.keys()) {
  if (comp.has(key)) continue;
  const id = nComp++;
  const stack = [key];
  comp.set(key, id);
  while (stack.length) {
    const [q, r] = stack.pop().split(',').map(Number);
    for (const [dq, dr] of DIRS) {
      const nk = canon(q + dq, r + dr);
      if (land.has(nk) && !comp.has(nk)) { comp.set(nk, id); stack.push(nk); }
    }
  }
}
const sizes = new Map();
for (const id of comp.values()) sizes.set(id, (sizes.get(id) ?? 0) + 1);
const bigId = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0][0];
const continent = [...comp.entries()].filter(([, id]) => id === bigId).map(([k]) => k);
console.log(`  largest continent: ${continent.length} world hexes (${Math.round(continent.length * 60 * 52)} sq-mi-ish)`);

// ---------- 2. five kingdom seats, spread far apart ----------
const goodCells = continent.filter((k) => GOOD.has(land.get(k)));
const cxy = (k) => { const [q, r] = k.split(',').map(Number); return hexC('world', q, r); };
const dist = (a, b) => {
  const [ax, ay] = cxy(a), [bx, by] = cxy(b);
  let dx = Math.abs(ax - bx) % cfg.circumFt;
  if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx;
  return Math.hypot(dx, ay - by);
};
const seats = [goodCells[Math.floor(rnd(world.seed + '/seat0') * goodCells.length)]];
while (seats.length < 5) {
  let best = null, bestD = -1;
  for (const k of goodCells) {
    const d = Math.min(...seats.map((s) => dist(k, s)));
    if (d > bestD) { bestD = d; best = k; }
  }
  seats.push(best);
}

// Voronoi: every continent hex joins its nearest seat → kingdoms tile it all
const territory = new Map(seats.map((s) => [s, []]));
for (const k of continent) {
  let best = seats[0], bestD = Infinity;
  for (const s of seats) { const d = dist(k, s); if (d < bestD) { bestD = d; best = s; } }
  territory.get(best).push(k);
}

// ---------- 3. build each kingdom ----------
const FLAVOR = {
  desert: (n) => [`The ${n} Emirates`, `the sand-road courts of`],
  savanna: (n) => [`The ${n} Emirates`, `the sand-road courts of`],
  snow: (n) => [`Jarldom of ${n}`, `the longhouse thrones of`],
  tundra: (n) => [`Jarldom of ${n}`, `the longhouse thrones of`],
  taiga: (n) => [`Jarldom of ${n}`, `the longhouse thrones of`],
  hills: (n) => [`The ${n} Marches`, `the watchtower lines of`],
  mountain: (n) => [`The ${n} Marches`, `the watchtower lines of`],
  jungle: (n) => [`The Verdant Throne of ${n}`, `the canopy courts of`],
};
const kindomFlavor = (biome, n) => (FLAVOR[biome] ?? ((x) => [`Kingdom of ${x}`, `the crownlands of`]))(n);

// pick GOOD sub-hexes for towns/villages inside a kingdom's world hexes;
// each world hex offers several candidate region hexes, and if a strict
// pass finds nothing we settle for any land (a hard kingdom, but a home)
function siteSpots(cells, want, salt, minMi) {
  const Rr = TIER.region.hexFt / SQ3;
  const pick = (allowAnyLand) => {
    const spots = [];
    const shuffled = [...cells].sort((a, b) => h32(a + salt, 7) - h32(b + salt, 7));
    for (const cell of shuffled) {
      if (spots.length >= want) break;
      const [wq, wr] = cell.split(',').map(Number);
      const [wx, wy] = hexC('world', wq, wr);
      const baseQ = Math.round((SQ3 / 3 * wx - wy / 3) / Rr);
      const baseR = Math.round((2 / 3 * wy) / Rr);
      for (let t = 0; t < 9; t++) {
        const rq = baseQ + Math.floor((h32(cell + salt, 11 + t) / 4294967295 - 0.5) * 7);
        const rr = baseR + Math.floor((h32(cell + salt, 51 + t) / 4294967295 - 0.5) * 7);
        const b = hexBiome('region', rq, rr);
        if (!(GOOD.has(b) || (allowAnyLand && !WATER.has(b)))) continue;
        const [x, y] = hexC('region', rq, rr);
        if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < minMi * 5280)) continue;
        spots.push({ x, y, rq, rr, biome: b });
        break;
      }
    }
    return spots;
  };
  const strict = pick(false);
  return strict.length >= Math.min(want, 1) ? strict : pick(true);
}

const pop = (s, lo, hi) => lo + Math.floor(rnd(s) * (hi - lo));
let kingdomIdx = 0;
const kingdomLog = [];
for (const seat of seats) {
  const cells = territory.get(seat);
  const ki = kingdomIdx++;
  const seatBiome = land.get(seat);

  // the capital names the kingdom
  const capSpot = siteSpots([seat, ...cells.slice(0, 20)], 1, `/cap${ki}`, 0)[0];
  const capSeed = `${world.seed}/p:p_surface/h:region:${capSpot.rq},${capSpot.rr}/f:settlement:0`;
  const capRun = await run('settlement', capSeed);
  const capital = blocksToEntity(capRun.metaId, capSeed, capRun.blocks, 'Capital');
  capital.kind = 'settlement';
  const capName = capital.name.split(/[,—]/)[0].trim();
  const [kingdomName, flavorPhrase] = kindomFlavor(seatBiome, capName);

  // region page = the kingdom's land
  const region = newEntity('region', kingdomName);
  region.tags = ['kingdom-lands'];
  world.entities[region.id] = region;
  capital.parentId = region.id;
  capital.tags = ['city', 'capital'];
  capital.fields = { ...(capital.fields ?? {}), population: pop(capSeed + '/pop', 8000, 24000) };
  world.entities[capital.id] = capital;

  // the crown
  const faction = newEntity('faction', kingdomName);
  faction.tags = ['kingdom'];
  world.entities[faction.id] = faction;

  // ruler
  const rSeed = `${world.seed}/${faction.id}/role:Ruler`;
  const rRun = await run('npc-block', rSeed);
  const ruler = blocksToEntity(rRun.metaId, rSeed, rRun.blocks, 'Ruler', capital.id);
  ruler.kind = 'person';
  ruler.tags = ['ruler'];
  world.entities[ruler.id] = ruler;
  faction.fields = { leader: { ref: ruler.id }, goal: `Hold ${flavorPhrase} ${capName} together.` };
  faction.body = [{
    type: 'paragraph', id: 'b_kingdom' + ki,
    text: `${kingdomName} — ${flavorPhrase} {@e ${capital.id}|${capName}}, under {@e ${ruler.id}|${ruler.name}}.`,
  }];
  region.body = [{
    type: 'paragraph', id: 'b_reachpg' + ki,
    text: `The lands of {@e ${faction.id}|${kingdomName}}. Its roads bend toward {@e ${capital.id}|${capital.name}}.`,
  }];

  // claims: the whole territory, as world hexes
  surface.claims[faction.id] = cells.map((k) => 'world:' + k);

  // anchors: capital promoted at world tier
  surface.anchors.push({ entityId: capital.id, x: capSpot.x, y: capSpot.y, tier: 'world', promoted: true, icon: 'city' });

  // towns + villages + landmarks
  const townSpots = siteSpots(cells, 3, `/twn${ki}`, 30);
  const villSpots = siteSpots(cells, 3, `/vil${ki}`, 18).filter(
    (v) => !townSpots.some((t) => t.rq === v.rq && t.rr === v.rr) && !(v.rq === capSpot.rq && v.rr === capSpot.rr));
  const lmSpots = siteSpots(cells, 2, `/lmk${ki}`, 45);
  for (const [i, s] of townSpots.entries()) {
    const seed = `${world.seed}/p:p_surface/h:region:${s.rq},${s.rr}/f:settlement:0`;
    const tr = await run('settlement', seed);
    const t = blocksToEntity(tr.metaId, seed, tr.blocks, 'Town', region.id);
    t.kind = 'settlement';
    t.tags = ['town'];
    t.fields = { ...(t.fields ?? {}), population: pop(seed + '/pop', 900, 2600) };
    world.entities[t.id] = t;
    surface.anchors.push({ entityId: t.id, x: s.x, y: s.y, tier: 'region', icon: 'town' });
  }
  for (const s of villSpots) {
    const seed = `${world.seed}/p:p_surface/h:region:${s.rq},${s.rr}/f:settlement:1`;
    const vr = await run('settlement', seed);
    const v = blocksToEntity(vr.metaId, seed, vr.blocks, 'Village', region.id);
    v.kind = 'settlement';
    v.tags = ['village'];
    v.fields = { ...(v.fields ?? {}), population: pop(seed + '/pop', 80, 340) };
    world.entities[v.id] = v;
    surface.anchors.push({ entityId: v.id, x: s.x, y: s.y, tier: 'locale', icon: 'village' });
  }
  for (const s of lmSpots) {
    const seed = `${world.seed}/p:p_surface/h:region:${s.rq},${s.rr}/f:landmark:0`;
    const lr = await run('landmark', seed);
    const lm = blocksToEntity(lr.metaId, seed, lr.blocks, 'Landmark', region.id);
    lm.kind = 'landmark';
    world.entities[lm.id] = lm;
    surface.anchors.push({ entityId: lm.id, x: s.x, y: s.y, tier: 'region', icon: 'landmark' });
  }

  // life web on the capital; two side-quest chains on the kingdom lands
  const life = await buildLifeWeb(world, run, capital);
  const c1 = await buildQuestChain(world, run, region);
  const c2 = await buildQuestChain(world, run, region);
  kingdomLog.push({
    kingdom: kingdomName, capital: capital.name, ruler: ruler.name,
    hexes: cells.length, towns: townSpots.length, villages: villSpots.length,
    landmarks: lmSpots.length, life: life?.created ?? 0,
    chains: (c1?.created ?? 0) + (c2?.created ?? 0),
    reuse: [c1?.reusedPatron, c2?.reusedPatron].filter(Boolean).length,
  });
}

// ---------- 4. relocate the hand-crafted Thornwald cluster ----------
// Old base: claims around region:11..13,-4..-5. Find a coastal GOOD patch on
// this continent, shift EVERYTHING (anchors, sites, routes, links, hexes,
// claims) by an integer region-hex delta so internal geometry is untouched.
const OLD_KEYS = [[11, -4], [12, -4], [12, -5], [13, -4], [13, -5]];
function thornwaldFits(dq, dr) {
  return OLD_KEYS.every(([q, r]) => GOOD.has(hexBiome('region', q + dq, r + dr)));
}
let delta = null;
outer:
for (const cell of territory.get(seats[0])) {
  const [wq, wr] = cell.split(',').map(Number);
  const [wx, wy] = hexC('world', wq, wr);
  const Rr = TIER.region.hexFt / SQ3;
  const baseQ = Math.round((SQ3 / 3 * wx - wy / 3) / Rr);
  const baseR = Math.round((2 / 3 * wy) / Rr);
  for (let jr = -3; jr <= 3; jr += 3) {
    for (let jq = -3; jq <= 3; jq += 3) {
      const dq = baseQ + jq - 12, dr = baseR + jr + 4;
      if (thornwaldFits(dq, dr)) { delta = [dq, dr]; break outer; }
    }
  }
}
if (!delta) throw new Error('no landing site for the Thornwald');
const [dq, dr] = delta;
const Rr = TIER.region.hexFt / SQ3;
const dx = SQ3 * Rr * (dq + dr / 2), dy = 1.5 * Rr * dr;
console.log(`Thornwald relocates by region-hex delta (${dq},${dr})`);

const shiftPt = (o) => { o.x += dx; o.y += dy; };
const OLD_ANCHOR_IDS = new Set(['e_townbramhollow', 'e_tavgildedtank1', 'e_dungeonbarrow1', 'e_p0pcesdw2fwmza']);
for (const a of surface.anchors) if (OLD_ANCHOR_IDS.has(a.entityId)) shiftPt(a);
for (const s of surface.sites ?? []) shiftPt(s);
for (const rt of surface.routes ?? []) rt.pts = rt.pts.map(([x, y]) => [x + dx, y + dy]);
for (const l of surface.links ?? []) { l.x += dx; l.y += dy; l.toX += dx; l.toY += dy; }
for (const p2 of world.planes) {
  if (p2.id === 'p_surface') continue;
  for (const l of p2.links ?? []) { l.x += dx; l.y += dy; l.toX += dx; l.toY += dy; }
}
const shiftAddr = (addr) => {
  const m = /^region:(-?\d+),(-?\d+)$/.exec(addr);
  return m ? `region:${Number(m[1]) + dq},${Number(m[2]) + dr}` : addr;
};
surface.hexes = Object.fromEntries(Object.entries(surface.hexes ?? {}).map(([k, v]) => [shiftAddr(k), v]));
for (const [owner, addrs] of Object.entries(surface.claims)) {
  if (addrs.every((a) => a.startsWith('region:'))) surface.claims[owner] = addrs.map(shiftAddr);
}

// ---------- 5. seal & report ----------
world.rev += 1;
world.updated = new Date().toISOString();
writeFileSync(fixturePath, JSON.stringify(world, null, 2) + '\n');
console.table(kingdomLog);
console.log(`entities: ${Object.keys(world.entities).length}, anchors: ${surface.anchors.length}, claim owners: ${Object.keys(surface.claims).length}`);
