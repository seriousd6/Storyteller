#!/usr/bin/env node
// Bake a high-resolution land/sea mask from Natural Earth 10m land polygons
// (public domain; nvkelso/natural-earth-vector). The 2048x1024 elevation grid
// (~19 km/cell) dissolves narrow coastlines — Florida, the Keys, capes, small
// isles — because "mangles Florida" is a COASTLINE problem, not an elevation
// one. This bakes a crisp 1-bit land mask at ~3.7 km/cell that terrain.ts uses
// to decide land-vs-sea, keeping the elevation grid for relief underneath.
//
//   node docs/everdeep/scripts/bake-earth-coast.mjs <path-to-ne_10m_land.geojson>
//
// Standard equirectangular: col 0 = lon -180 (west), increasing east; row 0 =
// lat +90 (north), increasing south. terrain.ts maps world (x,y) -> (lon,lat)
// -> these indices, independent of the elevation grid's internal orientation.

import { readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const src = process.argv[2];
if (!src) { console.error('usage: bake-earth-coast.mjs <ne_10m_land.geojson>'); process.exit(1); }

const W = 10800, H = 5400; // ~3.7 km/cell at the equator
console.log(`rasterizing ${src} -> ${W}x${H} land mask`);

const geo = JSON.parse(readFileSync(src, 'utf8'));
const polys = [];
for (const ft of geo.features) {
  const g = ft.geometry;
  if (g.type === 'Polygon') polys.push(g.coordinates);
  else if (g.type === 'MultiPolygon') for (const p of g.coordinates) polys.push(p);
}
console.log(`${polys.length} polygons`);

// lon/lat -> fractional pixel. Standard: x east from -180, y south from +90.
const px = (lon) => (lon + 180) / 360 * W;
const py = (lat) => (90 - lat) / 180 * H;

const mask = new Uint8Array(W * H); // 1 = land

// Per-polygon scanline fill (even-odd across the polygon's rings, so holes —
// inland seas the NE data cuts out — read as water). Only rows in the polygon's
// bbox are scanned, so the big continents cost their area and no more.
for (const poly of polys) {
  // pixel-space edges + bbox
  const edges = []; // [x0,y0,x1,y1]
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
    const yc = row + 0.5; // scan at the pixel centre
    const xs = [];
    for (const [ax, ay, bx, by] of edges) {
      // does the half-open edge span this scanline?
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
      for (let c = cx0; c <= cx1; c++) mask[base + c] = 1;
    }
  }
}

// area-weighted land fraction (cos-lat) as a sanity check (~29% for Earth)
let landW = 0, totW = 0;
for (let row = 0; row < H; row++) {
  const w = Math.cos(((row + 0.5) / H * 180 - 90) * Math.PI / 180);
  const base = row * W;
  for (let c = 0; c < W; c++) { totW += w; if (mask[base + c]) landW += w; }
}
console.log(`land fraction ${(landW / totW * 100).toFixed(1)}% (Earth ~29%)`);

// bit-pack (1 bit/px) then gzip
const packed = new Uint8Array(Math.ceil(W * H / 8));
for (let i = 0; i < W * H; i++) if (mask[i]) packed[i >> 3] |= 1 << (i & 7);
const gz = gzipSync(Buffer.from(packed), { level: 9 });
console.log(`packed ${(packed.length / 1e6).toFixed(1)} MB -> gzip ${(gz.length / 1e6).toFixed(2)} MB`);

const b64 = gz.toString('base64');
const out = `// GENERATED — do not edit by hand. High-resolution Earth land/sea mask baked
// from Natural Earth 10m land polygons (public domain, nvkelso/natural-earth-
// vector) by docs/everdeep/scripts/bake-earth-coast.mjs. 1 bit per cell, packed
// then gzip+base64. Standard equirectangular: col 0 = lon -180, row 0 = lat +90.
// Lazy-imported: only an 'earth' world pulls this chunk. Fixes the coastline of
// Florida, the Keys, capes, and small isles that the 2048 elevation grid ate.

export const EARTH_COAST_W = ${W};
export const EARTH_COAST_H = ${H};

const GZ_B64 = '${b64}';

/** Inflate the packed 1-bit mask to a Uint8Array of bits (0/1), lazily. */
export async function earthCoastMask(): Promise<Uint8Array> {
  const raw = Uint8Array.from(atob(GZ_B64), (c) => c.charCodeAt(0));
  const ds = new DecompressionStream('gzip');
  const buf = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
  const bits = new Uint8Array(EARTH_COAST_W * EARTH_COAST_H);
  for (let i = 0; i < bits.length; i++) bits[i] = (buf[i >> 3] >> (i & 7)) & 1;
  return bits;
}
`;
const dest = process.argv[3] || new URL('../../v2/src/everdeep/earthCoast.ts', import.meta.url).pathname;
writeFileSync(dest, out);
console.log('wrote', dest, `(${(out.length / 1e6).toFixed(1)} MB source)`);
