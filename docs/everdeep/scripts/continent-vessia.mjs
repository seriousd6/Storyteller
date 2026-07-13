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
const { buildQuestChain, buildLifeWeb, buildKinWeb } = await import(pathToFileURL(join(v2, 'src/everdeep/webs.ts')));
const { newEntity } = await import(pathToFileURL(join(v2, 'src/engine/worldStore.ts')));
const { biomeAt, detailAt, elevationAt, octFor, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } =
  await import(pathToFileURL(join(v2, 'src/everdeep/terrain.ts')));
const { h32 } = await import(pathToFileURL(join(v2, 'src/everdeep/seeds.ts')));
const { geoName } = await import(pathToFileURL(join(v2, 'src/everdeep/geoNames.ts')));

async function run(tool, seedPath, extra) {
  const mod = await import(pathToFileURL(join(v2, `src/composites/${tool}.ts`)));
  const registry = JSON.parse(readFileSync(join(v2, `src/generators/registries/${tool}.json`), 'utf8'));
  const tables = new Map(Object.entries(registry));
  const opts = {};
  for (const o of mod.meta.options) opts[o.id] = o.default;
  if (extra) for (const [k, v] of Object.entries(extra)) if (v) opts[k] = v;
  return { metaId: mod.meta.id, blocks: mod.build(tables, seedPath, opts) };
}

// the law of each land: rolled once per crown, inherited by every settlement
// inside it (ancestor context, batch 20). Short style name in the field;
// the full writeup lives on the crown's page.
const { makeComposer } = await import(pathToFileURL(join(v2, 'src/engine/composite.ts')));
const GOV_TABLES = new Map(Object.entries(JSON.parse(readFileSync(join(v2, 'src/generators/registries/settlement.json'), 'utf8'))));
function rollGovernment(seed) {
  const c = makeComposer(GOV_TABLES, seed);
  const full = c.text('{table:gm/government/government}');
  const name = full.split(/[—–-]/)[0].trim();
  // keep the writeup readable on a page: description sentence + the rolled specifics
  const brief = full.length > 700 ? full.slice(0, full.indexOf('Leadership:') > 0 ? full.indexOf('Leadership:') : 700).trim() : full;
  const detail = full.includes('Leadership:') ? full.slice(full.indexOf('Leadership:')).trim() : '';
  return { name, brief, detail };
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
const contSet = new Set(continent);
const goodCells = continent.filter((k) => GOOD.has(land.get(k)));
const cxy = (k) => { const [q, r] = k.split(',').map(Number); return hexC('world', q, r); };
const dist = (a, b) => {
  const [ax, ay] = cxy(a), [bx, by] = cxy(b);
  let dx = Math.abs(ax - bx) % cfg.circumFt;
  if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx;
  return Math.hypot(dx, ay - by);
};
// ---------- 1c. RIVERS (G3, batch 21): downhill flow tracing ----------
// Every land hex drains toward its lowest neighbor; rain accumulates down
// the flow tree; where enough water gathers, a river runs. Rivers meander
// between hex centers, widen downstream, and reach the sea.
console.log('tracing rivers…');
const octW = octFor(TIER.world.hexFt);
const elevOf = new Map();
const elevAt = (k) => {
  let e = elevOf.get(k);
  if (e === undefined) { const [x, y] = cxy(k); e = elevationAt(cfg, x, y, octW); elevOf.set(k, e); }
  return e;
};
const RAIN = { jungle: 1.6, swamp: 1.5, forest: 1.3, mountain: 1.4, taiga: 1.1, hills: 1.1,
  grass: 1, beach: 0.8, snow: 0.7, tundra: 0.7, savanna: 0.5, desert: 0.15 };
const flowTo = new Map(); // land key -> downstream key ('' = pit/endorheic)
for (const k of land.keys()) {
  const [q, r] = k.split(',').map(Number);
  let best = null, bestE = elevAt(k);
  for (const [dq2, dr2] of DIRS) {
    const nk = canon(q + dq2, r + dr2);
    const ne = land.has(nk) ? elevAt(nk) : 0.44; // the sea is always downhill
    if (ne < bestE) { bestE = ne; best = nk; }
  }
  flowTo.set(k, best ?? '');
}
const acc = new Map();
for (const k of [...land.keys()].sort((a, b) => elevAt(b) - elevAt(a))) {
  const a = (acc.get(k) ?? 0) + (RAIN[land.get(k)] ?? 1);
  acc.set(k, a);
  const d = flowTo.get(k);
  if (d && land.has(d)) acc.set(d, (acc.get(d) ?? 0) + a);
}
const RIVER_MIN = 30;
const riverOn = new Set([...acc.entries()].filter(([k, a]) => a >= RIVER_MIN && contSet.has(k)).map(([k]) => k));
// stems: from each mouth walk upstream along the biggest inflow, then
// tributaries from their highest sources down to the junction
const inflows = new Map();
for (const k of riverOn) {
  const d = flowTo.get(k);
  if (d && riverOn.has(d)) inflows.set(d, [...(inflows.get(d) ?? []), k]);
}
const riverStems = []; // arrays of land keys, source → mouth (+sea key last)
{
  const visited = new Set();
  const mouths = [...riverOn].filter((k) => { const d = flowTo.get(k); return !d || !riverOn.has(d); });
  for (const mouth of mouths.sort((a, b) => (acc.get(b) ?? 0) - (acc.get(a) ?? 0))) {
    const path = [];
    let cur = mouth;
    while (cur && riverOn.has(cur) && !visited.has(cur)) {
      path.push(cur); visited.add(cur);
      const ups = (inflows.get(cur) ?? []).filter((u) => !visited.has(u));
      cur = ups.sort((a, b) => (acc.get(b) ?? 0) - (acc.get(a) ?? 0))[0];
    }
    if (path.length >= 3) {
      path.reverse(); // source → mouth
      const sea = flowTo.get(mouth);
      if (sea && !land.has(sea)) path.push(sea); // reach the water line
      riverStems.push(path);
    }
  }
  for (const k of [...riverOn].sort((a, b) => elevAt(b) - elevAt(a))) {
    if (visited.has(k)) continue;
    const path = [k]; visited.add(k);
    let cur = flowTo.get(k);
    while (cur && riverOn.has(cur)) {
      path.push(cur);
      if (visited.has(cur)) break; // joined an existing stem
      visited.add(cur);
      cur = flowTo.get(cur);
    }
    if (path.length >= 3) riverStems.push(path);
  }
}
console.log(`  ${riverOn.size} river hexes → ${riverStems.length} watercourses`);

const seats = [goodCells[Math.floor(rnd(world.seed + '/seat0') * goodCells.length)]];
while (seats.length < 5) {
  let best = null, bestD = -1;
  for (const k of goodCells) {
    const d = Math.min(...seats.map((s) => dist(k, s)));
    if (d > bestD) { bestD = d; best = k; }
  }
  seats.push(best);
}

// Territories grow outward from their seats across a TERRAIN COST surface
// (batch 11): plains are cheap, mountains/deserts/swamps dear — expansion
// stalls at ranges, so borders settle ALONG natural features instead of
// cutting straight Voronoi lines.
const TERRAIN_COST = {
  mountain: 6, hills: 2.6, snow: 3, tundra: 2, taiga: 1.6, desert: 2.2,
  jungle: 1.8, forest: 1.3, savanna: 1.1, grass: 1, beach: 1.3,
};
const cellCost = (k) => TERRAIN_COST[land.get(k)] ?? 1.5;

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      for (let i = 0;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

const territory = new Map(seats.map((s) => [s, []]));
const regionByKi = new Map();
{
  const ownerOf = new Map();
  const heap = new Heap();
  for (const s of seats) heap.push([0, s, s]);
  while (heap.size) {
    const [c, k, seat] = heap.pop();
    if (ownerOf.has(k)) continue;
    ownerOf.set(k, seat);
    territory.get(seat).push(k);
    const [q, r] = k.split(',').map(Number);
    for (const [dq, dr] of DIRS) {
      const nk = canon(q + dq, r + dr);
      if (!contSet.has(nk) || ownerOf.has(nk)) continue;
      const ford = riverOn.has(nk) !== riverOn.has(k) ? 2.2 : 0; // rivers make borders
      heap.push([c + (cellCost(k) + cellCost(nk)) / 2 + ford, nk, seat]);
    }
  }
}

// ---------- 2b. geography gets NAMES (batch 10) ----------
// The continent, the ocean, the mountain ranges, the great forests, lakes
// and deserts — all named by the geoNames generators and written onto the
// map as label anchors (icon 'label': cartographic text, no pin).
function centroidOf(cells) {
  let cs = 0, sn = 0, ys = 0;
  for (const k of cells) {
    const [x, y] = cxy(k);
    const th = (x / cfg.circumFt) * 2 * Math.PI;
    cs += Math.cos(th); sn += Math.sin(th); ys += y;
  }
  let th = Math.atan2(sn, cs);
  if (th < 0) th += 2 * Math.PI;
  return [(th / (2 * Math.PI)) * cfg.circumFt, ys / cells.length];
}
const contName = geoName('continent', world.seed + '/geo:continent:0');
const contEnt = newEntity('region', contName);
contEnt.tags = ['continent'];
contEnt.body = [{ type: 'paragraph', id: 'b_continent0', text: `The continent of ${contName}: five crowns, one coastline, and more unwritten places than written ones.` }];
world.entities[contEnt.id] = contEnt;
{
  const [x, y] = centroidOf(continent);
  surface.anchors.push({ entityId: contEnt.id, x, y, tier: 'world', promoted: true, icon: 'label' });
}

// water components → the ocean (largest) and lakes (small enclosed ones)
const waterKeys = new Set();
for (let r = -rMax; r <= rMax; r++) {
  const qb = qBaseOf(r);
  for (let i = 0; i < qPeriod; i++) {
    const k = (qb + i) + ',' + r;
    if (!land.has(k)) waterKeys.add(k);
  }
}
function components(keys, has) {
  const seen = new Set(), out = [];
  for (const k of keys) {
    if (seen.has(k)) continue;
    const cells = [], stack = [k];
    seen.add(k);
    while (stack.length) {
      const cur = stack.pop();
      cells.push(cur);
      const [q, r] = cur.split(',').map(Number);
      for (const [dq, dr] of DIRS) {
        if (Math.abs(r + dr) > rMax) continue;
        const nk = canon(q + dq, r + dr);
        if (has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    out.push(cells);
  }
  return out.sort((a, b) => b.length - a.length);
}
const waterComps = components(waterKeys, (k) => waterKeys.has(k));
const geoLabels = [];
function nameFeature(kind, cells, i, opts = {}) {
  const name = geoName(kind, `${world.seed}/geo:${kind}:${i}`);
  const e = newEntity(opts.kind ?? 'biome', name);
  e.tags = [kind];
  if (opts.parent) e.parentId = opts.parent;
  world.entities[e.id] = e;
  const [x, y] = centroidOf(cells);
  surface.anchors.push({ entityId: e.id, x, y, tier: 'world', promoted: !!opts.promoted, icon: 'label' });
  geoLabels.push(`${name} (${kind}, ${cells.length} hexes)`);
  return e;
}
if (waterComps[0]) nameFeature('ocean', waterComps[0], 0, { promoted: true });
waterComps.slice(1).filter((c) => c.length >= 2 && c.length <= 300).slice(0, 3)
  .forEach((c, i) => nameFeature('lake', c, i, { parent: contEnt.id }));

// land features: ranges, forests, deserts (majority on this continent)
const onCont = (cells) => cells.filter((k) => contSet.has(k)).length >= cells.length / 2;
const landComps = (pred) => components([...land.keys()].filter((k) => pred(land.get(k))), (k) => land.has(k) && pred(land.get(k)));
landComps((b) => b === 'mountain' || b === 'hills')
  .filter((c) => c.filter((k) => land.get(k) === 'mountain').length >= 2 && c.length >= 6 && onCont(c))
  .slice(0, 3)
  .forEach((c, i) => nameFeature('range', c, i, { parent: contEnt.id }));
landComps((b) => b === 'forest' || b === 'jungle')
  .filter((c) => c.length >= 40 && onCont(c))
  .slice(0, 2)
  .forEach((c, i) => nameFeature('forest', c, i, { parent: contEnt.id }));
landComps((b) => b === 'desert' || b === 'savanna')
  .filter((c) => c.length >= 25 && onCont(c))
  .slice(0, 1)
  .forEach((c, i) => nameFeature('desert', c, i, { parent: contEnt.id }));

// the great rivers get names, labeled mid-course (batch 21)
riverStems
  .map((stem) => { const last = [...stem].reverse().find((k) => land.has(k)) ?? stem[stem.length - 1]; return { stem, mouthAcc: acc.get(last) ?? 0 }; })
  .filter((x) => x.stem.length >= 6 && x.mouthAcc >= RIVER_MIN * 3)
  .sort((a, b) => b.mouthAcc - a.mouthAcc)
  .slice(0, 3)
  .forEach(({ stem }, i) => {
    const name = geoName('river', `${world.seed}/geo:river:${i}`);
    const e = newEntity('biome', name);
    e.tags = ['river'];
    e.parentId = contEnt.id;
    world.entities[e.id] = e;
    const [x, y] = cxy(stem[Math.floor(stem.length / 2)]);
    surface.anchors.push({ entityId: e.id, x: Math.round(x), y: Math.round(y), tier: 'world', icon: 'label' });
    geoLabels.push(`${name} (river, ${stem.length} hexes)`);
  });

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
const nearRiver = (k) => {
  if (riverOn.has(k)) return true;
  const [q, r] = k.split(',').map(Number);
  return DIRS.some(([dq2, dr2]) => riverOn.has(canon(q + dq2, r + dr2)));
};
function siteSpots(cells, want, salt, minMi, prefer) {
  const Rr = TIER.region.hexFt / SQ3;
  const pick = (allowAnyLand) => {
    const spots = [];
    let shuffled = [...cells].sort((a, b) => h32(a + salt, 7) - h32(b + salt, 7));
    if (prefer) shuffled = [...shuffled.filter(prefer), ...shuffled.filter((c) => !prefer(c))];
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
const nodes = []; // settlements for the road network (batch 11)
for (const seat of seats) {
  const cells = territory.get(seat);
  const ki = kingdomIdx++;
  const seatBiome = land.get(seat);

  // the crown's law, rolled once — every settlement inside inherits it
  const gov = rollGovernment(`${world.seed}/gov:${ki}`);

  // the capital names the kingdom
  const capSpot = siteSpots([seat, ...cells.slice(0, 20)], 1, `/cap${ki}`, 0, nearRiver)[0];
  const capSeed = `${world.seed}/p:p_surface/h:region:${capSpot.rq},${capSpot.rr}/f:settlement:0`;
  const capRun = await run('settlement', capSeed, { government: gov.name });
  const capital = blocksToEntity(capRun.metaId, capSeed, capRun.blocks, 'Capital');
  capital.kind = 'settlement';
  const capName = capital.name.split(/[,—]/)[0].trim();
  const [kingdomName, flavorPhrase] = kindomFlavor(seatBiome, capName);

  // region page = the kingdom's land, filed under the continent
  const region = newEntity('region', kingdomName);
  region.tags = ['kingdom-lands'];
  region.fields = { government: gov.name };
  regionByKi.set(ki, region.id);
  region.parentId = contEnt.id;
  world.entities[region.id] = region;
  capital.parentId = region.id;
  capital.tags = ['city', 'capital'];
  // populations follow the batch-11 visibility ladder — one metropolis
  // breaks a million souls; other capitals are large cities
  capital.fields = { ...(capital.fields ?? {}), population: ki === 0
    ? pop(capSeed + '/pop', 1_050_000, 1_600_000)
    : pop(capSeed + '/pop', 140_000, 900_000) };
  world.entities[capital.id] = capital;
  nodes.push({ type: 'capital', ki, x: capSpot.x, y: capSpot.y, pop: capital.fields.population, name: capName });

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
  faction.fields = { government: gov.name, leader: { ref: ruler.id }, goal: `Hold ${flavorPhrase} ${capName} together.` };
  faction.body = [{
    type: 'paragraph', id: 'b_kingdom' + ki,
    text: `${kingdomName} — ${flavorPhrase} {@e ${capital.id}|${capName}}, under {@e ${ruler.id}|${ruler.name}}.`,
  }, {
    type: 'paragraph', id: 'b_crownlaw' + ki,
    label: 'The Law',
    text: gov.brief + (gov.detail ? ' ' + gov.detail : ''),
  }];
  region.body = [{
    type: 'paragraph', id: 'b_reachpg' + ki,
    text: `The lands of {@e ${faction.id}|${kingdomName}}. Its roads bend toward {@e ${capital.id}|${capital.name}}.`,
  }];

  // claims: the whole territory, as world hexes — and the owner's name
  // written across it like the landform labels (batch 13)
  surface.claims[faction.id] = cells.map((k) => 'world:' + k);
  {
    const [lx, ly] = centroidOf(cells);
    surface.anchors.push({ entityId: faction.id, x: lx, y: ly, tier: 'world', promoted: true, icon: 'label' });
  }

  // anchors: capital promoted at world tier
  surface.anchors.push({ entityId: capital.id, x: capSpot.x, y: capSpot.y, tier: 'world', promoted: true, icon: 'city' });

  // towns + villages + landmarks — Victorian spread (MAPS §9b): a heartland
  // clustered around the capital, thinning toward the frontier
  const byDistToSeat = [...cells].sort((a, b) => dist(a, seat) - dist(b, seat));
  const heart = byDistToSeat.slice(0, Math.max(8, Math.floor(cells.length * 0.25)));
  const frontier = byDistToSeat.slice(Math.floor(cells.length * 0.5));
  const townSpots = [
    ...siteSpots(heart, 4, `/twnh${ki}`, 12, nearRiver),
    ...siteSpots(frontier, 2, `/twnf${ki}`, 40, nearRiver).map((s) => ({ ...s, frontier: true })),
  ];
  const villSpots = [
    ...siteSpots(heart, 8, `/vilh${ki}`, 5),
    ...siteSpots(frontier, 4, `/vilf${ki}`, 25).map((s) => ({ ...s, frontier: true })),
  ].filter(
    (v) => !townSpots.some((t) => t.rq === v.rq && t.rr === v.rr) && !(v.rq === capSpot.rq && v.rr === capSpot.rr));
  const lmSpots = siteSpots(cells, 2, `/lmk${ki}`, 45);
  for (const [i, s] of townSpots.entries()) {
    const seed = `${world.seed}/p:p_surface/h:region:${s.rq},${s.rr}/f:settlement:0`;
    const tr = await run('settlement', seed, { government: gov.name });
    const t = blocksToEntity(tr.metaId, seed, tr.blocks, 'Town', region.id);
    t.kind = 'settlement';
    t.tags = ['town'];
    // Zipf-ish: one big market town, middling heartland towns, small frontier ones
    t.fields = { ...(t.fields ?? {}), population: s.frontier
      ? pop(seed + '/pop', 1_500, 12_000)
      : i === 0 ? pop(seed + '/pop', 30_000, 140_000) : pop(seed + '/pop', 2_500, 60_000) };
    world.entities[t.id] = t;
    surface.anchors.push({ entityId: t.id, x: s.x, y: s.y, tier: 'region', icon: 'town' });
    nodes.push({ type: 'town', ki, x: s.x, y: s.y, pop: t.fields.population, name: t.name });
  }
  for (const s of villSpots) {
    const seed = `${world.seed}/p:p_surface/h:region:${s.rq},${s.rr}/f:settlement:1`;
    const vr = await run('settlement', seed, { government: gov.name });
    const v = blocksToEntity(vr.metaId, seed, vr.blocks, 'Village', region.id);
    v.kind = 'settlement';
    v.tags = ['village'];
    v.fields = { ...(v.fields ?? {}), population: s.frontier
      ? pop(seed + '/pop', 120, 900)
      : pop(seed + '/pop', 300, 3_000) };
    world.entities[v.id] = v;
    surface.anchors.push({ entityId: v.id, x: s.x, y: s.y, tier: 'locale', icon: 'village' });
    nodes.push({ type: 'village', ki, x: s.x, y: s.y, pop: v.fields.population, name: v.name });
  }
  const LM_ICONS = ['dungeon', 'ruin', 'lair', 'formation', 'cave', 'tower', 'temple'];
  for (const s of lmSpots) {
    const seed = `${world.seed}/p:p_surface/h:region:${s.rq},${s.rr}/f:landmark:0`;
    const lr = await run('landmark', seed, { biome: biomeAt(cfg, s.x, s.y, 6) });
    const lm = blocksToEntity(lr.metaId, seed, lr.blocks, 'Landmark', region.id);
    lm.kind = 'landmark';
    world.entities[lm.id] = lm;
    surface.anchors.push({ entityId: lm.id, x: s.x, y: s.y, tier: 'region', icon: LM_ICONS[h32(lm.id, 5) % LM_ICONS.length] });
  }

  // life web on the capital; two side-quest chains on the kingdom lands;
  // the ruler gets a family (kin webs, batch 15)
  const life = await buildLifeWeb(world, run, capital);
  const c1 = await buildQuestChain(world, run, region);
  const c2 = await buildQuestChain(world, run, region);
  const kw = await buildKinWeb(world, run, ruler);
  kingdomLog.push({
    kingdom: kingdomName, law: gov.name, capital: capital.name, ruler: ruler.name,
    hexes: cells.length, towns: townSpots.length, villages: villSpots.length,
    landmarks: lmSpots.length, life: life?.created ?? 0,
    chains: (c1?.created ?? 0) + (c2?.created ?? 0),
    kin: kw?.created ?? 0,
    kinReuse: kw?.reused ?? 0,
    reuse: [c1?.reusedPatron, c2?.reusedPatron].filter(Boolean).length,
  });
}

// ---------- 3b. roads (G3-lite, batch 11) ----------
// Sensible routes over the same terrain-cost surface: water is simply not
// crossed at this scale (bridges/ferries are a G3 refinement near cities),
// mountains are dear so roads seek passes and easy country. Highways form
// a spanning tree over the capitals; every large town gets a road (50k+)
// or a dirt track (10k+); small villages only sometimes.
surface.routes ??= [];

// rivers become route polylines (kind 'river', width class w). The id
// prefix rt_genriv keeps them out of the Thornwald relocation shift.
{
  let rivN = 0;
  const bandOf = (k) => { const a = acc.get(k) ?? 0; return a >= RIVER_MIN * 5 ? 3 : a >= RIVER_MIN * 2 ? 2 : 1; };
  const meander = (pts, salt) => {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      out.push([x0, y0]);
      const ddx = x1 - x0, ddy = y1 - y0;
      for (const t of [0.33, 0.66]) {
        const off = (h32(salt + ':' + i + ':' + t, 9) / 4294967295 - 0.5) * 0.42;
        out.push([x0 + ddx * t - ddy * off, y0 + ddy * t + ddx * off]);
      }
    }
    out.push(pts[pts.length - 1]);
    return out.map(([x, y]) => [Math.round(x), Math.round(y)]);
  };
  const emit = (keys, w) => {
    if (keys.length < 2) return;
    // split at seam wraps so no polyline jumps across the map
    let seg = [cxy(keys[0])];
    for (let i = 1; i < keys.length; i++) {
      const pt = cxy(keys[i]);
      if (Math.abs(pt[0] - seg[seg.length - 1][0]) > cfg.circumFt / 2) {
        if (seg.length >= 2) surface.routes.push({ id: 'rt_genriv' + (rivN++).toString(36).padStart(3, '0'), kind: 'river', w, pts: meander(seg, 'rv' + rivN) });
        seg = [pt];
      } else seg.push(pt);
    }
    if (seg.length >= 2) surface.routes.push({ id: 'rt_genriv' + (rivN++).toString(36).padStart(3, '0'), kind: 'river', w, pts: meander(seg, 'rv' + rivN) });
  };
  for (const stem of riverStems) {
    // contiguous runs of one width band, overlapping one key for continuity
    let run = [stem[0]], w = bandOf(stem[0]);
    for (let i = 1; i < stem.length; i++) {
      const k = stem[i];
      const wk = land.has(k) ? bandOf(k) : w; // the sea tail keeps its band
      if (wk === w) { run.push(k); continue; }
      run.push(k);
      emit(run, w);
      run = [k]; w = wk;
    }
    emit(run, w);
  }
  console.log(`  ${rivN} river polylines stored`);
}
function landHexAt(x, y) {
  const Rw2 = TIER.world.hexFt / SQ3;
  const qf = (SQ3 / 3 * x - y / 3) / Rw2, rf = (2 / 3 * y) / Rw2;
  let rq = Math.round(qf), rr = Math.round(rf);
  const rs = Math.round(-qf - rf);
  const dq = Math.abs(rq - qf), dr = Math.abs(rr - rf), ds = Math.abs(rs + qf + rf);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  let k = canon(rq, rr);
  if (land.has(k)) return k;
  for (const [a, b] of DIRS) {
    const nk = canon(rq + a, rr + b);
    if (land.has(nk)) return nk;
  }
  return null;
}
function roadPath(fromK, toK) {
  const heap = new Heap();
  const done = new Set(), from = new Map();
  heap.push([0, fromK, null]);
  while (heap.size) {
    const [c, k, prev] = heap.pop();
    if (done.has(k)) continue;
    done.add(k);
    from.set(k, prev);
    if (k === toK) {
      const cells = [];
      for (let cur = toK; cur; cur = from.get(cur)) cells.push(cur);
      return { cells: cells.reverse(), cost: c };
    }
    const [q, r] = k.split(',').map(Number);
    for (const [dq2, dr2] of DIRS) {
      const nk = canon(q + dq2, r + dr2);
      if (!land.has(nk) || done.has(nk)) continue;
      const ford = riverOn.has(nk) !== riverOn.has(k) ? 0.9 : 0; // bridges cost
      heap.push([c + (cellCost(k) + cellCost(nk)) / 2 + ford, nk, k]);
    }
  }
  return null;
}
let rtN = 0;
function addRoute(kind, cells, a, b) {
  let pts = [[a.x, a.y], ...cells.map((k) => cxy(k)), [b.x, b.y]];
  // unwrap the seam so smoothing never averages across the world
  for (let i = 1; i < pts.length; i++) {
    while (pts[i][0] - pts[i - 1][0] > cfg.circumFt / 2) pts[i][0] -= cfg.circumFt;
    while (pts[i][0] - pts[i - 1][0] < -cfg.circumFt / 2) pts[i][0] += cfg.circumFt;
  }
  for (let it = 0; it < 2; it++) { // Chaikin — hex-center zigzag becomes road
    const out = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  surface.routes.push({ id: 'rt_gen' + (rtN++).toString(36).padStart(4, '0'), kind, pts: pts.map(([x, y]) => [Math.round(x), Math.round(y)]) });
}
const caps = nodes.filter((n) => n.type === 'capital').map((n) => ({ ...n, cell: landHexAt(n.x, n.y) }));
// highways: greedy spanning tree over capitals by path cost
const inNet = [caps[0]];
const pending = caps.slice(1);
let highways = 0;
while (pending.length) {
  let best = null;
  for (const p of pending) {
    for (const q of inNet) {
      if (!p.cell || !q.cell) continue;
      const path = roadPath(q.cell, p.cell);
      if (path && (!best || path.cost < best.cost)) best = { ...path, from: q, to: p };
    }
  }
  if (!best) break;
  addRoute('highway', best.cells, best.from, best.to);
  highways++;
  inNet.push(best.to);
  pending.splice(pending.indexOf(best.to), 1);
}
// town roads and village tracks — with the ISOLATION RULE (batch 13):
// a small place (<5,000 souls) more than 20 miles from its nearest
// neighbor gets NO road, unless an existing highway/road passes within
// 20 miles — then it snaps a spur to it (it lies "between places").
const MI = 5280, ISO_FT = 20 * MI;
const wrapD = (ax, ay, bx, by) => {
  let dx2 = Math.abs(ax - bx) % cfg.circumFt;
  if (dx2 > cfg.circumFt / 2) dx2 = cfg.circumFt - dx2;
  return Math.hypot(dx2, ay - by);
};
const nearestNeighborFt = (n) =>
  Math.min(...nodes.filter((o) => o !== n).map((o) => wrapD(n.x, n.y, o.x, o.y)));
function nearestRoutePoint(n) {
  let best = null, bestD = Infinity;
  for (const rt of surface.routes) {
    if (!rt.id.startsWith('rt_gen') || rt.kind === 'river') continue;
    for (let i = 0; i < rt.pts.length; i += 3) {
      const [px2, py2] = rt.pts[i];
      const d = wrapD(n.x, n.y, px2, py2);
      if (d < bestD) { bestD = d; best = { x: px2, y: py2 }; }
    }
  }
  return bestD <= ISO_FT ? best : null;
}
let roadsN = 0, dirtN = 0, spurs = 0, skipped = 0, isolated = 0;
function connect(n, kind, target) {
  const cell = landHexAt(n.x, n.y), tcell = landHexAt(target.x, target.y);
  if (!cell || !tcell) { skipped++; return; }
  const path = roadPath(cell, tcell);
  if (!path) { skipped++; return; }
  addRoute(kind, path.cells, n, target);
  kind === 'road' ? roadsN++ : dirtN++;
}
for (const n of nodes.filter((n) => n.type === 'town')) {
  const cap = caps.find((c) => c.ki === n.ki);
  if (!cap) { skipped++; continue; }
  const kind = n.pop >= 50_000 ? 'road' : n.pop >= 10_000 ? 'dirt' : (h32(n.name, 3) % 10 < 7 ? 'dirt' : null);
  if (!kind) { skipped++; continue; }
  if (n.pop < 5_000 && nearestNeighborFt(n) > ISO_FT) {
    const snap = nearestRoutePoint(n);
    if (!snap) { isolated++; continue; } // too far out — the road never came
    connect(n, 'dirt', snap);
    spurs++;
    continue;
  }
  connect(n, kind, cap);
}
for (const n of nodes.filter((n) => n.type === 'village')) {
  const chance = n.pop >= 1000 ? 7 : 2; // sub-1000 souls usually means no road
  if (h32(n.name + '/rd', 4) % 10 >= chance) { skipped++; continue; }
  if (n.pop < 5_000 && nearestNeighborFt(n) > ISO_FT) {
    const snap = nearestRoutePoint(n);
    if (!snap) { isolated++; continue; }
    connect(n, 'dirt', snap);
    spurs++;
    continue;
  }
  const towns = nodes.filter((t) => t.ki === n.ki && t.type !== 'village' && t !== n);
  towns.sort((a, b) => wrapD(a.x, a.y, n.x, n.y) - wrapD(b.x, b.y, n.x, n.y));
  if (!towns[0]) { skipped++; continue; }
  connect(n, 'dirt', towns[0]);
}
console.log(`roads: ${highways} highways, ${roadsN} roads, ${dirtN} dirt tracks (${spurs} snapped spurs), ${isolated} isolated (no road), ${skipped} skipped`);

// ---------- 3d. bridges: where roads cross the great rivers near towns ----------
// real bridges are paid for by traffic (owner, batch 10): only crossings
// within 40 miles of a 10k+ settlement earn one — elsewhere, you ford
const bridges = [];
{
  const roadRts = surface.routes.filter((rt) => rt.id.startsWith('rt_gen') && (rt.kind === 'highway' || rt.kind === 'road'));
  const rivRts = surface.routes.filter((rt) => rt.kind === 'river'); // any crossing near a town earns its bridge
  const segX = (a, b, c2, d2) => {
    const rpx = b[0] - a[0], rpy = b[1] - a[1], spx = d2[0] - c2[0], spy = d2[1] - c2[1];
    const den = rpx * spy - rpy * spx;
    if (!den) return null;
    const t = ((c2[0] - a[0]) * spy - (c2[1] - a[1]) * spx) / den;
    const u = ((c2[0] - a[0]) * rpy - (c2[1] - a[1]) * rpx) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + t * rpx, a[1] + t * rpy] : null;
  };
  outerB:
  for (const road of roadRts) {
    for (let i = 0; i < road.pts.length - 1; i++) {
      for (const riv of rivRts) {
        for (let j = 0; j < riv.pts.length - 1; j++) {
          const hit = segX(road.pts[i], road.pts[i + 1], riv.pts[j], riv.pts[j + 1]);
          if (!hit) continue;
          const near = nodes.find((n) => n.pop >= 5_000 && wrapD(hit[0], hit[1], n.x, n.y) <= (n.pop >= 50_000 ? 80 : 40) * MI);
          if (!near) continue;
          if (bridges.some((b2) => wrapD(hit[0], hit[1], b2.x, b2.y) < 30 * MI)) continue;
          bridges.push({ x: hit[0], y: hit[1], ki: near.ki, town: near.name.split(/[,—]/)[0].trim() });
          if (bridges.length >= 8) break outerB;
        }
      }
    }
  }
  for (const [i, b2] of bridges.entries()) {
    const styles = ['Stone Bridge', 'Old Bridge', 'Toll Bridge', 'Great Bridge', 'Wardens Bridge'];
    const e = newEntity('landmark', `${b2.town} ${styles[h32('br' + i, 4) % styles.length]}`);
    e.tags = ['bridge'];
    e.parentId = regionByKi.get(b2.ki);
    e.body = [{ type: 'paragraph', id: 'b_bridge' + i + 'x00', text: 'Where the road crosses the river. Tolls, gossip, and the slow traffic of carts.' }];
    world.entities[e.id] = e;
    surface.anchors.push({ entityId: e.id, x: Math.round(b2.x), y: Math.round(b2.y), tier: 'region', icon: 'bridge' });
  }
  console.log(`bridges: ${bridges.length}`);
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
for (const rt of surface.routes ?? []) {
  if (rt.id.startsWith('rt_gen')) continue; // generated roads already sit right
  rt.pts = rt.pts.map(([x, y]) => [x + dx, y + dy]);
}
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

// Maren Vosk gets kith and kin — the fixture's dogfood person
await buildKinWeb(world, run, world.entities.e_1xwb45d0l9i7re);

// the Thornwald lives on this continent too now
world.entities.e_regionthornw01.parentId = contEnt.id;

// ---------- 5. seal & report ----------
world.rev += 1;
world.updated = new Date().toISOString();
writeFileSync(fixturePath, JSON.stringify(world, null, 2) + '\n');
console.table(kingdomLog);
console.log('geography:', geoLabels.join(' | '));
console.log(`entities: ${Object.keys(world.entities).length}, anchors: ${surface.anchors.length}, claim owners: ${Object.keys(surface.claims).length}`);
