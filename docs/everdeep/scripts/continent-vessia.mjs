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
// priority-flood (batch 22): fill every depression to its spill point and
// derive drainage from the fill order — pits become lakes that overflow,
// and every river reaches the sea instead of dying in a hollow
const flowTo = new Map(); // land key -> downstream key (water key at mouths)
const fillOrder = [];
{
  const heapF = new Heap();
  for (const k of land.keys()) {
    const [q, r] = k.split(',').map(Number);
    let seaK = null, seaE = Infinity;
    for (const [dq2, dr2] of DIRS) {
      const nk = canon(q + dq2, r + dr2);
      if (land.has(nk)) continue;
      const [nx, ny] = cxy(nk);
      const ne = elevationAt(cfg, nx, ny, octW);
      if (ne < seaE) { seaE = ne; seaK = nk; }
    }
    if (seaK) heapF.push([elevAt(k), k, seaK]); // the coast drains to the sea
  }
  while (heapF.size) {
    const [fe, k, down] = heapF.pop();
    if (flowTo.has(k)) continue;
    flowTo.set(k, down);
    fillOrder.push(k);
    const [q, r] = k.split(',').map(Number);
    for (const [dq2, dr2] of DIRS) {
      const nk = canon(q + dq2, r + dr2);
      if (!land.has(nk) || flowTo.has(nk)) continue;
      heapF.push([Math.max(elevAt(nk), fe), nk, k]);
    }
  }
}
// depressions that filled meaningfully above their floor are LAKES — paint
// them onto the map as water overrides (M1 biome paint, batch 29)
{
  const filled = new Map();
  // re-derive fill levels: walk the drainage tree from each mouth
  for (const k of fillOrder) {
    const d = flowTo.get(k);
    const base = d && filled.has(d) ? filled.get(d) : 0;
    filled.set(k, Math.max(elevAt(k), base));
  }
  surface.biomePaint ??= {};
  let lakes = 0;
  for (const k of fillOrder) {
    if (!contSet.has(k)) continue;
    if ((filled.get(k) ?? 0) - elevAt(k) > 0.02) {
      surface.biomePaint['world:' + k] = 'water';
      lakes++;
    }
  }
  console.log(`  ${lakes} lake hexes painted (filled depressions)`);
}
const acc = new Map();
for (let i = fillOrder.length - 1; i >= 0; i--) { // upstream before downstream
  const k = fillOrder[i];
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

// ---------- 2-pre. the foodshed model (batch 38 — FOOD.md) ----------
// How many people a world hex can FEED: farmed biome base, ×2.5 on rivers
// (floodplain silt + the barge that ships the surplus), +12k fishing on any
// coast. A city may hold URBAN_SHARE of what its shed sustains: its own hex
// and ring (the cart-shed — an ox eats its cargo past ~60 mi) plus, when it
// sits on navigable water, half of everything along the connected waterway.
// calibrated against France 1300 (~80 persons/sq mi whole-territory): a
// settled grain hex sustains ~70/sq mi × 3,100 sq mi (FOOD.md §1)
const FOOD_YIELD = {
  grass: 220_000, savanna: 120_000, beach: 90_000, forest: 80_000, hills: 45_000,
  jungle: 20_000, taiga: 12_000, mountain: 5_000, desert: 2_500, tundra: 2_500, snow: 0,
};
const lakeSet = new Set(Object.entries(surface.biomePaint ?? {})
  .filter(([a, b]) => b === 'water' && a.startsWith('world:')).map(([a]) => a.slice(6)));
const isWaterHex = (k) => !land.has(k) || lakeSet.has(k);
const coastal = (k) => {
  const [q, r] = k.split(',').map(Number);
  return DIRS.some(([dq2, dr2]) => isWaterHex(canon(q + dq2, r + dr2)));
};
const hexFood = (k) => {
  if (isWaterHex(k)) return 0;
  let y = FOOD_YIELD[land.get(k)] ?? 25_000;
  if (riverOn.has(k)) y *= 2.5;
  if (coastal(k)) y += 25_000;
  return y;
};
// reach 12 ≈ 720 mi of waterway: enough that only a true river-and-sea
// junction can feed a metropolis, short enough that the cap still BINDS
const BARGE_REACH = 12, BARGE_W = 0.5, URBAN_SHARE = 0.15;
const shedMemo = new Map();
function foodshedOf(k0) {
  const memo = shedMemo.get(k0);
  if (memo) return memo;
  let cart = hexFood(k0);
  const [q0, r0] = k0.split(',').map(Number);
  const counted = new Set([k0]);
  for (const [dq2, dr2] of DIRS) {
    const nk = canon(q0 + dq2, r0 + dr2);
    counted.add(nk);
    cart += hexFood(nk);
  }
  let barge = 0;
  if (riverOn.has(k0) || coastal(k0)) {
    // barges walk the waterway graph — river hexes and open water — and
    // every land hex they touch ships its surplus at half weight
    const seen = new Set([k0]);
    let frontier = [k0];
    for (let step = 0; step < BARGE_REACH && frontier.length; step++) {
      const next = [];
      for (const k of frontier) {
        const [q, r] = k.split(',').map(Number);
        for (const [dq2, dr2] of DIRS) {
          const nk = canon(q + dq2, r + dr2);
          if (!seen.has(nk) && (isWaterHex(nk) || riverOn.has(nk))) { seen.add(nk); next.push(nk); }
          if (!counted.has(nk) && land.has(nk) && !lakeSet.has(nk)) { counted.add(nk); barge += hexFood(nk); }
        }
      }
      frontier = next;
    }
  }
  const out = { capacity: Math.round(cart + BARGE_W * barge), cart: Math.round(cart), barge: Math.round(barge) };
  shedMemo.set(k0, out);
  return out;
}
const cityCapAt = (k) => Math.floor(foodshedOf(k).capacity * URBAN_SHARE);
const miBetween = (ax, ay, bx, by) => {
  let dx = Math.abs(ax - bx) % cfg.circumFt;
  if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx;
  return Math.hypot(dx, ay - by) / 5280;
};
// central-place spacing (owner + Christaller, FOOD.md §3b): big cities cast
// an urban shadow — no 50k+ city stands within 100 miles of another
const BIG_CITY = 50_000, CITY_SPACING_MI = 100;
const bigCities = [];
const cartScore = (k) => {
  const [q2, r2] = k.split(',').map(Number);
  return hexFood(k) + DIRS.reduce((s2, [dq2, dr2]) => s2 + hexFood(canon(q2 + dq2, r2 + dr2)), 0);
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

// Territories grow outward from their seats across a TERRAIN COST surface
// (batch 11): plains are cheap, mountains/deserts/swamps dear — expansion
// stalls at ranges, so borders settle ALONG natural features instead of
// cutting straight Voronoi lines.
const TERRAIN_COST = {
  mountain: 6, hills: 2.6, snow: 3, tundra: 2, taiga: 1.6, desert: 2.2,
  jungle: 1.8, forest: 1.3, savanna: 1.1, grass: 1, beach: 1.3,
};
const cellCost = (k) => TERRAIN_COST[land.get(k)] ?? 1.5;


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
        // barren country only settles beside a waterway that can barge food
        // in (batch 38, FOOD.md §4) — no farms means no inland towns
        if (!(GOOD.has(b) || (allowAnyLand && !WATER.has(b) && (nearRiver(cell) || coastal(cell))))) continue;
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
// the metro crown (batch 38): the million-soul roll goes to the kingdom with
// the richest POSSIBLE capital site — great cities grow where the food is
const bestShedOf = new Map(seats.map((s) => {
  const top = [...territory.get(s)].sort((a, b) => cartScore(b) - cartScore(a)).slice(0, 12);
  return [s, Math.max(...top.map((k) => foodshedOf(k).capacity))];
}));
seats.sort((a, b) => bestShedOf.get(b) - bestShedOf.get(a));
console.log('  best kingdom foodsheds:', seats.map((s) => `${Math.round(bestShedOf.get(s) / 1e6 * 10) / 10}M`).join(' · '));
let kingdomIdx = 0;
const kingdomLog = [];
// settlements keep distinct names world-wide (batch 38): the name table is
// finite, and three Highgates in one search box reads as a bug. Each site
// type retries on a reserved band of seed indices when its first roll
// collides — first attempts keep the classic seeds, so an un-collided world
// bakes identically.
const usedNames = new Set(Object.values(world.entities)
  .filter((e) => e.kind === 'settlement' && !e.deleted).map((e) => e.name));
async function settlementNamed(rq, rr, idxs, popOf, extra, draftLabel, parentId) {
  let seed, sPop, ent;
  for (const idx of idxs) {
    seed = `${world.seed}/p:p_surface/h:region:${rq},${rr}/f:settlement:${idx}`;
    sPop = popOf(seed);
    // extra may depend on the rolled population (size class must match it —
    // the batch-26 scale invariant holds through retries)
    const extraObj = typeof extra === 'function' ? extra(sPop) : extra;
    const sRun = await run('settlement', seed, { ...extraObj, population: String(sPop) });
    ent = blocksToEntity(sRun.metaId, seed, sRun.blocks, draftLabel, parentId);
    if (!usedNames.has(ent.name)) break;
  }
  usedNames.add(ent.name);
  return { seed, sPop, ent };
}
const nodes = []; // settlements for the road network (batch 11)
for (const seat of seats) {
  const cells = territory.get(seat);
  const ki = kingdomIdx++;
  const seatBiome = land.get(seat);

  // the crown's law, rolled once — every settlement inside inherits it
  const gov = rollGovernment(`${world.seed}/gov:${ki}`);

  // the capital names the kingdom — and it goes where the FOOD is (batch
  // 38, FOOD.md §2): rank the kingdom's hexes by a cheap cart-score, then
  // the top candidates by their full cart+barge foodshed
  const capCandidates = [...cells]
    .sort((a, b) => cartScore(b) - cartScore(a)).slice(0, 25)
    .sort((a, b) => foodshedOf(b).capacity - foodshedOf(a).capacity).slice(0, 8);
  const capSpot = siteSpots(capCandidates, 1, `/cap${ki}`, 0, nearRiver)[0];
  // the foodshed is the law (batch 38, FOOD.md §2): a city holds at most
  // URBAN_SHARE of what its cart- and barge-sheds sustain
  const capHexK = landHexAt(capSpot.x, capSpot.y) ?? seat;
  const capShed = foodshedOf(capHexK);
  const capMax = Math.max(2_000, Math.floor(capShed.capacity * URBAN_SHARE));
  let capRoll = 0;
  const { ent: capital, sPop: capPop } = await settlementNamed(
    capSpot.rq, capSpot.rr, [0, 30, 31, 32],
    (seed) => {
      capRoll = ki === 0
        ? pop(seed + '/pop', 1_050_000, 1_600_000)
        : pop(seed + '/pop', 140_000, 900_000);
      return Math.min(capRoll, capMax);
    },
    { government: gov.name, size: 'city' }, 'Capital', undefined);
  if (capPop < capRoll) console.log(`  k${ki}: capital cut ${capRoll.toLocaleString()} → ${capPop.toLocaleString()} (shed feeds ${capShed.capacity.toLocaleString()})`);
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
  capital.fields = { ...(capital.fields ?? {}), population: capPop };
  world.entities[capital.id] = capital;
  nodes.push({ type: 'capital', ki, x: capSpot.x, y: capSpot.y, pop: capital.fields.population, name: capName });
  if (capPop >= BIG_CITY) bigCities.push({ x: capSpot.x, y: capSpot.y });

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
  // clustered around the capital, thinning toward the frontier. Barren
  // kingdoms plant FEWER of everything (batch 38, FOOD.md §4): settlement
  // count scales with the mean food yield of the land itself
  const kmYield = cells.reduce((s2, k) => s2 + hexFood(k), 0) / Math.max(1, cells.length);
  const foodScale = Math.max(0.25, Math.min(1, kmYield / 60_000));
  // the heartland gathers around the CAPITAL (which siting may have pulled
  // to the coast or a river junction), not the abstract seat
  const byDistToSeat = [...cells].sort((a, b) => dist(a, capHexK) - dist(b, capHexK));
  const heart = byDistToSeat.slice(0, Math.max(8, Math.floor(cells.length * 0.25)));
  const frontier = byDistToSeat.slice(Math.floor(cells.length * 0.5));
  const townSpots = [
    ...siteSpots(heart, Math.max(1, Math.round(4 * foodScale)), `/twnh${ki}`, 12, nearRiver),
    ...siteSpots(frontier, Math.round(2 * foodScale), `/twnf${ki}`, 40, nearRiver).map((s) => ({ ...s, frontier: true })),
  ];
  const villSpots = [
    ...siteSpots(heart, Math.max(2, Math.round(8 * foodScale)), `/vilh${ki}`, 5),
    ...siteSpots(frontier, Math.round(4 * foodScale), `/vilf${ki}`, 25).map((s) => ({ ...s, frontier: true })),
  ].filter(
    (v) => !townSpots.some((t) => t.rq === v.rq && t.rr === v.rr) && !(v.rq === capSpot.rq && v.rr === capSpot.rr));
  const lmSpots = siteSpots(cells, 2, `/lmk${ki}`, 45);
  for (const [i, s] of townSpots.entries()) {
    // Zipf-ish: one big market town, middling heartland towns, small frontier
    // ones — and never more than the local foodshed feeds (batch 38)
    const tHexK = landHexAt(s.x, s.y);
    const popOfT = (seed) => {
      const tRoll = s.frontier
        ? pop(seed + '/pop', 1_500, 12_000)
        : i === 0 ? pop(seed + '/pop', 30_000, 140_000) : pop(seed + '/pop', 2_500, 60_000);
      let tp = Math.min(tRoll, Math.max(400, tHexK ? cityCapAt(tHexK) : tRoll));
      // the urban shadow (FOOD.md §3b): inside 100 mi of a bigger city, a
      // would-be city stays a market town
      if (tp >= BIG_CITY && bigCities.some((c2) => miBetween(s.x, s.y, c2.x, c2.y) < CITY_SPACING_MI)) tp = 45_000;
      return tp;
    };
    const { ent: t, sPop: tPop } = await settlementNamed(
      s.rq, s.rr, [0, 10, 11, 12], popOfT,
      (p) => ({ government: gov.name, size: p >= 25_000 ? 'city' : 'town' }), 'Town', region.id);
    t.kind = 'settlement';
    t.tags = [tPop >= 25_000 ? 'city' : 'town'];
    t.fields = { ...(t.fields ?? {}), population: tPop };
    world.entities[t.id] = t;
    surface.anchors.push({ entityId: t.id, x: s.x, y: s.y, tier: 'region', icon: 'town' });
    nodes.push({ type: 'town', ki, x: s.x, y: s.y, pop: t.fields.population, name: t.name });
    if (tPop >= BIG_CITY) bigCities.push({ x: s.x, y: s.y });
  }
  for (const s of villSpots) {
    const { ent: v, sPop: vPop } = await settlementNamed(
      s.rq, s.rr, [1, 20, 21, 22],
      (seed) => (s.frontier ? pop(seed + '/pop', 120, 900) : pop(seed + '/pop', 300, 3_000)),
      (p) => ({ government: gov.name, size: p >= 1_000 ? 'town' : 'village' }), 'Village', region.id);
    v.kind = 'settlement';
    v.tags = [vPop >= 1_000 ? 'town' : 'village'];
    v.fields = { ...(v.fields ?? {}), population: vPop };
    world.entities[v.id] = v;
    surface.anchors.push({ entityId: v.id, x: s.x, y: s.y, tier: 'locale', icon: 'village' });
    nodes.push({ type: 'village', ki, x: s.x, y: s.y, pop: v.fields.population, name: v.name });
  }
  // granary towns (batch 38, FOOD.md §3): the market towns that actually
  // feed the capital — 1 baked per 250k of capital population, planted on
  // the richest food hexes of its shed; each page says how many real ones
  // it stands for
  const nFarm = Math.max(1, Math.min(5, Math.round(capPop / 250_000)));
  const shedCells = [...cells]
    .sort((a, b) => dist(a, capHexK) - dist(b, capHexK)).slice(0, 15)
    .sort((a, b) => hexFood(b) - hexFood(a));
  const farmSpots = siteSpots(shedCells, nFarm, `/farm${ki}`, 8, nearRiver)
    .filter((s) => !townSpots.some((t) => t.rq === s.rq && t.rr === s.rr) && !(s.rq === capSpot.rq && s.rr === capSpot.rr));
  const representsEach = Math.max(1, Math.round(capPop / 7_500 / Math.max(1, farmSpots.length)));
  for (const [i, s] of farmSpots.entries()) {
    const { ent: ft, sPop: fPop } = await settlementNamed(
      s.rq, s.rr, [2, 3, 4, 5],
      (seed) => pop(seed + '/pop', 900, 4_500),
      (p) => ({ government: gov.name, size: p >= 1_000 ? 'town' : 'village' }), 'Town', region.id);
    ft.kind = 'settlement';
    ft.tags = [fPop >= 1_000 ? 'town' : 'village', 'farm-town'];
    ft.fields = { ...(ft.fields ?? {}), population: fPop };
    ft.body = [...(ft.body ?? []), {
      type: 'paragraph', id: `b_granary${ki}x${i}`,
      label: 'Granary town',
      text: `One of the market towns that feed {@e ${capital.id}|${capName}}: its ring of villages barges grain toward the capital. It stands for roughly ${representsEach} such towns across the foodshed (FOOD.md §3).`,
    }];
    world.entities[ft.id] = ft;
    surface.anchors.push({ entityId: ft.id, x: s.x, y: s.y, tier: 'region', icon: 'town' });
    nodes.push({ type: 'village', ki, x: s.x, y: s.y, pop: fPop, name: ft.name });
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
    capPop, shedFeeds: capShed.capacity, farmTowns: farmSpots.length,
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
    // recursive midpoint displacement: each level halves the wavelength,
    // so the course is gently curved at world zoom and sinuous up close
    let cur = pts;
    for (let lvl = 0; lvl < 3; lvl++) {
      const next = [cur[0]];
      for (let i = 0; i < cur.length - 1; i++) {
        const [x0, y0] = cur[i], [x1, y1] = cur[i + 1];
        const off = (h32(salt + ':' + lvl + ':' + i, 9) / 4294967295 - 0.5) * (lvl === 0 ? 0.42 : 0.5);
        next.push([(x0 + x1) / 2 - (y1 - y0) * off, (y0 + y1) / 2 + (x1 - x0) * off]);
        next.push([x1, y1]);
      }
      cur = next;
    }
    return cur.map(([x, y]) => [Math.round(x), Math.round(y)]);
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
