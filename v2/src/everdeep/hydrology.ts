// Hydrology — rivers and lakes for a world, generated from the terrain field.
// This is the browser-usable port of the river-tracing the Vessia bake does
// (continent-vessia.mjs): priority-flood drainage, rain accumulation, a stream→
// river→great→GRAND width ladder, meandered polylines, and deltas at the sea.
// A NEW world calls this at creation so it has rivers from the start (the bake
// only runs for the shipped example).

// uncarvedElevationAt, not elevationAt: rivers trace the field WITHOUT the
// valley carve they themselves produce (sculpt.ts recursion guard, L-1) —
// they still see [E] landform terms and user elevation paint.
import { biomeAt, uncarvedElevationAt, detailAt, octFor, runoffAt, type TerrainCfg } from './terrain.ts';
import { h32 } from './seeds.ts';
// The hex lattice comes from hexgrid.ts like everywhere else — this file used
// to keep its own eight-line copies of hexCenter/pointToHex/columnsPerWorld,
// the exact "copies are a trap" hexgrid's header warns about (§10.3 review).
import { hexCenter, hexR, pointToHex, columnsPerWorld } from './hexgrid.ts';

export interface RiverRoute { id: string; kind: 'river'; w: number; pts: Array<[number, number]> }
// The drainage grid, exposed so the settlement/road generator (settlements.ts)
// can reuse the priority-flood results instead of recomputing them (batch 69).
export interface HydroGrid {
  Rw: number; rMax: number; qPeriod: number; octW: number;
  hexC: (q: number, r: number) => [number, number];
  canon: (q: number, r: number) => string;
  worldKeyAt: (x: number, y: number) => string;
  land: Map<string, string>;      // 'q,r' → biome (land hexes only)
  riverOn: Set<string>;           // hexes carrying a river
  acc: Map<string, number>;       // drainage accumulation
  lakeSet: Set<string>;           // lake hexes
  bandOf: (k: string) => number;  // river width class 1–4
}
export interface Hydrology { routes: RiverRoute[]; lakePaint: Record<string, string>; grid: HydroGrid }

const WORLD_HEXFT = 316_800;
const WORLD_IDX = 2; // world tier's detail-bias salt (matches the bake's TIER.world.idx)
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const WATER = new Set(['deep', 'water']);
// Runoff per hex by biome. Validated against real Earth rivers (batch 67): the
// old near-flat weights let Antarctica and Siberia (big, cold, low-rain but
// large-area) out-accumulate the tropics, so the "grand" rivers came out in the
// ice while the Amazon/Congo/Mississippi were graded minor. Real precipitation is
// steeply latitude-banded, so the wet tropics now dominate and FROZEN ground
// (snow/ice caps) and deserts contribute ~nothing — polar caps hold glaciers, not
// rivers.
const RAIN: Record<string, number> = {
  jungle: 3.0, swamp: 2.4, forest: 1.3, mountain: 1.0, hills: 0.8, taiga: 0.4,
  grass: 0.5, beach: 0.4, savanna: 0.45, tundra: 0.08, snow: 0.02, desert: 0.04,
};
// the flow ladder (batch 59): more headwater streams, then width in tiers
const RIVER_MIN = 12;   // a stream begins (area-weighted runoff, batch 67)
const RIVER_ACC = 30;   // band-2 floor (area-weighted, batch 67)
const GREAT_ACC = 90;   // band-3 floor

class Heap<T> {
  private a: Array<[number, T]> = [];
  get size(): number { return this.a.length; }
  push(x: [number, T]): void {
    const a = this.a; a.push(x);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[p]![0] <= a[i]![0]) break;
      [a[p], a[i]] = [a[i]!, a[p]!]; i = p;
    }
  }
  pop(): [number, T] | undefined {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length && last) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m]!, a[i]!]; i = m;
      }
    }
    return top;
  }
}

export function generateHydrology(cfg: TerrainCfg, opts: { forcedWater?: string[] } = {}): Hydrology {
  // forcedWater: world-hex keys 'q,r' the user painted as water — treated as sea
  // sinks so a re-trace routes rivers into them (batch 73, regeneration on edit).
  const forced = new Set(opts.forcedWater ?? []);
  const Rw = hexR(WORLD_HEXFT);
  const rMax = Math.floor((cfg.heightFt / 2) / (1.5 * Rw)) - 1;
  // NB: 417 columns for Earth, but 132,000,000 ft is 416.67 hex widths — the
  // lattice fold and the terrain field's x-period CANNOT agree on a cylinder
  // whose circumference isn't a hex-width multiple (§10.3). Every consumer
  // folds through this same columnsPerWorld, so at least they all disagree with
  // the terrain identically, and the mismatch is confined to the seam column
  // (Earth's antimeridian — open Pacific).
  const qPeriod = columnsPerWorld(WORLD_HEXFT, cfg.circumFt);
  const octW = octFor(WORLD_HEXFT);
  const hexC = (q: number, r: number): [number, number] => hexCenter(WORLD_HEXFT, q, r);
  const canon = (q: number, r: number): string => {
    const base = -Math.round(r / 2);
    const i = ((q - base) % qPeriod + qPeriod) % qPeriod;
    return (base + i) + ',' + r;
  };
  const hexBiome = (q: number, r: number): string => {
    const [cx, cy] = hexC(q, r);
    const d = detailAt(cfg, cx, cy, WORLD_HEXFT, WORLD_IDX);
    return biomeAt(cfg, cx, cy, octW, (d - 0.5) * 0.055);
  };
  // ONE elevation surface for the whole pass (§10.3): land membership comes
  // from the detail-BIASED biome above — the same bias the map paints at the
  // world tier — so the drainage fill, lake detection, and shore tests must
  // read that same biased surface. Reading RAW elevation here meant hexes near
  // the 0.5 waterline flipped between "land the rivers cross" and "sea the
  // rivers drain to" depending on which code was asking.
  const elevHexAt = (x: number, y: number): number =>
    uncarvedElevationAt(cfg, x, y, octW) + (detailAt(cfg, x, y, WORLD_HEXFT, WORLD_IDX) - 0.5) * 0.055;
  const elevOf = new Map<string, number>();
  const elevAt = (k: string): number => {
    let e = elevOf.get(k);
    if (e === undefined) { const [q, r] = k.split(',').map(Number); const [x, y] = hexC(q!, r!); e = elevHexAt(x, y); elevOf.set(k, e); }
    return e;
  };

  // ---- land grid ----
  const land = new Map<string, string>();
  for (let r = -rMax; r <= rMax; r++) {
    const qBase = -Math.round(r / 2);
    for (let i = 0; i < qPeriod; i++) {
      const q = qBase + i;
      const b = hexBiome(q, r);
      if (!WATER.has(b) && !forced.has(q + ',' + r)) land.set(q + ',' + r, b);
    }
  }

  // ---- priority-flood drainage: every hex drains to the sea, pits fill ----
  const flowTo = new Map<string, string>();
  const fillOrder: string[] = [];
  {
    const heap = new Heap<[string, string]>();
    for (const k of land.keys()) {
      const [q, r] = k.split(',').map(Number);
      let seaK: string | null = null, seaE = Infinity;
      for (const [dq, dr] of DIRS) {
        const nk = canon(q! + dq, r! + dr);
        if (land.has(nk)) continue;
        const [nx, ny] = hexC(...(nk.split(',').map(Number) as [number, number]));
        const ne = elevHexAt(nx, ny);
        if (ne < seaE) { seaE = ne; seaK = nk; }
      }
      if (seaK) heap.push([elevAt(k), [k, seaK]]);
    }
    while (heap.size) {
      const [fe, [k, down]] = heap.pop()!;
      if (flowTo.has(k)) continue;
      flowTo.set(k, down);
      fillOrder.push(k);
      const [q, r] = k.split(',').map(Number);
      for (const [dq, dr] of DIRS) {
        const nk = canon(q! + dq, r! + dr);
        if (!land.has(nk) || flowTo.has(nk)) continue;
        heap.push([Math.max(elevAt(nk), fe), [nk, k]]);
      }
    }
  }

  // ---- lakes: depressions filled meaningfully above their floor ----
  const lakePaint: Record<string, string> = {};
  const lakeSet = new Set<string>();
  {
    const filled = new Map<string, number>();
    for (const k of fillOrder) {
      const d = flowTo.get(k);
      const base = d && filled.has(d) ? filled.get(d)! : 0;
      filled.set(k, Math.max(elevAt(k), base));
    }
    for (const k of fillOrder) {
      if ((filled.get(k) ?? 0) - elevAt(k) > 0.02) { lakePaint['world:' + k] = 'water'; lakeSet.add(k); }
    }
    // user-painted water reads as lake water too, so rivers clip/terminate at it
    for (const k of forced) lakeSet.add(k);
  }

  // ---- per-hex runoff ----
  // Runoff is weighted by REAL area (batch 67): the world grid is equirectangular,
  // so a polar hex covers far less ground than an equatorial one yet counts the
  // same — which inflated the big high-latitude basins. cos(latitude) restores
  // fair areas. The RATE per unit area (batch 68): for an earthlike/real-Earth
  // world it's the actual precipitation field (Hadley bands, rain shadows, coast
  // asymmetry, frozen→0); noise worlds keep the per-biome table.
  const HALF_H = cfg.heightFt / 2;
  const useMoisture = cfg.climateModel === 'earthlike' || cfg.landform === 'earth';
  const rainOf = (k: string): number => {
    if (!useMoisture) return RAIN[land.get(k)!] ?? 1;
    const [q, r] = k.split(',').map(Number);
    const [x, y] = hexC(q!, r!);
    return Math.max(0.02, runoffAt(cfg, x, y, octW) * 2.4); // scale to the old table's range
  };
  const areaW = (k: string): number => {
    const r = Number(k.slice(k.indexOf(',') + 1));
    const y = 1.5 * Rw * r;
    return Math.max(0.05, Math.cos(Math.min(1, Math.abs(y) / HALF_H) * (Math.PI / 2)));
  };
  const rainW = new Map<string, number>();
  for (const k of land.keys()) rainW.set(k, rainOf(k) * areaW(k));

  // ---- endorheic sink pass (batch 68) ----
  // The priority-flood drains every hex to the sea, but real ARID closed basins
  // don't overflow — inflow evaporates, leaving a terminal salt lake / inland sea
  // (the Caspian, the Aral, Lake Chad, the Great Basin). A filled depression whose
  // surroundings are dry is marked endorheic; accumulation stops there (rivers end
  // AT the lake instead of spilling on to the ocean, so the Volga dies in the
  // Caspian). Wet basins still overflow normally (the Great Lakes → the St Lawrence).
  const endorheic = new Set<string>();
  {
    const seen = new Set<string>();
    for (const start of lakeSet) {
      if (seen.has(start)) continue;
      const cell: string[] = [start]; seen.add(start);
      for (let i = 0; i < cell.length; i++) {
        const [q, r] = cell[i]!.split(',').map(Number);
        for (const [dq, dr] of DIRS) { const nk = canon(q! + dq, r! + dr); if (lakeSet.has(nk) && !seen.has(nk)) { seen.add(nk); cell.push(nk); } }
      }
      // aridity = mean runoff rate around the basin (its own hexes + land rim)
      let sum = 0, n = 0;
      for (const k of cell) {
        const [q, r] = k.split(',').map(Number);
        const [x, y] = hexC(q!, r!);
        sum += useMoisture ? runoffAt(cfg, x, y, octW) : ((RAIN[land.get(k)!] ?? 0.5) / 2.4); n++;
      }
      const aridity = n ? sum / n : 1;
      // dry basin (little inflow to sustain an outlet) → terminal inland sink
      if (aridity < 0.30) for (const k of cell) endorheic.add(k);
    }
  }

  // ---- accumulation down the drainage tree (stops at endorheic sinks) ----
  const acc = new Map<string, number>();
  for (let i = fillOrder.length - 1; i >= 0; i--) {
    const k = fillOrder[i]!;
    const a = (acc.get(k) ?? 0) + (rainW.get(k) ?? 0);
    acc.set(k, a);
    if (endorheic.has(k)) continue; // a terminal sink absorbs its inflow, no overflow
    const d = flowTo.get(k);
    if (d && land.has(d)) acc.set(d, (acc.get(d) ?? 0) + a);
  }
  const riverOn = new Set([...acc.entries()].filter(([, a]) => a >= RIVER_MIN).map(([k]) => k));
  // Width tiers are DATA-DRIVEN (batch 67). Absolute accumulation depends on world
  // size and grid resolution, so fixed cutoffs mis-grade: validated against real
  // Earth, the old constants graded the Amazon as a mid-size river and produced
  // NO grand rivers at all (GRAND_ACC=2500 was never reached on the world grid).
  // Instead, rank the river hexes by accumulation and cut by PERCENTILE, so the
  // largest drainage on any world is always "grand." Small absolute floors keep a
  // tiny world from crowning a creek.
  const accSorted = [...riverOn].map((k) => acc.get(k) ?? 0).sort((a, b) => a - b);
  const pctile = (p: number): number => (accSorted.length ? accSorted[Math.min(accSorted.length - 1, Math.floor(p * accSorted.length))]! : Infinity);
  const T_RIVER = Math.max(RIVER_ACC, pctile(0.50)); // band 2 — a proper river
  const T_GREAT = Math.max(GREAT_ACC, pctile(0.93)); // band 3 — a great river
  const T_GRAND = Math.max(GREAT_ACC * 3, pctile(0.990)); // band 4 — a grand river (Amazon/Nile scale)
  const bandOf = (k: string): number => { const a = acc.get(k) ?? 0; return a >= T_GRAND ? 4 : a >= T_GREAT ? 3 : a >= T_RIVER ? 2 : 1; };

  // ---- stems: mouth → source along the biggest inflow, tributaries after ----
  const inflows = new Map<string, string[]>();
  for (const k of riverOn) { const d = flowTo.get(k); if (d && riverOn.has(d)) inflows.set(d, [...(inflows.get(d) ?? []), k]); }
  const stems: string[][] = [];
  const visited = new Set<string>();
  const mouths = [...riverOn].filter((k) => { const d = flowTo.get(k); return !d || !riverOn.has(d); });
  for (const mouth of mouths.sort((a, b) => (acc.get(b) ?? 0) - (acc.get(a) ?? 0))) {
    const path: string[] = [];
    let cur: string | undefined = mouth;
    while (cur && riverOn.has(cur) && !visited.has(cur)) {
      path.push(cur); visited.add(cur);
      const ups: string[] = (inflows.get(cur) ?? []).filter((u: string) => !visited.has(u));
      cur = ups.sort((a: string, b: string) => (acc.get(b) ?? 0) - (acc.get(a) ?? 0))[0];
    }
    if (path.length >= 3) {
      path.reverse(); // source → mouth
      // extend to the true water's edge
      const isWaterK = (k2: string): boolean => { if (lakeSet.has(k2)) return true; const [q, r] = k2.split(',').map(Number); const [x, y] = hexC(q!, r!); return elevHexAt(x, y) < 0.5; };
      let c2 = mouth, guard = 0; const seen = new Set([mouth]);
      while (guard++ < 20) {
        const [cq, cr] = c2.split(',').map(Number);
        let nxt: string | null | undefined = flowTo.get(c2);
        if (!nxt || seen.has(nxt)) {
          let lo: string | null = null, loE = Infinity;
          for (const [dq, dr] of DIRS) { const nk = canon(cq! + dq, cr! + dr); if (seen.has(nk)) continue; const [x, y] = hexC(...(nk.split(',').map(Number) as [number, number])); const e2 = elevHexAt(x, y); if (e2 < loE) { loE = e2; lo = nk; } }
          nxt = lo;
        }
        if (!nxt) break;
        seen.add(nxt); path.push(nxt);
        // Respect the shared `visited` like every other walk here. Accumulation
        // flicker near RIVER_MIN can declare two mouths on ONE physical river,
        // and flowTo is deterministic per hex — so without this the second
        // mouth retraces the first's course and the map draws the same channel
        // twice side by side, each with its own meander jitter. Claim the hex
        // first so the two stems share it and visibly JOIN, then stop.
        if (visited.has(nxt)) break;
        visited.add(nxt);
        if (isWaterK(nxt)) break;
        c2 = nxt;
      }
      stems.push(path);
    }
  }
  for (const k of [...riverOn].sort((a, b) => elevAt(b) - elevAt(a))) {
    if (visited.has(k)) continue;
    const path = [k]; visited.add(k);
    let cur = flowTo.get(k);
    while (cur && riverOn.has(cur)) { path.push(cur); if (visited.has(cur)) break; visited.add(cur); cur = flowTo.get(cur); }
    if (path.length >= 3) stems.push(path);
  }

  // ---- meander + emit polylines + deltas ----
  const routes: RiverRoute[] = [];
  let rivN = 0;
  const cxy = (k: string): [number, number] => { const [q, r] = k.split(',').map(Number); return hexC(q!, r!); };
  const worldKeyAt = (x: number, y: number): string => {
    const [q, r] = pointToHex(WORLD_HEXFT, x, y);
    return canon(q, r);
  };
  const ptWater = (x: number, y: number): boolean => lakeSet.has(worldKeyAt(x, y)) || uncarvedElevationAt(cfg, x, y, octW) < 0.5;
  const meander = (pts: Array<[number, number]>, salt: string): Array<[number, number]> => {
    let cur = pts;
    for (let lvl = 0; lvl < 3; lvl++) {
      const next: Array<[number, number]> = [cur[0]!];
      for (let i = 0; i < cur.length - 1; i++) {
        const [x0, y0] = cur[i]!, [x1, y1] = cur[i + 1]!;
        const off = (h32(salt + ':' + lvl + ':' + i, 9) / 4294967295 - 0.5) * (lvl === 0 ? 0.2 : 0.22);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        let px = mx - (y1 - y0) * off, py = my + (x1 - x0) * off;
        if (uncarvedElevationAt(cfg, px, py, octW) > uncarvedElevationAt(cfg, mx, my, octW) + 0.012) { px = mx * 0.6 + px * 0.4; py = my * 0.6 + py * 0.4; }
        next.push([px, py], [x1, y1]);
      }
      cur = next;
    }
    return cur.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]);
  };
  const clipToShore = (pts: Array<[number, number]>): Array<[number, number]> => {
    let lastLand = -1;
    for (let i = 0; i < pts.length; i++) if (!ptWater(pts[i]![0], pts[i]![1])) lastLand = i;
    if (lastLand < 0 || lastLand >= pts.length - 1) return pts;
    return pts.slice(0, lastLand + 2);
  };
  const flush = (seg: Array<[number, number]>, w: number): void => {
    if (seg.length >= 2) { const pts = clipToShore(meander(seg, 'rv' + rivN)); if (pts.length >= 2) routes.push({ id: 'rt_genriv' + (rivN++).toString(36).padStart(3, '0'), kind: 'river', w, pts }); }
  };
  const emit = (keys: string[], w: number): void => {
    if (keys.length < 2) return;
    let seg: Array<[number, number]> = [];
    for (const key of keys) {
      if (lakeSet.has(key)) { flush(seg, w); seg = []; continue; }
      const pt = cxy(key);
      if (seg.length && Math.abs(pt[0] - seg[seg.length - 1]![0]) > cfg.circumFt / 2) { flush(seg, w); seg = []; }
      seg.push(pt);
    }
    flush(seg, w);
  };
  for (const stem of stems) {
    let run = [stem[0]!], w = bandOf(stem[0]!);
    for (let i = 1; i < stem.length; i++) {
      const k = stem[i]!;
      const wk = riverOn.has(k) ? bandOf(k) : w;
      if (wk === w) { run.push(k); continue; }
      run.push(k); emit(run, w); run = [k]; w = wk;
    }
    emit(run, w);
  }
  // deltas at great/grand river sea-mouths
  const isWaterHex = (k: string): boolean => !land.has(k) || lakeSet.has(k);
  for (const stem of stems) {
    const mouthK = stem[stem.length - 1]!;
    if (lakeSet.has(mouthK) || land.has(mouthK)) continue;
    let lastLand: string | null = null;
    for (let i = stem.length - 1; i >= 0; i--) { if (land.has(stem[i]!) && !lakeSet.has(stem[i]!)) { lastLand = stem[i]!; break; } }
    if (!lastLand) continue;
    const band = bandOf(lastLand);
    if (band < 3) continue;
    const [lq, lr] = lastLand.split(',').map(Number);
    const [lx, ly] = cxy(lastLand);
    let bx = 0, by = 0, nw = 0;
    for (const [dq, dr] of DIRS) {
      const nk = canon(lq! + dq, lr! + dr);
      if (!isWaterHex(nk) || lakeSet.has(nk)) continue;
      const [wx, wy] = cxy(nk);
      // canon() folds the neighbour's q into one world, so at the wrap seam
      // wx-lx comes back as ±a whole circumference and the delta would fan the
      // wrong way across the entire map — reduce it mod the world width (§10.3)
      let dxw = wx - lx;
      if (dxw > cfg.circumFt / 2) dxw -= cfg.circumFt;
      else if (dxw < -cfg.circumFt / 2) dxw += cfg.circumFt;
      bx += dxw; by += wy - ly; nw++;
    }
    if (!nw) continue;
    const bl = Math.hypot(bx, by) || 1; bx /= bl; by /= bl;
    const nD = band >= 4 ? 3 : 2;
    for (let d = 0; d < nD; d++) {
      const ang = (d - (nD - 1) / 2) * 0.6;
      const dx = bx * Math.cos(ang) - by * Math.sin(ang);
      const dy = bx * Math.sin(ang) + by * Math.cos(ang);
      const seg: Array<[number, number]> = [[lx, ly], [lx + dx * WORLD_HEXFT * 0.9, ly + dy * WORLD_HEXFT * 0.9], [lx + dx * WORLD_HEXFT * 1.7, ly + dy * WORLD_HEXFT * 1.7]];
      const pts = meander(seg, 'delta' + rivN);
      if (pts.length >= 2) routes.push({ id: 'rt_genriv' + (rivN++).toString(36).padStart(3, '0'), kind: 'river', w: Math.max(2, band - 1), pts });
    }
  }

  // the same mouth discipline Earth gets (V30): a noise world's delta arms are
  // fanned from world-hex geometry too, and its fine coast also disagrees with
  // the world octave in the shallows
  const cut = clipRiverMouthsToCoast(cfg, routes, cfg.circumFt);

  return {
    routes: cut.routes, lakePaint,
    grid: { Rw, rMax, qPeriod, octW, hexC, canon, worldKeyAt, land, riverOn, acc, lakeSet, bandOf },
  };
}

/**
 * A grid whose river network reflects AUTHORED river polylines instead of the
 * traced ones.
 *
 * The road pass detects a great river ONLY through `riverOn`/`bandOf`. So a
 * world that DRAWS authored rivers — Earth's real Nile/Amazon courses, which the
 * coarse world-hex drainage can't resolve — must feed them back into the grid,
 * or roads get planned against a network nobody can see: they bridge phantom
 * crossings out in dry country and ford the real rivers unbridged.
 *
 * Traced hexes below `replaceFrom` are kept (those small rivers are still drawn
 * as texture); the authored courses are stamped over everything at or above it.
 */
export function withAuthoredRivers(
  grid: HydroGrid,
  authored: Array<{ w?: number; pts: Array<[number, number]> }>,
  replaceFrom = 3,
): HydroGrid {
  const band = new Map<string, number>();
  for (const k of grid.riverOn) {
    const b = grid.bandOf(k);
    if (b < replaceFrom) band.set(k, b);
  }
  for (const rt of authored) {
    const w = rt.w ?? replaceFrom;
    if (w < replaceFrom) continue;
    for (let i = 1; i < rt.pts.length; i++) {
      const [x0, y0] = rt.pts[i - 1]!, [x1, y1] = rt.pts[i]!;
      // walk in half-hex steps so no hex between two vertices is skipped
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (WORLD_HEXFT / 2)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const k = grid.worldKeyAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        band.set(k, Math.max(band.get(k) ?? 0, w));
      }
    }
  }
  return { ...grid, riverOn: new Set(band.keys()), bandOf: (k: string): number => band.get(k) ?? 1 };
}

/** Where segments AB and CD cross, as their two parameters, or null. */
function segCross(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): [number, number] | null {
  const rx = bx - ax, ry = by - ay, sx = dx - cx, sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (den === 0) return null; // parallel or degenerate
  const t = ((cx - ax) * sy - (cy - ay) * sx) / den;
  const u = ((cx - ax) * ry - (cy - ay) * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return [t, u];
}

/**
 * A tributary JOINS a bigger river. It does not cross it and escape out the
 * far side (owner, item #25).
 *
 * Why this happens at all: the Earth bake keeps the TRACED band-≤2 rivers for
 * texture and drops the traced band-≥3 trunks in favour of the great rivers
 * AUTHORED on their real courses. But those tributaries were traced against the
 * original drainage, whose trunks ran somewhere else entirely — so they still
 * flow to where the old trunk was, and the new one is just scenery they pass
 * through. Measured on the shipped fixture: 44 crossing pairs, every one of
 * them authored-trunk × traced-tributary, ZERO between two rivers of the same
 * width class. The traced network alone is fine; it is the transplant that
 * isn't.
 *
 * The same displacement is why 374/490 traced rivers dead-end on dry land
 * (item #7a): each one stops where its deleted band-≥3 continuation used to
 * begin. Truncating a tributary at its first crossing fixes both symptoms with
 * one cut, because that crossing IS the confluence — the tributary now ENDS at
 * the trunk instead of straddling it, which is exactly where a tributary should
 * end.
 *
 * Rivers run source→mouth (the tracer's order, and the bake's), so "first" here
 * means first going downstream.
 */
export function joinTributaries<T extends { id: string; kind?: string; w?: number; pts: Array<[number, number]> }>(
  routes: readonly T[],
  circumFt: number,
  minKeepFt = 31_680, // a stub shorter than a region hex is not a river
): { routes: T[]; trimmed: number; dropped: number } {
  const C = circumFt;
  const G = 316_800; // world-hex buckets
  const norm = (x: number): number => ((x % C) + C) % C;
  type Seg = { id: string; w: number; ax: number; ay: number; bx: number; by: number };

  const buckets = new Map<string, Seg[]>();
  for (const r of routes) {
    if (r.kind !== 'river') continue;
    const w = r.w ?? 2;
    for (let i = 1; i < r.pts.length; i++) {
      const ax = norm(r.pts[i - 1]![0]), ay = r.pts[i - 1]![1];
      const bx = norm(r.pts[i]![0]), by = r.pts[i]![1];
      if (Math.abs(bx - ax) > C / 2) continue; // a seam hop is not a real segment
      const seg: Seg = { id: r.id, w, ax, ay, bx, by };
      const x0 = Math.floor(Math.min(ax, bx) / G), x1 = Math.floor(Math.max(ax, bx) / G);
      const y0 = Math.floor(Math.min(ay, by) / G), y1 = Math.floor(Math.max(ay, by) / G);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const k = gx + ',' + gy;
        const arr = buckets.get(k);
        if (arr) arr.push(seg); else buckets.set(k, [seg]);
      }
    }
  }

  const out: T[] = [];
  let trimmed = 0, dropped = 0;
  for (const r of routes) {
    if (r.kind !== 'river') { out.push(r); continue; }
    const w = r.w ?? 2;
    let cutAt: { i: number; t: number; x: number; y: number } | null = null;
    for (let i = 1; i < r.pts.length && !cutAt; i++) {
      const ax = norm(r.pts[i - 1]![0]), ay = r.pts[i - 1]![1];
      const bx = norm(r.pts[i]![0]), by = r.pts[i]![1];
      if (Math.abs(bx - ax) > C / 2) continue;
      const gx0 = Math.floor(Math.min(ax, bx) / G), gx1 = Math.floor(Math.max(ax, bx) / G);
      const gy0 = Math.floor(Math.min(ay, by) / G), gy1 = Math.floor(Math.max(ay, by) / G);
      let bestT = Infinity, bx2 = 0, by2 = 0;
      for (let gx = gx0; gx <= gx1; gx++) for (let gy = gy0; gy <= gy1; gy++) {
        for (const s of buckets.get(gx + ',' + gy) ?? []) {
          // a BIGGER river stops it; at EQUAL width exactly one of the pair
          // yields (id order breaks the tie), so two same-band rivers — e.g.
          // two arms of one delta that meander into each other — still JOIN
          // instead of passing through, and never truncate each other both.
          if (s.id === r.id || s.w < w || (s.w === w && s.id > r.id)) continue;
          const hit = segCross(ax, ay, bx, by, s.ax, s.ay, s.bx, s.by);
          // t must be past the very start: a tributary that begins ON the trunk
          // is already joined, and cutting at t=0 would erase it
          if (hit && hit[0] > 1e-6 && hit[0] < bestT) {
            bestT = hit[0];
            bx2 = ax + (bx - ax) * hit[0];
            by2 = ay + (by - ay) * hit[0];
          }
        }
      }
      if (bestT < Infinity) cutAt = { i, t: bestT, x: bx2, y: by2 };
    }
    if (!cutAt) { out.push(r); continue; }
    // keep everything upstream of the confluence, and end exactly ON the trunk
    const pts = r.pts.slice(0, cutAt.i);
    pts.push([Math.round(cutAt.x), Math.round(cutAt.y)]);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    if (pts.length < 2 || len < minKeepFt) { dropped++; continue; } // a stub, not a river
    out.push({ ...r, pts });
    trimmed++;
  }
  return { routes: out, trimmed, dropped };
}

/**
 * Finish the rivers the route EMITTER abandoned mid-land (audit V9: 86 of 481
 * rivers on the shipped Earth dead-ended on dry ground). The drainage GRID is
 * never wrong about where the water goes — measured on those 86 mouths, 64 sat
 * on a hex the grid itself marks riverOn. The emitter loses them three ways:
 *   - emit() flushes a segment BEFORE a lake hex, so a river stops a full
 *     60mi world hex short of the lake it feeds;
 *   - riverOn flickers off near RIVER_MIN mid-course (the detail bias), so a
 *     course is emitted as two routes with a gap — the upstream half "stops
 *     in a forest";
 *   - a band-≤2 run ends where its band-≥3 continuation began, and Earth
 *     DROPS the traced band-≥3 trunks for the authored real courses.
 *
 * So: walk each dead mouth DOWNSTREAM on the grid itself — hex by hex to the
 * riverOn neighbour with the larger accumulation (accumulation grows
 * downstream; this is the flow direction without needing flowTo) — until the
 * walk enters water (append the water hex: the river now visibly REACHES its
 * lake), or lands on a hex another kept route runs through (append it: the
 * flicker gap closes at a confluence), or genuinely has nowhere to go (leave
 * the stub — a stream petering out beats invented geometry). The appended tail
 * is meandered exactly like every traced river, and joinTributaries still cuts
 * it at the first authored trunk it crosses.
 *
 * Pure geometry off the drainage grid — deterministic, no invention.
 */
/**
 * Clip every river's MOUTH at the coast the map actually draws (audit round 3,
 * V30): 149 of the fixture's 481 rivers ran >4 mi past the shore through open
 * water — the Congo sailed ~44 mi into the Atlantic, two Hudson Bay delta arms
 * ~90 mi across the bay, one Baikal course 189 mi along the lake.
 *
 * Root cause is a coarse-vs-fine disagreement: every generation-time water
 * test above (drainage grid, tail walk, delta fan) reads the WORLD-octave
 * field, while the drawn coastline comes from `biomeAt` at fine octaves (and,
 * on Earth, the Natural-Earth coast mask). Where the two disagree the course
 * keeps "walking on land" by its own lights and the map draws it in open sea.
 * The delta fan is the worst offender by construction — arms run 0.9–1.7
 * WORLD HEXES (54–102 mi) from the last land hex toward open water.
 *
 * So: one rule at the end of assembly, judged by the DRAW-side oracle. Walk
 * each course from its mouth (courses run source→mouth); find the trailing
 * run of fine-water points; bisect the land→water crossing; keep ~2.5 mi of
 * course past it so the mouth still visibly meets the sea, and drop a route
 * that never touches dry land at all (a delta arm whose "land" hex centre was
 * really sea). The source end and any mid-course lake crossing are untouched —
 * only the trailing run is judged. Deterministic, draw-only in spirit: bridges
 * and travel read the hex grid, never these polylines' tails.
 */
export function clipRiverMouthsToCoast(
  cfg: TerrainCfg,
  routes: RiverRoute[],
  circumFt: number,
): { routes: RiverRoute[]; clipped: number; dropped: number } {
  const KEEP_FT = 13_200; // ~2.5 mi of honest estuary
  const OCT = 6;          // the region-tier read the map draws coasts with
  const wet = (x: number, y: number): boolean => WATER.has(biomeAt(cfg, x, y, OCT));
  const out: RiverRoute[] = [];
  let clipped = 0, dropped = 0;
  for (const r of routes) {
    const pts = r.pts;
    if (pts.length < 2 || !wet(pts[pts.length - 1]![0], pts[pts.length - 1]![1])) { out.push(r); continue; }
    // last DRY vertex, scanning from the mouth inward
    let iDry = -1;
    for (let i = pts.length - 2; i >= 0; i--) {
      if (!wet(pts[i]![0], pts[i]![1])) { iDry = i; break; }
    }
    if (iDry < 0) { dropped++; continue; } // never touches land — fan noise
    // arc of the trailing wet run; a short honest mouth stays as it is
    let wetArc = 0;
    for (let i = iDry + 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1]!, [bx, by] = pts[i]!;
      if (Math.abs(bx - ax) > circumFt / 2) continue;
      wetArc += Math.hypot(bx - ax, by - ay);
    }
    if (wetArc <= KEEP_FT * 1.5) { out.push(r); continue; }
    // bisect the coast crossing on the dry→wet segment
    let [dx0, dy0] = pts[iDry]!;
    let [wx1, wy1] = pts[iDry + 1]!;
    for (let it = 0; it < 7; it++) {
      const mx = (dx0 + wx1) / 2, my = (dy0 + wy1) / 2;
      if (wet(mx, my)) { wx1 = mx; wy1 = my; } else { dx0 = mx; dy0 = my; }
    }
    // keep the course to the crossing, then follow the OLD course KEEP_FT out
    const kept: Array<[number, number]> = pts.slice(0, iDry + 1).map((p) => [p[0], p[1]]);
    kept.push([Math.round(wx1), Math.round(wy1)]);
    let left = KEEP_FT;
    let px = wx1, py = wy1;
    for (let i = iDry + 1; i < pts.length && left > 0; i++) {
      const [bx, by] = pts[i]!;
      const seg = Math.hypot(bx - px, by - py);
      if (seg <= 0) continue;
      if (seg >= left) {
        kept.push([Math.round(px + ((bx - px) / seg) * left), Math.round(py + ((by - py) / seg) * left)]);
        left = 0;
      } else {
        kept.push([Math.round(bx), Math.round(by)]);
        left -= seg;
        px = bx; py = by;
      }
    }
    if (kept.length < 2) { dropped++; continue; }
    out.push({ ...r, pts: kept });
    clipped++;
  }
  return { routes: out, clipped, dropped };
}

export function extendTransplantTails(
  cfg: TerrainCfg,
  grid: HydroGrid,
  kept: RiverRoute[],
  circumFt: number,
): { routes: RiverRoute[]; extended: number; remaining: number } {
  const C = circumFt;
  const G = 316_800;
  const norm = (x: number): number => ((x % C) + C) % C;
  const isWaterPt = (x: number, y: number): boolean =>
    grid.lakeSet.has(grid.worldKeyAt(x, y)) || uncarvedElevationAt(cfg, x, y, grid.octW) < 0.5;
  const hexIsWater = (k: string): boolean => {
    if (grid.lakeSet.has(k)) return true;
    const [q, r] = k.split(',').map(Number);
    const [x, y] = grid.hexC(q!, r!);
    return uncarvedElevationAt(cfg, x, y, grid.octW) < 0.5;
  };
  const mouthInWater = (pts: Array<[number, number]>): boolean => {
    const [px, py] = pts[pts.length - 1]!;
    const [qx, qy] = pts[Math.max(0, pts.length - 2)]!;
    const L = Math.hypot(px - qx, py - qy) || 1;
    // probe a little AHEAD too — a mouth a hair short of the coast still reads
    // as reaching the sea, and extending it would double-draw the shoreline
    for (const ft of [0, 8_000, 16_000, 32_000]) {
      if (isWaterPt(px + ((px - qx) / L) * ft, py + ((py - qy) / L) * ft)) return true;
    }
    return false;
  };
  // the same meander the emitter applies, so a tail is indistinguishable from
  // a traced course (midpoint displacement, uphill pull-back, endpoints kept)
  const octW = grid.octW;
  const meander = (pts: Array<[number, number]>, salt: string): Array<[number, number]> => {
    let cur = pts;
    for (let lvl = 0; lvl < 3; lvl++) {
      const next: Array<[number, number]> = [cur[0]!];
      for (let i = 0; i < cur.length - 1; i++) {
        const [x0, y0] = cur[i]!, [x1, y1] = cur[i + 1]!;
        const off = (h32(salt + ':' + lvl + ':' + i, 9) / 4294967295 - 0.5) * (lvl === 0 ? 0.2 : 0.22);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        let px = mx - (y1 - y0) * off, py = my + (x1 - x0) * off;
        if (uncarvedElevationAt(cfg, px, py, octW) > uncarvedElevationAt(cfg, mx, my, octW) + 0.012) { px = mx * 0.6 + px * 0.4; py = my * 0.6 + py * 0.4; }
        next.push([px, py], [x1, y1]);
      }
      cur = next;
    }
    return cur.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]);
  };

  // hex → kept route that runs through it (vertices are dense enough: emitted
  // courses keep every hex centre as a vertex, meander only inserts midpoints)
  const keptHexOf = new Map<string, number>();
  kept.forEach((r, ri) => {
    for (const [x, y] of r.pts) {
      const k = grid.worldKeyAt(norm(x), y);
      if (!keptHexOf.has(k)) keptHexOf.set(k, ri);
    }
  });
  // nearest-kept-segment check, for "the mouth already touches a river"
  interface Seg { ri: number; ax: number; ay: number; bx: number; by: number }
  const buckets = new Map<string, Seg[]>();
  kept.forEach((r, ri) => {
    for (let i = 1; i < r.pts.length; i++) {
      const ax = norm(r.pts[i - 1]![0]), ay = r.pts[i - 1]![1];
      const bx = norm(r.pts[i]![0]), by = r.pts[i]![1];
      if (Math.abs(bx - ax) > C / 2) continue; // seam hop (mid-Pacific; no land there)
      const s: Seg = { ri, ax, ay, bx, by };
      const x0 = Math.floor(Math.min(ax, bx) / G), x1 = Math.floor(Math.max(ax, bx) / G);
      const y0 = Math.floor(Math.min(ay, by) / G), y1 = Math.floor(Math.max(ay, by) / G);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const k = gx + ',' + gy;
        const arr = buckets.get(k); if (arr) arr.push(s); else buckets.set(k, [s]);
      }
    }
  });
  const touchesOther = (px: number, py: number, selfRi: number): boolean => {
    const cgx = Math.floor(px / G), cgy = Math.floor(py / G);
    for (let gx = cgx - 1; gx <= cgx + 1; gx++) for (let gy = cgy - 1; gy <= cgy + 1; gy++) {
      for (const s of buckets.get(gx + ',' + gy) ?? []) {
        if (s.ri === selfRi) continue;
        const dx = s.bx - s.ax, dy = s.by - s.ay;
        const L2 = dx * dx + dy * dy;
        const u = L2 ? Math.max(0, Math.min(1, ((px - s.ax) * dx + (py - s.ay) * dy) / L2)) : 0;
        if (Math.hypot(px - (s.ax + u * dx), py - (s.ay + u * dy)) < 10_000) return true;
      }
    }
    return false;
  };

  const out: RiverRoute[] = [...kept];
  let extended = 0, remaining = 0;
  for (let ri = 0; ri < kept.length; ri++) {
    const r = kept[ri]!;
    if (r.pts.length < 2 || mouthInWater(r.pts)) continue;
    const [mx, my] = r.pts[r.pts.length - 1]!;
    if (touchesOther(norm(mx), my, ri)) continue; // already a confluence

    // downstream walk on the grid: riverOn neighbour with the larger
    // accumulation; a water hex ends the walk (and joins the tail)
    const hexPath: string[] = [];
    let cur = grid.worldKeyAt(norm(mx), my);
    const seen = new Set([cur]);
    let terminus: 'water' | 'reconnect' | null = null;
    for (let step = 0; step < 40 && !terminus; step++) {
      const [q, rr] = cur.split(',').map(Number);
      const accCur = grid.acc.get(cur) ?? 0;
      let next: string | null = null, bestAcc = accCur, waterNb: string | null = null;
      for (const [dq, dr] of DIRS) {
        const nk = grid.canon(q! + dq, rr! + dr);
        if (seen.has(nk)) continue;
        if (hexIsWater(nk)) { waterNb = nk; continue; }
        const a = grid.acc.get(nk) ?? 0;
        if (grid.riverOn.has(nk) && a > bestAcc) { bestAcc = a; next = nk; }
      }
      if (next) {
        cur = next; seen.add(cur); hexPath.push(cur);
        const hit = keptHexOf.get(cur);
        if (hit !== undefined && hit !== ri) terminus = 'reconnect';
        continue;
      }
      if (waterNb) { hexPath.push(waterNb); terminus = 'water'; }
      break;
    }
    if (!terminus) { remaining++; continue; } // peters out; leave the honest stub

    const raw: Array<[number, number]> = [[mx, my]];
    for (const k of hexPath) {
      const [q, rr] = k.split(',').map(Number);
      const [hx, hy] = grid.hexC(q!, rr!);
      if (Math.abs(hx - raw[raw.length - 1]![0]) > C / 2) break; // never meander across the seam
      raw.push([hx, hy]);
    }
    if (raw.length < 2) { remaining++; continue; }
    const tail = meander(raw, 'v9:' + r.id);
    out[ri] = { ...r, pts: [...r.pts, ...tail.slice(1)] };
    extended++;
  }
  return { routes: out, extended, remaining };
}
