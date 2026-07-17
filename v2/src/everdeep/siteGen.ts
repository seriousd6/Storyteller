// Site layout generators (G6, MAPS.md §6) — the geometry half of the
// nested-spaces epic. Every function here is PURE and DETERMINISTIC: cells
// come from rngFor(seedPath, STREAM.LAYOUT) and nothing else, because a
// generated floor stores only its gen block + hand-edit overrides and the
// base layout is re-derived on every open (sites.ts storage contract).
// Changing an algorithm here redraws every unedited generated floor — that
// is the accepted ghost-drift policy (Q11) for LAYOUT, but bump the version
// tag in the generator id (`site:dungeon:v1`) if a change would strand
// stored overrides in walls that no longer exist.
//
// Algorithm lineage (tool survey, 2026-07-17): dungeons are scattered rooms
// + MST corridors with a few loop edges (the TinyKeep/donjon family — loops
// are what make a delve feel designed, pure trees feel like plumbing);
// caves are the RogueBasin cellular-automata method; buildings are BSP
// partitions with doors punched on every split line; settlements are
// jittered recursive block subdivision — a stylized walled core in the
// Watabou spirit, NOT a true-scale survey (a real city is 2–3 mi across;
// this plan is its heart).

import { rngFor, h64, STREAM, type Rng } from './seeds.ts';
import { cellKey, type SiteCell, type SiteArea, type SpaceKind } from './sites.ts';

export interface FloorPlan {
  cells: Record<string, SiteCell>;
  areas: SiteArea[];
}

type Cells = Record<string, SiteCell>;
interface Rect { x: number; y: number; w: number; h: number }

const GEN_VERSION = 1;

/** Build a generator id string. Opts ride inside it so a floor's gen block
 *  is self-contained: `site:dungeon:v1?rooms=6`. */
export function makeGenerator(kind: SpaceKind, opts?: Record<string, string | number>): string {
  const pairs = Object.entries(opts ?? {}).filter(([, v]) => v !== undefined && v !== '');
  const q = pairs.length ? '?' + pairs.map(([k, v]) => `${k}=${v}`).join('&') : '';
  return `site:${kind}:v${GEN_VERSION}${q}`;
}

export function parseGenerator(generator: string): { kind: SpaceKind; opts: Record<string, string> } | null {
  const m = /^site:([a-z]+):v(\d+)(?:\?(.*))?$/.exec(generator);
  if (!m) return null;
  const opts: Record<string, string> = {};
  for (const pair of (m[3] ?? '').split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    if (i > 0) opts[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return { kind: m[1] as SpaceKind, opts };
}

/** The full plan: cells AND areas. Areas are generated once at site
 *  creation and STORED (they are authored data — labels and notes get
 *  edited); cells are re-derived on every open. */
export function planFloor(generator: string, seed: string, w: number, h: number): FloorPlan {
  const parsed = parseGenerator(generator);
  const rng = rngFor(seed, STREAM.LAYOUT);
  const areaId = (i: number) => 'a_' + h64(`${seed}#area:${i}`).slice(0, 8);
  switch (parsed?.kind) {
    case 'dungeon': return genDungeon(rng, w, h, parsed.opts, areaId);
    case 'cave': return genCave(rng, w, h, areaId);
    case 'building': return genBuilding(rng, w, h, parsed.opts, areaId);
    case 'town': return genSettlement(rng, w, h, { ...parsed.opts, scale: 'town' }, areaId);
    case 'city': return genSettlement(rng, w, h, { walls: '1', ...parsed.opts, scale: 'city' }, areaId);
    case 'room': return genRoom(w, h, areaId);
    default: return { cells: {}, areas: [] };
  }
}

/** Cells only — the regen hook sites.effectiveCells needs. */
export function cellsFor(gen: { generator: string; seed: string }, w: number, h: number): Cells {
  return planFloor(gen.generator, gen.seed, w, h).cells;
}

// ---------- shared helpers ----------

const ri = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(rng() * (hi - lo + 1));
/** Middle-biased int (triangular): splits land near the centre of a span, so
 *  BSP partitions give rooms, not slivers. */
const rmid = (rng: Rng, lo: number, hi: number): number => lo + Math.floor(((rng() + rng()) / 2) * (hi - lo + 1));
const pick = <T,>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;

function put(cells: Cells, x: number, y: number, t: SiteCell['t']): void {
  cells[cellKey(x, y)] = { t };
}
function at(cells: Cells, x: number, y: number): SiteCell | undefined {
  return cells[cellKey(x, y)];
}
function fillRect(cells: Cells, r: Rect, t: SiteCell['t']): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) put(cells, x, y, t);
}
const inRect = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
const overlaps = (a: Rect, b: Rect, gap: number): boolean =>
  a.x - gap < b.x + b.w && a.x + a.w + gap > b.x && a.y - gap < b.y + b.h && a.y + a.h + gap > b.y;
const center = (r: Rect): [number, number] => [r.x + (r.w >> 1), r.y + (r.h >> 1)];

const OPEN = new Set(['floor', 'door', 'stairs', 'water', 'hazard', 'secret']);

/** Wrap every open cell in wall: any empty in-bounds cell 8-adjacent to an
 *  open cell becomes wall. Order-independent (walls only added to voids). */
function sealWalls(cells: Cells, w: number, h: number): void {
  const add: Array<[number, number]> = [];
  for (const k of Object.keys(cells)) {
    const c = cells[k]!;
    if (!OPEN.has(c.t)) continue;
    const i = k.indexOf(',');
    const x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!at(cells, nx, ny)) add.push([nx, ny]);
    }
  }
  for (const [x, y] of add) put(cells, x, y, 'wall');
}

// ---------- dungeon: scattered rooms + MST corridors + loops ----------

function genDungeon(
  rng: Rng, w: number, h: number, opts: Record<string, string>, areaId: (i: number) => string,
): FloorPlan {
  const cells: Cells = {};
  const keyed = Math.max(1, Math.min(20, Number(opts.rooms) || Math.max(3, Math.round((w * h) / 260))));
  const total = keyed + 2; // + entrance room + inner sanctum

  // scatter non-overlapping rects (1-cell gap so shared walls stay 1 thick)
  const rects: Rect[] = [];
  for (let i = 0; i < total; i++) {
    const big = i === total - 1; // the sanctum is roomier
    let placed = false;
    for (let attempt = 0; attempt < 90 && !placed; attempt++) {
      const rw = big ? ri(rng, 6, Math.min(10, w - 4)) : ri(rng, 3, 7);
      const rh = big ? ri(rng, 5, Math.min(8, h - 4)) : ri(rng, 3, 6);
      const r = { x: ri(rng, 1, Math.max(1, w - rw - 2)), y: ri(rng, 1, Math.max(1, h - rh - 2)), w: rw, h: rh };
      if (rects.some((o) => overlaps(r, o, 1))) continue;
      rects.push(r); placed = true;
    }
  }
  if (rects.length < 2) return genRoom(w, h, areaId); // too tight to be a delve
  for (const r of rects) fillRect(cells, r, 'floor');

  // entrance = the room nearest a map edge; a short passage reaches daylight
  let entIdx = 0, entDist = Infinity;
  rects.forEach((r, i) => {
    const d = Math.min(r.x, r.y, w - (r.x + r.w), h - (r.y + r.h));
    if (d < entDist) { entDist = d; entIdx = i; }
  });
  const ent = rects[entIdx]!;
  const [ecx, ecy] = center(ent);
  {
    // carve straight to the nearest edge; the outermost cell is the way in
    const dists: Array<[number, number, number]> = [[ent.x, -1, 0], [ent.y, 0, -1], [w - (ent.x + ent.w), 1, 0], [h - (ent.y + ent.h), 0, 1]];
    dists.sort((a, b) => a[0] - b[0]);
    const [, dx, dy] = dists[0]!;
    let x = dx ? (dx < 0 ? ent.x : ent.x + ent.w - 1) : ecx;
    let y = dy ? (dy < 0 ? ent.y : ent.y + ent.h - 1) : ecy;
    while (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) {
      x += dx; y += dy;
      put(cells, x, y, 'floor');
    }
    put(cells, x, y, 'door'); // the outer gate
  }

  // sanctum = the placed-last big room; number the rest by distance from entrance
  const sanIdx = rects.length - 1;
  const order = rects.map((_, i) => i).filter((i) => i !== entIdx && i !== sanIdx);
  order.sort((a, b) => {
    const [ax, ay] = center(rects[a]!), [bx, by] = center(rects[b]!);
    return (Math.abs(ax - ecx) + Math.abs(ay - ecy)) - (Math.abs(bx - ecx) + Math.abs(by - ecy));
  });

  // connect: Prim MST over room centers + a few loop edges
  const edges: Array<[number, number]> = [];
  const inTree = new Set([entIdx]);
  while (inTree.size < rects.length) {
    let best: [number, number, number] | null = null;
    for (const a of inTree) for (let b = 0; b < rects.length; b++) {
      if (inTree.has(b)) continue;
      const [ax, ay] = center(rects[a]!), [bx, by] = center(rects[b]!);
      const d = Math.abs(ax - bx) + Math.abs(ay - by);
      if (!best || d < best[2]) best = [a, b, d];
    }
    if (!best) break;
    edges.push([best[0], best[1]]);
    inTree.add(best[1]);
  }
  const loops: Array<[number, number]> = [];
  for (let a = 0; a < rects.length; a++) for (let b = a + 1; b < rects.length; b++) {
    if (edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) continue;
    const [ax, ay] = center(rects[a]!), [bx, by] = center(rects[b]!);
    if (Math.abs(ax - bx) + Math.abs(ay - by) < (w + h) / 4 && rng() < 0.12 && loops.length < 2) loops.push([a, b]);
  }

  // corridors: L-shaped centre-to-centre; door where a corridor crosses a
  // room boundary; one loop door may be a secret one
  const doorAt: Array<[number, number, boolean]> = [];
  const carveCorridor = (a: number, b: number, secretable: boolean): void => {
    const [ax, ay] = center(rects[a]!), [bx, by] = center(rects[b]!);
    const path: Array<[number, number]> = [];
    const horizFirst = rng() < 0.5;
    let x = ax, y = ay;
    const stepX = () => { while (x !== bx) { x += Math.sign(bx - x); path.push([x, y]); } };
    const stepY = () => { while (y !== by) { y += Math.sign(by - y); path.push([x, y]); } };
    if (horizFirst) { stepX(); stepY(); } else { stepY(); stepX(); }
    // the door goes on the WALL-RING cell: leaving a room that's the first
    // cell outside it; entering one it's the last cell before the interior
    let wasIn = true; // starts at a room centre
    let prev: [number, number] = [ax, ay];
    for (const [px, py] of path) {
      const isIn = rects.some((r) => inRect(r, px, py));
      if (!at(cells, px, py)) put(cells, px, py, 'floor');
      if (isIn && !wasIn) doorAt.push([prev[0], prev[1], secretable]);
      else if (!isIn && wasIn) doorAt.push([px, py, secretable]);
      wasIn = isIn;
      prev = [px, py];
    }
  };
  for (const [a, b] of edges) carveCorridor(a, b, false);
  for (const [a, b] of loops) carveCorridor(a, b, true);
  let secretPlaced = false;
  for (const [x, y, secretable] of doorAt) {
    const t = secretable && !secretPlaced && rng() < 0.6 ? 'secret' : 'door';
    if (t === 'secret') secretPlaced = true;
    put(cells, x, y, t);
  }

  // furniture of danger: hazards in some rooms, a pool in one, stairs down
  for (const i of order) {
    const r = rects[i]!;
    if (rng() < 0.3) for (let n = ri(rng, 1, 2); n > 0; n--) put(cells, ri(rng, r.x, r.x + r.w - 1), ri(rng, r.y, r.y + r.h - 1), 'hazard');
  }
  if (order.length && rng() < 0.3) {
    const r = rects[pick(rng, order)]!;
    let px = ri(rng, r.x, r.x + r.w - 1), py = ri(rng, r.y, r.y + r.h - 1);
    for (let n = ri(rng, 3, 7); n > 0; n--) {
      put(cells, px, py, 'water');
      px = Math.min(r.x + r.w - 1, Math.max(r.x, px + ri(rng, -1, 1)));
      py = Math.min(r.y + r.h - 1, Math.max(r.y, py + ri(rng, -1, 1)));
    }
  }
  const san = rects[sanIdx]!;
  if (rng() < 0.5) put(cells, san.x + san.w - 1, san.y, 'stairs'); // a way deeper

  sealWalls(cells, w, h);

  const areas: SiteArea[] = [];
  areas.push({ id: areaId(0), label: 'The Gate', kind: 'entrance', ...ent });
  order.forEach((i, n) => areas.push({ id: areaId(n + 1), label: `Room ${n + 1}`, kind: 'room', ...rects[i]! }));
  areas.push({ id: areaId(order.length + 1), label: 'Inner Sanctum', kind: 'sanctum', ...san });
  return { cells, areas };
}

// ---------- cave: cellular automata ----------

function genCave(rng: Rng, w: number, h: number, areaId: (i: number) => string): FloorPlan {
  // 4-5 rule over a 46% fill (RogueBasin); border always solid
  let solid: boolean[] = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    solid[y * w + x] = x === 0 || y === 0 || x === w - 1 || y === h - 1 || rng() < 0.46;
  }
  for (let it = 0; it < 4; it++) {
    const next = solid.slice();
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        if (solid[(y + dy) * w + (x + dx)]) n++;
      }
      next[y * w + x] = n >= 5;
    }
    solid = next;
  }
  // keep only the largest open pocket
  const comp = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (solid[i] || comp[i] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const jx = j % w, jy = (j / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = jx + dx, ny = jy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nj = ny * w + nx;
        if (!solid[nj] && comp[nj] === -1) { comp[nj] = id; stack.push(nj); }
      }
    }
    sizes.push(size);
  }
  let main = 0;
  sizes.forEach((s, i) => { if (s > (sizes[main] ?? 0)) main = i; });

  const cells: Cells = {};
  const open: Array<[number, number]> = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid[y * w + x] && comp[y * w + x] === main) { put(cells, x, y, 'floor'); open.push([x, y]); }
  }
  if (!open.length) return genRoom(w, h, areaId); // degenerate seed: give a shell, not a crash

  // the mouth: carve from the nearest edge to the nearest open cell
  let mouth = open[0]!, mouthD = Infinity;
  for (const [x, y] of open) {
    const d = Math.min(x, y, w - 1 - x, h - 1 - y);
    if (d < mouthD) { mouthD = d; mouth = [x, y]; }
  }
  {
    let [x, y] = mouth;
    const dists: Array<[number, number, number]> = [[x, -1, 0], [y, 0, -1], [w - 1 - x, 1, 0], [h - 1 - y, 0, 1]];
    dists.sort((a, b) => a[0] - b[0]);
    const [, dx, dy] = dists[0]!;
    while (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) {
      x += dx; y += dy;
      put(cells, x, y, 'floor');
    }
    put(cells, x, y, 'door'); // the cave mouth
  }

  // a pool far from the mouth, a few hazards
  const far = open.reduce((best, p) =>
    Math.abs(p[0] - mouth[0]) + Math.abs(p[1] - mouth[1]) > Math.abs(best[0] - mouth[0]) + Math.abs(best[1] - mouth[1]) ? p : best);
  if (rng() < 0.7) {
    const q = [far];
    const seen = new Set([cellKey(far[0], far[1])]);
    for (let n = ri(rng, 8, 18); n > 0 && q.length; n--) {
      const [x, y] = q.shift()!;
      if (at(cells, x, y)?.t === 'floor') put(cells, x, y, 'water');
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const k = cellKey(x + dx, y + dy);
        if (!seen.has(k) && cells[k]?.t === 'floor') { seen.add(k); q.push([x + dx, y + dy]); }
      }
    }
  }
  for (let n = ri(rng, 2, 4); n > 0; n--) {
    const [x, y] = pick(rng, open);
    if (at(cells, x, y)?.t === 'floor') put(cells, x, y, 'hazard');
  }

  sealWalls(cells, w, h);

  // chambers: repeatedly take the openest cell, claim a square around it
  const clearance = (x: number, y: number): number => {
    let r = 0;
    outer: for (; r < 9; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const c = at(cells, x + dx, y + dy);
        if (!c || !OPEN.has(c.t)) break outer;
      }
    }
    return r;
  };
  const picks: Array<{ x: number; y: number; r: number }> = [];
  const cand = open.filter((_, i) => i % 3 === 0); // thin the scan, deterministically
  for (let n = 0; n < 5; n++) {
    let best: { x: number; y: number; r: number } | null = null;
    for (const [x, y] of cand) {
      if (picks.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < p.r * 3 + 4)) continue;
      const r = clearance(x, y);
      if (!best || r > best.r) best = { x, y, r };
    }
    if (!best || best.r < 2) break;
    picks.push(best);
  }
  const areas: SiteArea[] = [];
  const CHAMBERS = ['Chamber of Echoes', 'The Low Gallery', 'The Black Pool', 'Bonefall Chamber', 'The Painted Hollow'];
  picks.forEach((p, i) => {
    const r: Rect = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2 + 1, h: p.r * 2 + 1 };
    const nearMouth = Math.abs(p.x - mouth[0]) + Math.abs(p.y - mouth[1]) < (w + h) / 6;
    areas.push({
      id: areaId(i),
      label: i === 0 && nearMouth ? 'The Mouth' : CHAMBERS[i % CHAMBERS.length]!,
      kind: i === picks.length - 1 && picks.length > 1 ? 'sanctum' : nearMouth && i === 0 ? 'entrance' : 'chamber',
      ...r,
    });
  });
  return { cells, areas };
}

// ---------- building: BSP partition, doors on every split ----------

const ROOM_NAMES: Record<string, string[]> = {
  tavern: ['The Common Room', 'The Kitchen', 'The Pantry', 'Guest Room', 'The Snug', "Owner's Quarters", 'Store Room'],
  shop: ['The Shopfront', 'The Workshop', 'The Back Room', 'Store Room', 'The Cellar Stair'],
  house: ['The Hall', 'The Kitchen', 'Bedchamber', 'The Parlor', 'Store Room', 'Workroom'],
  temple: ['The Nave', 'The Sanctuary', 'The Vestry', 'The Shrine', 'The Cells', 'The Crypt Stair'],
  keep: ['The Great Hall', 'The Barracks', 'The Armory', 'The Solar', 'The Kitchens', 'Store Rooms', 'The Chapel', 'Guard Room'],
};
const LEAF_TARGET: Record<string, [number, number]> = {
  tavern: [5, 7], shop: [3, 4], house: [4, 6], temple: [4, 5], keep: [6, 8],
};

function genBuilding(
  rng: Rng, w: number, h: number, opts: Record<string, string>, areaId: (i: number) => string,
): FloorPlan {
  const type = ROOM_NAMES[opts.type ?? ''] ? opts.type! : 'house';
  const cells: Cells = {};
  fillRect(cells, { x: 0, y: 0, w, h }, 'wall');
  fillRect(cells, { x: 1, y: 1, w: w - 2, h: h - 2 }, 'floor');

  const MIN = 3; // min interior span of a leaf
  const [tLo, tHi] = LEAF_TARGET[type]!;
  const target = ri(rng, tLo, tHi);
  const leaves: Rect[] = [{ x: 1, y: 1, w: w - 2, h: h - 2 }];
  const splits: Array<{ axis: 'x' | 'y'; pos: number; s0: number; s1: number }> = [];
  while (leaves.length < target) {
    // split the biggest splittable leaf
    leaves.sort((a, b) => b.w * b.h - a.w * a.h);
    const li = leaves.findIndex((r) => r.w >= MIN * 2 + 1 || r.h >= MIN * 2 + 1);
    if (li === -1) break;
    const r = leaves.splice(li, 1)[0]!;
    const axis: 'x' | 'y' = r.w >= r.h ? (r.w >= MIN * 2 + 1 ? 'x' : 'y') : (r.h >= MIN * 2 + 1 ? 'y' : 'x');
    if (axis === 'x') {
      const pos = r.x + rmid(rng, MIN, r.w - MIN - 1);
      for (let y = r.y; y < r.y + r.h; y++) put(cells, pos, y, 'wall');
      splits.push({ axis, pos, s0: r.y, s1: r.y + r.h - 1 });
      leaves.push({ x: r.x, y: r.y, w: pos - r.x, h: r.h }, { x: pos + 1, y: r.y, w: r.x + r.w - pos - 1, h: r.h });
    } else {
      const pos = r.y + rmid(rng, MIN, r.h - MIN - 1);
      for (let x = r.x; x < r.x + r.w; x++) put(cells, x, pos, 'wall');
      splits.push({ axis, pos, s0: r.x, s1: r.x + r.w - 1 });
      leaves.push({ x: r.x, y: r.y, w: r.w, h: pos - r.y }, { x: r.x, y: pos + 1, w: r.w, h: r.y + r.h - pos - 1 });
    }
  }
  // punch one door per split line where both sides are open floor — later
  // splits may have T-junctioned into the line, so candidates are filtered
  // after ALL walls exist. Every split connects its halves → the tree is
  // connected end to end.
  for (const s of splits) {
    const cands: Array<[number, number]> = [];
    for (let p = s.s0; p <= s.s1; p++) {
      const [x, y] = s.axis === 'x' ? [s.pos, p] : [p, s.pos];
      const [ax, ay, bx, by] = s.axis === 'x' ? [x - 1, y, x + 1, y] : [x, y - 1, x, y + 1];
      if (at(cells, ax, ay)?.t === 'floor' && at(cells, bx, by)?.t === 'floor') cands.push([x, y]);
    }
    if (cands.length) {
      const [x, y] = cands[Math.floor(rng() * cands.length)]!;
      put(cells, x, y, 'door');
    }
  }
  // the front door on the south face, a back door sometimes
  const front: Array<[number, number]> = [];
  for (let x = 1; x < w - 1; x++) if (at(cells, x, h - 2)?.t === 'floor') front.push([x, h - 1]);
  if (front.length) { const [x, y] = front[Math.floor(rng() * front.length)]!; put(cells, x, y, 'door'); }
  if (rng() < 0.4) {
    const back: Array<[number, number]> = [];
    for (let x = 1; x < w - 1; x++) if (at(cells, x, 1)?.t === 'floor') back.push([x, 0]);
    if (back.length) { const [x, y] = back[Math.floor(rng() * back.length)]!; put(cells, x, y, 'door'); }
  }
  // a stair invites an upper floor or a cellar
  if ((type === 'tavern' || type === 'keep' || rng() < 0.3) && leaves.length) {
    const r = leaves[leaves.length - 1]!;
    put(cells, r.x, r.y, 'stairs');
  }

  const areas: SiteArea[] = [];
  const names = ROOM_NAMES[type]!;
  [...leaves].sort((a, b) => b.w * b.h - a.w * a.h).forEach((r, i) =>
    areas.push({ id: areaId(i), label: names[i] ?? `Room ${i + 1}`, kind: 'room', ...r }));
  return { cells, areas };
}

// ---------- town & city: jittered block subdivision around a plaza ----------

const DISTRICTS = ['The Market Ward', 'Temple Row', 'The Guild Quarter', 'The Shambles', 'Garrison Ward', 'Lamplight', 'The Old Quarter', "Tanners' Row", 'The High Ward', "Potters' Field"];
const NOTABLES = ['The High Temple', 'The Guildhall', 'The Old Keep', 'The Counting House', 'The Baths', 'The Grand Stable'];

function genSettlement(
  rng: Rng, w: number, h: number, opts: Record<string, string>, areaId: (i: number) => string,
): FloorPlan {
  const cells: Cells = {};
  const city = opts.scale === 'city';
  const walled = opts.walls === '1' || (city && opts.walls !== '0') || (!city && rng() < 0.35);
  const m = walled ? 2 : 1; // inner margin: room for the ring
  const inner: Rect = { x: m, y: m, w: w - 2 * m, h: h - 2 * m };

  // water first: a river bend or a coastline claims its cells before streets
  const water = opts.water ?? 'none';
  const isWater = new Set<string>();
  if (water === 'river') {
    const vertical = rng() < 0.5;
    const span = vertical ? h : w;
    const across = vertical ? w : h;
    let c = ri(rng, Math.floor(across * 0.3), Math.floor(across * 0.7));
    const width = city ? 3 : 2;
    for (let p = 0; p < span; p++) {
      c = Math.max(3, Math.min(across - 4, c + ri(rng, -1, 1)));
      for (let d = 0; d < width; d++) {
        const [x, y] = vertical ? [c + d, p] : [p, c + d];
        isWater.add(cellKey(x, y));
      }
    }
  } else if (water === 'coast') {
    const side = ri(rng, 0, 3); // 0 E, 1 N, 2 W, 3 S
    let depth = ri(rng, 3, 5);
    const span = side % 2 === 0 ? h : w;
    for (let p = 0; p < span; p++) {
      depth = Math.max(2, Math.min(7, depth + ri(rng, -1, 1)));
      for (let d = 0; d < depth; d++) {
        const [x, y] = side === 0 ? [w - 1 - d, p] : side === 1 ? [p, d] : side === 2 ? [d, p] : [p, h - 1 - d];
        isWater.add(cellKey(x, y));
      }
    }
  }
  for (const k of isWater) cells[k] = { t: 'water' };

  // recursive block subdivision; split lines are streets, width by depth
  const blocks: Rect[] = [];
  const mainStreets: Array<{ axis: 'x' | 'y'; pos: number; width: number }> = [];
  const blockMax = city ? 16 : 20;
  const MINB = 6;
  const splitR = (r: Rect, depth: number): void => {
    const long = Math.max(r.w, r.h);
    if (long <= blockMax + ri(rng, 0, 5) || long < MINB * 2 + 3) { blocks.push(r); return; }
    const axis: 'x' | 'y' = r.w >= r.h ? 'x' : 'y';
    const sw = depth === 0 ? 3 : depth <= 2 ? 2 : 1;
    if (axis === 'x') {
      const pos = r.x + ri(rng, MINB, r.w - MINB - sw);
      for (let y = r.y; y < r.y + r.h; y++) for (let d = 0; d < sw; d++) {
        const k = cellKey(pos + d, y);
        if (!isWater.has(k) || depth <= 1) cells[k] = { t: 'floor' }; // main streets bridge the river
      }
      if (depth <= 1) mainStreets.push({ axis, pos, width: sw });
      splitR({ x: r.x, y: r.y, w: pos - r.x, h: r.h }, depth + 1);
      splitR({ x: pos + sw, y: r.y, w: r.x + r.w - pos - sw, h: r.h }, depth + 1);
    } else {
      const pos = r.y + ri(rng, MINB, r.h - MINB - sw);
      for (let x = r.x; x < r.x + r.w; x++) for (let d = 0; d < sw; d++) {
        const k = cellKey(x, pos + d);
        if (!isWater.has(k) || depth <= 1) cells[k] = { t: 'floor' };
      }
      if (depth <= 1) mainStreets.push({ axis, pos, width: sw });
      splitR({ x: r.x, y: r.y, w: r.w, h: pos - r.y }, depth + 1);
      splitR({ x: r.x, y: pos + sw, w: r.w, h: r.y + r.h - pos - sw }, depth + 1);
    }
  };
  splitR(inner, 0);

  // the plaza: a cleared square near the centre
  const ps = ri(rng, city ? 7 : 5, city ? 10 : 7);
  const plaza: Rect = {
    x: Math.floor(w / 2 - ps / 2) + ri(rng, -3, 3),
    y: Math.floor(h / 2 - ps / 2) + ri(rng, -3, 3),
    w: ps, h: ps,
  };
  for (let y = plaza.y; y < plaza.y + plaza.h; y++) for (let x = plaza.x; x < plaza.x + plaza.w; x++) {
    if (!isWater.has(cellKey(x, y))) put(cells, x, y, 'floor');
  }

  // buildings: mini-BSP each block into lots; a building is its lot shrunk
  // off the neighbouring lots, flush against the street it fronts
  const notable: Rect[] = [];
  for (const b of blocks) {
    // some blocks stay green (a yard, a paddock); towns keep more of them
    if (rng() < (city ? 0.06 : 0.18)) continue;
    // a few city blocks are one grand building
    if (city && notable.length < 5 && b.w >= 9 && b.h >= 9 && rng() < 0.12) {
      const g: Rect = { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 };
      if (rectClearOfWater(g, isWater)) {
        fillRect(cells, g, 'wall');
        addStreetDoor(cells, g, rng);
        notable.push(g);
        continue;
      }
    }
    const lots: Rect[] = [b];
    for (let guard = 0; guard < 40; guard++) {
      const li = lots.findIndex((r) => Math.max(r.w, r.h) > 8);
      if (li === -1) break;
      const r = lots.splice(li, 1)[0]!;
      if (r.w >= r.h) {
        const pos = r.x + ri(rng, 4, r.w - 4);
        lots.push({ x: r.x, y: r.y, w: pos - r.x, h: r.h }, { x: pos, y: r.y, w: r.x + r.w - pos, h: r.h });
      } else {
        const pos = r.y + ri(rng, 4, r.h - 4);
        lots.push({ x: r.x, y: r.y, w: r.w, h: pos - r.y }, { x: r.x, y: pos, w: r.w, h: r.y + r.h - pos });
      }
    }
    for (const lot of lots) {
      if (rng() < 0.15) continue; // an empty yard between houses
      const bld: Rect = {
        x: lot.x + (lot.x > b.x ? 1 : 0),
        y: lot.y + (lot.y > b.y ? 1 : 0),
        w: lot.w - (lot.x > b.x ? 1 : 0) - (lot.x + lot.w < b.x + b.w ? 1 : 0),
        h: lot.h - (lot.y > b.y ? 1 : 0) - (lot.y + lot.h < b.y + b.h ? 1 : 0),
      };
      if (bld.w < 2 || bld.h < 2) continue;
      if (!rectClearOfWater(bld, isWater)) continue;
      if (overlaps(bld, plaza, 0)) continue;
      fillRect(cells, bld, 'wall');
      addStreetDoor(cells, bld, rng);
    }
  }

  // the ring: wall with gates where the main streets leave town
  if (walled) {
    const ring: Rect[] = [
      { x: m - 1, y: m - 1, w: inner.w + 2, h: 1 },
      { x: m - 1, y: m + inner.h, w: inner.w + 2, h: 1 },
      { x: m - 1, y: m - 1, w: 1, h: inner.h + 2 },
      { x: m + inner.w, y: m - 1, w: 1, h: inner.h + 2 },
    ];
    for (const r of ring) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (!isWater.has(cellKey(x, y))) put(cells, x, y, 'wall');
    }
    for (const s of mainStreets) {
      for (let d = 0; d < s.width; d++) {
        if (s.axis === 'x') {
          put(cells, s.pos + d, m - 1, 'door');
          put(cells, s.pos + d, m + inner.h, 'door');
          for (let y = 0; y < m - 1; y++) put(cells, s.pos + d, y, 'floor');
          for (let y = m + inner.h + 1; y < h; y++) put(cells, s.pos + d, y, 'floor');
        } else {
          put(cells, m - 1, s.pos + d, 'door');
          put(cells, m + inner.w, s.pos + d, 'door');
          for (let x = 0; x < m - 1; x++) put(cells, x, s.pos + d, 'floor');
          for (let x = m + inner.w + 1; x < w; x++) put(cells, x, s.pos + d, 'floor');
        }
      }
    }
  }

  // areas: the plaza, four districts around it, the grand buildings
  const areas: SiteArea[] = [];
  let ai = 0;
  areas.push({ id: areaId(ai++), label: city ? 'The Grand Plaza' : 'Market Square', kind: 'plaza', ...plaza });
  const [pcx, pcy] = center(plaza);
  const names: string[] = [];
  const pool = [...DISTRICTS];
  if (water === 'coast') { names.push('The Dock Ward'); }
  while (names.length < 4 && pool.length) names.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  const quads: Rect[] = [
    { x: inner.x, y: inner.y, w: pcx - inner.x, h: pcy - inner.y },
    { x: pcx, y: inner.y, w: inner.x + inner.w - pcx, h: pcy - inner.y },
    { x: inner.x, y: pcy, w: pcx - inner.x, h: inner.y + inner.h - pcy },
    { x: pcx, y: pcy, w: inner.x + inner.w - pcx, h: inner.y + inner.h - pcy },
  ];
  quads.forEach((q, i) => {
    if (q.w > 4 && q.h > 4) areas.push({ id: areaId(ai++), label: names[i] ?? `Ward ${i + 1}`, kind: 'district', ...q });
  });
  notable.forEach((g, i) => areas.push({ id: areaId(ai++), label: NOTABLES[i % NOTABLES.length]!, kind: 'building', ...g }));
  return { cells, areas };
}

function rectClearOfWater(r: Rect, isWater: Set<string>): boolean {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    if (isWater.has(cellKey(x, y))) return false;
  }
  return true;
}

/** Give a building mass a door onto the nearest street (a floor cell just
 *  beyond its edge); windowless masses with no street face open onto the
 *  alley behind. */
function addStreetDoor(cells: Cells, b: Rect, rng: Rng): void {
  const cand: Array<[number, number]> = [];
  for (let x = b.x; x < b.x + b.w; x++) {
    if (at(cells, x, b.y - 1)?.t === 'floor') cand.push([x, b.y]);
    if (at(cells, x, b.y + b.h)?.t === 'floor') cand.push([x, b.y + b.h - 1]);
  }
  for (let y = b.y; y < b.y + b.h; y++) {
    if (at(cells, b.x - 1, y)?.t === 'floor') cand.push([b.x, y]);
    if (at(cells, b.x + b.w, y)?.t === 'floor') cand.push([b.x + b.w - 1, y]);
  }
  if (cand.length) {
    const [x, y] = cand[Math.floor(rng() * cand.length)]!;
    put(cells, x, y, 'door');
  }
}

// ---------- room: a walled shell to draw in ----------

function genRoom(w: number, h: number, areaId: (i: number) => string): FloorPlan {
  const cells: Cells = {};
  fillRect(cells, { x: 0, y: 0, w, h }, 'wall');
  fillRect(cells, { x: 1, y: 1, w: w - 2, h: h - 2 }, 'floor');
  put(cells, Math.floor(w / 2), h - 1, 'door');
  return { cells, areas: [{ id: areaId(0), label: 'The Room', kind: 'room', x: 1, y: 1, w: w - 2, h: h - 2 }] };
}

// ---------- One Page Dungeon JSON import (Watabou interchange) ----------
// The closest thing the hobby has to a dungeon standard; rects carve floor,
// doors map onto our cell enum, notes become keyed areas. Import only —
// export from painted cells would need lossy rect decomposition (deferred).

interface OpdJson {
  title?: string;
  story?: string;
  rects?: Array<{ x: number; y: number; w: number; h: number }>;
  doors?: Array<{ x: number; y: number; type?: number }>;
  notes?: Array<{ text?: string; ref?: string; pos?: { x: number; y: number } }>;
  columns?: Array<{ x: number; y: number }>;
  water?: Array<{ x: number; y: number }>;
}

export function looksLikeOpd(x: unknown): x is OpdJson {
  return !!x && typeof x === 'object' && Array.isArray((x as OpdJson).rects);
}

/** Watabou door types → our cells: 6 secret, 8/9 stairs, everything else door. */
const OPD_DOOR: Record<number, SiteCell['t']> = { 6: 'secret', 8: 'stairs', 9: 'stairs' };

export function importOnePageDungeon(json: OpdJson): { plan: FloorPlan; w: number; h: number; title: string } {
  const rects = json.rects ?? [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x); minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w); maxY = Math.max(maxY, r.y + r.h);
  }
  if (!rects.length) { minX = minY = 0; maxX = maxY = 10; }
  const ox = 1 - minX, oy = 1 - minY;
  const w = Math.min(1000, maxX - minX + 2), h = Math.min(1000, maxY - minY + 2);
  const cells: Cells = {};
  for (const r of rects) fillRect(cells, { x: r.x + ox, y: r.y + oy, w: r.w, h: r.h }, 'floor');
  for (const d of json.doors ?? []) {
    const t = OPD_DOOR[d.type ?? 1] ?? 'door';
    put(cells, d.x + ox, d.y + oy, t);
  }
  for (const c of json.columns ?? []) put(cells, c.x + ox, c.y + oy, 'wall');
  for (const wt of json.water ?? []) put(cells, wt.x + ox, wt.y + oy, 'water');
  sealWalls(cells, w, h);
  const areas: SiteArea[] = (json.notes ?? []).map((n, i) => ({
    id: 'a_' + h64(`opd:${i}:${n.ref ?? ''}`).slice(0, 8),
    label: n.ref ? `Room ${n.ref}` : `Note ${i + 1}`,
    kind: 'room',
    x: Math.max(0, Math.round((n.pos?.x ?? 0) + ox) - 1),
    y: Math.max(0, Math.round((n.pos?.y ?? 0) + oy) - 1),
    w: 3, h: 3,
    note: n.text ?? '',
  }));
  return { plan: { cells, areas }, w, h, title: json.title ?? 'Imported dungeon' };
}
