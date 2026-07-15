// Roads stay out of the sea (item #24).
//
// The owner's report was "still having crazy road generation": roads drawn
// straight across bays and straits. 102 of the shipped Earth's 550 roads swam —
// 1,882 road-miles of open water, 41 of them crossing more than 15 miles at a
// stretch, the worst a 70-mile highway over the sea. None of the worst ten had a
// bridge anywhere near.
//
// The road A* never enters a water hex, which is exactly why this went unfixed
// for so long: the generator looked correct, and it IS correct — at its own
// resolution. Measured, the blame split almost exactly in half between two
// scale bugs that both LOOK like a working planner:
//
//   52%  `hydrology.ts` builds its land map from ONE sample per 60-mile hex —
//        the centre. A hex that is 90% bay reads as solid ground, so the
//        planner's "land" path was never on land. 3.7% of Earth's land hexes
//        are majority water.
//   48%  the drawn line left the planned cells entirely: the corner-jitter and
//        two Chaikin passes that give a road its hand-drawn wander cut straight
//        across the coast those cells were hugging.
//
// So this file guards two different things, and it needs both:
//   1. hugLand's logic, against synthetic coasts where the right answer is
//      known exactly (no rasters, no world — just geometry).
//   2. the SHIPPED fixture, which is the only thing that proves the pass is
//      actually wired into the roads a user sees.
//
// Part of `npm run smoke`.

import { readFileSync } from 'node:fs';
import { hugLand, dryRun, snapDry } from '../src/everdeep/landRoute.ts';
import { biomeAt, ensureEarthGrid, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const MI = 5280;

// ---------- 1. synthetic coasts ----------
// A wet band across the middle of the world, dry everywhere else.
const strait = (halfWidthMi) => ({ wet: (x, y) => Math.abs(y) < halfWidthMi * MI });
// A circular bay centred at the origin: you can walk around it, but not across.
const bay = (radiusMi) => ({ wet: (x, y) => Math.hypot(x, y) < radiusMi * MI });

const allDry = (pts, probe) => {
  for (let i = 1; i < pts.length; i++) if (!dryRun(pts[i - 1], pts[i], probe, MI / 2)) return false;
  return !pts.some(([x, y]) => probe.wet(x, y));
};
const lenMi = (pts) => {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]) / MI;
  return d;
};

// a road nowhere near water must come back IDENTICAL — same array, untouched.
// 82% of roads take this path and any reshaping of them is a regression.
{
  const line = [[0, 500 * MI], [100 * MI, 520 * MI], [200 * MI, 500 * MI]];
  const out = hugLand(line, strait(50), {});
  out.length === 1 && out[0] === line
    ? ok('a road clear of water is returned untouched (same array, no reshaping)')
    : fail(`dry road was reshaped: ${out.length} piece(s), identical=${out[0] === line}`);
}

// Planned roads reach here already smoothed, so they carry a vertex every few
// miles, not one every hundred. Both of the cases below hinge on that: the
// vertices INSIDE the water are the ones the pass has to deal with.
const along = (from, to, stepMi, axis) => {
  const out = [];
  for (let d = from; d <= to; d += stepMi) out.push(axis === 'x' ? [d * MI, 0] : [0, d * MI]);
  return out;
};

// a road round a bay: it must stay dry AND still arrive.
{
  const line = along(-200, 200, 25, 'x'); // straight through the middle of it
  const out = hugLand(line, bay(60), {});
  if (out.length !== 1) fail(`bay: expected the road to go around in one piece, got ${out.length}`);
  else if (!allDry(out[0], bay(60))) fail('bay: the detour is still wet');
  else {
    const a = out[0][0], b = out[0][out[0].length - 1];
    const kept = Math.abs(a[0] - -200 * MI) < MI && Math.abs(b[0] - 200 * MI) < MI;
    kept
      ? ok(`bay: routed around dry-shod — ${lenMi(out[0]).toFixed(0)}mi vs 400mi straight, both ends kept`)
      : fail('bay: the detour lost an end of the road');
  }
}

// A strait too wide to walk around is NOT a road. It must split, not swim — and
// not silently vanish either: there is land on both sides, and a road on each.
{
  const line = along(-300, 300, 25, 'y');
  const out = hugLand(line, strait(60), {});
  if (out.length !== 2) fail(`strait: expected 2 pieces (a road each side), got ${out.length}`);
  else if (!out.every((p) => allDry(p, strait(60)))) fail('strait: a piece is still wet');
  else if (!out.every((p) => lenMi(p) > 100)) fail(`strait: split, but the pieces are stubs (${out.map((p) => lenMi(p).toFixed(0) + 'mi')})`);
  else ok(`strait: 120mi of open sea splits the road in two rather than bridging it (${out.map((p) => lenMi(p).toFixed(0) + 'mi').join(' + ')})`);
}

// snapDry finds the shore, not merely somewhere ashore.
{
  const p = snapDry([0, 0], strait(20), MI / 2, 60 * MI);
  p && Math.abs(Math.abs(p[1]) - 20 * MI) < 2 * MI
    ? ok(`snapDry pulls a point in open water to the NEAREST shore (${(p[1] / MI).toFixed(1)}mi, shore at 20mi)`)
    : fail(`snapDry landed at ${p ? (p[1] / MI).toFixed(1) + 'mi' : 'nowhere'}, shore is 20mi away`);
}

// mid-ocean, with no land within reach, there is nothing to snap to
{
  snapDry([0, 0], { wet: () => true }, MI, 30 * MI) === null
    ? ok('snapDry gives up rather than inventing land in mid-ocean')
    : fail('snapDry invented dry land in an all-water world');
}

// ---------- 2. the shipped Earth ----------
await ensureEarthGrid();
const cfg = {
  seed: 'earth', landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT,
  waterPct: 50, climate: 'temperate', climateModel: 'earthlike',
};
const SEA = new Set(['deep', 'water']);
const wet = (x, y) => SEA.has(biomeAt(cfg, x, y, 6));

const w = JSON.parse(readFileSync(new URL('../public/labs/earth.example.json', import.meta.url), 'utf8'));
const ROADS = new Set(['highway', 'road', 'dirt', 'path']);
const roads = (w.planes[0].routes ?? []).filter((r) => ROADS.has(r.kind));

// Walk every road at 2mi — the Earth coast raster is ~2.3mi/px, so a finer step
// would only measure the raster's own noise.
const STEP = 2 * MI;
let swimmers = 0, wetMi = 0, worst = 0, worstId = null;
for (const rt of roads) {
  let hereWet = 0, run = 0, longest = 0;
  for (let i = 1; i < rt.pts.length; i++) {
    const [ax, ay] = rt.pts[i - 1], [bx, by] = rt.pts[i];
    const segFt = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(segFt / STEP));
    for (let s = 0; s < n; s++) {
      const t = (s + 0.5) / n;
      const mi = segFt / n / MI;
      if (wet(ax + (bx - ax) * t, ay + (by - ay) * t)) { hereWet += mi; run += mi; if (run > longest) longest = run; }
      else run = 0;
    }
  }
  if (hereWet > 0.5) swimmers++;
  wetMi += hereWet;
  if (longest > worst) { worst = longest; worstId = rt.id; }
}
console.log(`   ${roads.length} roads walked at 2mi`);

// The thresholds are deliberately not zero. Both this walk and hugLand's own
// check sample POINTS along a line, so they agree only up to their sampling
// phase, and both are finer than the 2.3mi/px coast raster underneath. A
// sub-2mi disagreement is one pixel of raster noise, not a road in the sea.
// What must never come back is a CROSSING: water you could see, or would need a
// bridge for. Before this pass: 102 swimmers, 1,882mi, worst 70.1mi.
worst <= 3
  ? ok(`no road crosses more than ${worst.toFixed(1)}mi of water (was 70.1mi)`)
  : fail(`a road crosses ${worst.toFixed(1)}mi of open water: ${worstId}`);
wetMi <= 20
  ? ok(`${wetMi.toFixed(1)} road-miles over water in total, across ${swimmers} road(s) (was 1,882mi across 102)`)
  : fail(`${wetMi.toFixed(0)} road-miles of the world's roads are over open water (was 1,882)`);

// The network must still BE a network: keeping roads dry is easy if you delete
// them. Length is the cheap proof that we routed around the water instead.
let total = 0;
for (const rt of roads) total += lenMi(rt.pts);
total > 60_000
  ? ok(`the network survived: ${Math.round(total).toLocaleString()}mi of road (was 73,051mi swimming)`)
  : fail(`the road network collapsed to ${Math.round(total).toLocaleString()}mi — dry because it was deleted`);

console.log(failures ? `\nFAILED: ${failures}` : '\nland-route smoke passed.');
process.exit(failures ? 1 : 0);
