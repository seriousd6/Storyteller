// Round-3 probe #2: classify WHY road endpoints dangle, and river-mouth stats.
//   node audit-probe-endpoint-causes.mjs <v2 dir> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const v2 = process.argv[2];
const outPath = process.argv[3] || 'probe2-out.json';
const MI = 5280;

const world = JSON.parse(readFileSync(join(v2, 'public/labs/earth.example.json'), 'utf8'));
const plane = world.planes[0];
const CIRCUM = plane.terrain.circumFt;
const terrain = await import(pathToFileURL(join(v2, 'src/everdeep/terrain.ts')));
await terrain.ensureEarthGrid();
const cfg = { seed: world.seed, ...plane.terrain };
const WATER = new Set(['deep', 'water']);
const wet = (x, y) => WATER.has(terrain.biomeAt(cfg, x, y, 6));

const wrapDx = (a, b) => { let d = Math.abs(a - b) % CIRCUM; return d > CIRCUM / 2 ? CIRCUM - d : d; };
const dist = (ax, ay, bx, by) => Math.hypot(wrapDx(ax, bx), ay - by);

const anchorOf = new Map();
for (const a of plane.anchors) if (!anchorOf.has(a.entityId)) anchorOf.set(a.entityId, a);
const setts = [];
for (const e of Object.values(world.entities)) {
  if (e.kind !== 'settlement') continue;
  const a = anchorOf.get(e.id);
  if (a) setts.push({ x: a.x, y: a.y });
}

const roads = plane.routes.filter((r) => r.kind === 'road' || r.kind === 'highway');
const rivers = plane.routes.filter((r) => r.kind === 'river');

// settlement grid
const SG = 10 * MI, gk = (a, b) => a + ':' + b;
const settGrid = new Map();
for (const s of setts) { const k = gk(Math.floor(s.x / SG), Math.floor(s.y / SG)); if (!settGrid.has(k)) settGrid.set(k, []); settGrid.get(k).push(s); }
const nearSettD = (x, y, rings = 3) => {
  const cx = Math.floor(x / SG), cy = Math.floor(y / SG);
  let bd = Infinity;
  for (let dx = -rings; dx <= rings; dx++) for (let dy = -rings; dy <= rings; dy++)
    for (const s of settGrid.get(gk(cx + dx, cy + dy)) || []) { const d = dist(x, y, s.x, s.y); if (d < bd) bd = d; }
  return bd;
};

// road sample grid (for endpointâ†’other-road distance)
const RG = 2 * MI;
const roadGrid = new Map();
for (let ri = 0; ri < roads.length; ri++) {
  const pts = roads[ri].pts;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = dist(ax, ay, bx, by);
    const n = Math.max(1, Math.round(seg / MI));
    for (let k = 0; k <= n; k++) {
      let dx = bx - ax; if (dx > CIRCUM / 2) dx -= CIRCUM; else if (dx < -CIRCUM / 2) dx += CIRCUM;
      const x = (ax + dx * (k / n) + CIRCUM) % CIRCUM, y = ay + (by - ay) * (k / n);
      const key = gk(Math.floor(x / RG), Math.floor(y / RG));
      if (!roadGrid.has(key)) roadGrid.set(key, []);
      roadGrid.get(key).push({ x, y, ri });
    }
  }
}
const nearRoadD = (x, y, self, rings = 4) => {
  const cx = Math.floor(x / RG), cy = Math.floor(y / RG);
  let bd = Infinity;
  for (let dx = -rings; dx <= rings; dx++) for (let dy = -rings; dy <= rings; dy++)
    for (const s of roadGrid.get(gk(cx + dx, cy + dy)) || []) { if (s.ri === self) continue; const d = dist(x, y, s.x, s.y); if (d < bd) bd = d; }
  return bd;
};

const cls = { attached: 0, nearTrunkCut: 0, waterCut: 0, isolated: 0, isolatedFarFromEverything: 0 };
const histo = {};
for (let ri = 0; ri < roads.length; ri++) {
  const pts = roads[ri].pts;
  for (const [ex, ey, ix, iy] of [[...pts[0], ...pts[1]], [...pts[pts.length - 1], ...pts[pts.length - 2]]]) {
    const dS = nearSettD(ex, ey);
    const dR = nearRoadD(ex, ey, ri);
    const b = dS <= 2 * MI ? '<=2' : dS <= 5 * MI ? '2-5' : dS <= 15 * MI ? '5-15' : dS <= 30 * MI ? '15-30' : '>30';
    histo[b] = (histo[b] || 0) + 1;
    if (dS <= 2 * MI || dR <= 0.5 * MI) { cls.attached++; continue; }
    // water cut: the road was heading somewhere; is just-past-the-end wet?
    const dx = ex - ix, dy = ey - iy, m = Math.hypot(dx, dy) || 1;
    const beyondWet = wet(ex + (dx / m) * 4 * MI, ey + (dy / m) * 4 * MI) || wet(ex + (dx / m) * 8 * MI, ey + (dy / m) * 8 * MI);
    if (dR <= 6 * MI) cls.nearTrunkCut++;      // died within sight of another road
    else if (beyondWet) cls.waterCut++;         // died at a shore
    else if (dS === Infinity) cls.isolatedFarFromEverything++;
    else cls.isolated++;
  }
}

// rivers: mouth reaches water? both-ends-dry = dead-end (V9 class, re-measured)
let deadEnd = 0, reaches = 0;
for (const r of rivers) {
  const pts = r.pts;
  const wet0 = wet(pts[0][0], pts[0][1]), wetN = wet(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  if (wet0 || wetN) reaches++; else deadEnd++;
}

const out = { endpointClasses: cls, endpointSettDistHisto: histo, rivers: { total: rivers.length, mouthInWater: reaches, bothEndsDry: deadEnd } };
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
