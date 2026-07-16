// Ocean currents — the sea's half of item #31, derived from the winds.
//
// Surface currents are wind-driven: the water is dragged along by the wind and
// turned by Coriolis (to the right north of the equator, left south of it — the
// Ekman deflection), which organises the ocean into GYRES. Between the easterly
// trades and the prevailing westerlies, the subtropical gyres turn clockwise in
// the north and counter-clockwise in the south — the equatorial currents run
// west with the trades, the mid-latitude drifts run east with the westerlies.
//
// So a current is the local wind, turned a little toward the gyre's heart and
// slowed to a fraction of the wind's pace — and it exists only where there is
// sea. Deterministic and analytic, like the wind it rides on (windField.ts).
//
// Returned as GEOGRAPHIC [east, north], the same convention as the wind. Open
// ocean only for now: this is the wind-driven circulation, NOT yet the coastal
// boundary currents (the Gulf Stream running up a western shore) — a current
// here does not yet bend to hug a coast. That closes the gyres and is the next
// slice; noted so the map and the sailing model know what they are riding.

import { windAt, latAt } from './windField.ts';
import { biomeAt, octFor, type TerrainCfg } from './terrain.ts';

const WATER = new Set(['deep', 'water']);
const OCT_W = octFor(316_800); // the world octave — the sea as roads/settlement judge it
const EKMAN_TURN = 0.4;        // radians the current turns off the wind (Coriolis)
const CURRENT_FRACTION = 0.5;  // a current runs at roughly half the wind's pace

/** Is this world point open sea (by the world octave the map and roads use)? */
export function isSea(cfg: TerrainCfg, x: number, y: number): boolean {
  return WATER.has(biomeAt(cfg, x, y, OCT_W));
}

/**
 * The wind-driven ocean circulation at a point, IGNORING the land/sea mask —
 * the current the sea would carry if it were sea here. [east, north].
 *
 * It is the local wind turned by Coriolis toward the gyre centre (right in the
 * north, left in the south) and scaled down: the trades push the equatorial
 * water west, the westerlies push the mid-latitude water east, and the turn is
 * what makes the subtropical gyres close their loops.
 */
export function currentVectorAt(cfg: TerrainCfg, x: number, y: number): [number, number] {
  const [wu, wv] = windAt(cfg, x, y);
  const theta = -EKMAN_TURN * Math.sign(latAt(cfg, y) || 1); // right (−) in N, left (+) in S
  const c = Math.cos(theta), s = Math.sin(theta);
  return [CURRENT_FRACTION * (wu * c - wv * s), CURRENT_FRACTION * (wu * s + wv * c)];
}

/** Surface current at a world point, or null on land. [east, north]. */
export function currentAt(cfg: TerrainCfg, x: number, y: number): [number, number] | null {
  if (!isSea(cfg, x, y)) return null;
  return currentVectorAt(cfg, x, y);
}

/** Current speed at a point (0 on land or in a calm), for the map and sailing. */
export function currentSpeedAt(cfg: TerrainCfg, x: number, y: number): number {
  const v = currentAt(cfg, x, y);
  return v ? Math.hypot(v[0], v[1]) : 0;
}
