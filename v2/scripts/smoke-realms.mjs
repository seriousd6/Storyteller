// Realms smoke (item #3): a real Earth must come out of creation with crowns
// that actually HOLD GROUND, and with a political map you can read.
//
// This is the regression this whole item exists to prevent: `plane.claims` was
// initialised `{}` and nothing but the hand-paint brush ever wrote to it, so
// 245 realms owned nought and the map drew no borders at all — for two years,
// silently, because a world with empty claims is perfectly valid and renders
// perfectly fine. Nothing failed. It was just blank.
//
// Part of `npm run smoke`.

import { readFileSync } from 'node:fs';
import { ensureEarthGrid, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';
import { ensureEarthAdmin, generateEarthRealms, countryAt } from '../src/everdeep/earthRealms.ts';
import { colorClaims, pointToHex, hexCenter, CLAIM_HEX_FT } from '../src/everdeep/hexgrid.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

await ensureEarthGrid();
await ensureEarthAdmin();
const earth = {
  seed: 'earth', landform: 'earth', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT,
  waterPct: 50, climate: 'temperate', climateModel: 'earthlike',
};

// --- is the raster on the right planet, the right way up? ---
// A raster read with a flipped row order or a half-world longitude offset still
// produces a beautiful, plausible political map — of nowhere. Pin it to places
// whose country is not a matter of opinion.
const ll = (lat, lon) => {
  let u = ((lon + 180) / 360) % 1; if (u < 0) u += 1;
  return [u * EARTH_CIRCUM_FT, -(lat / 90) * (EARTH_HEIGHT_FT / 2)];
};
const PLACES = [
  ['Paris', 48.86, 2.35, 'FR'], ['Tokyo', 35.68, 139.69, 'JP'], ['Cairo', 30.04, 31.24, 'EG'],
  ['Buenos Aires', -34.6, -58.38, 'AR'], ['Sydney', -33.87, 151.21, 'AU'],
  ['Denver', 39.74, -104.98, 'US'], ['Nairobi', -1.29, 36.82, 'KE'], ['Delhi', 28.61, 77.21, 'IN'],
];
const wrong = PLACES.filter(([, lat, lon, want]) => countryAt(earth, ...ll(lat, lon)) !== want);
wrong.length === 0
  ? ok(`the border raster is oriented correctly (${PLACES.length} cities in the right country)`)
  : fail(`raster misprojected — ${wrong.map((p) => p[0]).join(', ')} landed in the wrong country`);

// --- the sweep ---
const { realms, unclaimedLand, wildLand } = generateEarthRealms(earth);
const held = realms.reduce((s, r) => s + r.hexes.length, 0);
const landed = realms.filter((r) => r.hexes.length).length;
console.log(`   ${realms.length} realms, ${landed} hold ground, ${held.toLocaleString()} world hexes`);
console.log(`   ${unclaimedLand} land hexes disputed, ${wildLand.toLocaleString()} wild (Antarctic ice)`);

held > 20_000
  ? ok(`crowns hold ${held.toLocaleString()} world hexes — the political map has territory`)
  : fail(`crowns hold only ${held} hexes — claims are empty again (the item #3 regression)`);
realms.length >= 240
  ? ok(`${realms.length} realms — one per country, including the landless microstates`)
  : fail(`only ${realms.length} realms; the bake parents its cities off these`);
// If this ever spikes, the raster failed to load and every crown quietly lost
// its ground — which looks exactly like "no borders" and nothing else complains.
unclaimedLand < 200
  ? ok(`only ${unclaimedLand} land hexes unclaimed (disputed ground)`)
  : fail(`${unclaimedLand} land hexes unclaimed — did the admin raster load?`);
realms.every((r) => r.name && r.iso && r.region)
  ? ok('every realm has a name, an ISO code and a continent')
  : fail('a realm is missing its name, code or continent');
new Set(realms.map((r) => r.name)).size === realms.length
  ? ok(`all ${realms.length} realm names unique`)
  : fail('two realms share a name');
realms.some((r) => / \d+$/.test(r.name))
  ? fail('a realm name ends in a number — the name pool is exhausted (item #2)')
  : ok('no realm name falls back to a numeric suffix');

// The big ones must be the big ones. A subtly broken sweep still produces
// ~23k claimed hexes; what it cannot fake is Russia being the largest country.
const top = [...realms].sort((a, b) => b.hexes.length - a.hexes.length).slice(0, 6).map((r) => r.iso);
console.log(`   largest realms: ${top.join(' ')}`);
['RU', 'CA', 'US', 'CN'].every((i) => top.includes(i))
  ? ok('the largest realms are Russia, Canada, the USA and China')
  : fail(`largest realms look wrong: ${top.join(' ')}`);
realms.find((r) => r.iso === 'AQ')
  ? fail('Antarctica was made a realm — the ice is meant to stay wild')
  : ok('Antarctica is not a crown');

// --- a claim address must mean the same hex to whoever reads it ---
// The sweep mints "world:q,r" and the renderer resolves it. They agree only
// because both call hexgrid; this is the assertion that keeps them married.
const RU = realms.find((r) => r.iso === 'RU');
const roundTrips = RU.hexes.every((addr) => {
  const m = /^world:(-?\d+),(-?\d+)$/.exec(addr);
  const [cx, cy] = hexCenter(CLAIM_HEX_FT.world, +m[1], +m[2]);
  const [q, r] = pointToHex(CLAIM_HEX_FT.world, cx, cy);
  return q === +m[1] && r === +m[2];
});
roundTrips
  ? ok(`all ${RU.hexes.length} of Russia's claim addresses round-trip through the lattice`)
  : fail('a claim address does not resolve to the hex that minted it');

// --- the political map has to be readable ---
const claims = Object.fromEntries(realms.filter((r) => r.hexes.length).map((r) => [r.iso, r.hexes]));
const PALETTE = ['#e0b34d', '#c96a6a', '#7f9fd1', '#8fc98a', '#b58fd1', '#d19a6a'];
const { colors, conflicts } = colorClaims(claims, PALETTE, EARTH_CIRCUM_FT);
console.log(`   colouring: ${new Set([...colors.values()]).size}/${PALETTE.length} colours used, ${conflicts} touching realms share one`);
conflicts === 0
  ? ok('no two realms that share a border share a colour')
  : fail(`${conflicts} pairs of neighbours share a colour — the map lies there`);
colors.size === Object.keys(claims).length
  ? ok('every landed realm got a colour')
  : fail('a realm has no colour');

// --- the shipped fixture actually carries all this ---
const w = JSON.parse(readFileSync(new URL('../public/labs/earth.example.json', import.meta.url), 'utf8'));
const p = w.planes[0];
const owners = Object.keys(p.claims ?? {});
const fixtureHexes = owners.reduce((s, o) => s + p.claims[o].length, 0);
console.log(`   fixture: ${owners.length} owners, ${fixtureHexes.toLocaleString()} claimed hexes`);
fixtureHexes > 20_000
  ? ok(`the shipped Earth carries ${fixtureHexes.toLocaleString()} claimed hexes`)
  : fail('the shipped Earth has no claims — re-run the bake');
owners.every((o) => w.entities[o] && !w.entities[o].deleted)
  ? ok('every claim owner is a live entity')
  : fail('a claim is owned by a missing or deleted entity — it would render as nothing');
// Subrealms (owner D14/D16) NEST on purpose: a province claims a partition of
// its parent realm's hexes, so parent + child sharing a hex is the design and
// the stacked wash is the internal-border reading. What is still a bug: two
// SOVEREIGN owners on one hex, a province leaking into a foreign realm, or
// two provinces overlapping each other.
(() => {
  const holder = new Map(); // addr -> sovereign crown holding it
  let sovereignDup = 0, crossDup = 0, subDup = 0, orphanSub = 0, escapes = 0;
  const isSub = (o) => (w.entities[o]?.tags ?? []).includes('subrealm');
  const subs = owners.filter(isSub), crowns = owners.filter((o) => !isSub(o));
  for (const o of crowns) {
    for (const a of p.claims[o]) {
      if (holder.has(a)) sovereignDup++; else holder.set(a, o);
    }
  }
  const subSeen = new Set();
  for (const o of subs) {
    const parent = w.entities[o]?.parentId;
    if (!parent || !w.entities[parent]) { orphanSub++; continue; }
    for (const a of p.claims[o]) {
      if (subSeen.has(a)) subDup++; else subSeen.add(a);
      const crown = holder.get(a);
      if (crown === undefined) escapes++;      // province claims unclaimed ground
      else if (crown !== parent) crossDup++;   // province leaks into a foreign realm
    }
  }
  sovereignDup === 0
    ? ok(`no hex has two sovereign crowns (${crowns.length} crowns)`)
    : fail(`${sovereignDup} hexes claimed by two sovereign crowns — washes would stack wrong`);
  subDup === 0
    ? ok(`no hex has two provinces (${subs.length} provinces partition cleanly)`)
    : fail(`${subDup} hexes claimed by two provinces`);
  crossDup === 0 && escapes === 0 && orphanSub === 0
    ? ok('every province hex sits inside its own parent realm')
    : fail(`province leakage: ${crossDup} cross-realm, ${escapes} outside any crown, ${orphanSub} orphaned subrealms`);
})();

console.log(failures ? `Realms smoke: ${failures} FAILURES` : 'Realms smoke: all green.');
process.exit(failures ? 1 : 0);
