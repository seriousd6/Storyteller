// Sailing — how a boat's speed depends on the wind and the current it's crossing
// (item #31c/#31d). The fields say which way the air and water move (windField,
// currentField); this says what a hull does about it.
//
// The owner's rule: "unpowered boats are required to follow ocean and wind
// currents, and powered boats can use them but are not bound by them (or however
// sailing works)." However sailing works is a POLAR — through-water speed as a
// function of the angle to the wind — plus the current carrying the whole hull:
//
//   - A sail makes its best speed on a broad reach (~120–140° off the wind) and
//     a touch less dead downwind. It CANNOT sail straight into the wind: inside
//     the no-go zone it beats to windward by tacking, real progress toward the
//     mark but at a fraction of reaching speed — slow, never zero, never a wall.
//   - The current then advects the hull bodily: a fair current adds to the ground
//     made good, a foul one subtracts. Becalmed (no wind), the sail gives nothing
//     and the boat simply goes where the water goes — it CANNOT make way against a
//     current it cannot outsail. That is "required to follow".
//   - A powered hull ignores the wind and holds its pace through the water, so a
//     current only ever nudges it faster or slower — never stops it. "Use, not
//     bound."
//
// Speeds are RELATIVE (1 ≈ a boat's still-water hull speed); the travel layer
// scales them to miles per day and tunes the constants. This module only owns
// the shape. All vectors are geographic [east, north], matching the fields.

import { windAt } from './windField.ts';
import { currentAt } from './currentField.ts';
import type { TerrainCfg } from './terrain.ts';

const NO_GO_DEG = 45;        // closer to the wind than this and you must tack
const WIND_REF = 0.5;        // wind speed (field units) that fills the sails fully
const POWERED_HULL = 1.0;    // an engine's steady pace through the water
const CURRENT_STRENGTH = 0.4; // how hard the current pushes the hull, vs sail power

/**
 * Through-water speed as a fraction of hull max, by the angle OFF THE WIND SOURCE
 * in degrees: 0 = bow straight into the wind (no-go), 180 = wind dead astern.
 * Peaks on a broad reach (~125°); a dead run is a little slower; inside the no-go
 * zone it is the reduced velocity-made-good of a boat tacking upwind.
 */
export function polarThroughWater(offSourceDeg: number): number {
  const d = Math.min(180, Math.abs(offSourceDeg));
  if (d < NO_GO_DEG) return 0.30 + 0.10 * (d / NO_GO_DEG); // 0.30 into the wind → 0.40 at the no-go edge
  const t = (d - NO_GO_DEG) / (180 - NO_GO_DEG);           // 0 close-hauled … 1 dead run
  const peak = Math.sin(Math.min(1, t / 0.62) * (Math.PI / 2)); // rises to 1 by a broad reach
  const run = 1 - 0.25 * Math.max(0, (t - 0.62) / 0.38);        // eases back to 0.75 at a dead run
  return 0.40 + 0.60 * peak * run;
}

function unit(x: number, y: number): [number, number] {
  const m = Math.hypot(x, y);
  return m > 1e-9 ? [x / m, y / m] : [0, 0];
}

/**
 * Ground speed a boat makes along `heading` (any length; direction is what
 * matters) through the given wind and current. Positive is progress toward the
 * heading; NEGATIVE means wind+current push the hull backwards faster than it can
 * make way — an unpowered boat that cannot hold its course.
 */
export function boatGroundSpeed(
  heading: [number, number],
  wind: [number, number],
  current: [number, number],
  powered = false,
): number {
  const h = unit(heading[0], heading[1]);
  const drift = CURRENT_STRENGTH * (current[0] * h[0] + current[1] * h[1]); // current along the heading
  if (powered) return POWERED_HULL + drift; // the engine holds pace; current only nudges
  const windSpeed = Math.hypot(wind[0], wind[1]);
  if (windSpeed < 1e-6) return drift; // becalmed: you go where the water goes
  const wdir = [wind[0] / windSpeed, wind[1] / windSpeed];
  // angle off the wind SOURCE: heading vs the −wind direction it blows from
  const withWind = h[0] * wdir[0] + h[1] * wdir[1];               // cos(angle to where wind blows toward)
  const offSourceDeg = (Math.acos(Math.max(-1, Math.min(1, -withWind))) * 180) / Math.PI;
  const throughWater = polarThroughWater(offSourceDeg) * Math.min(1, windSpeed / WIND_REF);
  return throughWater + drift;
}

/**
 * Ground speed for a leg from (ax,ay) to (bx,by) in world space, sampling the
 * wind and current at the leg's midpoint. The travel layer will call this per
 * boat edge; `currentAt` is null off the sea, treated here as still water.
 */
export function boatLegSpeed(
  cfg: TerrainCfg,
  ax: number, ay: number, bx: number, by: number,
  powered = false,
): number {
  const mx = (ax + bx) / 2, my = (ay + by) / 2;
  // heading is geographic [east, north]; world +y is south, so north = −Δy
  const heading: [number, number] = [bx - ax, -(by - ay)];
  const wind = windAt(cfg, mx, my);
  const current = currentAt(cfg, mx, my) ?? [0, 0];
  return boatGroundSpeed(heading, wind, current, powered);
}
