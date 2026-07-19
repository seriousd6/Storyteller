// The portrait pack, "flat cut" edition. The pencil-study engine is gone —
// the owner picked a minimal flat-vector reference over it and drove eleven
// lab rounds to this: crisp colour planes, two tones per material, light from
// the left, no outlines, no gradients, no filters. Nothing to smear at any
// size, and it reads at 40px the same as at 400.
// Every dial the draw-seed rolls has at least five settings, and every race
// clears 10,000 distinct facial structures before flourishes, colour, or garb
// even land (6 face shapes × 5 ear cuts × 5 eye tilts × 5 brow weights ×
// 5 nose lengths × 5 mouth widths for the standard races; snouts, frills,
// beak cuts, feather masks, muzzle sizes, seam layouts, optic housings and
// vents carry the muzzled ones). One seeded metal tint and one accent colour
// tie a character's fittings together.
// Seeded and deterministic: the same person always looks the same. The recipe
// string is stored in world docs and its axes are FROZEN (eyes/brows/nose/
// mouth 4, hair 9, facial 5, headwear 5) — garb grew 5 → 6 this edition;
// parseRecipe clamps by count, so every stored recipe still parses.

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
const MUZZLED = new Set<Race>(['birdfolk', 'catfolk', 'warforged']);
// ridges and plates instead of brow bars
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

const LAYER_COUNT_SRC: Record<(typeof ORDER)[number], number> = {
  eyes: 4, brows: 4, nose: 4, mouth: 4, hair: 9, facial: 5, headwear: 5, garb: 6,
};
export const LAYER_COUNTS: Record<string, number> = { ...LAYER_COUNT_SRC };

// ---------------------------------------------------------------- engine --
type Pt = [number, number];

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

function shadeHex(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f <= 1) { r *= f; g *= f; b *= f; }
  else { const t = f - 1; r += (255 - r) * t; g += (255 - g) * t; b += (255 - b) * t; }
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}
function mixHex(a: string, b: string, t: number): string {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const c = (sh: number) => Math.round(((A >> sh) & 255) + (((B >> sh) & 255) - ((A >> sh) & 255)) * t);
  return '#' + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
}
function lumOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114;
}
const shift = (pts: Pt[], dx: number, dy: number): Pt[] => pts.map((p) => [p[0] + dx, p[1] + dy]);

// ------------------------------------------------------------- palettes --
const SKIN: Record<Race, string[]> = {
  human: ['#f0c8a0', '#e2b48c', '#c98f62', '#a9713f', '#8a5a32', '#6b4423'],
  elf: ['#f4dcc0', '#ecd0b0', '#dab890', '#b48a5c', '#8f6a48'],
  dwarf: ['#e8b48e', '#d89a6a', '#c08050', '#9a6a3e', '#b4835c', '#845834'],
  orc: ['#8faf68', '#7a9c55', '#697f3f', '#5c8a63', '#9aa96b'],
  halfling: ['#f2c9a2', '#e6b488', '#c99468', '#a5754a', '#8a6240'],
  'half-elf': ['#f2d2ac', '#e4bc94', '#c89468', '#a3764a', '#8a6448'],
  'half-orc': ['#a8b478', '#95a468', '#7f9455', '#b4a878', '#6f8a52'],
  gnome: ['#f4cfa8', '#e8b88e', '#d09a6c', '#b07f52', '#96683e'],
  goliath: ['#b6bcc0', '#a2a8ac', '#8e979e', '#7c858c', '#6b7076'],
  tiefling: ['#c05a48', '#a8453c', '#8e3a4e', '#7a4a92', '#b06858'],
  // ten canonical breeds: red blue green black white · gold silver bronze copper brass
  dragonborn: ['#a84a3c', '#4a6a9c', '#5c8a52', '#3a3e42', '#c8c8c2', '#c8a03c', '#a8adb4', '#9a7040', '#b26038', '#c2a44e'],
  aasimar: ['#f6e0c2', '#f0d4b4', '#ecd8c8', '#e0c4a2', '#d9b990'],
  kalashtar: ['#e8d2c0', '#dcc4b4', '#d0baae', '#c4a894', '#b89e8e'],
  shifter: ['#caa26e', '#b48a58', '#9a744a', '#87643e', '#755440'],
  simic: ['#6ea89a', '#5a968c', '#4d8a84', '#7ab0a0', '#63a0ae'],
  birdfolk: ['#3c4048', '#7a6248', '#c8c2b4', '#5a7896', '#8a4a38'],
  catfolk: ['#d2a86a', '#b08a54', '#8a8a92', '#3e3a38', '#e2d6c2'],
  warforged: ['#9aa0a8', '#8a9098', '#a89e8a', '#7e848c', '#8c8478'],
};
const HAIRC: Partial<Record<Race, string[]>> & { base: string[] } = {
  base: ['#2c2a2c', '#4a3628', '#6a4a2e', '#8a6038', '#b08348', '#c8a45c', '#8a8d92', '#dcd8d0', '#a04a2e'],
  elf: ['#e6ddc8', '#c8b088', '#2c2a2c', '#6a4a2e', '#b7b9be'],
  aasimar: ['#ecdfc0', '#e0c890', '#dcd8d0', '#c9b47e', '#b7b9be'],
  tiefling: ['#241f2b', '#3c2438', '#54283c', '#2c2a2c', '#402c48'],
  shifter: ['#4a3628', '#6a4a2e', '#3a2e22', '#8a6038', '#2c2a2c'],
};
const GARB_C: Array<[string, string]> = [
  ['#7a4a3a', '#5e382c'], ['#4a6a52', '#38523e'], ['#54617a', '#404b60'], ['#8a6a3a', '#6e5430'],
  ['#6a4a68', '#523852'], ['#a08048', '#7c6238'], ['#5e6e64', '#48564e'], ['#8a4a44', '#6a3834'],
  ['#7a6a52', '#5e5040'], ['#4a5a6a', '#384452'], ['#6a5a44', '#52462f'], ['#804a5a', '#623846'],
];

// ------------------------------------------------------ race parameters --
interface RaceGeo {
  headW: number; topY: number; jaw: number; chinY: number; cheek: number;
  ear: 'round' | 'point' | 'long' | 'fin' | 'cat' | 'none';
  scale: number; neckW: number; brow: number;
}
const BASE_P: RaceGeo = { headW: 34, topY: 58, jaw: 1.0, chinY: 148, cheek: 1.0, ear: 'round', scale: 1.0, neckW: 13, brow: 1.0 };
const RACE_P: Partial<Record<Race, Partial<RaceGeo>>> = {
  elf: { headW: 31, jaw: 0.82, chinY: 150, ear: 'long', cheek: 0.92 },
  dwarf: { headW: 37, jaw: 1.08, chinY: 145, topY: 62, neckW: 16 },
  orc: { headW: 38, jaw: 1.18, chinY: 147, brow: 1.5, neckW: 17 },
  halfling: { scale: 0.9, cheek: 1.12, chinY: 145 },
  'half-elf': { headW: 33, jaw: 0.9, ear: 'point' },
  'half-orc': { headW: 36, jaw: 1.12, brow: 1.25, neckW: 15 },
  gnome: { scale: 0.86, cheek: 1.15, chinY: 144 },
  goliath: { scale: 1.07, headW: 38, jaw: 1.18, brow: 1.3, neckW: 18 },
  tiefling: { headW: 32, jaw: 0.92, chinY: 150 },
  dragonborn: { headW: 36, jaw: 1.1, ear: 'none', brow: 1.35 },
  aasimar: { headW: 33 },
  kalashtar: { headW: 32, jaw: 0.9 },
  shifter: { headW: 35, jaw: 1.08, brow: 1.3 },
  simic: { headW: 34, ear: 'fin' },
  birdfolk: { headW: 33, ear: 'none' },
  catfolk: { headW: 34, jaw: 0.95, ear: 'cat' },
  warforged: { headW: 35, jaw: 1.1, ear: 'none', neckW: 15 },
};

// the paper ground the owner picked — part of the art, every surface
const PAPER = { bg: '#edeae2', slab: '#ddd8cb' };

// ---------------------------------------------------------------- render --
/** The bust, as an SVG string. jitterSeed pins the hand — same person, same
 *  cut, forever — and drives every five-way structure dial, so identical
 *  recipes still land on visibly different people. */
export function buildPortraitSVG(p: PortraitRecipe, jitterSeed: string): string {
  const r = rng('draw:' + jitterSeed + ':' + serializeRecipe(p));
  const jit = (amp: number) => (r() - 0.5) * 2 * amp;
  const P: RaceGeo = { ...BASE_P, ...(RACE_P[p.race] ?? {}) };
  const S = P.scale, bw = BUILD_W[p.build] ?? 1;
  const fem = p.sex === 'female';
  const F = (n: number) => (Math.round(n * 10) / 10).toString();
  const poly = (pts: Pt[]) => 'M' + pts.map((q) => F(q[0]) + ',' + F(q[1])).join(' L') + ' Z';
  const path = (d: string, fill: string, o?: number) => '<path d="' + d + '" fill="' + fill + '"' + (o != null ? ' opacity="' + o + '"' : '') + '/>';
  const seg = (d: string, w: number, col: string, o?: number) => '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '"' + (o != null ? ' opacity="' + o + '"' : '') + '/>';

  // ---- palette: muted flats, two tones per material ----
  const mute = (hex: string, t: number) => mixHex(hex, '#8a8578', t);
  const skinIdx = Math.floor(r() * SKIN[p.race].length);
  const skin = shadeHex(mute(SKIN[p.race][skinIdx]!, 0.12), 0.97 + r() * 0.06);
  const skinSh = shadeHex(skin, 0.85), skinDk = shadeHex(skin, 0.68);
  const hairPool = HAIRC[p.race] ?? HAIRC.base;
  const hair = mute(hairPool[Math.floor(r() * hairPool.length)]!, 0.12);
  const hairSh = shadeHex(hair, 0.74), hairHi = shadeHex(hair, 1.18);
  const garbPair = GARB_C[Math.floor(r() * GARB_C.length)]!;
  const garb = mute(garbPair[0], 0.2), garbSh = shadeHex(garb, 0.78), garbHi = shadeHex(garb, 1.22);
  const garb2 = mute(garbPair[1], 0.2);
  const leather = '#4d4238', buckle = '#b09a5c';
  // one metal and one accent per character — every fitting on the figure agrees
  const metal = mute(['#8a9098', '#6e747c', '#8a7a58', '#75828e', '#9aa4ac'][Math.floor(r() * 5)]!, 0.08);
  const metalSh = shadeHex(metal, 0.75), metalHi = shadeHex(metal, 1.24);
  const accC = mute(['#4d8a84', '#8a4a44', '#c89a3c', '#6a5a8a', '#8aa06a'][Math.floor(r() * 5)]!, 0.1);
  const IRIS_POOLS: Partial<Record<Race, string[]>> = {
    tiefling: ['#e0a43c', '#d8c23c', '#c85a30', '#e8e4d8', '#9a6ac0'],
    warforged: ['#6ac4dc', '#dcb44a', '#8ad08a', '#e07a5a', '#c0c8d8'],
    shifter: ['#d8a028', '#c8b040', '#a87828', '#e0c060', '#b89030'],
    catfolk: ['#d8a028', '#7ac080', '#48a0b8', '#e0c060', '#c87830'],
    aasimar: ['#c8b060', '#e0d0a0', '#a8c0d8', '#d8b880', '#f0e8c8'],
  };
  const irisPool = IRIS_POOLS[p.race] ?? ['#7a5a34', '#4a7086', '#5c7a4a', '#8a5c3c', '#3e5a7a', '#96702e'];
  const irisC = irisPool[Math.floor(r() * irisPool.length)]!;

  // seeded flourishes — rolled up front so branches never shift the stream
  const scarRoll = r(), earringRoll = r(), neckRoll = r(), kitRoll = r(), paintRoll = r(), beadRoll = r(), extraRoll = r();
  // seeded structure — the same recipe still lands on a distinct face
  const faceV = Math.floor(r() * 6);                 // oval square heart round long diamond
  const fJaw = [1, 1.14, 0.92, 1.08, 0.94, 0.9][faceV]!;
  const fCheek = [1, 1.04, 1.08, 1.12, 0.94, 1.14][faceV]!;
  const fTemple = [1, 1.02, 1.1, 1.0, 0.96, 0.9][faceV]!;
  const fChinY = [0, -3, 2, -4, 5, 1][faceV]!;
  const fChinW = [1, 1.35, 0.7, 1.15, 0.85, 0.75][faceV]!;
  const earV = Math.floor(r() * 5), earS = 0.85 + r() * 0.35, eTipK = [0.7, 0.85, 1, 1.15, 1.35][earV]!;
  const eDX = 10.5 + jit(1.2), eSc = 0.92 + r() * 0.18;
  const moleRoll = r(), ageRoll = r(), streakRoll = r();
  const subRoll = r(), tatRoll = r(), specRoll = r(), patchRoll = r(), freckRoll = r(), bandRoll = r(), notchRoll = r();
  const garbSub = Math.floor(subRoll * 5), hatSub = Math.floor(r() * 5);
  const hornV = Math.floor(r() * 5), plumV = Math.floor(r() * 5);
  // the deep-structure dials: every face is built from five-way choices
  const eyeTiltV = Math.floor(r() * 5), browWtV = Math.floor(r() * 5), noseLnV = Math.floor(r() * 5), mouthWV = Math.floor(r() * 5);
  const muzzV = Math.floor(r() * 5), featV = Math.floor(r() * 5);
  const kitSub = Math.floor(r() * 5), buckleV = Math.floor(r() * 5);
  const freckV = Math.floor(r() * 5), streakV = Math.floor(r() * 5), accessV = Math.floor(r() * 5);
  const eyeTilt = [-4, -2, 0, 2.5, 5][eyeTiltV]!;               // degrees: droop … cat-eye
  const browWt = [0.75, 0.9, 1, 1.15, 1.32][browWtV]!;
  const browLift = [0.8, 0.4, 0, -0.4, -0.9][browWtV]!;
  const noseLn = [-2.5, -1, 0, 1.5, 3][noseLnV]!;
  const mouthW = [0.8, 0.9, 1, 1.1, 1.22][mouthWV]!;

  // ---- skeleton: near-frontal, a whisper of the left turn in the shade ----
  const hw = P.headW * 0.8, jw = hw * P.jaw * (fem ? 0.9 : 1) * fJaw;
  const top = P.topY - 10, chin = P.chinY - 22 + (fem ? 1 : 0) + fChinY;
  const mx = 97, nearEx = 97 + eDX;
  const eY = Math.round(top + (chin - top) * 0.56);
  const hv = p.hair % 9;
  const wearsHair = p.headwear !== 4 && !HAIRLESS.has(p.race);
  const shTop = 156, shW = 46 * bw;
  const nw = P.neckW * 0.75 * (fem ? 0.85 : 1) * (bw > 1 ? 1 + (bw - 1) * 0.4 : 1);

  let back = '', mid = '', front = '', crown = '';

  // ---- ground: flat field + two quiet slabs, outside the figure scale ----
  let ground = '<rect width="200" height="240" fill="' + PAPER.bg + '"/>';
  ground += path(poly([[0, 240], [0, 88], [44, 70], [56, 240]]), PAPER.slab, 0.55);
  ground += path(poly([[200, 240], [200, 56], [154, 76], [146, 240]]), PAPER.slab, 0.4);

  // ---- hair curtains + kit live BEHIND the neck and torso ----
  if (wearsHair && (hv === 4 || hv === 5 || hv === 7)) {
    const len = hv === 4 ? 196 : hv === 5 ? 148 : 156;
    const bm: Pt[] = [
      [100 - hw * 0.95, top + 18], [100 - hw * 1.1, eY + 10], [100 - hw * (hv === 4 ? 1.05 : 0.9), len - 14], [100 - hw * 0.45, len],
      [101, len - 22], [100 + hw * 0.6, len + 2], [100 + hw * (hv === 4 ? 1.18 : 1.02), len - 16], [100 + hw * 1.22, eY + 6], [100 + hw * 1.0, top + 16], [101, top + 4],
    ];
    mid += path(poly(shift(bm, 2.5, 3)), hairSh);
    mid += path(poly(bm), hair);
  }
  if (kitRoll < 0.36) {
    const wood = '#6e5c46', woodDk = '#57493a';
    if (kitRoll < 0.09) { // quiver — five fits: strap, wrapped tube, hunter's bow, pale fletch, banded
      const nArr = [3, 4, 2, 3, 3][kitSub]!;
      if (kitSub === 2) { // an unstrung bow stave rides with the light quiver
        mid += seg('M' + F(100 + shW * 0.34) + ',' + F(shTop + 40) + ' Q' + F(100 + shW * 1.14) + ',' + F(shTop - 8) + ' ' + F(100 + shW * 0.52) + ',' + F(shTop - 34), 2.6, woodDk);
      }
      for (let i = 0; i < nArr; i++) {
        const bx = 100 + shW * (0.57 + i * 0.075), by = shTop + 4 - i * 1.5;
        const tx = bx - 8, ty = by - 26;
        const fA = kitSub === 3 ? '#ded6c2' : '#b0552f', fB = kitSub === 3 ? '#c2b89e' : '#8a3f22';
        mid += seg('M' + F(bx) + ',' + F(by) + ' L' + F(tx) + ',' + F(ty), 1.5, wood);
        mid += path(poly([[tx, ty], [tx - 4.2, ty + 7.5], [tx - 1.2, ty + 8]]), i % 2 ? fA : '#ded6c2');
        mid += path(poly([[tx, ty], [tx + 3.4, ty + 8], [tx + 0.8, ty + 8.5]]), i % 2 ? fB : '#c2b89e');
        mid += seg('M' + F(tx) + ',' + F(ty) + ' L' + F(tx - 0.9) + ',' + F(ty - 2.6), 1.4, '#4a4038');
      }
      mid += path(poly([[100 + shW * 0.5, shTop + 4], [100 + shW * 0.78, shTop - 3], [100 + shW * 0.98, shTop + 34], [100 + shW * 0.72, shTop + 40]]), kitSub === 1 ? mute(garbPair[1], 0.15) : leather);
      mid += seg('M' + F(100 + shW * 0.52) + ',' + F(shTop + 7) + ' L' + F(100 + shW * 0.8) + ',' + F(shTop), 2.4, '#5f5344');
      if (kitSub === 4) mid += seg('M' + F(100 + shW * 0.58) + ',' + F(shTop + 18) + ' L' + F(100 + shW * 0.88) + ',' + F(shTop + 13) + ' M' + F(100 + shW * 0.62) + ',' + F(shTop + 28) + ' L' + F(100 + shW * 0.92) + ',' + F(shTop + 23), 2, metalSh, 0.9);
    } else if (kitRoll < 0.17) { // a blade over the left shoulder — five hilts
      const sx0 = 100 - shW * 0.72;
      if (kitSub === 3) { // twin daggers crossed
        mid += seg('M' + F(sx0 + 2) + ',' + F(shTop + 4) + ' L' + F(sx0 + 12) + ',' + F(shTop - 16), 2.6, leather);
        mid += seg('M' + F(sx0 + 14) + ',' + F(shTop + 4) + ' L' + F(sx0 + 2) + ',' + F(shTop - 15), 2.6, '#5f5344');
        mid += path(poly([[sx0 + 8, shTop - 12], [sx0 + 16, shTop - 15], [sx0 + 16.5, shTop - 12], [sx0 + 9, shTop - 9]]), buckle);
        mid += path(poly([[sx0 - 1, shTop - 12], [sx0 + 6, shTop - 14.5], [sx0 + 6.5, shTop - 11.5], [sx0, shTop - 9]]), shadeHex(buckle, 0.8));
      } else if (kitSub === 1) { // curved saber guard
        mid += seg('M' + F(sx0) + ',' + F(shTop + 6) + ' L' + F(sx0 + 8) + ',' + F(shTop - 24), 3.4, leather);
        mid += seg('M' + F(sx0 - 2) + ',' + F(shTop - 10) + ' Q' + F(sx0 + 7) + ',' + F(shTop - 22) + ' ' + F(sx0 + 15) + ',' + F(shTop - 15), 2.6, buckle);
      } else if (kitSub === 4) { // ring pommel over a wrapped grip
        mid += seg('M' + F(sx0) + ',' + F(shTop + 6) + ' L' + F(sx0 + 8) + ',' + F(shTop - 24), 3.4, leather);
        mid += seg('M' + F(sx0 + 1) + ',' + F(shTop - 2) + ' L' + F(sx0 + 9) + ',' + F(shTop - 5) + ' M' + F(sx0 + 2.5) + ',' + F(shTop - 8) + ' L' + F(sx0 + 10) + ',' + F(shTop - 11), 1.3, '#5f5344', 0.9);
        mid += path(poly([[sx0 - 1, shTop - 15], [sx0 + 13, shTop - 21], [sx0 + 14.5, shTop - 17], [sx0 + 0.5, shTop - 11]]), buckle);
        mid += '<circle cx="' + F(sx0 + 9) + '" cy="' + F(shTop - 28) + '" r="4" fill="none" stroke="' + buckle + '" stroke-width="1.8"/>';
      } else { // cross hilt; the greatsword cut is longer and wider
        const g2 = kitSub === 2 ? 3 : 0;
        mid += seg('M' + F(sx0) + ',' + F(shTop + 6) + ' L' + F(sx0 + 8) + ',' + F(shTop - 24 - g2 * 2.6), 3.4 + g2 * 0.4, leather);
        mid += path(poly([[sx0 - 1 - g2, shTop - 15], [sx0 + 13 + g2, shTop - 21 - g2 * 0.4], [sx0 + 14.5 + g2, shTop - 17], [sx0 + 0.5 - g2, shTop - 11]]), buckle);
        mid += '<circle cx="' + F(sx0 + 9) + '" cy="' + F(shTop - 27 - g2 * 3) + '" r="' + F(3.4 + g2 * 0.3) + '" fill="' + buckle + '"/>';
      }
    } else if (kitRoll < 0.24) { // a staff held well clear of the face — five heads
      const sx0 = 100 - shW * 1.02, tipY = shTop - 46;
      mid += seg('M' + F(sx0) + ',240 L' + F(sx0 + 4) + ',' + F(tipY), 3, wood);
      if (kitSub === 1) { // shepherd's crook
        mid += seg('M' + F(sx0 + 4) + ',' + F(tipY) + ' Q' + F(sx0 + 2) + ',' + F(tipY - 12) + ' ' + F(sx0 + 12) + ',' + F(tipY - 10) + ' Q' + F(sx0 + 17) + ',' + F(tipY - 9) + ' ' + F(sx0 + 15) + ',' + F(tipY - 3), 2.8, wood);
      } else if (kitSub === 2) { // forked branch
        mid += seg('M' + F(sx0 + 4) + ',' + F(tipY) + ' L' + F(sx0 - 1) + ',' + F(tipY - 12) + ' M' + F(sx0 + 4) + ',' + F(tipY) + ' L' + F(sx0 + 10) + ',' + F(tipY - 13), 2.4, wood);
      } else if (kitSub === 3) { // crescent finial
        mid += path(poly([[sx0 - 3, tipY - 2], [sx0 + 4.5, tipY - 12], [sx0 + 12, tipY - 2], [sx0 + 8.5, tipY - 3], [sx0 + 4.5, tipY - 8], [sx0, tipY - 3]]), buckle);
      } else if (kitSub === 4) { // lashed shard
        mid += path(poly([[sx0 + 1, tipY - 1], [sx0 + 4.5, tipY - 14], [sx0 + 8, tipY - 1]]), accC);
        mid += seg('M' + F(sx0 + 1) + ',' + F(tipY + 1) + ' L' + F(sx0 + 8.5) + ',' + F(tipY - 2), 1.6, leather);
      } else { // orb
        mid += '<circle cx="' + F(sx0 + 4.5) + '" cy="' + F(tipY - 4) + '" r="7" fill="' + accC + '" opacity="0.28"/>';
        mid += '<circle cx="' + F(sx0 + 4.5) + '" cy="' + F(tipY - 4) + '" r="4.2" fill="' + accC + '"/>';
      }
    } else if (kitRoll < 0.3) { // a haft over the right shoulder — five heads
      const ax0 = 100 + shW * 0.6;
      mid += seg('M' + F(ax0) + ',' + F(shTop + 8) + ' L' + F(ax0 + 10) + ',' + F(shTop - 30), 3, wood);
      if (kitSub === 1) { // double-bit
        mid += path(poly([[ax0 + 4, shTop - 26], [ax0 + 18, shTop - 34], [ax0 + 20, shTop - 20], [ax0 + 9, shTop - 18]]), metal);
        mid += path(poly([[ax0 + 6, shTop - 25], [ax0 - 6, shTop - 32], [ax0 - 8, shTop - 19], [ax0 + 3, shTop - 18]]), metalSh);
      } else if (kitSub === 2) { // bearded axe
        mid += path(poly([[ax0 + 4, shTop - 26], [ax0 + 18, shTop - 34], [ax0 + 21, shTop - 18], [ax0 + 14, shTop - 6], [ax0 + 11, shTop - 10], [ax0 + 9, shTop - 18]]), metal);
        mid += path(poly([[ax0 + 18, shTop - 34], [ax0 + 21, shTop - 18], [ax0 + 25, shTop - 27]]), metalSh);
      } else if (kitSub === 3) { // warhammer
        mid += path(poly([[ax0 + 3, shTop - 33], [ax0 + 17, shTop - 36], [ax0 + 18, shTop - 25], [ax0 + 4, shTop - 22]]), metal);
        mid += path(poly([[ax0 + 17, shTop - 36], [ax0 + 18, shTop - 25], [ax0 + 22, shTop - 31]]), metalSh);
      } else if (kitSub === 4) { // war pick
        mid += path(poly([[ax0 + 5, shTop - 30], [ax0 + 20, shTop - 38], [ax0 + 9, shTop - 24]]), metal);
        mid += path(poly([[ax0 + 5, shTop - 27], [ax0 - 7, shTop - 26], [ax0 + 6, shTop - 22]]), metalSh);
      } else { // broad single blade
        mid += path(poly([[ax0 + 4, shTop - 26], [ax0 + 18, shTop - 34], [ax0 + 20, shTop - 20], [ax0 + 9, shTop - 18]]), metal);
        mid += path(poly([[ax0 + 18, shTop - 34], [ax0 + 20, shTop - 20], [ax0 + 25, shTop - 28]]), metalSh);
      }
    } else { // a shield slung at the off shoulder — five faces
      const sh0 = 100 - shW * 1.08, shC = mute(garbPair[1], 0.15);
      if (kitSub === 1) mid += path(poly([[sh0, shTop + 2], [sh0 + 17, shTop - 5], [sh0 + 20, shTop + 38], [sh0 + 10, shTop + 66], [sh0 + 1, shTop + 40]]), shC);
      else mid += path(poly([[sh0, shTop + 2], [sh0 + 17, shTop - 5], [sh0 + 21, shTop + 60], [sh0 + 2, shTop + 66]]), shC);
      mid += seg('M' + F(sh0 + 3) + ',' + F(shTop + 3) + ' L' + F(sh0 + 16) + ',' + F(shTop - 2), 2.2, metalHi, 0.8);
      if (kitSub === 2) mid += path(poly([[sh0 + 2, shTop + 18], [sh0 + 10.5, shTop + 28], [sh0 + 19, shTop + 16], [sh0 + 19.5, shTop + 24], [sh0 + 10.5, shTop + 36], [sh0 + 2.5, shTop + 26]]), accC, 0.9);
      else if (kitSub === 3) mid += seg('M' + F(sh0 + 1) + ',' + F(shTop + 20) + ' L' + F(sh0 + 20) + ',' + F(shTop + 16) + ' M' + F(sh0 + 2) + ',' + F(shTop + 42) + ' L' + F(sh0 + 21) + ',' + F(shTop + 38), 2.4, metalSh, 0.9);
      else if (kitSub === 4) { for (let i = 0; i < 4; i++) mid += '<circle cx="' + F(sh0 + 6 + (i % 2) * 9) + '" cy="' + F(shTop + 14 + Math.floor(i / 2) * 26) + '" r="1.8" fill="' + metalSh + '"/>'; }
      else mid += '<circle cx="' + F(sh0 + 10.5) + '" cy="' + F(shTop + 26) + '" r="3.4" fill="' + metalSh + '"/>';
    }
  }

  // ---- neck: fully in shade, one crisp jaw shadow ----
  mid += path(poly([[mx - nw, chin - 10], [mx - nw - 1, shTop + 6], [mx + nw + 3, shTop + 6], [mx + nw + 1, chin - 12]]), skinSh);
  mid += path(poly([[mx - nw, chin - 10], [mx + nw + 1, chin - 12], [mx + nw, chin + 4], [mx - nw, chin + 2]]), skinDk);

  // ---- torso ----
  const bod: Pt[] = [
    [mx - nw - 3, shTop - 8], [100 - shW * 0.52, shTop - 2], [100 - shW * 0.9, shTop + 12], [100 - shW, 240],
    [100 + shW, 240], [100 + shW * 0.92, shTop + 10], [100 + shW * 0.54, shTop - 4], [mx + nw + 5, shTop - 10],
  ];
  mid += path(poly(bod), garb);
  mid += path(poly([[100 + shW * 0.18, shTop - 5], [100 + shW * 0.92, shTop + 10], [100 + shW, 240], [100 + shW * 0.3, 240], [100 + shW * 0.4, shTop + 30]]), garbSh);
  mid += path(poly([[100 - shW * 0.88, shTop + 14], [100 - shW * 0.55, shTop + 1], [100 - shW * 0.42, 240], [100 - shW * 0.78, 240]]), garbHi, 0.45);

  const gv = p.garb % 6;
  const belt = () => {
    mid += path(poly([[100 - shW * 0.96, 210], [100 + shW * 0.96, 206], [100 + shW * 0.98, 218], [100 - shW * 0.98, 222]]), leather);
    if (buckleV === 1) mid += '<circle cx="' + F(mx + 1) + '" cy="212" r="6.4" fill="' + buckle + '"/><circle cx="' + F(mx + 1) + '" cy="212" r="3" fill="' + leather + '"/>';
    else if (buckleV === 2) mid += '<circle cx="' + F(mx - 3.5) + '" cy="213" r="4.4" fill="none" stroke="' + buckle + '" stroke-width="1.8"/><circle cx="' + F(mx + 5.5) + '" cy="212" r="4.4" fill="none" stroke="' + buckle + '" stroke-width="1.8"/>';
    else if (buckleV === 3) { // knotted strap, no metal at all
      mid += path(poly([[mx - 4, 208], [mx + 5, 207], [mx + 14, 219], [mx + 6, 220]]), '#5f5344');
      mid += path(poly([[mx + 5, 207], [mx - 4, 220], [mx - 12, 219], [mx - 3, 208]]), '#3f362c');
    } else if (buckleV === 4) { // studded plate
      mid += '<rect x="' + F(mx - 8) + '" y="207" width="18" height="10" fill="' + buckle + '"/>';
      for (let i = 0; i < 3; i++) mid += '<circle cx="' + F(mx - 4 + i * 5.5) + '" cy="212" r="1.3" fill="' + leather + '"/>';
    } else mid += '<rect x="' + F(mx - 5) + '" y="206" width="12" height="12" fill="' + buckle + '"/><rect x="' + F(mx - 2) + '" y="209" width="6" height="6" fill="' + leather + '"/>';
  };
  if (gv === 0) {
    if (garbSub === 1) { // crew collar band
      mid += path(poly([[mx - nw - 1, shTop - 6], [mx + nw + 3, shTop - 8], [mx + nw + 2, shTop - 1], [mx - nw, shTop + 1]]), garb2);
    } else if (garbSub === 2) { // wrap: one diagonal seam
      mid += seg('M' + F(mx - nw - 2) + ',' + F(shTop - 5) + ' L' + F(100 + shW * 0.34) + ',' + F(shTop + 32), 1.8, garbSh, 0.9);
      mid += path(poly([[mx - nw - 1, shTop - 6], [mx + nw + 3, shTop - 8], [mx + nw + 8, shTop + 2], [mx - nw + 4, shTop + 4]]), garb2, 0.85);
    } else if (garbSub === 3) { // V + a shoulder yoke
      const vB: Pt = [101, shTop + 18];
      mid += path(poly([[mx - nw - 1, shTop - 6], [mx + nw + 3, shTop - 8], vB]), skinSh);
      mid += seg('M' + F(mx - nw - 1) + ',' + F(shTop - 6) + ' L' + F(vB[0]) + ',' + F(vB[1]) + ' L' + F(mx + nw + 3) + ',' + F(shTop - 8), 2.5, garb2);
      mid += path(poly([[100 - shW * 0.86, shTop + 10], [mx - nw - 4, shTop - 2], [mx - nw - 2, shTop + 6], [100 - shW * 0.78, shTop + 18]]), garb2, 0.9);
      mid += path(poly([[100 + shW * 0.88, shTop + 8], [mx + nw + 6, shTop - 4], [mx + nw + 8, shTop + 4], [100 + shW * 0.8, shTop + 16]]), shadeHex(garb2, 0.86), 0.9);
    } else if (garbSub === 4) { // crew band + a line of buttons
      mid += path(poly([[mx - nw - 1, shTop - 6], [mx + nw + 3, shTop - 8], [mx + nw + 2, shTop - 1], [mx - nw, shTop + 1]]), garb2);
      for (let i = 0; i < 3; i++) mid += '<circle cx="' + F(mx + 1) + '" cy="' + F(shTop + 8 + i * 11) + '" r="1.7" fill="' + garb2 + '"/>';
    } else { // plain weave: quiet shoulder seams
      mid += seg('M' + F(100 - shW * 0.62) + ',' + F(shTop + 2) + ' L' + F(mx - nw - 3) + ',' + F(shTop - 4) + ' M' + F(100 + shW * 0.64) + ',' + F(shTop) + ' L' + F(mx + nw + 5) + ',' + F(shTop - 6), 1.4, garbSh, 0.8);
    }
    belt();
  }
  if (gv === 1) {
    const px0 = garbSub === 1 ? 88 : 96;
    mid += path(poly([[px0, shTop - 6], [px0 + 11, shTop - 7], [px0 + 10, 240], [px0 - 1, 240]]), garb2);
    for (let i = 0; i < (garbSub === 2 ? 3 : 4); i++) mid += seg('M' + F(px0 - 4) + ',' + F(shTop + 8 + i * 13) + ' L' + F(px0 + 14) + ',' + F(shTop + 14 + i * 13) + ' M' + F(px0 + 14) + ',' + F(shTop + 8 + i * 13) + ' L' + F(px0 - 4) + ',' + F(shTop + 14 + i * 13), 1.6, shadeHex(garb2, 0.7));
    if (garbSub === 2) { // collar flaps
      mid += path(poly([[mx - nw - 2, shTop - 7], [mx - nw + 8, shTop - 4], [mx - nw - 1, shTop + 6]]), garb2);
      mid += path(poly([[mx + nw + 4, shTop - 9], [mx + nw - 6, shTop - 5], [mx + nw + 3, shTop + 4]]), shadeHex(garb2, 0.85));
    }
    if (garbSub === 3) { // double-breasted: twin button rows
      for (let i = 0; i < 3; i++) {
        mid += '<circle cx="' + F(px0 - 6) + '" cy="' + F(shTop + 12 + i * 14) + '" r="1.6" fill="' + shadeHex(garb2, 0.65) + '"/>';
        mid += '<circle cx="' + F(px0 + 17) + '" cy="' + F(shTop + 11 + i * 14) + '" r="1.6" fill="' + shadeHex(garb2, 0.65) + '"/>';
      }
    }
    if (garbSub === 4) { // sleeveless over a lighter shirt
      mid += path(poly([[100 - shW * 0.88, shTop + 12], [100 - shW * 0.6, shTop - 1], [100 - shW * 0.4, shTop + 8], [100 - shW * 0.62, shTop + 22]]), shadeHex(garb, 1.35), 0.85);
      mid += path(poly([[100 + shW * 0.9, shTop + 10], [100 + shW * 0.62, shTop - 3], [100 + shW * 0.42, shTop + 6], [100 + shW * 0.64, shTop + 20]]), shadeHex(garb, 1.28), 0.85);
    }
    belt();
  }
  if (gv === 2) {
    mid += path(poly([[100 - shW * 0.5, shTop], [100 - 12, shTop - 7], [100 - 20, 240], [100 - shW * 0.62, 240]]), garb2);
    mid += path(poly([[100 + shW * 0.52, shTop - 2], [100 + 14, shTop - 9], [100 + 22, 240], [100 + shW * 0.64, 240]]), garb2);
    if (garbSub === 1) mid += '<circle cx="101" cy="' + F(shTop + 2) + '" r="4.4" fill="' + buckle + '"/><circle cx="100" cy="' + F(shTop + 1) + '" r="1.6" fill="#f0e2b2"/>';
    else if (garbSub === 2) mid += '<rect x="94" y="' + F(shTop - 2) + '" width="14" height="3" fill="' + buckle + '"/><rect x="94" y="' + F(shTop + 3) + '" width="14" height="3" fill="' + buckle + '"/>';
    else if (garbSub === 3) { // waist sash
      mid += path(poly([[100 - shW * 0.9, 206], [100 + shW * 0.9, 202], [100 + shW * 0.92, 216], [100 - shW * 0.92, 220]]), shadeHex(garb2, 1.15));
      mid += path(poly([[101, shTop - 4], [107, shTop + 2], [101, shTop + 8], [95, shTop + 2]]), buckle);
    } else if (garbSub === 4) { // inner second drape
      mid += path(poly([[100 - shW * 0.34, shTop + 4], [100 - 8, shTop - 3], [100 - 14, 240], [100 - shW * 0.44, 240]]), shadeHex(garb2, 0.85));
      mid += path(poly([[100 + shW * 0.36, shTop + 2], [100 + 10, shTop - 5], [100 + 16, 240], [100 + shW * 0.46, 240]]), shadeHex(garb2, 0.85));
    } else mid += path(poly([[101, shTop - 4], [107, shTop + 2], [101, shTop + 8], [95, shTop + 2]]), buckle);
  }
  if (gv === 3) {
    const pd = (sx: number, dir: number) => {
      const pts: Pt[] = [[sx, shTop + 14], [sx + dir * shW * 0.28, shTop - 10], [sx + dir * shW * 0.52, shTop - 2], [sx + dir * shW * 0.55, shTop + 20], [sx + dir * shW * 0.2, shTop + 30]];
      mid += path(poly(pts), metal);
      mid += path(poly([[sx + dir * shW * 0.28, shTop - 10], [sx + dir * shW * 0.52, shTop - 2], [sx + dir * shW * 0.55, shTop + 20], [sx + dir * shW * 0.36, shTop + 16]]), metalSh);
      mid += path(poly([[sx + dir * shW * 0.04, shTop + 10], [sx + dir * shW * 0.24, shTop - 6], [sx + dir * shW * 0.3, shTop - 2], [sx + dir * shW * 0.1, shTop + 14]]), metalHi, 0.6);
    };
    pd(100 - shW * 0.42, -1); pd(100 + shW * 0.44, 1);
    if (garbSub === 1) { // spiked crests on each pauldron
      mid += path(poly([[100 - shW * 0.7, shTop - 8], [100 - shW * 0.78, shTop - 22], [100 - shW * 0.56, shTop - 10]]), metalSh);
      mid += path(poly([[100 + shW * 0.72, shTop - 10], [100 + shW * 0.82, shTop - 24], [100 + shW * 0.58, shTop - 12]]), metalSh);
    }
    if (garbSub === 3) { // layered lames
      mid += seg('M' + F(100 - shW * 0.86) + ',' + F(shTop + 6) + ' L' + F(100 - shW * 0.5) + ',' + F(shTop + 2) + ' M' + F(100 - shW * 0.88) + ',' + F(shTop + 14) + ' L' + F(100 - shW * 0.48) + ',' + F(shTop + 10), 1.4, metalSh, 0.9);
      mid += seg('M' + F(100 + shW * 0.5) + ',' + F(shTop + 4) + ' L' + F(100 + shW * 0.9) + ',' + F(shTop + 8) + ' M' + F(100 + shW * 0.48) + ',' + F(shTop + 12) + ' L' + F(100 + shW * 0.92) + ',' + F(shTop + 16), 1.4, metalSh, 0.9);
    }
    if (garbSub === 4) { // fur trim beneath the steel
      for (const sx of [100 - shW * 0.68, 100 + shW * 0.44]) {
        let fz = 'M' + F(sx) + ',' + F(shTop + 30);
        for (let i = 0; i < 4; i++) fz += ' l' + F(shW * 0.07) + ',6 l' + F(shW * 0.07) + ',-6';
        mid += seg(fz, 2, shadeHex(garb2, 0.8), 0.9);
      }
    }
    mid += path(poly([[mx - nw - 2, shTop - 4], [mx - nw + 6, shTop - 8], [100 + shW * 0.6, 236], [100 + shW * 0.48, 240]]), leather);
    if (garbSub !== 2) mid += path(poly([[mx + nw + 6, shTop - 6], [mx + nw - 2, shTop - 10], [100 - shW * 0.58, 236], [100 - shW * 0.46, 240]]), leather);
    mid += '<rect x="' + F(mx - 4) + '" y="' + F(shTop + 26) + '" width="10" height="10" fill="' + buckle + '"/>';
  }
  if (gv === 4) {
    const zz: Pt[] = [[100 - shW * 0.9, shTop + 26]];
    for (let i = 0; i <= 8; i++) zz.push([100 - shW * 0.9 + i * shW * 1.8 / 8, shTop + (i % 2 ? 30 : 8) + jit(2)]);
    zz.push([100 + shW * 0.9, shTop + 24], [100 + shW * 0.7, shTop - 2], [mx + nw + 4, shTop - 10], [mx - nw - 2, shTop - 8], [100 - shW * 0.68, shTop]);
    mid += path(poly(zz), garb2);
    mid += path(poly([[100 + shW * 0.1, shTop - 6], [100 + shW * 0.7, shTop - 2], [100 + shW * 0.9, shTop + 24], [100 + shW * 0.4, shTop + 26]]), shadeHex(garb2, 0.82));
    if (garbSub === 1) { // a second, deeper pelt row
      const z2: Pt[] = [[100 - shW * 0.72, shTop + 40]];
      for (let i = 0; i <= 6; i++) z2.push([100 - shW * 0.72 + i * shW * 1.44 / 6, shTop + (i % 2 ? 44 : 26)]);
      z2.push([100 + shW * 0.72, shTop + 38], [100 + shW * 0.6, shTop + 22], [100 - shW * 0.6, shTop + 24]);
      mid += path(poly(z2), shadeHex(garb2, 0.86));
    }
    if (garbSub === 2) for (let i = 0; i < 3; i++) mid += '<rect x="' + F(mx - 9) + '" y="' + F(shTop + 40 + i * 16) + '" width="20" height="4" fill="' + leather + '"/>';
    if (garbSub === 3) { // pelt pinned at one shoulder
      mid += path(poly([[100 - shW * 0.6, shTop + 2], [mx + nw + 6, shTop - 8], [100 + shW * 0.72, shTop + 38], [100 + shW * 0.4, shTop + 44]]), shadeHex(garb2, 0.9), 0.9);
      mid += '<circle cx="' + F(100 + shW * 0.52) + '" cy="' + F(shTop + 6) + '" r="3.6" fill="' + buckle + '"/>';
    }
    if (garbSub === 4) { // a higher second collar of fur
      const z3: Pt[] = [[100 - shW * 0.6, shTop + 2]];
      for (let i = 0; i <= 5; i++) z3.push([100 - shW * 0.6 + i * shW * 1.2 / 5, shTop + (i % 2 ? 6 : -8)]);
      z3.push([100 + shW * 0.6, shTop], [100 + shW * 0.45, shTop - 12], [mx + nw + 4, shTop - 14], [mx - nw - 2, shTop - 12], [100 - shW * 0.45, shTop - 10]);
      mid += path(poly(z3), shadeHex(garb2, 1.1));
    }
  }
  if (gv === 5) {
    const cLift = garbSub === 2 ? 6 : 0;
    mid += path(poly([[mx - nw - 8, shTop - 22 + cLift], [mx - nw - 1, shTop - 26 + cLift], [mx - 1, shTop - 14 + cLift], [mx - 3, shTop + 4], [mx - nw - 9, shTop + 2]]), garb2);
    mid += path(poly([[mx + nw + 9, shTop - 24 + cLift], [mx + nw + 2, shTop - 27 + cLift], [mx + 1, shTop - 15 + cLift], [mx + 3, shTop + 3], [mx + nw + 10, shTop]]), shadeHex(garb2, 0.84));
    if (garbSub === 1) mid += '<circle cx="' + F(mx + 1) + '" cy="' + F(shTop - 8) + '" r="3.6" fill="' + buckle + '"/><circle cx="' + F(mx + 0.4) + '" cy="' + F(shTop - 8.6) + '" r="1.3" fill="#f0e2b2"/>';
    if (garbSub === 3) { // bright inner lining edge
      mid += seg('M' + F(mx - nw - 6) + ',' + F(shTop - 20 + cLift) + ' L' + F(mx - 2) + ',' + F(shTop - 11 + cLift) + ' M' + F(mx + nw + 7) + ',' + F(shTop - 22 + cLift) + ' L' + F(mx + 2) + ',' + F(shTop - 12 + cLift), 1.6, shadeHex(garb, 1.4), 0.9);
    }
    if (garbSub === 4) { // a soft scarf crossed at the throat
      mid += path(poly([[mx - nw - 4, shTop - 10], [mx + nw + 6, shTop - 16], [mx + nw + 8, shTop - 8], [mx - nw - 2, shTop - 2]]), shadeHex(garb, 1.25), 0.95);
      mid += path(poly([[mx + nw + 6, shTop - 10], [mx - nw - 4, shTop - 16], [mx - nw - 6, shTop - 8], [mx + nw + 4, shTop - 2]]), shadeHex(garb, 1.12), 0.9);
    }
  }

  // ---- finery: pendants, tabards, mail, a shoulder cap (seeded) ----
  if (neckRoll < 0.3 && (gv === 0 || gv === 2 || gv === 5)) {
    const py = shTop + 14, nv2 = Math.floor(neckRoll * 90) % 5;
    mid += seg('M' + F(mx - nw - 1) + ',' + F(shTop - 4) + ' L' + F(mx + 1) + ',' + F(py) + ' L' + F(mx + nw + 3) + ',' + F(shTop - 6), 1.2, buckle, 0.9);
    if (nv2 === 0) mid += path(poly([[mx + 1, py], [mx + 4.5, py + 4], [mx + 1, py + 8], [mx - 2.5, py + 4]]), buckle);
    else if (nv2 === 1) mid += '<circle cx="' + F(mx + 1) + '" cy="' + F(py + 3) + '" r="3" fill="' + accC + '"/>';
    else if (nv2 === 2) mid += path(poly([[mx - 1, py], [mx + 3.5, py - 1], [mx + 1.5, py + 8]]), '#ded6c2');
    else if (nv2 === 3) { for (let i = 0; i < 3; i++) mid += '<circle cx="' + F(mx - 3 + i * 4) + '" cy="' + F(py + 1.5 - Math.abs(i - 1) * 2) + '" r="1.6" fill="' + (i % 2 ? '#ded6c2' : buckle) + '"/>'; }
    else mid += '<circle cx="' + F(mx + 1) + '" cy="' + F(py + 3.5) + '" r="3.2" fill="none" stroke="' + buckle + '" stroke-width="1.7"/>';
  }
  if (gv === 0 && extraRoll < 0.3) {
    mid += path(poly([[mx - 7, shTop + 24], [mx + 9, shTop + 22], [mx + 8, 240], [mx - 8, 240]]), garb2, 0.9);
    mid += path(poly([[mx + 1, shTop + 34], [mx + 5, shTop + 39], [mx + 1, shTop + 44], [mx - 3, shTop + 39]]), garbHi);
  }
  if ((gv === 0 || gv === 1) && extraRoll >= 0.3 && extraRoll < 0.55) {
    mid += path(poly([[100 + shW * 0.3, shTop - 6], [100 + shW * 0.62, shTop - 2], [100 + shW * 0.72, shTop + 16], [100 + shW * 0.4, shTop + 22], [100 + shW * 0.22, shTop + 8]]), leather);
    mid += path(poly([[100 + shW * 0.34, shTop + 2], [100 + shW * 0.64, shTop + 6], [100 + shW * 0.66, shTop + 11], [100 + shW * 0.32, shTop + 7]]), '#5f5344');
  }
  if (gv === 3) for (let i = 0; i < 6; i++) mid += '<circle cx="' + F(mx - 12 + i * 5.4) + '" cy="' + F(shTop - 1 + (i % 2)) + '" r="2.6" fill="' + metalSh + '"/>';
  if (gv === 2) mid += seg('M' + F(100 - shW * 0.5 + 2) + ',' + F(shTop + 2) + ' L' + F(100 - 22) + ',240 M' + F(100 + shW * 0.52 - 2) + ',' + F(shTop) + ' L' + F(100 + 24) + ',240', 1.3, garbHi, 0.6);

  // ---- the head: one flat plane + one faceted shade plane ----
  const headPts: Pt[] = [
    [101, top], [100 + hw * 0.94 * fTemple, top + 10], [100 + hw * 1.0 * fCheek, top + 32],
    [100 + hw * 0.88 * fCheek, eY + 15], [100 + jw * 0.54, chin - 5], [mx + 4.5 * fChinW, chin],
    [mx - 4 * fChinW, chin + 1], [mx - jw * 0.5, chin - 4], [100 - hw * 0.92 * fCheek, eY + 17],
    [100 - hw * 1.0 * fCheek, top + 33], [100 - hw * 0.9 * fTemple, top + 11],
  ];
  mid += path(poly(headPts), skin);
  mid += path(poly([
    [mx + 3, top + 3], [100 + hw * 0.94 * fTemple, top + 10], [100 + hw * 1.0 * fCheek, top + 32],
    [100 + hw * 0.88 * fCheek, eY + 15], [100 + jw * 0.54, chin - 5], [mx + 4.5 * fChinW, chin],
    [mx + 7, chin - 12], [mx + 2, eY + 9], [mx + 8, eY - 7], [mx + 3, top + 13],
  ]), skinSh);

  // ---- the near ear ----
  const exX = 100 + hw * 0.94 * fCheek, exY2 = eY + 2;
  if (P.ear === 'round') mid += path(poly([[exX - 2, exY2 - 6 * earS], [exX + (4.2 + 0.9 * earV) * earS, exY2 - 7 * earS], [exX + (5.2 + 0.9 * earV) * earS, exY2 + 3 * earS], [exX + 1, exY2 + 7 * earS]]), skinSh);
  if (P.ear === 'point') mid += path(poly([[exX - 2, exY2 - 5], [exX + 12 * eTipK * earS, exY2 - 12 * eTipK * earS], [exX + 5 * earS, exY2 + 3], [exX, exY2 + 7 * earS]]), skinSh);
  if (P.ear === 'long') {
    mid += path(poly([[exX - 2, exY2 - 4], [exX + hw * 0.6 * eTipK, exY2 - 18 * eTipK], [exX + 6 * earS, exY2 + 3], [exX - 1, exY2 + 7 * earS]]), skinSh);
    mid += path(poly([[100 - hw * 0.98 * fCheek, exY2 - 4], [100 - hw * (0.98 + 0.3 * eTipK) * fCheek, exY2 - 4 - 8 * eTipK], [100 - hw * 0.94 * fCheek, exY2 + 3]]), skinSh);
  }
  if (P.ear === 'fin') mid += path(poly([[exX - 2, exY2 - 7], [exX + 9, exY2 - 3], [exX + 8, exY2 + 6], [exX, exY2 + 8]]), mute('#4d8a84', 0.15));
  if (earringRoll < (fem ? 0.36 : 0.18) && p.headwear !== 4 && (P.ear === 'round' || P.ear === 'point' || P.ear === 'long')) {
    const ly = exY2 + 7.5 * earS, ev2 = Math.floor(earringRoll * 90) % 5;
    if (ev2 === 0) mid += '<circle cx="' + F(exX + 2) + '" cy="' + F(ly + 2) + '" r="2.4" fill="none" stroke="' + buckle + '" stroke-width="1.4"/>';
    else if (ev2 === 1) mid += '<circle cx="' + F(exX + 2) + '" cy="' + F(ly) + '" r="1.7" fill="' + buckle + '"/>';
    else if (ev2 === 2) mid += '<circle cx="' + F(exX + 2) + '" cy="' + F(ly) + '" r="1.3" fill="' + buckle + '"/>' +
      path(poly([[exX + 0.6, ly + 1.5], [exX + 3.6, ly + 1.5], [exX + 2.1, ly + 6]]), accC);
    else if (ev2 === 3) mid += '<circle cx="' + F(exX + 1.2) + '" cy="' + F(ly) + '" r="1.3" fill="' + buckle + '"/><circle cx="' + F(exX + 4) + '" cy="' + F(ly - 3) + '" r="1.1" fill="' + buckle + '"/>';
    else mid += '<circle cx="' + F(exX + 5 * earS) + '" cy="' + F(exY2 - 4 * earS) + '" r="1.2" fill="' + buckle + '"/>' +
      seg('M' + F(exX + 5 * earS) + ',' + F(exY2 - 4 * earS) + ' L' + F(exX + 2) + ',' + F(ly), 0.9, buckle, 0.85) +
      '<circle cx="' + F(exX + 2) + '" cy="' + F(ly) + '" r="1.3" fill="' + buckle + '"/>';
  }
  if (notchRoll < 0.12 && (p.race === 'orc' || p.race === 'half-orc' || p.race === 'shifter' || p.race === 'goliath') && P.ear !== 'none') {
    mid += path(poly([[exX + 4 * earS, exY2 - 5 * earS], [exX + 8 * earS, exY2 - 6 * earS], [exX + 6 * earS, exY2 - 1]]), PAPER.bg);
  }

  // ---- muzzles + faceplates FIRST, so the eyes always sit on top ----
  // all worn straight-on, matching the frontal gaze
  if (p.race === 'dragonborn') {
    // five snout cuts; dark breeds get a brighter plate so the face never sinks
    const mzT = eY + [7, 5, 3, 5, 8][muzzV]!, mzB = chin - 2 + (muzzV === 2 ? 1 : 0), mzW = jw * [0.5, 0.58, 0.68, 0.62, 0.54][muzzV]!;
    const plateF = lumOf(skin) < 78 ? 1.5 : 1.16;
    const nostC = lumOf(skin) < 78 ? shadeHex(skin, 0.8) : skinDk;
    mid += path(poly([[mx - mzW, mzT + 2], [mx - mzW - 2, mzB - 8], [mx - jw * 0.3, mzB], [mx + jw * 0.34, mzB], [mx + mzW + 3, mzB - 9], [mx + mzW + 1, mzT + 1], [mx, mzT - 3]]), shadeHex(skin, plateF));
    mid += path(poly([[mx + 1, mzT - 2], [mx + mzW + 1, mzT + 1], [mx + mzW + 3, mzB - 9], [mx + jw * 0.34, mzB], [mx + 2, mzB]]), shadeHex(skin, plateF - 0.18));
    mid += seg('M' + F(mx - mzW * 0.66) + ',' + F(mzB - 10) + ' L' + F(mx + mzW * 0.7) + ',' + F(mzB - 11), 2, nostC, 0.85);
    mid += path(poly([[mx - 5.2, mzT + 3.5], [mx - 2.6, mzT + 1], [mx - 2, mzT + 9], [mx - 4.6, mzT + 10]]), nostC);
    mid += path(poly([[mx + 2.6, mzT + 1], [mx + 5.2, mzT + 3.5], [mx + 4.6, mzT + 10], [mx + 2, mzT + 9]]), nostC);
    if (skinIdx >= 5) { // the metallic breeds carry a sheen
      mid += path(poly([[mx - hw * 0.55, top + 12], [mx - hw * 0.2, top + 8], [mx + hw * 0.1, eY - 6], [mx - hw * 0.3, eY - 2]]), shadeHex(skin, 1.28), 0.6);
      mid += path(poly([[mx - 3, mzT + 12], [mx + 2, mzT + 11], [mx + 1.5, mzB - 12], [mx - 2.5, mzB - 12]]), shadeHex(skin, 1.3), 0.5);
    }
    // five frill settings: smooth, cheek frills, jaw spikes, scaled brow ridges, chin barbels
    if (featV === 1) {
      mid += path(poly([[100 + jw * 0.5, eY + 18], [100 + jw * 0.85, eY + 14], [100 + jw * 0.8, eY + 26], [100 + jw * 0.52, eY + 28]]), shadeHex(skin, 0.8));
      mid += path(poly([[mx - jw * 0.48, eY + 20], [mx - jw * 0.8, eY + 17], [mx - jw * 0.74, eY + 27], [mx - jw * 0.5, eY + 29]]), shadeHex(skin, 0.74));
    } else if (featV === 2) {
      for (let i = 0; i < 3; i++) {
        const jx2 = 100 + jw * (0.52 - i * 0.1), jy = chin - 8 + i * 4;
        mid += path(poly([[jx2, jy], [jx2 + 5, jy + 1.5], [jx2 + 0.5, jy + 3.5]]), shadeHex(skin, 1.3));
      }
    } else if (featV === 3) {
      mid += path(poly([[mx - eDX - 5.5, eY - 6], [mx - eDX + 5, eY - 8.5], [mx - eDX + 5.5, eY - 5], [mx - eDX - 5, eY - 3.5]]), shadeHex(skin, 0.72));
      mid += path(poly([[mx + eDX - 5, eY - 8.5], [mx + eDX + 5.5, eY - 6.5], [mx + eDX + 5, eY - 4], [mx + eDX - 4.5, eY - 5.5]]), shadeHex(skin, 0.72));
    } else if (featV === 4) {
      mid += path(poly([[mx - 4, chin], [mx - 5.5, chin + 6], [mx - 1.5, chin + 1]]), shadeHex(skin, 1.2));
      mid += path(poly([[mx + 2, chin + 1], [mx + 4.5, chin + 7], [mx + 6, chin]]), shadeHex(skin, 1.2));
    }
  }
  if (p.race === 'birdfolk') {
    // five beak cuts, each with its own horn colour; length and width move together
    const bkRef = ['#d8a03c', '#c8862c', '#8a8478', '#b0552f', '#e0c890'][muzzV]!;
    const bkC = mute(bkRef, 0.1);
    const bkW = [1, 0.9, 1.15, 1, 0.85][muzzV]!, tipY = chin - 3 + [0, 5, -3, 3, 8][muzzV]!;
    mid += path(poly([[mx, eY - 5], [mx - 4.8 * bkW, eY + 1], [mx - 5.6 * bkW, eY + 9], [mx, tipY], [mx + 5.6 * bkW, eY + 9], [mx + 4.8 * bkW, eY + 1]]), bkC);
    mid += path(poly([[mx, eY - 5], [mx + 4.8 * bkW, eY + 1], [mx + 5.6 * bkW, eY + 9], [mx, tipY]]), shadeHex(bkRef, 0.76));
    mid += path(poly([[mx - 2, tipY - 7], [mx + 2.5, tipY - 8], [mx, tipY]]), shadeHex(bkRef, 0.55));
    mid += '<circle cx="' + F(mx - 2.2) + '" cy="' + F(eY + 1.5) + '" r="0.9" fill="' + shadeHex(bkRef, 0.45) + '"/>';
    mid += '<circle cx="' + F(mx + 2.2) + '" cy="' + F(eY + 1.2) + '" r="0.9" fill="' + shadeHex(bkRef, 0.45) + '"/>';
    // five face-feather patterns: plain, bandit mask, cheek patches, brow stripes, forehead speckle
    const plC2 = shadeHex(skin, 1.25);
    if (featV === 1) mid += path(poly([[100 - hw * 0.85, eY - 5], [100 + hw * 0.88, eY - 7], [100 + hw * 0.85, eY + 4], [100 - hw * 0.8, eY + 6]]), shadeHex(skin, 0.78), 0.5);
    else if (featV === 2) { mid += path(poly([[mx - eDX - 6, eY + 5], [mx - eDX + 4, eY + 4], [mx - eDX, eY + 12]]), plC2, 0.75); mid += path(poly([[mx + eDX - 4, eY + 4], [mx + eDX + 6, eY + 5], [mx + eDX + 1, eY + 12]]), plC2, 0.75); }
    else if (featV === 3) mid += seg('M' + F(mx - eDX - 5) + ',' + F(eY - 8) + ' l10,-1.5 M' + F(mx + eDX - 5) + ',' + F(eY - 9) + ' l10,1.5', 2, plC2, 0.85);
    else if (featV === 4) { for (let i = 0; i < 6; i++) mid += '<circle cx="' + F(mx - 7 + (i % 3) * 7 + (i > 2 ? 3 : 0)) + '" cy="' + F(top + 18 + Math.floor(i / 3) * 5) + '" r="1" fill="' + plC2 + '" opacity="0.8"/>'; }
  }
  if (p.race === 'catfolk') {
    const mzS = [0.85, 0.95, 1, 1.1, 1.2][muzzV]!; // five muzzle sizes
    mid += path(poly([[mx - 8 * mzS, eY + 9], [mx - 9.5 * mzS, eY + 9 + 10 * mzS], [mx, eY + 9 + 14 * mzS], [mx + 9.5 * mzS, eY + 9 + 10 * mzS], [mx + 8 * mzS, eY + 9], [mx, eY + 7]]), mute('#e8ddca', 0.1));
    mid += path(poly([[mx - 3.5, eY + 11], [mx + 3.5, eY + 11], [mx, eY + 15.5]]), '#b96a5e');
    mid += seg('M' + F(mx) + ',' + F(eY + 15.5) + ' V' + F(eY + 15.5 + 4 * mzS), 1.3, shadeHex('#e8ddca', 0.5), 0.8);
    // five coat markings: plain, whisker dots, cheek stripes, tabby M, eye-corner streaks
    if (featV === 1) {
      for (let i = 0; i < 3; i++) {
        mid += '<circle cx="' + F(mx - 5.5 + i * 2) + '" cy="' + F(eY + 12.5 + i * 1.8) + '" r="0.55" fill="' + shadeHex('#e8ddca', 0.55) + '"/>';
        mid += '<circle cx="' + F(mx + 5.5 - i * 2) + '" cy="' + F(eY + 12.5 + i * 1.8) + '" r="0.55" fill="' + shadeHex('#e8ddca', 0.55) + '"/>';
      }
    }
    else if (featV === 2) mid += seg('M' + F(100 + hw * 0.78) + ',' + F(eY + 8) + ' l-7,2 M' + F(100 + hw * 0.8) + ',' + F(eY + 13) + ' l-6,1.5 M' + F(100 - hw * 0.74) + ',' + F(eY + 10) + ' l7,1.5', 1.8, skinDk, 0.75);
    else if (featV === 3) mid += seg('M' + F(mx - 6) + ',' + F(eY - 12) + ' l3,-4 l3,4 l3,-4 l3,4', 1.7, skinDk, 0.7);
    else if (featV === 4) mid += seg('M' + F(mx - eDX - 5) + ',' + F(eY + 1) + ' l-4,2.5 M' + F(mx + eDX + 5) + ',' + F(eY + 1) + ' l4,2.5', 1.8, skinDk, 0.75);
  }
  if (p.race === 'warforged') {
    // five plate-seam layouts
    if (muzzV === 1) mid += path(poly([[mx - 6, top + 4], [mx - 3, eY - 6], [mx - 7, eY + 10], [mx - 10, eY - 4]]), skinDk, 0.5);
    else if (muzzV === 2) mid += seg('M' + F(mx + 1) + ',' + F(top + 4) + ' L' + F(mx + 1) + ',' + F(eY - 10) + ' M' + F(mx + 1) + ',' + F(eY - 10) + ' L' + F(mx - eDX + 2) + ',' + F(eY - 4) + ' M' + F(mx + 1) + ',' + F(eY - 10) + ' L' + F(mx + eDX) + ',' + F(eY - 5), 1.8, skinDk, 0.6);
    else if (muzzV === 3) mid += seg('M' + F(mx - 7) + ',' + F(top + 6) + ' L' + F(mx - 6) + ',' + F(chin - 8) + ' M' + F(mx + 8) + ',' + F(top + 5) + ' L' + F(mx + 7) + ',' + F(chin - 9), 1.7, skinDk, 0.55);
    else if (muzzV === 4) mid += seg('M' + F(100 - hw * 0.8) + ',' + F(top + 16) + ' L' + F(mx + eDX + 6) + ',' + F(eY - 8), 1.8, skinDk, 0.55);
    else mid += path(poly([[mx + 1, top + 4], [mx + 4, eY - 6], [mx, eY + 12], [mx + 3, chin - 6], [mx, chin - 6], [mx - 3, eY + 12], [mx - 2, eY - 6]]), skinDk, 0.6);
    mid += path(poly([[100 - hw * 0.85, eY + 12], [100 + hw * 0.7, eY + 10], [100 + hw * 0.7, eY + 13], [100 - hw * 0.85, eY + 15]]), skinDk, 0.5);
    // five optic housings around the eyes (drawn now, so the eyes land on top)
    const oC = shadeHex(skin, 0.72);
    if (browWtV === 1) { for (const sx of [mx - eDX, mx + eDX]) mid += '<rect x="' + F(sx - 6.4) + '" y="' + F(eY - 4.4) + '" width="12.8" height="9" fill="' + oC + '"/>'; }
    else if (browWtV === 2) { for (const sx of [mx - eDX, mx + eDX]) mid += '<circle cx="' + F(sx) + '" cy="' + F(eY + 0.5) + '" r="5.8" fill="' + oC + '"/>'; }
    else if (browWtV === 3) mid += path(poly([[mx - eDX - 7, eY - 4], [mx + eDX + 7, eY - 5.5], [mx + eDX + 7, eY + 4.5], [mx - eDX - 7, eY + 6]]), oC);
    else if (browWtV === 4) { for (const sx of [mx - eDX, mx + eDX]) mid += path(poly([[sx - 6.5, eY + 3], [sx - 1, eY - 4.5], [sx + 6.5, eY - 3], [sx + 1, eY + 4.5]]), oC); }
    // five vent mouths
    if (featV === 1) mid += '<rect x="' + F(mx - 7) + '" y="' + F(chin - 15) + '" width="15" height="2.4" fill="' + shadeHex(skin, 0.6) + '"/><rect x="' + F(mx - 7) + '" y="' + F(chin - 11) + '" width="15" height="2.4" fill="' + shadeHex(skin, 0.6) + '"/>';
    else if (featV === 2) mid += '<circle cx="' + F(mx + 0.5) + '" cy="' + F(chin - 12) + '" r="4.6" fill="' + shadeHex(skin, 0.6) + '"/><circle cx="' + F(mx + 0.5) + '" cy="' + F(chin - 12) + '" r="2" fill="' + shadeHex(skin, 0.4) + '"/>';
    else if (featV === 3) { mid += '<rect x="' + F(mx - 9) + '" y="' + F(chin - 16) + '" width="19" height="7" fill="' + shadeHex(skin, 0.6) + '"/>'; for (let i = 0; i < 4; i++) mid += '<rect x="' + F(mx - 7 + i * 4.4) + '" y="' + F(chin - 15) + '" width="1.6" height="5" fill="' + shadeHex(skin, 0.4) + '"/>'; }
    else if (featV === 4) { for (let i = 0; i < 3; i++) mid += '<circle cx="' + F(mx - 5 + i * 5.5) + '" cy="' + F(chin - 12) + '" r="1.7" fill="' + shadeHex(skin, 0.55) + '"/>'; }
    else { mid += '<rect x="' + F(mx - 8) + '" y="' + F(chin - 16) + '" width="17" height="7" fill="' + shadeHex(skin, 0.6) + '"/>'; for (let i = 0; i < 3; i++) mid += '<rect x="' + F(mx - 5.5 + i * 5) + '" y="' + F(chin - 15) + '" width="2" height="5" fill="' + shadeHex(skin, 0.4) + '"/>'; }
  }

  // ---- eyes: the one feature that speaks ----
  const ev = p.eyes % 4;
  const lashC = mixHex(skinDk, '#241c14', 0.5);
  const eyeAt = (sx: number, w: number) => {
    let s = '';
    if (p.race === 'warforged') s += '<rect x="' + F(sx - 6 * w) + '" y="' + F(eY - 3.4) + '" width="' + F(12 * w) + '" height="7" rx="3.5" fill="' + irisC + '" opacity="0.25"/>';
    if (ev === 0) { s += path(poly([[sx - 4.6 * w, eY - 0.4], [sx + 4.6 * w, eY - 1.2], [sx + 4.6 * w, eY + 0.2], [sx - 4.6 * w, eY + 0.8]]), lashC);
      s += path(poly([[sx - 3.8 * w, eY + 0.8], [sx + 3.8 * w, eY + 0.2], [sx + 2.6 * w, eY + 2.4], [sx - 2.6 * w, eY + 2.8]]), irisC); }
    if (ev === 1) { s += path(poly([[sx - 3.4 * w, eY - 1.6], [sx + 3.4 * w, eY - 2.2], [sx + 3.4 * w, eY - 0.6], [sx - 3.4 * w, eY]]), lashC);
      s += path(poly([[sx - 2.8 * w, eY], [sx + 2.8 * w, eY - 0.6], [sx + 2.8 * w, eY + 2.6], [sx - 2.8 * w, eY + 3]]), irisC); }
    if (ev === 2) { s += path(poly([[sx - 5 * w, eY], [sx + 5 * w, eY - 1.2], [sx + 5 * w, eY], [sx - 5 * w, eY + 1]]), lashC);
      s += path(poly([[sx - 4 * w, eY + 1], [sx + 4 * w, eY], [sx + 3 * w, eY + 1.8], [sx - 3 * w, eY + 2.4]]), irisC); }
    if (ev === 3) { s += path(poly([[sx - 4.6 * w, eY - 1.6], [sx + 4.6 * w, eY - 2.6], [sx + 4.6 * w, eY - 0.2], [sx - 4.6 * w, eY + 0.6]]), lashC);
      s += path(poly([[sx - 3 * w, eY + 0.6], [sx + 3 * w, eY - 0.2], [sx + 2.2 * w, eY + 1.8], [sx - 2.2 * w, eY + 2.2]]), irisC); }
    return s;
  };
  // five eye tilts: the pair rotates in mirror around each pupil, droop to cat-eye
  const eyeTilted = (sx: number, w: number, rot: number) => '<g transform="rotate(' + F(rot) + ' ' + F(sx) + ' ' + F(eY) + ')">' + eyeAt(sx, w) + '</g>';
  mid += eyeTilted(mx - eDX, 0.92 * eSc, eyeTilt) + eyeTilted(mx + eDX, eSc, -eyeTilt);

  // ---- brows: one angled bar each ----
  if (!NO_BROWS.has(p.race)) {
    const bv = p.brows % 4, bY = eY - 7 + browLift, bWd = 6.5 * P.brow * (fem ? 0.8 : 1) * (0.94 + browWtV * 0.035);
    const bCol = HAIRLESS.has(p.race) ? skinDk : mixHex(hair, '#2e241c', 0.35);
    const bT = (fem ? 1.6 : 2.6) * browWt;
    const tilt = [0.6, 2.2, 0.2, -1.6][bv]!;
    const bAt = (sx: number, dir: number) => {
      const x0 = sx - bWd, x1 = sx + bWd;
      const ya = dir > 0 ? bY + tilt : bY - tilt, yb = dir > 0 ? bY - tilt : bY + tilt;
      return path(poly([[x0, ya], [x1, yb], [x1, yb + bT], [x0, ya + bT]]), bCol);
    };
    mid += bAt(mx - eDX, 1) + bAt(mx + eDX, -1);
  }

  // ---- nose: rendered as quiet shading, four cuts (recipe axis) ----
  const nv = p.nose % 4;
  if (!MUZZLED.has(p.race) && p.race !== 'dragonborn' && nv > 0) {
    const nLen = 10 + jit(1.5) + noseLn + (nv === 2 ? 3 : 0) + (p.race === 'gnome' ? 2 : 0);
    const nB = eY + 4 + nLen;
    if (nv === 1) mid += path(poly([[mx + 1, eY + 2], [mx + 2.8, eY + 4], [mx + 2.2, nB], [mx, nB + 1.5], [mx - 2.2, nB]]), skinSh, 0.75);
    if (nv === 2) {
      mid += path(poly([[mx + 0.5, eY + 1], [mx + 3, eY + 3], [mx + 2.6, nB], [mx - 0.5, nB + 2], [mx - 2.6, nB - 0.5]]), skinSh, 0.8);
      mid += seg('M' + F(mx - 2.4) + ',' + F(nB + 0.5) + ' L' + F(mx + 2.4) + ',' + F(nB + 0.8), 1.2, skinDk, 0.4);
    }
    if (nv === 3) {
      mid += path(poly([[mx + 1, eY + 3], [mx + 2.6, eY + 5], [mx + 3.8, nB - 1], [mx, nB + 2], [mx - 3.8, nB - 1]]), skinSh, 0.75);
      mid += '<circle cx="' + F(mx - 2.5) + '" cy="' + F(nB) + '" r="0.8" fill="' + skinDk + '" opacity="0.55"/><circle cx="' + F(mx + 2.7) + '" cy="' + F(nB) + '" r="0.8" fill="' + skinDk + '" opacity="0.55"/>';
    }
  }

  // ---- mouth: a quiet seam, four cuts (recipe axis) ----
  const mv = p.mouth % 4;
  if (!MUZZLED.has(p.race) && p.race !== 'dragonborn' && p.race !== 'warforged') {
    const mY = chin - 11 + jit(1), mw = (7 + jit(1)) * mouthW * (fem ? 0.95 : 1);
    const mCol = mixHex(skinDk, '#5a2f28', 0.35);
    if (mv === 0) mid += seg('M' + F(mx - mw * 0.55) + ',' + F(mY) + ' L' + F(mx + mw * 0.6) + ',' + F(mY - 0.3), 1.5, mCol, 0.55);
    if (mv === 1) mid += seg('M' + F(mx - mw * 0.6) + ',' + F(mY + 0.5) + ' L' + F(mx) + ',' + F(mY + 1.6) + ' L' + F(mx + mw * 0.65) + ',' + F(mY - 0.8), 1.5, mCol, 0.6);
    if (mv === 2) mid += seg('M' + F(mx - mw * 0.7) + ',' + F(mY) + ' L' + F(mx + mw * 0.75) + ',' + F(mY + 0.2), 1.9, mCol, 0.7);
    if (mv === 3) {
      mid += path(poly([[mx - mw * 0.5, mY - 0.5], [mx + mw * 0.55, mY - 1], [mx + mw * 0.4, mY + 1], [mx - mw * 0.38, mY + 1.3]]), mCol, fem ? 0.8 : 0.55);
      mid += path(poly([[mx - mw * 0.36, mY + 1.3], [mx + mw * 0.4, mY + 1], [mx + mw * 0.25, mY + 3], [mx - mw * 0.25, mY + 3.2]]), fem ? mixHex('#b06a5c', skin, 0.35) : shadeHex(skin, 1.1), 0.85);
    }
  }

  // ---- small identities: mole, under-eye tone, forehead crease ----
  if (moleRoll < 0.12 && !MUZZLED.has(p.race) && p.race !== 'dragonborn' && p.race !== 'warforged') {
    const mp = ([[mx - 7, chin - 16], [mx + 8, eY + 12], [mx - 9, eY + 14], [mx - eDX - 2, eY - 13], [mx + 5, chin + 7]] as Pt[])[Math.floor(moleRoll * 50) % 5]!;
    mid += '<circle cx="' + F(mp[0]) + '" cy="' + F(mp[1]) + '" r="0.95" fill="' + skinDk + '" opacity="0.85"/>';
  }
  if (ageRoll < 0.12 && p.race !== 'warforged') {
    mid += seg('M' + F(mx - eDX - 3) + ',' + F(eY + 4.5) + ' l6,0.6 M' + F(mx + eDX - 3) + ',' + F(eY + 4.8) + ' l6,0.3', 1.3, skinSh, 0.7);
    if (!fem) mid += seg('M' + F(mx - 8) + ',' + F(top + 20) + ' q8,1.5 16,0', 1.1, skinSh, 0.6);
  }
  // spectacles or an eyepatch — never both; five cuts of each
  if (specRoll < 0.055 && !MUZZLED.has(p.race) && p.race !== 'dragonborn' && p.race !== 'warforged' && p.headwear !== 4) {
    const wire = '#443c30', spV = Math.floor(specRoll * 900) % 5;
    if (spV === 1) { // square frames
      for (const sx of [mx - eDX, mx + eDX]) mid += '<rect x="' + F(sx - 5) + '" y="' + F(eY - 4.4) + '" width="10" height="9.6" fill="none" stroke="' + wire + '" stroke-width="1.2"/>';
      mid += seg('M' + F(mx - eDX + 5) + ',' + F(eY - 0.5) + ' L' + F(mx + eDX - 5) + ',' + F(eY - 0.5), 1.2, wire, 0.95);
    } else if (spV === 2) { // a monocle on the near eye, chain to the cheek
      mid += '<circle cx="' + F(mx + eDX) + '" cy="' + F(eY + 0.5) + '" r="5.6" fill="none" stroke="' + wire + '" stroke-width="1.3"/>';
      mid += seg('M' + F(mx + eDX + 4) + ',' + F(eY + 4.5) + ' Q' + F(mx + eDX + 8) + ',' + F(eY + 14) + ' ' + F(mx + jw * 0.4) + ',' + F(chin - 6), 0.9, wire, 0.8);
    } else if (spV === 3) { // small ovals
      for (const sx of [mx - eDX, mx + eDX]) mid += '<ellipse cx="' + F(sx) + '" cy="' + F(eY + 0.5) + '" rx="4.4" ry="3.6" fill="none" stroke="' + wire + '" stroke-width="1.2"/>';
      mid += seg('M' + F(mx - eDX + 4.4) + ',' + F(eY - 0.5) + ' Q' + F(mx) + ',' + F(eY - 2.5) + ' ' + F(mx + eDX - 4.4) + ',' + F(eY - 0.5), 1.2, wire, 0.95);
      mid += seg('M' + F(mx + eDX + 4.4) + ',' + F(eY) + ' L' + F(exX + 2) + ',' + F(exY2 - 2), 1.1, wire, 0.85);
    } else if (spV === 4) { // half-rims riding under the eyes
      for (const sx of [mx - eDX, mx + eDX]) mid += seg('M' + F(sx - 5) + ',' + F(eY + 0.5) + ' Q' + F(sx) + ',' + F(eY + 6.5) + ' ' + F(sx + 5) + ',' + F(eY + 0.5), 1.3, wire, 0.95);
      mid += seg('M' + F(mx - eDX + 5) + ',' + F(eY) + ' L' + F(mx + eDX - 5) + ',' + F(eY), 1.1, wire, 0.9);
    } else { // round wire frames
      mid += '<circle cx="' + F(mx - eDX) + '" cy="' + F(eY + 0.5) + '" r="5.4" fill="none" stroke="' + wire + '" stroke-width="1.2"/>';
      mid += '<circle cx="' + F(mx + eDX) + '" cy="' + F(eY + 0.5) + '" r="5.4" fill="none" stroke="' + wire + '" stroke-width="1.2"/>';
      mid += seg('M' + F(mx - eDX + 5.4) + ',' + F(eY - 0.5) + ' Q' + F(mx) + ',' + F(eY - 2.5) + ' ' + F(mx + eDX - 5.4) + ',' + F(eY - 0.5), 1.2, wire, 0.95);
      mid += seg('M' + F(mx + eDX + 5.4) + ',' + F(eY) + ' L' + F(exX + 2) + ',' + F(exY2 - 2), 1.1, wire, 0.85);
    }
  } else if (patchRoll < 0.045 && !MUZZLED.has(p.race) && p.race !== 'dragonborn' && p.headwear !== 4) {
    const pc = '#2f2a26', pv3 = Math.floor(patchRoll * 900) % 5;
    const bandW = pv3 === 4 ? 3.2 : 1.7;
    mid += seg('M' + F(100 - hw * 0.88) + ',' + F(eY - 7) + ' L' + F(nearEx - 6) + ',' + F(eY - 4) + ' M' + F(nearEx + 6) + ',' + F(eY - 6) + ' L' + F(100 + hw * 0.9) + ',' + F(eY - 9), bandW, pc, 0.9);
    if (pv3 === 1) mid += '<circle cx="' + F(nearEx) + '" cy="' + F(eY) + '" r="6" fill="' + pc + '"/>';
    else if (pv3 === 2) { mid += path(poly([[nearEx - 6, eY - 5], [nearEx + 6, eY - 6], [nearEx + 5.5, eY + 4], [nearEx - 5, eY + 5]]), pc);
      mid += '<circle cx="' + F(nearEx) + '" cy="' + F(eY) + '" r="1.2" fill="' + buckle + '"/>'; }
    else if (pv3 === 3) mid += path(poly([[nearEx - 6.5, eY - 3], [nearEx + 5, eY - 7], [nearEx + 6, eY + 3], [nearEx - 4, eY + 6]]), pc);
    else mid += path(poly([[nearEx - 6, eY - 5], [nearEx + 6, eY - 6], [nearEx + 5.5, eY + 4], [nearEx - 5, eY + 5]]), pc);
  }

  // ---- marks of a life: scars + war-paint (seeded, sparse) ----
  if (!MUZZLED.has(p.race) && p.race !== 'dragonborn' && scarRoll < (fem ? 0.15 : 0.3)) {
    const sv = Math.floor(scarRoll * 100) % 5;
    if (sv === 0) mid += seg('M' + F(nearEx - 1) + ',' + F(eY - 12) + ' L' + F(nearEx) + ',' + F(eY - 3.6) + ' M' + F(nearEx) + ',' + F(eY + 3.4) + ' L' + F(nearEx + 1) + ',' + F(eY + 9), 1.6, skinDk, 0.8);
    else if (sv === 1) mid += seg('M' + F(mx - hw * 0.62) + ',' + F(eY + 10) + ' L' + F(mx - hw * 0.36) + ',' + F(eY + 16), 1.6, skinDk, 0.75);
    else if (sv === 2) mid += seg('M' + F(mx - 3) + ',' + F(chin - 8) + ' L' + F(mx + 3) + ',' + F(chin - 10), 1.4, skinDk, 0.7);
    else if (sv === 3) mid += seg('M' + F(mx - eDX - 4) + ',' + F(eY - 13) + ' L' + F(mx - eDX + 1) + ',' + F(eY - 4) + ' M' + F(mx - eDX + 1.5) + ',' + F(eY + 3) + ' L' + F(mx - eDX + 5) + ',' + F(eY + 14), 1.6, skinDk, 0.8);
    else mid += seg('M' + F(mx + nw * 0.4) + ',' + F(chin + 6) + ' L' + F(mx + nw * 0.9) + ',' + F(chin + 13), 1.6, skinDk, 0.7);
  }
  if ((p.race === 'orc' || p.race === 'half-orc' || p.race === 'goliath' || p.race === 'shifter') && paintRoll < 0.32) {
    const wp = mute('#7d3b34', 0.2), pv = Math.floor(paintRoll * 90) % 5;
    if (pv === 0) mid += seg('M' + F(nearEx - 3) + ',' + F(eY + 5) + ' v7 M' + F(nearEx + 2.5) + ',' + F(eY + 5) + ' v7', 2.4, wp, 0.85);
    else if (pv === 1) mid += path(poly([[mx - hw * 0.7, eY - 13], [mx + hw * 0.62, eY - 15], [mx + hw * 0.62, eY - 10.5], [mx - hw * 0.7, eY - 8.5]]), wp, 0.5);
    else if (pv === 2) mid += seg('M' + F(mx + 0.5) + ',' + F(chin - 8) + ' L' + F(mx + 0.5) + ',' + F(chin - 1), 3.2, wp, 0.8);
    else if (pv === 3) mid += path(poly([[mx - eDX - 6, eY - 4], [mx + eDX + 6, eY - 6], [mx + eDX + 6, eY + 4], [mx - eDX - 6, eY + 5]]), wp, 0.32);
    else mid += seg('M' + F(mx - hw * 0.72) + ',' + F(eY + 8) + ' l5,6 M' + F(mx - hw * 0.55) + ',' + F(eY + 7) + ' l5,6 M' + F(mx - hw * 0.38) + ',' + F(eY + 6) + ' l5,6', 2, wp, 0.8);
  }
  // inked marks: a few cultures wear thin tattoos
  if (tatRoll < 0.14 && (p.race === 'elf' || p.race === 'half-elf' || p.race === 'tiefling' || p.race === 'kalashtar' || p.race === 'simic' || p.race === 'human')) {
    const tk = mixHex(skinDk, '#3c4a5e', 0.5), tv = Math.floor(tatRoll * 200) % 5;
    if (tv === 0) mid += seg('M' + F(mx - hw * 0.72) + ',' + F(eY - 8) + ' q-3,8 1,16 M' + F(mx - hw * 0.6) + ',' + F(eY - 5) + ' q-2.4,6 0.8,12', 1.1, tk, 0.7);
    else if (tv === 1) mid += seg('M' + F(mx - eDX - 3) + ',' + F(eY + 8) + ' l2.6,2.6 l2.6,-2.6 M' + F(mx - eDX - 3) + ',' + F(eY + 12) + ' l2.6,2.6 l2.6,-2.6', 1.1, tk, 0.7);
    else if (tv === 2) { for (let i = 0; i < 3; i++) mid += '<circle cx="' + F(nearEx - 3 + i * 3) + '" cy="' + F(eY + 7 + i * 0.6) + '" r="0.8" fill="' + tk + '" opacity="0.75"/>'; }
    else if (tv === 3) mid += path(poly([[mx, top + 16], [mx + 2.5, top + 19], [mx, top + 22], [mx - 2.5, top + 19]]), tk, 0.7) + seg('M' + F(mx) + ',' + F(top + 22) + ' V' + F(top + 26), 1.1, tk, 0.7);
    else mid += seg('M' + F(mx + jw * 0.42) + ',' + F(chin - 4) + ' l4,-2 M' + F(mx + jw * 0.42) + ',' + F(chin - 8) + ' l4,-2 M' + F(mx + jw * 0.42) + ',' + F(chin - 12) + ' l4,-2', 1.1, tk, 0.7);
  }
  // freckles: five constellations — bridge, under both eyes, temple spray, chin dots, dense field
  if (freckRoll < 0.14 && !MUZZLED.has(p.race) && p.race !== 'dragonborn' && p.race !== 'warforged' && p.race !== 'goliath') {
    const fD = (x: number, y: number) => { mid += '<circle cx="' + F(x + jit(0.8)) + '" cy="' + F(y + jit(0.6)) + '" r="0.62" fill="' + skinDk + '" opacity="0.5"/>'; };
    if (freckV === 1) { for (let i = 0; i < 4; i++) { fD(mx - eDX - 4 + (i % 2) * 4, eY + 9 + Math.floor(i / 2) * 3); fD(mx + eDX - 1 + (i % 2) * 4, eY + 9 + Math.floor(i / 2) * 3); } }
    else if (freckV === 2) { for (let i = 0; i < 4; i++) fD(100 + hw * 0.55 - (i % 2) * 5, top + 26 + i * 3); }
    else if (freckV === 3) { for (let i = 0; i < 3; i++) fD(mx - 3 + i * 3.2, chin - 5 - (i % 2) * 2); }
    else if (freckV === 4) { for (let i = 0; i < 9; i++) fD(mx - 8 + (i % 5) * 3.4, eY + 6 + Math.floor(i / 5) * 3.4); }
    else { for (let i = 0; i < 5; i++) fD(mx - 6.5 + i * 3.1, eY + 7 + (i % 2 ? 1.6 : 0)); }
  }

  // ---- race features ----
  if (p.race === 'orc' || p.race === 'half-orc') {
    // five tusk settings: short, standard, long, wide-set, one broken
    const base = p.race === 'orc' ? 10 : 7;
    const thL = Math.max(3, base + [-3, 0, 3, 0, -4][featV]!), thR = Math.max(3, base + [-3, 0, 3, 0, 2][featV]!);
    const spread = featV === 3 ? 3 : 0;
    crown += path(poly([[mx - 9 - spread, chin - 4], [mx - 6.5 - spread, chin - 4 - thL], [mx - 3.5 - spread, chin - 5]]), '#e6dfc8');
    crown += path(poly([[mx + 5 + spread, chin - 5], [mx + 8 + spread, chin - 6 - thR], [mx + 11 + spread, chin - 5]]), '#e6dfc8');
    if (beadRoll < 0.16) { // banded tusk tips
      crown += '<rect x="' + F(mx - 8.6 - spread) + '" y="' + F(chin - 5 - thL * 0.66) + '" width="4.4" height="2.2" fill="' + buckle + '"/>';
      crown += '<rect x="' + F(mx + 6 + spread) + '" y="' + F(chin - 6 - thR * 0.66) + '" width="4.4" height="2.2" fill="' + buckle + '"/>';
    }
  }
  if (p.race === 'tiefling') { // five horn types
    const bone = mute('#a89578', 0.1), boneSh = shadeHex('#a89578', 0.76);
    const hornR: Pt[] = ([
      [[100 + hw * 0.5, top + 12], [100 + hw * 0.62, top - 10], [100 + hw * 0.92, top - 22], [100 + hw * 1.0, top - 16], [100 + hw * 0.78, top + 4], [100 + hw * 0.68, top + 14]],
      [[100 + hw * 0.48, top + 8], [100 + hw * 0.95, top - 2], [100 + hw * 1.22, top + 12], [100 + hw * 1.02, top + 26], [100 + hw * 0.72, top + 20]],
      [[100 + hw * 0.5, top + 10], [100 + hw * 0.95, top - 4], [100 + hw * 1.28, top - 8], [100 + hw * 1.12, top + 2], [100 + hw * 0.72, top + 12]],
      [[100 + hw * 0.52, top + 10], [100 + hw * 0.63, top - 3], [100 + hw * 0.8, top + 1], [100 + hw * 0.7, top + 12]],
      [[100 + hw * 0.5, top + 12], [100 + hw * 0.62, top - 8], [100 + hw * 0.48, top - 18], [100 + hw * 0.32, top - 15], [100 + hw * 0.44, top - 4], [100 + hw * 0.4, top + 10]],
    ] as Pt[][])[hornV]!;
    const hornL: Pt[] = ([
      [[mx - hw * 0.55, top + 12], [mx - hw * 0.68, top - 6], [mx - hw * 0.9, top - 16], [mx - hw * 0.96, top - 10], [mx - hw * 0.76, top + 6], [mx - hw * 0.6, top + 14]],
      [[mx - hw * 0.5, top + 10], [mx - hw * 0.9, top + 2], [mx - hw * 1.1, top + 14], [mx - hw * 0.92, top + 24], [mx - hw * 0.62, top + 18]],
      [[mx - hw * 0.5, top + 10], [mx - hw * 0.85, top], [mx - hw * 1.08, top - 3], [mx - hw * 0.92, top + 6], [mx - hw * 0.58, top + 13]],
      [[mx - hw * 0.5, top + 10], [mx - hw * 0.6, top], [mx - hw * 0.74, top + 3], [mx - hw * 0.64, top + 12]],
      [[mx - hw * 0.48, top + 12], [mx - hw * 0.58, top - 5], [mx - hw * 0.46, top - 13], [mx - hw * 0.32, top - 10], [mx - hw * 0.42, top - 1], [mx - hw * 0.38, top + 10]],
    ] as Pt[][])[hornV]!;
    crown += path(poly(hornL), boneSh) + path(poly(hornR), bone);
    if (hornV < 2) crown += path(poly(hornV === 0
      ? [[100 + hw * 0.55, top + 10], [100 + hw * 0.66, top - 2], [100 + hw * 0.74, top + 2], [100 + hw * 0.66, top + 12]]
      : [[100 + hw * 0.6, top + 10], [100 + hw * 0.85, top + 4], [100 + hw * 0.8, top + 12], [100 + hw * 0.62, top + 16]]), boneSh);
  }
  if (p.race === 'dragonborn') { // five horn types
    const hornC = mute('#b0a284', 0.1), hornS = shadeHex('#b0a284', 0.75);
    if (hornV === 0) { // swept back
      crown += path(poly([[100 + hw * 0.35, top + 8], [100 + hw * 0.72, top - 6], [100 + hw * 1.15, top - 14], [100 + hw * 1.22, top - 7], [100 + hw * 0.82, top + 5], [100 + hw * 0.55, top + 14]]), hornC);
      crown += path(poly([[100 + hw * 0.82, top + 5], [100 + hw * 1.15, top - 14], [100 + hw * 1.22, top - 7], [100 + hw * 0.9, top + 7]]), hornS);
      crown += path(poly([[mx - hw * 0.42, top + 8], [mx - hw * 0.72, top - 5], [mx - hw * 0.98, top - 10], [mx - hw * 0.9, top - 3], [mx - hw * 0.55, top + 12]]), hornS);
    } else if (hornV === 1) { // heavy ram curls
      crown += path(poly([[100 + hw * 0.38, top + 8], [100 + hw * 0.85, top - 2], [100 + hw * 1.12, top + 10], [100 + hw * 0.95, top + 24], [100 + hw * 0.68, top + 18]]), hornC);
      crown += path(poly([[mx - hw * 0.42, top + 8], [mx - hw * 0.8, top + 2], [mx - hw * 0.98, top + 12], [mx - hw * 0.82, top + 22], [mx - hw * 0.56, top + 16]]), hornS);
    } else if (hornV === 2) { // twin upright spikes
      crown += path(poly([[100 + hw * 0.25, top + 5], [100 + hw * 0.4, top - 16], [100 + hw * 0.55, top + 5]]), hornC);
      crown += path(poly([[mx - hw * 0.18, top + 6], [mx - hw * 0.34, top - 12], [mx - hw * 0.5, top + 7]]), hornS);
    } else if (hornV === 3) { // a crown of short spikes
      for (let i = 0; i < 4; i++) {
        const bx = mx - hw * 0.35 + i * hw * 0.34;
        crown += path(poly([[bx, top + 6 - i], [bx + 4, top - 5 - i * 1.5], [bx + 8, top + 6 - i]]), i % 2 ? hornS : hornC);
      }
    } else { // bull-wide, tips up
      crown += path(poly([[100 + hw * 0.5, top + 10], [100 + hw * 1.15, top + 4], [100 + hw * 1.32, top - 8], [100 + hw * 1.22, top + 12], [100 + hw * 0.62, top + 18]]), hornC);
      crown += path(poly([[mx - hw * 0.45, top + 10], [mx - hw * 0.95, top + 5], [mx - hw * 1.1, top - 5], [mx - hw * 1.0, top + 12], [mx - hw * 0.55, top + 16]]), hornS);
    }
  }
  if (p.race === 'birdfolk') { // five plumage patterns
    const plC = shadeHex(skin, 1.18), plS = shadeHex(skin, 0.85);
    if (plumV === 0) { // back fan
      for (let i = 0; i < 4; i++) {
        const bx = 100 + hw * 0.05 + i * hw * 0.17, by = top + 5 - i * 1.5;
        crown += path(poly([[bx, by], [bx + 13 + i * 3.5, by - 15 - i * 2.5], [bx + 18 + i * 3.5, by - 10 - i * 2.5], [bx + 8, by + 4]]), i % 2 ? plS : plC);
      }
    } else if (plumV === 1) { // upright crest ridge
      for (let i = 0; i < 5; i++) {
        const bx = mx - hw * 0.34 + i * hw * 0.24, lift = 12 + (2 - Math.abs(i - 2)) * 5;
        crown += path(poly([[bx, top + 6], [bx + 3, top + 6 - lift], [bx + 7, top + 6]]), i % 2 ? plS : plC);
      }
    } else if (plumV === 2) { // long trailing plumes
      crown += path(poly([[100 + hw * 0.4, top + 4], [100 + hw * 1.3, top + 24], [100 + hw * 1.42, eY + 16], [100 + hw * 1.08, eY + 6], [100 + hw * 0.72, top + 12]]), plC);
      crown += path(poly([[100 + hw * 0.3, top + 8], [100 + hw * 1.05, top + 30], [100 + hw * 1.14, eY + 10], [100 + hw * 0.6, top + 16]]), plS);
    } else if (plumV === 3) { // short full crest, ear to ear
      for (let i = 0; i < 6; i++) {
        const bx = mx - hw * 0.55 + i * hw * 0.26;
        crown += path(poly([[bx, top + 8], [bx + 4, top - 3], [bx + 9, top + 8]]), i % 2 ? plS : plC);
      }
    } else { // twin tufts
      crown += path(poly([[mx - hw * 0.35, top + 6], [mx - hw * 0.5, top - 12], [mx - hw * 0.12, top + 4]]), plS);
      crown += path(poly([[100 + hw * 0.4, top + 5], [100 + hw * 0.62, top - 14], [100 + hw * 0.78, top + 4]]), plC);
    }
  }
  if (p.race === 'catfolk') { // ear dial drives the cat ears too
    const ce = (cx0: number, w: number, hgt: number) => {
      crown += path(poly([[cx0, top + 8], [cx0 + w * 0.5, top - hgt], [cx0 + w, top + 10]]), skin) +
        path(poly([[cx0 + w * 0.3, top + 5], [cx0 + w * 0.5, top - hgt * 0.5], [cx0 + w * 0.7, top + 6]]), skinDk);
      if (earV >= 3) crown += path(poly([[cx0 + w * 0.42, top - hgt + 3], [cx0 + w * 0.5, top - hgt - 4], [cx0 + w * 0.58, top - hgt + 3]]), skinDk);
    };
    ce(mx - hw * 0.6, 11 + earV * 1.6, 8 + earV * 2.4); ce(100 + hw * 0.25, 13 + earV * 1.8, 10 + earV * 2.6);
  }
  if (p.race === 'goliath') { // five stone markings
    if (featV === 1) mid += path(poly([[mx - eDX - 7, eY - 11], [mx + eDX + 7, eY - 13], [mx + eDX + 7, eY - 9], [mx - eDX - 7, eY - 7]]), skinSh, 0.8);
    else if (featV === 2) mid += seg('M' + F(100 + hw * 0.6) + ',' + F(eY + 8) + ' l-6,4 M' + F(100 + hw * 0.66) + ',' + F(eY + 14) + ' l-6,4', 2.4, skinSh, 0.85);
    else if (featV === 3) mid += path(poly([[mx - jw * 0.5, chin - 12], [mx - jw * 0.24, chin - 16], [mx - jw * 0.2, chin - 4], [mx - jw * 0.46, chin - 2]]), skinSh, 0.8);
    else if (featV === 4) mid += path(poly([[mx - hw * 0.6, top + 8], [mx + hw * 0.66, top + 6], [mx + hw * 0.6, top + 14], [mx - hw * 0.55, top + 16]]), skinSh, 0.7);
    else mid += path(poly([[mx - hw * 0.4, top + 14], [mx + 2, top + 12], [mx - 4, top + 32], [mx - hw * 0.5, top + 30]]), skinSh, 0.8);
  }
  if (p.race === 'shifter') { // five fur growths: trimmed, jawline, long, full wrap, high tufts
    const furC = mixHex(skin, hair, 0.5);
    const ext = [0, 4, 8, 14, -4][featV]!, hi = featV === 4 ? 6 : 0;
    front += path(poly([[100 - jw * 0.7, eY + 12 - hi], [100 - jw * 0.5, chin + 4 + ext * 0.5], [100 - jw * 0.2, chin - 2 + ext], [100 - jw * 0.42, eY + 14 - hi]]), furC, 0.9);
    front += path(poly([[100 + jw * 0.66, eY + 10 - hi], [100 + jw * 0.5, chin + 2 + ext * 0.5], [100 + jw * 0.2, chin - 4 + ext], [100 + jw * 0.4, eY + 12 - hi]]), furC, 0.9);
    if (featV === 3) front += path(poly([[mx - 8, chin + 2], [mx + 9, chin + 1], [mx + 1, chin + 8]]), furC, 0.9);
  }
  if (p.race === 'kalashtar') { // five spirit-marks on the brow
    const gC = '#9db4cc';
    if (featV === 1) front += '<rect x="' + F(mx - 1.2) + '" y="' + F(eY - 16) + '" width="2.6" height="8" fill="' + gC + '"/>';
    else if (featV === 2) front += '<circle cx="' + F(mx - 3) + '" cy="' + F(eY - 12) + '" r="1.6" fill="' + gC + '"/><circle cx="' + F(mx + 3.5) + '" cy="' + F(eY - 12) + '" r="1.6" fill="' + gC + '"/>';
    else if (featV === 3) front += seg('M' + F(mx - 4) + ',' + F(eY - 10) + ' Q' + F(mx) + ',' + F(eY - 15) + ' ' + F(mx + 4) + ',' + F(eY - 10), 1.8, gC, 0.95);
    else if (featV === 4) front += '<circle cx="' + F(mx) + '" cy="' + F(eY - 12) + '" r="3.4" fill="none" stroke="' + gC + '" stroke-width="1.3"/><circle cx="' + F(mx) + '" cy="' + F(eY - 12) + '" r="1.2" fill="' + gC + '"/>';
    else front += path(poly([[mx, eY - 15], [mx + 3, eY - 12], [mx, eY - 9], [mx - 3, eY - 12]]), gC);
  }
  if (p.race === 'aasimar') { // five halos
    const hC = '#cbb268';
    if (featV === 1) back += '<ellipse cx="' + F(mx + 1) + '" cy="' + F(top - 8) + '" rx="24" ry="5.5" fill="none" stroke="' + hC + '" stroke-width="4"/>';
    else if (featV === 2) {
      back += '<ellipse cx="' + F(mx + 1) + '" cy="' + F(top - 8) + '" rx="22" ry="5" fill="none" stroke="' + hC + '" stroke-width="2.2"/>';
      for (const dx of [-30, -14, 14, 30]) back += seg('M' + F(mx + 1 + dx) + ',' + F(top - 8 - (Math.abs(dx) > 20 ? 2 : 6)) + ' l' + (dx > 0 ? 4 : -4) + ',' + (Math.abs(dx) > 20 ? -3 : -4), 2, hC, 0.9);
    }
    else if (featV === 3) back += seg('M' + F(mx - 22) + ',' + F(top - 4) + ' Q' + F(mx + 1) + ',' + F(top - 16) + ' ' + F(mx + 24) + ',' + F(top - 5), 2.6, hC, 0.95);
    else if (featV === 4) { for (const dd of [[-18, -6], [1, -12], [20, -5]] as Pt[]) back += path(poly([[mx + dd[0], top + dd[1] - 3], [mx + dd[0] + 2.6, top + dd[1]], [mx + dd[0], top + dd[1] + 3], [mx + dd[0] - 2.6, top + dd[1]]]), hC); }
    else back += '<ellipse cx="' + F(mx + 1) + '" cy="' + F(top - 8) + '" rx="24" ry="5.5" fill="none" stroke="' + hC + '" stroke-width="2.5"/>';
  }
  if (p.race === 'simic') { // five crests, and the gill count breathes with them
    const finC = mute('#3e6a62', 0.1);
    if (p.headwear !== 4) {
      if (featV === 1) {
        front += path(poly([[mx - 4, top + 8], [101, top - 12], [100 + hw * 0.5, top + 6], [100 + hw * 0.2, top + 12]]), finC);
        front += path(poly([[100 - hw * 0.5, top + 10], [100 - hw * 0.2, top - 4], [mx - 2, top + 10]]), shadeHex('#3e6a62', 0.8));
      }
      else if (featV === 2) { for (let i = 0; i < 3; i++) { const bx = mx - hw * 0.3 + i * hw * 0.32;
        front += path(poly([[bx, top + 8], [bx + 3.5, top - 4 - i], [bx + 8, top + 8]]), i % 2 ? shadeHex('#3e6a62', 0.8) : finC); } }
      else if (featV === 3) front += path(poly([[100 - hw * 0.45, top + 10], [mx, top - 2], [100 + hw * 0.5, top + 9], [mx + 2, top + 13]]), finC);
      else if (featV === 4) { for (let i = 0; i < 3; i++) front += '<circle cx="' + F(100 + hw * (0.55 + i * 0.1)) + '" cy="' + F(top + 20 + i * 6) + '" r="1.4" fill="' + finC + '"/>'; }
      else front += path(poly([[mx - 4, top + 8], [101, top - 12], [100 + hw * 0.5, top + 6], [100 + hw * 0.2, top + 12]]), finC);
    }
    const gN = featV % 2 ? 3 : 2;
    for (let i = 0; i < gN; i++) mid += seg('M' + F(mx - nw + 2) + ',' + F(chin + 8 + i * 5) + ' l6,-1', 1.6, '#3e6a62', 0.8);
  }

  // ---- facial hair: quiet tone patches, pointed when long ----
  const facial = (fem || HAIRLESS.has(p.race) || MUZZLED.has(p.race)) ? 0 : p.facial % 5;
  const jawY = eY + 16;
  if (facial === 1) front += path(poly([[100 - jw * 0.72, jawY], [100 - jw * 0.55, chin + 2], [mx + 1, chin + 5], [100 + jw * 0.52, chin + 1], [100 + jw * 0.68, jawY], [100 + jw * 0.4, jawY + 5], [mx, jawY + 3], [100 - jw * 0.45, jawY + 5]]), mixHex(skin, hair, 0.4), 0.85);
  if (facial === 2 || facial === 3) {
    const tail = facial === 3 ? chin + 34 : chin + 9;
    const bd: Pt[] = [[100 - jw * 0.76, jawY], [100 - jw * 0.6, chin + 4], [mx - 6, tail - 3], [mx + 1, tail], [mx + 8, tail - 4], [100 + jw * 0.56, chin + 3], [100 + jw * 0.72, jawY], [100 + jw * 0.42, jawY + 6], [mx, jawY + 4], [100 - jw * 0.48, jawY + 6]];
    front += path(poly(shift(bd, 2, 2.5)), hairSh);
    front += path(poly(bd), hair);
    if (facial === 3) front += seg('M' + F(mx - 4) + ',' + F(chin + 14) + ' L' + F(mx + 6) + ',' + F(chin + 17) + ' M' + F(mx - 4) + ',' + F(chin + 22) + ' L' + F(mx + 5) + ',' + F(chin + 25), 1.6, hairSh);
    if (facial === 3 && beadRoll < 0.35) front += '<rect x="' + F(mx - 3.5) + '" y="' + F(chin + 18) + '" width="8" height="4" fill="' + buckle + '"/>';
  }
  if (facial === 4) {
    front += path(poly([[100 - hw * 0.92, eY + 6], [100 - hw * 0.98, chin - 12], [100 - jw * 0.5, chin - 2], [100 - jw * 0.42, eY + 12]]), hair);
    front += path(poly([[100 + hw * 0.88, eY + 4], [100 + hw * 0.94, chin - 14], [100 + jw * 0.52, chin - 4], [100 + jw * 0.4, eY + 10]]), hair);
  }

  // ---- hair in front ----
  const fr = top + 15 + jit(1);
  const underThen = (pts: Pt[]) => { front += path(poly(shift(pts, 2, 3)), hairSh); front += path(poly(pts), hair); };
  if (wearsHair && hv > 0) {
    if (hv === 1) underThen([[100 - hw * 1.0, top + 26], [100 - hw * 0.88, top + 4], [101, top - 6], [100 + hw * 0.96, top + 5], [100 + hw * 1.04, top + 28], [100 + hw * 0.7, top + 20], [100 + hw * 0.3, fr + 3], [mx - 2, fr - 4], [100 - hw * 0.55, fr + 4]]);
    if (hv === 2) underThen([[100 - hw * 1.02, top + 30], [100 - hw * 0.9, top + 4], [101, top - 7], [100 + hw * 0.96, top + 4], [100 + hw * 1.06, top + 30], [100 + hw * 0.72, top + 18], [100 + hw * 0.4, fr + 8], [mx + 4, fr + 2], [mx - 8, fr + 10], [100 - hw * 0.6, fr - 2]]);
    if (hv === 3) underThen([[100 - hw * 1.0, top + 24], [100 - hw * 0.85, top + 2], [101, top - 8], [100 + hw * 0.98, top + 3], [100 + hw * 1.08, top + 26], [100 + hw * 0.6, fr - 4], [mx, fr - 8], [100 - hw * 0.6, fr - 3]]);
    if (hv === 4 || hv === 5) underThen([[100 - hw * 1.0, top + 28], [100 - hw * 0.88, top + 3], [101, top - 6], [100 + hw * 0.96, top + 4], [100 + hw * 1.05, top + 30], [100 + hw * 0.66, top + 22], [100 + hw * 0.28, fr + 2], [mx - 3, fr - 4], [100 - hw * 0.58, fr + 3]]);
    if (hv === 6) {
      underThen([[100 - hw * 0.98, top + 22], [100 - hw * 0.85, top + 3], [101, top - 5], [100 + hw * 0.94, top + 4], [100 + hw * 1.0, top + 24], [100 + hw * 0.55, fr], [mx, fr - 5], [100 - hw * 0.55, fr + 1]]);
      underThen([[100 + hw * 0.25, top - 4], [100 + hw * 0.45, top - 18], [100 + hw * 0.72, top - 14], [100 + hw * 0.78, top + 2], [100 + hw * 0.5, top + 6]]);
    }
    if (hv === 7) {
      const pts: Pt[] = []; const n = 10;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * (1.08 - i * (1.16 / n)); const rad = hw * (i % 2 ? 1.14 : 0.98) + jit(1.5);
        pts.push([101 + Math.cos(a) * rad, top + 16 - Math.sin(a) * rad * 0.92]);
      }
      underThen(pts.concat([[100 + hw * 0.6, fr + 4], [mx, fr - 2], [100 - hw * 0.6, fr + 5]] as Pt[]));
    }
    if (hv === 8) {
      front += path(poly([[100 - hw * 0.9, top + 24], [100 - hw * 0.5, top + 8], [mx, top + 10], [100 - hw * 0.2, top + 26]]), skinSh, 0.7);
      underThen([[mx - 6, fr - 2], [mx - 2, top - 16], [102, top - 20], [100 + hw * 0.4, top - 14], [100 + hw * 0.75, top + 12], [100 + hw * 0.5, top + 18], [101, top + 4]]);
    }
    if (hv !== 8 && hv !== 7) front += path(poly([[100 - hw * 0.55, top + 6], [mx + 4, top - 2], [100 + hw * 0.5, top + 5], [mx + 2, top + 4]]), hairHi, 0.6);
    if (streakRoll < 0.1) { // five streaks: forelock, side sweep, both temples, fringe sheen, twin strands
      const stC = mixHex(hairHi, '#d8d4ca', 0.55);
      if (streakV === 1) front += path(poly([[100 - hw * 0.55, top + 8], [100 - hw * 0.4, top - 1], [100 - hw * 0.2, fr], [100 - hw * 0.4, fr + 2]]), stC, 0.9);
      else if (streakV === 2) {
        front += path(poly([[100 - hw * 0.8, top + 16], [100 - hw * 0.68, top + 8], [100 - hw * 0.6, fr + 4], [100 - hw * 0.74, fr + 6]]), stC, 0.85);
        front += path(poly([[100 + hw * 0.82, top + 14], [100 + hw * 0.7, top + 6], [100 + hw * 0.6, fr + 2], [100 + hw * 0.76, fr + 5]]), stC, 0.85);
      }
      else if (streakV === 3) front += seg('M' + F(100 - hw * 0.5) + ',' + F(fr + 2) + ' Q' + F(mx) + ',' + F(fr - 4) + ' ' + F(100 + hw * 0.45) + ',' + F(fr + 1), 1.8, stC, 0.7);
      else if (streakV === 4) {
        front += path(poly([[mx - 8, top + 3], [mx - 5, top - 3], [mx - 2, fr - 1], [mx - 5.5, fr + 1]]), stC, 0.9);
        front += path(poly([[mx + 4, top + 2], [mx + 7, top - 4], [mx + 10, fr - 2], [mx + 6.5, fr]]), stC, 0.9);
      }
      else front += path(poly([[mx - 4, top + 2], [mx + 1, top - 5], [mx + 6, fr - 2], [mx + 1, fr + 1]]), stC, 0.9);
    }
    if (bandRoll < 0.16 && p.headwear === 0) { // five trinkets: cloth band, leather cord, temple flower, twin pins, beaded string
      if (accessV === 1) front += seg('M' + F(100 - hw * 0.84) + ',' + F(fr + 6) + ' L' + F(mx) + ',' + F(fr + 1) + ' L' + F(100 + hw * 0.86) + ',' + F(fr + 7), 2, leather, 0.9);
      else if (accessV === 2) {
        const fx0 = 100 + hw * 0.66, fy0 = top + 12;
        for (let k = 0; k < 3; k++) front += '<circle cx="' + F(fx0 + [0, 3, 1.4][k]!) + '" cy="' + F(fy0 + [0, 0.6, 2.8][k]!) + '" r="1.9" fill="' + mute('#b96a7a', 0.15) + '"/>';
        front += '<circle cx="' + F(fx0 + 1.5) + '" cy="' + F(fy0 + 1.1) + '" r="1" fill="#e6d49a"/>';
      }
      else if (accessV === 3) front += '<rect x="' + F(100 + hw * 0.52) + '" y="' + F(top + 13) + '" width="7.5" height="2" fill="' + buckle + '" transform="rotate(-24 ' + F(100 + hw * 0.56) + ' ' + F(top + 14) + ')"/><rect x="' + F(100 + hw * 0.47) + '" y="' + F(top + 18.5) + '" width="7.5" height="2" fill="' + buckle + '" transform="rotate(-24 ' + F(100 + hw * 0.51) + ' ' + F(top + 19.5) + ')"/>';
      else if (accessV === 4) { for (let k = 0; k < 3; k++) front += '<circle cx="' + F(100 - hw * 0.5 + k * hw * 0.5) + '" cy="' + F(fr + 3 - (k % 2) * 2) + '" r="1.4" fill="' + accC + '"/>'; }
      else front += path(poly([[100 - hw * 0.86, fr + 4], [mx, fr - 1], [100 + hw * 0.88, fr + 5], [100 + hw * 0.86, fr + 8.5], [mx, fr + 3], [100 - hw * 0.84, fr + 7.5]]), mute(garbPair[1], 0.18));
    }
  }
  if (wearsHair && hv === 4) { // face-framing strands
    front += path(poly([[100 - hw * 0.98, top + 20], [100 - hw * 0.8, eY + 20], [100 - hw * 1.02, chin + 24], [100 - hw * 0.7, eY + 10], [100 - hw * 0.86, top + 26]]), hair);
    front += path(poly([[100 + hw * 1.02, top + 18], [100 + hw * 1.12, eY + 26], [100 + hw * 0.88, chin + 30], [100 + hw * 1.24, eY + 14], [100 + hw * 1.06, top + 24]]), hair);
  }
  if (wearsHair && hv === 5) {
    const braid = (bx: number) => {
      let s = '';
      for (let i = 0; i < 5; i++) {
        s += path(poly([[bx - 4, chin + i * 12 - 6], [bx + 4, chin + i * 12 - 9], [bx + 3, chin + i * 12 + 3], [bx - 5, chin + i * 12 + 5]]), i % 2 ? hair : hairSh);
        if (beadRoll < 0.4 && i === 2) s += '<rect x="' + F(bx - 4) + '" y="' + F(chin + i * 12 - 2) + '" width="8" height="3.6" fill="' + buckle + '"/>';
      }
      return s;
    };
    front += braid(100 - hw * 0.98) + braid(100 + hw * 1.06);
  }
  if (hv === 0 && wearsHair) front += path(poly([[100 - hw * 0.6, top + 9], [mx + 3, top + 1], [100 + hw * 0.55, top + 8], [mx + 1, top + 7]]), skinSh, 0.6);

  // ---- headwear ----
  const hwv = p.headwear % 5;
  if (hwv === 1) { // hood: shell with a cut window, one clean cape edge
    const hPk = hatSub === 1 ? top - 9 : top - 18; // rounded cowl vs peaked
    const outer: Pt[] = [[100 - hw * 1.12, eY + 8], [100 - hw * (hatSub === 1 ? 1.08 : 1.02), top + 6], [101, hPk], [100 + hw * (hatSub === 1 ? 1.18 : 1.12), top + 2], [100 + hw * 1.3, eY + 10],
      [100 + hw * 1.15, chin + 8], [100 + shW * 0.66, shTop + 4], [100 + shW * 0.3, shTop + 16], [101, shTop + 21], [100 - shW * 0.28, shTop + 18], [100 - shW * 0.54, shTop + 6], [100 - hw * 1.04, chin + 4]];
    const win: Pt[] = [[100 - hw * 0.88, eY + 6], [100 - hw * 0.8, top + 22], [mx, top + 12], [100 + hw * 0.62, top + 20], [100 + hw * 0.72, eY + 10], [100 + hw * 0.5, chin - 6], [mx, chin + 2], [100 - hw * 0.6, chin - 6]];
    front += '<path d="' + poly(outer) + ' ' + poly(win) + '" fill-rule="evenodd" fill="' + garb + '"/>';
    front += path(poly([[100 + hw * 0.55, top - 2], [100 + hw * 1.12, top + 2], [100 + hw * 1.3, eY + 10], [100 + hw * 1.1, chin + 6], [100 + hw * 0.88, chin - 2], [100 + hw * 0.95, eY + 8]]), garbSh);
    // fabric thickness: a single seam tracing the cape edge
    front += seg('M' + F(100 - shW * 0.5) + ',' + F(shTop + 7) + ' L' + F(100 - shW * 0.26) + ',' + F(shTop + 15) + ' L101,' + F(shTop + 18) + ' L' + F(100 + shW * 0.28) + ',' + F(shTop + 13) + ' L' + F(100 + shW * 0.62) + ',' + F(shTop + 1), 2, garbSh, 0.9);
    if (hatSub === 2) front += path(poly([[100 - hw * 0.8, top + 20], [mx, top + 11], [100 + hw * 0.62, top + 19], [100 + hw * 0.58, top + 26], [mx, top + 18], [100 - hw * 0.76, top + 27]]), shadeHex(garb, 0.6), 0.55); // deep brim shadow
    if (hatSub === 3) front += seg('M' + F(100 - hw * 0.82) + ',' + F(eY + 4) + ' Q' + F(mx) + ',' + F(top + 14) + ' ' + F(100 + hw * 0.66) + ',' + F(eY + 8), 2.2, shadeHex(garb, 1.35), 0.9); // bright lined rim
    if (hatSub === 4) front += '<circle cx="' + F(mx + 1) + '" cy="' + F(chin + 4) + '" r="3.2" fill="' + buckle + '"/>'; // a pin at the throat
  } else if (hwv === 2) {
    if (hatSub === 2) { // leaf circlet
      front += path(poly([[100 - hw * 0.88, top + 22], [mx, top + 14], [100 + hw * 0.96, top + 21], [100 + hw * 0.96, top + 25], [mx, top + 18], [100 - hw * 0.88, top + 26]]), mute('#5c7a4a', 0.15));
      for (const lx of [-0.55, -0.2, 0.2, 0.55]) front += path(poly([[mx + hw * lx, top + 17], [mx + hw * lx + 3.5, top + 11], [mx + hw * lx + 6, top + 17]]), mute('#6c8a56', 0.12));
    } else {
      const bandC = hatSub === 1 ? '#a8adb4' : buckle;
      front += path(poly([[100 - hw * 0.88, top + 22], [mx, top + 14], [100 + hw * 0.96, top + 21], [100 + hw * 0.96, top + 25], [mx, top + 18], [100 - hw * 0.88, top + 26]]), bandC);
      if (hatSub === 1) front += seg('M' + F(100 - hw * 0.8) + ',' + F(top + 25) + ' Q' + F(mx) + ',' + F(top + 19) + ' ' + F(100 + hw * 0.88) + ',' + F(top + 25.5), 1, '#e8ecf0', 0.8);
      else if (hatSub === 3) front += seg('M' + F(100 - hw * 0.84) + ',' + F(top + 29) + ' Q' + F(mx) + ',' + F(top + 22) + ' ' + F(100 + hw * 0.92) + ',' + F(top + 29.5), 1.6, buckle, 0.9); // double band
      else if (hatSub === 4) front += path(poly([[mx - 1.6, top + 21], [mx + 1.6, top + 21], [mx, top + 27]]), accC); // gem drop on the brow
      else front += path(poly([[mx - 3, top + 13], [mx, top + 9], [mx + 3, top + 13], [mx, top + 17]]), '#e6d49a');
    }
  } else if (hwv === 3) {
    const slouch = hatSub === 1 ? 10 : 0;
    const cap: Pt[] = [[100 - hw * (1.0 + slouch * 0.02), top + 16], [100 - hw * 0.6 - slouch, top - 8 + slouch * 0.4], [100 + hw * 0.55, top - 12], [100 + hw * 1.05, top + 6], [100 + hw * 0.9, top + 18], [mx, top + 10], [100 - hw * 0.85, top + 20]];
    front += path(poly(shift(cap, 1.5, 2.5)), shadeHex(garb, 0.8));
    front += path(poly(cap), garb);
    if (hatSub === 2) { // flat brim all round
      front += path(poly([[100 - hw * 1.3, top + 18], [100 + hw * 1.32, top + 15], [100 + hw * 1.28, top + 22], [100 - hw * 1.26, top + 25]]), shadeHex(garb, 0.72));
    } else if (hatSub === 3) { // fur band at the base
      let fz2 = 'M' + F(100 - hw * 0.92) + ',' + F(top + 18);
      for (let i = 0; i < 6; i++) fz2 += ' l' + F(hw * 0.15) + ',4 l' + F(hw * 0.15) + ',-4';
      front += seg(fz2, 3, shadeHex(garb2, 0.9), 0.95);
    } else if (hatSub === 4) { // twin feathers
      front += path(poly([[100 + hw * 0.5, top - 10], [100 + hw * 0.82, top - 26], [100 + hw * 0.95, top - 24], [100 + hw * 0.78, top - 6]]), '#b0552f');
      front += path(poly([[100 + hw * 0.44, top - 8], [100 + hw * 0.6, top - 20], [100 + hw * 0.7, top - 18], [100 + hw * 0.6, top - 4]]), accC);
    } else if (hatSub === 0) {
      front += path(poly([[100 + hw * 0.5, top - 10], [100 + hw * 0.82, top - 26], [100 + hw * 0.95, top - 24], [100 + hw * 0.78, top - 6]]), '#b0552f');
    }
  } else if (hwv === 4) { // open helm: the dome takes the skull, never the face
    const brow2 = eY - 9;
    front += path(poly([[100 - hw * 0.98, brow2 + 2], [100 - hw * 0.92, top + 6], [101, top - 12], [100 + hw * 1.02, top + 4], [100 + hw * 1.06, brow2 + 3], [mx, brow2 - 2]]), metal);
    front += path(poly([[mx + 2, top - 10], [100 + hw * 1.02, top + 4], [100 + hw * 1.06, brow2 + 3], [mx + 3, brow2 - 1]]), metalSh);
    front += path(poly([[100 - hw * 0.98, brow2 + 2], [100 - hw * 0.94, eY + 10], [100 - hw * 0.8, eY + 9], [100 - hw * 0.86, brow2 + 3]]), metalSh);
    front += path(poly([[100 + hw * 1.06, brow2 + 3], [100 + hw * 1.0, eY + 12], [100 + hw * 0.86, eY + 10], [100 + hw * 0.92, brow2 + 2]]), metalSh);
    front += path(poly([[100 - hw * 0.8, top + 8], [100 - hw * 0.5, top - 4], [100 - hw * 0.4, top], [100 - hw * 0.68, top + 11]]), metalHi, 0.7);
    if (hatSub === 1) front += path(poly([[mx - 2, brow2 - 1], [mx + 2, brow2 - 1], [mx + 1, eY + 4], [mx - 3, eY + 4]]), metalSh); // short nasal
    if (hatSub === 2) front += path(poly([[mx - 4, top - 10], [101, top - 20], [100 + hw * 0.5, top - 10], [100 + hw * 0.3, top - 4], [mx + 2, top - 8]]), metalSh); // crest ridge
    if (hatSub === 3) { // winged
      front += path(poly([[100 - hw * 0.9, top + 8], [100 - hw * 1.3, top - 6], [100 - hw * 1.1, top + 12]]), metalHi);
      front += path(poly([[100 + hw * 0.95, top + 6], [100 + hw * 1.38, top - 8], [100 + hw * 1.18, top + 10]]), metalSh);
    }
    if (hatSub === 4) { // horned
      front += path(poly([[100 - hw * 0.72, top + 4], [100 - hw * 0.95, top - 12], [100 - hw * 0.6, top + 8]]), mute('#a89578', 0.1));
      front += path(poly([[100 + hw * 0.78, top + 2], [100 + hw * 1.05, top - 14], [100 + hw * 0.92, top + 6]]), shadeHex('#a89578', 0.76));
    }
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" role="img">' + ground +
    '<g transform="translate(100,150) scale(' + S + ') translate(-100,-150)">' + back + mid + front + crown + '</g></svg>';
}

// ---------------------------------------------------- recipe machinery --
// race-pertinent weighting under the flat-cut beard order:
// 0 clean · 1 stubble · 2 full · 3 long braid · 4 mutton chops
const FACIAL_WEIGHTS: Record<Race, number[]> = {
  human: [3, 2, 2, 1, 1],
  elf: [8, 1, 0, 0, 0],
  dwarf: [0, 1, 4, 4, 2],
  orc: [3, 2, 1, 1, 1],
  halfling: [5, 2, 1, 0, 1],
  'half-elf': [4, 2, 1, 0, 0],
  'half-orc': [3, 2, 1, 1, 1],
  gnome: [2, 2, 3, 1, 2],
  goliath: [4, 2, 1, 0, 1],
  tiefling: [3, 2, 2, 1, 0],
  dragonborn: [1, 0, 0, 0, 0],
  aasimar: [4, 1, 1, 0, 0],
  kalashtar: [5, 1, 0, 0, 0],
  shifter: [1, 4, 2, 0, 2],
  simic: [6, 1, 0, 0, 0],
  birdfolk: [1, 0, 0, 0, 0],
  catfolk: [1, 0, 0, 0, 0],
  warforged: [1, 0, 0, 0, 0],
};
// some races keep little on top (flat-cut hair order: 0 = bald)
const HAIR_WEIGHTS: Partial<Record<Race, number[]>> = {
  goliath: [8, 1, 0, 1, 0, 0, 0, 0, 0],
  dwarf: [1, 2, 3, 1, 2, 2, 1, 1, 1],
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
    headwear: h32(seed, 27) % 10 < 6 ? 0 : 1 + (h32(seed, 28) % (LAYER_COUNT_SRC.headwear - 1)),
    garb: h32(seed, 29) % LAYER_COUNT_SRC.garb,
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
  // the same rule the RENDER applies (buildPortraitSVG forces facial = 0 for
  // these) — without it the beard button on a dragonborn/warforged male cycled
  // the recipe while the face visibly never changed (§10.9)
  if (key === 'facial' && (r.sex === 'female' || HAIRLESS.has(r.race) || MUZZLED.has(r.race))) { next.facial = 0; return next; }
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
