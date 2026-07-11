// Seeded RNG. Every roll gets a seed string so any result can be reproduced —
// this is what makes pinned sheet blocks and (later) shareable roll URLs work.

export type Rng = () => number;

/** xmur3 string hash → 32-bit seed. */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** mulberry32 PRNG — fast, decent distribution, tiny. */
export function makeRng(seed: string): Rng {
  let a = hashSeed(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A short random seed string for a fresh roll. */
export function randomSeed(): string {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return buf[0]!.toString(36) + buf[1]!.toString(36);
  }
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}
