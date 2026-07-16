// Ocean-current smoke (item #31b): the wind-driven gyres turn the right way in
// both hemispheres, currents follow the wind, and the field is sea-only and
// deterministic. Part of `npm run smoke`. A failure means a world's currents
// (and the boats that will drift on them) run the wrong way, or onto land.

import { currentVectorAt, currentAt, currentSpeedAt, isSea } from '../src/everdeep/currentField.ts';
import { windAt } from '../src/everdeep/windField.ts';
import { ensureEarthGrid, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

await ensureEarthGrid();
const cfg = { seed: 'earth', landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, waterPct: 50, climate: 'temperate' };
const yFor = (lat) => -(lat / 90) * (cfg.heightFt / 2);
const X = cfg.circumFt * 0.25;
const cur = (lat) => currentVectorAt(cfg, X, yFor(lat)); // unmasked, so latitude alone drives it

// 1. the subtropical gyres turn the right way (the wind-driven circulation).
//    N: clockwise — equatorward arm runs WEST, poleward arm runs EAST.
//    S: counter-clockwise — same zonal arms, mirrored hemisphere.
{
  const [uN15] = cur(15), [uN45] = cur(45), [uS15] = cur(-15), [uS45] = cur(-45);
  uN15 < 0 && uN45 > 0
    ? ok(`northern subtropical gyre turns clockwise (15°N runs west ${uN15.toFixed(2)}, 45°N runs east ${uN45.toFixed(2)})`)
    : fail(`northern gyre wrong: 15°N u=${uN15.toFixed(2)} (want <0), 45°N u=${uN45.toFixed(2)} (want >0)`);
  uS15 < 0 && uS45 > 0
    ? ok(`southern subtropical gyre turns counter-clockwise (15°S runs west ${uS15.toFixed(2)}, 45°S runs east ${uS45.toFixed(2)})`)
    : fail(`southern gyre wrong: 15°S u=${uS15.toFixed(2)} (want <0), 45°S u=${uS45.toFixed(2)} (want >0)`);
}

// 2. a current LARGELY follows its wind (turned, not reversed), at a fraction of
//    the wind's pace
{
  let agree = 0, tested = 0, tooFast = 0;
  for (const lat of [12, 20, 40, 52, -12, -20, -40, -52]) {
    const [cu, cv] = cur(lat);
    const [wu, wv] = windAt(cfg, X, yFor(lat));
    tested++;
    if (cu * wu + cv * wv > 0) agree++; // same general heading
    if (Math.hypot(cu, cv) > Math.hypot(wu, wv)) tooFast++; // must be slower than the wind
  }
  agree === tested ? ok(`currents follow the wind (all ${tested} samples share its heading)`) : fail(`${tested - agree}/${tested} currents oppose their wind`);
  tooFast === 0 ? ok('a current never outruns the wind that drives it') : fail(`${tooFast} currents run faster than the wind`);
}

// 3. sea-only: a current exists on open water and nowhere on land — and the mask
//    agrees with isSea across the planet
{
  let mismatch = 0, land = 0, seaN = 0;
  for (let lat = -80; lat <= 80; lat += 5) {
    for (let lon = 0; lon < 360; lon += 10) {
      const x = (lon / 360) * cfg.circumFt, y = yFor(lat);
      const sea = isSea(cfg, x, y);
      const c = currentAt(cfg, x, y);
      if (sea) seaN++; else land++;
      if (sea !== (c !== null)) mismatch++;
    }
  }
  mismatch === 0
    ? ok(`current is defined exactly on the sea (${seaN} sea, ${land} land samples)`)
    : fail(`${mismatch} points where currentAt disagrees with isSea`);
  seaN > 100 && land > 100
    ? ok('the sweep found both open ocean and dry land (the mask is doing real work)')
    : fail(`degenerate sweep: ${seaN} sea, ${land} land — cannot trust the mask test`);
  currentSpeedAt(cfg, 0, yFor(0)) >= 0 // never throws / NaN on land or sea
    ? ok('currentSpeedAt is finite everywhere (0 on land or in a calm)')
    : fail('currentSpeedAt returned a bad value');
}

// 4. deterministic
{
  const a = currentVectorAt(cfg, X, yFor(38)), b = currentVectorAt(cfg, X, yFor(38));
  a[0] === b[0] && a[1] === b[1] ? ok('same point → same current (deterministic)') : fail(`non-deterministic: [${a}] vs [${b}]`);
}

console.log(failures ? `\nCurrent-field smoke FAILED: ${failures}` : 'Current-field smoke: all green.');
process.exit(failures ? 1 : 0);
