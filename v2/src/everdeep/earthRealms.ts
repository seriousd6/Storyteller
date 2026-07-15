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
import { fantasyRealm, fantasyGovernment, uniqueName } from './fantasyEarth.ts';
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
   *  smaller than a 60-mile hex wins no hex centre — see generateEarthRealms. */
  hexes: string[];
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
function pollHex(cfg: TerrainCfg, cx: number, cy: number, R: number): string {
  const tally = new Map<string, number>();
  let best = '', bestN = 0;
  for (let k = 0; k < 7; k++) {
    let sx = cx, sy = cy;
    if (k > 0) {
      const a = (Math.PI / 3) * (k - 1) + Math.PI / 6;
      sx += Math.cos(a) * R * 0.55;
      sy += Math.sin(a) * R * 0.55;
    }
    const iso = countryAt(cfg, sx, sy);
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
      // Land, per the CURRENT world — not per the raster. The two disagree on
      // purpose: the sea-level slider floods or drains this Earth without
      // touching a border, so a drowned coast must stop being claimable even
      // though Natural Earth still says France owns it. Testing the CENTRE
      // alone is also what makes the 76 sub-hex countries (Monaco, Singapore,
      // Puerto Rico…) hold nothing — correctly: the map paints this hex from
      // its centre too, so an island with no hex centre on it isn't drawn at
      // world tier, and a wash of colour over open sea would be a lie.
      if (WET.has(biomeAt(cfg, cx, cy, oct))) continue;
      const iso = pollHex(cfg, cx, cy, R);
      if (!iso) { unclaimedLand++; continue; }
      if (SKIP_REGION.has(A?.meta[iso]?.region ?? '')) { wildLand++; continue; }
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
    realms.push({
      iso,
      name,
      title: fr.title,
      realName: meta.name,
      region: meta.region,
      government: `${fr.title.replace(/ of$/, '')} — ${fantasyGovernment(meta.region, meta.name)}`,
      hexes: hexesByIso.get(iso) ?? [],
    });
  }
  return { realms, unclaimedLand, wildLand };
}
