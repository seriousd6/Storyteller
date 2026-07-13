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

export type Landform = 'pangea' | 'continent' | 'continents' | 'archipelago' | 'isles';

export interface TerrainCfg {
  seed: string;          // world seed (root of the lineage)
  circumFt: number;      // east–west circumference (x wraps at this)
  heightFt: number;      // north–south extent (poles at ±heightFt/2)
  landform: Landform;
  continents?: number;   // for landform 'continents' (2–5)
  waterPct: number;      // 0–100 dial
  climate: 'temperate' | 'hot' | 'cold';
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
function fbm3(x: number, y: number, z: number, seed: number, oct: number): number {
  let val = 0, amp = 0.5, f = 1, tot = 0;
  for (let i = 0; i < oct; i++) {
    val += amp * vnoise3(x * f, y * f, z * f, seed + i * 101);
    tot += amp;
    amp *= 0.55;
    f *= 2;
  }
  return val / tot;
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
  const key = `${cfg.seed}|${cfg.landform}|${cfg.continents ?? 0}|${cfg.circumFt}|${cfg.heightFt}`;
  let bs = maskCache.get(key);
  if (bs) return bs;
  bs = [];
  const rnd = (i: number, s: number) => hash3(i, s, 0, seedNum(cfg, 1234));
  const spec: Record<Landform, { n: number; r: number; amp: number }> = {
    pangea: { n: 1, r: 0.47, amp: 1.0 },
    continent: { n: 1, r: 0.28, amp: 1.0 },
    continents: { n: Math.min(5, Math.max(2, cfg.continents ?? 3)), r: 0.27, amp: 1.0 },
    archipelago: { n: 12, r: 0.085, amp: 0.95 },
    isles: { n: 26, r: 0.05, amp: 0.95 },
  };
  const { n, r, amp } = spec[cfg.landform];
  const span = Math.min(cfg.circumFt, cfg.heightFt);
  for (let i = 0; i < n; i++) {
    // continents space evenly around the cylinder with jitter; small forms scatter
    const xFrac = n <= 5 ? (i + 0.5) / n + (rnd(i, 1) - 0.5) * (0.6 / n) : rnd(i, 1);
    const yFrac = (rnd(i, 2) - 0.5) * (n <= 5 ? 0.5 : 0.8);
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

// ---------- the public field ----------
export function octFor(hexFt: number): number {
  return Math.max(4, Math.min(11, Math.ceil(Math.log2(WAVELENGTH / hexFt)) + 1));
}

export function elevationAt(cfg: TerrainCfg, x: number, y: number, oct: number): number {
  const base = field(cfg, x, y, oct, 0);
  const mask = landMask(cfg, x, y);
  // mask carries the landform; base carries the texture. Sea level sits at
  // 0.5; waterPct shifts the whole field.
  return base * 0.42 + mask * 0.52 + 0.16 - (cfg.waterPct - 50) * 0.0035;
}

function moistureAt(cfg: TerrainCfg, x: number, y: number, oct: number): number {
  return field(cfg, x, y, oct, 999);
}

function temperatureAt(cfg: TerrainCfg, y: number, e: number): number {
  const lat = Math.min(1, Math.abs(y) / (cfg.heightFt / 2));
  const climate = cfg.climate === 'hot' ? 0.14 : cfg.climate === 'cold' ? -0.14 : 0;
  return 1 - lat * 0.85 - Math.max(0, e - 0.62) * 1.6 + climate;
}

export function biomeAt(cfg: TerrainCfg, x: number, y: number, oct: number, eBias = 0): BiomeId {
  const e = elevationAt(cfg, x, y, oct) + eBias;
  if (e < 0.46) return 'deep';
  if (e < 0.5) return 'water';
  if (e < 0.506) return 'beach';
  const t = temperatureAt(cfg, y, e);
  const m = moistureAt(cfg, x, y, oct);
  if (e > 0.76) return 'mountain';
  if (e > 0.71) return 'hills';
  if (t < 0.18) return 'snow';
  if (t < 0.3) return m > 0.5 ? 'taiga' : 'tundra';
  if (m < 0.34) return t > 0.62 ? 'desert' : 'savanna';
  if (m < 0.55) return 'grass';
  return t > 0.66 ? 'jungle' : 'forest';
}

/** Per-hex render detail (relief + threshold bias), periodic like the rest. */
export function detailAt(cfg: TerrainCfg, x: number, y: number, hexFt: number, salt: number): number {
  const [px, py, pz] = cyl(cfg, x, y);
  const s = WAVELENGTH / (hexFt * 3.2);
  return vnoise3(px * s, py * s, pz * s, seedNum(cfg, 4242 + salt)) * 0.6 +
         vnoise3((px * s) / 3.7, (py * s) / 3.7, (pz * s) / 3.7, seedNum(cfg, 5151 + salt)) * 0.4;
}
