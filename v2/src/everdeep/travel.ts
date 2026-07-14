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
  /** the hex key one step DOWNSTREAM of this river hex, or null */
  riverFlowOf(q: number, r: number): string | null;
  /** port service here: 0 none · 1 downstream/sea (10k+) · 2 magical upstream too (50k+) */
  portAt(q: number, r: number): 0 | 1 | 2;
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
  boatDays: number; // of footDays, how many are afloat (a horse doesn't help there)
  roadShare: number; // 0..1 of distance spent on roads
  fords: number;
  pts: Array<[number, number]>;
  /** travel mode per point: 'w' walking · 'b' boat · 'B' magically-driven boat */
  modes: string[];
}

const HEX_MI = 60; // world hex across, roughly
// miles per day — classic overland paces
const ROAD_SPEED: Record<string, number> = { highway: 24, road: 20, dirt: 16, path: 14 };
const WILD_SPEED: Record<string, number> = {
  grass: 16, savanna: 16, beach: 14, hills: 12, forest: 12, taiga: 12,
  jungle: 8, desert: 10, tundra: 10, snow: 8, mountain: 6,
};
const FORD_DAYS = 0.5;
// boats (owner, batch 36): both beat a horse. Downstream rides the current;
// upstream needs the magical propulsion only great river-cities maintain.
const BOAT_DOWN = 60;  // mi/day, with the current
const BOAT_UP = 48;    // mi/day, magically driven against it
const BOAT_SEA = 60;   // mi/day, under sail on open water
const EMBARK_DAYS = 0.2; // boarding or beaching
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
  const b = deps.biomeOf(q, r);
  const road = deps.roadOf(q, r);
  if (road) {
    // a road through rough country is still rough country (owner, batch 35):
    // mountain passes crawl, hill roads wind
    const rough = b === 'mountain' ? 0.6 : b === 'hills' ? 0.85 : 1;
    return HEX_MI / ((ROAD_SPEED[road] ?? 16) * rough);
  }
  if (b === 'water' || b === 'deep') return null; // no overland way
  return HEX_MI / (WILD_SPEED[b] ?? 12);
}

export function planTravel(
  deps: TravelDeps,
  from: [number, number],
  to: [number, number],
  maxExplored = 90_000,
): TravelPlan | null {
  const [fq, fr] = from, [tq, tr] = to;
  const goalHex = tq + ',' + tr;
  if (hexDays(deps, fq, fr) === null) return null; // can't start in open water
  if (hexDays(deps, tq, tr) === null) return null; // or end there (boats beach)
  const [gx, gy] = deps.centerOf(tq, tr);
  const hFt = (q: number, r: number): number => {
    const [x, y] = deps.centerOf(q, r);
    let dx = Math.abs(x - gx) % deps.circumFt;
    if (dx > deps.circumFt / 2) dx = deps.circumFt - dx;
    return Math.hypot(dx, y - gy);
  };
  const FT_PER_MI = 5280;
  const heur = (q: number, r: number): number => hFt(q, r) / FT_PER_MI / BOAT_SEA; // best pace afloat
  const isWater = (b: string): boolean => b === 'water' || b === 'deep';

  // node = hex + mode: 'w' walking · 'b' boat (downstream/sea) · 'B' magical boat
  const startK = `${fq},${fr}|w`;
  const g = new Map<string, number>([[startK, 0]]);
  const boatG = new Map<string, number>([[startK, 0]]); // days afloat so far
  const cameFrom = new Map<string, string>();
  const fordEdge = new Set<string>();
  const heap = new MinHeap();
  heap.push([heur(fq, fr), 0, startK]);
  const done = new Set<string>();
  let goalK: string | null = null;
  const relax = (k: string, nk: string, edge: number, boatEdge: number, forded = false): void => {
    const cand = (g.get(k) ?? Infinity) + edge;
    if (cand < (g.get(nk) ?? Infinity)) {
      g.set(nk, cand);
      boatG.set(nk, (boatG.get(k) ?? 0) + boatEdge);
      cameFrom.set(nk, k);
      if (forded) fordEdge.add(nk); else fordEdge.delete(nk);
      const [q2s, r2s] = nk.split('|')[0]!.split(',').map(Number);
      heap.push([cand + heur(q2s!, r2s!), cand, nk]);
    }
  };
  while (heap.size) {
    const popped = heap.pop()!;
    const k = popped[2];
    if (done.has(k)) continue;
    done.add(k);
    const [hexK, m] = k.split('|') as [string, string];
    if (hexK === goalHex) { goalK = k; break; }
    if (done.size > maxExplored) return null;
    const [q, r] = hexK.split(',').map(Number) as [number, number];
    const b = deps.biomeOf(q, r);
    const water = isWater(b);
    const river = deps.riverAt(q, r);
    const own = hexDays(deps, q, r);
    if (m === 'w') {
      // board a boat where a port offers one
      const port = deps.portAt(q, r);
      if (port >= 1) relax(k, `${hexK}|b`, EMBARK_DAYS, EMBARK_DAYS);
      if (port >= 2) relax(k, `${hexK}|B`, EMBARK_DAYS, EMBARK_DAYS);
      if (own === null) continue;
      for (const [dq, dr] of DIRS) {
        const [nq, nr] = deps.canon(q + dq, r + dr);
        const nd = hexDays(deps, nq, nr);
        if (nd === null) continue;
        let edge = (own + nd) / 2;
        let forded = false;
        if (deps.riverAt(nq, nr) && !deps.riverAt(q, r)) {
          const [bx, by] = deps.centerOf(nq, nr);
          if (!deps.bridgeNear(bx, by)) { edge += FORD_DAYS; forded = true; }
        }
        relax(k, `${nq},${nr}|w`, edge, 0, forded);
      }
    } else {
      // afloat: rivers and open water carry the hull
      for (const [dq, dr] of DIRS) {
        const [nq, nr] = deps.canon(q + dq, r + dr);
        const nk = `${nq},${nr}`;
        const nb = deps.biomeOf(nq, nr);
        const nWater = isWater(nb);
        const nRiver = deps.riverAt(nq, nr);
        if (nWater || nRiver) {
          let sp: number | null = BOAT_SEA;
          if (river && nRiver) {
            if (deps.riverFlowOf(q, r) === nk) sp = BOAT_DOWN; // with the current
            else if (deps.riverFlowOf(nq, nr) === hexK) sp = m === 'B' ? BOAT_UP : null; // against it
            else sp = m === 'B' ? BOAT_UP : BOAT_DOWN; // junctions/parallel: charitable
          }
          if (sp !== null) {
            const edge = HEX_MI / sp;
            relax(k, `${nk}|${m}`, edge, edge);
          }
        }
        // beach the boat onto any walkable shore
        const nd = hexDays(deps, nq, nr);
        if (nd !== null) relax(k, `${nk}|w`, EMBARK_DAYS + nd / 2, EMBARK_DAYS);
      }
    }
  }
  if (!goalK) return null;
  // walk the path back
  const keys: string[] = [goalK];
  for (let cur = goalK; cur !== startK;) {
    const prev = cameFrom.get(cur);
    if (!prev) break;
    keys.push(prev);
    cur = prev;
  }
  keys.reverse();
  const hexKeys = keys.map((k2) => k2.split('|')[0]!);
  const modes = keys.map((k2) => k2.split('|')[1]!);
  const pts: Array<[number, number]> = hexKeys.map((k2) => {
    const [q2, r2] = k2.split(',').map(Number) as [number, number];
    return deps.centerOf(q2, r2);
  });
  let miles = 0;
  for (let i = 1; i < pts.length; i++) {
    if (hexKeys[i] === hexKeys[i - 1]) continue; // mode switch, no ground covered
    let dx = Math.abs(pts[i]![0] - pts[i - 1]![0]) % deps.circumFt;
    if (dx > deps.circumFt / 2) dx = deps.circumFt - dx; // the seam is not a step
    miles += Math.hypot(dx, pts[i]![1] - pts[i - 1]![1]) / 5280;
  }
  let roadHexes = 0, fords = 0;
  for (const [i, k2] of hexKeys.entries()) {
    const [q2, r2] = k2.split(',').map(Number) as [number, number];
    if (modes[i] === 'w' && deps.roadOf(q2, r2)) roadHexes++;
    if (fordEdge.has(keys[i]!)) fords++;
  }
  const footDays = g.get(goalK) ?? 0;
  const boatDays = boatG.get(goalK) ?? 0;
  const walkDays = Math.max(0, footDays - boatDays);
  return {
    miles: Math.round(miles),
    footDays: Math.round(footDays * 10) / 10,
    // a horse roughly halves the LAND legs; it rides the boat like anyone
    mountedDays: Math.round((walkDays * 0.55 + boatDays) * 10) / 10,
    boatDays: Math.round(boatDays * 10) / 10,
    roadShare: hexKeys.length ? roadHexes / hexKeys.length : 0,
    fords,
    pts,
    modes,
  };
}
