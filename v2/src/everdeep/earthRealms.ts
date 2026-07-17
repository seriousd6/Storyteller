// Who holds what, on a real-Earth world (owner, item #3).
//
// "realms should exist in the earth example, the regions should span the real
// earth's borders and the realm's name should be the improved fantasyfied name
// of the country."
//
// The realms half already existed — the bake minted one region entity per
// country and named it through fantasyRealm(). The TERRITORY half never did:
// `plane.claims` was initialised `{}` and the only thing in the whole repo that
// ever wrote to it was the hand-paint brush. So 245 crowns owned nought and the
// political map drew nothing at all.
//
// This module is the missing producer, and it lives HERE rather than in the
// bake on purpose: `landform: 'earth'` is a first-class choice in the new-world
// dialog, so an owner rolling their own Earth in the browser has to get realms
// too (PLAN, 🌐 browser-based). The bake calls exactly this code.

import { biomeAt, earthUV, octFor, type BiomeId, type TerrainCfg } from './terrain.ts';
import { fantasyRealm, fantasySubrealm, fantasyGovernment, uniqueName } from './fantasyEarth.ts';
import { CLAIM_HEX_FT, claimAddr, hexCenter, hexR, SQ3 } from './hexgrid.ts';

/** The continents realms hang under — the top of an Earth world's tree. Keyed
 *  by the `region` of countries.json, which is what ADMIN_META carries. */
export const EARTH_CONTINENTS: Record<string, string> = {
  Americas: 'The Americas',
  Europe: 'The Old World — Europe',
  Africa: 'The Sunlands — Africa',
  Asia: 'The Vast East — Asia',
  Oceania: 'The Reefs — Oceania',
  Antarctic: 'The White South',
};

/** A crown and the ground it holds. The caller mints the entity — this module
 *  returns data, the way generateSettlements() returns nodes. */
export interface EarthRealm {
  /** ISO 3166-1 alpha-2 — the join key back to cities, rulers and borders. */
  iso: string;
  /** The fantasyfied name: "The Kingdom of Gallia". */
  name: string;
  title: string;
  /** The real country and continent behind it, for provenance and for the
   *  region-flavoured title/government tables. */
  realName: string;
  region: string;
  government: string;
  /** Claim addresses ("world:q,r") this realm holds. MAY BE EMPTY: a country
   *  with no land of its own at this grain wins nothing — see generateEarthRealms. */
  hexes: string[];
  /** Where to write the realm's name on the map — a hex it actually holds,
   *  near the middle of its territory. Absent when it holds nothing. */
  label?: [number, number];
}

/**
 * Where a realm's name goes: the hex nearest the middle of its own territory.
 *
 * The mean of x is CIRCULAR. Russia spans the date line and Fiji sits on it, so
 * averaging their hexes' x as plain numbers puts the label in the wrong ocean —
 * halfway round the world from the country it names. Averaging unit vectors and
 * taking the angle back is the standard fix and costs nothing.
 *
 * Then it snaps to a hex the realm actually holds, so a crescent-shaped or
 * scattered country (Indonesia, Chile) never writes its name across a
 * neighbour or out at sea.
 */
function labelPoint(hexes: string[], hexFt: number, circumFt: number): [number, number] | undefined {
  const pts: Array<[number, number]> = [];
  let cxs = 0, sxs = 0, sy = 0;
  for (const addr of hexes) {
    const m = /^world:(-?\d+),(-?\d+)$/.exec(addr);
    if (!m) continue;
    const [x, y] = hexCenter(hexFt, Number(m[1]), Number(m[2]));
    const xn = ((x % circumFt) + circumFt) % circumFt;
    pts.push([xn, y]);
    const a = (xn / circumFt) * Math.PI * 2;
    cxs += Math.cos(a); sxs += Math.sin(a); sy += y;
  }
  if (!pts.length) return undefined;
  let ang = Math.atan2(sxs / pts.length, cxs / pts.length);
  if (ang < 0) ang += Math.PI * 2;
  const mx = (ang / (Math.PI * 2)) * circumFt, my = sy / pts.length;
  let best = pts[0]!, bestD = Infinity;
  for (const p of pts) {
    let dx = Math.abs(p[0] - mx);
    if (dx > circumFt / 2) dx = circumFt - dx; // still periodic when measuring
    const d = dx * dx + (p[1] - my) * (p[1] - my);
    if (d < bestD) { bestD = d; best = p; }
  }
  return [Math.round(best[0]), Math.round(best[1])];
}

type AdminData = {
  grid: Uint8Array;
  w: number; h: number;
  codes: string[];
  meta: Record<string, { name: string; region: string }>;
};
let A: AdminData | null = null;

/** Pull the country raster. Lazy and once, like ensureEarthGrid — only an
 *  'earth' world ever pays for the chunk. */
export async function ensureEarthAdmin(): Promise<void> {
  if (A) return;
  const m = await import('./earthAdmin.ts');
  A = {
    grid: await m.earthAdminGrid(),
    w: m.EARTH_ADMIN_W, h: m.EARTH_ADMIN_H,
    codes: m.ADMIN_CODES, meta: m.ADMIN_META,
  };
}

export function earthAdminLoaded(): boolean { return A !== null; }

type Admin1Data = {
  grid: Uint16Array;
  w: number; h: number;
  codes: string[];
  meta: Record<string, { name: string; country: string }>;
};
let A1: Admin1Data | null = null;

/** Pull the province raster (the D14 ten federations). Lazy and once. */
export async function ensureEarthAdmin1(): Promise<void> {
  if (A1) return;
  const m = await import('./earthAdmin1.ts');
  A1 = {
    grid: await m.earthAdmin1Grid(),
    w: m.EARTH_ADMIN1_W, h: m.EARTH_ADMIN1_H,
    codes: m.ADMIN1_CODES, meta: m.ADMIN1_META,
  };
}

/** Which province holds this world point? '' = none (ocean, or a country
 *  outside the ten federations). Nearest-neighbour for the same categorical
 *  reason as countryAt. */
export function admin1At(cfg: TerrainCfg, x: number, y: number): string {
  if (!A1) return '';
  const [u, latFrac] = earthUV(cfg, x, y);
  const col = ((Math.round(u * A1.w - 0.5) % A1.w) + A1.w) % A1.w;
  const row = Math.max(0, Math.min(A1.h - 1, Math.round((1 + latFrac) / 2 * (A1.h - 1))));
  return A1.codes[A1.grid[row * A1.w + col]!] ?? '';
}

/**
 * Which country holds this world point? '' = nobody (ocean, Antarctica, or
 * ground Natural Earth declines to award).
 *
 * Nearest-neighbour, deliberately: a country index is a CATEGORY. Bilinear
 * would average France(61) with Spain(62) and hand the border cell to
 * Gabon(63) — the trap `landCoverAt` already documents for land cover. Nor is
 * it domain-warped: at 18.5 km/cell sampled by 60-mile hexes the quantisation
 * dwarfs any warp we'd add, so a warp would only cost time and lie about
 * where the border is.
 */
export function countryAt(cfg: TerrainCfg, x: number, y: number): string {
  if (!A) return '';
  const [u, latFrac] = earthUV(cfg, x, y);
  const col = ((Math.round(u * A.w - 0.5) % A.w) + A.w) % A.w;
  const row = Math.max(0, Math.min(A.h - 1, Math.round((1 + latFrac) / 2 * (A.h - 1))));
  return A.codes[A.grid[row * A.w + col]!] ?? '';
}

const WET = new Set<BiomeId>(['deep', 'water']);

/** Antarctica is not a crown. The bake has always skipped `region ===
 *  'Antarctic'` when minting realms, and the settlement smoke asserts nothing
 *  is ever founded on the ice — so awarding it 9,328 world hexes would have
 *  made the ice cap the largest realm on the map, and a third of the claim
 *  file, purely as an artefact of Natural Earth having a polygon for it. */
const SKIP_REGION = new Set(['Antarctic']);

/**
 * The crown holding the most of this hex, by a 7-point straw poll: the centre
 * plus one sample toward each corner.
 *
 * A single centre sample is not good enough, and the failure is specific. A
 * country polygon stops at its own coastline, so a COASTAL cell of an 18.5 km
 * raster is often the water beside the city rather than the city — sampled at
 * one point, Anchorage (on Cook Inlet) and Nome (on Norton Sound) both come
 * back as nobody while Fairbanks and Juneau inland read US fine. Polling the
 * hex instead of pricking it also settles a hex straddling a border on
 * whichever crown actually holds more of it.
 */
/** The 7 straw-poll points: the hex centre, then one toward each corner. */
function pollPoints(cx: number, cy: number, R: number): Array<[number, number]> {
  const out: Array<[number, number]> = [[cx, cy]];
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k + Math.PI / 6;
    out.push([cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55]);
  }
  return out;
}

function pollHex(cfg: TerrainCfg, cx: number, cy: number, R: number): string {
  const tally = new Map<string, number>();
  let best = '', bestN = 0;
  const pts = pollPoints(cx, cy, R);
  for (let k = 0; k < pts.length; k++) {
    const iso = countryAt(cfg, pts[k]![0], pts[k]![1]);
    if (!iso) continue;
    const n = (tally.get(iso) ?? 0) + 1;
    tally.set(iso, n);
    // the centre breaks a tie: it is the sample most certainly inside this hex
    if (n > bestN || (n === bestN && k === 0)) { best = iso; bestN = n; }
  }
  return best;
}

/** @internal — exposed so the probes/tests can check the poll against the bare
 *  point read without re-deriving the hex lattice. */
export const _pollHexForTest = pollHex;

export interface EarthRealmsResult {
  realms: EarthRealm[];
  /** Land hexes no crown holds: ground Natural Earth declines to award
   *  (Somaliland, N. Cyprus, Bir Tawil, the Spratlys…). Small and expected —
   *  but if this ever comes back in the thousands, the raster didn't load. */
  unclaimedLand: number;
  /** Land hexes left wild by policy — the Antarctic ice. Counted apart from
   *  unclaimedLand so neither can quietly hide the other. */
  wildLand: number;
}

/**
 * Sweep every world-tier hex and hand it to the country beneath its centre.
 *
 * Tier choice is a real trade-off, not an oversight. Claims are stored as
 * address strings in the world doc, so they cost bytes: Earth is ~29k land
 * hexes at world tier (60 mi) — about half a megabyte of JSON — but ~2.5
 * MILLION at region tier (6 mi), which is tens of megabytes and out of the
 * question. World tier it is, and a border therefore steps in 60-mile jumps.
 *
 * Requires ensureEarthGrid() AND ensureEarthAdmin() to have resolved; both
 * reads are synchronous once the rasters are in.
 */
export function generateEarthRealms(cfg: TerrainCfg): EarthRealmsResult {
  const hexFt = CLAIM_HEX_FT.world;
  const oct = octFor(hexFt);
  const R = hexR(hexFt);
  const dx = SQ3 * R;                // column pitch
  const dy = 1.5 * R;                // row pitch
  const rMax = Math.ceil((cfg.heightFt / 2) / dy);
  const cols = Math.round(cfg.circumFt / dx);

  const hexesByIso = new Map<string, string[]>();
  let unclaimedLand = 0, wildLand = 0;

  for (let r = -rMax; r <= rMax; r++) {
    // hexCenter's x is dx*(q + r/2), so the q that opens each row shifts with r
    // — walk the row's own q window or the sweep shears off the map
    const q0 = Math.round(-r / 2);
    for (let i = 0; i < cols; i++) {
      const q = q0 + i;
      const [cx, cy] = hexCenter(hexFt, q, r);
      if (Math.abs(cy) > cfg.heightFt / 2) continue; // past the poles
      // Ask the raster FIRST. It's arithmetic over an in-memory grid, where
      // biomeAt is octaves of noise — and two thirds of the globe is ocean the
      // raster throws out instantly.
      const iso = pollHex(cfg, cx, cy, R);
      const meta = iso ? A?.meta[iso] : undefined;
      if (!meta) {
        // nobody holds it. Land here is ground we EXCLUDED, which is the exact
        // thing item #22 is about — so it gets counted, even though the biomeAt
        // to count it is the most expensive line in this loop.
        if (!WET.has(biomeAt(cfg, cx, cy, oct))) unclaimedLand++;
        continue;
      }
      // Land, per the CURRENT world — not per the raster. The two disagree on
      // purpose: the sea-level slider floods or drains this Earth without
      // touching a border, so a drowned coast must stop being claimable even
      // though Natural Earth still says France owns it.
      //
      // ANY of the seven, not just the centre (owner, item #22: "realms should
      // prefer to end over water rather than exclude land"). Gating on the
      // centre alone made a crown stop short of its own coastline wherever the
      // hex centre happened to fall in the sea, and cost the sub-hex countries
      // — Puerto Rico, Trinidad, Luxembourg — every hex they had. Erring the
      // other way spills a little colour onto the water at a coast, which is
      // what an atlas does anyway. Early-exits on the first land sample, so an
      // inland hex still costs exactly one biomeAt.
      if (!pollPoints(cx, cy, R).some(([sx, sy]) => !WET.has(biomeAt(cfg, sx, sy, oct)))) {
        continue; // wholly drowned — no crown holds open water
      }
      if (SKIP_REGION.has(meta.region)) { wildLand++; continue; }
      const at = hexesByIso.get(iso);
      if (at) at.push(claimAddr('world', q, r));
      else hexesByIso.set(iso, [claimAddr('world', q, r)]);
    }
  }

  // A realm for EVERY country, not just the ones that won ground — a microstate
  // still rules, and the bake hangs its cities off this realm. Stable ISO order
  // so a re-run of the same seed names them identically; uniqueName settles a
  // collision by re-salting rather than appending a counter (item #2).
  const used = new Set<string>();
  const realms: EarthRealm[] = [];
  for (const iso of Object.keys(A?.meta ?? {}).sort()) {
    const meta = A!.meta[iso]!;
    if (SKIP_REGION.has(meta.region) || !meta.region) continue;
    const fr = fantasyRealm(meta.name, meta.region, iso);
    const name = uniqueName((s) => fantasyRealm(meta.name, meta.region, iso, s).full, used);
    const hexes = hexesByIso.get(iso) ?? [];
    realms.push({
      iso,
      name,
      title: fr.title,
      realName: meta.name,
      region: meta.region,
      government: `${fr.title.replace(/ of$/, '')} — ${fantasyGovernment(meta.region, meta.name)}`,
      hexes,
      label: labelPoint(hexes, hexFt, cfg.circumFt),
    });
  }
  return { realms, unclaimedLand, wildLand };
}

/** A province of one of the ten federations (owner D14), and the ground it
 *  holds — a partition of its parent realm's world-tier hexes (owner D16:
 *  claims stay world-tier; the crisp 6-mi border is the raster's job). */
export interface EarthSubrealm {
  /** ISO 3166-2 — "US-WA". */
  code: string;
  /** Parent country's ISO 3166-1 alpha-2. */
  country: string;
  name: string;
  title: string;
  realName: string;
  hexes: string[];
  label?: [number, number];
}

/**
 * Partition each federation realm's hexes among its provinces by the same
 * 7-point straw poll the countries use. A hex whose poll comes back empty
 * (raster slivers, a capital district smaller than a cell) stays with the
 * parent realm only — the union of subrealm claims may be a strict subset of
 * the parent's, never more. Requires ensureEarthAdmin1(). `used` is the
 * world-wide name set — subrealm names join it so cities can't collide.
 */
export function generateEarthSubrealms(cfg: TerrainCfg, realms: EarthRealm[], used: Set<string>): EarthSubrealm[] {
  if (!A1) return [];
  const hexFt = CLAIM_HEX_FT.world;
  const R = hexR(hexFt);
  const byUnit = new Map<string, string[]>();
  for (const realm of realms) {
    for (const addr of realm.hexes) {
      const m = /^world:(-?\d+),(-?\d+)$/.exec(addr);
      if (!m) continue;
      const [cx, cy] = hexCenter(hexFt, Number(m[1]), Number(m[2]));
      // straw poll: the unit holding most of the hex; centre breaks ties
      const tally = new Map<string, number>();
      let best = '', bestN = 0;
      const pts = pollPoints(cx, cy, R);
      for (let k = 0; k < pts.length; k++) {
        const code = admin1At(cfg, pts[k]![0], pts[k]![1]);
        if (!code) continue;
        // a province poll must not leak across the border: the unit has to
        // belong to THIS hex's country, or a coastal cell of the neighbour
        // federation would annex the hex the country sweep already awarded
        if (A1!.meta[code]?.country !== realm.iso) continue;
        const n = (tally.get(code) ?? 0) + 1;
        tally.set(code, n);
        if (n > bestN || (n === bestN && k === 0)) { best = code; bestN = n; }
      }
      if (!best) continue;
      const at = byUnit.get(best);
      if (at) at.push(addr); else byUnit.set(best, [addr]);
    }
  }
  // Every unit of the ten mints a subrealm, landless or not, in stable code
  // order — same policy as the countries (a microstate still rules).
  const subrealms: EarthSubrealm[] = [];
  const regionOf = new Map(realms.map((r) => [r.iso, r.region]));
  for (const code of Object.keys(A1.meta).sort()) {
    const meta = A1.meta[code]!;
    if (!regionOf.has(meta.country)) continue;
    const region = regionOf.get(meta.country)!;
    const fr = fantasySubrealm(meta.name, region);
    const name = uniqueName((s) => fantasySubrealm(meta.name, region, s).full, used);
    const hexes = byUnit.get(code) ?? [];
    subrealms.push({
      code,
      country: meta.country,
      name,
      title: fr.title,
      realName: meta.name,
      hexes,
      label: labelPoint(hexes, hexFt, cfg.circumFt),
    });
  }
  return subrealms;
}
