// "How wide is the river at this point?" — the field that decides which hexes a
// river drowns (item #6: hexes under rivers are water).
//
// Extracted from mountMap so it can be tested at all. It lived as a closure and
// carried a bug nobody could see from outside for months: it indexed the route's
// VERTICES and treated each as a disc of the river's own width, which quietly
// made a river's water footprint a string of beads rather than a band. On the
// shipped Earth the median gap between vertices is 7.67 mi and a great river is
// 1.61 mi wide — not one of the 10,247 segments is short enough for consecutive
// discs to touch. So the rule fired only at the checkpoints, leaving a lone
// water hex floating mid-river (owner, item #23), which batch 110 then politely
// ringed with its own private beach.
//
// The same mistake batch 109 found in the bridge probe, which measured vertices
// where it meant segments. Vertices are not a line.

/** Real bank-to-bank width (ft) by river width class. */
export const RIVER_REAL_FT: Record<number, number> = { 4: 8500, 3: 5000, 2: 900 };
const GRID_FT = 31_680; // 6 mi buckets

export interface RiverRouteLike {
  kind?: string;
  w?: number;
  pts: Array<[number, number]>;
}

/** [ax, ay, bx, by, realFt] — a segment, in world feet, x already normalised. */
type Seg = [number, number, number, number, number];

export interface RiverField {
  /** Real width (ft) of the widest river covering this point, or 0. */
  widthAt(x: number, y: number): number;
  /** How many segments were indexed — diagnostics. */
  readonly segments: number;
}

/** Squared distance from (px,py) to segment (ax,ay)-(bx,by). */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const d2 = dx * dx + dy * dy;
  let t = d2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / d2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return qx * qx + qy * qy;
}

/** Bucket every navigable river SEGMENT into the cells it passes through. */
export function buildRiverField(routes: readonly RiverRouteLike[], circumFt: number): RiverField {
  const grid = new Map<string, Seg[]>();
  const C = circumFt;
  let segments = 0;
  for (const rt of routes) {
    if (rt.kind !== 'river' || (rt.w ?? 2) < 2) continue; // navigable rivers (great + river)
    const realFt = RIVER_REAL_FT[Math.min(4, rt.w ?? 2)] ?? 900;
    for (let i = 1; i < rt.pts.length; i++) {
      const ax = ((rt.pts[i - 1]![0] % C) + C) % C, ay = rt.pts[i - 1]![1];
      let bx = ((rt.pts[i]![0] % C) + C) % C;
      const by = rt.pts[i]![1];
      // unwrap b next to a, so a segment crossing the date line stays a short
      // segment instead of a world-long one smeared across every cell between
      if (bx - ax > C / 2) bx -= C; else if (ax - bx > C / 2) bx += C;
      const seg: Seg = [ax, ay, bx, by, realFt];
      segments++;
      // walk it, dropping the segment in each cell it touches. Half-cell steps
      // so nothing is stepped over; dedupe because most steps land where the
      // last one did.
      const len = Math.hypot(bx - ax, by - ay);
      const steps = Math.max(1, Math.ceil(len / (GRID_FT / 2)));
      let last = '';
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
        const pxn = ((px % C) + C) % C;
        const gk = Math.floor(pxn / GRID_FT) + ',' + Math.floor(py / GRID_FT);
        if (gk === last) continue;
        last = gk;
        const arr = grid.get(gk);
        if (arr) arr.push(seg); else grid.set(gk, [seg]);
      }
    }
  }
  return {
    segments,
    widthAt(x: number, y: number): number {
      const xn = ((x % C) + C) % C;
      const cx = Math.floor(xn / GRID_FT), cy = Math.floor(y / GRID_FT);
      let best = 0;
      for (let dcx = -1; dcx <= 1; dcx++) for (let dcy = -1; dcy <= 1; dcy++) {
        const arr = grid.get((cx + dcx) + ',' + (cy + dcy));
        if (!arr) continue;
        for (const [ax, ay, bx, by, realFt] of arr) {
          if (realFt <= best) continue; // can't win — skip the arithmetic
          const h2 = (realFt / 2) * (realFt / 2);
          // a segment's ends may sit either side of the seam after unwrapping,
          // so offer the query at both neighbouring worlds too
          if (segDist2(xn, y, ax, ay, bx, by) < h2
            || segDist2(xn - C, y, ax, ay, bx, by) < h2
            || segDist2(xn + C, y, ax, ay, bx, by) < h2) best = realFt;
        }
      }
      return best;
    },
  };
}
