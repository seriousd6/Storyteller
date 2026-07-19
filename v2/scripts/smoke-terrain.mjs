// Terrain (G1) smoke test: periodicity, determinism, landform behavior, and
// the waterPct dial. Part of npm run smoke; failures mean user worlds would
// silently redraw or a landform preset stopped meaning what it says.

import { biomeAt, elevationAt, coastDistAt, __setG3, ensureEarthGrid, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const cfg = (over = {}) => ({
  seed: 'smoke-world', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT,
  landform: 'continents', continents: 3, waterPct: 55, climate: 'temperate', ...over,
});

// 1. seamless wrap: x and x + circumference are the SAME place
const c = cfg();
let wrapBad = 0;
for (let i = 0; i < 500; i++) {
  const x = (i * 977 + 13) * 100000 % c.circumFt;
  const y = ((i * 613) % 1000 / 1000 - 0.5) * c.heightFt * 0.9;
  if (biomeAt(c, x, y, 7) !== biomeAt(c, x + c.circumFt, y, 7)) wrapBad++;
  if (Math.abs(elevationAt(c, x, y, 7) - elevationAt(c, x - c.circumFt, y, 7)) > 1e-9) wrapBad++;
}
wrapBad ? fail(`wrap broken at ${wrapBad}/1000 samples`) : ok('east–west wrap seamless (500 biome + 500 elevation samples)');

// 2. determinism
const a = elevationAt(cfg(), 1234567, -7654321, 9);
const b = elevationAt(cfg(), 1234567, -7654321, 9);
a === b ? ok('deterministic') : fail('nondeterministic elevation');

// 3. landform presets produce sane, DISTINCT land fractions
function landFrac(cc) {
  let land = 0, n = 0;
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 2654435761) >>> 0) / 4294967296 * cc.circumFt;
    const y = (((i * 40503) >>> 0) / 65536 % 1 - 0.5) * cc.heightFt * 0.92;
    const bm = biomeAt(cc, x, y, 5);
    if (bm !== 'deep' && bm !== 'water') land++;
    n++;
  }
  return land / n;
}
const fr = {};
for (const lf of ['pangea', 'continent', 'continents', 'archipelago', 'isles']) {
  fr[lf] = landFrac(cfg({ landform: lf }));
}
console.log('   land fractions:', Object.fromEntries(Object.entries(fr).map(([k, v]) => [k, +(v * 100).toFixed(1) + '%'])));
if (!(fr.pangea > 0.2 && fr.pangea < 0.6)) fail(`pangea land ${fr.pangea}`);
if (!(fr.continent > 0.1 && fr.continent < 0.45)) fail(`continent land ${fr.continent}`);
if (!(fr.continents > 0.15 && fr.continents < 0.55)) fail(`continents land ${fr.continents}`);
if (!(fr.archipelago > 0.04 && fr.archipelago < 0.35)) fail(`archipelago land ${fr.archipelago}`);
if (!(fr.isles > 0.02 && fr.isles < 0.25)) fail(`isles land ${fr.isles}`);
if (!(fr.pangea > fr.isles)) fail('pangea should out-land isles');
if (!failures) ok('landform presets in sane, ordered ranges');

// 4. the waterPct dial points the right way
const wet = landFrac(cfg({ waterPct: 75 }));
const dry = landFrac(cfg({ waterPct: 30 }));
dry > wet ? ok(`waterPct dial works (30% water → ${(dry * 100).toFixed(0)}% land; 75% → ${(wet * 100).toFixed(0)}%)`) : fail(`waterPct inverted: dry=${dry} wet=${wet}`);

// 5. poles are cold: high-latitude land is snow/tundra/taiga far more often
const cold = new Set(['snow', 'tundra', 'taiga']);
let polarCold = 0, polarLand = 0;
const pc = cfg({ landform: 'pangea', waterPct: 40 });
for (let i = 0; i < 3000; i++) {
  const x = ((i * 48271) >>> 0) / 4294967296 * pc.circumFt * 1000 % pc.circumFt;
  const y = (0.42 + (i % 50) / 1000) * pc.heightFt * (i % 2 ? 1 : -1) / 1;
  const bm = biomeAt(pc, x, y, 5);
  if (bm !== 'deep' && bm !== 'water' && bm !== 'beach') { polarLand++; if (cold.has(bm)) polarCold++; }
}
polarLand === 0 || polarCold / polarLand > 0.6
  ? ok(`poles are cold (${polarLand ? Math.round((polarCold / polarLand) * 100) : 'n/a'}% of polar land is snow/tundra/taiga)`)
  : fail(`poles not cold enough: ${Math.round((polarCold / polarLand) * 100)}%`);

// 5b. the equator is warm (owner, batch 21: climate must track latitude —
// no frozen biomes in the tropical belt except on mountaintops)
{
  let eqCold = 0, eqLand = 0;
  for (let i = 0; i < 3000; i++) {
    const x = ((i * 48271) >>> 0) / 4294967296 * pc.circumFt * 1000 % pc.circumFt;
    const y = ((i % 100) / 100 - 0.5) * 0.16 * pc.heightFt; // |lat| ≤ 8% of the pole span
    const bm = biomeAt(pc, x, y, 5);
    if (bm !== 'deep' && bm !== 'water' && bm !== 'beach' && bm !== 'mountain') {
      eqLand++; if (cold.has(bm)) eqCold++;
    }
  }
  eqLand === 0 || eqCold / eqLand < 0.02
    ? ok(`equator is warm (${eqLand ? (100 * eqCold / eqLand).toFixed(1) : 'n/a'}% frozen biomes in the tropical belt)`)
    : fail(`frozen biomes at the equator: ${(100 * eqCold / eqLand).toFixed(1)}%`);
}

// 6. CROSS-TIER CONSISTENCY (batch 12): what a coarse tier promises, the
// fine tier delivers — land/water may only flip inside the narrow coastal
// band around sea level, never in open water or solid interior.
{
  const cc = cfg();
  const water = (b) => b === 'deep' || b === 'water';
  let badFlips = 0, flips = 0, n = 0;
  for (let i = 0; i < 3000; i++) {
    const x = ((i * 2246822519) >>> 0) / 4294967296 * cc.circumFt;
    const y = (((i * 3266489917) >>> 0) / 4294967296 - 0.5) * cc.heightFt * 0.9;
    const coarse = biomeAt(cc, x, y, 6);
    const fine = biomeAt(cc, x, y, 11);
    n++;
    if (water(coarse) !== water(fine)) {
      flips++;
      const e = elevationAt(cc, x, y, 6);
      if (Math.abs(e - 0.5) > 0.035) badFlips++; // far from the coast — a lie
    }
  }
  badFlips === 0
    ? ok(`tiers agree (${flips}/${n} flips, all within the coastal band)`)
    : fail(`${badFlips} land/water flips far from the coast (of ${flips} total)`);
}

// 7. GEOGRAPHY G-3 (batch 65): earthlike mountain ranges lean to continental
// MARGINS. The robust, world-independent signal is that the coastal band
// (100–300 mi inland — the cordillera zone) reliably GAINS mountains with the
// plate-edge tilt on, while overall mountain cover is not gutted (interior
// collision ranges still belong). Averaged over seeds so one world's flat coast
// can't flip the test. Ranges are pure elevation, decided before moisture, so
// this reads the tilt directly.
{
  const MI = 5280;
  function tally(seed, g3) {
    __setG3(g3);
    const ec = cfg({ seed, climateModel: 'earthlike', landform: 'continents', continents: 3 });
    let coastLand = 0, coastMtn = 0, allLand = 0, allMtn = 0;
    for (let i = 0; i < 45000; i++) {
      const x = ((i * 2654435761) >>> 0) / 4294967296 * ec.circumFt;
      const y = (((i * 40503) >>> 0) / 4294967296 - 0.5) * ec.heightFt * 0.92;
      const bm = biomeAt(ec, x, y, 6);
      if (bm === 'deep' || bm === 'water' || bm === 'beach') continue;
      allLand++;
      const mtn = bm === 'mountain' || bm === 'hills';
      if (mtn) allMtn++;
      const mi = coastDistAt(ec, x, y) / MI;
      if (mi >= 100 && mi < 300) { coastLand++; if (mtn) coastMtn++; }
    }
    return { coast: coastMtn / coastLand, overall: allMtn / allLand };
  }
  const seeds = ['smoke-world', 'vessia-g3', 'alpha-g3'];
  let coastOff = 0, coastOn = 0, overOff = 0, overOn = 0;
  for (const s of seeds) {
    const o = tally(s, false), n = tally(s, true);
    coastOff += o.coast; coastOn += n.coast; overOff += o.overall; overOn += n.overall;
  }
  __setG3(true);
  const k = seeds.length;
  const coastDelta = coastOn / k - coastOff / k;
  const overDelta = overOn / k - overOff / k;
  const coastGain = coastDelta >= 0.02;                   // coast reliably picks up a real cordillera (≥2 points)
  const marginBias = coastDelta > 2 * overDelta;          // the gain CONCENTRATES at the margin, not spread globally
  const notGutted = overOn / k >= overOff / k * 0.75;     // interior collision ranges survive
  coastGain && marginBias && notGutted
    ? ok(`plate-edge orogeny: coastal band mtn ${(100 * coastOff / k).toFixed(1)}%→${(100 * coastOn / k).toFixed(1)}% (+${(100 * coastDelta).toFixed(1)}pp, avg of ${k} worlds), overall +${(100 * overDelta).toFixed(1)}pp`)
    : fail(`G-3 weak or global: coast +${(100 * coastDelta).toFixed(1)}pp (need ≥2, and >2× the overall +${(100 * overDelta).toFixed(1)}pp), overall retention ${(overOn / overOff).toFixed(2)}×`);
}

// 8. Real Earth landform (batch 66): the 'earth' landform samples the baked
// elevation grid. Canonical Earth (blank seed) must have Earth's ~29% land, a
// seed must DRIFT the coastline, and the water dial must move sea level.
await ensureEarthGrid();
{
  const ec = (over = {}) => ({ seed: '', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, landform: 'earth', waterPct: 50, climate: 'temperate', ...over });
  function landFracE(cc) {
    let land = 0, tot = 0;
    for (let j = 0; j < 180; j++) {
      const y = ((j + 0.5) / 180 - 0.5) * cc.heightFt, w = Math.cos((j + 0.5) / 180 * Math.PI - Math.PI / 2);
      for (let i = 0; i < 360; i++) {
        const x = ((i + 0.5) / 360) * cc.circumFt, bm = biomeAt(cc, x, y, 5);
        tot += w; if (bm !== 'deep' && bm !== 'water') land += w;
      }
    }
    return land / tot;
  }
  const canon = landFracE(ec());
  (canon > 0.24 && canon < 0.34)
    ? ok(`Earth land fraction ${(canon * 100).toFixed(1)}% (real Earth ≈ 29%)`)
    : fail(`Earth land fraction off: ${(canon * 100).toFixed(1)}%`);
  // sea level: raise the water dial → less land; drop it → more
  const high = landFracE(ec({ waterPct: 75 })), low = landFracE(ec({ waterPct: 30 }));
  (high < canon && low > canon)
    ? ok(`sea-level dial works (75→${(high * 100).toFixed(0)}% land, 30→${(low * 100).toFixed(0)}%)`)
    : fail(`sea-level dial inverted: high=${high} canon=${canon} low=${low}`);
  // drift: a non-blank seed must move some coastline hexes vs canonical Earth
  const c0 = ec(), c1 = ec({ seed: 'drift-test' });
  let moved = 0, checked = 0;
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 2654435761) >>> 0) / 4294967296 * c0.circumFt;
    const y = (((i * 40503) >>> 0) / 4294967296 - 0.5) * c0.heightFt * 0.8;
    const w0 = biomeAt(c0, x, y, 5) === 'deep' || biomeAt(c0, x, y, 5) === 'water';
    const w1 = biomeAt(c1, x, y, 5) === 'deep' || biomeAt(c1, x, y, 5) === 'water';
    checked++; if (w0 !== w1) moved++;
  }
  moved > 40
    ? ok(`continental drift shifts the coast (${moved}/${checked} sampled hexes flip land↔sea with a seed)`)
    : fail(`drift did nothing: only ${moved}/${checked} hexes changed`);
}

console.log(failures ? `\nTerrain smoke FAILED: ${failures}` : 'Terrain smoke: all green.');
process.exit(failures ? 1 : 0);
