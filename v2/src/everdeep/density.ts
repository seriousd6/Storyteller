// The settlement density field (MAPS §9b — the Victorian benchmark).
// Every region hex ROLLS deterministically for an unwritten settlement:
// habitability (biome, relief, water access) sets the odds per band —
// heartland country hosts something in a third of its hexes, frontier
// almost nothing — and the seed contract guarantees the same ghost greets
// you every visit. Nothing is stored until a ghost is materialized.
//
// The danger rule (PLAN §6.7) lives here too: a hostile landmark nearby
// means the hex spawns nothing — or spawns ABANDONED.

import { biomeAt, elevationAt, type TerrainCfg, type BiomeId } from './terrain.ts';
import { h32 } from './seeds.ts';

const REGION_FT = 31680;
const SQ3 = Math.sqrt(3);
const R = REGION_FT / SQ3;

export const regionHexCenter = (q: number, r: number): [number, number] =>
  [SQ3 * R * (q + r / 2), 1.5 * R * r];

// how much a biome wants people in it
const BIOME_HAB: Partial<Record<BiomeId, number>> = {
  grass: 1, beach: 0.85, savanna: 0.7, forest: 0.7, hills: 0.5, jungle: 0.4,
  taiga: 0.35, tundra: 0.12, desert: 0.12, snow: 0.04, mountain: 0.05,
};

/** 0..1 — how settle-able this spot is. Biome carries most of it; water
 *  within a hex's reach adds the harbor/river bonus (a proxy until G3
 *  rivers land); harsh relief costs. */
export function habitabilityAt(cfg: TerrainCfg, x: number, y: number): number {
  const b = biomeAt(cfg, x, y, 6);
  const base = BIOME_HAB[b] ?? 0;
  if (base === 0) return 0;
  let hab = base;
  // water within ~4 miles: coast and lakeshore country fills up first
  const step = 4 * 5280;
  for (const [dx, dy] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
    const nb = biomeAt(cfg, x + dx, y + dy, 5);
    if (nb === 'water' || nb === 'deep') { hab += 0.22; break; }
  }
  const e = elevationAt(cfg, x, y, 6);
  hab -= Math.max(0, e - 0.68) * 1.2; // high country resists the plough
  return Math.max(0, Math.min(1, hab));
}

export type GhostClass = 'town' | 'village' | 'hamlet';
export interface GhostSettlement {
  q: number; r: number; x: number; y: number;
  cls: GhostClass;
  pop: number;
  hab: number;
  abandoned: boolean;
  seedPath: string;
}

export interface HostilePoint { x: number; y: number }
/** Danger radius by hostile landmark, in feet (threat tiers come later). */
export const DANGER_FT = 2.2 * REGION_FT;

/** The deterministic roll for one region hex. `hostiles` are nearby lairs/
 *  dungeons/ruins — inside their shadow the hex spawns nothing, or spawns
 *  an abandoned husk (roughly half and half, seeded). */
export function ghostSettlementAt(
  cfg: TerrainCfg,
  worldSeed: string,
  planeId: string,
  q: number,
  r: number,
  hostiles: HostilePoint[] = []
): GhostSettlement | null {
  const seedPath = `${worldSeed}/p:${planeId}/h:region:${q},${r}/f:settlement:0`;
  const roll = h32(seedPath, 41) / 4294967295;
  if (roll > 0.35) return null; // cheap gate before any terrain math
  const [x, y] = regionHexCenter(q, r);
  const hab = habitabilityAt(cfg, x, y);
  const chance = hab > 0.7 ? 0.35 : hab > 0.45 ? 0.18 : hab > 0.25 ? 0.06 : 0;
  if (roll > chance) return null;
  // Zipf's long tail: mostly hamlets, some villages, the odd market town
  const sizeRoll = h32(seedPath, 42) % 100;
  const cls: GhostClass = sizeRoll < 7 ? 'town' : sizeRoll < 38 ? 'village' : 'hamlet';
  const pop = cls === 'town'
    ? 2_000 + (h32(seedPath, 43) % 9_000)
    : cls === 'village'
      ? 250 + (h32(seedPath, 43) % 1_400)
      : 25 + (h32(seedPath, 43) % 160);
  let abandoned = false;
  for (const hp of hostiles) {
    let dx = Math.abs(x - hp.x) % cfg.circumFt;
    if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx;
    if (Math.hypot(dx, y - hp.y) < DANGER_FT) {
      if (h32(seedPath, 44) % 2 === 0) return null; // never settled at all
      abandoned = true; // settled once — the lair emptied it
      break;
    }
  }
  return { q, r, x, y, cls, pop, hab, abandoned, seedPath };
}
