// Everdeep seed contract — FROZEN (docs/everdeep/CONTRACTS.md §1–§4).
// Canonical seed paths, the 64-bit hash, ghost identity, and RNG streams.
// Changing anything here silently redraws every user's unwritten world;
// scripts/smoke-everdeep.mjs pins the published test vectors against this
// exact implementation.

/** 32-bit hash of a seed path (CONTRACTS §3 — normative implementation). */
export function h32(str: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** 64 bits as 14 base36 chars, from two independent 32-bit passes. */
export function h64(str: string): string {
  return (
    h32(str, 0x9e3779b9).toString(36).padStart(7, '0') +
    h32(str, 0x85ebca6b).toString(36).padStart(7, '0')
  );
}

/** A ghost's entity id is derived from its seed path (CONTRACTS §2). */
export function ghostId(seedPath: string): string {
  return 'e_' + h64(seedPath);
}

/** RNG stream constants (CONTRACTS §4). Adding is fine; renumbering is breaking. */
export const STREAM = {
  TERRAIN: 0x0000,
  CONTENT: 0x0001,
  LAYOUT: 0x0002,
  PLACE: 0x0003,
} as const;

export type Rng = () => number;

/** mulberry32 seeded by h32(path, stream) — the contract RNG (CONTRACTS §4). */
export function rngFor(seedPath: string, stream: number): Rng {
  let a = h32(seedPath, stream);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- canonical path builders (CONTRACTS §1) ----------

const rerollSuffix = (n: number): string => (n > 0 ? `/r:${n}` : '');

/** Ghost child suggestion under a materialized (or hand-made) entity. */
export function childPath(worldSeed: string, parentEntityId: string, kind: string, slot: number, reroll = 0): string {
  return `${worldSeed}/${parentEntityId}/c:${kind}:${slot}${rerollSuffix(reroll)}`;
}

/** A hex of a plane at a tier. */
export function hexPath(worldSeed: string, planeId: string, tier: string, q: number, r: number, reroll = 0): string {
  return `${worldSeed}/p:${planeId}/h:${tier}:${q},${r}${rerollSuffix(reroll)}`;
}

/** Ghost feature suggestion inside a hex. */
export function hexFeaturePath(worldSeed: string, planeId: string, tier: string, q: number, r: number, kind: string, slot: number, reroll = 0): string {
  return `${worldSeed}/p:${planeId}/h:${tier}:${q},${r}/f:${kind}:${slot}${rerollSuffix(reroll)}`;
}

/** A story-web role resolution owned by an entity (usually a quest). */
export function rolePath(worldSeed: string, ownerEntityId: string, roleId: string): string {
  return `${worldSeed}/${ownerEntityId}/role:${roleId}`;
}

/** A site (and floor) generation. */
export function sitePath(worldSeed: string, siteId: string, floor?: number): string {
  return `${worldSeed}/s:${siteId}${floor === undefined ? '' : `/fl:${floor}`}`;
}
