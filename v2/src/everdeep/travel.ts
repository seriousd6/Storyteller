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
  /** hexes carrying an active portal (500k+ metropolises); empty when the network is dark */
  portals(): Array<[number, number]>;
  /** Open-water speed MULTIPLIER for a leg (1 ≈ hull speed in still water),
   *  from the sailing polar + current (item #31c/#31d — wire boatLegSpeed
   *  here). ≤ 0 means the hull cannot hold that course (becalmed against a
   *  current) and the edge is unavailable. Omitted → flat BOAT_SEA. */
  seaSpeed?(ax: number, ay: number, bx: number, by: number, powered: boolean): number;
}

/** A table-defined travel method (batch 37): each terrain class it can cross
 *  gets a speed in mi/day; anything unlisted is impassable to it. */
export interface CustomProfile {
  label: string;
  /** on a road of any class */
  road?: number;
  /** cross-country over any walkable biome */
  land?: number;
  /** on rivers and open water */
  water?: number;
  /** through the air — terrain stops mattering */
  air?: number;
}

export interface TravelPlan {
  miles: number;
  footDays: number;
  mountedDays: number;
  boatDays: number; // of footDays, how many are afloat (a horse doesn't help there)
  roadShare: number; // 0..1 of distance spent on roads
  fords: number;
  pts: Array<[number, number]>;
  /** travel mode per point: 'w' walking · 'b' boat · 'B' magically-driven boat
   *  · 'c' custom method · 'p' arrived here through a portal */
  modes: string[];
}

const HEX_MI = 60; // world hex across, roughly
// miles per day — a made road is a huge advantage (owner, batch 55): a graded,
// drained, patrolled highway roughly TRIPLES cross-country pace and is far
// safer, so travellers and trade cleave to it. These paces reflect both the
// speed AND the safety of a real road versus bushwhacking the wild.
const ROAD_SPEED: Record<string, number> = { highway: 42, road: 34, dirt: 22, path: 16 };
const WILD_SPEED: Record<string, number> = {
  grass: 14, savanna: 14, beach: 12, hills: 10, forest: 10, taiga: 10,
  jungle: 6, desert: 9, tundra: 9, snow: 6, mountain: 5,
};
const FORD_DAYS = 0.5;
// boats (owner, batch 36): both beat a horse. Downstream rides the current;
// upstream needs the magical propulsion only great river-cities maintain.
const BOAT_DOWN = 60;  // mi/day, with the current
const BOAT_UP = 48;    // mi/day, magically driven against it (a great-city service)
const BOAT_UP_ROW = 10; // mi/day, an ordinary hull poled/towed against the current —
                        // slower than walking the bank, so upstream is a real cost
                        // unless a major city's magical drive (BOAT_UP) is at hand
const BOAT_SEA = 60;   // mi/day, under sail on open water in still air terms
// The polar can BEAT hull speed (strong fair wind + fair current), capped so a
// gale never turns a cog into a hydrofoil. The A* heuristic divides by the
// fastest possible pace, so it must use BOAT_SEA × this cap to stay admissible.
const SEA_MULT_CAP = 1.5;
const BOAT_TOP = BOAT_SEA * SEA_MULT_CAP;
const EMBARK_DAYS = 0.2; // boarding or beaching
// portals (owner, batch 37): metropolises of 500k+ keep a standing portal —
// step through in the time it takes to pay the attunement fee
const PORTAL_DAYS = 0.1;
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
  const wrapFt = (x: number, y: number): number => {
    let dx = Math.abs(x - gx) % deps.circumFt;
    if (dx > deps.circumFt / 2) dx = deps.circumFt - dx;
    return Math.hypot(dx, y - gy);
  };
  const hFt = (q: number, r: number): number => {
    const [x, y] = deps.centerOf(q, r);
    return wrapFt(x, y);
  };
  const FT_PER_MI = 5280;
  // portals break the plain distance bound: the cheapest way to the goal may
  // be "walk to the nearest portal, jump, walk from the portal nearest the
  // goal" — the heuristic must stay under THAT too, or A* cuts corners
  const portalHexes = deps.portals();
  const portalCtr = portalHexes.map(([pq, pr]) => deps.centerOf(pq, pr));
  const jumpTail = portalCtr.length >= 2
    ? Math.min(...portalCtr.map(([px, py]) => wrapFt(px, py))) / FT_PER_MI / BOAT_TOP + PORTAL_DAYS
    : Infinity;
  const heur = (q: number, r: number): number => {
    const [x, y] = deps.centerOf(q, r);
    let best = wrapFt(x, y) / FT_PER_MI / BOAT_TOP; // fastest pace anything moves
    if (jumpTail < best) {
      for (const [px, py] of portalCtr) {
        let dx = Math.abs(x - px) % deps.circumFt;
        if (dx > deps.circumFt / 2) dx = deps.circumFt - dx;
        const toPortal = Math.hypot(dx, y - py) / FT_PER_MI / BOAT_TOP;
        if (toPortal + jumpTail < best) best = toPortal + jumpTail;
      }
    }
    return best;
  };
  const isWater = (b: string): boolean => b === 'water' || b === 'deep';
  const portalSet = new Set(portalHexes.map(([pq, pr]) => pq + ',' + pr));

  // node = hex + mode: 'w' walking · 'b' boat (downstream/sea) · 'B' magical boat
  const startK = `${fq},${fr}|w`;
  const g = new Map<string, number>([[startK, 0]]);
  const boatG = new Map<string, number>([[startK, 0]]); // days afloat so far
  const cameFrom = new Map<string, string>();
  const fordEdge = new Set<string>();
  const portalEdge = new Set<string>();
  const heap = new MinHeap();
  heap.push([heur(fq, fr), 0, startK]);
  const done = new Set<string>();
  let goalK: string | null = null;
  const relax = (k: string, nk: string, edge: number, boatEdge: number, forded = false, jumped = false): void => {
    const cand = (g.get(k) ?? Infinity) + edge;
    if (cand < (g.get(nk) ?? Infinity)) {
      g.set(nk, cand);
      boatG.set(nk, (boatG.get(k) ?? 0) + boatEdge);
      cameFrom.set(nk, k);
      if (forded) fordEdge.add(nk); else fordEdge.delete(nk);
      if (jumped) portalEdge.add(nk); else portalEdge.delete(nk);
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
      // step through the portal to every other lit metropolis
      if (portalSet.has(hexK)) {
        for (const pk of portalSet) if (pk !== hexK) relax(k, `${pk}|w`, PORTAL_DAYS, 0, false, true);
      }
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
            else if (deps.riverFlowOf(nq, nr) === hexK) sp = m === 'B' ? BOAT_UP : BOAT_UP_ROW; // against it: magical drive or slow rowing
            else sp = m === 'B' ? BOAT_UP : BOAT_DOWN; // junctions/parallel: charitable
          } else if (deps.seaSpeed) {
            // open water obeys the wind and the current (item #31c/#31d): the
            // sailing polar prices this leg's HEADING — cheap running before
            // the wind, dear beating into it. A non-positive multiplier means
            // the hull cannot hold this course at all (becalmed against a
            // current); the edge disappears and the A* tacks around instead —
            // never Infinity days, never a negative edge in the heap.
            const [ax2, ay2] = deps.centerOf(q, r);
            const [bx2, by2] = deps.centerOf(nq, nr);
            const mult = deps.seaSpeed(ax2, ay2, bx2, by2, m === 'B');
            sp = mult <= 0.02 ? null : BOAT_SEA * Math.min(mult, SEA_MULT_CAP);
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
  const modes = keys.map((k2, i) => (portalEdge.has(keys[i]!) ? 'p' : k2.split('|')[1]!));
  const pts: Array<[number, number]> = hexKeys.map((k2) => {
    const [q2, r2] = k2.split(',').map(Number) as [number, number];
    return deps.centerOf(q2, r2);
  });
  let miles = 0;
  for (let i = 1; i < pts.length; i++) {
    if (hexKeys[i] === hexKeys[i - 1]) continue; // mode switch, no ground covered
    if (modes[i] === 'p') continue; // a portal jump covers no road at all
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

/** Route a CUSTOM method (batch 37): each terrain class it can cross has its
 *  own speed; anything unlisted bars the way. A flying mount ignores the map;
 *  a barge is water-bound; a wagon may be road-only. Portals still work —
 *  the rider steps through like anyone. */
export function planCustom(
  deps: TravelDeps,
  prof: CustomProfile,
  from: [number, number],
  to: [number, number],
  maxExplored = 90_000,
): TravelPlan | null {
  const spRoad = prof.road, spLand = prof.land, spWater = prof.water, spAir = prof.air;
  const maxSp = Math.max(spRoad ?? 0, spLand ?? 0, spWater ?? 0, spAir ?? 0);
  if (maxSp <= 0) return null;
  const isWater = (b: string): boolean => b === 'water' || b === 'deep';
  const hexCost = (q: number, r: number): number | null => {
    const b = deps.biomeOf(q, r);
    let best = Infinity;
    if (spAir) best = HEX_MI / spAir; // the air is everywhere
    if (spWater && (isWater(b) || deps.riverAt(q, r))) best = Math.min(best, HEX_MI / spWater);
    if (!isWater(b)) {
      if (spLand) best = Math.min(best, HEX_MI / spLand);
      if (spRoad && deps.roadOf(q, r)) best = Math.min(best, HEX_MI / spRoad);
    }
    return best === Infinity ? null : best;
  };
  const [fq, fr] = from, [tq, tr] = to;
  if (hexCost(fq, fr) === null || hexCost(tq, tr) === null) return null;
  const goalHex = tq + ',' + tr;
  const [gx, gy] = deps.centerOf(tq, tr);
  const FT_PER_MI = 5280;
  const wrapMi = (x: number, y: number, x2: number, y2: number): number => {
    let dx = Math.abs(x - x2) % deps.circumFt;
    if (dx > deps.circumFt / 2) dx = deps.circumFt - dx;
    return Math.hypot(dx, y - y2) / FT_PER_MI;
  };
  const portalHexes = deps.portals();
  const portalCtr = portalHexes.map(([pq, pr]) => deps.centerOf(pq, pr));
  const portalSet = new Set(portalHexes.map(([pq, pr]) => pq + ',' + pr));
  const jumpTail = portalCtr.length >= 2
    ? Math.min(...portalCtr.map(([px, py]) => wrapMi(px, py, gx, gy))) / maxSp + PORTAL_DAYS
    : Infinity;
  const heur = (q: number, r: number): number => {
    const [x, y] = deps.centerOf(q, r);
    let best = wrapMi(x, y, gx, gy) / maxSp;
    if (jumpTail < best) {
      for (const [px, py] of portalCtr) {
        const t = wrapMi(x, y, px, py) / maxSp + jumpTail;
        if (t < best) best = t;
      }
    }
    return best;
  };
  const startK = `${fq},${fr}`;
  const g = new Map<string, number>([[startK, 0]]);
  const cameFrom = new Map<string, string>();
  const fordEdge = new Set<string>();
  const portalEdge = new Set<string>();
  const heap = new MinHeap();
  heap.push([heur(fq, fr), 0, startK]);
  const done = new Set<string>();
  const overGround = !spAir && !spWater; // only ground-bound methods ford
  const relax = (k: string, nk: string, edge: number, forded = false, jumped = false): void => {
    const cand = (g.get(k) ?? Infinity) + edge;
    if (cand < (g.get(nk) ?? Infinity)) {
      g.set(nk, cand);
      cameFrom.set(nk, k);
      if (forded) fordEdge.add(nk); else fordEdge.delete(nk);
      if (jumped) portalEdge.add(nk); else portalEdge.delete(nk);
      const [q2, r2] = nk.split(',').map(Number);
      heap.push([cand + heur(q2!, r2!), cand, nk]);
    }
  };
  let reached = false;
  while (heap.size) {
    const popped = heap.pop()!;
    const k = popped[2];
    if (done.has(k)) continue;
    done.add(k);
    if (k === goalHex) { reached = true; break; }
    if (done.size > maxExplored) return null;
    const [q, r] = k.split(',').map(Number) as [number, number];
    const own = hexCost(q, r)!;
    if (portalSet.has(k)) {
      for (const pk of portalSet) if (pk !== k) relax(k, pk, PORTAL_DAYS, false, true);
    }
    for (const [dq, dr] of DIRS) {
      const [nq, nr] = deps.canon(q + dq, r + dr);
      const nd = hexCost(nq, nr);
      if (nd === null) continue;
      let edge = (own + nd) / 2;
      let forded = false;
      if (overGround && deps.riverAt(nq, nr) && !deps.riverAt(q, r)) {
        const [bx, by] = deps.centerOf(nq, nr);
        if (!deps.bridgeNear(bx, by)) { edge += FORD_DAYS; forded = true; }
      }
      relax(k, `${nq},${nr}`, edge, forded);
    }
  }
  if (!reached) return null;
  const keys: string[] = [goalHex];
  for (let cur = goalHex; cur !== startK;) {
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
  const modes = keys.map((k2) => (portalEdge.has(k2) ? 'p' : 'c'));
  let miles = 0, roadHexes = 0, fords = 0;
  for (let i = 1; i < pts.length; i++) {
    if (modes[i] === 'p') continue;
    miles += wrapMi(pts[i]![0], pts[i]![1], pts[i - 1]![0], pts[i - 1]![1]);
  }
  for (const [i, k2] of keys.entries()) {
    const [q2, r2] = k2.split(',').map(Number) as [number, number];
    if (spRoad && deps.roadOf(q2, r2)) roadHexes++;
    if (fordEdge.has(keys[i]!)) fords++;
  }
  const days = g.get(goalHex) ?? 0;
  return {
    miles: Math.round(miles),
    footDays: Math.round(days * 10) / 10,
    mountedDays: Math.round(days * 10) / 10, // the method IS the mount
    boatDays: 0,
    roadShare: keys.length ? roadHexes / keys.length : 0,
    fords,
    pts,
    modes,
  };
}
