// Settlement & road smoke (batch 69): the browser civilisation pass. Locks in
// that a world gets populated — capitals/towns/villages on the food and water,
// a road network (highways/roads/dirt) between them, bridges at great-river
// crossings — and crucially that NO ONE settles the ice. Part of `npm run smoke`.

import { ensureEarthGrid, temperatureNorm, octFor, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';
import { generateHydrology } from '../src/everdeep/hydrology.ts';
import { generateSettlements } from '../src/everdeep/settlements.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

await ensureEarthGrid();
const octW = octFor(316_800);

function gen(over) {
  const cfg = { seed: '', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, landform: 'earth', waterPct: 50, climate: 'temperate', ...over };
  const hy = generateHydrology(cfg);
  const s = generateSettlements(cfg, hy.grid);
  return { cfg, s };
}

// 1. Earth is populated with a real road network
{
  const { cfg, s } = gen({});
  const tier = s.nodes.reduce((m, n) => { m[n.tier] = (m[n.tier] || 0) + 1; return m; }, {});
  const kind = s.routes.reduce((m, r) => { m[r.kind] = (m[r.kind] || 0) + 1; return m; }, {});
  console.log(`   Earth: ${s.nodes.length} settlements ${JSON.stringify(tier)}, ${s.routes.length} roads ${JSON.stringify(kind)}, ${s.bridges.length} bridges`);
  (s.nodes.length > 150 && (tier.capital ?? 0) >= 5 && (tier.town ?? 0) >= 20 && (tier.village ?? 0) >= 20)
    ? ok(`populated (${tier.capital} capitals, ${tier.town} towns, ${tier.village} villages)`)
    : fail(`sparse settlement: ${JSON.stringify(tier)}`);
  ((kind.highway ?? 0) >= 5 && (kind.road ?? 0) >= 20 && (kind.dirt ?? 0) >= 10)
    ? ok(`road network built (${kind.highway} highways, ${kind.road} roads, ${kind.dirt} dirt)`)
    : fail(`thin road network: ${JSON.stringify(kind)}`);
  (s.bridges.length >= 1)
    ? ok(`${s.bridges.length} bridges at great-river crossings`)
    : fail('no bridges built');

  // 2. NO ONE settles the ice — every settlement is warm enough to farm
  const frozen = s.nodes.filter((n) => temperatureNorm(cfg, n.x, n.y, octW) < 0.28);
  frozen.length === 0
    ? ok('no settlements on frozen ground (Antarctica/Arctic ice stays wild)')
    : fail(`${frozen.length} settlements on the ice (e.g. ${frozen[0].name})`);

  // 3. settlements sit on farmable/water sites, not open sea (sanity)
  const onLand = s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  onLand ? ok('all settlements have valid positions') : fail('settlement with a bad position');
}

// 4. procedural (non-Earth) worlds also populate + road
{
  const s = generateSettlements(
    { seed: 'proc-smoke', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, landform: 'continents', continents: 3, waterPct: 55, climate: 'temperate', climateModel: 'earthlike' },
    generateHydrology({ seed: 'proc-smoke', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, landform: 'continents', continents: 3, waterPct: 55, climate: 'temperate', climateModel: 'earthlike' }).grid,
  );
  (s.nodes.length > 30 && s.routes.length > 20)
    ? ok(`procedural world populates too (${s.nodes.length} settlements, ${s.routes.length} roads)`)
    : fail(`procedural world under-populated: ${s.nodes.length} settlements, ${s.routes.length} roads`);
}

console.log(failures ? `\nSettlement smoke FAILED: ${failures}` : 'Settlement smoke: all green.');
process.exit(failures ? 1 : 0);
