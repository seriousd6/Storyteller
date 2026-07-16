// Earth — 2026: the flagship world, built where the user can get it.
//
// This was a bake script (docs/everdeep/scripts/bake-earth-2026.mjs), and the
// owner's standing rule is that it shouldn't have been: "the problem with bake
// is that the end user doesn't get to benefit from it when they create their
// worlds. everything needs to be browser based" — and then, plainly: "why are
// we still using bake… point it at the workers, no more drift".
//
// The drift was not hypothetical. Every pass this orchestrates was ALREADY a
// shared module; only the orchestration was duplicated — and in three days it
// produced three silent divergences, every one of which shipped, because a
// wrong road network is still a perfectly valid road network:
//
//   - the bake bucketed roads per country and skipped any country over 40
//     settlements as "too slow", so CHINA, INDIA and the USA had no roads at
//     all — 21.6% of the planet, since Earth's first bake. The browser didn't
//     bucket, and took 13 MINUTES instead.
//   - the settlement tier rule was written twice; the browser's copy read 1,500
//     cities as 3 towns and 3,260 villages.
//   - the bake's road pass never saw the 2,012 feeder villages the bake itself
//     had just created. The browser's did.
//
// So the orchestration lives here now, and the bake is a caller like any other.
// The only thing that differs between Node and a browser is how bytes and
// modules are fetched, which is what EarthIO is for. Nothing below knows which
// it is talking to, and that is the entire point: there is no second copy left
// to drift.

import { biomeAt, ensureEarthGrid, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT, type TerrainCfg } from './terrain.ts';
import { generateHydrology, withAuthoredRivers, joinTributaries } from './hydrology.ts';
import { generateRoads, bridgeCrossings, settleTier, type SettleNode } from './settlements.ts';
import { newEntity, type EntityRecord, type WorldDoc } from '../engine/worldStore.ts';
import { ghostId } from './seeds.ts';
import { blocksToEntity } from './adapters.ts';
import { fantasyCity, fantasyFeature, fantasyLeader, leaderTitle, hamletName, uniqueName } from './fantasyEarth.ts';
import { ensureEarthAdmin, generateEarthRealms, countryAt, EARTH_CONTINENTS } from './earthRealms.ts';

/**
 * The only thing Node and the browser genuinely disagree about: where the bytes
 * and the generator modules come from. The bake reads the repo; the app fetches
 * `/data` and lets Vite bundle the composites. Everything else in this file is
 * the same code for both.
 */
export interface EarthIO {
  /** Raw text of a data file, by bare name — 'countries.json', 'worldcities.csv'. */
  read(name: string): Promise<string>;
  /** A composite generator and its table registry, by tool name. Cache it. */
  composite(tool: string): Promise<{
    meta: { id: string; options: Array<{ id: string; default: string }> };
    build: (tables: Map<string, unknown>, seed: string, opts: Record<string, string>) => unknown[];
    tables: Map<string, unknown>;
  }>;
  /** Progress, for the worker's "Building your world…" and the bake's console. */
  progress?(stage: string, detail?: string): void;
}

export interface EarthStats {
  powers: number; cities: number; features: number; greatRivers: number;
  realms: number; landless: number; claimedHexes: number;
  placed: number; snapped: number; rulers: number; feeders: number;
  roads: number; bridges: number;
}

const SEA = new Set(['deep', 'water']);
const STEP = 31_680; // one region hex
const KIND_NOTE: Record<string, string> = {
  range: 'A great mountain range', sea: 'A sea', ocean: 'An ocean', river: 'A great river',
  desert: 'A desert', forest: 'A great forest', lake: 'A lake',
};

interface CityRow { city: string; lat: number; lng: number; country: string; iso2: string; admin: string; capital: string; pop: number }
interface CountryRow { iso2: string; name: string; region: string }
interface FeatureRow { name: string; kind: string; region: string; lat: number; lon: number; big?: boolean }
interface RiverRow { name: string; band: number; pts: Array<[number, number]> }
interface LeaderRow { anchor: string; name: string; office: string }

/** worldcities.csv → rows. The file quotes every field. */
export function parseCities(csv: string): CityRow[] {
  return csv.trim().split('\n').slice(1).map((l) => {
    const m = [...l.matchAll(/"([^"]*)"/g)].map((x) => x[1]!);
    return { city: m[0]!, lat: +m[2]!, lng: +m[3]!, country: m[4]!, iso2: m[5]!, admin: m[7]!, capital: m[8]!, pop: +m[9]! || 0 };
  }).filter((c) => Number.isFinite(c.lat) && Number.isFinite(c.lng))
    .sort((a, b) => b.pop - a.pop);
}

/**
 * Build Earth — 2026.
 *
 * Deterministic: same data in, same world out, byte for byte. The `stamp` is a
 * parameter rather than a `Date.now()` precisely so that stays true — a world
 * that changes every time it is built cannot be diffed against the one that
 * shipped.
 */
export async function buildEarth2026(
  io: EarthIO,
  opts: { stamp?: string; id?: string; name?: string } = {},
): Promise<{ world: WorldDoc; stats: EarthStats }> {
  const say = (stage: string, detail?: string): void => io.progress?.(stage, detail);
  await ensureEarthGrid();

  const cfg: TerrainCfg = {
    seed: 'earth', landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT,
    waterPct: 50, climate: 'temperate', climateModel: 'earthlike',
  } as TerrainCfg;

  // --- real-Earth coordinates -> world (x,y). Verified mapping (batch 85):
  //     x = ((lon+180)/360) * circ ;  y = -(lat/90) * (height/2)
  const ll2world = (lat: number, lon: number): [number, number] => {
    let u = ((lon + 180) / 360) % 1; if (u < 0) u += 1;
    return [u * cfg.circumFt, -(lat / 90) * (cfg.heightFt / 2)];
  };
  const isSea = (x: number, y: number): boolean => SEA.has(biomeAt(cfg, x, y, 6));
  // nudge a coastal city that lands just offshore onto the nearest land hex
  const snap = (x: number, y: number): [number, number, boolean] => {
    if (!isSea(x, y)) return [x, y, false];
    for (let ring = 1; ring <= 4; ring++) {
      for (let a = 0; a < 12; a++) {
        const nx = x + Math.cos(a / 12 * 2 * Math.PI) * STEP * ring;
        const ny = y + Math.sin(a / 12 * 2 * Math.PI) * STEP * ring;
        if (!isSea(nx, ny)) return [nx, ny, true];
      }
    }
    return [x, y, true]; // island the grid can't resolve — place it anyway
  };
  // The inverse of snap(): a river's MOUTH has to reach the water. The great
  // trunks are authored from REAL lat/lon, but this world's coastline is its own
  // model — the Nile's real mouth lands on grass here, the Amazon's ~24mi inland
  // — so without this the trunk visibly stops short of the sea. Item #7.
  const snapToWater = (x: number, y: number): [number, number, boolean] => {
    if (isSea(x, y)) return [x, y, false];
    for (let ring = 1; ring <= 8; ring++) {
      for (let a = 0; a < 12; a++) {
        const nx = x + Math.cos(a / 12 * 2 * Math.PI) * STEP * ring;
        const ny = y + Math.sin(a / 12 * 2 * Math.PI) * STEP * ring;
        if (isSea(nx, ny)) return [nx, ny, true];
      }
    }
    return [x, y, false]; // no water within reach — an inland/endorheic end
  };

  const run = async (tool: string, seed: string, o: Record<string, string | number | undefined> = {}) => {
    const { meta, build, tables } = await io.composite(tool);
    const opt: Record<string, string> = {};
    for (const m of meta.options) opt[m.id] = m.default;
    for (const [k, v] of Object.entries(o)) if (v) opt[k] = String(v);
    return { metaId: meta.id, blocks: build(tables, seed, opt) };
  };

  // --- load data ---
  const countries: CountryRow[] = JSON.parse(await io.read('countries.json'));
  const byIso = new Map(countries.map((c) => [c.iso2, c]));
  const cities = parseCities(await io.read('worldcities.csv'));
  const { leaders: LEADERS } = JSON.parse(await io.read('leaders.json')) as { leaders: Record<string, LeaderRow> };
  say('data', `${countries.length} powers, ${cities.length} cities`);

  // --- world scaffold ---
  // The demo pins these so the shipped fixture is diffable; a user creating
  // their own Earth brings their own name, id and clock.
  const stamp = opts.stamp ?? '2026-07-15T00:00:00.000Z';
  const world = {
    schemaVersion: 1, genVersion: 1, id: opts.id ?? 'w_earth2026aa', name: opts.name ?? 'Earth — 2026', seed: 'earth',
    rev: 1, created: stamp, updated: stamp,
    entities: {} as Record<string, EntityRecord>,
    planes: [{
      id: 'p_surface', name: 'The Surface', unit: 'ft', orientation: 'pointy',
      terrain: { landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, waterPct: 50, climate: 'temperate' },
      anchors: [] as Array<Record<string, unknown>>, routes: [] as Array<Record<string, unknown>>,
      claims: {} as Record<string, string[]>, hexes: {},
    }],
  } as unknown as WorldDoc;
  const surface = (world as unknown as { planes: Array<Record<string, any>> }).planes[0]!;

  /**
   * Add an entity under a SEED PATH, not a random id.
   *
   * `newEntity` mints ids with `crypto.getRandomValues` and stamps `created`
   * from the wall clock, so every bake rewrote all 4,151 ids and 262 distinct
   * timestamps: the 5 MB fixture churned wholesale, two bakes could not be
   * diffed, and neither could two versions of this generator. Which is exactly
   * the check you want when you have just moved 400 lines of orchestration.
   *
   * CONTRACTS §1/§3 already define the answer — `id = "e_" + h64(seedPath)`,
   * with pinned test vectors in validate.mjs — it simply wasn't used here.
   *
   * The path has to be genuinely unique, and a hash is unforgiving about it: two
   * entities on one path is not an error, it is one entity SILENTLY REPLACING
   * the other, and a city would just quietly cease to exist. Worth knowing:
   * `earth/CN/Fuyang` names two different real cities, and there are 23 such
   * pairs — which is why a city's path carries its coordinates.
   */
  const mintedAt = new Map<string, string>();
  const add = (e: EntityRecord, path: string): EntityRecord => {
    const id = ghostId(`${world.seed}/${path}`);
    const clash = mintedAt.get(id);
    if (clash !== undefined) {
      throw new Error(`entity path is not unique: "${path}" collides with "${clash}" (both → ${id}). One would silently replace the other.`);
    }
    mintedAt.set(id, path);
    e.id = id;
    e.created = stamp; e.updated = stamp; // the clock is not part of the world
    (world as unknown as { entities: Record<string, EntityRecord> }).entities[id] = e;
    return e;
  };

  // --- rivers (real Earth) ---
  // The coarse world-hex drainage traces plausible small rivers but can't resolve
  // a sub-grid incised trunk like the Nile (it wanders the flat Sahara westward
  // and misses the delta, leaving Cairo waterless). So we KEEP the generated
  // small rivers/streams (band ≤2) for texture and AUTHOR the world's great
  // trunks on their real courses (below, after the geography pass, so each links
  // to its named feature). Item #4.
  say('rivers', 'tracing rivers…');
  const hydro = generateHydrology(cfg, {});
  const genSmall = hydro.routes.filter((r) => (r.w ?? 1) <= 2);
  surface.routes.push(...genSmall);

  // --- continents (top of the tree) ---
  const contEnt: Record<string, EntityRecord> = {};
  for (const [reg, label] of Object.entries(EARTH_CONTINENTS)) {
    contEnt[reg] = add({ ...newEntity('region', label), tags: ['continent'] }, `c:${reg}`);
  }

  // --- named geography (item #1): every major range, sea, ocean, river, desert,
  // forest and lake, at its REAL coordinates under a fantasyfied play on the real
  // name ("The Himalayor Spine"). The real name rides along in the body so the
  // map reads clearly as a FANTASY Earth. ---
  say('geography', 'naming geography…');
  const features: FeatureRow[] = JSON.parse(await io.read('earth-features.json'));
  const featNames = new Set<string>();
  const geoByReal = new Map<string, EntityRecord>();
  for (const f of features) {
    const fname = uniqueName((s) => fantasyFeature(f.name, f.kind, s), featNames);
    const parent = contEnt[f.region];
    const e = add({ ...newEntity('biome', fname, parent ? parent.id : undefined), tags: [f.kind, 'geography'] }, `g:${f.kind}:${f.name}`);
    e.body = [{ type: 'paragraph', id: 'b_geo', label: 'On Earth', text: `${KIND_NOTE[f.kind] ?? 'A geographic feature'} — a fantasyfied ${f.name}.` }] as EntityRecord['body'];
    const [gx, gy] = ll2world(f.lat, f.lon);
    surface.anchors.push({ entityId: e.id, x: Math.round(gx), y: Math.round(gy), tier: 'world', icon: 'label', ...(f.big ? { promoted: true } : {}) });
    geoByReal.set(f.name, e);
  }

  // --- authored great rivers on their REAL courses (item #4) ---
  say('rivers', 'drawing the great rivers…');
  const { rivers: bigRivers } = JSON.parse(await io.read('earth-rivers.json')) as { rivers: RiverRow[] };
  let bigRiverCount = 0, mouthsSnapped = 0;
  for (const rv of bigRivers) {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < rv.pts.length - 1; i++) {
      const [la0, lo0] = rv.pts[i]!, [la1, lo1] = rv.pts[i + 1]!;
      const SUB = 4; // subdivisions per leg → a smooth channel
      for (let s = 0; s < SUB; s++) {
        const t = s / SUB;
        const [x, y] = ll2world(la0 + (la1 - la0) * t, lo0 + (lo1 - lo0) * t);
        pts.push([Math.round(x), Math.round(y)]);
      }
    }
    const last = rv.pts[rv.pts.length - 1]!;
    const [lx, ly] = ll2world(last[0], last[1]);
    pts.push([Math.round(lx), Math.round(ly)]);
    const [mx, my, moved] = snapToWater(lx, ly);
    if (moved) { pts.push([Math.round(mx), Math.round(my)]); mouthsSnapped++; }
    const feat = geoByReal.get(rv.name);
    surface.routes.push({ id: `rt_bigriv${bigRiverCount.toString(36).padStart(2, '0')}`, kind: 'river', w: rv.band, pts, ...(feat ? { entityId: feat.id } : {}) });
    bigRiverCount++;
  }

  // A tributary joins a trunk; it does not cross it and escape out the far side
  // (owner, item #25). This has to run HERE — after the authored courses exist —
  // because the traced band-≤2 rivers were traced against the original drainage,
  // whose trunks ran somewhere else, and they have no idea the trunk moved.
  surface.routes = joinTributaries(surface.routes as never, EARTH_CIRCUM_FT).routes;

  // --- powers: one realm per country, and the ground each one holds ---
  say('realms', 'sweeping borders…');
  await ensureEarthAdmin();
  const { realms: earthRealms, unclaimedLand, wildLand } = generateEarthRealms(cfg);
  void unclaimedLand; void wildLand;
  interface Power { ent: EntityRecord; fr: { title: string; name: string }; country?: CountryRow; ruler?: EntityRecord }
  const realmByIso = new Map<string, Power>();
  let claimedHexes = 0;
  for (const R of earthRealms) {
    if (!contEnt[R.region]) continue;
    const realm = add({ ...newEntity('region', R.name, contEnt[R.region]!.id), tags: ['kingdom-lands'] }, `r:${R.iso}`);
    realm.fields = { government: R.government };
    realmByIso.set(R.iso, { ent: realm, fr: { title: R.title, name: R.name }, country: byIso.get(R.iso) });
    if (R.hexes.length) { surface.claims[realm.id] = R.hexes; claimedHexes += R.hexes.length; }
    // write the crown's name across its own ground (owner, item #21)
    if (R.label) surface.anchors.push({ entityId: realm.id, x: R.label[0], y: R.label[1], tier: 'world', icon: 'label' });
  }
  // Name uniqueness is world-wide, not per-kind: cities and hamlets keep drawing
  // from this set, so it has to start out knowing what the crowns already took.
  const usedNames = new Set(earthRealms.map((r) => r.name));
  const landless = earthRealms.filter((r) => !r.hexes.length).length;

  // --- cities ---
  // A composite seed identifies a generation ROLL, and `earth/<iso2>/<city>`
  // does not pin one city: `earth/CN/Fuyang` is two different real places (23
  // such pairs, all in China's romanized names). Where both members are big
  // enough to get a generated page they rolled the SAME page off that seed —
  // same statblock name ("Citydale"), same trade goods, same walls — differing
  // only where the population option happened to change a line. Nothing failed
  // (their entity ids differ; the path already carries coordinates), so two
  // distinct cities just quietly read as one. Fold the coordinates into the seed
  // for the names that are actually shared; unique names keep their prose byte
  // for byte. This is the SAME disambiguator the entity path uses (batch 122),
  // so the seed and the identity now agree on what makes a city one city.
  const sharedCitySeed = new Set<string>();
  {
    const seen = new Set<string>();
    for (const ci of cities) {
      const base = `earth/${ci.iso2}/${ci.city}`.replace(/\s+/g, '_');
      if (seen.has(base)) sharedCitySeed.add(base); else seen.add(base);
    }
  }
  say('cities', 'placing cities…');
  const nodes: SettleNode[] = [];
  let placed = 0, snapped = 0, feederCount = 0, rulerCount = 0;
  let partyXY: { x: number; y: number } | null = null;
  for (const ci of cities) {
    const power = realmByIso.get(ci.iso2);
    const parentId = power ? power.ent.id : (contEnt[byIso.get(ci.iso2)?.region ?? ''] ?? contEnt.Europe!).id;
    const [x0, y0] = ll2world(ci.lat, ci.lng);
    const [x, y, wasSnapped] = snap(x0, y0); if (wasSnapped) snapped++;
    const b = biomeAt(cfg, x, y, 6);
    const coastal = ([[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]] as Array<[number, number]>).some(([dx, dy]) => isSea(x + dx, y + dy));
    const fname = uniqueName((s) => fantasyCity(ci.city, coastal, s), usedNames);
    const isCapital = ci.capital === 'primary';
    const big = ci.pop >= 1_000_000;
    const cls = ci.pop >= 500_000 ? 'city' : ci.pop >= 60_000 ? 'town' : 'village';
    const base = `earth/${ci.iso2}/${ci.city}`.replace(/\s+/g, '_');
    const seed = sharedCitySeed.has(base) ? `${base}/${ci.lat},${ci.lng}` : base;
    // The entity path carries the COORDINATES because `earth/CN/Fuyang` names two
    // different real cities — 23 such pairs — so a name-keyed path would hash two
    // cities to one id and silently delete one of them. The composite `seed`
    // above now carries them too, on exactly those shared names (see above).
    const cityPath = `s:${ci.iso2}:${ci.city}:${ci.lat},${ci.lng}`;

    let ent: EntityRecord;
    if (isCapital || big) {
      // full generated settlement page for the powers' seats and the megacities
      const size = ci.pop >= 500_000 ? 'city' : 'town';
      const gov = power ? (power.ent.fields as Record<string, string>).government : '';
      const rr = await run('settlement', seed, { size, population: ci.pop, biome: b, government: gov, coastal: coastal ? '1' : '' });
      ent = blocksToEntity(rr.metaId, seed, rr.blocks as never, fname, parentId);
      ent.name = fname; // keep the fantasy name over the composite's rolled one
      ent.kind = 'settlement';
      ent.fields = { ...(ent.fields ?? {}), population: ci.pop };
    } else {
      ent = newEntity('settlement', fname, parentId);
      ent.fields = { population: String(ci.pop) };
      ent.body = [{ type: 'paragraph', id: 'b_real', label: 'On Earth', text: `A fantasyfied ${ci.city}${ci.admin && ci.admin !== ci.city ? `, ${ci.admin}` : ''} — ${power ? 'of ' + power.fr.name : ''}. Population ~${ci.pop ? ci.pop.toLocaleString('en-US') : 'a few thousand'}.` }] as EntityRecord['body'];
    }
    ent.tags = [cls, ...(isCapital ? ['capital'] : [])];
    add(ent, cityPath);
    surface.anchors.push({
      entityId: ent.id, x: Math.round(x), y: Math.round(y),
      tier: ci.pop >= 3_000_000 ? 'world' : 'region', icon: isCapital ? 'city' : cls === 'city' ? 'city' : 'town',
      ...(ci.pop >= 3_000_000 ? { promoted: true } : {}),
    });
    // settleTier is the shared rule the browser re-forges roads with; deriving it
    // a second time is how the two drifted apart in the first place
    nodes.push({ tier: settleTier(ent.tags, ci.pop), x, y, pop: Math.max(ci.pop, 200), name: fname, type: 'market town', reason: '', ki: 0 } as SettleNode);
    if (ci.iso2 === 'GB' && ci.city === 'London') partyXY = { x: Math.round(x), y: Math.round(y) };
    placed++;

    // a ruler for each realm, hung off its capital. Where we know the real 2026
    // head of the power, the ruler IS the fantasyfied version of them (item #6).
    if (isCapital && power && !power.ruler) {
      const pr = await run('npc-block', seed + '/ruler');
      const ruler = blocksToEntity(pr.metaId, seed + '/ruler', pr.blocks as never, 'Ruler', power.ent.id);
      ruler.kind = 'person'; ruler.tags = ['ruler'];
      const real = LEADERS[ci.iso2];
      if (real) {
        const title = leaderTitle(power.fr.title);
        ruler.name = `${title} ${fantasyLeader(real.anchor, ci.iso2)}`;
        ruler.tags = ['ruler', 'head-of-state'];
        ruler.body = [{ type: 'paragraph', id: 'b_realruler', label: 'On Earth',
          text: `The ${title.toLowerCase()} of ${power.fr.name} — a fantasyfied ${real.name}, ${real.office} of ${power.country?.name} in 2026.` },
          ...(ruler.body ?? [])] as EntityRecord['body'];
      }
      add(ruler, `${cityPath}/ruler`); rulerCount++;
      // `ruler`, not `leader`: a region is a PLACE, and settlement/webs.ts both
      // call a place's head its ruler — `leader` is the faction word (item #28).
      power.ent.fields = { ...power.ent.fields, ruler: { ref: ruler.id }, seat: { ref: ent.id } };
      power.ruler = ruler;
    }

    // feeder hamlets (item #9): a metropolis can't feed itself — it needs an
    // agricultural hinterland of farming villages around it.
    if (ci.pop >= 700_000) {
      const nFeed = Math.min(4, Math.floor(ci.pop / 1_500_000) + 1);
      for (let f = 0; f < nFeed; f++) {
        const ang = (f / nFeed) * 2 * Math.PI + (ci.pop % 7) * 0.3;
        const ring = 2 + (f % 2); // 2–3 region hexes out, past the built-up area
        let fx = x + Math.cos(ang) * STEP * ring, fy = y + Math.sin(ang) * STEP * ring;
        if (isSea(fx, fy)) { const s = snap(fx, fy); fx = s[0]; fy = s[1]; if (isSea(fx, fy)) continue; }
        const fName = uniqueName((s) => hamletName(s ? `${seed}/feed${f}/${s}` : `${seed}/feed${f}`), usedNames);
        const fe = add({ ...newEntity('settlement', fName, parentId), tags: ['village', 'farm-town'] }, `${cityPath}/feed${f}`);
        fe.fields = { population: String(1200 + ((Math.abs(Math.round(fx + fy)) % 9) * 350)), settlementType: 'farming village' };
        fe.body = [{ type: 'paragraph', id: 'b_feed', text: `A farming village of the ${fname} hinterland — its fields, herds, and mills help feed the city.` }] as EntityRecord['body'];
        surface.anchors.push({ entityId: fe.id, x: Math.round(fx), y: Math.round(fy), tier: 'region', icon: 'village' });
        feederCount++;
      }
    }
  }

  // --- roads: forged ONCE, for the whole planet ---
  //
  // This used to bucket by iso2 and call generateRoads per country because "1500
  // global nodes is O(n^2) A* and would never finish". True then; not since the
  // capital MST went from pricing every capital PAIR to each capital's six
  // nearest (batch 119). What the bucketing cost: `ns.length > 40` skipped the
  // biggest countries outright, so CHINA (488 cities), INDIA (103) and the USA
  // (87) had no roads at all; `< 2` skipped 147 one-city countries; a
  // cross-border road was structurally impossible (item #11); roads ran parallel
  // across a border because each call kept its own drawn-edge set (item #10b);
  // and traffic percentiles were per call, so "highway" meant "the busiest roads
  // in LUXEMBOURG" as readily as in China. generateRoads already groups by
  // CONTINENT, which is the bucketing that was actually wanted: geography, not
  // politics.
  say('roads', 'forging roads…');
  // Item #12. generateRoads finds a great river ONLY via the grid's riverOn/
  // bandOf — the TRACED drainage. This world drops the traced band-≥3 rivers and
  // draws the authored real courses instead, so the road pass was planning
  // against a network nobody can see. Feed the authored courses back in.
  const bigRiverRoutes = surface.routes.filter((r: Record<string, unknown>) => r.kind === 'river' && ((r.w as number) ?? 1) >= 3);
  const roadGrid = withAuthoredRivers(hydro.grid, bigRiverRoutes as never);
  const roads = generateRoads(cfg, roadGrid, nodes);
  surface.routes.push(...roads.routes);
  let bridgeCount = 0;
  // Bridges go where the drawn road MEETS the drawn river, not at the crossing
  // hex's centre — a hex is 60mi across, so centring left bridges tens of miles
  // from any water ("many not even over rivers").
  for (const [bx, by] of bridgeCrossings(roads.routes, bigRiverRoutes as never)) {
    // file it under the realm it stands in — the country came free when roads
    // were forged per country; ask the admin raster now
    const iso = countryAt(cfg, bx, by);
    const e = add({ ...newEntity('landmark', 'River Bridge', realmByIso.get(iso)?.ent?.id), tags: ['bridge'] }, `b:${Math.round(bx)},${Math.round(by)}`);
    e.body = [{ type: 'paragraph', id: 'b_bridge', text: 'Where a road crosses a great river — tolls, gossip, and the slow traffic of carts.' }] as EntityRecord['body'];
    surface.anchors.push({ entityId: e.id, x: Math.round(bx), y: Math.round(by), tier: 'region', icon: 'bridge' });
    bridgeCount++;
  }

  // the party stands at fantasy-London (the travel tool starts here)
  surface.party = partyXY ?? { x: Math.round(ll2world(51.5, -0.13)[0]), y: Math.round(ll2world(51.5, -0.13)[1]) };

  return {
    world,
    stats: {
      powers: countries.length, cities: cities.length, features: features.length,
      greatRivers: bigRiverCount, realms: realmByIso.size, landless, claimedHexes,
      placed, snapped, rulers: rulerCount, feeders: feederCount,
      roads: roads.routes.length, bridges: bridgeCount,
    },
  };
}
