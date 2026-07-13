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
type Stroke = { pts: Pt[]; w?: number; o?: number; sharp?: boolean };
const S = (pts: Pt[], w = 2.1, o = 0.85): Stroke => ({ pts, w, o });

// ---------- the pencil ----------
function jitterer(seed: string): (n: number) => number {
  let i = 0;
  return (amp: number) => ((h32(seed, i++) / 4294967295) - 0.5) * 2 * amp;
}
/** Catmull–Rom through the control points — the strokes FLOW instead of
 *  jointing (the difference between a doodle and a sketch). */
function catmull(pts: Pt[], step = 5): Pt[] {
  if (pts.length < 3) return pts;
  const out: Pt[] = [pts[0]!];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let s = 1; s <= n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}
/** Wobble a (smoothed) polyline slightly — the hand. */
function pencilPath(pts: Pt[], j: (n: number) => number, sharp = false): string {
  if (pts.length < 2) return '';
  const base = sharp ? pts : catmull(pts);
  const out: Pt[] = base.map(([x, y], i) =>
    i === 0 || i === base.length - 1 ? [x, y] : [x + j(0.7), y + j(0.7)]);
  return 'M' + out.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L');
}
function renderStrokes(strokes: Stroke[], j: (n: number) => number): string {
  let svg = '';
  for (const st of strokes) {
    const d = pencilPath(st.pts, j, st.sharp);
    if (!d) continue;
    svg += `<path d="${d}" fill="none" stroke="#454a52" stroke-width="${st.w}" stroke-opacity="${st.o}" stroke-linecap="round" stroke-linejoin="round"/>`;
    // the second pass of the pencil, slightly astray
    svg += `<path d="${d}" fill="none" stroke="#454a52" stroke-width="${(st.w ?? 2) * 0.5}" stroke-opacity="${(st.o ?? 0.85) * 0.35}" stroke-linecap="round" transform="translate(${(0.6 + j(0.4)).toFixed(2)} ${(0.45 + j(0.4)).toFixed(2)})"/>`;
  }
  return svg;
}
/** Parallel hatch strokes across a band — pencil shading. */
function hatch(x0: number, y0: number, x1: number, y1: number, n: number, tilt = -0.5, len0 = 7): Stroke[] {
  const out: Stroke[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
    const len = len0 + (i % 3) * 3;
    out.push({ pts: [[cx - len / 2, cy - len * tilt / 2], [cx + len / 2, cy + len * tilt / 2]], w: 1, o: 0.32, sharp: true });
  }
  return out;
}

// ---------- part library (face center ~(100,108), viewBox 200×240) ----------
// Eye line at y≈106 (mid-face), nose base ~128, mouth ~143, chin ~158–162.
const circ = (cx: number, cy: number, r: number): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pts;
};
const mirrorStrokes = (ss: Stroke[]): Stroke[] =>
  ss.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [200 - x, y] as Pt) }));

function headBase(temple: number, cheek: number, jawY: number, chinY: number, chinW: number): Stroke[] {
  return [
    // one flowing outline: temple → crown → temple → cheek → jaw → chin → back up
    S([[100 - temple, 96], [100 - temple - 2, 76], [100 - temple + 10, 60], [100, 53],
       [100 + temple - 10, 60], [100 + temple + 2, 76], [100 + temple, 96],
       [100 + cheek, 120], [100 + chinW + 8, jawY], [100 + chinW, chinY - 4], [100, chinY],
       [100 - chinW, chinY - 4], [100 - chinW - 8, jawY], [100 - cheek, 120], [100 - temple, 96]], 2.2),
    // neck with trapezius hint
    S([[88, chinY - 3], [88, chinY + 14], [82, chinY + 20]], 1.7),
    S([[112, chinY - 3], [112, chinY + 14], [118, chinY + 20]], 1.7),
    // form shading: side of face + under jaw
    ...hatch(100 + cheek - 8, 124, 100 + chinW + 2, jawY - 2, 3, -0.9, 6),
    ...hatch(92, chinY + 6, 108, chinY + 8, 3, 0.15, 8),
  ];
}
const earRound = (x: number): Stroke[] => [
  S([[x, 102], [x - 5, 99], [x - 7, 107], [x - 3, 115], [x + 2, 114]], 1.7),
  S([[x - 3, 105], [x - 4, 110]], 1, 0.5),
];
const earLong = (x: number, tip: number): Stroke[] => [
  S([[x, 103], [x + tip, 84], [x + tip * 0.4, 102], [x + 1, 113]], 1.7),
  S([[x + tip * 0.55, 92], [x + tip * 0.25, 102]], 1, 0.5),
];

const HEADS: Record<Race, Stroke[]> = {
  human: [...headBase(35, 35, 141, 158, 14), ...earRound(64), ...mirrorStrokes(earRound(64))],
  elf: [...headBase(32, 30, 139, 158, 10), ...earLong(66, -16), ...earLong(134, 16)],
  dwarf: [...headBase(40, 41, 142, 156, 18), ...earRound(59), ...mirrorStrokes(earRound(59)),
    S([[68, 98], [100, 94], [132, 98]], 2.6, 0.7)], // heavy brow ridge
  orc: [...headBase(36, 38, 146, 158, 20), ...earLong(63, -12), ...earLong(137, 12),
    S([[70, 97], [100, 93], [130, 97]], 3, 0.75), // brow ridge
    S([[87, 145], [84, 133], [86, 131]], 2.4), S([[113, 145], [116, 133], [114, 131]], 2.4)], // tusks
  halfling: [...headBase(33, 36, 139, 152, 15), ...earRound(63), ...mirrorStrokes(earRound(63))],
};

// one eye, mirrored: upper lid (strong), lower lid (faint), iris arc, pupil
function eyePair(open: number, lidded: boolean, irisR: number): Stroke[] {
  const one = (cx: number): Stroke[] => {
    const s: Stroke[] = [
      S([[cx - 10, 106], [cx - 4, 106 - open], [cx + 3, 106 - open], [cx + 9, 105]], 1.9), // upper lid
      S([[cx - 8, 108], [cx, 109 + open * 0.3], [cx + 8, 107]], 1, 0.4), // lower lid
    ];
    if (irisR > 0) {
      s.push(S([[cx - irisR, 105], [cx, 105 + irisR], [cx + irisR, 105]], 1.3, 0.7)); // iris arc under the lid
      s.push({ pts: [[cx - 0.6, 105.5], [cx + 0.8, 105.5]], w: 2.6, o: 0.9, sharp: true }); // pupil
    }
    if (lidded) s.push(S([[cx - 9, 102], [cx, 100.5], [cx + 8, 102]], 1, 0.45)); // crease
    return s;
  };
  return [...one(80), ...one(120)];
}
const EYES: Stroke[][] = [
  eyePair(3, false, 3.2),  // almond, steady
  eyePair(4.4, false, 4),  // wide open
  [ // narrowed — just the lids, weary or wary
    S([[70, 105.5], [80, 104], [90, 105]], 1.9), S([[110, 105], [120, 104], [130, 105.5]], 1.9),
    S([[74, 108], [86, 108]], 1, 0.35), S([[114, 108], [126, 108]], 1, 0.35),
    { pts: [[79.4, 105], [80.8, 105]], w: 2.2, o: 0.8, sharp: true }, { pts: [[119.4, 105], [120.8, 105]], w: 2.2, o: 0.8, sharp: true },
  ],
  eyePair(2.6, true, 3),   // heavy-lidded
];

const brow = (pts: Pt[], w: number): Stroke[] => [S(pts, w), S([pts[0]!, pts[1]!], w * 0.5, 0.4)];
const BROWS: Stroke[][] = [
  [...brow([[69, 96], [80, 93.5], [91, 95]], 2.3), ...brow([[109, 95], [120, 93.5], [131, 96]], 2.3)], // level
  [...brow([[69, 98], [78, 91], [91, 95]], 2.3), ...brow([[109, 95], [122, 91], [131, 98]], 2.3)],   // arched
  [...brow([[68, 96], [80, 92.5], [92, 95]], 3.4), ...brow([[108, 95], [120, 92.5], [132, 96]], 3.4)], // thick
  [...brow([[71, 92], [82, 94], [92, 98]], 2.5), ...brow([[108, 98], [118, 94], [129, 92]], 2.5)],   // stern
];

const NOSES: Stroke[][] = [
  [S([[97, 105], [96, 116], [94, 125], [98, 129], [103, 127]], 1.7), // straight
   S([[92, 128], [90, 126.5]], 1.2, 0.55), S([[106, 127.5], [108.5, 125.5]], 1.2, 0.55), // nostrils
   ...hatch(94, 114, 93, 122, 2, -0.2, 5)],
  [S([[98, 108], [97, 118], [95, 124]], 1.5), S(circ(99.5, 127, 4.4).slice(2, 8), 1.6), // button
   S([[93, 128], [91.5, 126.5]], 1.2, 0.5), S([[106, 127], [108, 125.5]], 1.2, 0.5)],
  [S([[96, 106], [94, 118], [90, 126], [96, 131], [104, 131], [110, 126], [106, 118]], 1.7), // broad
   S([[89, 128], [86.5, 126]], 1.3, 0.55), S([[111, 128], [113.5, 126]], 1.3, 0.55)],
  [S([[98, 104], [99, 110], [102, 116], [102, 122], [97, 128], [102, 130]], 1.7), // aquiline
   S([[93, 128.5], [91, 127]], 1.2, 0.55), ...hatch(96, 115, 95, 122, 2, -0.2, 5)],
];

const MOUTHS: Stroke[][] = [
  [S([[86, 142.5], [94, 141.5], [100, 143.5], [106, 141.5], [114, 142.5]], 1.9), // level, with the philtrum dip
   S([[92, 149], [100, 150.5], [108, 149]], 1.1, 0.45)],
  [S([[85, 141], [93, 142.5], [100, 144.5], [107, 142.5], [115, 141]], 1.9), // smile
   S([[92, 150], [100, 152], [108, 150]], 1.1, 0.45),
   S([[84, 139.5], [86, 142]], 1, 0.4), S([[116, 139.5], [114, 142]], 1, 0.4)],
  [S([[86, 144.5], [94, 142], [100, 141.5], [106, 142], [114, 144.5]], 1.9), // grim
   S([[94, 152.5], [106, 152.5]], 1, 0.4)],
  [S([[86, 141.5], [94, 140.5], [100, 142.5], [106, 140.5], [114, 141.5]], 1.8), // parted
   S([[89, 145.5], [100, 146.5], [111, 145.5]], 1.6, 0.7),
   S([[92, 150], [100, 151], [108, 150]], 1, 0.4)],
];

const flow = (pts: Pt[]): Stroke => S(pts, 1.2, 0.5);
const HAIR: Stroke[][] = [
  [ // short, swept back
    S([[63, 92], [59, 64], [74, 47], [100, 40], [126, 47], [141, 64], [137, 92]], 2.2),
    flow([[72, 56], [86, 46], [98, 43]]), flow([[78, 66], [94, 52], [110, 46]]),
    flow([[114, 45], [128, 53], [134, 64]]), flow([[64, 80], [66, 62]]),
  ],
  [ // long fall to the shoulders
    S([[63, 92], [58, 62], [77, 45], [100, 39], [123, 45], [142, 62], [137, 92]], 2.2),
    S([[63, 84], [56, 112], [53, 142], [56, 162]], 2), S([[137, 84], [144, 112], [147, 142], [144, 162]], 2),
    S([[65, 92], [63, 120], [62, 148]], 1.3, 0.5), S([[135, 92], [137, 120], [138, 148]], 1.3, 0.5),
    flow([[70, 58], [88, 49], [104, 47]]), flow([[58, 104], [56, 130]]), flow([[142, 104], [144, 130]]),
  ],
  [ // braids
    S([[64, 90], [61, 62], [79, 46], [100, 40], [121, 46], [139, 62], [136, 90]], 2.2),
    S([[62, 92], [58, 104], [62, 116], [57, 128], [61, 140], [58, 150]], 1.9),
    S([[138, 92], [142, 104], [138, 116], [143, 128], [139, 140], [142, 150]], 1.9),
    { pts: [[57, 150], [63, 152]], w: 1.4, o: 0.6, sharp: true }, { pts: [[137, 150], [143, 152]], w: 1.4, o: 0.6, sharp: true },
    flow([[74, 56], [92, 49]]), flow([[108, 49], [126, 56]]),
  ],
  [ // bald — the crown catches the light
    S([[68, 80], [82, 62], [100, 57], [118, 62], [132, 80]], 1.2, 0.4),
    S([[86, 66], [100, 62], [112, 65]], 1, 0.3),
  ],
  [ // topknot
    S([[64, 84], [66, 58], [86, 46], [114, 46], [134, 58], [136, 84]], 2.2),
    S([[92, 52], [90, 40], [100, 33], [110, 40], [108, 52]], 1.9),
    { pts: [[92, 46], [108, 46]], w: 1.4, o: 0.6, sharp: true },
    flow([[78, 60], [94, 51]]), flow([[106, 51], [122, 60]]), flow([[96, 40], [104, 40]]),
  ],
  [ // curly mass
    S([[61, 88], [56, 68], [68, 52], [82, 45], [92, 50], [100, 41], [108, 50], [118, 45], [132, 52], [144, 68], [139, 88]], 2.2),
    S(circ(76, 64, 4).slice(0, 6), 1.1, 0.45), S(circ(100, 55, 4.4).slice(2, 8), 1.1, 0.45),
    S(circ(124, 64, 4).slice(3, 9), 1.1, 0.45), S(circ(88, 57, 3.4).slice(1, 7), 1.1, 0.4),
  ],
];

const FACIAL: Stroke[][] = [
  [],
  [ // full beard, squared and combed
    S([[72, 126], [72, 146], [80, 162], [92, 171], [100, 173], [108, 171], [120, 162], [128, 146], [128, 126]], 2.2),
    S([[86, 143], [93, 147], [100, 145], [107, 147], [114, 143]], 1.7), // moustache over it
    flow([[82, 148], [88, 164]]), flow([[100, 150], [100, 168]]), flow([[118, 148], [112, 164]]),
    ...hatch(84, 158, 116, 160, 5, 0.9, 6),
  ],
  [ // moustache, curled
    S([[84, 143], [92, 140.5], [100, 143]], 2.2), S([[100, 143], [108, 140.5], [116, 143]], 2.2),
    S([[84, 143], [80, 140], [79, 136.5]], 1.7), S([[116, 143], [120, 140], [121, 136.5]], 1.7),
  ],
  [ // goatee + thin moustache
    S([[91, 150], [93, 162], [100, 166], [107, 162], [109, 150]], 1.9),
    flow([[97, 154], [98, 162]]), flow([[103, 154], [102, 162]]),
    S([[87, 142.5], [100, 145], [113, 142.5]], 1.5, 0.7),
  ],
  [ // mutton chops
    S([[67, 108], [66, 132], [74, 148], [84, 155]], 2), S([[133, 108], [134, 132], [126, 148], [116, 155]], 2),
    ...hatch(72, 126, 78, 144, 3, 0.3, 6), ...hatch(128, 126, 122, 144, 3, -0.3, 6),
  ],
];

const HEADWEAR: Stroke[][] = [
  [],
  [ // hood, draped
    S([[56, 96], [56, 62], [74, 44], [100, 38], [126, 44], [144, 62], [144, 96], [150, 120], [142, 114]], 2.2),
    S([[56, 96], [50, 120], [58, 114]], 2.2),
    S([[64, 76], [78, 58], [100, 51], [122, 58], [136, 76]], 1.3, 0.5), // inner rim
    ...hatch(64, 60, 88, 50, 3, 0.7, 7), ...hatch(112, 50, 136, 60, 3, -0.7, 7),
  ],
  [ // circlet with a set stone
    S([[65, 84], [82, 76], [100, 73.5], [118, 76], [135, 84]], 2),
    S(circ(100, 77, 3).slice(0, 9), 1.4, 0.8),
    { pts: [[99, 76], [101, 78]], w: 1.6, o: 0.9, sharp: true },
  ],
  [ // wide-brimmed traveller's hat
    S([[44, 82], [66, 75], [100, 71], [134, 75], [156, 82]], 2.4),
    S([[70, 74], [72, 54], [88, 45], [112, 45], [128, 54], [130, 74]], 2.2),
    S([[72, 67], [100, 63], [128, 67]], 1.5, 0.6), // band
    ...hatch(78, 52, 122, 50, 4, 0.5, 8),
  ],
  [ // helm with nasal and cheek guards
    S([[62, 88], [62, 60], [80, 45], [100, 42], [120, 45], [138, 60], [138, 88]], 2.5),
    S([[100, 43], [100, 98]], 2.1), // nasal
    S([[62, 86], [138, 86]], 1.7), // brow rim
    S([[66, 88], [64, 108], [72, 118]], 1.8), S([[134, 88], [136, 108], [128, 118]], 1.8), // cheek guards
    ...hatch(72, 56, 94, 48, 3, 0.6, 7),
  ],
];

const GARB: Stroke[][] = [
  [ // laced tunic
    S([[44, 228], [52, 200], [72, 184], [88, 178], [88, 172]], 2.2), S([[156, 228], [148, 200], [128, 184], [112, 178], [112, 172]], 2.2),
    S([[88, 178], [92, 192], [100, 198], [108, 192], [112, 178]], 1.8), // open collar
    { pts: [[95, 200], [105, 204]], w: 1.2, o: 0.6, sharp: true }, { pts: [[95, 206], [105, 210]], w: 1.2, o: 0.6, sharp: true }, // lacing
    flow([[64, 200], [60, 224]]), flow([[136, 200], [140, 224]]),
  ],
  [ // cloak, clasped at one shoulder
    S([[40, 228], [50, 196], [72, 180], [88, 175], [88, 171]], 2.3), S([[160, 228], [150, 196], [128, 180], [112, 175], [112, 171]], 2.3),
    S([[74, 182], [94, 200], [104, 228]], 2), // the drape
    S(circ(106, 184, 4.4), 1.7), { pts: [[104, 182], [108, 186]], w: 1.2, o: 0.6, sharp: true }, // clasp
    flow([[56, 202], [50, 226]]), flow([[146, 200], [152, 226]]), flow([[86, 196], [94, 222]]),
  ],
  [ // pauldrons over a gorget
    S([[46, 228], [52, 202], [66, 188], [86, 180], [88, 174]], 2.2), S([[154, 228], [148, 202], [134, 188], [114, 180], [112, 174]], 2.2),
    S([[52, 202], [58, 186], [76, 179]], 2.6), S([[56, 208], [62, 194], [80, 186]], 2), // layered left pauldron
    S([[148, 202], [142, 186], [124, 179]], 2.6), S([[144, 208], [138, 194], [120, 186]], 2),
    S([[88, 180], [100, 186], [112, 180]], 1.8), // gorget
    { pts: [[62, 190], [63.5, 191.5]], w: 2.2, o: 0.8, sharp: true }, { pts: [[138, 190], [136.5, 191.5]], w: 2.2, o: 0.8, sharp: true },
  ],
  [ // high-collared robe
    S([[48, 228], [56, 198], [78, 183], [88, 179], [88, 174]], 2.2), S([[152, 228], [144, 198], [122, 183], [112, 179], [112, 174]], 2.2),
    S([[88, 176], [89, 168], [100, 165], [111, 168], [112, 176]], 2), // collar
    S([[100, 176], [100, 226]], 1.3, 0.5),
    flow([[84, 194], [82, 224]]), flow([[116, 194], [118, 224]]),
    { pts: [[97, 184], [103, 184]], w: 1.2, o: 0.55, sharp: true }, { pts: [[97, 192], [103, 192]], w: 1.2, o: 0.55, sharp: true },
  ],
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
