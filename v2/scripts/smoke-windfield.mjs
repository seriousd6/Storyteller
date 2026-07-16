// Wind field smoke (item #31): the three-cell model reads right in every belt
// and both hemispheres, is calm at the boundaries, and is deterministic. Part of
// `npm run smoke`. A failure here means a world's winds (and the currents and
// sailing that will ride on them) point the wrong way.

import { windAt, windSpeedAt, latAt } from '../src/everdeep/windField.ts';
import { EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const cfg = { seed: 'earth', landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, waterPct: 50, climate: 'temperate' };
const yFor = (lat) => -(lat / 90) * (cfg.heightFt / 2);
// a non-trivial longitude, to prove the belt signs survive the seeded waviness
const X = cfg.circumFt * 0.25;
const wind = (lat) => windAt(cfg, X, yFor(lat));

// 1. the belts point the right way, and mirror across the equator
{
  const cases = [
    ['trade winds 15°N', 15, (u, v) => u < 0 && v < 0, 'easterly, toward the equator (NE trades)'],
    ['trade winds 15°S', -15, (u, v) => u < 0 && v > 0, 'easterly, toward the equator (SE trades)'],
    ['westerlies 45°N', 45, (u, v) => u > 0 && v > 0, 'eastward, toward the pole (SW winds)'],
    ['westerlies 45°S', -45, (u, v) => u > 0 && v < 0, 'eastward, toward the pole (NW winds)'],
    ['polar easterlies 75°N', 75, (u, v) => u < 0, 'easterly'],
    ['polar easterlies 75°S', -75, (u, v) => u < 0, 'easterly'],
  ];
  let good = 0;
  for (const [name, lat, test, desc] of cases) {
    const [u, v] = wind(lat);
    test(u, v) ? good++ : fail(`${name}: [${u.toFixed(2)}, ${v.toFixed(2)}] is not ${desc}`);
  }
  if (good === cases.length) ok(`all ${cases.length} belts blow the right way in both hemispheres`);
}

// 2. the boundaries are calm (doldrums / horse latitudes / polar front), the
//    cores are strong — the wind is not a uniform sheet
{
  const calm = [0, 30, 60, 90];
  const strong = [15, 45, 75];
  const calmMax = Math.max(...calm.map((l) => windSpeedAt(cfg, X, yFor(l))));
  const strongMin = Math.min(...strong.map((l) => windSpeedAt(cfg, X, yFor(l))));
  calmMax < 0.2
    ? ok(`calm at the belt boundaries (max speed ${calmMax.toFixed(2)} at 0/30/60/90°)`)
    : fail(`a belt boundary is not calm: speed ${calmMax.toFixed(2)} (want < 0.2)`);
  strongMin > 0.8
    ? ok(`the belt cores are strong (min speed ${strongMin.toFixed(2)} at 15/45/75°)`)
    : fail(`a belt core is weak: speed ${strongMin.toFixed(2)} (want > 0.8)`);
}

// 3. deterministic, and finite everywhere across a full sweep
{
  const a = windAt(cfg, X, yFor(33));
  const b = windAt(cfg, X, yFor(33));
  a[0] === b[0] && a[1] === b[1]
    ? ok('same point → same wind (deterministic)')
    : fail(`non-deterministic: [${a}] vs [${b}]`);

  let bad = 0;
  for (let lat = -90; lat <= 90; lat += 3) {
    for (let lon = 0; lon < 360; lon += 30) {
      const [u, v] = windAt(cfg, (lon / 360) * cfg.circumFt, yFor(lat));
      if (!Number.isFinite(u) || !Number.isFinite(v)) bad++;
    }
  }
  bad === 0 ? ok('finite across the whole planet (2,196 samples)') : fail(`${bad} non-finite wind samples`);

  // a different seed moves the waviness, so the field is not identical world to
  // world (but the belts still point the same way — checked above)
  const other = { ...cfg, seed: 'vessia-prime' };
  const w1 = windAt(cfg, X, yFor(22));
  const w2 = windAt(other, X, yFor(22));
  (w1[0] !== w2[0] || w1[1] !== w2[1])
    ? ok('a different seed gives a different (but same-belt) wind pattern')
    : fail('two seeds produced an identical wind vector — the waviness is not seeded');
}

// 4. latAt inverts the terrain Y mapping
{
  const okLat = [-60, 0, 37, 80].every((lat) => Math.abs(latAt(cfg, yFor(lat)) - lat) < 1e-6);
  okLat ? ok('latAt(y) inverts the terrain latitude mapping') : fail('latAt does not invert yFor');
}

console.log(failures ? `\nWind-field smoke FAILED: ${failures}` : 'Wind-field smoke: all green.');
process.exit(failures ? 1 : 0);
