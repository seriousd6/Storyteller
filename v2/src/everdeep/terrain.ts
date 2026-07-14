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
  const belt = field(cfg, x, y, Math.min(oct, 4), 555);        // where ranges may rise
  // (GEOGRAPHY G-3, plate-edge orogeny — ranges biased to continental margins —
  // is deferred: a mask-proxy for "distance to coast" proved too coarse to place
  // ranges reliably without either over-mountaining or vanishing. It needs a
  // real distance-to-coast field, which is a separate piece of work.)
  const oro = ridge * Math.max(0, (belt - 0.45) * 2.4) * landG;
  return 0.155 + base * 0.30 + landG * 0.30 + oro * 0.26 - (cfg.waterPct - 50) * 0.0035;
}

// ---------- Earth-like climate (genVersion-2 opt-in, batch 54, GEOGRAPHY.md) ----------
// Real weather is geography, not noise. How deep inland a point sits (the ocean
// moderates coasts; interiors are dry and extreme).
function interiorness(cfg: TerrainCfg, x: number, y: number, mask?: number): number {
  return Math.max(0, Math.min(1, ((mask ?? landMask(cfg, x, y)) - 0.55) / 0.45));
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
  if (cfg.climateModel === 'earthlike') return earthMoisture(cfg, x, y, oct, eRaw, mask);
  return field(cfg, x, y, oct, 999);
}

function temperatureAt(cfg: TerrainCfg, x: number, y: number, e: number, mask: number): number {
  const lat = Math.min(1, Math.abs(y) / (cfg.heightFt / 2));
  const climate = cfg.climate === 'hot' ? 0.14 : cfg.climate === 'cold' ? -0.14 : 0;
  // earthlike drops a touch faster with latitude so the boreal/taiga belt lands
  // near 55–65° and the tundra at the caps, the way Earth's biomes band
  const latK = cfg.climateModel === 'earthlike' ? 0.98 : 0.85;
  let t = 1 - lat * latK - Math.max(0, e - 0.62) * 1.6 + climate;
  // continental interiors run colder toward the poles (Siberia, the Gobi)
  if (cfg.climateModel === 'earthlike') t -= interiorness(cfg, x, y, mask) * lat * 0.14;
  return t;
}

export function biomeAt(cfg: TerrainCfg, x: number, y: number, oct: number, eBias = 0): BiomeId {
  // elevation and (earthlike-only) land-mask computed ONCE and threaded into the
  // climate functions — the earthlike path used to recompute both several times
  // (perf review #1); values are unchanged.
  const earth = cfg.climateModel === 'earthlike';
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
