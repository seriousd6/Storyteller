// Winds — every world has them (owner item #31: "every world should have wind
// patterns and their currents considered and mapped, and unpowered boats are
// required to follow ocean and wind currents").
//
// The three-cell model, the one Earth runs: easterly TRADE winds in the tropics
// (0–30°), prevailing WESTERLIES in the mid-latitudes (30–60°), and POLAR
// EASTERLIES above 60°. Coriolis deflects each — to the right north of the
// equator, to the left south of it — so the trades blow from the NE/SE and the
// westerlies from the SW/NW, in mirror image across the equator.
//
// Analytic and deterministic: a closed form of latitude plus a little seeded
// waviness. It costs nothing to sample (no grid to build, unlike river/road
// fields), and the same world always has the same winds. Latitude comes from
// the world Y exactly as terrain and earth2026 lay it down
// (y = −(lat/90)·height/2), so this holds for ANY world, not just Earth.
//
// The returned vector is GEOGRAPHIC: [east, north]. +east blows toward larger x;
// +north blows toward the north pole, which is the −y direction in world space
// (a caller drawing or travelling in world coordinates converts north → −y). Its
// MAGNITUDE is the belt's strength: ~1 at each belt's core, tapering to calm at
// the doldrums (0°), the horse latitudes (30°) and the polar front (60°). Ocean
// currents will derive from this field.

import { h32 } from './seeds.ts';
import type { TerrainCfg } from './terrain.ts';

const DEG = Math.PI / 180;
const WAVE_AMP = 0.2; // radians; capped so waviness never flips a belt's core

/** Latitude in degrees [−90, 90] for a world Y, inverting the terrain mapping. */
export function latAt(cfg: TerrainCfg, y: number): number {
  const lat = -y / (cfg.heightFt / 2) * 90;
  return lat < -90 ? -90 : lat > 90 ? 90 : lat;
}

/** A small seeded rotation (radians) that lets the belts meander instead of
 *  ruling dead-straight parallels. Bounded to ±WAVE_AMP by construction. */
function waviness(cfg: TerrainCfg, x: number, y: number): number {
  const lon = (x / cfg.circumFt) * 360;
  const lat = latAt(cfg, y);
  const p1 = (h32(cfg.seed + '/wind/1', 0) / 4294967295) * Math.PI * 2;
  const p2 = (h32(cfg.seed + '/wind/2', 0) / 4294967295) * Math.PI * 2;
  return WAVE_AMP * (0.6 * Math.sin(lon * DEG * 3 + p1) + 0.4 * Math.sin(lat * DEG * 7 + p2));
}

/**
 * Prevailing surface wind at a world point, as [east, north].
 *
 * Zonal component u = −sin(φ·π/30°) with φ = |lat|: easterly on [0,30], westerly
 * on [30,60], easterly on [60,90], and zero at 0/30/60/90 (the calms). The
 * meridional component v = 0.35·sign(lat)·u is the Coriolis turn — it points the
 * trades toward the equator and the westerlies toward the pole in both
 * hemispheres, because u already carries the sign of the belt.
 */
export function windAt(cfg: TerrainCfg, x: number, y: number): [number, number] {
  const lat = latAt(cfg, y);
  const phi = Math.abs(lat);
  const u0 = -Math.sin((phi * Math.PI) / 30);
  const v0 = 0.35 * Math.sign(lat || 1) * u0;
  const w = waviness(cfg, x, y);
  const c = Math.cos(w), s = Math.sin(w);
  return [u0 * c - v0 * s, u0 * s + v0 * c];
}

/** Wind speed at a point, 0 (calm) … ~1.06 (a belt's core). */
export function windSpeedAt(cfg: TerrainCfg, x: number, y: number): number {
  const [u, v] = windAt(cfg, x, y);
  return Math.hypot(u, v);
}
