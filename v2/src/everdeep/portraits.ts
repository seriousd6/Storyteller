// The portrait pack, "finished study" edition (owner: "get closer to pencil
// art than doodles", then "E is great" → F picked from the style lab).
// Every person gets a graphite bust drawn like a completed pencil portrait:
// heavy confident silhouette, thin interior plane lines, individual brow
// hairs, iris spokes with a catchlight, soft charcoal form shading, a dark
// combed hair mass, a cast shadow under the jaw and a corner vignette —
// all displaced through turbulence so no line is ruler-straight.
// Seeded and deterministic: the same person always looks the same; each
// layer rerolls independently and the recipe is stored as a compact string.

import { h32 } from './seeds.ts';

export type Race =
  | 'human' | 'elf' | 'dwarf' | 'orc' | 'halfling'
  | 'half-elf' | 'half-orc' | 'gnome' | 'goliath' | 'tiefling'
  | 'dragonborn' | 'aasimar' | 'kalashtar' | 'shifter' | 'simic'
  | 'birdfolk' | 'catfolk' | 'warforged';
export const RACES: Race[] = [
  'human', 'elf', 'dwarf', 'orc', 'halfling',
  'half-elf', 'half-orc', 'gnome', 'goliath', 'tiefling',
  'dragonborn', 'aasimar', 'kalashtar', 'shifter', 'simic',
  'birdfolk', 'catfolk', 'warforged',
];
// crests, frills, feathers, and plate replace hair on these
const HAIRLESS = new Set<Race>(['dragonborn', 'simic', 'birdfolk', 'catfolk', 'warforged']);
// beaks, muzzles, and faceplates replace the standard nose/mouth
const NO_NOSE = new Set<Race>(['birdfolk', 'catfolk', 'warforged']);
const NO_MOUTH = new Set<Race>(['birdfolk', 'catfolk', 'warforged']);
// ridges and plates instead of brow hairs
const NO_BROWS = new Set<Race>(['dragonborn', 'warforged', 'birdfolk']);
export type Sex = 'male' | 'female';
export const SEXES: Sex[] = ['male', 'female'];
export type Build = 'slim' | 'average' | 'broad' | 'stout';
export const BUILDS: Build[] = ['slim', 'average', 'broad', 'stout'];
const BUILD_W: Record<Build, number> = { slim: 0.86, average: 1, broad: 1.14, stout: 1.27 };

export interface PortraitRecipe {
  race: Race;
  sex: Sex;
  build: Build;
  eyes: number; brows: number; nose: number; mouth: number;
  hair: number; facial: number; headwear: number; garb: number;
}

// layer order in the compact string — frozen (stored in world docs).
// v2 recipes: race.sex.build.<8 indices>; v1 (9-part) recipes still parse,
// deriving sex/build deterministically from the string itself.
const ORDER = ['eyes', 'brows', 'nose', 'mouth', 'hair', 'facial', 'headwear', 'garb'] as const;
export const PORTRAIT_LAYERS: Array<{ key: (typeof ORDER)[number] | 'build'; label: string }> = [
  { key: 'hair', label: 'hair' },
  { key: 'eyes', label: 'eyes' },
  { key: 'brows', label: 'brows' },
  { key: 'nose', label: 'nose' },
  { key: 'mouth', label: 'mouth' },
  { key: 'facial', label: 'beard' },
  { key: 'headwear', label: 'hat' },
  { key: 'garb', label: 'garb' },
  { key: 'build', label: 'build' },
];

// ---------------------------------------------------------------- engine --
type Pt = [number, number];
/** A drawable pencil mark. flat = even pressure (hatching/strands);
 *  otherwise the stroke tapers like a lifted pencil. */
type SS = { pts: Pt[]; w?: number; o?: number; color?: string; flat?: boolean };
const S = (pts: Pt[], w = 1.4, o = 0.7, color?: string): SS => ({ pts, w, o, color });
const GRAPHITE = '#3a3f46';
const DARK = '#23262b';
const HAIRC = '#33383f';
const TONE = '#4a505a';

function rng(seedStr: string): () => number {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** Catmull-Rom resample: the smooth spine every ribbon is built on. */
function densify(pts: Pt[], k = 6): Pt[] {
  if (pts.length < 2) return pts;
  const out: Pt[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let j = 0; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
}

/** One pencil line as a FILLED tapered ribbon: densified spine, normal
 *  offsets scaled by a pressure profile, low-frequency wobble. */
function pencilLine(pts: Pt[], opt: { w?: number; o?: number; color?: string; rand: () => number; jitter?: number; taper?: number; flat?: boolean }): string {
  const { w = 1.4, o = 0.8, color = GRAPHITE, rand, jitter = 0.35, taper = 0.65, flat = false } = opt;
  const spine = densify(pts, 7);
  const n = spine.length;
  if (n < 3) return '';
  const ph1 = rand() * 6.28, ph2 = rand() * 6.28, f1 = 2 + rand() * 3, f2 = 5 + rand() * 4;
  const L: Pt[] = [], R: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)]!, b = spine[Math.min(n - 1, i + 1)]!;
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
    const t = i / (n - 1);
    const wob = jitter * (Math.sin(t * f1 * 3.14 + ph1) * 0.6 + Math.sin(t * f2 * 3.14 + ph2) * 0.4);
    const px = spine[i]![0] - dy * wob, py = spine[i]![1] + dx * wob;
    const prof = flat ? 0.55 + 0.45 * Math.sin(Math.PI * t) ** 0.5
      : (1 - taper) + taper * Math.sin(Math.PI * t) ** 0.55;
    const hw = (w * prof) / 2;
    L.push([px - dy * hw, py + dx * hw]);
    R.push([px + dy * hw, py - dx * hw]);
  }
  const ring = L.concat(R.reverse());
  let d = `M${ring[0]![0].toFixed(1)},${ring[0]![1].toFixed(1)}`;
  for (let i = 1; i < ring.length; i++) d += `L${ring[i]![0].toFixed(1)},${ring[i]![1].toFixed(1)}`;
  return `<path d="${d}Z" fill="${color}" fill-opacity="${o.toFixed(2)}" stroke="none"/>`;
}

/** Hatch set: count short curved strokes along guide p0→p1 at angle ang. */
function hatchSet(p0: Pt, p1: Pt, count: number, len: number, ang: number, opt: { w?: number; o?: number; rand: () => number; curve?: number; color?: string } ): SS[] {
  const { w = 1, o = 0.28, rand, curve = 2, color = TONE } = opt;
  const out: SS[] = [];
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const gx = p0[0] + (p1[0] - p0[0]) * t + (rand() - 0.5) * 1.6;
    const gy = p0[1] + (p1[1] - p0[1]) * t + (rand() - 0.5) * 1.6;
    const a = ang + (rand() - 0.5) * 0.14;
    const l = len * (0.82 + rand() * 0.36);
    const dx = Math.cos(a), dy = Math.sin(a);
    out.push({ pts: [[gx, gy], [gx + dx * l * 0.5 - dy * curve, gy + dy * l * 0.5 + dx * curve], [gx + dx * l, gy + dy * l]],
      w, o: o * (0.8 + rand() * 0.45), color, flat: true });
  }
  return out;
}

/** Strand strokes ALONG a guide lane (combed hair): random sub-segments,
 *  offset sideways; shine biases strands away from the center band. */
function laneStrokes(lane: Pt[], count: number, rand: () => number, opt: { w?: number; o?: number; spread?: number; shine?: boolean } = {}): SS[] {
  const { w = 1.05, o = 0.55, spread = 2.4, shine = false } = opt;
  const dense = densify(lane, 8);
  const out: SS[] = [];
  for (let s = 0; s < count; s++) {
    const f0 = rand() * 0.55, f1 = Math.min(1, f0 + 0.3 + rand() * 0.4);
    const i0 = Math.floor(f0 * (dense.length - 1)), i1 = Math.floor(f1 * (dense.length - 1));
    if (i1 - i0 < 4) continue;
    const off = shine ? (rand() < 0.5 ? -1 : 1) * (0.4 + 0.6 * rand()) * spread
      : (rand() - 0.5) * 2 * spread;
    const seg: Pt[] = [];
    for (let i = i0; i <= i1; i += 2) {
      const a = dense[Math.max(0, i - 1)]!, b = dense[Math.min(dense.length - 1, i + 1)]!;
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const L2 = Math.hypot(dx, dy) || 1;
      seg.push([dense[i]![0] - (dy / L2) * off, dense[i]![1] + (dx / L2) * off]);
    }
    if (seg.length >= 3) out.push({ pts: seg, w: w * (0.8 + rand() * 0.5), o: o * (0.7 + rand() * 0.6), color: HAIRC, flat: true });
  }
  return out;
}

/** Short perpendicular ticks along a lane — buzzed hair, fur, feathers. */
function laneTicks(lane: Pt[], count: number, rand: () => number, opt: { len?: number; w?: number; o?: number } = {}): SS[] {
  const { len = 2.8, w = 0.8, o = 0.45 } = opt;
  const dense = densify(lane, 6);
  const out: SS[] = [];
  for (let s = 0; s < count; s++) {
    const i = 1 + Math.floor(rand() * (dense.length - 2));
    const a = dense[i - 1]!, b = dense[Math.min(dense.length - 1, i + 1)]!;
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = Math.hypot(dx, dy) || 1; dx /= L2; dy /= L2;
    const l = len * (0.7 + rand() * 0.6);
    const p = dense[i]!;
    out.push({ pts: [[p[0], p[1]], [p[0] - dy * l * 0.5, p[1] + dx * l * 0.5], [p[0] - dy * l, p[1] + dx * l]],
      w: w * (0.8 + rand() * 0.4), o: o * (0.7 + rand() * 0.6), color: HAIRC, flat: true });
  }
  return out;
}

/** Individual eyebrow hairs along an arc (inner end first), tilted upright
 *  near the bridge the way real brows grow. */
function browHairs(arc: Pt[], count: number, rand: () => number, opt: { w?: number; o?: number; flip?: boolean } = {}): SS[] {
  const { w = 1.0, o = 0.7, flip = false } = opt;
  const dense = densify(arc, 8);
  const out: SS[] = [];
  for (let s = 0; s < count; s++) {
    const t = s / Math.max(1, count - 1);
    const i = Math.min(dense.length - 2, Math.floor(t * (dense.length - 1)));
    const a = dense[Math.max(0, i - 1)]!, b = dense[Math.min(dense.length - 1, i + 1)]!;
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const L2 = Math.hypot(dx, dy) || 1; dx /= L2; dy /= L2;
    const tilt = (flip ? 1 : -1) * (1 - t) * 0.55;
    const ca = Math.cos(tilt), sa = Math.sin(tilt);
    const hx = dx * ca - dy * sa, hy = dx * sa + dy * ca;
    const l = 2.6 + rand() * 1.6;
    const p = dense[i]!;
    out.push({ pts: [[p[0] - hx * l * 0.3, p[1] - hy * l * 0.3 + 0.9], [p[0] + hx * l * 0.7, p[1] + hy * l * 0.7 - 0.2]],
      w: w * (0.7 + rand() * 0.5), o: o * (0.65 + rand() * 0.5), color: '#2e3237' });
  }
  return out;
}

const mirror = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [200 - x, y]);
const circPts = (cx: number, cy: number, r: number, n = 12): Pt[] => {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) pts.push([cx + Math.cos((i / n) * 6.283) * r, cy + Math.sin((i / n) * 6.283) * r]);
  return pts;
};
const scaleXs = (pts: Pt[], f: number, cx = 100): Pt[] => pts.map(([x, y]) => [cx + (x - cx) * f, y]);

// ------------------------------------------------------ race parameters --
interface RaceP {
  jaw: number;          // jaw spread multiplier
  noseW: number;        // nose width multiplier
  chinY: number;
  ear: 'round' | 'point' | 'longpoint' | 'fin' | 'cat' | 'none';
  tusks: 0 | 1 | 2;     // none / small / big
  irisKind: 'round' | 'slit' | 'ring';
  irisR: number;
  browW: number;        // brow hair weight multiplier
}
const BASE_P: RaceP = { jaw: 1, noseW: 1, chinY: 150, ear: 'round', tusks: 0, irisKind: 'round', irisR: 3.3, browW: 1 };
const RACE_P: Record<Race, Partial<RaceP>> = {
  human: {},
  elf: { jaw: 0.9, ear: 'longpoint' },
  dwarf: { jaw: 1.14, noseW: 1.25, browW: 1.3 },
  orc: { jaw: 1.22, noseW: 1.6, chinY: 152, tusks: 2, browW: 1.4 },
  halfling: { jaw: 0.97, chinY: 148, irisR: 3.6 },
  'half-elf': { jaw: 0.95, ear: 'point' },
  'half-orc': { jaw: 1.12, noseW: 1.3, tusks: 1, browW: 1.2 },
  gnome: { jaw: 0.93, noseW: 1.35, irisR: 3.6, ear: 'point' },
  goliath: { jaw: 1.18, browW: 1.1 },
  tiefling: { jaw: 0.97, ear: 'point' },
  dragonborn: { jaw: 1.16, noseW: 1.5, chinY: 152, irisKind: 'slit' },
  aasimar: {},
  kalashtar: { jaw: 0.95 },
  shifter: { jaw: 1.06, ear: 'point', browW: 1.3 },
  simic: { ear: 'fin' },
  birdfolk: { jaw: 0.92, ear: 'none', irisR: 3.6 },
  catfolk: { jaw: 0.95, ear: 'cat', irisKind: 'slit' },
  warforged: { jaw: 1.1, ear: 'none', irisKind: 'ring' },
};

// ------------------------------------------------------------ the sheet --
interface FaceKit {
  tone: SS[];        // soft charcoal shading, drawn first
  contours: SS[];    // heavy silhouette lines
  features: SS[];    // thin interior lines
  darks: SS[];       // near-black accents
  brows: Array<{ arc: Pt[]; n: number; w: number; flip?: boolean }>;
  hairOutline: SS[];
  hairLanes: Array<{ lane: Pt[]; n: number; spread: number; shine?: boolean }>;
  hairTicks: { lane: Pt[]; n: number } | null;
  irises: Array<{ cx: number; cy: number }>;
  nostrils: Array<{ cx: number; cy: number; rx: number; ry: number }>;
}

function kit(): FaceKit {
  return { tone: [], contours: [], features: [], darks: [], brows: [], hairOutline: [], hairLanes: [], hairTicks: null, irises: [], nostrils: [] };
}

/** Soft charcoal form shading, light from the upper left (F style). */
function shade(g: FaceKit, rand: () => number, female: boolean, race: Race): void {
  const H = g.tone;
  H.push(...hatchSet([128, 94], [115, 137], 13, 16, -1.05, { rand, o: 0.055, w: 6.5, curve: 3.5 }));
  H.push(...hatchSet([122, 100], [111, 132], 7, 10, -1.05, { rand, o: 0.04, w: 5, curve: 2.5 }));
  H.push(...hatchSet([128, 86], [132, 94], 3, 7, -0.9, { rand, o: 0.08, w: 3 }));
  H.push(...hatchSet([77, 91], [89, 91], 4, 4.5, -0.12, { rand, o: 0.05, w: 3 }));
  H.push(...hatchSet([111, 91], [123, 91], 5, 4.5, -0.12, { rand, o: 0.07, w: 3 }));
  H.push(...hatchSet([104.5, 106], [106.5, 115], 4, 4.5, -1.3, { rand, o: 0.1, w: 3 }));
  H.push(...hatchSet([95, 124.5], [105, 124.5], 3, 3, -1.4, { rand, o: 0.09, w: 2.5 }));
  H.push(...hatchSet([94, 143.5], [106, 143.5], 4, 3.4, -1.4, { rand, o: 0.09, w: 3 }));
  H.push(...hatchSet([98, 154], [100, 162], 6, 15, 0.18, { rand, o: 0.1, w: 6, curve: 1.6 }));
  H.push(...hatchSet([100, 166], [100, 172], 3, 12, 0.14, { rand, o: 0.07, w: 4.5, curve: 1.2 }));
  H.push(...hatchSet([74, 114], [79, 128], 3, 8, -1.05, { rand, o: 0.035, w: 3.5, curve: 2 }));
  H.push(...hatchSet([118, 181], [140, 192], 6, 9, -0.85, { rand, o: 0.08, w: 4, curve: 1.5 }));
  H.push(...hatchSet([88, 183], [104, 187], 3, 7, -1.1, { rand, o: 0.06, w: 3 }));
  // cast shadow under the jaw — the F-study signature
  H.push(...hatchSet([92, 152.5], [108, 152.5], 7, 10, 0.15, { rand, o: 0.15, w: 2.4, curve: 1.4 }));
  if (!female && (race === 'human' || race === 'half-orc')) { // light stubble ghost
    H.push(...hatchSet([85, 143], [115, 143], 8, 2.1, 1.3, { rand, o: 0.07, w: 0.6 }));
  }
}

/** The head: silhouette, ears, eyes, nose, mouth — parametric per race/sex
 *  and per the seed morphs (eye spacing, nose length, mouth width). */
function buildHead(g: FaceKit, r: PortraitRecipe, m: { eyes: number; nose: number; mouth: number }): void {
  const P = { ...BASE_P, ...RACE_P[r.race] };
  const female = r.sex === 'female';
  const jawW = P.jaw * (female ? 0.94 : 1);
  const chinY = P.chinY;
  const jx = (x: number) => 100 + (x - 100) * jawW;
  const C = (pts: Pt[], w = 1.6, o = 0.8) => g.contours.push({ pts, w, o });
  const F = (pts: Pt[], w = 1.1, o = 0.6) => g.features.push({ pts, w, o });
  const D = (pts: Pt[], w = 1.6, o = 0.9) => g.darks.push({ pts, w, o, color: DARK });

  // silhouette — face sides down to the chin (hair closes the crown)
  C([[66, 80], [63, 96], [65, 111], [jx(71), 129], [jx(81), 143], [jx(91), chinY], [100, chinY + 3],
     [jx(109), chinY], [jx(119), 143], [jx(129), 129], [135, 111], [137, 96], [134, 80]], 2.3, 0.88);
  // interior plane hints — thin
  F([[121, 106], [126, 112], [127.5, 119]], 0.7, 0.3);
  F([[77, 107], [74.5, 112]], 0.6, 0.2);
  F([[jx(126), 131], [jx(122), 138]], 0.7, 0.25);
  F([[95, chinY - 6], [100, chinY - 4.5], [105, chinY - 6]], 0.7, 0.28);

  // ears
  if (P.ear === 'longpoint') {
    C([[66, 93], [58, 86], [53, 77], [57, 89], [62, 103], [67, 107]], 1.4, 0.7);
    C(mirror([[66, 93], [58, 86], [53, 77], [57, 89], [62, 103], [67, 107]]), 1.4, 0.7);
    F([[60, 88], [61, 96], [64, 102]], 0.8, 0.35);
    F(mirror([[60, 88], [61, 96], [64, 102]]), 0.8, 0.35);
  } else if (P.ear === 'point') {
    C([[66, 92], [59, 87], [57, 82], [60, 92], [62, 104], [67, 108]], 1.4, 0.7);
    C(mirror([[66, 92], [59, 87], [57, 82], [60, 92], [62, 104], [67, 108]]), 1.4, 0.7);
  } else if (P.ear === 'fin') {
    C([[66, 90], [58, 88], [54, 96], [58, 106], [66, 108]], 1.5, 0.7);
    C(mirror([[66, 90], [58, 88], [54, 96], [58, 106], [66, 108]]), 1.5, 0.7);
    F([[60, 92], [58, 98], [61, 104]], 0.7, 0.35);
    F(mirror([[60, 92], [58, 98], [61, 104]]), 0.7, 0.35);
  } else if (P.ear === 'cat') {
    // upright triangles on the crown, drawn with the hair/crest pass
    C([[74, 52], [64, 30], [88, 44]], 2.0, 0.85);
    C(mirror([[74, 52], [64, 30], [88, 44]]), 2.0, 0.85);
    F([[74, 46], [69, 34], [83, 43]], 0.9, 0.4);
    F(mirror([[74, 46], [69, 34], [83, 43]]), 0.9, 0.4);
  } else if (P.ear === 'round') {
    C([[66, 92], [61, 90], [59, 98], [62, 106], [67, 108]], 1.4, 0.7);
    C(mirror([[66, 92], [61, 90], [59, 98], [62, 106], [67, 108]]), 1.4, 0.7);
    F([[62, 95], [61.5, 100], [64, 104]], 0.8, 0.35);
    F(mirror([[62, 95], [61.5, 100], [64, 104]]), 0.8, 0.35);
  }

  // ---- eyes: 4 lid geometries, spaced by the eye morph ----
  const spread = m.eyes; // 1±7% — pushes the eyes apart or together
  const ex = (x: number, side: 1 | -1) => 100 + side * (100 - x) * -1 * spread; // reflect helper
  void ex;
  const eyeVar = r.eyes % 4;
  const lids: Record<number, { up: Pt[]; low: Pt[]; crease: Pt[] }> = {
    0: { up: [[74, 97.5], [79, 93.5], [86, 93], [91, 96.5]], low: [[76, 99.5], [82.5, 101], [90, 98.5]], crease: [[76.5, 91.5], [83, 89.5], [89.5, 91]] },
    1: { up: [[74, 97], [79, 92.5], [86, 92], [91, 96]], low: [[76, 100.5], [82.5, 102], [90, 99]], crease: [[76.5, 90.5], [83, 88.5], [89.5, 90]] },
    2: { up: [[74, 97], [80, 94.5], [87, 94], [91, 96.5]], low: [[76, 99], [82.5, 100.3], [90, 98]], crease: [[75.5, 92], [82, 90.5], [89, 91.5]] },
    3: { up: [[74.5, 97.5], [79.5, 94], [86, 93.5], [90.5, 96.5]], low: [[76.5, 99.5], [82.5, 100.8], [89.5, 98.5]], crease: [[76, 91], [83, 89], [89.5, 90.5]] },
  };
  const lid = lids[eyeVar]!;
  const sx = (pts: Pt[]) => scaleXs(pts, spread, 82.8);
  for (const side of ['L', 'R'] as const) {
    const M = side === 'L' ? (p: Pt[]) => p : mirror;
    g.darks.push({ pts: M(sx(lid.up)), w: female ? 2.1 : 1.8, o: 0.92, color: DARK });
    if (female) g.darks.push({ pts: M(sx([[74.5, 97.5], [72.3, 95.8]])), w: 1.3, o: 0.8, color: DARK });
    else F(M(sx([[74.4, 97.2], [72.8, 98]])), 0.8, 0.5);
    F(M(sx([[90.8, 97.6], [92.2, 98.3]])), 0.7, 0.4);
    F(M(sx(lid.low)), 0.7, 0.32);
    if (female) { F(M(sx([[77.5, 101], [76.8, 102.3]])), 0.7, 0.4); F(M(sx([[80.5, 101.8], [80, 103]])), 0.7, 0.35); }
    F(M(sx(lid.crease)), 0.7, eyeVar === 2 ? 0.4 : 0.28);
    const cx0 = 82.8 * 1; // iris rides the same spread
    const icx = side === 'L' ? 100 - (100 - cx0) * spread : 100 + (100 - cx0) * spread;
    g.irises.push({ cx: icx, cy: 97.3 });
  }

  // ---- brows: 4 arcs, drawn as individual hairs over a faint base ----
  if (!NO_BROWS.has(r.race)) {
    const browVar = r.brows % 4;
    const arcs: Record<number, Pt[]> = {
      0: [[93.5, 88], [90, 86.5], [80, 85.5], [72, 88.5]],
      1: [[93, 87], [86, 86.2], [79, 86.4], [72.5, 87.5]],
      2: [[93.5, 85], [86, 85.5], [79, 87], [72.5, 90]],
      3: [[94, 88], [88, 86.5], [79, 86], [71.5, 88]],
    };
    const arc = arcs[browVar]!;
    const wgt = (browVar === 3 ? 1.25 : 1) * P.browW * (female ? 0.72 : 1);
    const n = Math.round((browVar === 3 ? 14 : female ? 9 : 12) * P.browW);
    g.features.push({ pts: arc, w: 1.8 * wgt, o: 0.35 });
    g.features.push({ pts: mirror(arc), w: 1.8 * wgt, o: 0.35 });
    g.brows.push({ arc, n, w: wgt, flip: true });
    g.brows.push({ arc: mirror(arc).reverse(), n, w: wgt });
    if (P.tusks || r.race === 'shifter') F([[96, 90], [100, 88.5], [104, 90]], 1.2, 0.5);
  }

  // ---- nose (unless a beak/faceplate replaces it) ----
  if (!NO_NOSE.has(r.race)) {
    const nv = r.nose % 4;
    const nw = P.noseW * (nv === 3 ? 1.3 : nv === 1 ? 0.9 : 1);
    const nlen = m.nose * (nv === 1 ? 0.88 : nv === 2 ? 1.05 : 1);
    const ny = (y: number) => 97 + (y - 97) * nlen; // stretch from the bridge
    F([[102.5, ny(97)], [104, ny(107)], [105.5, ny(114)]], 1.0, 0.42);
    if (nv === 2) F([[102, ny(101)], [104.5, ny(105.5)]], 1.2, 0.5); // the aquiline bump
    F([[97, ny(116.5)], [100, ny(117.8)], [103, ny(116.5)]], 0.7, 0.3);
    F([[100 - 6 * nw, ny(117.5)], [100 - 7.5 * nw, ny(120.5)], [100 - 3 * nw, ny(122.3)]], 1.2, 0.6);
    F([[100 + 6 * nw, ny(117.5)], [100 + 7.5 * nw, ny(120.5)], [100 + 3 * nw, ny(122.3)]], 1.2, 0.6);
    F([[100 - 4.6 * nw, ny(119.6)], [100 - 3.2 * nw, ny(121.4)], [100 - 1.8 * nw, ny(121.2)]], 1.1, 0.7);
    F([[100 + 4.6 * nw, ny(119.6)], [100 + 3.2 * nw, ny(121.4)], [100 + 1.8 * nw, ny(121.2)]], 1.1, 0.7);
    g.nostrils.push({ cx: 100 - 3.4 * nw, cy: ny(120.8), rx: 1.05 * nw, ry: 0.7 });
    g.nostrils.push({ cx: 100 + 3.4 * nw, cy: ny(120.8), rx: 1.05 * nw, ry: 0.7 });
    F([[98.8, 125], [99, 128]], 0.6, 0.22); F([[101.2, 125], [101, 128]], 0.6, 0.22);
    if (r.race === 'dragonborn') { // muzzle read: doubled bridge
      F([[96, 99], [95, 113]], 0.8, 0.3); F([[104, 99], [105, 113]], 0.8, 0.3);
    }
  }

  // ---- mouth ----
  if (!NO_MOUTH.has(r.race)) {
    const mv = r.mouth % 4;
    const mw = (P.tusks === 2 ? 15 : 13) * m.mouth * (mv === 3 ? 1.15 : 1);
    const lift = mv === 1 ? -1.6 : 0;
    g.darks.push({ pts: [[100 - mw, 133 + lift], [100 - mw * 0.45, 134.6], [100, 134], [100 + mw * 0.45, 134.6], [100 + mw, 133 + lift]], w: 1.4, o: 0.85, color: DARK });
    g.darks.push({ pts: [[100 - mw - 0.3, 132.8 + lift], [100 - mw + 1.3, 133.9]], w: 1.3, o: 0.7, color: DARK });
    g.darks.push({ pts: [[100 + mw + 0.3, 132.8 + lift], [100 + mw - 1.3, 133.9]], w: 1.3, o: 0.7, color: DARK });
    F([[100 - mw + 1, 130.4], [100 - 5, 128.8], [100, 130], [100 + 5, 128.8], [100 + mw - 1, 130.4]], 0.8, 0.35);
    const full = mv === 2 || female;
    F([[100 - mw * 0.75, 138.5], [100, full ? 141 : mv === 3 ? 139 : 140], [100 + mw * 0.75, 138.5]], 1.1, full ? 0.42 : 0.3);
    if (P.tusks === 2) {
      C([[100 - mw - 0.5, 135.5], [100 - mw - 4.5, 129], [100 - mw - 3.5, 120.5]], 3.2, 0.9);
      C([[100 + mw + 0.5, 135.5], [100 + mw + 4.5, 129], [100 + mw + 3.5, 120.5]], 3.2, 0.9);
    } else if (P.tusks === 1) {
      C([[100 - mw + 0.5, 135], [100 - mw - 2.5, 130], [100 - mw - 2, 126]], 2.2, 0.85);
      C([[100 + mw - 0.5, 135], [100 + mw + 2.5, 130], [100 + mw + 2, 126]], 2.2, 0.85);
    }
    if (r.race === 'shifter') { // small fangs under the seam
      g.darks.push({ pts: [[93, 134.5], [92.2, 137.5]], w: 1.2, o: 0.7, color: DARK });
      g.darks.push({ pts: [[107, 134.5], [107.8, 137.5]], w: 1.2, o: 0.7, color: DARK });
    }
  }

  // ---- neck ----
  C([[88, chinY + 2], [87, 165], [86, 176]], 1.5, 0.7);
  C([[112, chinY + 2], [113, 165], [114, 176]], 1.5, 0.7);
}

// ---- race-specific extras drawn on top of the head ----
function raceExtras(g: FaceKit, r: PortraitRecipe, rand: () => number): void {
  const F = (pts: Pt[], w = 1.1, o = 0.6) => g.features.push({ pts, w, o });
  const C = (pts: Pt[], w = 1.6, o = 0.8) => g.contours.push({ pts, w, o });
  switch (r.race) {
    case 'tiefling':
      C([[78, 54], [70, 42], [66, 28], [74, 38], [80, 50]], 2.6, 0.85);
      C(mirror([[78, 54], [70, 42], [66, 28], [74, 38], [80, 50]]), 2.6, 0.85);
      F([[72, 42], [70, 34]], 0.8, 0.35); F(mirror([[72, 42], [70, 34]]), 0.8, 0.35);
      break;
    case 'aasimar':
      F([[88, 34], [85, 24]], 1.0, 0.32); F([[100, 31], [100, 20]], 1.0, 0.35); F([[112, 34], [115, 24]], 1.0, 0.32);
      break;
    case 'kalashtar':
      F(circPts(100, 74, 2.6).slice(0, 10), 0.9, 0.5);
      F([[100, 68], [100, 71]], 0.8, 0.35);
      break;
    case 'goliath':
      F([[78, 70], [86, 66]], 1.2, 0.3); F([[118, 64], [128, 70]], 1.2, 0.3);
      F([[70, 102], [76, 108]], 1.1, 0.28); F([[124, 118], [130, 112]], 1.1, 0.25);
      break;
    case 'shifter':
      g.tone.push(...hatchSet([68, 108], [74, 132], 7, 5, 1.2, { rand, o: 0.2, w: 0.9 }));
      g.tone.push(...hatchSet([132, 108], [126, 132], 7, 5, 1.9, { rand, o: 0.2, w: 0.9 }));
      break;
    case 'simic':
      F([[84, 156], [82, 162]], 1.0, 0.4); F([[87, 158], [85, 164]], 1.0, 0.35);
      F([[116, 156], [118, 162]], 1.0, 0.4); F([[113, 158], [115, 164]], 1.0, 0.35);
      break;
    case 'dragonborn': {
      // brow ridges + scale patches
      C([[70, 90], [82, 86], [93, 89]], 2.4, 0.7);
      C(mirror([[70, 90], [82, 86], [93, 89]]), 2.4, 0.7);
      for (const [px, py] of [[72, 104], [126, 100], [80, 70]] as Pt[]) {
        g.tone.push(...laneTicks([[px, py], [px + 10, py + 4]], 8, rand, { len: 2.2, w: 0.7, o: 0.3 }));
      }
      break;
    }
    case 'birdfolk': {
      // the beak replaces nose and mouth
      C([[90, 104], [96, 99], [104, 99], [110, 104], [104, 126], [100, 131], [96, 126], [90, 104]], 2.2, 0.85);
      F([[100, 101], [100, 126]], 0.9, 0.4);
      F([[92, 106], [97, 109], [103, 109], [108, 106]], 0.8, 0.35); // cere line
      g.nostrils.push({ cx: 96.5, cy: 104.5, rx: 0.8, ry: 1.1 });
      g.nostrils.push({ cx: 103.5, cy: 104.5, rx: 0.8, ry: 1.1 });
      g.tone.push(...laneTicks([[70, 108], [78, 122]], 7, rand, { len: 2.6, w: 0.7, o: 0.3 }));
      g.tone.push(...laneTicks([[130, 108], [122, 122]], 7, rand, { len: 2.6, w: 0.7, o: 0.3 }));
      break;
    }
    case 'catfolk': {
      // muzzle: leather nose, split lip, whiskers
      C([[96, 114], [100, 112], [104, 114], [100, 119], [96, 114]], 1.6, 0.8);
      F([[100, 119], [100, 126]], 1.0, 0.5);
      F([[100, 126], [93, 129], [88, 127]], 1.2, 0.6);
      F([[100, 126], [107, 129], [112, 127]], 1.2, 0.6);
      for (const wy of [118, 122, 126]) {
        F([[88, wy], [70, wy - 3 + (wy - 118) * 0.8]], 0.6, 0.3);
        F([[112, wy], [130, wy - 3 + (wy - 118) * 0.8]], 0.6, 0.3);
      }
      g.tone.push(...laneTicks([[68, 100], [74, 128]], 9, rand, { len: 2.4, w: 0.7, o: 0.32 }));
      g.tone.push(...laneTicks([[132, 100], [126, 128]], 9, rand, { len: 2.4, w: 0.7, o: 0.32 }));
      break;
    }
    case 'warforged': {
      // faceplate: brow bar, cheek seams, rivets, vent, mouth slit
      C([[71, 88], [100, 86.5], [129, 88]], 2.2, 0.7);
      F([[68, 96], [72, 116]], 0.9, 0.4); F([[132, 96], [128, 116]], 0.9, 0.4);
      F([[70, 120], [100, 124], [130, 120]], 0.9, 0.35);
      F([[94, 112], [94, 119]], 1.1, 0.5); F([[100, 113], [100, 120]], 1.1, 0.5); F([[106, 112], [106, 119]], 1.1, 0.5);
      g.darks.push({ pts: [[86, 134], [100, 135.2], [114, 134]], w: 1.5, o: 0.75, color: DARK });
      for (const [rx, ry] of [[70, 92], [130, 92], [74, 124], [126, 124]] as Pt[]) {
        g.features.push({ pts: circPts(rx, ry, 1.1, 8), w: 0.7, o: 0.5 });
      }
      break;
    }
    default: break;
  }
}

// ---- hair: 9 styles (index 3 = bald); hairless races get crests instead --
function hairFor(g: FaceKit, r: PortraitRecipe, rand: () => number): void {
  const female = r.sex === 'female';
  const HO = (pts: Pt[], w = 2.3, o = 0.85) => g.hairOutline.push({ pts, w, o, color: HAIRC });
  const HL = (lane: Pt[], n: number, spread: number, shine = false) => g.hairLanes.push({ lane, n, spread, shine });

  if (HAIRLESS.has(r.race)) { // crest variants ride the hair index
    const v = r.hair % 3;
    if (r.race === 'dragonborn') {
      if (v === 0) { // back-swept spikes
        HO([[70, 66], [78, 50], [92, 42], [108, 42], [122, 50], [130, 66]], 2.2);
        g.contours.push({ pts: [[86, 46], [80, 32], [90, 43]], w: 2.4, o: 0.85 });
        g.contours.push({ pts: [[98, 43], [98, 27], [104, 42]], w: 2.4, o: 0.85 });
        g.contours.push({ pts: [[112, 45], [120, 32], [116, 47]], w: 2.4, o: 0.85 });
      } else if (v === 1) { // frill fan
        HO([[70, 68], [76, 50], [100, 42], [124, 50], [130, 68]], 2.2);
        g.features.push({ pts: [[80, 52], [74, 38]], w: 1.2, o: 0.5 });
        g.features.push({ pts: [[100, 44], [100, 30]], w: 1.2, o: 0.55 });
        g.features.push({ pts: [[120, 52], [126, 38]], w: 1.2, o: 0.5 });
        g.features.push({ pts: [[74, 38], [100, 30], [126, 38]], w: 1.1, o: 0.45 });
      } else { // smooth dome + center ridge
        HO([[68, 70], [76, 52], [100, 44], [124, 52], [132, 70]], 2.2);
        g.features.push({ pts: [[100, 44], [100, 62]], w: 1.3, o: 0.45 });
      }
    } else if (r.race === 'birdfolk') {
      if (v === 0) { // feather crest up
        HO([[68, 70], [78, 52], [100, 45], [122, 52], [132, 70]], 2.2);
        for (const [x, y] of [[84, 48], [94, 44], [106, 44], [116, 48]] as Pt[]) {
          g.contours.push({ pts: [[x, y], [x - 3, y - 16], [x + 2, y - 4]], w: 1.8, o: 0.75 });
        }
      } else if (v === 1) { // slicked back
        HO([[66, 72], [76, 52], [100, 44], [124, 52], [134, 72]], 2.2);
        HL([[70, 66], [84, 52], [100, 48], [116, 52], [130, 66]], 10, 2);
      } else { // neck ruff
        HO([[68, 70], [78, 52], [100, 45], [122, 52], [132, 70]], 2.2);
        g.tone.push(...laneTicks([[80, 148], [100, 154], [120, 148]], 12, rand, { len: 3.2, w: 0.9, o: 0.4 }));
      }
    } else if (r.race === 'catfolk') {
      HO([[68, 70], [78, 52], [100, 45], [122, 52], [132, 70]], 2.2);
      if (v === 0) { g.tone.push(...laneTicks([[70, 64], [100, 50], [130, 64]], 14, rand, { len: 2.4, w: 0.7, o: 0.4 })); }
      else if (v === 1) { g.tone.push(...laneTicks([[72, 130], [86, 146], [114, 146], [128, 130]], 14, rand, { len: 3, w: 0.8, o: 0.38 })); }
    } else if (r.race === 'warforged') {
      HO([[68, 72], [76, 52], [100, 44], [124, 52], [132, 72]], 2.3);
      if (v === 0) { g.features.push({ pts: [[76, 58], [100, 50], [124, 58]], w: 0.9, o: 0.4 }); }
      else if (v === 1) { g.contours.push({ pts: [[96, 46], [96, 30], [104, 30], [104, 46]], w: 1.9, o: 0.8 }); g.features.push({ pts: [[100, 32], [100, 44]], w: 0.8, o: 0.4 }); }
      else { for (const rx of [80, 90, 100, 110, 120]) g.features.push({ pts: circPts(rx, 54, 1, 8), w: 0.7, o: 0.5 }); }
    } else { // simic
      HO([[68, 70], [78, 52], [100, 45], [122, 52], [132, 70]], 2.2);
      if (v === 0) { g.features.push({ pts: [[100, 46], [100, 60]], w: 1.1, o: 0.35 }); }
      else if (v === 1) { HL([[80, 52], [72, 76], [70, 96]], 5, 2.2); HL([[120, 52], [128, 76], [130, 96]], 5, 2.2); }
      else { g.contours.push({ pts: [[92, 48], [100, 34], [108, 48]], w: 2, o: 0.75 }); g.features.push({ pts: [[100, 37], [100, 47]], w: 0.9, o: 0.4 }); }
    }
    return;
  }

  const style = r.hair % 9;
  const crownLanes = () => {
    HL([[68, 71], [80, 62], [100, 58.5], [120, 62], [132, 71]], 15, 2.2);
    HL([[66, 66], [80, 54], [100, 50.5], [120, 54], [134, 66]], 14, 2.6);
    HL([[65, 62], [82, 48.5], [100, 45], [118, 48.5], [135, 62]], 11, 2.2);
  };
  const partLanes = () => {
    g.hairOutline.push({ pts: [[67, 75], [82, 64.5], [100, 62], [118, 64.5], [133, 75]], w: 1.1, o: 0.42, color: HAIRC });
    HL([[66, 77], [82, 66], [100, 63.5], [118, 66], [134, 77]], 12, 2.4);
    HL([[97, 44], [86, 50], [74, 60], [65, 74], [64, 80]], 11, 2.6);
    HL([[97, 45], [90, 54], [79, 66], [70, 77]], 9, 2.4);
    HL([[99, 44], [110, 50], [122, 60], [131, 73], [136, 80]], 11, 2.6);
    HL([[99, 45], [106, 54], [117, 66], [126, 77]], 9, 2.4);
  };
  switch (style) {
    case 0: // short, combed
      HO([[64, 82], [61, 61], [74, 47], [100, 41], [126, 47], [139, 61], [136, 82]]);
      g.hairOutline.push({ pts: [[67, 73], [79, 63.5], [100, 60], [121, 63.5], [133, 73]], w: 1.2, o: 0.55, color: HAIRC });
      crownLanes();
      break;
    case 1: // long, center part
      HO([[64, 82], [60, 60], [76, 46], [100, 40], [124, 46], [140, 60], [136, 82]]);
      HO([[64, 80], [56, 108], [52, 140], [55, 166], [61, 180]], 2.1);
      HO([[136, 80], [144, 108], [148, 140], [145, 166], [139, 180]], 2.1);
      partLanes();
      HL([[63, 86], [57, 110], [54, 140], [57, 164]], 9, 3.2, true);
      HL([[137, 86], [143, 110], [146, 140], [143, 164]], 9, 3.2, true);
      HL([[66, 92], [61, 118], [59, 148]], 4, 2.2);
      HL([[134, 92], [139, 118], [141, 148]], 4, 2.2);
      break;
    case 2: // side braids
      HO([[64, 84], [61, 62], [78, 47], [100, 41], [122, 47], [139, 62], [136, 84]]);
      HO([[62, 88], [58, 102], [63, 116], [57, 130], [62, 144], [58, 156]], 2.0);
      HO([[138, 88], [142, 102], [137, 116], [143, 130], [138, 144], [142, 156]], 2.0);
      g.darks.push({ pts: [[57, 156], [63, 158]], w: 1.4, o: 0.6, color: DARK });
      g.darks.push({ pts: [[137, 156], [143, 158]], w: 1.4, o: 0.6, color: DARK });
      crownLanes();
      g.tone.push(...laneTicks([[60, 92], [60, 150]], 10, rand, { len: 3.4, w: 0.8, o: 0.4 }));
      g.tone.push(...laneTicks([[140, 92], [140, 150]], 10, rand, { len: 3.4, w: 0.8, o: 0.4 }));
      break;
    case 3: // bald — the skull IS the silhouette, the crown catches the light
      g.contours.push({ pts: [[66, 80], [70, 57], [84, 45], [100, 42], [116, 45], [130, 57], [134, 80]], w: 2.3, o: 0.85 });
      g.hairOutline.push({ pts: [[68, 78], [84, 60], [100, 55], [116, 60], [132, 78]], w: 1.1, o: 0.4, color: HAIRC });
      g.hairOutline.push({ pts: [[86, 64], [100, 60], [112, 63]], w: 0.9, o: 0.28, color: HAIRC });
      g.tone.push(...laneTicks([[64, 84], [68, 90]], 4, rand, { len: 2, w: 0.7, o: 0.35 }));
      g.tone.push(...laneTicks([[136, 84], [132, 90]], 4, rand, { len: 2, w: 0.7, o: 0.35 }));
      break;
    case 4: // topknot
      HO([[64, 84], [66, 58], [86, 46], [114, 46], [134, 58], [136, 84]]);
      HO([[92, 50], [90, 38], [100, 32], [110, 38], [108, 50]], 2.0);
      g.darks.push({ pts: [[92, 46], [108, 46]], w: 1.4, o: 0.6, color: DARK });
      HL([[70, 72], [84, 56], [97, 47]], 8, 2.2);
      HL([[130, 72], [116, 56], [103, 47]], 8, 2.2);
      HL([[68, 78], [88, 62], [100, 56]], 7, 2.2);
      break;
    case 5: { // curly mass
      HO([[61, 86], [55, 66], [68, 50], [84, 42], [100, 44], [116, 42], [132, 50], [145, 66], [139, 86]]);
      for (let i = 0; i < 8; i++) {
        const cx = 70 + rand() * 60, cy = 50 + rand() * 22, cr = 3 + rand() * 2.4;
        g.hairLanes.push({ lane: circPts(cx, cy, cr, 8).slice(0, 7), n: 2, spread: 1 });
      }
      HL([[64, 76], [80, 58], [100, 52], [120, 58], [136, 76]], 10, 3);
      break;
    }
    case 6: // high ponytail
      HO([[64, 82], [61, 62], [78, 48], [100, 42], [122, 48], [139, 62], [136, 82]]);
      HO([[126, 52], [140, 58], [148, 80], [150, 112], [143, 136]], 2.2);
      g.darks.push({ pts: [[128, 50], [136, 58]], w: 1.5, o: 0.65, color: DARK });
      g.hairOutline.push({ pts: [[67, 73], [80, 63], [100, 60], [120, 63], [133, 73]], w: 1.2, o: 0.5, color: HAIRC });
      crownLanes();
      HL([[132, 56], [144, 76], [146, 104], [141, 130]], 6, 2.2);
      break;
    case 7: // crown braid
      HO([[64, 88], [62, 66], [78, 50], [100, 44], [122, 50], [138, 66], [136, 88]]);
      g.hairOutline.push({ pts: [[66, 72], [78, 62], [92, 57], [108, 57], [122, 62], [134, 72]], w: 1.9, o: 0.7, color: HAIRC });
      for (const t of [0.12, 0.3, 0.5, 0.7, 0.88]) {
        const bx = 66 + t * 68, by = 72 - Math.sin(t * Math.PI) * 15;
        g.features.push({ pts: circPts(bx, by, 2.6, 8).slice(0, 6), w: 1.0, o: 0.5 });
      }
      HL([[68, 66], [84, 54], [100, 50], [116, 54], [132, 66]], 9, 2);
      break;
    default: // 8: shoulder waves
      HO([[63, 90], [59, 64], [77, 47], [100, 41], [123, 47], [141, 64], [137, 90]]);
      HO([[61, 90], [52, 108], [58, 128], [50, 148], [56, 164]], 2.1);
      HO([[139, 90], [148, 108], [142, 128], [150, 148], [144, 164]], 2.1);
      g.hairOutline.push({ pts: [[64, 96], [58, 116], [63, 136], [57, 154]], w: 1.2, o: 0.5, color: HAIRC });
      g.hairOutline.push({ pts: [[136, 96], [142, 116], [137, 136], [143, 154]], w: 1.2, o: 0.5, color: HAIRC });
      partLanes();
      HL([[62, 96], [55, 118], [60, 140], [54, 158]], 7, 3, true);
      HL([[138, 96], [145, 118], [140, 140], [146, 158]], 7, 3, true);
      break;
  }
  void female;
}

// ---- facial hair: 0 none, 1 full beard, 2 mustache, 3 goatee, 4 stubble --
function facialFor(g: FaceKit, idx: number, rand: () => number): void {
  switch (idx % 5) {
    case 1: // full beard
      g.contours.push({ pts: [[68, 118], [70, 142], [80, 158], [100, 165], [120, 158], [130, 142], [132, 118]], w: 2.2, o: 0.8, color: HAIRC });
      g.hairLanes.push({ lane: [[74, 130], [84, 150], [100, 158]], n: 8, spread: 2.6 });
      g.hairLanes.push({ lane: [[126, 130], [116, 150], [100, 158]], n: 8, spread: 2.6 });
      g.hairOutline.push({ pts: [[88, 130], [100, 132], [112, 130]], w: 2.0, o: 0.7, color: HAIRC });
      break;
    case 2: // mustache
      g.hairOutline.push({ pts: [[86, 131.5], [93, 128.8], [100, 130.8]], w: 2.3, o: 0.8, color: HAIRC });
      g.hairOutline.push({ pts: [[100, 130.8], [107, 128.8], [114, 131.5]], w: 2.3, o: 0.8, color: HAIRC });
      g.hairOutline.push({ pts: [[86, 131.5], [84, 134.5]], w: 1.4, o: 0.6, color: HAIRC });
      g.hairOutline.push({ pts: [[114, 131.5], [116, 134.5]], w: 1.4, o: 0.6, color: HAIRC });
      break;
    case 3: // goatee
      g.contours.push({ pts: [[92, 141], [93, 154], [100, 158], [107, 154], [108, 141]], w: 1.7, o: 0.65, color: HAIRC });
      g.tone.push(...laneTicks([[95, 146], [100, 154], [105, 146]], 8, rand, { len: 2.6, w: 0.8, o: 0.45 }));
      g.hairOutline.push({ pts: [[88, 131], [94, 129], [100, 130.5], [106, 129], [112, 131]], w: 1.9, o: 0.7, color: HAIRC });
      break;
    case 4: // hard stubble
      g.tone.push(...hatchSet([82, 140], [118, 140], 10, 2.2, 1.3, { rand, o: 0.16, w: 0.7, color: HAIRC }));
      g.tone.push(...hatchSet([87, 148], [113, 148], 7, 2.0, 1.25, { rand, o: 0.15, w: 0.7, color: HAIRC }));
      g.tone.push(...hatchSet([90, 130], [110, 130], 5, 1.8, 1.35, { rand, o: 0.12, w: 0.6, color: HAIRC }));
      break;
    default: break;
  }
}

// ---- headwear (0 none … 4 helm hides hair) — inherited stroke sets ----
const shadeStroke = (pts: Pt[], w: number, o: number): SS => ({ pts, w, o, color: TONE, flat: true });
const HEADWEAR: SS[][] = [
  [],
  [ // hood, draped
    S([[56, 96], [56, 62], [74, 44], [100, 38], [126, 44], [144, 62], [144, 96], [150, 120], [142, 114]], 2.3, 0.85),
    S([[56, 96], [50, 120], [58, 114]], 2.3, 0.85),
    S([[64, 76], [78, 58], [100, 51], [122, 58], [136, 76]], 1.2, 0.5),
    shadeStroke([[60, 70], [70, 54], [84, 45]], 4.5, 0.14), // cloth shadow inside
    shadeStroke([[128, 50], [138, 60], [141, 74]], 4, 0.12),
    shadeStroke([[58, 84], [57, 94]], 3.5, 0.12),
  ],
  [ // circlet with a set stone
    S([[65, 84], [82, 76], [100, 73.5], [118, 76], [135, 84]], 2, 0.8),
    S(circPts(100, 77, 3, 9), 1.3, 0.75),
    S([[68, 82], [84, 74.8]], 0.8, 0.35), // metal glint line
  ],
  [ // wide-brimmed traveller's hat
    S([[44, 82], [66, 75], [100, 71], [134, 75], [156, 82]], 2.5, 0.85),
    S([[70, 74], [72, 54], [88, 45], [112, 45], [128, 54], [130, 74]], 2.3, 0.85),
    S([[72, 67], [100, 63], [128, 67]], 1.4, 0.55),
    shadeStroke([[78, 56], [96, 48], [116, 49]], 5, 0.13), // crown shade
    shadeStroke([[46, 80], [70, 74]], 3, 0.12), // under-brim
    shadeStroke([[130, 74], [154, 80]], 3, 0.14),
  ],
  [ // helm: a real dome ABOVE the skull, riveted rim band, nasal from the rim
    S([[58, 88], [58, 58], [76, 40], [100, 36], [124, 40], [142, 58], [142, 88]], 2.7, 0.9),
    S([[100, 37], [100, 58]], 1.6, 0.5), // forged center ridge, crown only
    S([[58, 86], [100, 82], [142, 86]], 2.2, 0.85), // rim band
    S([[58, 92], [100, 88], [142, 92]], 2.0, 0.8),
    S(circPts(72, 87.5, 1.1, 8), 0.8, 0.6), S(circPts(100, 85, 1.1, 8), 0.8, 0.6), S(circPts(128, 87.5, 1.1, 8), 0.8, 0.6), // rivets
    S([[100, 90], [100, 106]], 2.4, 0.85), // nasal bar, band → bridge
    S([[62, 93], [58, 110], [68, 122]], 2.2, 0.8), S([[138, 93], [142, 110], [132, 122]], 2.2, 0.8), // cheek guards
    S([[65, 96], [62, 108], [70, 118]], 1.0, 0.4), S([[135, 96], [138, 108], [130, 118]], 1.0, 0.4),
    shadeStroke([[114, 44], [130, 52], [138, 66]], 5.5, 0.16), // dome shadow side
    shadeStroke([[124, 56], [134, 68], [136, 80]], 4, 0.12),
    shadeStroke([[70, 48], [84, 41]], 3, 0.08), // brushed highlight
    shadeStroke([[62, 90], [100, 85.5], [138, 90]], 3, 0.14), // band underside
  ],
];

// ---- garb (scaled by build) — inherited stroke sets, silhouette weight --
const GARB: SS[][] = [
  [ // laced tunic
    S([[44, 228], [52, 200], [72, 184], [88, 178], [88, 172]], 2.3, 0.85), S([[156, 228], [148, 200], [128, 184], [112, 178], [112, 172]], 2.3, 0.85),
    S([[88, 178], [92, 192], [100, 198], [108, 192], [112, 178]], 1.7, 0.7),
    S([[95, 200], [105, 204]], 1.1, 0.5), S([[95, 206], [105, 210]], 1.1, 0.5),
    S([[64, 200], [60, 224]], 0.9, 0.3), S([[136, 200], [140, 224]], 0.9, 0.3),
  ],
  [ // cloak, clasped at one shoulder
    S([[40, 228], [50, 196], [72, 180], [88, 175], [88, 171]], 2.4, 0.85), S([[160, 228], [150, 196], [128, 180], [112, 175], [112, 171]], 2.4, 0.85),
    S([[74, 182], [94, 200], [104, 228]], 2, 0.75),
    S(circPts(106, 184, 4.4), 1.6, 0.75),
    S([[56, 202], [50, 226]], 0.9, 0.3), S([[146, 200], [152, 226]], 0.9, 0.3), S([[86, 196], [94, 222]], 0.9, 0.3),
  ],
  [ // pauldrons over a gorget
    S([[46, 228], [52, 202], [66, 188], [86, 180], [88, 174]], 2.3, 0.85), S([[154, 228], [148, 202], [134, 188], [114, 180], [112, 174]], 2.3, 0.85),
    S([[52, 202], [58, 186], [76, 179]], 2.6, 0.85), S([[56, 208], [62, 194], [80, 186]], 2, 0.75),
    S([[148, 202], [142, 186], [124, 179]], 2.6, 0.85), S([[144, 208], [138, 194], [120, 186]], 2, 0.75),
    S([[88, 180], [100, 186], [112, 180]], 1.8, 0.7),
  ],
  [ // high-collared robe
    S([[48, 228], [56, 198], [78, 183], [88, 179], [88, 174]], 2.3, 0.85), S([[152, 228], [144, 198], [122, 183], [112, 179], [112, 174]], 2.3, 0.85),
    S([[88, 176], [89, 168], [100, 165], [111, 168], [112, 176]], 2, 0.75),
    S([[100, 176], [100, 226]], 1.2, 0.45),
    S([[84, 194], [82, 224]], 0.9, 0.3), S([[116, 194], [118, 224]], 0.9, 0.3),
    S([[97, 184], [103, 184]], 1.1, 0.45), S([[97, 192], [103, 192]], 1.1, 0.45),
  ],
  [ // gown with a shawl
    S([[46, 228], [54, 198], [76, 184], [88, 179], [88, 173]], 2.3, 0.85), S([[154, 228], [146, 198], [124, 184], [112, 179], [112, 173]], 2.3, 0.85),
    S([[86, 181], [92, 190], [100, 193], [108, 190], [114, 181]], 1.7, 0.7),
    S([[64, 190], [84, 202], [100, 206], [116, 202], [136, 190]], 1.5, 0.6),
    S([[70, 196], [66, 222]], 0.9, 0.3), S([[130, 196], [134, 222]], 0.9, 0.3), S([[100, 208], [100, 226]], 0.9, 0.3),
    S(circPts(100, 198, 1.6, 8), 1.6, 0.7),
  ],
];

const LAYER_COUNT_SRC: Record<(typeof ORDER)[number], number> = {
  eyes: 4, brows: 4, nose: 4, mouth: 4, hair: 9, facial: 5, headwear: HEADWEAR.length, garb: GARB.length,
};
export const LAYER_COUNTS: Record<string, number> = { ...LAYER_COUNT_SRC };

// race-pertinent weighting: dwarves keep their beards, elves rarely grow one
const FACIAL_WEIGHTS: Record<Race, number[]> = {
  human: [3, 2, 2, 2, 1],
  elf: [8, 0, 1, 1, 0],
  dwarf: [0, 5, 1, 1, 3],
  orc: [3, 1, 1, 2, 1],
  halfling: [5, 1, 1, 2, 1],
  'half-elf': [4, 1, 1, 2, 0],
  'half-orc': [3, 1, 1, 2, 1],
  gnome: [2, 3, 2, 2, 1],
  goliath: [4, 0, 1, 1, 2],
  tiefling: [3, 1, 2, 3, 0],
  dragonborn: [1, 0, 0, 0, 0],
  aasimar: [4, 1, 1, 1, 0],
  kalashtar: [5, 0, 1, 1, 0],
  shifter: [1, 2, 1, 1, 4],
  simic: [6, 0, 1, 1, 0],
  birdfolk: [1, 0, 0, 0, 0],
  catfolk: [1, 0, 0, 0, 0],
  warforged: [1, 0, 0, 0, 0],
};
// some races keep little on top
const HAIR_WEIGHTS: Partial<Record<Race, number[]>> = {
  goliath: [1, 0, 0, 8, 1, 0, 0, 0, 0],
  dwarf: [3, 2, 3, 1, 2, 1, 1, 1, 1],
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

// longest names first — 'half-elf' must win before 'elf' does
const RACE_ALIASES: Array<[string, Race]> = [
  ['half-elf', 'half-elf'], ['half elf', 'half-elf'],
  ['half-orc', 'half-orc'], ['half orc', 'half-orc'],
  ['high-elf', 'elf'], ['high elf', 'elf'], ['wood-elf', 'elf'], ['wood elf', 'elf'], ['drow', 'elf'],
  ['dragonborn', 'dragonborn'], ['goliath', 'goliath'], ['gnome', 'gnome'],
  ['tiefling', 'tiefling'], ['aasimar', 'aasimar'], ['kalashtar', 'kalashtar'],
  ['shifter', 'shifter'], ['simic', 'simic'],
  ['aarakocra', 'birdfolk'], ['kenku', 'birdfolk'], ['tabaxi', 'catfolk'], ['warforged', 'warforged'],
  ['bugbear', 'orc'], ['hobgoblin', 'orc'], ['goblin', 'orc'],
  ['changeling', 'human'], ['genasi', 'human'],
  ['lizardfolk', 'dragonborn'], ['kobold', 'dragonborn'], ['tortle', 'dragonborn'],
  ['yuan-ti', 'dragonborn'], ['yuan ti', 'dragonborn'],
  ['halfling', 'halfling'], ['hobbit', 'halfling'],
  ['dwarf', 'dwarf'], ['human', 'human'], ['elf', 'elf'], ['orc', 'orc'],
];
export function knownRace(s: unknown): Race | null {
  if (typeof s !== 'string') return null;
  const t = s.toLowerCase();
  for (const [alias, race] of RACE_ALIASES) if (t.includes(alias)) return race;
  return null;
}

// builds lean by race — dwarves run broad, elves slim
const BUILD_WEIGHTS: Record<Race, number[]> = {
  human: [2, 4, 2, 1],
  elf: [4, 4, 1, 0],
  dwarf: [0, 1, 4, 4],
  orc: [0, 2, 4, 2],
  halfling: [1, 3, 2, 3],
  'half-elf': [3, 4, 1, 0],
  'half-orc': [0, 2, 4, 2],
  gnome: [2, 4, 1, 2],
  goliath: [0, 0, 2, 5],
  tiefling: [2, 4, 2, 1],
  dragonborn: [0, 1, 4, 3],
  aasimar: [2, 4, 2, 1],
  kalashtar: [3, 4, 1, 0],
  shifter: [1, 3, 3, 1],
  simic: [2, 3, 2, 1],
  birdfolk: [3, 4, 1, 0],
  catfolk: [3, 4, 1, 0],
  warforged: [0, 1, 4, 3],
};

export function knownSex(s: unknown): Sex | null {
  if (typeof s !== 'string') return null;
  const t = s.toLowerCase();
  if (/\b(female|woman|girl|she|her)\b/.test(t)) return 'female';
  if (/\b(male|man|boy|he|him)\b/.test(t)) return 'male';
  return null;
}

export function defaultRecipe(seed: string, race: Race, sexLock?: Sex | null): PortraitRecipe {
  const sex = sexLock ?? (h32(seed, 30) % 2 ? 'female' : 'male');
  return {
    race,
    sex,
    build: BUILDS[weightedPick(seed, 31, BUILD_WEIGHTS[race])]!,
    eyes: h32(seed, 21) % LAYER_COUNT_SRC.eyes,
    brows: h32(seed, 22) % LAYER_COUNT_SRC.brows,
    nose: h32(seed, 23) % LAYER_COUNT_SRC.nose,
    mouth: h32(seed, 24) % LAYER_COUNT_SRC.mouth,
    hair: HAIR_WEIGHTS[race] ? weightedPick(seed, 25, HAIR_WEIGHTS[race]!) : h32(seed, 25) % LAYER_COUNT_SRC.hair,
    facial: sex === 'female' ? 0 : weightedPick(seed, 26, FACIAL_WEIGHTS[race]),
    headwear: h32(seed, 27) % 10 < 6 ? 0 : 1 + (h32(seed, 28) % (HEADWEAR.length - 1)),
    garb: h32(seed, 29) % GARB.length,
  };
}

export function serializeRecipe(r: PortraitRecipe): string {
  return [r.race, r.sex, r.build, ...ORDER.map((k) => r[k])].join('.');
}
export function parseRecipe(s: string): PortraitRecipe | null {
  const parts = s.split('.');
  if (!RACES.includes(parts[0] as Race)) return null;
  let idx: string[];
  const r = { race: parts[0] as Race } as PortraitRecipe;
  if (parts.length === ORDER.length + 3 && SEXES.includes(parts[1] as Sex) && BUILDS.includes(parts[2] as Build)) {
    r.sex = parts[1] as Sex;
    r.build = parts[2] as Build;
    idx = parts.slice(3);
  } else if (parts.length === ORDER.length + 1) {
    // a v1 recipe — sex and build derive deterministically from the string
    r.sex = h32(s, 30) % 2 ? 'female' : 'male';
    r.build = BUILDS[weightedPick(s, 31, BUILD_WEIGHTS[r.race])]!;
    idx = parts.slice(1);
  } else return null;
  ORDER.forEach((k, i) => { r[k] = Math.max(0, Number(idx[i]) || 0) % LAYER_COUNT_SRC[k]; });
  return r;
}
export function rerollLayer(r: PortraitRecipe, key: (typeof ORDER)[number] | 'race' | 'sex' | 'build'): PortraitRecipe {
  const next = { ...r };
  if (key === 'race') { next.race = RACES[(RACES.indexOf(r.race) + 1) % RACES.length]!; return next; }
  if (key === 'sex') { next.sex = r.sex === 'male' ? 'female' : 'male'; return next; }
  if (key === 'build') { next.build = BUILDS[(BUILDS.indexOf(r.build) + 1) % BUILDS.length]!; return next; }
  if (key === 'facial' && r.sex === 'female') { next.facial = 0; return next; }
  const n = LAYER_COUNT_SRC[key];
  if (n > 1) next[key] = (r[key] + 1 + Math.floor(Math.random() * (n - 1))) % n;
  return next;
}

/** Reroll every cosmetic layer at once — race and sex stay locked (they are
 *  facts about the person, not the sketch). */
export function rerollLook(r: PortraitRecipe): PortraitRecipe {
  const salt = Math.random().toString(36).slice(2, 10);
  const rec = defaultRecipe(salt, r.race, r.sex);
  return { ...rec, race: r.race, sex: r.sex };
}

// ---- seeded LIFE — years, scars, jewelry, freckles: no two faces blank ---
function lifeFor(g: FaceKit, r: PortraitRecipe, jitterSeed: string): void {
  const chance = (salt: number, pct: number) => (h32(jitterSeed, salt) % 100) < pct;
  const F = (pts: Pt[], w = 1, o = 0.4) => g.features.push({ pts, w, o });
  if (chance(310, 26)) { // the years
    F([[71, 95], [67.5, 93]], 1, 0.35); F([[72, 99.5], [68.5, 101]], 1, 0.3);
    F([[129, 95], [132.5, 93]], 1, 0.35); F([[128, 99.5], [131.5, 101]], 1, 0.3);
    F([[86, 78], [100, 76], [114, 78]], 1, 0.26); F([[88, 72], [100, 70.5], [112, 72]], 1, 0.22);
    F([[91, 124], [88, 132]], 1, 0.3); F([[109, 124], [112, 132]], 1, 0.3);
  }
  if (chance(311, 12)) { // an old wound
    const left = chance(312, 50);
    const [x0, x1] = left ? [72, 79] : [128, 121];
    F([[x0, 100], [x1, 116]], 1.3, 0.5);
    F([[(x0 + x1) / 2 - 3, 106], [(x0 + x1) / 2 + 3, 105]], 0.9, 0.4);
    F([[(x0 + x1) / 2 - 3, 111], [(x0 + x1) / 2 + 3, 110]], 0.9, 0.4);
  }
  if (chance(313, 18) && !HAIRLESS.has(r.race)) { // an earring
    const ex = chance(315, 50) ? 61 : 139;
    g.features.push({ pts: circPts(ex, 110, 2, 9), w: 1.1, o: 0.65 });
  }
  if (chance(314, 12) && !NO_NOSE.has(r.race)) { // freckles
    for (let i = 0; i < 6; i++) {
      const fx = 82 + (h32(jitterSeed, 320 + i) % 36);
      const fy = 108 + (h32(jitterSeed, 330 + i) % 10);
      F([[fx, fy], [fx + 0.9, fy + 0.4]], 1.1, 0.35);
    }
  }
}

// ---------------------------------------------------------------- render --
function irisSVG(cx: number, cy: number, P: RaceP): string {
  const r = P.irisR;
  let spokes = '';
  if (P.irisKind !== 'ring') {
    for (let k = 0; k < 7; k++) {
      const a = -2.4 + k * 0.75;
      const x1 = cx + Math.cos(a) * 1.7, y1 = cy + Math.sin(a) * 1.7;
      const x2 = cx + Math.cos(a) * (r - 0.4), y2 = cy + Math.sin(a) * (r - 0.4);
      spokes += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${HAIRC}" stroke-opacity="0.35" stroke-width="0.45"/>`;
    }
  }
  const pupil = P.irisKind === 'slit'
    ? `<ellipse cx="${cx}" cy="${cy}" rx="0.8" ry="2.3" fill="#22252a" fill-opacity="0.95"/>`
    : P.irisKind === 'ring'
      ? `<circle cx="${cx}" cy="${cy}" r="1.7" fill="none" stroke="#22252a" stroke-opacity="0.9" stroke-width="1.1"/>`
      : `<circle cx="${cx}" cy="${cy}" r="1.55" fill="#22252a" fill-opacity="0.95"/>`;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${GRAPHITE}" fill-opacity="0.26"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${HAIRC}" stroke-opacity="0.7" stroke-width="0.8"/>` +
    spokes +
    `<path d="M${cx - r},${cy - 0.4} A${r},${r} 0 0 1 ${cx + r},${cy - 0.4}" fill="none" stroke="#2b2f35" stroke-opacity="0.45" stroke-width="0.9"/>` +
    pupil +
    `<circle cx="${cx - 1.1}" cy="${cy - 1.2}" r="0.9" fill="#f7f3e8" fill-opacity="0.95"/>`;
}

/** The bust, as an SVG string. jitterSeed pins the hand — same person, same
 *  sketch, forever — and drives the parametric face morphs (eye spacing,
 *  nose length, mouth width), so identical recipes still measure apart. */
export function buildPortraitSVG(r: PortraitRecipe, jitterSeed: string): string {
  const rand = rng(jitterSeed);
  const morph = (salt: number, amp: number) => 1 + ((h32(jitterSeed, salt) / 4294967295) - 0.5) * 2 * amp;
  const m = { eyes: morph(301, 0.07), nose: morph(302, 0.11), mouth: morph(303, 0.09) };
  const bw = BUILD_W[r.build] ?? 1;
  const P = { ...BASE_P, ...RACE_P[r.race] };
  const facial = r.sex === 'female' || HAIRLESS.has(r.race) || NO_MOUTH.has(r.race) ? 0 : r.facial;
  const fid = (h32(jitterSeed, 999) % 100000).toString(36);

  const g = kit();
  shade(g, rand, r.sex === 'female', r.race);
  buildHead(g, r, m);
  raceExtras(g, r, rand);
  facialFor(g, facial, rand);
  const wearsHair = r.headwear !== 4;
  if (wearsHair) hairFor(g, r, rand);
  lifeFor(g, r, jitterSeed);

  const draw = (list: SS[], opts: { jitter?: number; taper?: number } = {}) =>
    list.map((st) => pencilLine(st.pts, { w: st.w, o: st.o, color: st.color, rand, flat: st.flat, ...opts })).join('');

  let inner = '';
  // vignette: a whisper of tone behind the shadow-side shoulder + corner
  inner += pencilLine([[147, 60], [153, 110], [151, 162]], { w: 15, o: 0.05, color: GRAPHITE, rand, jitter: 0.5, flat: true });
  inner += pencilLine([[40, 54], [58, 45], [78, 40]], { w: 11, o: 0.04, color: GRAPHITE, rand, jitter: 0.5, flat: true });
  inner += draw(g.tone, { jitter: 0.5 });
  // garb wears the build
  inner += GARB[r.garb % GARB.length]!.map((st) => pencilLine(scaleXs(st.pts, bw), { w: st.w, o: st.o, color: st.color, rand, jitter: 0.35, taper: 0.7 })).join('');
  // hair: deep tone under crisp strands (the F "finished" hair mass)
  const toneStrokes: SS[] = g.hairLanes.map(({ lane, spread }) => ({ pts: lane, w: spread * 3.1, o: 0.15, color: GRAPHITE, flat: true }));
  inner += draw(toneStrokes, { jitter: 0.5 });
  for (const { lane, n, spread, shine } of g.hairLanes) {
    inner += draw(laneStrokes(lane, Math.round(n * 1.7), rand, { spread, shine, o: 0.62, w: 1.05 }), { jitter: 0.4 });
  }
  if (g.hairTicks) inner += draw(laneTicks(g.hairTicks.lane, g.hairTicks.n, rand), { jitter: 0.4 });
  inner += draw(g.contours, { jitter: 0.32, taper: 0.7 });
  inner += draw(g.hairOutline, { jitter: 0.32, taper: 0.7 });
  inner += draw(g.features, { jitter: 0.3 });
  for (const b of g.brows) inner += draw(browHairs(b.arc, b.n, rand, { w: b.w, flip: b.flip }), { jitter: 0.25 });
  inner += draw(g.darks, { jitter: 0.3 });
  if (wearsHair || r.headwear === 4) inner += draw(HEADWEAR[r.headwear % HEADWEAR.length]!, { jitter: 0.32, taper: 0.7 });
  for (const iris of g.irises) inner += irisSVG(iris.cx, iris.cy, P);
  for (const n of g.nostrils) inner += `<ellipse cx="${n.cx.toFixed(1)}" cy="${n.cy.toFixed(1)}" rx="${n.rx.toFixed(1)}" ry="${n.ry.toFixed(1)}" fill="#2e3237" fill-opacity="0.75"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" role="img">` +
    `<defs><filter id="pr${fid}" x="-8%" y="-8%" width="116%" height="116%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" seed="${h32(jitterSeed, 998) % 97}" result="n"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="n" scale="2.4"/></filter></defs>` +
    `<g filter="url(#pr${fid})">${inner}</g></svg>`;
}
