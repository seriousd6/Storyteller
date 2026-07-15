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

console.log(failures ? `River-field smoke: ${failures} FAILURES` : 'River-field smoke: all green.');
process.exit(failures ? 1 : 0);
