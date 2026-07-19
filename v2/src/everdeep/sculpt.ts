// Worldcraft — the elevation-modifier stack (WORLDCRAFT.md §1.2, L-1).
//
// `elevationAt` = rawElevationAt (the FROZEN genVersion-1 field) + sculptAt
// (this stack). Everything Worldcraft adds to relief — the [H] river-valley
// carve (L-2), the [E] landform terms behind `reliefModel: 'sculpted'` (L-3+),
// and user elevation painting (Lane S) — enters through this one seam, so the
// frozen field never changes and every addition is individually gated.
//
// THE RECURSION GUARD (WORLDCRAFT.md §1.2-C): rivers are traced FROM the
// field, but valleys are carved INTO the field ALONG rivers. Hydrology
// therefore samples `uncarvedElevationAt` (raw + sculptBaseAt — everything
// EXCEPT the carve), traces its stems, and only then may a carve field be
// registered here for every LATER consumer (settlements, roads, biomes,
// rendering, travel). Nothing in this module may ever call `elevationAt`.
//
// L-1 ships the mechanism inert: the registry works (smoke proves it), but no
// production code registers a field and no [E] terms exist yet, so every
// world — classic, sculpted, earth — is byte-identical to the pre-L-1 field.

import type { TerrainCfg } from './terrain.ts';

/**
 * A carve field answers "how much lower is this point because water carved
 * it": depth in field units (≥ 0, ~0.0–0.1), 0 outside any valley's reach.
 * L-2 builds the real one from the traced river stems (a route-distance
 * query in the `riverField.ts` mold); until then only tests register one.
 */
export interface CarveField {
  carveAt(x: number, y: number): number;
}

// Keyed by world seed — one carve field per open world, registered after its
// hydrology pass, cleared when the world closes or re-traces.
const carveFields = new Map<string, CarveField>();

export function registerCarveField(seed: string, field: CarveField): void {
  carveFields.set(seed, field);
}
export function clearCarveField(seed: string): void {
  carveFields.delete(seed);
}

/**
 * The Worldcraft addition to the frozen field at (x, y), FULL stack. Applied
 * by `elevationAt` on top of `rawElevationAt`; keep the empty path near-free —
 * this runs once per elevation sample, millions of times per render.
 */
export function sculptAt(cfg: TerrainCfg, x: number, y: number, oct: number): number {
  return sculptBaseAt(cfg, x, y, oct) + carveTermAt(cfg, x, y);
}

/**
 * The stack WITHOUT the river carve — the surface hydrology traces on
 * (`uncarvedElevationAt`). Rivers must never see the carve (it derives from
 * them), but they SHOULD see everything else: a rift valley collects rivers,
 * a user-dug channel floods. L-1: no terms exist yet, so this is 0.
 */
export function sculptBaseAt(cfg: TerrainCfg, _x: number, _y: number, _oct: number): number {
  // [E] landform terms (L-3+) gate on cfg.reliefModel === 'sculpted' here.
  // [S] user elevation paint (Lane S) applies here, topmost.
  void cfg;
  return 0;
}

// [H] the river-valley carve (L-2) — registered post-hydrology, keyed by seed.
function carveTermAt(cfg: TerrainCfg, x: number, y: number): number {
  if (!carveFields.size) return 0;
  const cf = carveFields.get(cfg.seed);
  return cf ? -cf.carveAt(x, y) : 0;
}
