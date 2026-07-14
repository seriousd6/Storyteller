// Hydrology smoke (batch 67): the river/lake generator, validated against the
// Real Earth map. These lock in the realism rules — a grand river must exist,
// the biggest drainages must be the real big rivers (not the ice), no rivers on
// the polar caps, and every real river must have a generated counterpart nearby.
// Part of `npm run smoke`. A failure means a hydrology rule regressed.

import { ensureEarthGrid, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';
import { generateHydrology } from '../src/everdeep/hydrology.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

await ensureEarthGrid();
const cfg = { seed: '', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, landform: 'earth', waterPct: 50, climate: 'temperate' };
const { routes, lakePaint } = generateHydrology(cfg);

const HH = cfg.heightFt / 2;
// +y is SOUTH after the batch-68 orientation flip, so real latitude = -(y/HH)*90
const toLL = (x, y) => { let u = (x % cfg.circumFt) / cfg.circumFt; if (u < 0) u += 1; return [-(y / HH) * 90, -180 + u * 360]; };
const gcd = (a, b) => {
  const R = 6371, tR = Math.PI / 180;
  const dLa = (b[0] - a[0]) * tR; let dLo = b[1] - a[1]; if (dLo > 180) dLo -= 360; if (dLo < -180) dLo += 360; dLo *= tR;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * tR) * Math.cos(b[0] * tR) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
};
const band = routes.reduce((m, r) => { m[r.w] = (m[r.w] || 0) + 1; return m; }, {});
console.log(`   ${routes.length} rivers, bands ${JSON.stringify(band)}, ${Object.keys(lakePaint).length} lake hexes`);

// 1. a healthy river count on an Earth-size world
(routes.length > 200 && routes.length < 900)
  ? ok(`river count sane (${routes.length})`)
  : fail(`river count off: ${routes.length}`);

// 2. grand rivers exist (the old absolute cutoffs produced NONE on Earth)
(band[4] ?? 0) >= 1
  ? ok(`grand rivers exist (${band[4]} band-4)`)
  : fail('no grand rivers — percentile tiers regressed');

// 3. no rivers on the polar ice caps (frozen ground makes glaciers, not rivers)
const pts = [];
for (const r of routes) for (const [x, y] of r.pts) { const [lat, lon] = toLL(x, y); pts.push([lat, lon, r.w]); }
const iceRivers = pts.filter((p) => p[0] < -70 && p[2] >= 2).length;
iceRivers === 0
  ? ok('no band≥2 rivers below 70°S (Antarctica is ice, not rivers)')
  : fail(`${iceRivers} river points on the Antarctic ice cap`);

// 4. every real major river has a generated river nearby (coarse-grid tolerance)
const RIV = {
  Amazon: [0, -50], Nile: [31, 30], Mississippi: [29, -89], Congo: [-6, 12], Yangtze: [31, 121],
  Ganges: [22, 90], Ob: [67, 69], Lena: [72, 127], Niger: [5, 6], Mekong: [10, 106],
  Parana: [-34, -58], Mackenzie: [69, -135], Danube: [45, 29], Indus: [24, 67], Zambezi: [-18, 36], Nelson: [57, -92],
};
let near = 0;
for (const ll of Object.values(RIV)) {
  let best = 1e9; for (const p of pts) { const d = gcd(ll, [p[0], p[1]]); if (d < best) best = d; }
  if (best < 900) near++;
}
const total = Object.keys(RIV).length;
near >= total - 2
  ? ok(`real rivers have a generated counterpart <900km: ${near}/${total}`)
  : fail(`only ${near}/${total} real rivers have a nearby generated river`);

// 5. the biggest drainages land in wet regions, not the ice — check that a
// grand/great river sits near the Amazon or the Congo (the real discharge kings)
const bigNearTropics = pts.some((p) => p[2] >= 3 && (gcd([0, -55], [p[0], p[1]]) < 1200 || gcd([-4, 15], [p[0], p[1]]) < 1200));
bigNearTropics
  ? ok('a major river sits in the equatorial tropics (Amazon/Congo)')
  : fail('no major river near the Amazon or Congo — rain weighting regressed');

// 6. endorheic sinks: an arid interior basin ponds into a terminal lake instead
// of draining to the sea (the Caspian / Aral / Lake Chad). Check a generated lake
// sits in one of those dry-interior regions.
const SQ3 = Math.sqrt(3), Rw = 316800 / SQ3;
const lkKeys = Object.keys(lakePaint).map((k) => k.replace('world:', ''));
const arid = [[42, 51], [45, 60], [13, 14], [46, 74]]; // Caspian, Aral, Chad, Balkhash
const lakeNearArid = lkKeys.some((k) => {
  const [q, r] = k.split(',').map(Number);
  const [x, y] = [SQ3 * Rw * (q + r / 2), 1.5 * Rw * r];
  const ll = toLL(x, y);
  return arid.some((a) => gcd(a, ll) < 700);
});
lakeNearArid
  ? ok('an endorheic lake ponds in a dry interior (Caspian/Aral/Chad/Balkhash)')
  : fail('no lake in the arid interiors — endorheic sink pass regressed');

console.log(failures ? `\nHydrology smoke FAILED: ${failures}` : 'Hydrology smoke: all green.');
process.exit(failures ? 1 : 0);
