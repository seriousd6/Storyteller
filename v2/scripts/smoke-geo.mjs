// Geography smoke (item #1): the named-geography generator. Every world — Earth
// AND procedural — must come out of creation with its major features named:
// oceans, seas, ranges, forests, deserts, lakes and great rivers, each a
// biome-kind feature the Geography tab lists and edits. Part of `npm run smoke`.
// A failure means the geography-naming pass regressed.

import { ensureEarthGrid, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT, biomeAt, octFor } from '../src/everdeep/terrain.ts';
import { generateHydrology } from '../src/everdeep/hydrology.ts';
import { generateGeography } from '../src/everdeep/geography.ts';
const OCT_W = octFor(316_800);

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

// --- Earth ---
await ensureEarthGrid();
const earth = { seed: 'earth', landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, waterPct: 50, climate: 'temperate' };
const eh = generateHydrology(earth);
const ef = generateGeography(earth, eh.grid, earth.seed);
const eKinds = new Set(ef.map((f) => f.kind));
console.log(`   Earth: ${ef.length} features ${JSON.stringify([...eKinds])}`);
ef.length >= 12 ? ok(`Earth named ${ef.length} features`) : fail(`Earth named too few features (${ef.length})`);
['ocean', 'range', 'river'].every((k) => eKinds.has(k))
  ? ok('Earth has an ocean, a range and a great river')
  : fail(`Earth missing a core feature kind: ${['ocean', 'range', 'river'].filter((k) => !eKinds.has(k))}`);
ef.every((f) => Number.isFinite(f.x) && Number.isFinite(f.y) && f.name.length > 0)
  ? ok('every feature has a name and a valid position')
  : fail('a feature has a bad name or position');

// Feature centroids must sit on the terrain they name — each is derived from a
// connected component, so a projection/orientation bug or a kind mislabel would
// put an ocean on dry land or a range at sea, and only the count/name checks
// above (which can't see position) would pass. A centroid can legitimately land
// on a mid-ocean island or an inter-ridge valley, so assert with margin: water
// features sit on water, and land features sit off the open sea.
{
  const WATER = new Set(['deep', 'water', 'beach']);
  const OPEN_SEA = new Set(['deep', 'water']);
  const LAND_KINDS = new Set(['range', 'forest', 'desert']);
  let oH = 0, oT = 0, lH = 0, lT = 0;
  for (const f of ef) {
    const bm = biomeAt(earth, f.x, f.y, OCT_W);
    if (f.kind === 'ocean' || f.kind === 'sea') { oT++; if (WATER.has(bm)) oH++; }
    if (LAND_KINDS.has(f.kind)) { lT++; if (!OPEN_SEA.has(bm)) lH++; }
  }
  (oT > 0 && oH / oT >= 0.7 && lT > 0 && lH / lT >= 0.8)
    ? ok(`feature centroids sit on their terrain (ocean/sea on water ${oH}/${oT}, land features off open sea ${lH}/${lT})`)
    : fail(`feature centroids off their terrain: ocean/sea on water ${oH}/${oT}, land features off sea ${lH}/${lT}`);
}

// --- procedural world ---
const proc = { seed: 'smoke-geo', landform: 'continents', continents: 3, circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, waterPct: 55, climate: 'temperate' };
const ph = generateHydrology(proc);
const pf = generateGeography(proc, ph.grid, proc.seed);
const pKinds = new Set(pf.map((f) => f.kind));
console.log(`   Procedural: ${pf.length} features ${JSON.stringify([...pKinds])}`);
pf.length >= 8 ? ok(`procedural world named ${pf.length} features`) : fail(`procedural world named too few features (${pf.length})`);
pKinds.has('ocean') ? ok('procedural world names its ocean') : fail('procedural world has no ocean');

// determinism: same seed → same names
const pf2 = generateGeography(proc, generateHydrology(proc).grid, proc.seed);
JSON.stringify(pf.map((f) => f.name)) === JSON.stringify(pf2.map((f) => f.name))
  ? ok('deterministic (same seed → same feature names)')
  : fail('non-deterministic feature naming');

console.log(failures ? `\nGeography smoke FAILED: ${failures}` : 'Geography smoke: all green.');
process.exit(failures ? 1 : 0);
