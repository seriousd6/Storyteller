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
  return { cfg, s, hy };
}

const MI = 5280;
const wrapD = (cfg, ax, ay, bx, by) => {
  let dx = Math.abs(ax - bx);
  if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx; // the world wraps east–west
  return Math.hypot(dx, ay - by);
};

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

// 4. AUDIT the network invariants (batch 101). "0 unbridged crossings" and "no
// roadless town" were claimed by batches 51/52/53/57 — but only ever as console
// logs inside the old Vessia bake, never as tests. That is precisely how the
// authored-river regression (roads bridging a river nobody can see) shipped
// unnoticed. Assert them here, against the shared module EVERY world uses.
{
  const { cfg, s, hy } = gen({});
  const isGreat = (k) => hy.grid.riverOn.has(k) && hy.grid.bandOf(k) >= 2;

  // Every great-river crossing carries a bridge (dirt never bridges — batch 46).
  // Compare by HEX KEY, not distance: a bridge is planted at the crossing hex's
  // CENTRE, while these are points on the drawn (meandered, smoothed) line — and
  // a world hex is ~60 mi across, so a perfectly good bridge sits tens of miles
  // from the line that crosses it. The key is the exact test.
  const bridgeKeys = new Set(s.bridges.map((b) => hy.grid.worldKeyAt(b[0], b[1])));
  const crossed = new Set();
  for (const rt of s.routes) {
    if (rt.kind === 'dirt') continue;
    let prev = null;
    for (const [x, y] of rt.pts) {
      const k = hy.grid.worldKeyAt(x, y);
      const g = isGreat(k);
      if (g && prev === false) crossed.add(k);
      prev = g;
    }
  }
  const crossings = crossed.size;
  const unbridged = [...crossed].filter((k) => !bridgeKeys.has(k)).length;
  console.log(`   road×great-river crossing hexes: ${crossings}, unbridged: ${unbridged}`);
  unbridged === 0
    ? ok(`every great-river crossing is bridged (${crossings} crossings, ${s.bridges.length} bridges)`)
    : fail(`${unbridged}/${crossings} great-river crossings have NO bridge`);

  // No town left roadless. RATCHET, not a clean assertion: batch 101 cut this
  // from 7 to 5, and a probe confirmed all 5 remaining have their nearest
  // neighbour ON THE SAME LANDMASS (so they are NOT correctly-trackless
  // islands — they are a real open bug; Durwyn is a 210k city 27mi from its
  // neighbour). Recorded as owner item #11 in PLAN.md. This ratchet stops it
  // getting worse while that is chased; lower KNOWN as they are fixed, and
  // never raise it.
  const KNOWN_ROADLESS = 5;
  const pts = s.routes.flatMap((r) => r.pts);
  const townish = s.nodes.filter((n) => n.tier !== 'village');
  const roadless = townish.filter((n) => !pts.some((p) => wrapD(cfg, p[0], p[1], n.x, n.y) < 8 * MI));
  const nearestOther = (n) => {
    let d = Infinity;
    for (const o of s.nodes) if (o !== n) d = Math.min(d, wrapD(cfg, n.x, n.y, o.x, o.y));
    return d;
  };
  const stranded = roadless.map((n) => ({ n, d: nearestOther(n) })).sort((a, b) => a.d - b.d);
  console.log(`   towns+capitals: ${townish.length}, roadless: ${roadless.length}/${KNOWN_ROADLESS} known` +
    (stranded.length ? ` (${stranded.map((s2) => `${s2.n.name} ${(s2.d / MI).toFixed(0)}mi`).join(', ')})` : ''));
  roadless.length <= KNOWN_ROADLESS
    ? ok(`no NEW roadless towns (${roadless.length} known open cases — PLAN item #11)`)
    : fail(`${roadless.length} roadless towns, up from ${KNOWN_ROADLESS} known — a regression (e.g. ${stranded[0].n.name})`);

  // route ids must be unique — anything that looks a route up by id (select,
  // edit, delete) breaks silently on collisions
  const ids = new Set(s.routes.map((r) => r.id));
  ids.size === s.routes.length
    ? ok(`route ids unique (${ids.size})`)
    : fail(`route id collisions: ${s.routes.length} routes but only ${ids.size} unique ids`);
}

// 5. procedural (non-Earth) worlds also populate + road
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
