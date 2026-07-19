// Round-3 probe #4: river-river polyline crossings (excluding confluences â€”
// crossings more than 2 mi from any shared near-touch don't count as joins).
//   node audit-probe-river-crossings.mjs <v2 dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v2 = process.argv[2];
const MI = 5280;
const world = JSON.parse(readFileSync(join(v2, 'public/labs/earth.example.json'), 'utf8'));
const plane = world.planes[0];
const CIRCUM = plane.terrain.circumFt;
const rivers = plane.routes.filter((r) => r.kind === 'river');

// unwrap each river once (consecutive pts are already seam-unwrapped in data)
const segs = [];
for (let ri = 0; ri < rivers.length; ri++) {
  const pts = rivers[ri].pts;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (Math.abs(bx - ax) > CIRCUM / 2) continue;
    segs.push({ ax, ay, bx, by, ri, i });
  }
}
const gk = (a, b) => a + ':' + b;
const G = 4 * MI, grid = new Map();
segs.forEach((s, si) => {
  const x0 = Math.min(s.ax, s.bx), x1 = Math.max(s.ax, s.bx);
  const y0 = Math.min(s.ay, s.by), y1 = Math.max(s.ay, s.by);
  for (let cx = Math.floor(x0 / G); cx <= Math.floor(x1 / G); cx++)
    for (let cy = Math.floor(y0 / G); cy <= Math.floor(y1 / G); cy++) {
      const k = gk(cx, cy);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(si);
    }
});
const cross = (s, t) => {
  const d1x = s.bx - s.ax, d1y = s.by - s.ay, d2x = t.bx - t.ax, d2y = t.by - t.ay;
  const den = d1x * d2y - d1y * d2x;
  if (den === 0) return null;
  const u = ((t.ax - s.ax) * d2y - (t.ay - s.ay) * d2x) / den;
  const v = ((t.ax - s.ax) * d1y - (t.ay - s.ay) * d1x) / den;
  if (u <= 0.02 || u >= 0.98 || v <= 0.02 || v >= 0.98) return null; // endpoint touch = confluence
  return [s.ax + d1x * u, s.ay + d1y * u];
};
const hits = [];
const seenPair = new Set();
for (const [, arr] of grid) {
  for (let a = 0; a < arr.length; a++) for (let b = a + 1; b < arr.length; b++) {
    const s = segs[arr[a]], t = segs[arr[b]];
    if (s.ri === t.ri) continue;
    const pk = s.ri < t.ri ? s.ri + '|' + t.ri : t.ri + '|' + s.ri;
    const p = cross(s, t);
    if (!p) continue;
    const key = pk + '@' + Math.round(p[0] / (2 * MI)) + ',' + Math.round(p[1] / (2 * MI));
    if (seenPair.has(key)) continue;
    seenPair.add(key);
    hits.push({ a: rivers[s.ri].id, aw: rivers[s.ri].w, b: rivers[t.ri].id, bw: rivers[t.ri].w, x: Math.round(p[0]), y: Math.round(p[1]) });
  }
}
console.log(JSON.stringify({ riverCrossings: hits.length, sample: hits.slice(0, 15) }, null, 2));
