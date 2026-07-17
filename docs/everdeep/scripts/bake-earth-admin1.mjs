#!/usr/bin/env node
// Bake the ADMIN-1 (states/provinces) raster for the ten great federations
// (owner D14: US CA AU BR IN MX DE RU CN AR) from Natural Earth 10m admin-1
// polygons (public domain; nvkelso/natural-earth-vector). Mirrors
// bake-earth-admin.mjs — same projection (standard equirectangular, col 0 =
// lon -180, row 0 = lat +90), same scanline fill, same emitted-module shape —
// with one difference: 330 units outgrow one byte, so the grid is TWO bytes
// per cell (Uint16, little-endian; every target platform is LE).
//
//   node docs/everdeep/scripts/bake-earth-admin1.mjs <ne_10m_admin_1_states_provinces.geojson>
//
// Units are keyed by ISO 3166-2 ("US-WA"); index 0 = no province (ocean,
// countries outside the ten, unadministered ground). Per owner D16 the raster
// is the DRAWING source for crisp internal borders; the editable claim
// entries stay world-tier, so 2160×1080 (~18.5 km/cell) is deliberate — the
// same grain the admin-0 raster uses.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const src = process.argv[2];
if (!src) {
  console.error('usage: bake-earth-admin1.mjs <ne_10m_admin_1_states_provinces.geojson> [outfile] [width]');
  process.exit(1);
}
const W = Number(process.argv[4]) || 2160;
const H = W / 2;

// The curated federal list (owner D14) — never the naive most-subdivided
// heuristic (GB tops that with 232 districts, not states).
const FEDERATIONS = new Set(['US', 'CA', 'AU', 'BR', 'IN', 'MX', 'DE', 'RU', 'CN', 'AR']);

const geo = JSON.parse(readFileSync(src, 'utf8'));

const feats = [];
const skipped = [];
for (const ft of geo.features) {
  const p = ft.properties;
  const iso = (p.iso_a2 || '').toUpperCase();
  if (!FEDERATIONS.has(iso)) continue;
  const code = p.iso_3166_2 && p.iso_3166_2 !== '-99' ? p.iso_3166_2 : null;
  if (!code || !p.name) { skipped.push(`${iso}:${p.name ?? p.woe_name ?? '?'}`); continue; }
  const g = ft.geometry;
  if (!g) continue;
  const polys = g.type === 'Polygon' ? [g.coordinates]
    : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const poly of polys) feats.push({ code, name: p.name, iso, poly });
}
if (skipped.length) console.log(`skipped (no ISO 3166-2): ${skipped.join(', ')}`);

// index 0 is reserved for "no province"
const codes = [''];
const meta = {};
const idxOf = new Map();
for (const f of feats) {
  if (idxOf.has(f.code)) continue;
  idxOf.set(f.code, codes.length);
  codes.push(f.code);
  meta[f.code] = { name: f.name, country: f.iso };
}
console.log(`${idxOf.size} admin-1 units across ${FEDERATIONS.size} federations -> ${feats.length} polygons`);
if (codes.length > 65535) { console.error('FATAL: palette exceeds Uint16'); process.exit(1); }

const px = (lon) => (lon + 180) / 360 * W;
const py = (lat) => (90 - lat) / 180 * H;

const grid = new Uint16Array(W * H); // 0 = no province

// Biggest polygons first so small islands/enclaves painted later win their
// cells outright — same reading as the admin-0 bake.
const areaOf = (poly) => {
  let a = 0;
  const ring = poly[0] ?? [];
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
};
feats.sort((a, b) => areaOf(b.poly) - areaOf(a.poly));

for (const { code, poly } of feats) {
  const v = idxOf.get(code);
  const edges = [];
  let minY = H, maxY = 0;
  for (const ring of poly) {
    for (let i = 0; i < ring.length - 1; i++) {
      const ax = px(ring[i][0]), ay = py(ring[i][1]);
      const bx = px(ring[i + 1][0]), by = py(ring[i + 1][1]);
      if (ay === by) continue;
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

// A unit thinner than a cell (city-states, small islands) can miss every
// scanline midpoint — stamp its first ring's centroid so it exists at all.
let stamped = 0;
const present = new Set(grid);
for (const f of feats) {
  const v = idxOf.get(f.code);
  if (present.has(v)) continue;
  present.add(v);
  const ring = f.poly[0] ?? [];
  let cx = 0, cy = 0;
  for (const [lon, lat] of ring) { cx += lon; cy += lat; }
  if (!ring.length) continue;
  const gx = Math.min(W - 1, Math.max(0, Math.floor(px(cx / ring.length))));
  const gy = Math.min(H - 1, Math.max(0, Math.floor(py(cy / ring.length))));
  grid[gy * W + gx] = v;
  stamped++;
}
if (stamped) console.log(`${stamped} sub-cell units stamped at their centroid`);

const owners = new Set();
let claimed = 0;
for (let i = 0; i < grid.length; i++) if (grid[i]) { claimed++; owners.add(grid[i]); }
console.log(`${owners.size} units hold ${claimed.toLocaleString()} cells (${(claimed / grid.length * 100).toFixed(1)}% of the sphere)`);

const gz = gzipSync(Buffer.from(grid.buffer), { level: 9 });
console.log(`raw ${(grid.byteLength / 1e6).toFixed(1)} MB -> gzip ${(gz.length / 1e3).toFixed(0)} KB`);

const b64 = gz.toString('base64');
const out = `// GENERATED — do not edit by hand. Admin-1 (state/province) raster for the
// ten great federations (owner D14), baked from Natural Earth 10m admin-1
// polygons (public domain, nvkelso/natural-earth-vector) by
// docs/everdeep/scripts/bake-earth-admin1.mjs. TWO bytes per cell (Uint16
// little-endian — 330 units outgrow a byte): an index into ADMIN1_CODES,
// 0 = no province. Standard equirectangular, col 0 = lon -180, row 0 =
// lat +90 — the same convention as earthAdmin.ts. Lazy-imported: only an
// 'earth' world pulls this chunk.

export const EARTH_ADMIN1_W = ${W};
export const EARTH_ADMIN1_H = ${H};

/** Palette index -> ISO 3166-2 ("US-WA"). Index 0 means no province. */
export const ADMIN1_CODES: string[] = ${JSON.stringify(codes)};

/** The real state/province behind each code — what fantasySubrealm() renames. */
export const ADMIN1_META: Record<string, { name: string; country: string }> = ${JSON.stringify(meta)};

const GZ_B64 = '${b64}';

let _grid: Uint16Array | null = null;

/** Inflate the province raster, lazily and once. */
export async function earthAdmin1Grid(): Promise<Uint16Array> {
  if (_grid) return _grid;
  const raw = Uint8Array.from(atob(GZ_B64), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream('gzip');
  const buf = await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer();
  _grid = new Uint16Array(buf);
  return _grid;
}
`;
const dest = process.argv[3] || fileURLToPath(new URL('../../../v2/src/everdeep/earthAdmin1.ts', import.meta.url));
writeFileSync(dest, out);
console.log('wrote', dest, `(${(out.length / 1e3).toFixed(0)} KB source)`);
