#!/usr/bin/env node
// Bake an Earth country-ownership raster from Natural Earth 10m admin-0
// polygons (public domain; nvkelso/natural-earth-vector). This is what gives
// item #3 its territory: `plane.claims` was initialised `{}` and never filled,
// so the 245 realm entities owned no ground and the political map drew nothing.
//
//   node docs/everdeep/scripts/bake-earth-admin.mjs <ne_10m_admin_0_countries.geojson>
//
// One BYTE per cell: an index into ADMIN_CODES (0 = nobody — ocean, Antarctica,
// or a disputed area we decline to award). 239 distinct ISO_A2 codes fit a
// Uint8Array with room to spare; if Natural Earth ever crosses 254 this script
// fails loudly rather than silently wrapping a country onto another's index.
//
// Same projection as bake-earth-coast.mjs — standard equirectangular, col 0 =
// lon -180, row 0 = lat +90. NOT the mid-Pacific-left convention that
// earthData/earthBiome use; terrain.ts keeps those straight per raster.
//
// The emitted module also carries each country's real name and continent from
// v2/public/data/countries.json, so the browser can rename them without a
// second data file: earthRealms.ts feeds them to fantasyRealm().

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const src = process.argv[2];
if (!src) {
  console.error('usage: bake-earth-admin.mjs <ne_10m_admin_0_countries.geojson> [outfile] [width]');
  process.exit(1);
}
const W = Number(process.argv[4]) || 2160;   // ~18.5 km/cell at the equator
const H = W / 2;

const geo = JSON.parse(readFileSync(src, 'utf8'));
const countries = JSON.parse(
  readFileSync(new URL('../../../v2/public/data/countries.json', import.meta.url), 'utf8')
);
const known = new Map(countries.map((c) => [c.iso2, c]));

// Natural Earth marks "no code" as the string '-99'. ISO_A2_EH resolves a few
// that ISO_A2 leaves blank; where both abstain the feature is a disputed or
// unadministered area (Somaliland, N. Cyprus, Bir Tawil, the Spratlys, ice
// fields) — we award those to nobody rather than invent a claim.
const iso2Of = (p) => {
  for (const k of ['ISO_A2_EH', 'ISO_A2']) {
    const v = p[k];
    if (v && v !== '-99' && known.has(v)) return v;
  }
  return null;
};

const feats = [];
const declined = [];
for (const ft of geo.features) {
  const iso = iso2Of(ft.properties);
  if (!iso) { declined.push(ft.properties.ADMIN); continue; }
  const g = ft.geometry;
  if (!g) continue;
  const polys = g.type === 'Polygon' ? [g.coordinates]
    : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of polys) feats.push({ iso, poly });
}
console.log(`${geo.features.length} features -> ${feats.length} polygons`);
console.log(`declined (no ISO): ${declined.length}${declined.length ? ' — ' + declined.join(', ') : ''}`);

// index 0 is reserved for "nobody"
const codes = [''];
const idxOf = new Map();
for (const f of feats) {
  if (idxOf.has(f.iso)) continue;
  idxOf.set(f.iso, codes.length);
  codes.push(f.iso);
}
if (codes.length > 255) {
  console.error(`FATAL: ${codes.length - 1} countries will not fit one byte per cell.`);
  process.exit(1);
}
console.log(`${codes.length - 1} countries -> palette of ${codes.length} (1 byte/cell)`);

const px = (lon) => (lon + 180) / 360 * W;
const py = (lat) => (90 - lat) / 180 * H;

const grid = new Uint8Array(W * H); // 0 = nobody

// Paint the biggest polygons FIRST so an enclave or a small island painted
// later wins its cells outright. NE's admin-0 rings barely overlap, but where
// they do (coastal slivers, disputed edges) "small wins" is the reading that
// keeps microstates on the map instead of swallowing them.
const areaOf = (poly) => {
  let a = 0;
  const ring = poly[0] ?? [];
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
};
feats.sort((a, b) => areaOf(b.poly) - areaOf(a.poly));

// Per-polygon scanline fill, even-odd across the polygon's own rings so holes
// (Lesotho inside South Africa, the Vatican inside Rome) read as unclaimed and
// get filled by their own polygon later. Lifted from bake-earth-coast.mjs.
for (const { iso, poly } of feats) {
  const v = idxOf.get(iso);
  const edges = [];
  let minY = H, maxY = 0;
  for (const ring of poly) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = px(ring[i][0]), ay = py(ring[i][1]);
      const bx = px(ring[i + 1][0]), by = py(ring[i + 1][1]);
      if (ay === by) continue; // horizontal edges never cross a scanline midpoint
      edges.push([ax, ay, bx, by]);
      minY = Math.min(minY, ay, by); maxY = Math.max(maxY, ay, by);
    }
  }
  const r0 = Math.max(0, Math.floor(minY)), r1 = Math.min(H - 1, Math.ceil(maxY));
  for (let row = r0; row <= r1; row++) {
    const yc = row + 0.5;
    const xs = [];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) {
        xs.push(ax + (yc - ay) / (by - ay) * (bx - ax));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const cx0 = Math.max(0, Math.ceil(xs[k] - 0.5));
      const cx1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      const base = row * W;
      for (let c = cx0; c <= cx1; c++) grid[base + c] = v;
    }
  }
}

// A polygon thinner than a cell can miss every scanline midpoint and vanish.
// Stamp the centroid of any country that came out empty so microstates still
// exist in the raster — better one cell than none.
let stamped = 0;
const present = new Set(grid);
for (const [iso, v] of idxOf) {
  if (present.has(v)) continue;
  const c = known.get(iso);
  if (!c?.latlng) continue;
  const cx = Math.min(W - 1, Math.max(0, Math.floor(px(c.latlng[1]))));
  const cy = Math.min(H - 1, Math.max(0, Math.floor(py(c.latlng[0]))));
  grid[cy * W + cx] = v;
  stamped++;
}
if (stamped) console.log(`${stamped} sub-cell countries stamped at their centroid`);

// sanity: how much of the land did we award, and to how many?
const owners = new Set();
let claimed = 0;
for (let i = 0; i < grid.length; i++) if (grid[i]) { claimed++; owners.add(grid[i]); }
console.log(`${owners.size} countries hold ${claimed.toLocaleString()} cells ` +
  `(${(claimed / grid.length * 100).toFixed(1)}% of the sphere; Earth's land is ~29%)`);

const gz = gzipSync(Buffer.from(grid), { level: 9 });
console.log(`raw ${(grid.length / 1e6).toFixed(1)} MB -> gzip ${(gz.length / 1e3).toFixed(0)} KB`);

// Meta covers EVERY country in countries.json, not just the ones that won
// raster cells. Natural Earth folds 11 of them into a parent (Guadeloupe,
// Martinique, Réunion, Svalbard…), and the bake has always minted a realm per
// country — dropping them here would silently re-parent their cities to a
// continent. A realm with no territory is fine; a missing realm is a regression.
const meta = {};
for (const c of countries) meta[c.iso2] = { name: c.name, region: c.region };
const noPolygon = countries.filter((c) => !idxOf.has(c.iso2)).map((c) => c.iso2);
console.log(`meta covers ${Object.keys(meta).length} countries; ` +
  `${noPolygon.length} have no polygon of their own (${noPolygon.join(' ')})`);

const b64 = gz.toString('base64');
const out = `// GENERATED — do not edit by hand. Earth country-ownership raster baked from
// Natural Earth 10m admin-0 polygons (public domain, nvkelso/natural-earth-
// vector) by docs/everdeep/scripts/bake-earth-admin.mjs. One byte per cell: an
// index into ADMIN_CODES, 0 = nobody (ocean, Antarctica, disputed ground).
// Standard equirectangular: col 0 = lon -180, row 0 = lat +90 — the same
// convention as earthCoast.ts, NOT the mid-Pacific-left of earthData/earthBiome.
// Lazy-imported: only an 'earth' world pulls this chunk.

export const EARTH_ADMIN_W = ${W};
export const EARTH_ADMIN_H = ${H};

/** Palette index -> ISO 3166-1 alpha-2. Index 0 means nobody holds the cell. */
export const ADMIN_CODES: string[] = ${JSON.stringify(codes)};

/** The real country behind each ISO code — what fantasyRealm() renames. Shipped
 *  here so the browser needs no second data file to build its realms. Covers
 *  every country in countries.json, including the handful Natural Earth folds
 *  into a parent and which therefore hold no cell of their own. */
export const ADMIN_META: Record<string, { name: string; region: string }> = ${JSON.stringify(meta)};

const GZ_B64 = '${b64}';

let _grid: Uint8Array | null = null;

/** Inflate the country raster, lazily and once. */
export async function earthAdminGrid(): Promise<Uint8Array> {
  if (_grid) return _grid;
  const raw = Uint8Array.from(atob(GZ_B64), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream('gzip');
  _grid = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
  return _grid;
}
`;
// fileURLToPath, not URL.pathname: on Windows the latter yields "/C:/..." and
// leaves %20 in the owner's "David Seis" path. Depth is ../../../ — this file
// sits in docs/everdeep/scripts/, and v2/ is a sibling of docs/.
const dest = process.argv[3] || fileURLToPath(new URL('../../../v2/src/everdeep/earthAdmin.ts', import.meta.url));
writeFileSync(dest, out);
console.log('wrote', dest, `(${(out.length / 1e3).toFixed(0)} KB source)`);
