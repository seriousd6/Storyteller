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
export interface RoadRoute { id: string; kind: 'highway' | 'road' | 'dirt'; pts: Array<[number, number]> }
export interface Settlements { nodes: SettleNode[]; routes: RoadRoute[]; bridges: Array<[number, number]> }

export function generateSettlements(cfg: TerrainCfg, grid: HydroGrid): Settlements {
  const { octW, hexC, canon, land, riverOn, lakeSet, bandOf } = grid;
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
  const continents: string[][] = [];
  { const seen = new Set<string>(); for (const k of land.keys()) { if (seen.has(k)) continue; const cells = [k]; seen.add(k); for (let i = 0; i < cells.length; i++) { const [q, r] = cells[i]!.split(',').map(Number); for (const [dq, dr] of DIRS) { const nk = canon(q! + dq, r! + dr); if (land.has(nk) && !seen.has(nk)) { seen.add(nk); cells.push(nk); } } } if (cells.length >= 8) continents.push(cells); } }
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
  const cxy = (k: string): [number, number] => { const [q, r] = k.split(',').map(Number); return hexC(q!, r!); };
  const elevOf = new Map<string, number>();
  const elevAt = (k: string): number => { let e = elevOf.get(k); if (e === undefined) { const [x, y] = cxy(k); e = elevationAt(cfg, x, y, octW); elevOf.set(k, e); } return e; };
  const cellCost = (k: string): number => TERRAIN_COST[land.get(k)!] ?? 1.5;
  const isGreatRiver = (k: string): boolean => riverOn.has(k) && bandOf(k) >= 2;
  const wrapD = (ax: number, ay: number, bx: number, by: number): number => { let dx = Math.abs(ax - bx) % cfg.circumFt; if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx; return Math.hypot(dx, ay - by); };
  // continents (connected land components), for grouping nodes into networks
  const continents: string[][] = [];
  const contOf = new Map<string, number>();
  { const seen = new Set<string>(); for (const k of land.keys()) { if (seen.has(k)) continue; const cells = [k]; seen.add(k); for (let i = 0; i < cells.length; i++) { const [q, r] = cells[i]!.split(',').map(Number); for (const [dq, dr] of DIRS) { const nk = canon(q! + dq, r! + dr); if (land.has(nk) && !seen.has(nk)) { seen.add(nk); cells.push(nk); } } } if (cells.length >= 8) continents.push(cells); } }
  continents.forEach((cont, ci) => { for (const k of cont) contOf.set(k, ci); });

  // great-river hexes a nearby city could afford to bridge (roads concentrate
  // their few crossings there); crossings already built are shared by later roads.
  const bridgeableGR = new Set<string>();
  for (const k of riverOn) { if (!isGreatRiver(k)) continue; const [gx, gy] = cxy(k); if (nodes.some((n) => n.pop >= 10_000 && wrapD(gx, gy, n.x, n.y) < 55 * MI)) bridgeableGR.add(k); }
  const nearWaterRoad = (kk: string): boolean => { const [q, r] = kk.split(',').map(Number); return DIRS.some(([a, b]) => { const nn = canon(q! + a, r! + b); return riverOn.has(nn) || !land.has(nn) || lakeSet.has(nn); }); };
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
    for (let i = 1; i < pts.length - 1; i++) { const [x0, y0] = pts[i - 1]!, [x1, y1] = pts[i + 1]!; const off = (h32(`${Math.round(pts[i]![0])},${Math.round(pts[i]![1])}`, 17) / 4294967295 - 0.5) * 0.16; pts[i] = [pts[i]![0] - (y1 - y0) * off, pts[i]![1] + (x1 - x0) * off]; }
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
    // Adopt an adjacent component instead of dropping the node.
    const [q, r] = k.split(',').map(Number);
    for (const [dq, dr] of DIRS) {
      const nc = contOf.get(canon(q! + dq, r! + dr));
      if (nc !== undefined) return nc;
    }
    return -1;
  };
  for (let ci = 0; ci < continents.length; ci++) {
    const here = nodes.filter((n) => contIndexOf(n) === ci);
    const caps = here.filter((n) => n.tier === 'capital');
    if (caps.length > 1) {
      // precompute each capital pair's road ONCE (bestRoad = low vs forged), then
      // Prim's MST over the cache — the old all-pairs-every-step loop was O(n³).
      const pair = new Map<string, { cells: string[]; cost: number } | null>();
      const key = (i: number, j: number): string => (i < j ? `${i},${j}` : `${j},${i}`);
      const pathBetween = (i: number, j: number): { cells: string[]; cost: number } | null => {
        const kk = key(i, j); if (pair.has(kk)) return pair.get(kk)!;
        const p = bestRoad(nodeCell.get(caps[i]!)!, nodeCell.get(caps[j]!)!); pair.set(kk, p); return p;
      };
      const inNet = new Set<number>([0]);
      while (inNet.size < caps.length) {
        let best: { cells: string[]; cost: number } | null = null, bi = -1, bj = -1;
        for (let j = 0; j < caps.length; j++) { if (inNet.has(j)) continue; for (const i of inNet) { const p = pathBetween(i, j); if (p && (!best || p.cost < best.cost)) { best = p; bi = i; bj = j; } } }
        if (!best) break;
        addRoute('highway', best.cells, caps[bi]!, caps[bj]!); recordCrossings(best.cells);
        inNet.add(bj);
      }
    }
    // towns → nearest already-connected node by road; villages → dirt track,
    // but only if a neighbour is within reach (isolation rule)
    const connected = new Set<SettleNode>(caps);
    for (const n of here.filter((x) => x.tier === 'town').sort((a, b) => b.pop - a.pop)) {
      const targets = (connected.size > caps.length ? here.filter((t) => t !== n && connected.has(t)) : caps);
      let tgt: SettleNode | null = null, td = Infinity;
      for (const t of targets) { const d = wrapD(n.x, n.y, t.x, t.y); if (d < td) { td = d; tgt = t; } }
      // A landmass with no capital has no *connected* target at all, which left
      // whole clusters of towns roadless within sight of one another. Fall back
      // to the nearest settlement of any tier: a town joins whatever network
      // exists, even when that network is only its neighbour.
      if (!tgt) for (const t of here) { if (t === n) continue; const d = wrapD(n.x, n.y, t.x, t.y); if (d < td) { td = d; tgt = t; } }
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
  for (const p of plans) {
    const base = RANK_OF[p.kind];
    let run: string[] = [];
    let cur = -1;
    let first = true; // only the FIRST segment starts at the settlement itself
    for (const k of p.cells) {
      const r = rankAt(k, base);
      if (cur === -1) { cur = r; run = [k]; continue; }
      if (r === cur) { run.push(k); continue; }
      // rank changed: close the run, and re-use this cell as the next run's
      // first point so the two segments meet with no gap (the trick hydrology
      // uses at a band change)
      run.push(k);
      emit(KIND_AT[cur]!, run, first ? p.a : at(run[0]!), at(k));
      first = false;
      run = [k];
      cur = r;
    }
    // the last run carries on to the far settlement
    if (run.length) emit(KIND_AT[cur === -1 ? base : cur]!, run, first ? p.a : at(run[0]!), p.b);
  }

  // bridges: dedup the recorded great-river crossings (one bridge per crossing)
  const bridges: Array<[number, number]> = [];
  for (const c of builtCrossings) { if (!bridges.some((b) => wrapD(b[0], b[1], c[0], c[1]) < 6 * MI)) bridges.push(c); }

  return { routes, bridges };
}
