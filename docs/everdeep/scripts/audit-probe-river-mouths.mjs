// Round-3 probe #3: true river dead-ends = mouth reaches neither water nor a
// confluence with another river (within 1.5 mi of another river's polyline).
//   node audit-probe-river-mouths.mjs <v2 dir>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const v2 = process.argv[2];
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

const rivers = plane.routes.filter((r) => r.kind === 'river');
const RG = 2 * MI, gk = (a, b) => a + ':' + b;
const grid = new Map();
for (let ri = 0; ri < rivers.length; ri++) {
  const pts = rivers[ri].pts;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = dist(ax, ay, bx, by), n = Math.max(1, Math.round(seg / MI));
    for (let k = 0; k <= n; k++) {
      let dx = bx - ax; if (dx > CIRCUM / 2) dx -= CIRCUM; else if (dx < -CIRCUM / 2) dx += CIRCUM;
      const x = (ax + dx * (k / n) + CIRCUM) % CIRCUM, y = ay + (by - ay) * (k / n);
      const key = gk(Math.floor(x / RG), Math.floor(y / RG));
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push({ x, y, ri });
    }
  }
}
const nearOther = (x, y, self) => {
  const cx = Math.floor(x / RG), cy = Math.floor(y / RG);
  let bd = Infinity;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++)
    for (const s of grid.get(gk(cx + dx, cy + dy)) || []) { if (s.ri === self) continue; const d = dist(x, y, s.x, s.y); if (d < bd) bd = d; }
  return bd;
};

let ok = 0; const dead = [];
for (let ri = 0; ri < rivers.length; ri++) {
  const pts = rivers[ri].pts;
  const ends = [pts[0], pts[pts.length - 1]];
  const good = ends.some(([x, y]) => wet(x, y) || nearOther(x, y, ri) <= 1.5 * MI);
  if (good) ok++;
  else dead.push({ route: rivers[ri].id, band: rivers[ri].w, x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] });
}
console.log(JSON.stringify({ rivers: rivers.length, mouthOk: ok, trueDeadEnds: dead.length, sample: dead.slice(0, 12) }, null, 2));
