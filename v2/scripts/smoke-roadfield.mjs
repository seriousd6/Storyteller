// "Is there a road here, and how wide is it?" (owner, item #30).
//
// A road had NO width. Not a wrong one — none. `mapView` drew it with
// `ctx.lineWidth = 2.6`, a SCREEN PIXEL: a highway was 2.6px across a third of
// Earth (≈21 miles wide) and still 2.6px standing in a 500-foot hex. There was
// no road in the world to detect, only a line on the glass — which is exactly
// why the hex inspector could tell you the biome, the altitude, the hex's span
// and what the land yields, and nothing at all about the highway through it.
//
// roadField.ts is riverField's twin, and the thing worth pinning is the
// TOLERANCE, because that is what makes it usable at all. A road is 10–100 ft
// wide, so a strict query hits only within 20 ft of the centreline — true, and
// useless for "does a road cross this hex?" when the finest hex in the app is
// 500 ft and a world hex is 60 MILES. Both are real questions. Get the reach
// wrong and the field answers "no road" while the road runs through the very
// next bucket.
//
// Part of `npm run smoke`.

import { readFileSync } from 'node:fs';
import { buildRoadField, ROAD_REAL_FT } from '../src/everdeep/roadField.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const MI = 5280;
const C = 131_477_280; // Earth's circumference in feet

// ---------- 1. the widths are real, and they are the owner's ----------
{
  const want = { highway: 100, road: 40, dirt: 10 };
  const got = Object.entries(want).filter(([k, v]) => ROAD_REAL_FT[k] !== v);
  got.length === 0
    ? ok(`widths are real feet: highway ${ROAD_REAL_FT.highway} · road ${ROAD_REAL_FT.road} · dirt ${ROAD_REAL_FT.dirt}`)
    : fail(`widths drifted from the owner's: ${JSON.stringify(got)}`);
}

// ---------- 2. a straight road, queried on and off the tarmac ----------
{
  const f = buildRoadField([{ kind: 'road', pts: [[1000 * MI, 0], [1000 * MI + 100 * MI, 0]] }], C);
  // dead centre: standing on it
  f.widthAt(1000 * MI + 50 * MI, 0) === 40
    ? ok('standing on a 40 ft road reads 40 ft')
    : fail(`on the road reads ${f.widthAt(1000 * MI + 50 * MI, 0)}, want 40`);
  // 15 ft off the centreline is still tarmac (half-width is 20 ft)
  f.widthAt(1000 * MI + 50 * MI, 15) === 40
    ? ok('15 ft off the centreline is still on the road (half-width 20 ft)')
    : fail('15 ft off the centreline fell off a 40 ft road');
  // 30 ft off is NOT. This is the assertion that would fail if the field
  // quietly treated a road as a bucket-wide smear.
  f.widthAt(1000 * MI + 50 * MI, 30) === 0
    ? ok('30 ft off a 40 ft road reads 0 — the field is not a smear')
    : fail(`30 ft off the road still reads ${f.widthAt(1000 * MI + 50 * MI, 30)} ft`);
  // ...but ASK forgivingly and it is there. This is the hex question.
  f.widthAt(1000 * MI + 50 * MI, 30, 250) === 40
    ? ok('the same point inside a 500 ft locale hex (tol 250 ft) finds the road')
    : fail('a tolerant query missed a road 30 ft away');
  f.kindAt(1000 * MI + 50 * MI, 0) === 'road'
    ? ok('kindAt names it')
    : fail(`kindAt said ${f.kindAt(1000 * MI + 50 * MI, 0)}`);
}

// ---------- 3. THE REGRESSION: reach must follow the tolerance ----------
// Buckets are 6 mi. A world hex is 60 mi, so "does a road cross this hex"
// reaches five buckets out. A field that sweeps only its own cell (as it would
// if the radius were hard-coded the way riverField can afford to, its widest
// river being 0.8 mi) answers "no road" for almost every world hex on Earth.
{
  const f = buildRoadField([{ kind: 'highway', pts: [[1000 * MI, 0], [1000 * MI, 200 * MI]] }], C);
  const off = 25 * MI; // 25 mi from the road: well outside its own 6 mi bucket
  f.widthAt(1000 * MI + off, 100 * MI) === 0
    ? ok('25 mi from the highway, a strict query says no road')
    : fail('a strict query found a highway 25 miles away');
  f.widthAt(1000 * MI + off, 100 * MI, 30 * MI) === 100
    ? ok('a world hex (tol 30 mi) reaches 5 buckets out and finds it')
    : fail(`tol 30 mi missed a highway ${off / MI} mi away — the sweep radius does not follow the tolerance`);
  f.widthAt(1000 * MI + off, 100 * MI, 10 * MI) === 0
    ? ok('a 20 mi tolerance correctly does NOT reach it (25 mi away)')
    : fail('tolerance is not being honoured — a 10 mi reach found a road 25 mi off');
}

// ---------- 4. the seam is not a wall ----------
{
  // a road straddling the date line, written the way emit() leaves it (unwrapped)
  const f = buildRoadField([{ kind: 'road', pts: [[C - 10 * MI, 0], [C + 10 * MI, 0]] }], C);
  f.widthAt(5 * MI, 0) === 40 && f.widthAt(C - 5 * MI, 0) === 40
    ? ok('a road across the antimeridian is found from both sides of the seam')
    : fail(`the seam broke the field: east ${f.widthAt(5 * MI, 0)}, west ${f.widthAt(C - 5 * MI, 0)}`);
}

// ---------- 5. the widest road wins where they overlap ----------
{
  const f = buildRoadField([
    { kind: 'dirt', pts: [[1000 * MI, 0], [1000 * MI + 50 * MI, 0]] },
    { kind: 'highway', pts: [[1000 * MI, 0], [1000 * MI + 50 * MI, 0]] },
  ], C);
  f.kindAt(1000 * MI + 25 * MI, 0) === 'highway'
    ? ok('where a track shares a highway’s course, the point reads highway')
    : fail(`overlapping roads picked ${f.kindAt(1000 * MI + 25 * MI, 0)}`);
}

// ---------- 6. rivers are not roads ----------
{
  const f = buildRoadField([
    { kind: 'river', w: 4, pts: [[1000 * MI, 0], [1000 * MI + 50 * MI, 0]] },
    { kind: 'seaRoute', pts: [[1000 * MI, 0], [1000 * MI + 50 * MI, 0]] },
  ], C);
  f.segments === 0 && f.widthAt(1000 * MI + 25 * MI, 0) === 0
    ? ok('a river and a sea route index as no road at all')
    : fail(`the field indexed ${f.segments} non-road segment(s)`);
}

// ---------- 7. the shipped Earth ----------
{
  const w = JSON.parse(readFileSync(new URL('../public/labs/earth.example.json', import.meta.url), 'utf8'));
  const routes = w.planes[0].routes ?? [];
  const circumFt = w.planes[0].terrain.circumFt;
  const f = buildRoadField(routes, circumFt);
  const ROADS = new Set(Object.keys(ROAD_REAL_FT));
  const roads = routes.filter((r) => ROADS.has(r.kind));
  console.log(`   ${roads.length} roads, ${f.segments.toLocaleString()} segments indexed`);
  f.segments > 1000
    ? ok(`the shipped network indexes (${f.segments.toLocaleString()} segments)`)
    : fail(`only ${f.segments} road segments indexed — the field is empty`);

  // Every road vertex must read as road. If this fails nothing else matters:
  // it is the vertices-are-not-a-line bug (item #23) all over again, which has
  // now been made three times in this repo.
  let dry = 0, tot = 0;
  for (const r of roads) for (const [x, y] of r.pts) { tot++; if (f.widthAt(x, y) === 0) dry++; }
  dry === 0
    ? ok(`all ${tot.toLocaleString()} road vertices read as road`)
    : fail(`${dry}/${tot} road vertices read as NO ROAD`);

  // ...and so must the tarmac BETWEEN two vertices. Earth's roads carry a
  // vertex every ~8 miles and a highway is 100 FEET wide: index the vertices
  // instead of the segments and the road exists at 0.02% of the places it runs.
  let mid = 0, midTot = 0;
  for (const r of roads) {
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
      if (Math.abs(bx - ax) > circumFt / 2) continue; // seam split
      for (let s = 1; s <= 9; s++) {
        const t = s / 10;
        midTot++;
        if (f.widthAt(ax + (bx - ax) * t, ay + (by - ay) * t) === 0) mid++;
      }
    }
  }
  mid === 0
    ? ok(`all ${midTot.toLocaleString()} points BETWEEN vertices read as road too (segments, not beads)`)
    : fail(`${mid}/${midTot} points mid-segment read as no road — the field indexes vertices, not lines`);
}

console.log(failures ? `\nFAILED: ${failures}` : '\nroad-field smoke passed.');
process.exit(failures ? 1 : 0);
