// Hydrology — rivers and lakes for a world, generated from the terrain field.
// This is the browser-usable port of the river-tracing the Vessia bake does
// (continent-vessia.mjs): priority-flood drainage, rain accumulation, a stream→
// river→great→GRAND width ladder, meandered polylines, and deltas at the sea.
// A NEW world calls this at creation so it has rivers from the start (the bake
// only runs for the shipped example).

import { biomeAt, elevationAt, detailAt, octFor, type TerrainCfg } from './terrain.ts';
import { h32 } from './seeds.ts';

export interface RiverRoute { id: string; kind: 'river'; w: number; pts: Array<[number, number]> }
export interface Hydrology { routes: RiverRoute[]; lakePaint: Record<string, string> }

const SQ3 = Math.sqrt(3);
const WORLD_HEXFT = 316_800;
const WORLD_IDX = 2; // world tier's detail-bias salt (matches the bake's TIER.world.idx)
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const WATER = new Set(['deep', 'water']);
const RAIN: Record<string, number> = {
  jungle: 1.6, swamp: 1.5, forest: 1.3, mountain: 1.4, taiga: 1.1, hills: 1.1,
  grass: 1, beach: 0.8, snow: 0.7, tundra: 0.7, savanna: 0.5, desert: 0.15,
};
// the flow ladder (batch 59): more headwater streams, then width in tiers
const RIVER_MIN = 22;   // a stream begins
const RIVER_ACC = 60;   // → river (2)
const GREAT_ACC = 150;  // → great river (3)
const GRAND_ACC = 2500; // → GRAND river (4)

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

export function generateHydrology(cfg: TerrainCfg): Hydrology {
  const Rw = WORLD_HEXFT / SQ3;
  const rMax = Math.floor((cfg.heightFt / 2) / (1.5 * Rw)) - 1;
  const qPeriod = Math.round(cfg.circumFt / (SQ3 * Rw));
  const octW = octFor(WORLD_HEXFT);
  const hexC = (q: number, r: number): [number, number] => [SQ3 * Rw * (q + r / 2), 1.5 * Rw * r];
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
  const elevOf = new Map<string, number>();
  const elevAt = (k: string): number => {
    let e = elevOf.get(k);
    if (e === undefined) { const [q, r] = k.split(',').map(Number); const [x, y] = hexC(q!, r!); e = elevationAt(cfg, x, y, octW); elevOf.set(k, e); }
    return e;
  };

  // ---- land grid ----
  const land = new Map<string, string>();
  for (let r = -rMax; r <= rMax; r++) {
    const qBase = -Math.round(r / 2);
    for (let i = 0; i < qPeriod; i++) {
      const q = qBase + i;
      const b = hexBiome(q, r);
      if (!WATER.has(b)) land.set(q + ',' + r, b);
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
        const ne = elevationAt(cfg, nx, ny, octW);
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
  }

  // ---- rain accumulation down the drainage tree ----
  const acc = new Map<string, number>();
  for (let i = fillOrder.length - 1; i >= 0; i--) {
    const k = fillOrder[i]!;
    const a = (acc.get(k) ?? 0) + (RAIN[land.get(k)!] ?? 1);
    acc.set(k, a);
    const d = flowTo.get(k);
    if (d && land.has(d)) acc.set(d, (acc.get(d) ?? 0) + a);
  }
  const riverOn = new Set([...acc.entries()].filter(([, a]) => a >= RIVER_MIN).map(([k]) => k));
  const bandOf = (k: string): number => { const a = acc.get(k) ?? 0; return a >= GRAND_ACC ? 4 : a >= GREAT_ACC ? 3 : a >= RIVER_ACC ? 2 : 1; };

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
      const isWaterK = (k2: string): boolean => { if (lakeSet.has(k2)) return true; const [q, r] = k2.split(',').map(Number); const [x, y] = hexC(q!, r!); return elevationAt(cfg, x, y, octW) < 0.5; };
      let c2 = mouth, guard = 0; const seen = new Set([mouth]);
      while (guard++ < 20) {
        const [cq, cr] = c2.split(',').map(Number);
        let nxt: string | null | undefined = flowTo.get(c2);
        if (!nxt || seen.has(nxt)) {
          let lo: string | null = null, loE = Infinity;
          for (const [dq, dr] of DIRS) { const nk = canon(cq! + dq, cr! + dr); if (seen.has(nk)) continue; const [x, y] = hexC(...(nk.split(',').map(Number) as [number, number])); const e2 = elevationAt(cfg, x, y, octW); if (e2 < loE) { loE = e2; lo = nk; } }
          nxt = lo;
        }
        if (!nxt) break;
        seen.add(nxt); path.push(nxt);
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
    const qf = (SQ3 / 3 * x - y / 3) / Rw, rf = (2 / 3 * y) / Rw;
    let q = Math.round(qf), r = Math.round(rf); const sc = Math.round(-qf - rf);
    const dq = Math.abs(q - qf), dr = Math.abs(r - rf), ds = Math.abs(sc + qf + rf);
    if (dq > dr && dq > ds) q = -r - sc; else if (dr > ds) r = -q - sc;
    return canon(q, r);
  };
  const ptWater = (x: number, y: number): boolean => lakeSet.has(worldKeyAt(x, y)) || elevationAt(cfg, x, y, octW) < 0.5;
  const meander = (pts: Array<[number, number]>, salt: string): Array<[number, number]> => {
    let cur = pts;
    for (let lvl = 0; lvl < 3; lvl++) {
      const next: Array<[number, number]> = [cur[0]!];
      for (let i = 0; i < cur.length - 1; i++) {
        const [x0, y0] = cur[i]!, [x1, y1] = cur[i + 1]!;
        const off = (h32(salt + ':' + lvl + ':' + i, 9) / 4294967295 - 0.5) * (lvl === 0 ? 0.2 : 0.22);
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        let px = mx - (y1 - y0) * off, py = my + (x1 - x0) * off;
        if (elevationAt(cfg, px, py, octW) > elevationAt(cfg, mx, my, octW) + 0.012) { px = mx * 0.6 + px * 0.4; py = my * 0.6 + py * 0.4; }
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
    for (const [dq, dr] of DIRS) { const nk = canon(lq! + dq, lr! + dr); if (isWaterHex(nk) && !lakeSet.has(nk)) { const [wx, wy] = cxy(nk); bx += wx - lx; by += wy - ly; nw++; } }
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

  return { routes, lakePaint };
}
