// Strategic & luxury resources (batch 48 — FOOD.md §5).
// A deterministic per-WORLD-hex roll, like the density-ghost field: the land
// carries ore, timber, furs, spice… keyed to its biome, the same every visit,
// stored nowhere. Strategic goods (iron, timber, horses, salt, stone) arm and
// build a realm; luxuries (gems, silver, gold, spice, furs, pearls, dyes,
// ivory, amber) make it rich. Industrial support towns and building bonuses
// read this field later.

import { h32 } from './seeds.ts';

export interface ResourceDef {
  kind: string;
  glyph: string;
  label: string;
  /** arms and builds a realm (iron, timber, salt…) */
  strategic: boolean;
  /** makes a realm rich (gems, spice, furs…) — a resource may be BOTH (owner) */
  luxury: boolean;
  /** an industry the resource supports, if a support town would grow on it */
  industry?: { kind: string; label: string; glyph: string; verb: string };
  /** biome → relative abundance weight (absent = never here) */
  aff: Record<string, number>;
}

const MINE = { kind: 'mine', label: 'Mining camp', glyph: '⛏️', verb: 'mines' };
const QUARRY = { kind: 'quarry', label: 'Quarry town', glyph: '🪨', verb: 'quarries' };
const LUMBER = { kind: 'lumber', label: 'Lumber camp', glyph: '🪓', verb: 'fells the timber of' };
const RANCH = { kind: 'ranch', label: 'Stock town', glyph: '🐎', verb: 'raises the herds of' };
const SALTERN = { kind: 'saltern', label: 'Salt works', glyph: '🧂', verb: 'draws the salt of' };

// The table. Weights are relative WITHIN a biome; rarer luxuries carry small
// weights so they surface seldom. Some goods are BOTH strategic and luxury —
// coin metals, salt, war-horses (owner, batch 49).
export const RESOURCES: ResourceDef[] = [
  { kind: 'iron', glyph: '⛏️', label: 'Iron', strategic: true, luxury: false, industry: MINE, aff: { mountain: 4, hills: 3, taiga: 1 } },
  { kind: 'copper', glyph: '🟠', label: 'Copper', strategic: true, luxury: true, industry: MINE, aff: { mountain: 3, hills: 3, desert: 1 } },
  { kind: 'silver', glyph: '🔘', label: 'Silver', strategic: true, luxury: true, industry: MINE, aff: { mountain: 2, hills: 1 } },
  { kind: 'gold', glyph: '🟡', label: 'Gold', strategic: true, luxury: true, industry: MINE, aff: { mountain: 1, hills: 1, savanna: 1 } },
  { kind: 'gems', glyph: '💎', label: 'Gems', strategic: false, luxury: true, industry: MINE, aff: { mountain: 1, hills: 1, jungle: 1 } },
  { kind: 'stone', glyph: '🪨', label: 'Quarried stone', strategic: true, luxury: false, industry: QUARRY, aff: { mountain: 3, hills: 3, desert: 1 } },
  { kind: 'timber', glyph: '🌲', label: 'Timber', strategic: true, luxury: false, industry: LUMBER, aff: { forest: 4, taiga: 3, jungle: 2 } },
  { kind: 'furs', glyph: '🦊', label: 'Furs', strategic: true, luxury: true, aff: { taiga: 4, tundra: 3, snow: 2, forest: 2 } },
  { kind: 'salt', glyph: '🧂', label: 'Salt', strategic: true, luxury: true, industry: SALTERN, aff: { desert: 3, beach: 2, savanna: 1 } },
  { kind: 'spice', glyph: '🌶️', label: 'Spice', strategic: false, luxury: true, aff: { jungle: 3, savanna: 1, desert: 1 } },
  { kind: 'horses', glyph: '🐎', label: 'Horses', strategic: true, luxury: true, industry: RANCH, aff: { grass: 3, savanna: 3 } },
  { kind: 'cattle', glyph: '🐄', label: 'Cattle', strategic: true, luxury: false, industry: RANCH, aff: { grass: 3, savanna: 2, hills: 1 } },
  { kind: 'pearls', glyph: '🦪', label: 'Pearls', strategic: false, luxury: true, aff: { beach: 2 } },
  { kind: 'dyes', glyph: '🟣', label: 'Dyes', strategic: false, luxury: true, aff: { jungle: 2, beach: 1 } },
  { kind: 'ivory', glyph: '🦣', label: 'Ivory', strategic: false, luxury: true, aff: { savanna: 2, tundra: 1 } },
  { kind: 'amber', glyph: '🟧', label: 'Amber', strategic: false, luxury: true, aff: { taiga: 1, beach: 1 } },
];

/** How a resource reads: "strategic", "luxury", or "strategic & luxury". */
export function resourceClass(r: { strategic: boolean; luxury: boolean }): string {
  return r.strategic && r.luxury ? 'strategic & luxury' : r.strategic ? 'strategic' : 'luxury';
}

export interface Resource extends ResourceDef {
  q: number; r: number;
}

/** How much of a world hex carries a resource — one in ~ROLL_GATE (batch 48). */
const ROLL_GATE = 0.085;

/** The deterministic resource for a world hex, or null. `biome` is the world
 *  hex's biome (respecting paint), supplied by the caller. */
export function resourceAt(
  worldSeed: string,
  planeId: string,
  q: number,
  r: number,
  biome: string,
): Resource | null {
  if (biome === 'water' || biome === 'deep') return null;
  const seed = `${worldSeed}/p:${planeId}/h:world:${q},${r}/res`;
  if (h32(seed, 71) / 4294967295 > ROLL_GATE) return null; // cheap gate first
  const cands = RESOURCES.filter((d) => d.aff[biome]);
  if (!cands.length) return null;
  const total = cands.reduce((s, c) => s + (c.aff[biome] ?? 0), 0);
  let pick = (h32(seed, 72) / 4294967295) * total;
  for (const c of cands) { pick -= c.aff[biome] ?? 0; if (pick <= 0) return { ...c, q, r }; }
  const last = cands[cands.length - 1]!;
  return { ...last, q, r };
}
