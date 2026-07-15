// Everdeep terrain (G1) — the genVersion 1 field. FROZEN once map M1 ships:
// changing constants here redraws every world's unwritten terrain.
//
// Owner decisions baked in (PLAN §6.1, MAPS §3.1b):
// - X-PERIODIC: noise is sampled on a cylinder (angle from x / circumference,
//   3D value noise), so east–west wrap is seamless and a globe render is a
//   projection change, not a data change.
// - USER-LED LANDFORMS (Civ-style): a continent-mask term shapes elevation —
//   pangea / single continent / N continents / archipelago / scattered isles,
//   with water % and climate as creation-time dials.
// - Bounded Earth-size default; y spans ±heightFt/2 with polar cold at the
//   ends.

import { h32 } from './seeds.ts';

export type Landform = 'pangea' | 'continent' | 'continents' | 'archipelago' | 'isles' | 'earth';

export interface TerrainCfg {
  seed: string;          // world seed (root of the lineage)
  circumFt: number;      // east–west circumference (x wraps at this)
  heightFt: number;      // north–south extent (poles at ±heightFt/2)
  landform: Landform;
  continents?: number;   // for landform 'continents' (2–5)
  waterPct: number;      // 0–100 dial
  climate: 'temperate' | 'hot' | 'cold';
  // genVersion-2 opt-in (batch 54, GEOGRAPHY.md): 'earthlike' drives moisture
  // and temperature from real geography — latitude rain bands (Hadley cells),
  // rain shadows, dry continental interiors — instead of pure noise. Absent /
  // 'noise' is the frozen genVersion-1 field, so existing worlds never move.
  climateModel?: 'noise' | 'earthlike';
}

export const EARTH_CIRCUM_FT = 132_000_000; // ~25,000 miles
export const EARTH_HEIGHT_FT = 66_000_000;  // pole-to-pole half circumference

export const BIOME_IDS = [
  'deep', 'water', 'beach', 'snow', 'tundra', 'taiga', 'desert', 'savanna',
  'grass', 'forest', 'jungle', 'hills', 'mountain',
] as const;
export type BiomeId = (typeof BIOME_IDS)[number];

// ---------- periodic 3D value noise ----------
function hash3(ix: number, iy: number, iz: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 1103515245) + Math.imul(seed, 974634721)) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967295;
}
const sm = (t: number): number => t * t * (3 - 2 * t);
function vnoise3(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz);
  let v = 0;
  for (let dz = 0; dz <= 1; dz++) {
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const w = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy) * (dz ? fz : 1 - fz);
        v += w * hash3(ix + dx, iy + dy, iz + dz, seed);
      }
    }
  }
  return v;
}
// CROSS-TIER CONSISTENCY (owner, batch 12): normalize by the INFINITE-series
// amplitude, never the running total — so adding octaves at finer zooms only
// ADDS small high-frequency detail (±0.55^n) and can never re-scale the whole
// field. A world hex that reads deep water stays water at every zoom; only
// the coastal band refines. (The old per-oct normalization made different
// tiers disagree about where the sea was.)
const FBM_NORM = 0.5 / (1 - 0.55);
function fbm3(x: number, y: number, z: number, seed: number, oct: number): number {
  let val = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    val += amp * vnoise3(x * f, y * f, z * f, seed + i * 101);
    amp *= 0.55;
    f *= 2;
  }
  return val / FBM_NORM;
}

// Map plane (x, y) onto the noise cylinder: x → angle, radius from
// circumference so distances are preserved at the equator.
const WAVELENGTH = 9_000_000; // ft — base feature size at Earth scale
function cyl(cfg: TerrainCfg, x: number, y: number): [number, number, number] {
  const r = cfg.circumFt / (2 * Math.PI);
  const th = (x / cfg.circumFt) * 2 * Math.PI;
  return [(Math.cos(th) * r) / WAVELENGTH, y / WAVELENGTH, (Math.sin(th) * r) / WAVELENGTH];
}

const seedNum = (cfg: TerrainCfg, salt: number): number => h32(cfg.seed, salt);

/** Domain-warped periodic fbm — boundaries meander at every scale. */
function field(cfg: TerrainCfg, x: number, y: number, oct: number, salt: number): number {
  const [px, py, pz] = cyl(cfg, x, y);
  const wo = Math.min(oct, 6);
  const wx = fbm3(px + 7.3, py - 2.1, pz + 4.4, seedNum(cfg, 55 + salt), wo) - 0.5;
  const wy = fbm3(px - 4.7, py + 9.9, pz - 1.2, seedNum(cfg, 77 + salt), wo) - 0.5;
  const wz = fbm3(px + 2.9, py + 5.5, pz + 8.1, seedNum(cfg, 99 + salt), wo) - 0.5;
  const k = 0.55;
  return fbm3(px + wx * k, py + wy * k, pz + wz * k, seedNum(cfg, salt), oct);
}

// ---------- landform masks (periodic in x) ----------
// Landmasses must NOT read as circles (owner, 2026-07-13): every blob is a
// rotated, stretched ellipse, and the mask field is domain-warped at
// continental scale, so silhouettes and coastlines meander.
interface Blob { x: number; y: number; r: number; amp: number; cosA: number; sinA: number; stretch: number }
const maskCache = new Map<string, Blob[]>();
function blobs(cfg: TerrainCfg): Blob[] {
  const earth = cfg.climateModel === 'earthlike';
  const key = `${cfg.seed}|${cfg.landform}|${cfg.continents ?? 0}|${cfg.circumFt}|${cfg.heightFt}|${earth ? 'e' : 'n'}`;
  let bs = maskCache.get(key);
  if (bs) return bs;
  bs = [];
  const rnd = (i: number, s: number) => hash3(i, s, 0, seedNum(cfg, 1234));
  const spec: Partial<Record<Landform, { n: number; r: number; amp: number }>> = {
    pangea: { n: 1, r: 0.47, amp: 1.0 },
    continent: { n: 1, r: 0.28, amp: 1.0 },
    continents: { n: Math.min(5, Math.max(2, cfg.continents ?? 3)), r: 0.27, amp: 1.0 },
    archipelago: { n: 12, r: 0.085, amp: 0.95 },
    isles: { n: 26, r: 0.05, amp: 0.95 },
  };
  const { n, r, amp } = spec[cfg.landform] ?? spec.continents!; // 'earth' never reaches here
  const span = Math.min(cfg.circumFt, cfg.heightFt);
  for (let i = 0; i < n; i++) {
    // continents space evenly around the cylinder with jitter; small forms scatter.
    // EARTHLIKE (batch 60, GEOGRAPHY G-2): the land CLUSTERS into one hemisphere
    // — a ~55% longitude band — leaving the rest a great open ocean (a Pacific),
    // the way Earth's land and water hemispheres divide.
    const xFrac = n <= 5
      ? (earth ? 0.1 + ((i + 0.5) / n) * 0.55 + (rnd(i, 1) - 0.5) * (0.4 / n)
               : (i + 0.5) / n + (rnd(i, 1) - 0.5) * (0.6 / n))
      : (earth ? 0.08 + rnd(i, 1) * 0.6 : rnd(i, 1));
    // earthlike continents taper toward the poles — they sit in the temperate
    // and tropical mid-latitudes, not astride the caps
    const yFrac = (rnd(i, 2) - 0.5) * (n <= 5 ? (earth ? 0.42 : 0.5) : 0.8);
    const angle = rnd(i, 4) * Math.PI;
    // stretch one axis, shrink the other — area holds, the circle doesn't
    const stretch = Math.sqrt(1.15 + rnd(i, 5) * 1.25);
    bs.push({
      x: xFrac * cfg.circumFt,
      y: yFrac * cfg.heightFt,
      r: r * span * (0.75 + rnd(i, 3) * 0.5),
      amp,
      cosA: Math.cos(angle),
      sinA: Math.sin(angle),
      stretch,
    });
  }
  maskCache.set(key, bs);
  return bs;
}
function landMask(cfg: TerrainCfg, x: number, y: number): number {
  if (cfg.landform === 'earth') return earthMaskAt(cfg, x, y);
  // continental-scale domain warp: sample the mask somewhere ELSE nearby,
  // and how-far-else meanders — arcs and straight edges both dissolve.
  // Periodic in x because the warp noise rides the same cylinder.
  const span = Math.min(cfg.circumFt, cfg.heightFt);
  const [px, py, pz] = cyl(cfg, x, y);
  const wf = 0.42, wAmp = span * 0.14;
  const qx = x + (fbm3(px * wf + 3.7, py * wf, pz * wf, seedNum(cfg, 881), 4) - 0.5) * 2 * wAmp;
  const qy = y + (fbm3(px * wf - 5.1, py * wf + 8.2, pz * wf, seedNum(cfg, 882), 4) - 0.5) * 2 * wAmp;
  let m = 0;
  for (const b of blobs(cfg)) {
    let dx = (qx - b.x) % cfg.circumFt; // signed periodic offset (rotation needs the sign)
    if (dx > cfg.circumFt / 2) dx -= cfg.circumFt;
    if (dx < -cfg.circumFt / 2) dx += cfg.circumFt;
    const dy = qy - b.y;
    const u = (dx * b.cosA + dy * b.sinA) * b.stretch;
    const v = (dy * b.cosA - dx * b.sinA) / b.stretch;
    const d = Math.hypot(u, v) / b.r;
    if (d < 1.6) m += b.amp * Math.max(0, 1 - d * d * 0.55);
  }
  return Math.min(1, m);
}

// ---------- real Earth landform (batch 66) ----------
// The 'earth' landform samples a baked equirectangular elevation grid (real
// Earth) instead of the procedural blobs, so the map IS Earth — recognizable
// continents, real mountain ranges. It's lazy: the ~170KB grid module loads
// only when an earth world renders. Callers must `await ensureEarthGrid()`
// before the first synchronous elevationAt/biomeAt; until then earth reads as
// open ocean (so nothing throws mid-load).
let earthGridData: Uint8Array | null = null;
let earthW = 0, earthH = 0;
export function earthLoaded(): boolean { return earthGridData !== null; }
export async function ensureEarthGrid(): Promise<void> {
  if (earthGridData) return;
  const m = await import('./earthData.ts');
  earthGridData = m.earthGrid();
  earthW = m.EARTH_W;
  earthH = m.EARTH_H;
}

// No seed (blank / "earth") ⇒ canonical Earth, untouched. Any other seed drifts
// it slightly (continental drift + a sea-level jitter) — "shift Earth by slight
// margins."
function earthCanonicalSeed(cfg: TerrainCfg): boolean {
  const s = (cfg.seed ?? '').trim().toLowerCase();
  return s === '' || s === 'earth';
}
// Continental drift: a low-frequency domain warp of where we read the grid, so
// coastlines bend and continents shuffle a touch. 0 for canonical Earth.
function earthDrift(cfg: TerrainCfg): number {
  if (earthCanonicalSeed(cfg)) return 0;
  const span = Math.min(cfg.circumFt, cfg.heightFt);
  return span * (0.01 + (h32(cfg.seed, 4310) / 4294967296) * 0.03); // 1%–4% of span
}
// Sea level: the water slider is the deliberate dial (50 = today's Earth; higher
// floods the coasts, lower drops the seas and exposes the shelves); a non-blank
// seed adds a small jitter on top. Returned in my elevation units.
function earthSeaLevel(cfg: TerrainCfg): number {
  const slider = (cfg.waterPct - 50) * 0.004;
  const jitter = earthCanonicalSeed(cfg) ? 0 : (h32(cfg.seed, 4300) / 4294967296 - 0.5) * 0.03;
  return slider + jitter;
}
// Bilinear grayscale (0..255) from the baked grid, periodic in longitude, with
// the drift warp applied. North is up; the left edge is the mid-Pacific.
function earthLumAt(cfg: TerrainCfg, x: number, y: number): number {
  const g = earthGridData;
  if (!g) return 0; // grid not loaded yet → ocean
  const W = earthW, H = earthH;
  let sx = x, sy = y;
  const d = earthDrift(cfg);
  if (d > 0) {
    const [px, py, pz] = cyl(cfg, x, y);
    sx += (fbm3(px * 0.5 + 1.3, py * 0.5, pz * 0.5, seedNum(cfg, 4201), 3) - 0.5) * 2 * d;
    sy += (fbm3(px * 0.5 - 2.7, py * 0.5 + 4.1, pz * 0.5, seedNum(cfg, 4202), 3) - 0.5) * 2 * d;
  }
  let u = (sx % cfg.circumFt) / cfg.circumFt; if (u < 0) u += 1;
  const latFrac = Math.max(-1, Math.min(1, sy / (cfg.heightFt / 2)));
  const fx = u * W - 0.5;
  // The map paints larger world-y LOWER on screen, so map +y to the SOUTH of the
  // grid (image bottom) — that puts north at the top of the screen (batch 68).
  // Earth's climate is latitude-symmetric, so this only sets which way is up.
  const fy = (0.5 + latFrac / 2) * (H - 1);
  const x0 = Math.floor(fx), y0 = Math.max(0, Math.min(H - 1, Math.floor(fy)));
  const y1 = Math.min(H - 1, y0 + 1);
  const tx = fx - x0, ty = fy - Math.floor(fy);
  const wrap = (i: number) => ((i % W) + W) % W;
  const a = g[y0 * W + wrap(x0)], b = g[y0 * W + wrap(x0 + 1)];
  const c = g[y1 * W + wrap(x0)], e = g[y1 * W + wrap(x0 + 1)];
  const top = a + (b - a) * tx, bot = c + (e - c) * tx;
  return top + (bot - top) * Math.max(0, Math.min(1, ty));
}
// Land/sea elevation from the grid (ocean flat), sea-level applied. This is the
// coastline the coast field floods from — it must NOT call coastDistAt (which
// would recurse), so ocean here is a flat baseline; shelves are added afterward.
function earthLandSea(cfg: TerrainCfg, x: number, y: number): number {
  const lum = earthLumAt(cfg, x, y);
  const sea = earthSeaLevel(cfg);
  if (lum <= 0.5) return 0.40 - sea; // ocean
  const s = lum / 255;
  return 0.5 + Math.pow(s, 0.6) * 0.42 - sea; // land ramp (gamma lifts the plains)
}
// Full earth elevation: land as above; ocean given a continental SHELF (shallow
// near the coast, deep offshore) from the distance-to-coast field.
function earthSampleRaw(cfg: TerrainCfg, x: number, y: number): number {
  const e = earthLandSea(cfg, x, y);
  if (e >= 0.5) return e;
  // OCEAN BATHYMETRY (batch 68). The baked grid has no soundings (ocean = flat 0),
  // so model a physically-shaped sea floor from distance-to-coast: a shallow
  // continental SHELF near the shore, a steeper continental SLOPE, then the deep
  // ABYSSAL plain, with low-frequency undulation (mid-ocean ridges and rises) out
  // in the deep. Sea level applies throughout, so lowering it exposes the shelf
  // (ice-age land bridges) and raising it drowns the coasts.
  const span = Math.min(cfg.circumFt, cfg.heightFt);
  const off = Math.max(0, -coastDistAt(cfg, x, y)); // feet offshore
  const Wsh = span * 0.015, Wsl = span * 0.045;
  let z: number;
  if (off < Wsh) z = 0.49 - (off / Wsh) * 0.03;                 // shelf  0.49 → 0.46
  else if (off < Wsl) z = 0.46 - ((off - Wsh) / (Wsl - Wsh)) * 0.09; // slope 0.46 → 0.37
  else z = 0.355;                                                // abyssal base
  // ridges/rises only out in the deep, tapered so they never breach the shelf
  const deep = Math.max(0, Math.min(1, (off - Wsl) / (span * 0.05)));
  z += (field(cfg, x, y, 5, 640) - 0.5) * 0.05 * deep;
  return z - earthSeaLevel(cfg);
}
// Smooth land membership for earth (drives the earthlike shelf + climate mask).
function earthMaskAt(cfg: TerrainCfg, x: number, y: number): number {
  return Math.max(0, Math.min(1, (earthSampleRaw(cfg, x, y) - 0.44) / 0.12));
}
// Public elevation for earth: real relief + a little procedural texture on land
// so a deep zoom isn't flat grid cells (tapered to nothing at the shoreline).
function earthElevAt(cfg: TerrainCfg, x: number, y: number, oct: number): number {
  const e = earthSampleRaw(cfg, x, y);
  if (e < 0.5) return e;
  const taper = Math.max(0, Math.min(1, (e - 0.5) / 0.06));
  return e + (field(cfg, x, y, Math.min(oct, 8), 0) - 0.5) * 0.05 * taper;
}

// ---------- distance-to-coast field (GEOGRAPHY G-3, batch 65) ----------
// A cheap, cached BFS flood from the shoreline over a coarse world grid, so any
// point can ask "how far am I from the sea?" in O(1). The genVersion-1 field
// never reads it; it's the primitive earthlike orogeny leans on to put mountain
// ranges at continental MARGINS (subduction coasts — the Andes, the Cascades)
// rather than a free-floating belt (the mask-value proxy of batch 60 was too
// coarse and either did nothing or over-mountained the interior).
//
// The coastline is defined by the LANDMASS elevation WITHOUT the orogeny term
// (`landBaseElev` below) — that breaks the circularity, since orogeny is the
// consumer of this field. Mountains rising at a margin don't move the coast.
function landBaseElev(cfg: TerrainCfg, x: number, y: number, oct: number): number {
  if (cfg.landform === 'earth') return earthLandSea(cfg, x, y); // real coastline
  const base = field(cfg, x, y, oct, 0);
  const landG = Math.min(1, landMask(cfg, x, y) * 1.9);
  return 0.155 + base * 0.30 + landG * 0.30 - (cfg.waterPct - 50) * 0.0035;
}

interface CoastField { Nx: number; Ny: number; cellW: number; cellH: number; signed: Float32Array }
const coastCache = new Map<string, CoastField>();
function coastField(cfg: TerrainCfg): CoastField {
  // earthlike and noise worlds cluster their continents differently (blobs()),
  // so the coastline — and thus this field — depends on the climate model too.
  const earth = cfg.climateModel === 'earthlike';
  const key = `${cfg.seed}|${cfg.landform}|${cfg.continents ?? 0}|${cfg.circumFt}|${cfg.heightFt}|${cfg.waterPct}|${earth ? 'e' : 'n'}`;
  const cached = coastCache.get(key);
  if (cached) return cached;
  // ~69mi cells at Earth scale: fine enough to resolve a ~750mi margin band into
  // ~11 rings, coarse enough to build in ~250ms once and cache for the session.
  const Nx = 360, Ny = 180;
  const cellW = cfg.circumFt / Nx, cellH = cfg.heightFt / Ny;
  const oct = 5; // the landmass coastline is a low-frequency thing
  const land = new Uint8Array(Nx * Ny);
  for (let j = 0; j < Ny; j++) {
    const y = -cfg.heightFt / 2 + (j + 0.5) * cellH;
    for (let i = 0; i < Nx; i++) {
      const x = (i + 0.5) * cellW;
      land[j * Nx + i] = landBaseElev(cfg, x, y, oct) >= 0.5 ? 1 : 0;
    }
  }
  const at = (i: number, j: number) => j * Nx + ((i % Nx) + Nx) % Nx; // periodic in x
  // multi-source BFS: seeds are coastline cells (touch the opposite type). Ring
  // distance in cells, 8-neighbourhood (≈ Chebyshev), converted to feet.
  const dist = new Int32Array(Nx * Ny).fill(-1);
  let head = 0;
  const q = new Int32Array(Nx * Ny);
  const NB: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (let j = 0; j < Ny; j++) {
    for (let i = 0; i < Nx; i++) {
      const c = land[at(i, j)];
      let coast = false;
      for (const [di, dj] of NB) {
        const nj = j + dj;
        if (nj < 0 || nj >= Ny) continue;
        if (land[at(i + di, nj)] !== c) { coast = true; break; }
      }
      if (coast) { const k = at(i, j); dist[k] = 0; q[head++] = k; }
    }
  }
  for (let tail = 0; tail < head; tail++) {
    const k = q[tail];
    const i = k % Nx, j = (k - i) / Nx, d = dist[k];
    for (const [di, dj] of NB) {
      const nj = j + dj;
      if (nj < 0 || nj >= Ny) continue;
      const nk = at(i + di, nj);
      if (dist[nk] === -1) { dist[nk] = d + 1; q[head++] = nk; }
    }
  }
  const cellFt = (cellW + cellH) / 2;
  const signed = new Float32Array(Nx * Ny);
  for (let k = 0; k < Nx * Ny; k++) signed[k] = dist[k] * cellFt * (land[k] ? 1 : -1);
  const cf: CoastField = { Nx, Ny, cellW, cellH, signed };
  coastCache.set(key, cf);
  return cf;
}

/**
 * Signed distance from the nearest coast, in feet: POSITIVE on land (how far
 * inland), NEGATIVE at sea (how far offshore), ~0 at the shoreline. Bilinear on
 * the coarse grid, periodic in x. Cached per world — cheap after the first call.
 */
export function coastDistAt(cfg: TerrainCfg, x: number, y: number): number {
  const cf = coastField(cfg);
  let xi = x % cfg.circumFt; if (xi < 0) xi += cfg.circumFt;
  const fi = xi / cf.cellW - 0.5;
  const fj = (y + cfg.heightFt / 2) / cf.cellH - 0.5;
  const i0 = Math.floor(fi), j0 = Math.max(0, Math.min(cf.Ny - 1, Math.floor(fj)));
  const j1 = Math.min(cf.Ny - 1, j0 + 1);
  const tx = fi - i0, ty = fj - Math.floor(fj);
  const wrap = (i: number) => ((i % cf.Nx) + cf.Nx) % cf.Nx;
  const s = cf.signed, Nx = cf.Nx;
  const a = s[j0 * Nx + wrap(i0)], b = s[j0 * Nx + wrap(i0 + 1)];
  const c = s[j1 * Nx + wrap(i0)], d = s[j1 * Nx + wrap(i0 + 1)];
  const top = a + (b - a) * tx, bot = c + (d - c) * tx;
  return top + (bot - top) * Math.max(0, Math.min(1, ty));
}

// Test seam: toggle the G-3 margin tilt without changing the landmass, so a
// probe can A/B plate-edge orogeny on an identical earthlike world. Ships true.
let g3Enabled = true;
export function __setG3(on: boolean): void { g3Enabled = on; }

// ---------- the public field ----------
export function octFor(hexFt: number): number {
  return Math.max(4, Math.min(11, Math.ceil(Math.log2(WAVELENGTH / hexFt)) + 1));
}

export function elevationAt(cfg: TerrainCfg, x: number, y: number, oct: number): number {
  if (cfg.landform === 'earth') return earthElevAt(cfg, x, y, oct); // real Earth relief
  const base = field(cfg, x, y, oct, 0);
  const mask = landMask(cfg, x, y);
  // Real-geography variance (owner, 2026-07-13): the landform mask decides
  // WHERE land is, but plateaus quickly — interiors are NOT automatically
  // high, so continents aren't all mountains-in-the-middle. Mountains come
  // from an independent OROGENY term: ridged noise (crest lines) gated by a
  // low-frequency belt field, giving discrete chains that can run along
  // coasts, across interiors, or not at all — plains, basins, and varied
  // biomes fill the rest.
  const landG = Math.min(1, mask * 1.9);
  const ridgeRaw = field(cfg, x, y, Math.min(oct, 7), 777);
  const ridge = Math.max(0, 1 - Math.abs(ridgeRaw - 0.5) * 4); // sharp crests
  let belt = field(cfg, x, y, Math.min(oct, 4), 555);          // where ranges may rise
  // GEOGRAPHY G-3 (batch 65): earthlike ranges lean toward continental MARGINS.
  // Now that a real distance-to-coast field exists, tilt the belt threshold —
  // LIFT it in the coastal band (so a belt that was almost-a-range becomes one
  // near the sea: subduction cordilleras like the Andes/Cascades) and LOWER it
  // deep inland (so the interior needs a genuinely high belt to rise). It only
  // nudges the existing belt across its threshold, so coasts where the belt is
  // low stay flat — no mountain ring, just margins that happen to be active.
  if (cfg.climateModel === 'earthlike' && g3Enabled) {
    const cd = coastDistAt(cfg, x, y); // signed feet; >0 inland
    const span = Math.min(cfg.circumFt, cfg.heightFt);
    if (cd > 0) {
      const margin = Math.max(0, 1 - cd / (span * 0.06));   // 1 at the coast → 0 by ~6% span inland
      const interior = Math.min(1, cd / (span * 0.22));     // 0 near coast → 1 deep inland
      // LIFT the coastal band strongly (reliably raise active margins into
      // cordilleras) and only GENTLY relax the deep interior — collision ranges
      // (Himalaya, Rockies) still belong there, so G-3 adds margins more than it
      // subtracts interior.
      belt += margin * 0.15 - interior * 0.025;
    }
  }
  const oro = ridge * Math.max(0, (belt - 0.45) * 2.4) * landG;
  return 0.155 + base * 0.30 + landG * 0.30 + oro * 0.26 - (cfg.waterPct - 50) * 0.0035;
}

// ---------- Earth-like climate (genVersion-2 opt-in, batch 54, GEOGRAPHY.md) ----------
// Real weather is geography, not noise. How deep inland a point sits (the ocean
// moderates coasts; interiors are dry and extreme).
// earth reads "how far inland" from the real coastline (the distance-to-coast
// field), which is truer than a mask ramp and gives real continental interiors
// (Siberia, the Gobi, the Sahara's deep-desert heart).
function interiorness(cfg: TerrainCfg, x: number, y: number, mask?: number): number {
  if (cfg.landform === 'earth') {
    const cd = coastDistAt(cfg, x, y);
    return Math.max(0, Math.min(1, cd / (Math.min(cfg.circumFt, cfg.heightFt) * 0.12)));
  }
  return Math.max(0, Math.min(1, ((mask ?? landMask(cfg, x, y)) - 0.55) / 0.45));
}
// earth implies the earthlike climate model (real latitudes → real rain bands).
function isEarthlike(cfg: TerrainCfg): boolean {
  return cfg.climateModel === 'earthlike' || cfg.landform === 'earth';
}
// Hadley-cell rain bands: wet ITCZ at the equator, dry subtropics near ±30°,
// wet temperate belt near ±60°, dry poles.
function latitudeMoisture(cfg: TerrainCfg, y: number): number {
  const latDeg = Math.min(1, Math.abs(y) / (cfg.heightFt / 2)) * 90;
  return 0.5 + 0.25 * Math.cos((latDeg * Math.PI) / 30);
}
// eHere / mask are the elevation and land-mask already computed by the caller
// (biomeAt) — passed in to save recomputing them (perf review #1, behaviour is
// identical to computing them here).
function earthMoisture(cfg: TerrainCfg, x: number, y: number, oct: number, eHere: number, mask: number): number {
  const lat = Math.min(1, Math.abs(y) / (cfg.heightFt / 2));
  // prevailing wind: easterly trades in the tropics, westerlies at temperate lat
  const windX = lat < 0.4 ? -1 : 1;
  const span = Math.min(cfg.circumFt, cfg.heightFt);
  const D = span * 0.02;
  // rain shadow: a range UPWIND wrings out the rain, drying the lee behind it
  let barrier = eHere, upwind1 = eHere;
  for (let s = 1; s <= 3; s++) { const es = elevationAt(cfg, x - windX * D * s, y, oct); if (s === 1) upwind1 = es; barrier = Math.max(barrier, es); }
  const rainShadow = Math.max(0, barrier - eHere) * 1.4;
  const dryInterior = interiorness(cfg, x, y, mask) * 0.22;
  // COAST ASYMMETRY (batch 64, GEOGRAPHY G-4): an ONSHORE prevailing wind carries
  // marine moisture inland, so the WINDWARD coast is wet and the leeward coast
  // dry — westerly temperate belts soak their WEST coasts (Pacific NW, western
  // Europe), the tropics their EAST coasts (the trade-wind rainforests). If the
  // ground just upwind is open sea, this coast drinks the ocean's air.
  const marine = upwind1 < 0.5 ? 0.16 : 0;
  const noise = (field(cfg, x, y, oct, 999) - 0.5) * 0.34; // local texture on top of the geography
  return Math.max(0, Math.min(1, latitudeMoisture(cfg, y) - rainShadow - dryInterior + marine + noise));
}
function moistureAt(cfg: TerrainCfg, x: number, y: number, oct: number, eRaw: number, mask: number): number {
  if (isEarthlike(cfg)) return earthMoisture(cfg, x, y, oct, eRaw, mask);
  return field(cfg, x, y, oct, 999);
}

function temperatureAt(cfg: TerrainCfg, x: number, y: number, e: number, mask: number): number {
  const lat = Math.min(1, Math.abs(y) / (cfg.heightFt / 2));
  const climate = cfg.climate === 'hot' ? 0.14 : cfg.climate === 'cold' ? -0.14 : 0;
  // earthlike drops a touch faster with latitude so the boreal/taiga belt lands
  // near 55–65° and the tundra at the caps, the way Earth's biomes band
  const latK = isEarthlike(cfg) ? 0.98 : 0.85;
  let t = 1 - lat * latK - Math.max(0, e - 0.62) * 1.6 + climate;
  // continental interiors run colder toward the poles (Siberia, the Gobi)
  if (isEarthlike(cfg)) t -= interiorness(cfg, x, y, mask) * lat * 0.14;
  return t;
}

export function biomeAt(cfg: TerrainCfg, x: number, y: number, oct: number, eBias = 0): BiomeId {
  // elevation and (earthlike-only) land-mask computed ONCE and threaded into the
  // climate functions — the earthlike path used to recompute both several times
  // (perf review #1); values are unchanged.
  const earth = isEarthlike(cfg);
  const eRaw = elevationAt(cfg, x, y, oct);
  const mask = earth ? landMask(cfg, x, y) : 0;
  const e = eRaw + eBias;
  if (e < 0.46) {
    // continental shelf (batch 60, GEOGRAPHY G-2): the sea floor near land stays
    // shallow — a band of shelf water rings a coast before the deep ocean drop
    if (earth && mask > 0.1) return 'water';
    return 'deep';
  }
  if (e < 0.5) return 'water';
  if (e < 0.506) return 'beach';
  const t = temperatureAt(cfg, x, y, e, mask);
  const m = moistureAt(cfg, x, y, oct, eRaw, mask);
  // polar ice caps read as snow, not as a mountain range — the e>0.76 check
  // below would otherwise turn Antarctica/Greenland's high ice into "mountain".
  // Earth-only so the frozen genVersion-1 field is untouched.
  if (cfg.landform === 'earth' && t < 0.12) return 'snow';
  if (e > 0.76) return 'mountain';
  if (e > 0.71) return 'hills';
  if (t < 0.18) return 'snow';
  if (t < 0.3) return m > 0.5 ? 'taiga' : 'tundra';
  if (m < 0.34) return t > 0.62 ? 'desert' : 'savanna';
  if (m < 0.55) return 'grass';
  return t > 0.66 ? 'jungle' : 'forest';
}

/**
 * Precipitation-driven runoff weight for hydrology (batch 68). For an earthlike
 * or real-Earth world this reads the REAL moisture field — Hadley rain bands,
 * rain shadows, coast asymmetry — and zeroes out frozen ground (ice caps make
 * glaciers, not rivers), so river discharge tracks where rain actually falls.
 * Noise worlds return 1 (their hydrology uses its own per-biome table instead).
 */
/** Normalized temperature at a point (latitude + altitude + continentality),
 * ~1 at the hot equator down through 0 at the frozen caps. Public so the
 * settlement generator can keep towns off the ice (batch 69). */
export function temperatureNorm(cfg: TerrainCfg, x: number, y: number, oct: number): number {
  const e = elevationAt(cfg, x, y, oct);
  const mask = landMask(cfg, x, y);
  return temperatureAt(cfg, x, y, e, mask);
}

export function runoffAt(cfg: TerrainCfg, x: number, y: number, oct: number): number {
  if (!isEarthlike(cfg)) return 1;
  const eRaw = elevationAt(cfg, x, y, oct);
  const mask = landMask(cfg, x, y);
  const m = moistureAt(cfg, x, y, oct, eRaw, mask);          // 0..1, real precipitation
  const t = temperatureAt(cfg, x, y, eRaw, mask);
  const warm = Math.max(0, Math.min(1, (t - 0.02) / 0.16));  // frozen (t≲0.02) → 0
  return Math.max(0, m) * warm;
}

/** Per-hex render detail (relief + threshold bias), periodic like the rest. */
export function detailAt(cfg: TerrainCfg, x: number, y: number, hexFt: number, salt: number): number {
  const [px, py, pz] = cyl(cfg, x, y);
  const s = WAVELENGTH / (hexFt * 3.2);
  return vnoise3(px * s, py * s, pz * s, seedNum(cfg, 4242 + salt)) * 0.6 +
         vnoise3((px * s) / 3.7, (py * s) / 3.7, (pz * s) / 3.7, seedNum(cfg, 5151 + salt)) * 0.4;
}
