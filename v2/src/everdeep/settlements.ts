// Settlements & roads — the browser port of the bake's geographic civilisation
// pass (continent-vessia.mjs). Given a world's terrain + drainage (from
// hydrology.ts), it places capitals/towns/villages where the food and water are
// and forges a road network between them — highways between capitals, roads and
// dirt tracks out to the towns, bridges where a road crosses a great river.
//
// It produces PLACEMENTS and ROUTES only, not full statblocks: a new world gets
// named, sited, road-linked towns immediately, and their pages fill in lazily
// when opened (the same materialise flow the map ghosts use). Batch 69.

import { biomeAt, elevationAt, detailAt, octFor, temperatureNorm, type TerrainCfg } from './terrain.ts';
import { properName } from './geoNames.ts';
import { h32 } from './seeds.ts';
import { hugLand } from './landRoute.ts';
import type { HydroGrid } from './hydrology.ts';

const SQ3 = Math.sqrt(3);
const REGION_HEXFT = 31_680, REGION_IDX = 3;
const MI = 5280;
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const GOOD = new Set(['grass', 'forest', 'savanna', 'hills', 'beach', 'taiga', 'jungle']);
const WATER = new Set(['deep', 'water']);
const TERRAIN_COST: Record<string, number> = {
  mountain: 6, hills: 2.6, snow: 3, tundra: 2, desert: 2.2,
  jungle: 1.8, forest: 1.3, savanna: 1.1, grass: 1, beach: 1.3,
};
const FOOD_YIELD: Record<string, number> = {
  grass: 1, savanna: 0.6, forest: 0.7, beach: 0.5, hills: 0.6,
  jungle: 0.7, taiga: 0.35, tundra: 0.1, mountain: 0.15, desert: 0.1, snow: 0,
};

class Heap<T> {
  private a: Array<[number, T]> = [];
  get size(): number { return this.a.length; }
  push(x: [number, T]): void {
    const a = this.a; a.push(x);
    for (let i = a.length - 1; i > 0;) { const p = (i - 1) >> 1; if (a[p]![0] <= a[i]![0]) break; [a[p], a[i]] = [a[i]!, a[p]!]; i = p; }
  }
  pop(): [number, T] | undefined {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length && last) { a[0] = last; for (let i = 0; ;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < a.length && a[l]![0] < a[m]![0]) m = l; if (r < a.length && a[r]![0] < a[m]![0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m]!, a[i]!]; i = m; } }
    return top;
  }
}

export type SettleType = 'royal seat' | 'regional city' | 'river port' | 'coastal town' | 'market town' | 'fishing village' | 'farming village';
export interface SettleNode { tier: 'capital' | 'town' | 'village'; x: number; y: number; pop: number; name: string; type: SettleType; reason: string; ki: number }

/**
 * What part a settlement plays in the road network, from what a saved world
 * actually stores about it (its tags and its population).
 *
 * ONE rule, shared, because there were two and they disagreed. The bake decided
 * tier from its own local `cls` variable; `world.astro` re-derived it from tags
 * as `capital → capital, town → town, everything else → village`. But the bake
 * tags a settlement by CLASS — 'city' at 500k, 'town' at 60k, 'village' below —
 * so every city-tagged settlement came back a VILLAGE, and a two-million-soul
 * city that isn't a national capital came back a village instead of a capital.
 * Measured on the shipped Earth: the browser saw 249 capitals, 3 towns and
 * 3,260 villages out of 1,500 cities. So a user who nudged one town had their
 * roads re-forged for a world that doesn't exist — dirt tracks between
 * megacities, and the isolation rule cutting them off entirely.
 */
export function settleTier(tags: readonly string[], pop: number): SettleNode['tier'] {
  if (tags.includes('capital') || pop >= 2_000_000) return 'capital';
  if (tags.includes('village')) return 'village';
  if (tags.includes('city') || tags.includes('town')) return 'town';
  return pop >= 60_000 ? 'town' : 'village';
}
export interface RoadRoute { id: string; kind: 'highway' | 'road' | 'dirt'; pts: Array<[number, number]> }
export interface Settlements { nodes: SettleNode[]; routes: RoadRoute[]; bridges: Array<[number, number]> }

export function generateSettlements(cfg: TerrainCfg, grid: HydroGrid): Settlements {
  const { octW, hexC, canon, worldKeyAt, land, riverOn, lakeSet, bandOf } = grid;
  const rnd = (s: string): number => h32(s, 0) / 4294967295;
  const cxy = (k: string): [number, number] => { const [q, r] = k.split(',').map(Number); return hexC(q!, r!); };
  const isGreatRiver = (k: string): boolean => riverOn.has(k) && bandOf(k) >= 2;
  const nearRiver = (k: string): boolean => { if (riverOn.has(k)) return true; const [q, r] = k.split(',').map(Number); return DIRS.some(([a, b]) => riverOn.has(canon(q! + a, r! + b))); };
  const coastal = (k: string): boolean => { const [q, r] = k.split(',').map(Number); return DIRS.some(([a, b]) => { const nk = canon(q! + a, r! + b); return !land.has(nk) && !lakeSet.has(nk); }); };
  // no one settles the ice: 'beach' is classified before the temperature check,
  // so an Antarctic/Arctic shore reads as GOOD land — gate it on real warmth.
  const warmEnough = (k: string): boolean => { const [x, y] = cxy(k); return temperatureNorm(cfg, x, y, octW) >= 0.3; };
  const wrapD = (ax: number, ay: number, bx: number, by: number): number => { let dx = Math.abs(ax - bx) % cfg.circumFt; if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx; return Math.hypot(dx, ay - by); };
  const dist = (a: string, b: string): number => { const [ax, ay] = cxy(a), [bx, by] = cxy(b); return wrapD(ax, ay, bx, by); };

  // ---- 1. continents (connected land components) ----
  // A lake hex keeps its PRE-FILL biome in `land`, but no road may step on one
  // (roadPath skips lakeSet) — so the flood must skip them too, or an island in
  // a filled lake counts as mainland, gets towns, and every road off them dies
  // at the shore (§10.3 stranded-town audit). ONE connectivity rule: a
  // continent is exactly the ground a road can reach.
  const continents: string[][] = [];
  { const seen = new Set<string>(); for (const k of land.keys()) { if (seen.has(k) || lakeSet.has(k)) continue; const cells = [k]; seen.add(k); for (let i = 0; i < cells.length; i++) { const [q, r] = cells[i]!.split(',').map(Number); for (const [dq, dr] of DIRS) { const nk = canon(q! + dq, r! + dr); if (land.has(nk) && !lakeSet.has(nk) && !seen.has(nk)) { seen.add(nk); cells.push(nk); } } } if (cells.length >= 8) continents.push(cells); } }
  continents.sort((a, b) => b.length - a.length);
  const contOf = new Map<string, number>();
  continents.forEach((cont, ci) => { for (const k of cont) contOf.set(k, ci); });

  // ---- food score (cheap cartogram proxy) ----
  const hexFood = (k: string): number => { const b = land.get(k); if (!b) return 0; let f = FOOD_YIELD[b] ?? 0; if (nearRiver(k)) f += 0.5; if (coastal(k)) f += 0.3; return f; };
  const cartScore = (k: string): number => { const [q, r] = k.split(',').map(Number); return hexFood(k) + DIRS.reduce((s, [dq, dr]) => s + hexFood(canon(q! + dq, r! + dr)), 0); };

  // region-tier sub-hex sampling, for siting a town off the coarse world hex
  const regionOct = octFor(REGION_HEXFT), Rr = REGION_HEXFT / SQ3;
  const regionXY = (rq: number, rr: number): [number, number] => [SQ3 * Rr * (rq + rr / 2), 1.5 * Rr * rr];
  const regionBiome = (rq: number, rr: number): string => { const [x, y] = regionXY(rq, rr); const d = detailAt(cfg, x, y, REGION_HEXFT, REGION_IDX); return biomeAt(cfg, x, y, regionOct, (d - 0.5) * 0.055); };
  // pick a GOOD sub-hex of a world cell, preferring one that touches open water
  const siteAt = (worldK: string, salt: string): { x: number; y: number } | null => {
    const [wx, wy] = cxy(worldK);
    const baseQ = Math.round((SQ3 / 3 * wx - wy / 3) / Rr), baseR = Math.round((2 / 3 * wy) / Rr);
    const cands: Array<{ x: number; y: number; wet: boolean }> = [];
    for (let t = 0; t < 9; t++) {
      const rq = baseQ + Math.floor((h32(worldK + salt, 11 + t) / 4294967295 - 0.5) * 7);
      const rr = baseR + Math.floor((h32(worldK + salt, 51 + t) / 4294967295 - 0.5) * 7);
      const b = regionBiome(rq, rr);
      if (!GOOD.has(b)) continue;
      const [x, y] = regionXY(rq, rr);
      if (temperatureNorm(cfg, x, y, regionOct) < 0.3) continue; // not on the ice
      // Land at the REGION octave (6 mi) is not land at the WORLD octave (60 mi)
      // near a coast — the two disagree about exactly where the shore runs. The
      // road pass judges wet/dry at octW (its `shore`, and hugLand), so a site the
      // region octave calls good grass but octW calls open sea gets a town the
      // network can NEVER reach: every road off it starts in water and hugLand
      // severs it at the doorstep. (That was two of the three long-standing #11
      // roadless towns — Ithoth and Olaara — sitting in octW's ocean with no dry
      // land within ten miles.) Place only where the roads agree there is land.
      if (WATER.has(biomeAt(cfg, x, y, octW))) continue;
      // The same rule, one layer up (§10.3 stranded audit): the point must land
      // on a hex some CONTINENT owns. siteAt roams a few region hexes, which
      // can hop the point into a filled-lake hex or a sub-8-hex dry pocket
      // ringed by lake — ground the road A* refuses to step on, so a town
      // there is roadless forever however close its neighbours are.
      if (contOf.get(worldKeyAt(x, y)) === undefined) continue;

      const wet = DIRS.some(([dq, dr]) => WATER.has(regionBiome(rq + dq, rr + dr)));
      cands.push({ x, y, wet });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => (b.wet ? 1 : 0) - (a.wet ? 1 : 0));
    return { x: cands[0]!.x, y: cands[0]!.y };
  };

  const typeOf = (cell: string, pop: number, capital: boolean): SettleType => {
    if (capital) return 'royal seat';
    if (pop >= 25_000) return 'regional city';
    if (isGreatRiver(cell) || (riverOn.has(cell) && pop >= 2_000)) return 'river port';
    if (coastal(cell) && pop >= 800) return 'coastal town';
    if (pop >= 1_000) return 'market town';
    return coastal(cell) || nearRiver(cell) ? 'fishing village' : 'farming village';
  };
  const ECON: Record<string, string> = {
    grass: 'good grain and cattle country', savanna: 'dry-farmed grain and herds', beach: 'strand farms and inshore fishing',
    forest: 'a field-and-woodland mosaic of crops, timber, and game', hills: 'terraced fields and hill pasture',
    jungle: 'garden plots worked out of the canopy', taiga: 'hard barley, hunting, and furs', tundra: 'thin herding at the moss-edge',
    mountain: 'a few high valleys and the wealth of the rock', desert: 'oasis fields and the salt roads', snow: 'the bare edge of the living world',
  };
  const reasonOf = (cell: string, pop: number, type: SettleType, capital: boolean): string => {
    const why: string[] = [];
    if (isGreatRiver(cell)) why.push('it holds a crossing of a great river — a wharf, a bridgehead, and a barge road that carries its grain to the sea');
    else if (riverOn.has(cell)) why.push('the river at its feet waters the fields and floats the harvest to market');
    else if (coastal(cell)) why.push('the shore feeds it, with inshore fishing and a beach to draw up boats');
    else if (nearRiver(cell)) why.push('a river runs close enough to barge food in when the fields fall short');
    if (capital) why.push('the crown sited it on the richest foodshed of the realm, where a great city can be fed');
    why.push(`the land around is ${ECON[land.get(cell)!] ?? 'workable country'}`);
    return `A ${type}. ${why.join('; ').replace(/^./, (c) => c.toUpperCase())}. Population ~${pop.toLocaleString('en-US')}.`;
  };

  // ---- 2. placement ----
  const nodes: SettleNode[] = [];
  const usedNames = new Set<string>();
  const nameFor = (seed: string): string => { let n = properName(seed); for (let i = 1; usedNames.has(n) && i < 16; i++) n = properName(seed + '/' + i); usedNames.add(n); return n; };
  let kiCount = 0;
  const place = (tier: SettleNode['tier'], cell: string, spot: { x: number; y: number }, pop: number, ki: number, seed: string, capital = false): void => {
    if (nodes.some((n) => wrapD(n.x, n.y, spot.x, spot.y) < (tier === 'village' ? 22 : 38) * MI)) return;
    const type = typeOf(cell, pop, capital);
    nodes.push({ tier, x: spot.x, y: spot.y, pop, name: nameFor(seed), type, reason: reasonOf(cell, pop, type, capital), ki });
  };

  for (let ci = 0; ci < continents.length; ci++) {
    const cont = continents[ci]!;
    const good = cont.filter((k) => GOOD.has(land.get(k)!) && warmEnough(k));
    if (good.length < 2) continue; // an all-ice/rock landmass (Antarctica) stays wild
    const nCap = Math.max(1, Math.min(5, Math.round(cont.length / 210)));
    // capitals: farthest-point spread over the good cells
    const seats = [good[Math.floor(rnd(cfg.seed + '/seat/' + ci) * good.length)]!];
    while (seats.length < nCap) { let best: string | null = null, bd = -1; for (const k of good) { const d = Math.min(...seats.map((s) => dist(k, s))); if (d > bd) { bd = d; best = k; } } if (!best) break; seats.push(best); }
    for (const seat of seats) {
      const ki = kiCount++;
      const near = cont.filter((k) => dist(k, seat) < 480 * MI);
      const pool = near.length ? near : [seat];
      const capCell = [...pool].sort((a, b) => cartScore(b) - cartScore(a))[0]!;
      const spot = siteAt(capCell, '/cap' + ki) ?? siteAt(seat, '/cap' + ki);
      if (!spot) continue;
      place('capital', capCell, spot, 40_000 + Math.floor(rnd(cfg.seed + '/cappop/' + ki) * 180_000), ki, cfg.seed + '/cap/' + ki, true);
      // towns on the richest surrounding food, then villages on river/coast cells
      const ranked = [...pool].sort((a, b) => cartScore(b) - cartScore(a));
      let towns = 0;
      for (const tc of ranked) { if (towns >= 4) break; const s = siteAt(tc, '/town' + ki + '/' + towns); if (!s) continue; const before = nodes.length; place('town', tc, s, 1_200 + Math.floor(rnd(cfg.seed + '/townpop/' + ki + '/' + towns) * 20_000), ki, cfg.seed + '/town/' + ki + '/' + towns); if (nodes.length > before) towns++; }
      let vills = 0;
      for (const vc of ranked) { if (vills >= 5) break; if (!(nearRiver(vc) || coastal(vc))) continue; const s = siteAt(vc, '/vill' + ki + '/' + vills); if (!s) continue; const before = nodes.length; place('village', vc, s, 150 + Math.floor(rnd(cfg.seed + '/villpop/' + ki + '/' + vills) * 1_500), ki, cfg.seed + '/vill/' + ki + '/' + vills); if (nodes.length > before) vills++; }
    }
  }

  // ---- 3. roads ---- (the road network is its own reusable pass so it can be
  // rebuilt when the user edits settlements — batch 73)
  const { routes, bridges } = generateRoads(cfg, grid, nodes);
  return { nodes, routes, bridges };
}

/**
 * Forge the road network for a set of settlement nodes over a world's drainage
 * grid — highways spanning each continent's capitals, roads/dirt spurring towns
 * and villages in, bridges at great-river crossings. Split out from
 * generateSettlements (batch 73) so it can be re-run when the user adds or
 * removes a settlement, without re-placing the towns.
 */
/**
 * Where a road's DRAWN line actually meets a river's DRAWN line.
 *
 * `generateRoads` can only report the crossing HEX, and it plants the bridge at
 * that hex's centre — but a world hex is 60 miles across and the river meanders
 * inside it, so the bridge can end up tens of miles from the water it supposedly
 * spans (owner: "many not even over rivers"). Intersecting the two polylines
 * puts the bridge exactly on the water, and drops any phantom whose hex the
 * drawn river never actually entered.
 */
export function bridgeCrossings(
  roads: RoadRoute[],
  rivers: Array<{ w?: number; pts: Array<[number, number]> }>,
  minBand = 2,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const seg = (p1: [number, number], p2: [number, number], p3: [number, number], p4: [number, number]): [number, number] | null => {
    const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
    if (Math.abs(d) < 1e-9) return null;
    const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
    const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
  };
  const big = rivers.filter((r) => (r.w ?? 1) >= minBand);
  for (const rd of roads) {
    if (rd.kind === 'dirt') continue; // a dirt track never bridges (batch 46)
    for (let i = 1; i < rd.pts.length; i++) {
      for (const rv of big) {
        for (let j = 1; j < rv.pts.length; j++) {
          const p = seg(rd.pts[i - 1]!, rd.pts[i]!, rv.pts[j - 1]!, rv.pts[j]!);
          // one bridge per crossing: a meander can re-cross the same road nearby
          if (p && !out.some((b) => Math.hypot(b[0] - p[0], b[1] - p[1]) < 6 * MI)) out.push(p);
        }
      }
    }
  }
  return out;
}

export function generateRoads(cfg: TerrainCfg, grid: HydroGrid, nodes: SettleNode[]): { routes: RoadRoute[]; bridges: Array<[number, number]> } {
  const { octW, hexC, canon, worldKeyAt, land, riverOn, lakeSet, bandOf } = grid;
  // hex key → centre point, memoized. Called millions of times inside the A*
  // road search (heur, the neighbour loop, emit), and the coordinate never
  // changes for a key — so parsing "q,r" and re-running hexC each time was ~11%
  // of the whole build. The CACHE holds a private copy and every call returns a
  // FRESH array, because `emit` unwraps the seam by MUTATING the points it gets
  // back (settlements.ts ~L343); handing out the cached array would corrupt it.
  const cxyCache = new Map<string, readonly [number, number]>();
  const cxy = (k: string): [number, number] => {
    const c = cxyCache.get(k);
    if (c) return [c[0], c[1]];
    const [q, r] = k.split(',').map(Number);
    const p = hexC(q!, r!) as [number, number];
    cxyCache.set(k, [p[0], p[1]]);
    return p;
  };
  const elevOf = new Map<string, number>();
  const elevAt = (k: string): number => { let e = elevOf.get(k); if (e === undefined) { const [x, y] = cxy(k); e = elevationAt(cfg, x, y, octW); elevOf.set(k, e); } return e; };
  const cellCost = (k: string): number => TERRAIN_COST[land.get(k)!] ?? 1.5;
  const isGreatRiver = (k: string): boolean => riverOn.has(k) && bandOf(k) >= 2;
  const wrapD = (ax: number, ay: number, bx: number, by: number): number => { let dx = Math.abs(ax - bx) % cfg.circumFt; if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx; return Math.hypot(dx, ay - by); };
  // continents (connected land components), for grouping nodes into networks.
  // Lake hexes are excluded exactly as in generateSettlements' flood: roadPath
  // cannot step on them, so ground beyond a lake ring is not "the same network"
  // however contiguous the biome map looks (§10.3 stranded-town audit).
  const continents: string[][] = [];
  const contOf = new Map<string, number>();
  { const seen = new Set<string>(); for (const k of land.keys()) { if (seen.has(k) || lakeSet.has(k)) continue; const cells = [k]; seen.add(k); for (let i = 0; i < cells.length; i++) { const [q, r] = cells[i]!.split(',').map(Number); for (const [dq, dr] of DIRS) { const nk = canon(q! + dq, r! + dr); if (land.has(nk) && !lakeSet.has(nk) && !seen.has(nk)) { seen.add(nk); cells.push(nk); } } } if (cells.length >= 8) continents.push(cells); } }
  continents.forEach((cont, ci) => { for (const k of cont) contOf.set(k, ci); });

  // great-river hexes a nearby city could afford to bridge (roads concentrate
  // their few crossings there); crossings already built are shared by later roads.
  const bridgeableGR = new Set<string>();
  for (const k of riverOn) { if (!isGreatRiver(k)) continue; const [gx, gy] = cxy(k); if (nodes.some((n) => n.pop >= 10_000 && wrapD(gx, gy, n.x, n.y) < 55 * MI)) bridgeableGR.add(k); }
  // Does a cell touch water (river/sea/lake)? A pure function of the cell — six
  // neighbour keys, eighteen Set lookups — that the A* inner loop asks of every
  // candidate step, so it was 26% of the whole build recomputing the same answer.
  // Memoized: the land layout does not change while roads are forged.
  const nwrCache = new Map<string, boolean>();
  const nearWaterRoad = (kk: string): boolean => {
    let v = nwrCache.get(kk);
    if (v !== undefined) return v;
    const [q, r] = kk.split(',').map(Number);
    v = DIRS.some(([a, b]) => { const nn = canon(q! + a, r! + b); return riverOn.has(nn) || !land.has(nn) || lakeSet.has(nn); });
    nwrCache.set(kk, v);
    return v;
  };
  const builtCrossings: Array<[number, number]> = [];
  const nearBuiltCrossing = (nx: number, ny: number): boolean => builtCrossings.some((c) => wrapD(c[0], c[1], nx, ny) < 45 * MI);
  // How many planned roads run through each cell — road "accumulation", the
  // direct analogue of a river's rain accumulation. A stretch that several roads
  // share IS a bigger road (owner: "if many roads join, the main thoroughfare
  // should probably be upgraded in road rank").
  const traffic = new Map<string, number>();

  const WORLD_HEXFT = 316_800;
  // A* with an admissible straight-line heuristic (batch 69): the bake ran this
  // offline as uniform-cost Dijkstra, but in-browser it must be goal-directed or
  // it explores the whole continent per road. Min per-hex step is ~0.8 (grass
  // hugging water), so a 0.6 coefficient never overestimates → optimal & fast.
  function roadPath(fromK: string, toK: string, opts: { dirt?: boolean; forge?: boolean } = {}): { cells: string[]; cost: number } | null {
    const [tx, ty] = cxy(toK);
    const heur = (k: string): number => { const [x, y] = cxy(k); return (wrapD(x, y, tx, ty) / WORLD_HEXFT) * 0.6; };
    const heap = new Heap<[string, string | null, number]>();
    const done = new Set<string>(), from = new Map<string, string | null>();
    const lastCross = new Map<string, [number, number] | null>([[fromK, null]]);
    heap.push([heur(fromK), [fromK, null, 0]]);
    let pops = 0;
    while (heap.size) {
      const [, [k, prev, g]] = heap.pop()!;
      if (done.has(k)) continue;
      done.add(k); from.set(k, prev);
      if (++pops > 20_000) return null; // safety cap; a road this long isn't built
      if (prev !== null) { const entered = isGreatRiver(k) && !isGreatRiver(prev); lastCross.set(k, entered ? cxy(k) : (lastCross.get(prev) ?? null)); }
      if (k === toK) { const cells: string[] = []; for (let cur: string | null | undefined = toK; cur; cur = from.get(cur)) cells.push(cur); return { cells: cells.reverse(), cost: g }; }
      const [q, r] = k.split(',').map(Number);
      const kGreat = isGreatRiver(k);
      for (const [dq, dr] of DIRS) {
        const nk = canon(q! + dq, r! + dr);
        if (!land.has(nk) || done.has(nk) || lakeSet.has(nk)) continue;
        const nGreat = isGreatRiver(nk);
        if (opts.dirt && nGreat) continue;
        let step = (cellCost(k) + cellCost(nk)) / 2;
        if (!nGreat && nearWaterRoad(nk)) step *= 0.8;
        if (!opts.forge) { step += Math.max(0, elevAt(nk) - 0.5) * 2.2; step += Math.max(0, elevAt(nk) - elevAt(k)) * 6; }
        let extra = 0;
        if (nGreat && !kGreat) { const [nx, ny] = cxy(nk); extra += nearBuiltCrossing(nx, ny) ? 0.3 : bridgeableGR.has(nk) ? 6 : 13; const lc = lastCross.get(k); if (lc && wrapD(lc[0], lc[1], nx, ny) < 85 * MI) extra += 80; }
        else if (nGreat && kGreat) extra += 2;
        else if (riverOn.has(nk) !== riverOn.has(k)) extra += 0.7;
        const ng = g + step + extra;
        heap.push([ng + heur(nk), [nk, k, ng]]);
      }
    }
    return null;
  }
  const realTime = (cells: string[]): number => { let t = 0; for (let i = 1; i < cells.length; i++) t += (cellCost(cells[i - 1]!) + cellCost(cells[i]!)) / 2; return t; };
  function bestRoad(fromK: string, toK: string, opts: { dirt?: boolean } = {}): { cells: string[]; cost: number } | null {
    const low = roadPath(fromK, toK, opts);
    if (!low) return null;
    const forge = roadPath(fromK, toK, { ...opts, forge: true });
    if (forge && realTime(low.cells) > 4 * realTime(forge.cells)) return forge;
    return low;
  }
  const recordCrossings = (cells: string[]): void => { for (let i = 1; i < cells.length; i++) if (isGreatRiver(cells[i]!) && !isGreatRiver(cells[i - 1]!)) builtCrossings.push(cxy(cells[i]!)); };

  // ---- fine-grain terrain following (#30c) -----------------------------------
  // The plan above chose which 60-mile hexes a road crosses; that fixes its
  // traffic, rank and bridges, and a full A* re-route at 6-mile grain inside that
  // corridor was measured to move the drawn line ~13mi on average yet find a
  // LOWER pass only half the time (176 better / 174 worse) — the coarse cost is
  // already elevation-aware, so there is little left to win, for ~8s of build.
  //
  // What the eye actually wants (owner: real roads MEANDER, following the low
  // ground — the ridgeways/Tobler) is cheap: the drawn line already gets a random
  // perpendicular wobble purely for looks. Bias that wobble toward the LOWER of
  // the two sides instead, sampled at region (6-mile) relief. Every road then
  // sags off ridges into valleys, at O(vertices) and no search — so it costs
  // nothing the budget notices. Deterministic (seeded relief), so the fixture
  // still rebuilds byte-for-byte.
  const REGION_OCT = octFor(REGION_HEXFT);
  const ROAD_SAG = 1.5; // how hard a cross-slope pulls the line toward lower ground
  const relElev = (x: number, y: number): number => elevationAt(cfg, x, y, REGION_OCT);

  const routes: RoadRoute[] = [];
  let rtN = 0;
  // Water as a traveller meets it, not as the 60-mile grid summarises it. Same
  // octave the grid itself uses (octW), so this disagrees with `land` only about
  // WHERE inside a hex the coast runs — which is the whole point. `biomeAt`
  // wraps x for us, which the seam-unwrapped road polylines rely on.
  const shore = { wet: (x: number, y: number): boolean => WATER.has(biomeAt(cfg, x, y, octW)) };
  // Roads are PLANNED first and drawn later: a road's rank depends on how many
  // other roads end up sharing its cells, which isn't known until every road is
  // planned. Same two-pass shape as the river tiers.
  interface RoadEnd { x: number; y: number; pop?: number }
  interface RoadPlan { kind: RoadRoute['kind']; cells: string[]; a: RoadEnd; b: RoadEnd }
  const plans: RoadPlan[] = [];
  // Traffic is generated by PEOPLE (owner: "population density between two
  // points should translate into traffic, more traffic = bigger road") — the
  // classic gravity model. The geometric mean of the two populations: a road
  // between two great cities carries orders of magnitude more than one between
  // two hamlets, and a road is only ever as busy as its quieter end.
  const popOf = (p: RoadEnd): number => Math.max(1, p.pop ?? 0);
  // a spur onto an existing road has no far-end population; the traffic it adds
  // is simply its own town's
  const weightOf = (a: RoadEnd, b: RoadEnd): number =>
    Math.sqrt(popOf(a) * (b.pop ? popOf(b) : popOf(a)));
  const addRoute = (kind: RoadRoute['kind'], cells: string[], a: RoadEnd, b: RoadEnd): void => {
    const w = weightOf(a, b);
    for (const k of cells) traffic.set(k, (traffic.get(k) ?? 0) + w);
    plans.push({ kind, cells, a, b });
  };
  const emit = (kind: RoadRoute['kind'], cells: string[], a: { x: number; y: number }, b: { x: number; y: number }): void => {
    let pts: Array<[number, number]> = [[a.x, a.y], ...cells.map((k) => cxy(k)), [b.x, b.y]];
    for (let i = 1; i < pts.length; i++) { while (pts[i]![0] - pts[i - 1]![0] > cfg.circumFt / 2) pts[i]![0] -= cfg.circumFt; while (pts[i]![0] - pts[i - 1]![0] < -cfg.circumFt / 2) pts[i]![0] += cfg.circumFt; }
    // Nudge every interior vertex sideways. The old wobble was pure noise for a
    // less ruler-straight look; now the SIGN follows the land — sample relief a
    // few miles to each side and lean toward the lower one, so the road sags off
    // ridges into the valleys the way a real one does (#30c). A little seeded
    // noise still rides along so flat country isn't a straight edge.
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i + 1]!;
      const px = pts[i]![0], py = pts[i]![1];
      let off = (h32(`${Math.round(px)},${Math.round(py)}`, 17) / 4294967295 - 0.5) * 0.05;
      const dx = x1 - x0, dy = y1 - y0, plen = Math.hypot(dx, dy) || 1;
      const ux = -dy / plen, uy = dx / plen;          // unit perpendicular to prev→next
      const probe = REGION_HEXFT * 0.9;               // ~5.3mi to each side
      // Sea guard: below the shoreline (e<0.5) is water — read it as high so a
      // road never sags off the coast into the sea (that only fed hugLand more
      // splits). Land seeks the lower LAND side; the coast holds the line.
      const dry = (e: number): number => (e < 0.5 ? 2 : e);
      const grad = dry(relElev(px - ux * probe, py - uy * probe)) - dry(relElev(px + ux * probe, py + uy * probe));
      off += Math.max(-0.11, Math.min(0.11, grad * ROAD_SAG)); // +perp side lower → lean +perp
      pts[i] = [px - (y1 - y0) * off, py + (x1 - x0) * off];
    }
    for (let it = 0; it < 2; it++) { const out: Array<[number, number]> = [pts[0]!]; for (let i = 0; i < pts.length - 1; i++) { const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!; out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]); } out.push(pts[pts.length - 1]!); pts = out; }
    // Everything above draws at 60-mile resolution and then smooths, and both of
    // those put roads in the sea (landRoute.ts). Re-draw against water the
    // planner cannot see; a road that never goes near any comes back untouched,
    // and one with a strait in it comes back as the two roads it really is.
    for (const piece of hugLand(pts, shore)) {
      routes.push({ id: 'rt_gensr' + (rtN++).toString(36).padStart(4, '0'), kind, pts: piece.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]) });
    }
  };

  // Nearest point on a road already built (every 3rd vertex is plenty). This is
  // what makes roads MERGE: a place joins the web at the closest existing road
  // rather than spoking on its own to a distant hub, so two roads toward the
  // same place converge onto one line instead of running side by side. The
  // reference bake had this; the port to this module dropped it, which is why
  // roads stopped joining.
  const nearestRoadPoint = (n: { x: number; y: number }): { x: number; y: number; d: number } | null => {
    let best: { x: number; y: number; d: number } | null = null;
    // reads the PLANNED roads (nothing is drawn until the rank pass), so a town
    // still joins the web at the closest road laid down before it
    for (const p of plans) {
      for (const k of p.cells) {
        const [px, py] = cxy(k);
        const d = wrapD(n.x, n.y, px, py);
        if (!best || d < best.d) best = { x: px, y: py, d };
      }
    }
    return best;
  };
  const cellOf = (n: { x: number; y: number }): string => worldKeyAt(n.x, n.y);
  // per-continent networks: highways span the capitals, then towns/villages spur
  // to the nearest node (the isolation rule: a lonely small place gets no road).
  const nodeCell = new Map<SettleNode, string>(nodes.map((n) => [n, cellOf(n)]));
  const contIndexOf = (n: SettleNode): number => {
    const k = nodeCell.get(n)!;
    const c = contOf.get(k);
    if (c !== undefined) return c;
    // Water-magnetism (batch 57) centres a site on its bank/shore sub-hex, which
    // can nudge the node's point onto a hex belonging to no continent component
    // (a component under 8 hexes isn't one, and a shore point can fall in the
    // sea hex itself). Such a node fell into no network bucket and was never
    // offered a road at all — roadless forever, however close its neighbour.
    // Adopt a NEARBY component instead of dropping the node — out to three
    // rings, because a user-dropped town (or a shore-magnetised point) can sit
    // a couple of hexes off the component that should serve it (§10.3).
    const [q0, r0] = k.split(',').map(Number);
    const seen = new Set<string>([k]);
    let ring: Array<[number, number]> = [[q0!, r0!]];
    for (let depth = 0; depth < 3; depth++) {
      const next: Array<[number, number]> = [];
      for (const [q, r] of ring) {
        for (const [dq, dr] of DIRS) {
          const nk = canon(q + dq, r + dr);
          if (seen.has(nk)) continue;
          seen.add(nk);
          const nc = contOf.get(nk);
          if (nc !== undefined) return nc;
          next.push([q + dq, r + dr]);
        }
      }
      ring = next;
    }
    return -1;
  };
  for (let ci = 0; ci < continents.length; ci++) {
    const here = nodes.filter((n) => contIndexOf(n) === ci);
    const caps = here.filter((n) => n.tier === 'capital');
    const capLinked = new Set<SettleNode>(); // capitals the highway MST actually reached
    if (caps.length > 1) {
      // precompute each capital pair's road ONCE (bestRoad = low vs forged), then
      // Prim's MST over the cache — the old all-pairs-every-step loop was O(n³).
      const pair = new Map<string, { cells: string[]; cost: number } | null>();
      const key = (i: number, j: number): string => (i < j ? `${i},${j}` : `${j},${i}`);
      const pathBetween = (i: number, j: number): { cells: string[]; cost: number } | null => {
        const kk = key(i, j); if (pair.has(kk)) return pair.get(kk)!;
        const p = bestRoad(nodeCell.get(caps[i]!)!, nodeCell.get(caps[j]!)!); pair.set(kk, p); return p;
      };
      // Prim's over each capital's NEAREST NEIGHBOURS, not over every pair.
      //
      // The cache made this O(n²) A* runs instead of O(n³), which is fine for
      // one country's two capitals and ruinous for a planet's 249: measured, a
      // global call spends 790 SECONDS, essentially all of it here — 30,876
      // pairs at 25.6ms each. That is the "O(n²) A* over 1,500 global nodes
      // would never finish" the bake buckets per country to dodge, and it is
      // also why the browser, which does NOT bucket, takes 13 minutes to rebuild
      // the shipped Earth's roads.
      //
      // Almost all of those pairs are absurd on their face — an A* from Lisbon
      // to Vladivostok, priced so Prim's can discard it. A geometric MST only
      // ever uses short edges, so offer each capital its K nearest by straight
      // line and price only those. Straight line is not road cost (a flat
      // corridor can beat a nearer mountain), so this is a heuristic, not the
      // exact MST — but "capitals link to their neighbours" is what a real
      // network does, and the exact answer is not worth thirteen minutes.
      const KNN = 6;
      const cand: Array<Set<number>> = caps.map(() => new Set<number>());
      for (let i = 0; i < caps.length; i++) {
        const order = caps.map((c, j) => ({ j, d: wrapD(caps[i]!.x, caps[i]!.y, c.x, c.y) }))
          .filter((o) => o.j !== i)
          .sort((a, b) => a.d - b.d)
          .slice(0, KNN);
        for (const o of order) { cand[i]!.add(o.j); cand[o.j]!.add(i); } // symmetric
      }
      const inNet = new Set<number>([0]);
      const dead = new Set<number>(); // no road exists to it, however hard we look
      while (inNet.size + dead.size < caps.length) {
        let best: { cells: string[]; cost: number } | null = null, bi = -1, bj = -1;
        for (const i of inNet) {
          for (const j of cand[i]!) {
            if (inNet.has(j) || dead.has(j)) continue;
            const p = pathBetween(i, j);
            if (p && (!best || p.cost < best.cost)) { best = p; bi = i; bj = j; }
          }
        }
        if (!best) {
          // The neighbour graph is in two pieces here — a capital whose K
          // nearest are all already in the net, or a cluster the other side of a
          // range. Reach for the nearest capital still outside by straight line
          // and price just that one, so the continent still ends up connected.
          let nd = Infinity;
          for (const i of inNet) {
            for (let j = 0; j < caps.length; j++) {
              if (inNet.has(j) || dead.has(j)) continue;
              const d = wrapD(caps[i]!.x, caps[i]!.y, caps[j]!.x, caps[j]!.y);
              if (d < nd) { nd = d; bi = i; bj = j; }
            }
          }
          if (bj < 0) break;
          best = pathBetween(bi, bj);
          if (!best) { dead.add(bj); continue; } // truly unreachable overland
        }
        addRoute('highway', best.cells, caps[bi]!, caps[bj]!); recordCrossings(best.cells);
        capLinked.add(caps[bi]!); capLinked.add(caps[bj]!);
        inNet.add(bj);
      }
    }
    // towns → nearest already-connected node by road; villages → dirt track,
    // but only if a neighbour is within reach (isolation rule)
    const connected = new Set<SettleNode>(caps);
    // A capital the highway pass never reached — the lone capital of its
    // landmass, or one the pathfinder marked dead — takes the town treatment
    // below instead of nothing: a far-north seat with one fishing village a
    // hundred miles off should still have that road (§10.3 stranded audit).
    for (const n of here.filter((x) => x.tier === 'town' || (x.tier === 'capital' && !capLinked.has(x))).sort((a, b) => b.pop - a.pop)) {
      const targets = (connected.size > caps.length ? here.filter((t) => t !== n && connected.has(t)) : caps.filter((t) => t !== n));
      let tgt: SettleNode | null = null, td = Infinity;
      for (const t of targets) { const d = wrapD(n.x, n.y, t.x, t.y); if (d < td) { td = d; tgt = t; } }
      // A landmass with no capital has no *connected* target at all, and a town
      // whose every connected target is beyond the 600mi reach was left roadless
      // even with a village next door. Either way, fall back to the nearest
      // settlement of ANY tier: a town joins whatever network exists, even when
      // that network is only its neighbour (§10.3 stranded audit).
      if (!tgt || td > 600 * MI) for (const t of here) { if (t === n) continue; const d = wrapD(n.x, n.y, t.x, t.y); if (d < td) { td = d; tgt = t; } }
      // join at the nearest existing road when it clearly beats the run to the
      // node — the trunk forms first (biggest towns first), lesser towns chain
      // onto it, and the network knots up instead of fanning out
      const snap = nearestRoadPoint(n);
      if (snap && snap.d < td * 0.8) {
        const sp = roadPath(nodeCell.get(n)!, worldKeyAt(snap.x, snap.y));
        if (sp) { addRoute('road', sp.cells, n, snap); recordCrossings(sp.cells); connected.add(n); continue; }
      }
      if (!tgt || td > 600 * MI) continue; // too far from the network — no road
      const path = roadPath(nodeCell.get(n)!, nodeCell.get(tgt)!);
      if (path) { addRoute('road', path.cells, n, tgt); recordCrossings(path.cells); connected.add(n); }
    }
    for (const n of here.filter((x) => x.tier === 'village')) {
      let tgt: SettleNode | null = null, td = Infinity;
      for (const t of here) { if (t === n) continue; const d = wrapD(n.x, n.y, t.x, t.y); if (d < td) { td = d; tgt = t; } }
      // a village may also join at the nearest road if that's closer than any
      // neighbour — but the isolation rule still stands: a hamlet with nothing
      // within reach stays trackless, road or not
      const snap = nearestRoadPoint(n);
      const to: { x: number; y: number } | null =
        snap && snap.d <= 60 * MI && snap.d < td ? snap : tgt && td <= 60 * MI ? tgt : null;
      if (!to) continue; // lonely village, no road (isolation rule)
      const tcell = worldKeyAt(to.x, to.y);
      let path = roadPath(nodeCell.get(n)!, tcell, { dirt: true }), kind: RoadRoute['kind'] = 'dirt';
      if (!path) { path = roadPath(nodeCell.get(n)!, tcell); kind = 'road'; } // dirt blocked by a great river → a proper road that can bridge
      if (path) { addRoute(kind, path.cells, n, to); if (kind === 'road') recordCrossings(path.cells); }
    }
  }

  // ---- rank pass: draw every planned road at the rank its TRAFFIC earns ----
  // The road answer to the river tier ladder. Where many roads converge, the
  // shared stretch carries all their traffic and IS the main thoroughfare — so
  // it's drawn as one. A road is split where its rank changes, exactly as a
  // river stem splits at a band change (hydrology.ts), so a highway can narrow
  // to a country road as it leaves the trunk instead of the whole route wearing
  // one rank end to end.
  const KIND_AT: RoadRoute['kind'][] = ['dirt', 'road', 'highway'];
  const RANK_OF: Record<RoadRoute['kind'], number> = { dirt: 0, road: 1, highway: 2 };
  // Thresholds are RELATIVE to this world's own traffic, not absolute. Rivers
  // can use absolute constants because rain falls at the same rate everywhere;
  // population doesn't — Earth runs from 150-soul hamlets to 37-million cities,
  // so any fixed number either makes every road a highway here or every road a
  // track on a small procedural world. (Measured: absolute thresholds turned all
  // 440 Earth roads into highways.) Percentiles keep "highway" meaning "the
  // busiest roads in THIS world" at any scale, and stay deterministic.
  const vals = [...traffic.values()].sort((a, b) => a - b);
  const pct = (p: number): number => (vals.length ? vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]! : Infinity);
  const HWY_TRAFFIC = pct(0.93), ROAD_TRAFFIC = pct(0.65);
  const rankAt = (k: string, base: number): number => {
    const t = traffic.get(k) ?? 0;
    return Math.max(base, t >= HWY_TRAFFIC ? 2 : t >= ROAD_TRAFFIC ? 1 : 0);
  };
  const at = (k: string): { x: number; y: number } => { const [x, y] = cxy(k); return { x, y }; };
  /** Draw one path, split where its rank changes. */
  const emitPath = (base: number, cells: string[], aPt: { x: number; y: number }, bPt: { x: number; y: number }): void => {
    let run: string[] = [];
    let cur = -1;
    let first = true; // only the FIRST segment starts at the settlement itself
    for (const k of cells) {
      const r = rankAt(k, base);
      if (cur === -1) { cur = r; run = [k]; continue; }
      if (r === cur) { run.push(k); continue; }
      // rank changed: close the run, and re-use this cell as the next run's
      // first point so the two segments meet with no gap (the trick hydrology
      // uses at a band change)
      run.push(k);
      emit(KIND_AT[cur]!, run, first ? aPt : at(run[0]!), at(k));
      first = false;
      run = [k];
      cur = r;
    }
    // the last run carries on to the far settlement
    if (run.length >= 2) emit(KIND_AT[cur === -1 ? base : cur]!, run, first ? aPt : at(run[0]!), bPt);
  };

  // ---- draw each stretch of the network ONCE (items #10b / #30b) ----
  //
  // Roads were drawn PER PLAN, so a spur from a town to its hub drew its own
  // full-length line even when it shared every cell with the trunk already
  // there — two lines a mile or three apart, running together for tens of miles
  // (the owner's screenshot is Johannesburg: rt_gensr0001za and 0008za, 33.2 mi
  // side by side). It looks like a routing fault and is not one. A world hex is
  // 60 MILES and the lines are 1–3 apart, far below the grid that chose them:
  // the two roads AGREE about every cell. What separates them is the drawing —
  // the corner-jitter is keyed on a cell's NEIGHBOURS, which differ between the
  // two roads, and Chaikin then blends each road's own endpoint a couple of
  // cells up the line. A previous attempt to fix this in the cost surface (a
  // strong "follow existing road" discount) moved it 9.19% → 9.71%: nothing,
  // because they already followed it.
  //
  // So: an edge belongs to the NETWORK, not to a road. Draw it for whoever
  // reaches it first and let later plans skip it, and a spur physically STOPS
  // where it meets the trunk — which is what a junction is. The traffic model is
  // untouched and still counts every plan, so the shared trunk still carries all
  // their traffic and is still drawn at the rank that earns.
  const eKey = (a: string, b: string): string => (a < b ? a + '|' + b : b + '|' + a);
  const drawnEdge = new Set<string>();
  // Highest rank first, so a shared trunk is drawn as the highway it is and the
  // spurs add only their own tails. The natural plan order already does this
  // (capitals' highways are planned before towns' roads before villages' dirt),
  // but leaning on that silently is how it breaks the day someone reorders the
  // loop — and a sort is stable, so within a rank nothing moves.
  const ordered = [...plans].sort((a, b) => RANK_OF[b.kind] - RANK_OF[a.kind]);
  for (const p of ordered) {
    const base = RANK_OF[p.kind];
    // both ends inside one hex: there is no edge to share, and no trunk to
    // yield to. Draw the doorstep-to-doorstep line itself — this used to call
    // emitPath, which needs a two-cell run and silently drew NOTHING, so the
    // town was marked connected yet had no road on the map (§10.3 audit).
    if (p.cells.length < 2) { emit(p.kind, p.cells, p.a, p.b); continue; }
    // cut this plan into the stretches nobody has drawn yet
    let run: string[] = [p.cells[0]!];
    for (let i = 1; i < p.cells.length; i++) {
      const k = eKey(p.cells[i - 1]!, p.cells[i]!);
      if (drawnEdge.has(k)) {
        // the network already goes this way: hand the traveller over to it
        if (run.length >= 2) {
          const startsAtA = run[0] === p.cells[0];
          emitPath(base, run, startsAtA ? p.a : at(run[0]!), at(run[run.length - 1]!));
        }
        run = [p.cells[i]!];
        continue;
      }
      drawnEdge.add(k);
      run.push(p.cells[i]!);
    }
    if (run.length >= 2) {
      const startsAtA = run[0] === p.cells[0];
      emitPath(base, run, startsAtA ? p.a : at(run[0]!), p.b);
    }
  }

  // ---- the junction: a spur that stood down still has to REACH its town ----
  //
  // Yielding a shared course to the trunk is right, but "shares a cell" is NOT
  // "is on the road" when a cell is 60 MILES across — the same resolution trap
  // as item #24, wearing a different hat. The trunk can run thirty miles from
  // the town whose spur just handed its course over, and that town is then
  // simply not on the network: `smoke-settle` caught exactly this, 5 roadless
  // towns going to 20.
  //
  // So once the network is drawn, every settlement a road was PLANNED for gets a
  // link from its own doorstep to the nearest road — which is short, lands on
  // the trunk, and is a junction. That is the shape the plan asked for ("a spur
  // must physically END at a junction on the existing road rather than run its
  // own full-length line to the hub"), and it is only affordable now because the
  // spur no longer draws the whole hub run to get there.
  {
    type Seg = [number, number, number, number];
    const segs: Seg[] = [];
    for (const rt of routes) {
      for (let i = 1; i < rt.pts.length; i++) {
        const [ax, ay] = rt.pts[i - 1]!, [bx, by] = rt.pts[i]!;
        if (Math.abs(bx - ax) > cfg.circumFt / 2) continue; // seam split
        segs.push([ax, ay, bx, by]);
      }
    }
    // nearest point on the drawn network — SEGMENTS, not vertices. A vertex-only
    // scan is the beads-not-a-line mistake this repo has now made four times.
    const nearestOnNet = (x: number, y: number): { x: number; y: number; d: number } | null => {
      let best: { x: number; y: number; d: number } | null = null;
      for (const [ax, ay, bx, by] of segs) {
        for (const ox of [0, -cfg.circumFt, cfg.circumFt]) { // offer the query either side of the seam
          const px = x + ox;
          const dx = bx - ax, dy = by - ay;
          const d2 = dx * dx + dy * dy;
          let t = d2 > 0 ? ((px - ax) * dx + (y - ay) * dy) / d2 : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = ax + dx * t, qy = ay + dy * t;
          const d = Math.hypot(qx - px, qy - y);
          if (!best || d < best.d) best = { x: qx - ox, y: qy, d };
        }
      }
      return best;
    };
    const REACH_FT = 3 * MI;   // closer than this and the road already serves it
    const LINK_MAX = 45 * MI;  // farther than this it is not a spur, it is a road
    const ends: Array<{ x: number; y: number; kind: RoadRoute['kind'] }> = [];
    for (const p of plans) {
      ends.push({ x: p.a.x, y: p.a.y, kind: p.kind });
      if (p.b.pop != null) ends.push({ x: p.b.x, y: p.b.y, kind: p.kind });
    }
    // counted only to keep the loop honest under review; the bake logs the total
    for (const e of ends) {
      const near = nearestOnNet(e.x, e.y);
      if (!near || near.d <= REACH_FT || near.d > LINK_MAX) continue;
      let pts: Array<[number, number]> = [[e.x, e.y], [near.x, near.y]];
      while (pts[1]![0] - pts[0]![0] > cfg.circumFt / 2) pts[1]![0] -= cfg.circumFt;
      while (pts[1]![0] - pts[0]![0] < -cfg.circumFt / 2) pts[1]![0] += cfg.circumFt;
      for (const piece of hugLand(pts, shore)) {
        routes.push({ id: 'rt_gensr' + (rtN++).toString(36).padStart(4, '0'), kind: e.kind, pts: piece.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]) });

      }
    }

  }

  // ---- prune dead-end offcuts (owner: "roads ending in nothing") ------------
  // hugLand splits a road wherever it crosses a fine strait the 60-mile planner
  // couldn't see; the far piece then dangles at the water's edge, reaching
  // neither a town nor the rest of the web. A real road ENDS AT a place — a port
  // sits on its town (near a node), an inland road ends on dry land. So a piece
  // whose free end stops at WATER, well away from any settlement, is that offcut.
  //
  // But dropping it must never STRAND a town (smoke-settle's #11 guard): a coast
  // town separated from everything by a strait has only this stub for a road, and
  // a road-to-its-own-shore beats no road at all. So a stub is dropped only when
  // its ANCHORED (landward) end is already served by ANOTHER road — i.e. the
  // area keeps a real connection without it. A stub that is a town's sole link,
  // or an orphan fragment touching nothing, is judged case by case below.
  {
    const atWater = (p: Array<[number, number]>, head: boolean): boolean => {
      const n = p.length;
      const [ex, ey] = head ? p[0]! : p[n - 1]!;
      const [ix, iy] = head ? p[1]! : p[n - 2]!;
      const dx = ex - ix, dy = ey - iy, m = Math.hypot(dx, dy) || 1;
      const s = 8 * MI; // probe just past the end, the way the road was heading
      return shore.wet(ex + (dx / m) * s, ey + (dy / m) * s);
    };
    const farFromTown = (x: number, y: number): boolean =>
      !nodes.some((nd) => wrapD(x, y, nd.x, nd.y) < 12 * MI);
    const isDead = routes.map((rt) => {
      const p = rt.pts;
      if (p.length < 2) return false;
      return (atWater(p, true) && farFromTown(p[0]![0], p[0]![1])) ||
             (atWater(p, false) && farFromTown(p[p.length - 1]![0], p[p.length - 1]![1]));
    });
    if (isDead.some(Boolean)) {
      // Dropping an offcut must never strand a TOWN (smoke-settle's #11 guard).
      // Map which routes reach each town+capital (a vertex within 8mi — the same
      // "roadless" radius the guard uses). A town whose roads are ALL offcuts
      // keeps one — a road to its own shore beats no road; a village may go
      // trackless, so it isn't protected. Every other offcut is dangling noise.
      const TOWN_R = 8 * MI, TCELL = 12 * MI;
      const townCell = new Map<string, number[]>();
      nodes.forEach((nd, ni) => { if (nd.tier === 'village') return; const k = Math.floor((((nd.x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt) / TCELL) + ',' + Math.floor(nd.y / TCELL); let a = townCell.get(k); if (!a) townCell.set(k, a = []); a.push(ni); });
      const townRoutes = new Map<number, Set<number>>();
      routes.forEach((rt, i) => {
        for (const [x, y] of rt.pts) {
          const cx0 = Math.floor((((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt) / TCELL), cy0 = Math.floor(y / TCELL);
          for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const arr = townCell.get((cx0 + a) + ',' + (cy0 + b)); if (arr) for (const ni of arr) if (wrapD(x, y, nodes[ni]!.x, nodes[ni]!.y) < TOWN_R) { let s = townRoutes.get(ni); if (!s) townRoutes.set(ni, s = new Set()); s.add(i); } }
        }
      });
      const protect = new Set<number>();
      for (const rs of townRoutes.values()) {
        const arr = [...rs];
        if (arr.some((j) => !isDead[j])) continue; // town already keeps a real road
        protect.add(arr.reduce((a, b) => (routes[b]!.pts.length > routes[a]!.pts.length ? b : a))); // else keep its longest offcut
      }
      const kept = routes.filter((_, i) => !isDead[i] || protect.has(i));
      if (kept.length !== routes.length) { routes.length = 0; routes.push(...kept); }
    }
  }

  // ---- geometric merge: collapse roads drawn twice (#10b) -------------------
  // Batch 118 stops roads that share 60-mile CELLS from drawing apart, but two
  // roads to one hub can thread ADJACENT cells and still run 1–3mi apart, and the
  // junction stubs aren't deduped at all — ~9% of road-miles ran doubled. So one
  // final pass: in rank order (a highway is the trunk a lesser road yields to),
  // claim a fine grid of HEADING; where a later road runs the same ~3-mile
  // corridor the same way, that run is dropped, so the road merges into the trunk
  // and re-emerges where it diverges. A town whose road parallels a trunk already
  // sits within 3mi of it, so it stays served; a run carrying a town is kept, and
  // a wholly-shadowed road that reaches an otherwise-unroaded town keeps a stub.
  {
    const COS30 = Math.cos(Math.PI / 6), CELL = 2 * MI, MINRUN = 6 * MI;
    const fold = (x: number): number => ((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    const claimed = new Map<string, Array<[number, number]>>();
    const claim = (x: number, y: number, ux: number, uy: number): void => { const k = Math.floor(fold(x) / CELL) + ',' + Math.floor(y / CELL); let a = claimed.get(k); if (!a) claimed.set(k, a = []); a.push([ux, uy]); };
    const redundant = (x: number, y: number, ux: number, uy: number): boolean => {
      const cx = Math.floor(fold(x) / CELL), cy = Math.floor(y / CELL);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) { const a = claimed.get((cx + dx) + ',' + (cy + dy)); if (a) for (const [hx, hy] of a) if (Math.abs(hx * ux + hy * uy) >= COS30) return true; }
      return false;
    };
    const nearTownPt = (x: number, y: number): boolean => nodes.some((n) => n.tier !== 'village' && wrapD(x, y, n.x, n.y) < 8 * MI);
    // Densify to ~1mi to detect/claim shadowing at a fine grain, but TAG the true
    // polyline vertices: those are what we emit, because the input is already
    // hugLand-cut around the water, so a straight chord between decimated points
    // would slice across a bay the real road curved around. Emitting the original
    // vertices keeps the road on the land it was drawn on.
    interface DP { x: number; y: number; ux: number; uy: number; gap: boolean; red: boolean; orig: boolean }
    const densify = (pts: Array<[number, number]>): DP[] => {
      const out: DP[] = [];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
        if (Math.abs(bx - ax) > cfg.circumFt / 2) { out.push({ x: ax, y: ay, ux: 0, uy: 0, gap: true, red: false, orig: true }); continue; }
        const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / MI));
        const ux = L > 0 ? (bx - ax) / L : 0, uy = L > 0 ? (by - ay) / L : 0;
        for (let t = i === 1 ? 0 : 1; t <= n; t++) out.push({ x: ax + (bx - ax) * (t / n), y: ay + (by - ay) * (t / n), ux, uy, gap: false, red: false, orig: t === n || (i === 1 && t === 0) });
      }
      return out;
    };
    // a kept run → its exact cut ends plus the polyline vertices between (on-land)
    const emitRun = (run: DP[]): Array<[number, number]> => {
      const out: Array<[number, number]> = [[Math.round(run[0]!.x), Math.round(run[0]!.y)]];
      for (let i = 1; i < run.length - 1; i++) if (run[i]!.orig) out.push([Math.round(run[i]!.x), Math.round(run[i]!.y)]);
      const last = run[run.length - 1]!;
      const tail: [number, number] = [Math.round(last.x), Math.round(last.y)];
      const prev = out[out.length - 1]!;
      if (prev[0] !== tail[0] || prev[1] !== tail[1]) out.push(tail);
      return out;
    };
    const rlen = (rt: RoadRoute): number => { let t = 0; for (let i = 1; i < rt.pts.length; i++) { const [ax, ay] = rt.pts[i - 1]!, [bx, by] = rt.pts[i]!; if (Math.abs(bx - ax) > cfg.circumFt / 2) continue; t += Math.hypot(bx - ax, by - ay); } return t; };
    // trunks first: highway > road > dirt, then longest, then id — fully ordered
    const ordered = [...routes].sort((a, b) => (RANK_OF[b.kind] - RANK_OF[a.kind]) || (rlen(b) - rlen(a)) || (a.id < b.id ? -1 : 1));
    const merged: RoadRoute[] = [];
    let mrN = 0;
    for (const rt of ordered) {
      const D = densify(rt.pts);
      for (const p of D) p.red = !p.gap && redundant(p.x, p.y, p.ux, p.uy);
      const runs: DP[][] = []; let cur: DP[] = [];
      for (const p of D) { if (p.red || p.gap) { if (cur.length) runs.push(cur); cur = []; } else cur.push(p); }
      if (cur.length) runs.push(cur);
      let kept = runs.filter((run) => {
        if (run.length < 2) return false;
        const rl = Math.hypot(run[run.length - 1]!.x - run[0]!.x, run[run.length - 1]!.y - run[0]!.y);
        return rl >= MINRUN || nearTownPt(run[0]!.x, run[0]!.y) || nearTownPt(run[run.length - 1]!.x, run[run.length - 1]!.y);
      });
      if (kept.length === 0) { // wholly shadowed — leave a short stub only if it reaches a town
        const a = rt.pts[0]!, b = rt.pts[rt.pts.length - 1]!;
        if (nearTownPt(a[0], a[1]) || nearTownPt(b[0], b[1])) { const live = D.filter((p) => !p.gap); if (live.length >= 2) kept = [live.slice(0, Math.min(live.length, 5))]; }
      }
      for (const run of kept) {
        for (const p of run) claim(p.x, p.y, p.ux, p.uy);
        const pts2 = emitRun(run);
        if (pts2.length >= 2) merged.push({ id: 'rt_gensr' + (mrN++).toString(36).padStart(4, '0'), kind: rt.kind, pts: pts2 });
      }
    }
    routes.length = 0; routes.push(...merged);
  }

  // ---- land the cut ends (audit round 3: V26/V27/V29/V36) -------------------
  // Three passes above CUT roads — hugLand at water, the shared-edge draw, the
  // geometric merge at shadowed runs — and a cut simply stopped. The audit
  // measured the wreckage on the shipped Earth: 917 of 2,866 endpoints (32%)
  // died 0.5–6 mi from a road they never joined, 72 more hung short of their
  // own settlement, 292 ended in open wilderness. A cut end is a JUNCTION the
  // drawing forgot. Post-merge (so nothing re-cuts the repair):
  //   1. an end within 3 mi of a settlement walks to the DOOR;
  //   2. any other free end within 6 mi of another road joins it where it
  //      stands — the junction the merge implied;
  //   3. a node the drawn net misses by 0.4–3 mi gets its doorstep spur (the
  //      pre-merge pass only links beyond REACH_FT=3 mi, and the merge eats
  //      short village stubs — this gap is exactly the "pin beside the trunk"
  //      shot);
  //   4. a fragment that joined nothing and serves nobody was offcut noise.
  // Every rule samples the fine shoreline first: a repair never crosses water
  // the road itself would not.
  {
    const SNAP_MIN = 0.15 * MI;  // closer than this is already a junction
    const JOIN_MAX = 6 * MI;     // farther than this is honest geography
    const TOWN_JOIN = 3 * MI;    // an end this near a settlement walks to it
    const SPUR_MIN = 0.4 * MI;   // a node nearer the net than this is served
    interface RSeg { ax: number; ay: number; bx: number; by: number; ri: number }
    const rsegs: RSeg[] = [];
    routes.forEach((rt, ri) => {
      for (let i = 1; i < rt.pts.length; i++) {
        const [ax, ay] = rt.pts[i - 1]!, [bx, by] = rt.pts[i]!;
        if (Math.abs(bx - ax) > cfg.circumFt / 2) continue; // seam split
        rsegs.push({ ax, ay, bx, by, ri });
      }
    });
    const SCELL = 2 * MI;
    const foldX = (x: number): number => ((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
    const sgrid = new Map<string, number[]>();
    rsegs.forEach((s, si) => {
      const x0 = Math.min(s.ax, s.bx), x1 = Math.max(s.ax, s.bx);
      const y0 = Math.min(s.ay, s.by), y1 = Math.max(s.ay, s.by);
      for (let cx = Math.floor(x0 / SCELL); cx <= Math.floor(x1 / SCELL); cx++) {
        for (let cy = Math.floor(y0 / SCELL); cy <= Math.floor(y1 / SCELL); cy++) {
          const k = Math.floor(foldX(cx * SCELL) / SCELL) + ',' + cy;
          let a = sgrid.get(k);
          if (!a) sgrid.set(k, a = []);
          a.push(si);
        }
      }
    });
    // nearest point on the drawn net — SEGMENTS, never vertices (the repo's
    // four-time beads-not-a-line lesson), through the seam, excluding one route
    const nearestSeg = (x: number, y: number, notRi: number, maxD: number): { x: number; y: number; d: number } | null => {
      let best: { x: number; y: number; d: number } | null = null;
      const R = Math.ceil(maxD / SCELL);
      const cx0 = Math.floor(x / SCELL), cy0 = Math.floor(y / SCELL);
      const seen = new Set<number>();
      for (let dx = -R; dx <= R; dx++) {
        for (let dy = -R; dy <= R; dy++) {
          const arr = sgrid.get(Math.floor(foldX((cx0 + dx) * SCELL) / SCELL) + ',' + (cy0 + dy));
          if (!arr) continue;
          for (const si of arr) {
            if (seen.has(si)) continue;
            seen.add(si);
            const s = rsegs[si]!;
            if (s.ri === notRi) continue;
            for (const ox of [0, -cfg.circumFt, cfg.circumFt]) {
              const px = x + ox;
              const ddx = s.bx - s.ax, ddy = s.by - s.ay;
              const d2 = ddx * ddx + ddy * ddy;
              let t = d2 > 0 ? ((px - s.ax) * ddx + (y - s.ay) * ddy) / d2 : 0;
              t = t < 0 ? 0 : t > 1 ? 1 : t;
              const qx = s.ax + ddx * t, qy = s.ay + ddy * t;
              const d = Math.hypot(qx - px, qy - y);
              if (d <= maxD && (!best || d < best.d)) best = { x: qx - ox, y: qy, d };
            }
          }
        }
      }
      return best;
    };
    const dryLine = (ax: number, ay: number, bx: number, by: number): boolean => {
      const L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(L / (0.5 * MI)));
      for (let i = 1; i < n; i++) {
        if (shore.wet(ax + (bx - ax) * (i / n), ay + (by - ay) * (i / n))) return false;
      }
      return true;
    };
    // A repair must never re-lay pavement the merge just lifted: a cut end near
    // a town walks TOWARD that town alongside the very trunk that caused the
    // cut, and the doubling guard (#10b) rightly counts it. Same redundancy
    // test the merge uses — a nearby segment on the repair's own heading means
    // the network already runs this way, so the repair yields to it.
    const COS_PAR = Math.cos(Math.PI / 6);
    const parallelNearby = (ax: number, ay: number, bx: number, by: number, notRi: number): boolean => {
      const L = Math.hypot(bx - ax, by - ay);
      if (L < 0.3 * MI) return false; // a doorstep hop can't read as doubling
      const ux = (bx - ax) / L, uy = (by - ay) / L;
      for (const t of [0.25, 0.5, 0.75]) {
        const mx = ax + (bx - ax) * t, my = ay + (by - ay) * t;
        const R = Math.ceil((1.5 * MI) / SCELL);
        const cx0 = Math.floor(mx / SCELL), cy0 = Math.floor(my / SCELL);
        for (let dx = -R; dx <= R; dx++) {
          for (let dy = -R; dy <= R; dy++) {
            const arr = sgrid.get(Math.floor(foldX((cx0 + dx) * SCELL) / SCELL) + ',' + (cy0 + dy));
            if (!arr) continue;
            for (const si of arr) {
              const s = rsegs[si]!;
              if (s.ri === notRi) continue;
              const ddx = s.bx - s.ax, ddy = s.by - s.ay;
              const sl = Math.hypot(ddx, ddy);
              if (sl === 0) continue;
              if (Math.abs((ddx / sl) * ux + (ddy / sl) * uy) < COS_PAR) continue;
              const d2 = sl * sl;
              let u = ((mx - s.ax) * ddx + (my - s.ay) * ddy) / d2;
              u = u < 0 ? 0 : u > 1 ? 1 : u;
              if (Math.hypot(mx - (s.ax + ddx * u), my - (s.ay + ddy * u)) < 1.5 * MI) return true;
            }
          }
        }
      }
      return false;
    };
    // settlement grid (the per-endpoint town scan would be 10M naive compares)
    const NCELL = 3 * MI;
    const ngrid = new Map<string, SettleNode[]>();
    for (const nd of nodes) {
      const k = Math.floor(foldX(nd.x) / NCELL) + ',' + Math.floor(nd.y / NCELL);
      let a = ngrid.get(k);
      if (!a) ngrid.set(k, a = []);
      a.push(nd);
    }
    const nearNode = (x: number, y: number, maxD: number): { nd: SettleNode; d: number } | null => {
      let best: { nd: SettleNode; d: number } | null = null;
      const R = Math.ceil(maxD / NCELL);
      const cx0 = Math.floor(foldX(x) / NCELL), cy0 = Math.floor(y / NCELL);
      for (let dx = -R; dx <= R; dx++) {
        for (let dy = -R; dy <= R; dy++) {
          const arr = ngrid.get(Math.floor(foldX((cx0 + dx) * NCELL) / NCELL) + ',' + (cy0 + dy));
          if (!arr) continue;
          for (const nd of arr) {
            const d = wrapD(x, y, nd.x, nd.y);
            if (d <= maxD && (!best || d < best.d)) best = { nd, d };
          }
        }
      }
      return best;
    };
    // V28: a lasso's free end has nothing foreign to join — it curled back to
    // its OWN line (the Belem Bastion shot: 106 mi around and dead 0.55 mi
    // from its outbound leg; 71 routes measured). The junction it implies is
    // with itself: nearest point on the route's own segments at least 8 mi
    // away along the arc, so an ordinary bend never "closes" onto itself.
    const nearestSelfSeg = (pts: Array<[number, number]>, fromHead: boolean): { x: number; y: number; d: number } | null => {
      const arcs: number[] = [0];
      let L = 0;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
        L += Math.abs(bx - ax) > cfg.circumFt / 2 ? 0 : Math.hypot(bx - ax, by - ay);
        arcs.push(L);
      }
      const [ex, ey] = fromHead ? pts[0]! : pts[pts.length - 1]!;
      let best: { x: number; y: number; d: number } | null = null;
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
        if (Math.abs(bx - ax) > cfg.circumFt / 2) continue;
        const midArc = (arcs[i - 1]! + arcs[i]!) / 2;
        if ((fromHead ? midArc : L - midArc) < 8 * MI) continue;
        const ddx = bx - ax, ddy = by - ay;
        const d2 = ddx * ddx + ddy * ddy;
        let t = d2 > 0 ? ((ex - ax) * ddx + (ey - ay) * ddy) / d2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const qx = ax + ddx * t, qy = ay + ddy * t;
        const d = Math.hypot(qx - ex, qy - ey);
        if (d <= JOIN_MAX && (!best || d < best.d)) best = { x: qx, y: qy, d };
      }
      return best;
    };
    const joinedEnd = new Set<string>(); // routeIndex:head — ends that landed
    const doorAt = new Set<string>();    // nodes an end already reaches (skip spur)
    routes.forEach((rt, ri) => {
      for (const head of [true, false]) {
        const pts = rt.pts;
        if (pts.length < 2) continue;
        const [ex, ey] = head ? pts[0]! : pts[pts.length - 1]!;
        const town = nearNode(ex, ey, TOWN_JOIN);
        if (town && town.d <= SNAP_MIN) { // already at a door
          joinedEnd.add(ri + ':' + head);
          doorAt.add(Math.round(town.nd.x) + ',' + Math.round(town.nd.y));
          continue;
        }
        if (town) {
          // parallelNearby is the only gate a second town entry needs: an
          // ANGLED extra approach into a busy city is what real maps show; a
          // PARALLEL walk alongside an existing entry is the #10b doubling
          if (dryLine(ex, ey, town.nd.x, town.nd.y) && !parallelNearby(ex, ey, town.nd.x, town.nd.y, ri)) {
            const p: [number, number] = [Math.round(town.nd.x), Math.round(town.nd.y)];
            if (head) pts.unshift(p); else pts.push(p);
            joinedEnd.add(ri + ':' + head);
            doorAt.add(p[0] + ',' + p[1]);
            continue;
          }
          // the walk would double an entry the town already has — a junction
          // onto the nearby line serves the same traveller, so fall through
        }
        const near = nearestSeg(ex, ey, ri, JOIN_MAX);
        if (near && near.d <= SNAP_MIN) { joinedEnd.add(ri + ':' + head); continue; } // already a junction
        if (near && dryLine(ex, ey, near.x, near.y) && !parallelNearby(ex, ey, near.x, near.y, ri)) {
          const p: [number, number] = [Math.round(near.x), Math.round(near.y)];
          if (head) pts.unshift(p); else pts.push(p);
          joinedEnd.add(ri + ':' + head);
          continue;
        }
        // nothing foreign to join — close a lasso onto its own line (V28)
        const self = nearestSelfSeg(pts, head);
        if (self && self.d > SNAP_MIN && dryLine(ex, ey, self.x, self.y) && !parallelNearby(ex, ey, self.x, self.y, ri)) {
          const p: [number, number] = [Math.round(self.x), Math.round(self.y)];
          if (head) pts.unshift(p); else pts.push(p);
          joinedEnd.add(ri + ':' + head);
        }
      }
    });
    // 3: the doorstep gap — a plan node the net misses by 0.4–3 mi (spurs use
    // the plan's own kind, so a village keeps its dirt)
    let lkN = 0;
    const spurred = new Set<string>();
    for (const p of plans) {
      const pends: Array<{ x: number; y: number }> = [{ x: p.a.x, y: p.a.y }];
      if (p.b.pop != null) pends.push({ x: p.b.x, y: p.b.y });
      for (const e of pends) {
        const key = Math.round(e.x) + ',' + Math.round(e.y);
        if (spurred.has(key) || doorAt.has(key)) continue;
        const near = nearestSeg(e.x, e.y, -1, TOWN_JOIN);
        if (!near || near.d <= SPUR_MIN) continue;
        if (!dryLine(e.x, e.y, near.x, near.y)) continue;
        if (parallelNearby(e.x, e.y, near.x, near.y, -1)) continue;
        spurred.add(key);
        routes.push({
          id: 'rt_genlk' + (lkN++).toString(36).padStart(4, '0'),
          kind: p.kind,
          pts: [[Math.round(e.x), Math.round(e.y)], [Math.round(near.x), Math.round(near.y)]],
        });
      }
    }
    // 4: orphan sweep — a short fragment whose ends BOTH landed nowhere and
    // whose whole course serves no settlement was offcut noise from the cuts
    // above. Long routes are spared: a trunk crossing empty country is honest.
    const orphan = (rt: RoadRoute, ri: number): boolean => {
      if (joinedEnd.has(ri + ':true') || joinedEnd.has(ri + ':false')) return false;
      let len = 0;
      for (let i = 1; i < rt.pts.length; i++) {
        const [ax, ay] = rt.pts[i - 1]!, [bx, by] = rt.pts[i]!;
        if (Math.abs(bx - ax) > cfg.circumFt / 2) continue;
        len += Math.hypot(bx - ax, by - ay);
      }
      if (len > 40 * MI) return false;
      for (const [x, y] of rt.pts) if (nearNode(x, y, 8 * MI)) return false;
      return true;
    };
    const keptR = routes.filter((rt, ri) => rt.id.startsWith('rt_genlk') || !orphan(rt, ri));
    if (keptR.length !== routes.length) { routes.length = 0; routes.push(...keptR); }
  }

  // Bridges: one per great-river hex the DRAWN network actually enters.
  // `builtCrossings` records the PLANNED cells, but sag, smoothing, and hugLand
  // all move the drawn line — it can clip a great-river hex the plan never
  // touched, leaving a visible crossing with no bridge (draw-vs-check, §10.3).
  // Deriving bridges from the same polylines the map draws makes "every drawn
  // crossing is bridged" true by construction. (The Earth bake replaces these
  // with polyline-exact bridgeCrossings() against its authored rivers.)
  const bridges: Array<[number, number]> = [];
  const bridgedHex = new Set<string>();
  for (const rt of routes) {
    if (rt.kind === 'dirt') continue; // a dirt track never bridges (batch 46)
    let prev: boolean | null = null;
    for (const [x, y] of rt.pts) {
      const k = worldKeyAt(x, y);
      const g = isGreatRiver(k);
      if (g && prev === false && !bridgedHex.has(k)) { bridgedHex.add(k); bridges.push([x, y]); }
      prev = g;
    }
  }

  return { routes, bridges };
}
