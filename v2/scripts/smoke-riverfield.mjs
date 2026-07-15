// River-field smoke (items #6/#23): a river is a BAND of water, not a string of
// beads.
//
// buildRiverField used to index the route's VERTICES and treat each as a disc of
// the river's own width. On the shipped Earth the median gap between vertices is
// 7.67 mi and a great river is 1.61 mi wide, so consecutive discs never touched:
// "hexes under rivers are water" fired only at the checkpoints and left a single
// water hex floating mid-river, ringed — after batch 110 — with its own beach.
//
// It lived as a closure inside mountMap, where nothing could reach it, which is
// why it went unnoticed. It is a module now, so this file can hold it to
// account. Part of `npm run smoke`.

import { readFileSync } from 'node:fs';
import { buildRiverField, RIVER_REAL_FT } from '../src/everdeep/riverField.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const w = JSON.parse(readFileSync(new URL('../public/labs/earth.example.json', import.meta.url), 'utf8'));
const routes = w.planes[0].routes ?? [];
const circumFt = w.planes[0].terrain.circumFt;
const rivers = routes.filter((r) => r.kind === 'river' && (r.w ?? 2) >= 2);

const field = buildRiverField(routes, circumFt);
console.log(`   ${rivers.length} navigable rivers, ${field.segments.toLocaleString()} segments indexed`);

// --- the vertices themselves must be wet. If this fails, nothing else matters.
let vDry = 0, vTot = 0;
for (const r of rivers) for (const [x, y] of r.pts) { vTot++; if (field.widthAt(x, y) === 0) vDry++; }
vDry === 0
  ? ok(`all ${vTot.toLocaleString()} river vertices read as water`)
  : fail(`${vDry}/${vTot} river vertices read as DRY LAND`);

// --- THE REGRESSION: the water between two vertices.
// Walk each segment at 10 interior points. Under vertex-indexing these came
// back dry the moment a segment was longer than the river is wide — which, on
// this fixture, is every single one of them.
let mDry = 0, mTot = 0;
const worst = new Map();
for (const r of rivers) {
  const realFt = RIVER_REAL_FT[Math.min(4, r.w ?? 2)] ?? 900;
  for (let i = 1; i < r.pts.length; i++) {
    const [ax, ay] = r.pts[i - 1], [bx, by] = r.pts[i];
    if (Math.abs(bx - ax) > circumFt / 2) continue; // date-line hop in the data
    for (let k = 1; k <= 10; k++) {
      const t = k / 11;
      mTot++;
      const got = field.widthAt(ax + (bx - ax) * t, ay + (by - ay) * t);
      if (got === 0) { mDry++; worst.set(r.id, (worst.get(r.id) ?? 0) + 1); }
      else if (got < realFt) { /* a wider river nearby wins — fine */ }
    }
  }
}
console.log(`   sampled ${mTot.toLocaleString()} points BETWEEN vertices: ${mDry} dry`);
mDry === 0
  ? ok('every point along a river reads as water — the river is a band, not beads')
  : fail(`${mDry}/${mTot} mid-segment points read as dry land (${worst.size} rivers have gaps)`);

// --- and it must still be a river, not a flood: dry land a good way off
let wetOff = 0;
for (const r of rivers.slice(0, 40)) {
  const realFt = RIVER_REAL_FT[Math.min(4, r.w ?? 2)] ?? 900;
  const [x, y] = r.pts[Math.floor(r.pts.length / 2)];
  // 5x the river's own width to the north and south
  if (field.widthAt(x, y + realFt * 5) > 0) wetOff++;
  if (field.widthAt(x, y - realFt * 5) > 0) wetOff++;
}
wetOff <= 8 // a confluence or a parallel channel can legitimately be near
  ? ok(`the water stops at the banks (${wetOff}/80 probes 5 widths off were wet)`)
  : fail(`${wetOff}/80 probes five river-widths from the bank are wet — the field is smeared`);

// --- the seam. A river crossing the date line must not read as dry there.
const straddling = rivers.filter((r) =>
  r.pts.some((p, i) => i > 0 && Math.abs(p[0] - r.pts[i - 1][0]) > circumFt / 2));
console.log(`   ${straddling.length} rivers straddle the date line`);
if (straddling.length) {
  const anyWet = straddling.every((r) => r.pts.every(([x, y]) => field.widthAt(x, y) > 0));
  anyWet ? ok('date-line rivers are still wet at every vertex') : fail('a date-line river went dry at the seam');
}

// --- item #25: a tributary JOINS a bigger river; it does not cross it and
// escape out the far side. Was 44 pairs, all of them a traced band-2 tributary
// passing straight through an AUTHORED trunk (zero same-band), because those
// tributaries were traced against the original drainage and never learned the
// trunk had moved. joinTributaries() cuts each at its confluence.
const G = 316_800;
const segs = [];
const buckets = new Map();
for (const r of rivers) {
  for (let i = 1; i < r.pts.length; i++) {
    const a = r.pts[i - 1], b = r.pts[i];
    if (Math.abs(b[0] - a[0]) > circumFt / 2) continue;
    const idx = segs.length;
    segs.push({ id: r.id, w: r.w ?? 2, a, b });
    const x0 = Math.floor(Math.min(a[0], b[0]) / G), x1 = Math.floor(Math.max(a[0], b[0]) / G);
    const y0 = Math.floor(Math.min(a[1], b[1]) / G), y1 = Math.floor(Math.max(a[1], b[1]) / G);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const k = gx + ',' + gy;
      const arr = buckets.get(k); if (arr) arr.push(idx); else buckets.set(k, [idx]);
    }
  }
}
// interior only: two rivers MEETING at an endpoint is a confluence, which is
// the whole point — it's passing THROUGH that is impossible
const crosses = (p1, p2, p3, p4) => {
  const rx = p2[0] - p1[0], ry = p2[1] - p1[1], sx = p4[0] - p3[0], sy = p4[1] - p3[1];
  const den = rx * sy - ry * sx;
  if (!den) return false;
  const t = ((p3[0] - p1[0]) * sy - (p3[1] - p1[1]) * sx) / den;
  const u = ((p3[0] - p1[0]) * ry - (p3[1] - p1[1]) * rx) / den;
  return t > 0.02 && t < 0.98 && u > 0.02 && u < 0.98;
};
const seenPair = new Set();
const crossing = new Set();
for (const arr of buckets.values()) {
  for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++) {
    const A = segs[arr[i]], B = segs[arr[j]];
    if (A.id === B.id) continue;
    const key = arr[i] < arr[j] ? arr[i] + ':' + arr[j] : arr[j] + ':' + arr[i];
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    if (crosses(A.a, A.b, B.a, B.b)) crossing.add([A.id, B.id].sort().join('|'));
  }
}
console.log(`   ${segs.length.toLocaleString()} segments checked pairwise for mid-course crossings`);
crossing.size === 0
  ? ok('no river crosses another mid-course — a tributary joins, it does not pass through')
  : fail(`${crossing.size} river pairs cross mid-course: ${[...crossing].slice(0, 4).join(' ')}`);

// and the cut must not have shredded the network into stubs
const lens = rivers.map((r) => {
  let L = 0;
  for (let i = 1; i < r.pts.length; i++) L += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]);
  return L / 5280;
});
const stubs = lens.filter((l) => l < 1).length;
stubs === 0
  ? ok(`no river is a stub (shortest ${Math.min(...lens).toFixed(1)} mi, median ${lens.slice().sort((a, b) => a - b)[Math.floor(lens.length / 2)].toFixed(0)} mi)`)
  : fail(`${stubs} rivers are under a mile long — the confluence cut is eating them`);

console.log(failures ? `River-field smoke: ${failures} FAILURES` : 'River-field smoke: all green.');
process.exit(failures ? 1 : 0);
