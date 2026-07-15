// Keeping a drawn road on dry land (item #24).
//
// The road planner works at 60-mile world hexes; a road is a line thirty feet
// wide. Every bay, strait, headland and isthmus on Earth lives in the gap
// between those two scales — which is why 102 of Earth's 550 roads were drawn
// swimming. Measured, the blame split almost exactly in half:
//
//   52%  the grid calls the hex LAND. `hydrology.ts` samples ONE point — the
//        hex centre — per 60-mile hex, so a hex that is 90% bay reads as solid
//        ground. 3.7% of Earth's "land" hexes are majority water.
//   48%  the grid agrees the hex is water — the DRAWN line simply left the
//        cells the A* planned. The corner-jitter and the two Chaikin passes
//        that make a road look hand-drawn cut straight across the coast the
//        planned cells were carefully hugging.
//
// Neither is fixable at 60 miles: the planner cannot know where inside a hex
// the road runs, so the drawing step has to place it. This pass re-draws a
// planned line at a scale that can actually see the water. Roads that never
// touch it (82% of them) pay nothing and come through byte-identical.
//
// Where the water cannot be walked around, the road SPLITS rather than swims.
// Two stubs facing each other across a strait is what a real map looks like
// where a ferry runs, and it is the honest answer: `travel.ts` already sails
// that leg by boat (BOAT_SEA, ports, EMBARK_DAYS), so the crossing is still
// travellable — it just isn't a road any more, because it never was one.

export interface ShoreProbe {
  /** true where the map draws open water. Must wrap x itself — the polylines
   *  handed to this module are seam-UNWRAPPED (emit() unrolls them so a road
   *  crossing the antimeridian stays a straight line), so x may sit outside
   *  [0, circumFt). */
  wet(x: number, y: number): boolean;
}

export interface HugOpts {
  /** lattice pitch for the detour search (default 4 mi) */
  cellFt?: number;
  /** how finely a straight run is checked for water (default 2 mi — the Earth
   *  coast raster is ~2.3 mi per pixel, so a finer step buys nothing) */
  stepFt?: number;
  /** a detour longer than this multiple of the straight crossing is not a road
   *  going round — it is two roads and a ferry */
  maxDetour?: number;
  /** the shortest detour always worth walking, however short the crossing.
   *  Without a floor, `maxDetour` × a 4-mile smoothing step forbids stepping
   *  round even a small headland. */
  minDetourFt?: number;
  /** how far out to look for dry land when a vertex lands in the sea */
  snapFt?: number;
  /** safety cap on lattice cells per detour */
  maxCells?: number;
}

const MI = 5280;
const DEFAULTS = {
  cellFt: 4 * MI,
  stepFt: 2 * MI,
  maxDetour: 3.5,
  minDetourFt: 60 * MI,
  snapFt: 40 * MI,
  maxCells: 60_000,
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

type Pt = [number, number];
const dist = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Is every point along a→b dry? Endpoints are the caller's problem — this
 *  samples the INTERIOR, because a run is chained end-to-end and testing the
 *  shared vertex twice doubles the cost of the hot path for nothing. */
export function dryRun(a: Pt, b: Pt, probe: ShoreProbe, stepFt: number): boolean {
  const d = dist(a, b);
  const n = Math.max(1, Math.ceil(d / stepFt));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    if (probe.wet(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)) return false;
  }
  return true;
}

/** The nearest dry point to p, or null within maxR. Rings outward, so the
 *  answer is the shore rather than merely somewhere ashore. */
export function snapDry(p: Pt, probe: ShoreProbe, stepFt: number, maxR: number): Pt | null {
  if (!probe.wet(p[0], p[1])) return p;
  for (let r = stepFt; r <= maxR; r += stepFt) {
    const n = Math.max(8, Math.round((2 * Math.PI * r) / stepFt));
    let best: Pt | null = null;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * 2 * Math.PI;
      const q: Pt = [p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r];
      if (!probe.wet(q[0], q[1])) { best = q; break; }
    }
    if (best) return best;
  }
  return null;
}

/** A* over a square lattice of dry cells inside the rectangle spanned by a and
 *  b, inflated by `margin`. Eight-connected: a road cuts a corner, it doesn't
 *  march in rook steps.
 *
 *  Every EDGE is checked, not just every cell. Testing a cell at its centre and
 *  assuming the step to the next centre is dry is the exact mistake that put
 *  roads in the sea to begin with — it just makes it at 4 miles instead of 60,
 *  and it leaves a road clipping the corner of a bay by a few miles. The drawn
 *  line IS the chain of cell centres, so validating the chain's links is what
 *  makes the output dry by construction rather than dry on average.
 *
 *  `budget` is the longest detour worth having, and it bounds the search rather
 *  than merely judging its answer: a path costing more than the budget will be
 *  thrown away, so the cells only reachable by one are not worth visiting. That
 *  bound is what keeps this affordable — a strait, where every cell in range
 *  gets explored before we admit defeat, is the expensive case, and the budget
 *  is what stops it exploring a 320-mile box to reject a 12-mile crossing. */
function latticePath(
  a: Pt, b: Pt, probe: ShoreProbe, cellFt: number, stepFt: number, budget: number,
  maxCells: number,
): Pt[] | null {
  // The lattice is laid ALONG the crossing, not along the world axes: node
  // (0,0) is exactly `a` and node (N,0) is exactly `b`. Both are already known
  // dry, so nothing has to be forced open, and the stitch back to the caller's
  // real endpoints — which an axis-aligned lattice can only approximate, and
  // then leaves unchecked — does not exist to get wrong.
  const span = dist(a, b);
  if (span < 1 || budget < span) return null;
  const ux = (b[0] - a[0]) / span, uy = (b[1] - a[1]) / span;
  const N = Math.max(1, Math.round(span / cellFt));
  const du = span / N;                       // along the crossing
  // A detour must come back: stray `d` off the line and you have already spent
  // at least 2d getting out and home, so nothing beyond budget/2 can be on a
  // path we would keep.
  const M = Math.max(1, Math.ceil(budget / 2 / cellFt));
  if ((N + 2 * M + 1) * (2 * M + 1) > maxCells) return null;
  const at = (i: number, j: number): Pt => [
    a[0] + ux * i * du - uy * j * cellFt,
    a[1] + uy * i * du + ux * j * cellFt,
  ];
  const key = (i: number, j: number): string => i + ',' + j;
  const gk = key(N, 0);
  const dry = new Map<string, boolean>();
  const dryCell = (i: number, j: number): boolean => {
    const k = key(i, j);
    let v = dry.get(k);
    if (v === undefined) { const p = at(i, j); v = !probe.wet(p[0], p[1]); dry.set(k, v); }
    return v;
  };
  // memoised per undirected edge — each cell shares its 8 edges with a
  // neighbour, so the walk pays for 4
  const edgeOk = new Map<string, boolean>();
  const dryEdge = (i: number, j: number, ni: number, nj: number): boolean => {
    const k1 = key(i, j), k2 = key(ni, nj);
    const ek = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
    let v = edgeOk.get(ek);
    if (v === undefined) { v = dryRun(at(i, j), at(ni, nj), probe, stepFt); edgeOk.set(ek, v); }
    return v;
  };
  const h = (i: number, j: number): number => Math.hypot((N - i) * du, j * cellFt);
  const heap = new Heap<[number, number, number]>();
  const g = new Map<string, number>([[key(0, 0), 0]]);
  const from = new Map<string, string>();
  const done = new Set<string>();
  heap.push([h(0, 0), [0, 0, 0]]);
  let pops = 0;
  while (heap.size) {
    const [, [i, j, gc]] = heap.pop()!;
    const k = key(i, j);
    if (done.has(k)) continue;
    done.add(k);
    if (k === gk) {
      const out: Pt[] = [];
      for (let cur: string | undefined = gk; cur; cur = from.get(cur)) {
        const [pi, pj] = cur.split(',').map(Number) as [number, number];
        out.push(at(pi, pj));
      }
      return out.reverse();
    }
    if (++pops > maxCells) return null;
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < -M || ni > N + M || nj < -M || nj > M) continue;
        const nk = key(ni, nj);
        if (done.has(nk)) continue;
        const ng = gc + Math.hypot(di * du, dj * cellFt);
        if (ng >= (g.get(nk) ?? Infinity)) continue;
        // h is a straight line to the goal, so ng + h under-counts the real
        // remaining road: anything already over budget here is over budget for
        // certain, and the probes it would cost are pure waste.
        if (ng + h(ni, nj) > budget) continue;
        if (!dryCell(ni, nj) || !dryEdge(i, j, ni, nj)) continue;
        g.set(nk, ng); from.set(nk, k);
        heap.push([ng + h(ni, nj), [ni, nj, ng]]);
      }
    }
  }
  return null;
}

/** Pull the lattice staircase taut: replace any run of vertices with the
 *  straight line that skips them, whenever that line is dry. A real coast road
 *  is a few long straights and a bend, not a flight of 4-mile steps. */
function pullTaut(path: Pt[], probe: ShoreProbe, stepFt: number, lookahead = 24): Pt[] {
  if (path.length < 3) return path;
  const out: Pt[] = [path[0]!];
  let i = 0;
  while (i < path.length - 1) {
    let j = Math.min(path.length - 1, i + lookahead);
    while (j > i + 1 && !dryRun(path[i]!, path[j]!, probe, stepFt)) j--;
    out.push(path[j]!);
    i = j;
  }
  return out;
}

/**
 * Re-draw a planned road so it stays on land.
 *
 * Returns the PIECES of the road: one polyline if the whole line could follow
 * dry ground, several where open water genuinely splits it. A piece of fewer
 * than two points is never returned.
 */
export function hugLand(pts: Pt[], probe: ShoreProbe, opts: HugOpts = {}): Pt[][] {
  const cellFt = opts.cellFt ?? DEFAULTS.cellFt;
  const stepFt = opts.stepFt ?? DEFAULTS.stepFt;
  const maxDetour = opts.maxDetour ?? DEFAULTS.maxDetour;
  const minDetourFt = opts.minDetourFt ?? DEFAULTS.minDetourFt;
  const snapFt = opts.snapFt ?? DEFAULTS.snapFt;
  const maxCells = opts.maxCells ?? DEFAULTS.maxCells;
  if (pts.length < 2) return pts.length ? [pts] : [];

  // The overwhelmingly common case: the road never goes near water. Answer in
  // one pass over the line and hand back the very same array — no snapping, no
  // lattice, no reshaping of a road that was fine.
  let anyWet = probe.wet(pts[0]![0], pts[0]![1]);
  if (!anyWet) {
    for (let i = 1; i < pts.length && !anyWet; i++) {
      if (probe.wet(pts[i]![0], pts[i]![1]) || !dryRun(pts[i - 1]!, pts[i]!, probe, stepFt)) anyWet = true;
    }
  }
  if (!anyWet) return [pts];

  // Pull every vertex ashore first. A vertex with no land within snapFt is not
  // a coastal wobble — it is a road drawn out at sea, and it has no business
  // anchoring anything.
  const anchors: Array<Pt | null> = pts.map((p) => snapDry(p, probe, stepFt, snapFt));

  const pieces: Pt[][] = [];
  let cur: Pt[] = [];
  const close = (): void => { if (cur.length >= 2) pieces.push(cur); cur = []; };

  for (const v of anchors) {
    // Nothing ashore anywhere near this vertex — it is a planned hex centre that
    // fell in open sea. Drop the VERTEX, but not the road: its neighbours may
    // still be joinable round the water, and severing here would throw away a
    // road that only ever needed to go around a headland.
    if (!v) continue;
    if (!cur.length) { cur = [v]; continue; }
    const last = cur[cur.length - 1]!;
    if (dist(last, v) < 1) continue; // the snap collapsed two vertices onto one
    if (dryRun(last, v, probe, stepFt)) { cur.push(v); continue; }

    // The straight run is wet: walk around it if walking around it is still a
    // road. A detour that dwarfs the crossing is not the road going round — it
    // is the road refusing to admit there is a sea in the way — so the budget
    // both bounds the search and decides the answer, and one correctly-bounded
    // search beats widening a box until something turns up: a wider box can only
    // ever find a SHORTER path (it is a superset), so escalating and taking the
    // first hit returns the worst detour it was offered, having paid for every
    // box below it on the way.
    const budget = Math.max(maxDetour * dist(last, v), minDetourFt);
    const detour = latticePath(last, v, probe, cellFt, stepFt, budget, maxCells);
    // Straighten ONLY the staircase we just spliced in. Running the taut pass
    // over the whole road would strip the corner-jitter and smoothing off every
    // dry mile of it too — measured, that cost 22% of the world's road vertices
    // and left any road that so much as touched a coast drawn ruler-straight
    // beside neighbours that still wander.
    if (detour) {
      const taut = pullTaut(detour, probe, stepFt);
      for (let i = 1; i < taut.length; i++) cur.push(taut[i]!);
      continue;
    }
    close();
    cur = [v]; // the far shore starts a new road
  }
  close();
  return pieces;
}
