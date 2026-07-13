// Terrain (G1) smoke test: periodicity, determinism, landform behavior, and
// the waterPct dial. Part of npm run smoke; failures mean user worlds would
// silently redraw or a landform preset stopped meaning what it says.

import { biomeAt, elevationAt, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';

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

console.log(failures ? `\nTerrain smoke FAILED: ${failures}` : 'Terrain smoke: all green.');
process.exit(failures ? 1 : 0);
