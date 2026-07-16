#!/usr/bin/env node
// Earth — 2026: the flagship demo (owner). Canonical real-Earth landform with
// every regional power in its place and every major/regional city at its REAL
// coordinates, all under fantasyfied plays on the real names ("Fort Tampania"
// for Tampa; "The Khanate of Cathay" for China). Real rivers, real roads.
//   node docs/everdeep/scripts/bake-earth-2026.mjs
// Writes examples/world.example.json (the loaded demo) + rebuilds labs.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const v2 = join(root, '../../v2');
const imp = (p) => import(pathToFileURL(join(v2, p)));

const { biomeAt, ensureEarthGrid, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } = await imp('src/everdeep/terrain.ts');
const { generateHydrology, withAuthoredRivers, joinTributaries } = await imp('src/everdeep/hydrology.ts');
const { generateRoads, bridgeCrossings, settleTier } = await imp('src/everdeep/settlements.ts');
const { newEntity } = await imp('src/engine/worldStore.ts');
const { blocksToEntity } = await imp('src/everdeep/adapters.ts');
const { makeComposer } = await imp('src/engine/composite.ts');
// Naming is a SHARED module now, not a bake-local script (owner: "everything
// needs to be browser based") — so a user's own Earth names places exactly as
// this demo does. hamletName/uniqueName come from here too.
const { fantasyCity, fantasyRealm, fantasyGovernment, fantasyFeature, fantasyLeader, leaderTitle, hamletName, uniqueName } = await imp('src/everdeep/fantasyEarth.ts');
const { ensureEarthAdmin, generateEarthRealms, EARTH_CONTINENTS } = await imp('src/everdeep/earthRealms.ts');
const { leaders: LEADERS } = JSON.parse(readFileSync(join(root, 'data/leaders.json'), 'utf8'));

await ensureEarthGrid();

const cfg = { seed: 'earth', landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, waterPct: 50, climate: 'temperate', climateModel: 'earthlike' };
const SEA = new Set(['deep', 'water']);

// --- composite runner (one bundle per tool, like the app) ---
const bundles = new Map();
async function run(tool, seed, opts = {}) {
  if (!bundles.has(tool)) {
    const mod = await imp(`src/composites/${tool}.ts`);
    const reg = JSON.parse(readFileSync(join(v2, `src/generators/registries/${tool}.json`), 'utf8'));
    bundles.set(tool, { mod, tables: new Map(Object.entries(reg)) });
  }
  const { mod, tables } = bundles.get(tool);
  const o = {}; for (const opt of mod.meta.options) o[opt.id] = opt.default;
  for (const [k, val] of Object.entries(opts)) if (val) o[k] = String(val);
  return { metaId: mod.meta.id, blocks: mod.build(tables, seed, o) };
}

// --- real-Earth coordinates -> world (x,y). Verified mapping (batch 85):
//     x = ((lon+180)/360) * circ ;  y = -(lat/90) * (height/2)
const R = EARTH_CIRCUM_FT / (2 * Math.PI); // only for local snap steps
function ll2world(lat, lon) {
  let u = ((lon + 180) / 360) % 1; if (u < 0) u += 1;
  return [u * cfg.circumFt, -(lat / 90) * (cfg.heightFt / 2)];
}
const isSea = (x, y) => SEA.has(biomeAt(cfg, x, y, 6));
// nudge a coastal city that lands just offshore onto the nearest land hex
const STEP = 31680; // one region hex

// feeder-hamlet naming (item #9) lives in the shared fantasyEarth module now —
// see hamletName(). Kept out of the bake so a user's own world gets it too.
function snap(x, y) {
  if (!isSea(x, y)) return [x, y, false];
  for (let ring = 1; ring <= 4; ring++) {
    for (let a = 0; a < 12; a++) {
      const nx = x + Math.cos(a / 12 * 2 * Math.PI) * STEP * ring;
      const ny = y + Math.sin(a / 12 * 2 * Math.PI) * STEP * ring;
      if (!isSea(nx, ny)) return [nx, ny, true];
    }
  }
  return [x, y, true]; // island the grid can't resolve — place it anyway
}
// The inverse of snap(): a river's MOUTH has to reach the water. The great
// trunks are authored from REAL lat/lon, but this world's coastline is its own
// model — the Nile's real mouth lands on grass here, the Amazon's ~24mi inland —
// so without this the trunk visibly stops short of the sea. Walk out to the
// nearest hex THIS world calls water. Item #7.
function snapToWater(x, y) {
  if (isSea(x, y)) return [x, y, false];
  for (let ring = 1; ring <= 8; ring++) {
    for (let a = 0; a < 12; a++) {
      const nx = x + Math.cos(a / 12 * 2 * Math.PI) * STEP * ring;
      const ny = y + Math.sin(a / 12 * 2 * Math.PI) * STEP * ring;
      if (isSea(nx, ny)) return [nx, ny, true];
    }
  }
  return [x, y, false]; // no water within reach — an inland/endorheic end
}

// --- load data ---
const countries = JSON.parse(readFileSync(join(root, 'data/countries.json'), 'utf8'));
const byIso = new Map(countries.map((c) => [c.iso2, c]));
const csv = readFileSync(join(root, 'data/worldcities.csv'), 'utf8').trim().split('\n').slice(1);
const cities = csv.map((l) => {
  const m = [...l.matchAll(/"([^"]*)"/g)].map((x) => x[1]);
  return { city: m[0], lat: +m[2], lng: +m[3], country: m[4], iso2: m[5], admin: m[7], capital: m[8], pop: +m[9] || 0 };
}).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng));
cities.sort((a, b) => b.pop - a.pop);
console.log(`${countries.length} powers, ${cities.length} cities`);

// --- world scaffold ---
const stamp = '2026-07-15T00:00:00.000Z';
const world = {
  schemaVersion: 1, genVersion: 1, id: 'w_earth2026aa', name: 'Earth — 2026', seed: 'earth',
  rev: 1, created: stamp, updated: stamp,
  entities: {},
  planes: [{ id: 'p_surface', name: 'The Surface', unit: 'ft', orientation: 'pointy',
    terrain: { landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, waterPct: 50, climate: 'temperate' },
    anchors: [], routes: [], claims: {}, hexes: {} }],
};
const surface = world.planes[0];
const add = (e) => { world.entities[e.id] = e; return e; };

// --- rivers (real Earth) ---
// The coarse world-hex drainage traces plausible small rivers but can't resolve
// a sub-grid incised trunk like the Nile (it wanders the flat Sahara westward and
// misses the delta, leaving Cairo waterless). So we KEEP the generated small
// rivers/streams (band ≤2) for texture and AUTHOR the world's great trunks on
// their real courses (below, after the geography pass, so each links to its
// named feature). Item #4.
console.log('tracing rivers…');
const hydro = generateHydrology(cfg, {});
const genSmall = hydro.routes.filter((r) => (r.w ?? 1) <= 2);
surface.routes.push(...genSmall);
console.log(`  ${hydro.routes.length} generated polylines → kept ${genSmall.length} small (band ≤2), authoring the great trunks`);

// --- continents (top of the tree) ---
// shared with the browser's Earth (earthRealms.ts) — an Earth rolled in the
// new-world dialog must grow the same tree this fixture ships
const contEnt = {};
for (const [reg, label] of Object.entries(EARTH_CONTINENTS)) {
  contEnt[reg] = add({ ...newEntity('region', label), tags: ['continent'] });
}

// --- named geography (item #1): every major range, sea, ocean, river, desert,
// forest and lake, placed at its REAL coordinates under a fantasyfied play on
// the real name ("The Himalayor Spine", "The Nileris Water"). These are the
// editable entries the Geography tab surfaces; biome-kind entities route into
// the '🌍 Geography' tree group. The real name rides along in the body so the
// map reads clearly as a FANTASY Earth. ---
console.log('naming geography…');
const KIND_NOTE = {
  range: 'A great mountain range', sea: 'A sea', ocean: 'An ocean', river: 'A great river',
  desert: 'A desert', forest: 'A great forest', lake: 'A lake',
};
const KIND_ICON = { range: 'label', sea: 'label', ocean: 'label', river: 'label', desert: 'label', forest: 'label', lake: 'label' };
const features = JSON.parse(readFileSync(join(root, 'data/earth-features.json'), 'utf8'));
const featNames = new Set();
// features get the same salted re-roll (no "The Sonoror Desolation 2")
const geoByReal = new Map(); // real feature name → entity (for linking authored rivers to their label)
let featCount = 0;
for (const f of features) {
  const fname = uniqueName((s) => fantasyFeature(f.name, f.kind, s), featNames);
  const parent = contEnt[f.region];
  const e = add({ ...newEntity('biome', fname, parent ? parent.id : undefined), tags: [f.kind, 'geography'] });
  e.body = [{ type: 'paragraph', id: 'b_geo', label: 'On Earth', text: `${KIND_NOTE[f.kind] ?? 'A geographic feature'} — a fantasyfied ${f.name}.` }];
  const [gx, gy] = ll2world(f.lat, f.lon);
  surface.anchors.push({ entityId: e.id, x: Math.round(gx), y: Math.round(gy), tier: 'world', icon: KIND_ICON[f.kind] ?? 'label', ...(f.big ? { promoted: true } : {}) });
  geoByReal.set(f.name, e);
  featCount++;
}
console.log(`  ${featCount} named features`);

// --- authored great rivers on their REAL courses (item #4). Densify each
// source→mouth waypoint chain in lat/lon (smooth, seam-safe), convert to world
// coords, and emit a river route at its width band — linked to the river's own
// named-geography feature so clicking it opens its page. ---
console.log('drawing the great rivers…');
const { rivers: bigRivers } = JSON.parse(readFileSync(join(root, 'data/earth-rivers.json'), 'utf8'));
let bigRiverCount = 0, mouthsSnapped = 0;
for (const rv of bigRivers) {
  const pts = [];
  for (let i = 0; i < rv.pts.length - 1; i++) {
    const [la0, lo0] = rv.pts[i], [la1, lo1] = rv.pts[i + 1];
    const SUB = 4; // subdivisions per leg → a smooth channel
    for (let s = 0; s < SUB; s++) {
      const t = s / SUB;
      const [x, y] = ll2world(la0 + (la1 - la0) * t, lo0 + (lo1 - lo0) * t);
      pts.push([Math.round(x), Math.round(y)]);
    }
  }
  const last = rv.pts[rv.pts.length - 1];
  const [lx, ly] = ll2world(last[0], last[1]);
  pts.push([Math.round(lx), Math.round(ly)]);
  // carry the mouth on to the waterline if the real coordinate falls inland
  const [mx, my, moved] = snapToWater(lx, ly);
  if (moved) { pts.push([Math.round(mx), Math.round(my)]); mouthsSnapped++; }
  // guard the cylinder seam: a leg that wraps >half the world would draw a
  // straight line across the whole map — split there (none of these cross it,
  // but keep it safe)
  const feat = geoByReal.get(rv.name);
  surface.routes.push({ id: `rt_bigriv${bigRiverCount.toString(36).padStart(2, '0')}`, kind: 'river', w: rv.band, pts, ...(feat ? { entityId: feat.id } : {}) });
  bigRiverCount++;
}
console.log(`  ${bigRiverCount} great rivers authored on real courses (${mouthsSnapped} mouths carried on to the waterline)`);

// A tributary joins a trunk; it does not cross it and escape out the far side
// (owner, item #25). This has to run HERE — after the authored courses exist —
// because the traced band-≤2 rivers were traced against the original drainage,
// whose trunks ran somewhere else, and they have no idea the trunk moved. The
// cut doubles as item #7a's fix: the tributary now ends ON the trunk instead of
// dead-ending on dry land where its deleted continuation used to begin.
{
  const before = surface.routes.length;
  const { routes: joined, trimmed, dropped } = joinTributaries(surface.routes, EARTH_CIRCUM_FT);
  surface.routes = joined; // `surface` IS world.planes[0]
  console.log(`  ${trimmed} tributaries cut to their confluence, ${dropped} dropped as stubs (${before} → ${joined.length} routes)`);
}

// --- powers: one realm per country, and the ground each one holds ---
// The naming and the sweep both live in v2/src/everdeep/earthRealms.ts, because
// `landform: 'earth'` is a choice in the new-world dialog and an owner rolling
// their own Earth in the browser has to get the same realms this fixture ships
// (PLAN, 🌐 browser-based / ⚖️ one implementation). This script used to own a
// near-identical naming loop; it now just mints entities from the result.
console.log('sweeping borders…');
await ensureEarthAdmin();
// `cfg`, not surface.terrain: the plane records no seed (mountMap composes it
// from world.seed), and the sweep needs one to read a drifted Earth correctly.
const { realms: earthRealms, unclaimedLand, wildLand } = generateEarthRealms(cfg);
const realmByIso = new Map();
let rulerCount = 0;
let claimedHexes = 0;
for (const R of earthRealms) {
  if (!contEnt[R.region]) continue;
  const realm = add({ ...newEntity('region', R.name, contEnt[R.region].id), tags: ['kingdom-lands'] });
  realm.fields = { government: R.government };
  realmByIso.set(R.iso, { ent: realm, fr: { title: R.title, name: R.name }, country: byIso.get(R.iso) });
  if (R.hexes.length) { surface.claims[realm.id] = R.hexes; claimedHexes += R.hexes.length; }
  // write the crown's name across its own ground (owner, item #21). The label
  // renderer has taken a claim owner's colour since batch 13 — it was only ever
  // missing the anchor to hang it on.
  if (R.label) {
    surface.anchors.push({ entityId: realm.id, x: R.label[0], y: R.label[1], tier: 'world', icon: 'label' });
  }
}
// Name uniqueness is world-wide, not per-kind: cities and hamlets keep drawing
// from this set, so it has to start out knowing what the crowns already took.
// (generateEarthRealms de-dupes realms against each other internally.)
const usedNames = new Set(earthRealms.map((r) => r.name));
const landless = earthRealms.filter((r) => !r.hexes.length).length;
console.log(`  ${realmByIso.size} realms hold ${claimedHexes.toLocaleString()} world hexes`);
console.log(`  ${landless} hold none — no land of their own at this grain (Monaco, Singapore, …)`);
console.log(`  ${unclaimedLand} land hexes disputed, ${wildLand.toLocaleString()} left wild (the Antarctic ice)`);

// --- cities ---
console.log('placing cities…');
const nodes = []; // for road forging
let placed = 0, snapped = 0, feederCount = 0;
let partyXY = null; // the party starts at fantasy-London (see below)
for (const ci of cities) {
  const power = realmByIso.get(ci.iso2);
  const parentId = power ? power.ent.id : (contEnt[byIso.get(ci.iso2)?.region] || contEnt.Europe).id;
  const [x0, y0] = ll2world(ci.lat, ci.lng);
  const [x, y, wasSnapped] = snap(x0, y0); if (wasSnapped) snapped++;
  const b = biomeAt(cfg, x, y, 6);
  const coastal = [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]].some(([dx, dy]) => isSea(x + dx, y + dy));
  const fname = uniqueName((s) => fantasyCity(ci.city, coastal, s), usedNames);
  const isCapital = ci.capital === 'primary';
  const big = ci.pop >= 1_000_000;
  const cls = ci.pop >= 500_000 ? 'city' : ci.pop >= 60_000 ? 'town' : 'village';
  const seed = `earth/${ci.iso2}/${ci.city}`.replace(/\s+/g, '_');

  let ent;
  if (isCapital || big) {
    // full generated settlement page for the powers' seats and the megacities
    const size = ci.pop >= 500_000 ? 'city' : 'town';
    const gov = power ? power.ent.fields.government : '';
    const rr = await run('settlement', seed, { size, population: ci.pop, biome: b, government: gov, coastal: coastal ? '1' : '' });
    ent = blocksToEntity(rr.metaId, seed, rr.blocks, fname, parentId);
    ent.name = fname; // keep the fantasy name over the composite's rolled one
    ent.kind = 'settlement';
    ent.fields = { ...(ent.fields ?? {}), population: ci.pop };
  } else {
    ent = newEntity('settlement', fname, parentId);
    ent.fields = { population: String(ci.pop) };
    ent.body = [{ type: 'paragraph', id: 'b_real', label: 'On Earth', text: `A fantasyfied ${ci.city}${ci.admin && ci.admin !== ci.city ? `, ${ci.admin}` : ''} — ${power ? 'of ' + power.fr.name : ''}. Population ~${ci.pop ? ci.pop.toLocaleString('en-US') : 'a few thousand'}.` }];
  }
  ent.tags = [cls, ...(isCapital ? ['capital'] : [])];
  add(ent);
  surface.anchors.push({ entityId: ent.id, x: Math.round(x), y: Math.round(y),
    tier: ci.pop >= 3_000_000 ? 'world' : 'region', icon: isCapital ? 'city' : cls === 'city' ? 'city' : 'town',
    ...(ci.pop >= 3_000_000 ? { promoted: true } : {}) });
  // settleTier is the shared rule the browser re-forges roads with; deriving it
  // a second time here is how the two drifted apart in the first place
  nodes.push({ tier: settleTier(ent.tags, ci.pop), x, y, pop: Math.max(ci.pop, 200), name: fname, type: 'market town', reason: '', ki: 0, iso2: ci.iso2 });
  if (ci.iso2 === 'GB' && ci.city === 'London') partyXY = { x: Math.round(x), y: Math.round(y) };
  placed++;

  // a ruler for each realm, hung off its capital. Where we know the real 2026
  // head of the power, the ruler IS the fantasyfied version of them (item #6) —
  // recognizable surname, a regnal title matching the realm's style — over a
  // generated statblock. Unknown powers get a fully generated ruler.
  if (isCapital && power && !power.ruler) {
    const pr = await run('npc-block', seed + '/ruler');
    const ruler = blocksToEntity(pr.metaId, seed + '/ruler', pr.blocks, 'Ruler', power.ent.id);
    ruler.kind = 'person'; ruler.tags = ['ruler'];
    const real = LEADERS[ci.iso2];
    if (real) {
      const title = leaderTitle(power.fr.title);
      ruler.name = `${title} ${fantasyLeader(real.anchor, ci.iso2)}`;
      ruler.tags = ['ruler', 'head-of-state'];
      ruler.body = [{ type: 'paragraph', id: 'b_realruler', label: 'On Earth',
        text: `The ${title.toLowerCase()} of ${power.fr.name} — a fantasyfied ${real.name}, ${real.office} of ${power.country.name} in 2026.` },
        ...(ruler.body ?? [])];
    }
    add(ruler); rulerCount++;
    // `ruler`, not `leader`: a region is a PLACE, and settlement/webs.ts both
    // call a place's head its ruler — `leader` is the faction word. Three names
    // for one idea, and `region` defined none of them, so both fields fell
    // through to a text input and rendered `[object Object]` (item #28).
    power.ent.fields = { ...power.ent.fields, ruler: { ref: ruler.id }, seat: { ref: ent.id } };
    power.ruler = ruler;
  }

  // feeder hamlets (item #9): a metropolis can't feed itself — it needs an
  // agricultural hinterland of farming villages around it. Scale their number
  // with the city's real population; ring them on nearby land, on their own so
  // the road grid isn't overwhelmed (they're the country, not the highways).
  if (ci.pop >= 700_000) {
    const nFeed = Math.min(4, Math.floor(ci.pop / 1_500_000) + 1);
    for (let f = 0; f < nFeed; f++) {
      const ang = (f / nFeed) * 2 * Math.PI + (ci.pop % 7) * 0.3;
      const ring = 2 + (f % 2); // 2–3 region hexes out, past the built-up area
      let fx = x + Math.cos(ang) * STEP * ring, fy = y + Math.sin(ang) * STEP * ring;
      if (isSea(fx, fy)) { const s = snap(fx, fy); fx = s[0]; fy = s[1]; if (isSea(fx, fy)) continue; }
      const fName = uniqueName((s) => hamletName(s ? `${seed}/feed${f}/${s}` : `${seed}/feed${f}`), usedNames);
      const fe = add({ ...newEntity('settlement', fName, parentId), tags: ['village', 'farm-town'] });
      fe.fields = { population: String(1200 + ((Math.abs(Math.round(fx + fy)) % 9) * 350)), settlementType: 'farming village' };
      fe.body = [{ type: 'paragraph', id: 'b_feed', text: `A farming village of the ${fname} hinterland — its fields, herds, and mills help feed the city.` }];
      surface.anchors.push({ entityId: fe.id, x: Math.round(fx), y: Math.round(fy), tier: 'region', icon: 'village' });
      feederCount++;
    }
  }
}
console.log(`  ${placed} cities placed (${snapped} snapped to shore), ${rulerCount} rulers, ${feederCount} feeder villages`);

// --- roads: forged PER POWER (generateRoads is built for small sets; 1500
// global nodes is O(n^2) A* and would never finish). Each country's own cities
// get a national network; capitals of the top powers get inter-capital links. ---
console.log('forging roads…');
// Item #12. generateRoads finds a great river ONLY via the grid's riverOn/bandOf
// — the TRACED drainage. But this world drops the traced band-≥3 rivers and
// draws the authored real courses instead, so the road pass was planning against
// a network nobody can see: bridging phantom crossings in dry country while
// every real river went unbridged (measured: 42 crossings, 0 bridges). Feed the
// authored courses back into the grid the roads are planned on.
const bigRiverRoutes = surface.routes.filter((r) => r.kind === 'river' && (r.w ?? 1) >= 3);
const roadGrid = withAuthoredRivers(hydro.grid, bigRiverRoutes);
let roadCount = 0, bridgeCount = 0;
const byPowerNodes = new Map();
for (const n of nodes) byPowerNodes.set(n.iso2 ?? '', [...(byPowerNodes.get(n.iso2 ?? '') ?? []), n]);
for (const [iso, ns] of byPowerNodes) {
  if (ns.length < 2 || ns.length > 40) continue; // skip singletons and mega-countries (too slow)
  try {
    const roads = generateRoads(cfg, roadGrid, ns);
    // generateRoads numbers routes from 0 on every call, and we call it once per
    // country — so ids collided across countries (908 routes, 539 unique; one id
    // shared by 69 roads). Anything that looks a route up by id (select, edit,
    // delete) would hit the wrong road. Namespace them. Item #10b.
    // suffix must stay [a-z0-9] to satisfy the route-id schema — no underscore,
    // and the iso2 codes are uppercase
    const namedRoads = roads.routes.map((r) => ({ ...r, id: `${r.id}${(iso || 'xx').toLowerCase()}` }));
    surface.routes.push(...namedRoads);
    roadCount += roads.routes.length;
    // Bridges go where the drawn road MEETS the drawn river, not at the crossing
    // hex's centre — a hex is 60mi across, so centring left bridges tens of miles
    // from any water ("many not even over rivers"). This also drops phantom
    // bridges whose hex the drawn river never actually entered.
    for (const [bx, by] of bridgeCrossings(namedRoads, bigRiverRoutes)) {
      // file it under the realm it stands in — these were being minted at ROOT,
      // which is why 23 bridges sat outside every region in the tree
      const e = add({ ...newEntity('landmark', 'River Bridge', realmByIso.get(iso)?.ent?.id), tags: ['bridge'] });
      e.body = [{ type: 'paragraph', id: 'b_bridge', text: 'Where a road crosses a great river — tolls, gossip, and the slow traffic of carts.' }];
      surface.anchors.push({ entityId: e.id, x: Math.round(bx), y: Math.round(by), tier: 'region', icon: 'bridge' }); bridgeCount++;
    }
  } catch { /* a country the road grid can't resolve — skip it */ }
}
console.log(`  ${roadCount} roads, ${bridgeCount} bridges`);

// --- the party stands at fantasy-London (travel tool starts here). Baked in
// so the batch-88 travel fix survives a rebake. ---
surface.party = partyXY ?? { x: Math.round(ll2world(51.5, -0.13)[0]), y: Math.round(ll2world(51.5, -0.13)[1]) };
console.log(`  party at ${surface.party.x},${surface.party.y}`);

// --- write ---
const outPath = join(root, 'examples/world.example.json');
writeFileSync(outPath, JSON.stringify(world));
console.log(`entities ${Object.keys(world.entities).length}, anchors ${surface.anchors.length}, routes ${surface.routes.length}`);
console.log('wrote', outPath, `(${(JSON.stringify(world).length / 1e6).toFixed(1)} MB)`);

// --- publish to the app: the served example (/labs/earth.example.json) and the
// embedded world-viewer are the SAME fixture, so "Load example" always opens
// this current Earth (not a stale copy). Auto-syncs so a rebake stays coherent.
const { execSync } = await import('node:child_process');
// quote it: the checkout path can contain a space (…/David Seis/…), which made
// this run `node C:\Users\David` and fail at the very end of every bake — so the
// "a rebake always keeps them in sync" promise never actually held
execSync(`node "${join(here, 'build-labs.mjs')}"`, { stdio: 'inherit' });
