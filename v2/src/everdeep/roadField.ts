// "Is there a road here, and how wide is it?" — the twin of riverField.ts
// (owner: "perhaps it will be easier to detect where roads are?").
//
// A road had no width. Not a wrong width — NONE. `mapView` drew one with
// `ctx.lineWidth = 2.6`, and that is a SCREEN PIXEL: a highway was 2.6px looking
// at a third of Earth (where 2.6px is some 21 miles) and still 2.6px standing in
// a 500-foot locale hex. So there was no road in the world to detect, only a
// line on the glass, and every caller that wanted to know where the roads were
// had to re-derive it from the polyline itself.
//
// Rivers never had this problem because a river carries RIVER_REAL_FT and the
// hexes ASK the field (`widthAt`). That is the whole trick, and it is worth
// being precise about it, because it is easy to assume rivers are painted into
// hexes: they are not. A river is a polyline plus a real width, indexed by
// SEGMENT into 6-mile buckets. Its hex-ness is derived at draw time and never
// stored. Roads are curves too, so they get the same treatment — and it costs
// the 10,984 vertices already in the file rather than the ~9.7 MILLION hexes
// tracing Earth's 73,484 miles of road at 40-foot grain would take.
//
// TOLERANCE is the part that makes this usable. A road is 10–100 ft wide, so a
// strict `widthAt` hits only within 20 ft of the centreline — true, and useless
// for "does a road cross this hex?", because the finest hex in the app (locale)
// is 500 ft across and a world hex is 60 MILES. Both are real questions, so the
// caller says how forgiving to be:
//
//   widthAt(x, y)                 -> am I standing ON the road?
//   widthAt(x, y, hexFt / 2)      -> does a road run through this hex?

/** Real edge-to-edge width (ft) by road class (owner: dirt 10, road 40,
 *  highway 100). A path is a trodden line through grass, not built. */
export const ROAD_REAL_FT: Record<string, number> = { highway: 100, road: 40, dirt: 10, path: 4 };

/** The "atlas line" width (screen px) a road is drawn at when its true width is
 *  too fine to see — a highway reads a touch bolder than a dirt track. */
export function roadAtlasWidth(kind: string): number {
  return kind === 'highway' ? 2.6 : kind === 'dirt' ? 1.2 : 1.8;
}

/** The line width (screen px) to stroke a road of `kind` at pixels-per-foot
 *  `ppf`: the atlas line when far out, its TRUE real-feet width once that is the
 *  wider of the two. The map (mapView) strokes with exactly this — keeping the
 *  ladder here beside ROAD_REAL_FT means there is ONE definition, not a copy in
 *  the renderer and another in the test. (The regression it guards: lineWidth was
 *  once a flat pixel count, so a highway stayed a 2.6px hairline however far you
 *  zoomed in, instead of thickening toward its real 100 ft.) */
export function roadLineWidth(kind: string, ppf: number): number {
  return Math.max(roadAtlasWidth(kind), (ROAD_REAL_FT[kind] ?? 40) * ppf);
}

const GRID_FT = 31_680; // 6 mi buckets, as riverField uses
const MAX_HALF_FT = 50; // widest road / 2 — the reach of a strict query

export interface RoadRouteLike {
  kind?: string;
  pts: Array<[number, number]>;
}

/** [ax, ay, bx, by, realFt] — a segment in world feet, x already normalised. */
type Seg = [number, number, number, number, number];

export interface RoadField {
  /** Real width (ft) of the widest road within `tolFt` of this point, or 0. */
  widthAt(x: number, y: number, tolFt?: number): number;
  /** The kind of that road, or null. */
  kindAt(x: number, y: number, tolFt?: number): string | null;
  /** How many segments were indexed — diagnostics. */
  readonly segments: number;
}

const KIND_OF: Map<number, string> = new Map(
  Object.entries(ROAD_REAL_FT).map(([k, ft]) => [ft, k]),
);

/** Squared distance from (px,py) to segment (ax,ay)-(bx,by). */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const d2 = dx * dx + dy * dy;
  let t = d2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / d2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + dx * t - px, qy = ay + dy * t - py;
  return qx * qx + qy * qy;
}

/** Bucket every road SEGMENT into the cells it passes through.
 *
 *  Segments, not vertices. riverField's comment earns repeating because the
 *  same mistake has now been made three times in this repo (the river field,
 *  the bridge probe, and my own 4-mile lattice in landRoute.ts): a line is not
 *  its endpoints, and indexing the points you happen to have stored is not
 *  indexing the thing they describe. Earth's roads carry a vertex every 8 miles
 *  or so; a highway is 100 FEET wide. Treat each vertex as a disc and the road
 *  exists at 0.02% of the places it actually runs. */
export function buildRoadField(routes: readonly RoadRouteLike[], circumFt: number): RoadField {
  const grid = new Map<string, Seg[]>();
  const C = circumFt;
  let segments = 0;
  for (const rt of routes) {
    const realFt = ROAD_REAL_FT[rt.kind ?? ''];
    if (!realFt) continue; // rivers, sea routes, anything that isn't a road
    for (let i = 1; i < rt.pts.length; i++) {
      const ax = ((rt.pts[i - 1]![0] % C) + C) % C, ay = rt.pts[i - 1]![1];
      let bx = ((rt.pts[i]![0] % C) + C) % C;
      const by = rt.pts[i]![1];
      // unwrap b next to a, so a segment crossing the date line stays a short
      // segment instead of a world-long one smeared across every cell between
      if (bx - ax > C / 2) bx -= C; else if (ax - bx > C / 2) bx += C;
      const seg: Seg = [ax, ay, bx, by, realFt];
      segments++;
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
  const best = (x: number, y: number, tolFt: number): number => {
    const xn = ((x % C) + C) % C;
    const cx = Math.floor(xn / GRID_FT), cy = Math.floor(y / GRID_FT);
    // The sweep must reach as far as the question does. A strict query touches
    // one bucket; "does a road cross this 60-mile hex" reaches five. Deriving
    // the radius from the tolerance is what stops a forgiving query quietly
    // reading only the bucket it landed in and answering "no road" while the
    // road runs through the next one.
    const rad = Math.ceil((tolFt + MAX_HALF_FT) / GRID_FT);
    let out = 0;
    for (let dcx = -rad; dcx <= rad; dcx++) {
      for (let dcy = -rad; dcy <= rad; dcy++) {
        const arr = grid.get((cx + dcx) + ',' + (cy + dcy));
        if (!arr) continue;
        for (const [ax, ay, bx, by, realFt] of arr) {
          if (realFt <= out) continue; // can't win — skip the arithmetic
          const reach = realFt / 2 + tolFt;
          const h2 = reach * reach;
          // a segment's ends may sit either side of the seam after unwrapping,
          // so offer the query at both neighbouring worlds too
          if (segDist2(xn, y, ax, ay, bx, by) < h2
            || segDist2(xn - C, y, ax, ay, bx, by) < h2
            || segDist2(xn + C, y, ax, ay, bx, by) < h2) out = realFt;
        }
      }
    }
    return out;
  };
  return {
    segments,
    widthAt: (x, y, tolFt = 0) => best(x, y, tolFt),
    kindAt: (x, y, tolFt = 0) => KIND_OF.get(best(x, y, tolFt)) ?? null,
  };
}
