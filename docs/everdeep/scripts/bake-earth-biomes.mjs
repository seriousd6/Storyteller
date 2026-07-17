#!/usr/bin/env node
// Bake the Earth land-cover grid (earthBiome.ts) from NASA's Blue Marble
// (three-globe's earth-blue-marble.jpg, MIT / NASA public domain, 4096x2048).
//
// REPLACES the batch-72 bake (whose script was never kept): that one classified
// a 1600x800 JPEG UP into 1024x512 cells, which scattered ice-class pixels
// through the hot deserts and could not carry the Nile's ~10mi fertile valley
// at all — the audit V10 complaint ("the fertile band sits ~20mi off the drawn
// river") was mostly the raster itself, not the biome warp (measured warp
// displacement along the course: +-1.4mi; raster cell: 24.4mi).
//
// This bake: classify per-pixel at the source's full 4096 first, THEN vote 2x2
// blocks down to 2048x1024 (12mi cells). A thin N-S feature like the Nile
// valley crosses both rows of a block, so >=2-of-4 vegetation votes keep it
// without fattening every boundary by a half cell.
//
//   node docs/everdeep/scripts/bake-earth-biomes.mjs <path-to-earth-blue-marble.jpg>
//
// One-shot like the other bakes: run by hand, commit the output, keep the
// source image out of the repo. Uses v2's sharp for the JPEG decode.

import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../v2/package.json', import.meta.url));
const sharp = require('sharp');

const src = process.argv[2];
if (!src) { console.error('usage: bake-earth-biomes.mjs <earth-blue-marble.jpg>'); process.exit(1); }

const OUT_W = 2048, OUT_H = 1024; // 12mi cells at the equator

const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
const SW = info.width, SH = info.height, CH = info.channels;
if (SW !== OUT_W * 2 || SH !== OUT_H * 2) { console.error(`expected ${OUT_W * 2}x${OUT_H * 2} source, got ${SW}x${SH}`); process.exit(1); }
console.log(`classifying ${SW}x${SH} -> voting down to ${OUT_W}x${OUT_H}`);

// Per-pixel classes, calibrated on the image itself:
//   water  [7,14,40] ocean, [0,2,5] Superior, [19,52,85] Red Sea  -> blue over red
//   ice    [248,252,253] Greenland                                 -> bright, unsaturated
//   desert [199,167,120] Sahara, [154,126,87] Gobi, [136,72,47] Outback
//   forest [32,45,15] Congo, [27,29,5] Japan (very dark, green-led)
//   grass  [52,52,26] Ukraine, [68,51,21] Kazakh, [88,72,39] the Nile valley
//          (JPEG smears the 1-2px cultivated strip into dark brown - same tone
//           as real steppe, so "mid-dark, not red-led" reads grass, correctly)
function classify(r, g, b) {
  if (Math.min(r, g, b) > 180) return 1;                 // ice
  if (b > r) return 0;                                    // water
  const bright = (r + g + b) / 3;
  if (r - g > 40) return 2;                               // red-led: sand/rock
  if (r - g > 22 && bright > 100) return 2;               // pale tan
  if (bright > 150 && r > g) return 2;                    // bright wash
  if (g > r + 5 || (g >= r && bright < 40)) return 4;     // green-led and dark: forest
  return 3;                                               // the rest: grass/steppe
}

const cls = new Uint8Array(SW * SH);
for (let i = 0; i < SW * SH; i++) {
  const o = i * CH;
  cls[i] = classify(data[o], data[o + 1], data[o + 2]);
}

// 2x2 vote. Vegetation (3/4) wins at >=2 votes so thin valleys survive; then
// water at >=2 (inland lakes must stay class 0 - terrain.ts floods them); then
// ice; else desert. Within vegetation, forest needs the majority of the
// vegetated votes.
const grid = new Uint8Array(OUT_W * OUT_H);
for (let row = 0; row < OUT_H; row++) {
  for (let col = 0; col < OUT_W; col++) {
    const c = [
      cls[(row * 2) * SW + col * 2], cls[(row * 2) * SW + col * 2 + 1],
      cls[(row * 2 + 1) * SW + col * 2], cls[(row * 2 + 1) * SW + col * 2 + 1],
    ];
    const n = [0, 0, 0, 0, 0];
    for (const k of c) n[k]++;
    let v;
    if (n[3] + n[4] >= 2) v = n[4] >= n[3] ? 4 : 3;
    else if (n[0] >= 2) v = 0;
    else if (n[1] >= 2) v = 1;
    else if (n[2] >= 1) v = 2;
    else v = c[0];
    grid[row * OUT_W + col] = v;
  }
}

// census (area-weighted by cos lat)
const names = ['water', 'ice', 'desert', 'grass', 'forest'];
const wsum = [0, 0, 0, 0, 0]; let tot = 0;
for (let row = 0; row < OUT_H; row++) {
  const w = Math.cos(((row + 0.5) / OUT_H * 180 - 90) * Math.PI / 180);
  for (let col = 0; col < OUT_W; col++) { wsum[grid[row * OUT_W + col]] += w; tot += w; }
}
console.log('census:', names.map((n, i) => `${n} ${(100 * wsum[i] / tot).toFixed(1)}%`).join('  '));

const gz = gzipSync(Buffer.from(grid), { level: 9 });
const b64 = gz.toString('base64');
console.log(`grid ${(grid.length / 1e6).toFixed(1)} MB -> gzip ${(gz.length / 1024).toFixed(0)} KB`);

const out = `// GENERATED — do not edit by hand. Real Earth land cover for the 'earth'
// landform: classified from NASA's Blue Marble (three-globe's
// earth-blue-marble.jpg, MIT / NASA public domain, 4096x2048) by
// docs/everdeep/scripts/bake-earth-biomes.mjs — per-pixel classes at 4096,
// voted 2x2 down to 2048x1024 (12mi cells) so thin features like the Nile's
// cultivated valley survive (audit V10). Equirectangular 2048x1024, north up,
// left = lon -180. Classes: 0 ocean/unknown, 1 ice, 2 desert, 3 grass,
// 4 forest. gzip+base64, inflated with DecompressionStream. Lazy.

export const BIOME_W = ${OUT_W};
export const BIOME_H = ${OUT_H};
const GZ_B64 = '${b64}';
let _grid: Uint8Array | null = null;
/** ${OUT_W}x${OUT_H} row-major land-cover class (0 ocean,1 ice,2 desert,3 grass,4 forest). */
export async function earthBiomeGrid(): Promise<Uint8Array> {
  if (_grid) return _grid;
  const bin = atob(GZ_B64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ds = new DecompressionStream('gzip');
  const w = ds.writable.getWriter(); void w.write(bytes); void w.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value as Uint8Array); }
  let len = 0; for (const c of chunks) len += c.length;
  const g = new Uint8Array(len); let o = 0; for (const c of chunks) { g.set(c, o); o += c.length; }
  _grid = g; return g;
}
`;
const dest = process.argv[3] || fileURLToPath(new URL('../../../v2/src/everdeep/earthBiome.ts', import.meta.url));
writeFileSync(dest, out);
console.log('wrote', dest, `(${(out.length / 1024).toFixed(0)} KB source)`);
