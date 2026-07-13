// Travel time (Phase D, batch 33): how long the road actually takes.
// A* over world-tier hexes (60 mi across): roads carry you at highway pace,
// wild country slows by biome, rivers cost half a day to ford unless a
// bridge stands near. Pure module — the map injects its own biome/road/river
// lookups so painted terrain and live routes are respected.

export interface TravelDeps {
  /** east-west circumference in feet (distances wrap the seam) */
  circumFt: number;
  /** biome id for a world hex (respects biome paint) */
  biomeOf(q: number, r: number): string;
  /** best road class touching the hex: 'highway' | 'road' | 'dirt' | null */
  roadOf(q: number, r: number): string | null;
  /** does a river run through this hex? */
  riverAt(q: number, r: number): boolean;
  /** is a bridge anchored within reach of this hex center? */
  bridgeNear(x: number, y: number): boolean;
  /** hex center in plane feet */
  centerOf(q: number, r: number): [number, number];
  /** canonical wrap for a neighbor key */
  canon(q: number, r: number): [number, number];
}

export interface TravelPlan {
  miles: number;
  footDays: number;
  mountedDays: number;
  roadShare: number; // 0..1 of distance spent on roads
  fords: number;
  pts: Array<[number, number]>;
}

const HEX_MI = 60; // world hex across, roughly
// miles per day — classic overland paces
const ROAD_SPEED: Record<string, number> = { highway: 24, road: 20, dirt: 16, path: 14 };
const WILD_SPEED: Record<string, number> = {
  grass: 16, savanna: 16, beach: 14, hills: 12, forest: 12, taiga: 12,
  jungle: 8, desert: 10, tundra: 10, snow: 8, mountain: 6,
};
const FORD_DAYS = 0.5;
const DIRS: Array<[number, number]> = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

class MinHeap {
  a: Array<[number, number, string]> = [];
  get size(): number { return this.a.length; }
  push(x: [number, number, string]): void {
    const a = this.a;
    a.push(x);
    for (let i = a.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (a[p]![0] <= a[i]![0]) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): [number, number, string] | undefined {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length && last) {
      a[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1, rr = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (rr < a.length && a[rr]![0] < a[m]![0]) m = rr;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** days to cross one hex (half in, half out is handled by averaging edges) */
function hexDays(deps: TravelDeps, q: number, r: number): number | null {
  const road = deps.roadOf(q, r);
  if (road) return HEX_MI / (ROAD_SPEED[road] ?? 16);
  const b = deps.biomeOf(q, r);
  if (b === 'water' || b === 'deep') return null; // no overland way
  return HEX_MI / (WILD_SPEED[b] ?? 12);
}

export function planTravel(
  deps: TravelDeps,
  from: [number, number],
  to: [number, number],
  maxExplored = 60_000,
): TravelPlan | null {
  const [fq, fr] = from, [tq, tr] = to;
  const startK = fq + ',' + fr, goalK = tq + ',' + tr;
  if (hexDays(deps, fq, fr) === null || hexDays(deps, tq, tr) === null) return null;
  const [gx, gy] = deps.centerOf(tq, tr);
  const hFt = (q: number, r: number): number => {
    const [x, y] = deps.centerOf(q, r);
    let dx = Math.abs(x - gx) % deps.circumFt;
    if (dx > deps.circumFt / 2) dx = deps.circumFt - dx;
    return Math.hypot(dx, y - gy);
  };
  const FT_PER_MI = 5280;
  const heur = (q: number, r: number): number => hFt(q, r) / FT_PER_MI / 24; // best possible pace
  const g = new Map<string, number>([[startK, 0]]);
  const cameFrom = new Map<string, string>();
  const fordEdge = new Set<string>();
  const heap = new MinHeap();
  heap.push([heur(fq, fr), 0, startK]);
  const done = new Set<string>();
  while (heap.size) {
    const popped = heap.pop()!;
    const k = popped[2];
    if (done.has(k)) continue;
    done.add(k);
    if (k === goalK) break;
    if (done.size > maxExplored) return null;
    const [q, r] = k.split(',').map(Number) as [number, number];
    const own = hexDays(deps, q, r);
    if (own === null) continue;
    for (const [dq, dr] of DIRS) {
      const [nq, nr] = deps.canon(q + dq, r + dr);
      const nk = nq + ',' + nr;
      if (done.has(nk)) continue;
      const nd = hexDays(deps, nq, nr);
      if (nd === null) continue;
      let edge = (own + nd) / 2;
      let forded = false;
      // rivers cost a ford unless a bridge stands near either bank
      if (deps.riverAt(nq, nr) !== deps.riverAt(q, r) || (deps.riverAt(nq, nr) && deps.riverAt(q, r))) {
        if (deps.riverAt(nq, nr) && !deps.riverAt(q, r)) {
          const [bx, by] = deps.centerOf(nq, nr);
          if (!deps.bridgeNear(bx, by)) { edge += FORD_DAYS; forded = true; }
        }
      }
      const cand = (g.get(k) ?? Infinity) + edge;
      if (cand < (g.get(nk) ?? Infinity)) {
        g.set(nk, cand);
        cameFrom.set(nk, k);
        if (forded) fordEdge.add(nk); else fordEdge.delete(nk);
        heap.push([cand + heur(nq, nr), cand, nk]);
      }
    }
  }
  if (!done.has(goalK)) return null;
  // walk the path back
  const keys: string[] = [goalK];
  for (let cur = goalK; cur !== startK;) {
    const prev = cameFrom.get(cur);
    if (!prev) break;
    keys.push(prev);
    cur = prev;
  }
  keys.reverse();
  const pts: Array<[number, number]> = keys.map((k2) => {
    const [q2, r2] = k2.split(',').map(Number) as [number, number];
    return deps.centerOf(q2, r2);
  });
  let miles = 0;
  for (let i = 1; i < pts.length; i++) {
    let dx = Math.abs(pts[i]![0] - pts[i - 1]![0]) % deps.circumFt;
    if (dx > deps.circumFt / 2) dx = deps.circumFt - dx; // the seam is not a step
    miles += Math.hypot(dx, pts[i]![1] - pts[i - 1]![1]) / 5280;
  }
  let roadHexes = 0, fords = 0;
  for (const k2 of keys) {
    const [q2, r2] = k2.split(',').map(Number) as [number, number];
    if (deps.roadOf(q2, r2)) roadHexes++;
    if (fordEdge.has(k2)) fords++;
  }
  const footDays = g.get(goalK) ?? 0;
  return {
    miles: Math.round(miles),
    footDays: Math.round(footDays * 10) / 10,
    mountedDays: Math.round(footDays * 0.55 * 10) / 10, // a horse roughly halves it
    roadShare: keys.length ? roadHexes / keys.length : 0,
    fords,
    pts,
  };
}
