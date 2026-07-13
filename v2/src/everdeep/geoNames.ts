// Geographic naming generators (owner, batch 10): oceans, continents,
// mountain ranges, lakes, forests, deserts, rivers, islands, regions —
// seeded and deterministic like everything else, so the same seed path
// names the same sea forever. Used by world generation at every tier and
// available to any future generator.

import { h32 } from './seeds.ts';

export type GeoKind =
  | 'ocean' | 'sea' | 'continent' | 'range' | 'lake' | 'river'
  | 'forest' | 'desert' | 'swamp' | 'island' | 'region' | 'valley';

const pick = (seed: string, n: number, arr: readonly string[]): string =>
  arr[h32(seed, n) % arr.length]!;

const SYL_A = [
  'Va', 'Ael', 'Kor', 'Ith', 'Ola', 'Dre', 'Mar', 'Ash', 'Bel', 'Cal',
  'Dur', 'Ery', 'Fen', 'Gal', 'Hol', 'Ist', 'Jor', 'Kel', 'Lam', 'Mor',
  'Nal', 'Or', 'Pra', 'Quel', 'Ral', 'Sar', 'Tal', 'Umb', 'Vel', 'Wyn',
  'Yl', 'Zan', 'Ber', 'Cro', 'Els', 'Gry',
];
const SYL_B = ['a', 'e', 'o', 'ar', 'en', 'il', 'or', 'un', 'ath', 'ent', 'ess', 'ian', 'ov', 'ul', 'yr', ''];
const SYL_C = ['ia', 'or', 'eth', 'and', 'ara', 'heim', 'mar', 'wyn', 'dor', 'is', 'ium', 'aya', 'oth', 'ane'];

/** An invented proper noun — 'Velathia', 'Korheim', 'Ashwyn'… */
export function properName(seed: string, salt = 0): string {
  const a = pick(seed, 11 + salt, SYL_A);
  const b = h32(seed, 12 + salt) % 3 ? pick(seed, 13 + salt, SYL_B) : '';
  const c = pick(seed, 14 + salt, SYL_C);
  const n = a + b + c;
  // collapse accidental doubles at the joins ('Oror' → 'Or')
  return n.replace(/(.{2})\1/g, '$1');
}

const ADJ = [
  'Sundering', 'Glass', 'Iron', 'Weeping', 'Endless', 'Silent', 'Shattered',
  'Amber', 'Pale', 'Howling', 'Verdant', 'Sunken', 'Broken', 'Winter',
  'Gilded', 'Ashen', 'Starlit', 'Old', 'Wandering', 'Thundering', 'Drowned',
  'Sleeping', 'Burning', 'Whispering', 'Crimson', 'Salt-White', 'Storm-Rid',
];

const FORMS: Record<GeoKind, (s: string) => string> = {
  ocean: (s) => pick(s, 1, [
    `The ${pick(s, 2, ADJ)} ${pick(s, 3, ['Ocean', 'Deep', 'Expanse', 'Main', 'Vast'])}`,
    `The Sea of ${properName(s)}`,
    `${properName(s)} Ocean`,
  ]),
  sea: (s) => pick(s, 1, [
    `The ${pick(s, 2, ADJ)} Sea`,
    `The Sea of ${properName(s)}`,
    `${properName(s)} Bay`,
    `The Gulf of ${properName(s)}`,
  ]),
  continent: (s) => properName(s),
  range: (s) => pick(s, 1, [
    `The ${pick(s, 2, ADJ)} ${pick(s, 3, ['Peaks', 'Spine', 'Teeth', 'Reach', 'Crowns', 'Wall', 'Fangs', 'Horns'])}`,
    `The ${properName(s)} Mountains`,
    `${properName(s)} Range`,
    `The ${pick(s, 3, ['Spine', 'Teeth', 'Crowns'])} of ${properName(s)}`,
  ]),
  lake: (s) => pick(s, 1, [
    `Lake ${properName(s)}`,
    `The ${pick(s, 2, ADJ)} Mere`,
    `${properName(s)} Loch`,
    `The ${pick(s, 2, ADJ)} Mirror`,
  ]),
  river: (s) => pick(s, 1, [
    `The ${properName(s)}`,
    `The River ${properName(s)}`,
    `The ${pick(s, 2, ADJ)} Run`,
    `${properName(s)} Water`,
  ]),
  forest: (s) => pick(s, 1, [
    `The ${pick(s, 2, ADJ)} ${pick(s, 3, ['Wood', 'Weald', 'Wilds', 'Thicket', 'Deepwood', 'Tangle'])}`,
    `${properName(s)} Forest`,
    `The ${properName(s)} Weald`,
  ]),
  desert: (s) => pick(s, 1, [
    `The ${pick(s, 2, ADJ)} ${pick(s, 3, ['Sands', 'Waste', 'Erg', 'Reach', 'Flats'])}`,
    `The ${properName(s)} Desert`,
    `The Sea of ${pick(s, 3, ['Dust', 'Glass', 'Bones', 'Salt'])}`,
  ]),
  swamp: (s) => pick(s, 1, [
    `The ${pick(s, 2, ADJ)} ${pick(s, 3, ['Mire', 'Fen', 'Sink', 'Marches', 'Bog'])}`,
    `${properName(s)} Fen`,
  ]),
  island: (s) => pick(s, 1, [
    `${properName(s)} Isle`,
    `The ${pick(s, 2, ADJ)} Isles`,
    `${properName(s)}`,
  ]),
  region: (s) => pick(s, 1, [
    `The ${properName(s)} Reach`,
    `The ${pick(s, 2, ADJ)} Vales`,
    `${properName(s)}`,
    `The ${properName(s)} Lowlands`,
  ]),
  valley: (s) => pick(s, 1, [
    `The Vale of ${properName(s)}`,
    `${properName(s)} Valley`,
    `The ${pick(s, 2, ADJ)} Vale`,
  ]),
};

/** Deterministic geographic name for a canonical seed path. */
export function geoName(kind: GeoKind, seedPath: string): string {
  return FORMS[kind](seedPath);
}
