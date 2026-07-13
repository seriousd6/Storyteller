// The notebook portrait pack (owner, batch 8: "notebook-style pencil
// drawings … additive art for creating unique people"). Every person gets a
// hand-sketched bust built from layered parts — race-pertinent head, eyes,
// brows, nose, mouth, hair, facial hair, headwear, garb — drawn as wobbled
// pencil strokes (two offset passes, like a 2B pencil gone over twice).
// Seeded and deterministic: the same person always looks the same; each
// layer rerolls independently and the recipe is stored as a compact string.

import { h32 } from './seeds.ts';

export type Race = 'human' | 'elf' | 'dwarf' | 'orc' | 'halfling';
export const RACES: Race[] = ['human', 'elf', 'dwarf', 'orc', 'halfling'];

export interface PortraitRecipe {
  race: Race;
  eyes: number; brows: number; nose: number; mouth: number;
  hair: number; facial: number; headwear: number; garb: number;
}

// layer order in the compact string — frozen (stored in world docs)
const ORDER = ['eyes', 'brows', 'nose', 'mouth', 'hair', 'facial', 'headwear', 'garb'] as const;
export const PORTRAIT_LAYERS: Array<{ key: (typeof ORDER)[number]; label: string }> = [
  { key: 'hair', label: 'hair' },
  { key: 'eyes', label: 'eyes' },
  { key: 'brows', label: 'brows' },
  { key: 'nose', label: 'nose' },
  { key: 'mouth', label: 'mouth' },
  { key: 'facial', label: 'beard' },
  { key: 'headwear', label: 'hat' },
  { key: 'garb', label: 'garb' },
];

type Pt = [number, number];
type Stroke = { pts: Pt[]; w?: number; o?: number };
const S = (pts: Pt[], w = 2.1, o = 0.85): Stroke => ({ pts, w, o });

// ---------- the pencil ----------
function jitterer(seed: string): (n: number) => number {
  let i = 0;
  return (amp: number) => ((h32(seed, i++) / 4294967295) - 0.5) * 2 * amp;
}
/** Subdivide a polyline into short steps and wobble each point — the hand. */
function pencilPath(pts: Pt[], j: (n: number) => number): string {
  if (pts.length < 2) return '';
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!, [bx, by] = pts[i + 1]!;
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.max(1, Math.round(len / 7));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push([ax + (bx - ax) * t + j(1.1), ay + (by - ay) * t + j(1.1)]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return 'M' + out.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
}
function renderStrokes(strokes: Stroke[], j: (n: number) => number): string {
  let svg = '';
  for (const st of strokes) {
    const d = pencilPath(st.pts, j);
    if (!d) continue;
    svg += `<path d="${d}" fill="none" stroke="#454a52" stroke-width="${st.w}" stroke-opacity="${st.o}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // the second pass of the pencil, slightly astray
    svg += `<path d="${d}" fill="none" stroke="#454a52" stroke-width="${(st.w ?? 2) * 0.55}" stroke-opacity="${(st.o ?? 0.85) * 0.4}" stroke-linecap="round" transform="translate(${(0.7 + j(0.5)).toFixed(2)} ${(0.5 + j(0.5)).toFixed(2)})"/>`;
  }
  return svg;
}
/** Parallel hatch strokes across a band — pencil shading. */
function hatch(x0: number, y0: number, x1: number, y1: number, n: number, tilt = -0.5): Stroke[] {
  const out: Stroke[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
    const len = 7 + (i % 3) * 3;
    out.push(S([[cx - len / 2, cy - len * tilt / 2], [cx + len / 2, cy + len * tilt / 2]], 1.1, 0.4));
  }
  return out;
}

// ---------- part library (face center ~(100,108), viewBox 200×240) ----------
const HEADS: Record<Race, Stroke[]> = {
  human: [
    S([[64, 78], [62, 108], [68, 136], [82, 154], [100, 160], [118, 154], [132, 136], [138, 108], [136, 78], [124, 62], [100, 56], [76, 62], [64, 78]]),
    S([[60, 100], [56, 104], [58, 114], [64, 116]], 1.8), // ear L
    S([[140, 100], [144, 104], [142, 114], [136, 116]], 1.8), // ear R
    S([[82, 160], [84, 176]], 1.8), S([[118, 160], [116, 176]], 1.8), // neck
  ],
  elf: [
    S([[70, 76], [66, 106], [72, 134], [86, 154], [100, 160], [114, 154], [128, 134], [134, 106], [130, 76], [118, 60], [100, 56], [82, 60], [70, 76]]),
    S([[66, 102], [52, 88], [62, 106], [68, 112]], 1.8), // long ear L
    S([[134, 102], [148, 88], [138, 106], [132, 112]], 1.8), // long ear R
    S([[86, 160], [88, 176]], 1.8), S([[114, 160], [112, 176]], 1.8),
  ],
  dwarf: [
    S([[58, 82], [56, 110], [62, 134], [78, 150], [100, 156], [122, 150], [138, 134], [144, 110], [142, 82], [128, 64], [100, 58], [72, 64], [58, 82]]),
    S([[54, 102], [50, 106], [52, 116], [58, 118]], 1.8),
    S([[146, 102], [150, 106], [148, 116], [142, 118]], 1.8),
    S([[80, 156], [82, 176]], 1.8), S([[120, 156], [118, 176]], 1.8),
  ],
  orc: [
    S([[62, 78], [60, 110], [66, 138], [80, 154], [100, 158], [120, 154], [134, 138], [140, 110], [138, 78], [126, 64], [100, 60], [74, 64], [62, 78]]),
    S([[58, 98], [50, 92], [56, 106], [62, 110]], 1.8), // pointed ear L
    S([[142, 98], [150, 92], [144, 106], [138, 110]], 1.8),
    S([[86, 140], [84, 132]], 2.4), S([[114, 140], [116, 132]], 2.4), // tusks
    S([[80, 158], [82, 176]], 1.8), S([[120, 158], [118, 176]], 1.8),
  ],
  halfling: [
    S([[68, 84], [66, 110], [72, 134], [84, 150], [100, 155], [116, 150], [128, 134], [134, 110], [132, 84], [120, 66], [100, 61], [80, 66], [68, 84]]),
    S([[64, 102], [58, 104], [60, 116], [66, 118]], 1.8),
    S([[136, 102], [142, 104], [140, 116], [134, 118]], 1.8),
    S([[84, 155], [86, 174]], 1.8), S([[116, 155], [114, 174]], 1.8),
  ],
};

const EYES: Stroke[][] = [
  [S([[70, 104], [80, 100], [90, 104]], 1.8), S([[110, 104], [120, 100], [130, 104]], 1.8),
   S([[79, 103], [81, 103]], 2.6), S([[119, 103], [121, 103]], 2.6)], // almond + pupil
  [S([[72, 103], [80, 99], [88, 103], [80, 106], [72, 103]], 1.6), S([[112, 103], [120, 99], [128, 103], [120, 106], [112, 103]], 1.6),
   S([[80, 102], [80, 104]], 2.8), S([[120, 102], [120, 104]], 2.8)], // open rounds
  [S([[71, 103], [89, 102]], 2), S([[111, 102], [129, 103]], 2)], // narrow, weary
  [S([[70, 102], [80, 100], [90, 102]], 1.8), S([[110, 102], [120, 100], [130, 102]], 1.8),
   S([[72, 98], [88, 97]], 1.4), S([[112, 97], [128, 98]], 1.4),
   S([[79, 101], [81, 101]], 2.6), S([[119, 101], [121, 101]], 2.6)], // heavy-lidded
];

const BROWS: Stroke[][] = [
  [S([[68, 92], [90, 90]], 2.2), S([[110, 90], [132, 92]], 2.2)], // flat
  [S([[68, 94], [78, 88], [90, 91]], 2.2), S([[110, 91], [122, 88], [132, 94]], 2.2)], // arched
  [S([[67, 93], [90, 90]], 3.4), S([[110, 90], [133, 93]], 3.4)], // thick
  [S([[70, 89], [90, 94]], 2.4), S([[110, 94], [130, 89]], 2.4)], // stern
];

const NOSES: Stroke[][] = [
  [S([[100, 104], [98, 120], [104, 124], [100, 126]], 1.8)], // straight with a turn
  [S([[98, 116], [96, 122], [100, 125], [104, 122], [102, 116]], 1.6)], // button
  [S([[96, 106], [92, 122], [100, 127], [108, 122], [104, 106]], 1.8)], // broad
  [S([[101, 102], [104, 118], [110, 122], [103, 125]], 1.8)], // hooked
];

const MOUTHS: Stroke[][] = [
  [S([[86, 140], [100, 141], [114, 140]], 2)], // level
  [S([[86, 139], [100, 144], [114, 139]], 2)], // smile
  [S([[86, 142], [100, 139], [114, 142]], 2)], // frown
  [S([[86, 139], [100, 143], [114, 139]], 2), S([[90, 141], [110, 141]], 1.2, 0.5)], // parted
];

const HAIR: Stroke[][] = [
  [S([[64, 80], [70, 60], [86, 50], [104, 47], [122, 52], [134, 64], [137, 80]], 2.2),
   ...hatch(74, 62, 126, 62, 7, 0.9)], // short crop
  [S([[64, 80], [70, 58], [90, 48], [112, 48], [130, 58], [137, 80]], 2.2),
   S([[64, 82], [58, 120], [56, 150]], 2), S([[137, 82], [143, 120], [145, 150]], 2),
   ...hatch(58, 110, 60, 145, 5, 0.1), ...hatch(140, 110, 142, 145, 5, 0.1)], // long fall
  [S([[66, 78], [74, 58], [94, 50], [112, 50], [128, 58], [136, 78]], 2.2),
   S([[62, 86], [58, 104], [62, 122], [56, 140]], 2), S([[138, 86], [142, 104], [138, 122], [144, 140]], 2),
   S([[58, 104], [64, 108]], 1.4, 0.5), S([[62, 122], [56, 126]], 1.4, 0.5),
   S([[142, 104], [136, 108]], 1.4, 0.5), S([[138, 122], [144, 126]], 1.4, 0.5)], // braids
  [S([[66, 74], [80, 64], [100, 60], [120, 64], [134, 74]], 1.4, 0.5)], // bald (scalp sheen)
  [S([[68, 74], [78, 58], [100, 52], [122, 58], [132, 74]], 2.2),
   S([[92, 52], [88, 38], [100, 30], [112, 38], [108, 52]], 2), S([[92, 44], [108, 44]], 1.4, 0.6)], // topknot
  [S([[64, 82], [66, 64], [78, 54], [90, 58], [100, 50], [110, 58], [122, 54], [134, 64], [136, 82]], 2.2),
   S([[70, 62], [76, 66]], 1.3, 0.5), S([[96, 56], [102, 60]], 1.3, 0.5), S([[124, 62], [118, 66]], 1.3, 0.5)], // curly
];

const FACIAL: Stroke[][] = [
  [], // clean
  [S([[68, 122], [70, 150], [84, 168], [100, 172], [116, 168], [130, 150], [132, 122]], 2.2),
   ...hatch(80, 150, 120, 152, 8, 0.9), S([[92, 146], [100, 150], [108, 146]], 1.6)], // full beard
  [S([[84, 136], [100, 133], [116, 136]], 2.4), S([[84, 136], [80, 140]], 1.8), S([[116, 136], [120, 140]], 1.8)], // moustache
  [S([[90, 146], [94, 158], [100, 160], [106, 158], [110, 146]], 2), ...hatch(94, 152, 106, 153, 4, 0.9)], // goatee
  [S([[64, 112], [68, 138], [78, 150]], 2), S([[136, 112], [132, 138], [122, 150]], 2),
   ...hatch(68, 128, 74, 144, 4, 0.3), ...hatch(132, 128, 126, 144, 4, -0.3)], // mutton chops
];

const HEADWEAR: Stroke[][] = [
  [], // none
  [S([[58, 92], [60, 62], [76, 44], [100, 38], [124, 44], [140, 62], [142, 92], [148, 118], [140, 112]], 2.2),
   S([[58, 92], [52, 118], [60, 112]], 2.2), ...hatch(66, 56, 132, 56, 6, 0.8)], // hood
  [S([[64, 80], [100, 70], [136, 80]], 2), S([[98, 73], [100, 69], [102, 73], [100, 76], [98, 73]], 1.6)], // circlet + gem
  [S([[46, 80], [74, 74], [100, 72], [126, 74], [154, 80]], 2.4),
   S([[70, 74], [74, 52], [100, 46], [126, 52], [130, 74]], 2.2), S([[72, 66], [128, 66]], 1.4, 0.5)], // wide brim
  [S([[62, 84], [64, 60], [82, 46], [100, 43], [118, 46], [136, 60], [138, 84]], 2.6),
   S([[100, 44], [100, 96]], 2.2), S([[62, 84], [138, 84]], 1.8)], // helm + nasal
];

const GARB: Stroke[][] = [
  [S([[52, 226], [60, 196], [82, 180], [100, 178], [118, 180], [140, 196], [148, 226]], 2.2),
   S([[86, 182], [100, 196], [114, 182]], 2)], // tunic, open collar
  [S([[48, 226], [58, 192], [82, 178], [100, 176], [118, 178], [142, 192], [152, 226]], 2.2),
   S([[62, 192], [96, 226]], 2), S([[104, 182], [110, 188], [104, 194], [98, 188], [104, 182]], 1.8)], // cloak + clasp
  [S([[50, 226], [56, 196], [74, 182], [100, 178], [126, 182], [144, 196], [150, 226]], 2.2),
   S([[56, 196], [64, 184], [86, 180]], 2.6), S([[144, 196], [136, 184], [114, 180]], 2.6),
   S([[68, 188], [70, 190]], 2.4), S([[132, 188], [130, 190]], 2.4)], // pauldrons + rivets
  [S([[54, 226], [62, 194], [84, 180], [100, 178], [116, 180], [138, 194], [146, 226]], 2.2),
   S([[84, 180], [86, 168], [100, 164], [114, 168], [116, 180]], 2), S([[100, 178], [100, 226]], 1.4, 0.5)], // high-collar robe
];

const LAYER_SETS: Record<(typeof ORDER)[number], Stroke[][]> = {
  eyes: EYES, brows: BROWS, nose: NOSES, mouth: MOUTHS,
  hair: HAIR, facial: FACIAL, headwear: HEADWEAR, garb: GARB,
};
export const LAYER_COUNTS: Record<string, number> = Object.fromEntries(
  Object.entries(LAYER_SETS).map(([k, v]) => [k, v.length]));

// race-pertinent weighting: dwarves keep their beards, elves rarely grow one
const FACIAL_WEIGHTS: Record<Race, number[]> = {
  human: [3, 2, 2, 2, 1],
  elf: [8, 0, 1, 1, 0],
  dwarf: [0, 5, 1, 1, 3],
  orc: [3, 1, 1, 2, 1],
  halfling: [5, 1, 1, 2, 1],
};
function weightedPick(seed: string, salt: number, weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = h32(seed, salt) % total;
  for (let i = 0; i < weights.length; i++) {
    roll -= weights[i]!;
    if (roll < 0) return i;
  }
  return 0;
}

export function knownRace(s: unknown): Race | null {
  if (typeof s !== 'string') return null;
  const t = s.toLowerCase();
  for (const r of RACES) if (t.includes(r)) return r;
  if (t.includes('half-orc')) return 'orc';
  if (t.includes('gnome') || t.includes('hobbit')) return 'halfling';
  return null;
}

export function defaultRecipe(seed: string, race: Race): PortraitRecipe {
  return {
    race,
    eyes: h32(seed, 21) % EYES.length,
    brows: h32(seed, 22) % BROWS.length,
    nose: h32(seed, 23) % NOSES.length,
    mouth: h32(seed, 24) % MOUTHS.length,
    hair: h32(seed, 25) % HAIR.length,
    facial: weightedPick(seed, 26, FACIAL_WEIGHTS[race]),
    headwear: h32(seed, 27) % 10 < 6 ? 0 : 1 + (h32(seed, 28) % (HEADWEAR.length - 1)),
    garb: h32(seed, 29) % GARB.length,
  };
}

export function serializeRecipe(r: PortraitRecipe): string {
  return [r.race, ...ORDER.map((k) => r[k])].join('.');
}
export function parseRecipe(s: string): PortraitRecipe | null {
  const parts = s.split('.');
  if (parts.length !== ORDER.length + 1 || !RACES.includes(parts[0] as Race)) return null;
  const r = { race: parts[0] as Race } as PortraitRecipe;
  ORDER.forEach((k, i) => { r[k] = Math.max(0, Number(parts[i + 1]) || 0) % LAYER_SETS[k].length; });
  return r;
}
export function rerollLayer(r: PortraitRecipe, key: (typeof ORDER)[number] | 'race'): PortraitRecipe {
  const next = { ...r };
  if (key === 'race') {
    next.race = RACES[(RACES.indexOf(r.race) + 1) % RACES.length]!;
    return next;
  }
  const n = LAYER_SETS[key].length;
  if (n > 1) next[key] = (r[key] + 1 + Math.floor(Math.random() * (n - 1))) % n;
  return next;
}

/** The bust, as an SVG string. jitterSeed pins the hand — same person, same
 *  sketch, forever. */
export function buildPortraitSVG(r: PortraitRecipe, jitterSeed: string): string {
  const j = jitterer(jitterSeed);
  // draw order: garb under head, features, facial hair, hair, headwear on top
  let inner = '';
  inner += renderStrokes(GARB[r.garb] ?? [], j);
  inner += renderStrokes(HEADS[r.race], j);
  inner += renderStrokes(EYES[r.eyes] ?? [], j);
  inner += renderStrokes(BROWS[r.brows] ?? [], j);
  inner += renderStrokes(NOSES[r.nose] ?? [], j);
  inner += renderStrokes(MOUTHS[r.mouth] ?? [], j);
  inner += renderStrokes(FACIAL[r.facial] ?? [], j);
  if (r.headwear !== 4) inner += renderStrokes(HAIR[r.hair] ?? [], j); // a helm swallows the hair
  inner += renderStrokes(HEADWEAR[r.headwear] ?? [], j);
  // a faint page corner-line, because it's a notebook
  const smudge = `<path d="M14,224 L34,229 L60,226" fill="none" stroke="#454a52" stroke-width="1" stroke-opacity="0.12"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" role="img">${smudge}${inner}</svg>`;
}
