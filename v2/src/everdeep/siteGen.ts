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
import { cellKey, parseCellKey, type SiteCell, type SiteArea, type SpaceKind, type SiteContext, type BuildRole, type BuildFeature } from './sites.ts';

export interface FloorPlan {
  cells: Record<string, SiteCell>;
  areas: SiteArea[];
  /** City cores hand their overview the gate boundary cells + outward unit
   *  direction (core-local), so the overview runs each avenue on to the map
   *  edge without re-detecting a rectangular ring (LAYERED-SPACES R2). */
  gates?: Array<{ x: number; y: number; dx: number; dy: number }>;
}

type Cells = Record<string, SiteCell>;
interface Rect { x: number; y: number; w: number; h: number }

/** Per-kind CURRENT generator version — what NEW floors get. Old floors keep
 *  the version baked into their generator id, and planFloor must keep
 *  dispatching every version ever shipped, or stored overrides strand. */
const GEN_VERSION: Partial<Record<SpaceKind, number>> = { city: 5, building: 2, district: 2 };

/** Build a generator id string. Opts ride inside it so a floor's gen block
 *  is self-contained: `site:dungeon:v1?rooms=6`. */
export function makeGenerator(kind: SpaceKind, opts?: Record<string, string | number>): string {
  const pairs = Object.entries(opts ?? {}).filter(([, v]) => v !== undefined && v !== '');
  const q = pairs.length ? '?' + pairs.map(([k, v]) => `${k}=${v}`).join('&') : '';
  return `site:${kind}:v${GEN_VERSION[kind] ?? 1}${q}`;
}

export function parseGenerator(generator: string): { kind: SpaceKind; version: number; opts: Record<string, string> } | null {
  const m = /^site:([a-z]+):v(\d+)(?:\?(.*))?$/.exec(generator);
  if (!m) return null;
  const opts: Record<string, string> = {};
  for (const pair of (m[3] ?? '').split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    if (i > 0) opts[pair.slice(0, i)] = pair.slice(i + 1);
  }
  return { kind: m[1] as SpaceKind, version: Number(m[2]), opts };
}

/** The full plan: cells AND areas. Areas are generated once at site
 *  creation and STORED (they are authored data — labels and notes get
 *  edited); cells are re-derived on every open. `ctx` (LAYERED-SPACES §2)
 *  shapes the LAYOUT of context-aware kinds — it rides on gen.ctx so the
 *  base re-derives identically; seeds stay CONTRACTS-clean. */
export function planFloor(generator: string, seed: string, w: number, h: number, ctx?: SiteContext): FloorPlan {
  const parsed = parseGenerator(generator);
  const rng = rngFor(seed, STREAM.LAYOUT);
  const areaId = (i: number) => 'a_' + h64(`${seed}#area:${i}`).slice(0, 8);
  switch (parsed?.kind) {
    case 'dungeon': return genDungeon(rng, w, h, parsed.opts, areaId);
    case 'cave': return genCave(rng, w, h, areaId, parsed.opts);
    // v2+ opens the 200 ft tactical WINDOW on a block (R5); v1 floors minted
    // before this keep the standalone footprint interior
    case 'building': return parsed.version >= 2
      ? genBuildingBlock(rng, w, h, parsed.opts, areaId)
      : genBuilding(rng, w, h, parsed.opts, areaId);
    case 'town': return genSettlement(rng, w, h, { ...parsed.opts, scale: 'town' }, areaId);
    // v2+ TERRACES the ward fabric (party walls + back-alleys + garden courts,
    // R7β-2) so the district reads as a real zoom of the terraced city; v1
    // floors minted before this keep the moated box-of-boxes look, frozen.
    case 'district': return genDistrict(rng, w, h,
      parsed.version >= 2 ? { terrace: '1', ...parsed.opts } : parsed.opts, areaId, ctx);
    case 'city': return parsed.version >= 3
      // v5 = the ROUGH overview: ward ZONES + skeleton + flags, no buildings
      // (R7α). v4 shapes the core into an organic hull of terraced fabric (R2);
      // v3 stays rectangular. Older versions keep dispatching, frozen.
      ? genCityOverview(rng, w, h,
        parsed.version >= 5 ? { shape: 'organic', zones: '1', ...parsed.opts }
        : parsed.version >= 4 ? { shape: 'organic', ...parsed.opts } : parsed.opts, areaId)
      : parsed.version === 2
        ? genCityWards(rng, w, h, { walls: '1', ...parsed.opts }, areaId)
        : genSettlement(rng, w, h, { walls: '1', ...parsed.opts, scale: 'city' }, areaId);
    case 'room': return genRoom(w, h, areaId);
    default: return { cells: {}, areas: [] };
  }
}

/** Cells only — the regen hook sites.effectiveCells needs. Passes the
 *  stored context through so an override-carrying floor re-derives the SAME
 *  base it was edited over. */
export function cellsFor(gen: { generator: string; seed: string; ctx?: SiteContext }, w: number, h: number): Cells {
  return planFloor(gen.generator, gen.seed, w, h, gen.ctx).cells;
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
  // 'grand' scale (a giant hold, a dragon's vault): every chamber a hall
  const g = opts.scale === 'grand' ? 2 : 0;

  // scatter non-overlapping rects (1-cell gap so shared walls stay 1 thick)
  const rects: Rect[] = [];
  for (let i = 0; i < total; i++) {
    const big = i === total - 1; // the sanctum is roomier
    let placed = false;
    for (let attempt = 0; attempt < 90 && !placed; attempt++) {
      const rw = big ? ri(rng, 6 + g, Math.min(10 + g * 2, w - 4)) : ri(rng, 3 + g, 7 + g);
      const rh = big ? ri(rng, 5 + g, Math.min(8 + g * 2, h - 4)) : ri(rng, 3 + g, 6 + g);
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

function genCave(rng: Rng, w: number, h: number, areaId: (i: number) => string, opts: Record<string, string> = {}): FloorPlan {
  // 4-5 rule over a 46% fill (RogueBasin); border always solid. 'grand'
  // scale (a dragon's lair) starts airier, so the pockets open into halls.
  const fill = opts.scale === 'grand' ? 0.42 : 0.46;
  let solid: boolean[] = new Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    solid[y * w + x] = x === 0 || y === 0 || x === w - 1 || y === h - 1 || rng() < fill;
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
  // hunt for as many chambers as the key wants: entrance + N rooms + sanctum
  // (the marriage binds body rooms onto chambers by ordinal — too few picks
  // and the key has nowhere to hang)
  const want = Math.max(4, Math.min(9, (Number(opts.rooms) || 2) + 2));
  for (let n = 0; n < want; n++) {
    let best: { x: number; y: number; r: number } | null = null;
    for (const [x, y] of cand) {
      if (picks.some((p) => Math.abs(p.x - x) + Math.abs(p.y - y) < p.r * 2 + 3)) continue;
      const r = clearance(x, y);
      if (!best || r > best.r) best = { x, y, r };
    }
    if (!best || best.r < 1) break;
    picks.push(best);
  }
  const areas: SiteArea[] = [];
  const CHAMBERS = ['Chamber of Echoes', 'The Low Gallery', 'The Black Pool', 'Bonefall Chamber', 'The Painted Hollow'];
  picks.forEach((p, i) => {
    const r: Rect = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2 + 1, h: p.r * 2 + 1 };
    const nearMouth = Math.abs(p.x - mouth[0]) + Math.abs(p.y - mouth[1]) < (w + h) / 6;
    const kind = i === picks.length - 1 && picks.length > 1 ? 'sanctum' : nearMouth && i === 0 ? 'entrance' : 'chamber';
    areas.push({
      id: areaId(i),
      label: kind === 'sanctum' ? 'The Deep Hollow' : kind === 'entrance' ? 'The Mouth' : CHAMBERS[i % CHAMBERS.length]!,
      kind,
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
  // the front door faces the street (opts.door, from the parent's context —
  // N-2); no opt keeps the historical south face and the exact rng sequence
  const face = opts.door === 'n' || opts.door === 'e' || opts.door === 'w' ? opts.door : 's';
  const faceCells = (side: string): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    if (side === 's') { for (let x = 1; x < w - 1; x++) if (at(cells, x, h - 2)?.t === 'floor') out.push([x, h - 1]); }
    else if (side === 'n') { for (let x = 1; x < w - 1; x++) if (at(cells, x, 1)?.t === 'floor') out.push([x, 0]); }
    else if (side === 'e') { for (let y = 1; y < h - 1; y++) if (at(cells, w - 2, y)?.t === 'floor') out.push([w - 1, y]); }
    else { for (let y = 1; y < h - 1; y++) if (at(cells, 1, y)?.t === 'floor') out.push([0, y]); }
    return out;
  };
  const OPP: Record<string, string> = { n: 's', s: 'n', e: 'w', w: 'e' };
  const front = faceCells(face);
  if (front.length) { const [x, y] = front[Math.floor(rng() * front.length)]!; put(cells, x, y, 'door'); }
  if (rng() < 0.4) {
    const back = faceCells(OPP[face]!);
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

// ---------- building v2: the tactical WINDOW on a city block (LAYERED-SPACES R5) ----------
// The owner's ask: "going into a house opens its map AND the 200 ft block
// around it so in-city fights can happen." A drilled building no longer
// generates in a void — it opens a fixed 40×40 @5 ft (= 200 ft) block: the
// clicked footprint detailed in the CENTRE (BSP rooms, a front door onto the
// street), a street on the door side, neighbour building facades packed
// around it (cover, not enterable), a garden yard behind, and — where the
// parent said so — the city wall or a waterfront on an edge. Everything the
// parent knows rides in `opts` (door/edge/bw/bh from makeSubSite), so the
// floor stays a pure function of its generator id; buildings carry no ctx
// (unlike districts they don't follow parent edits). v1 (`site:building:v1`,
// genBuilding) still dispatches forever for floors minted before this.
const NESW = ['n', 'e', 's', 'w'] as const;
const OPP4: Record<string, 'n' | 'e' | 's' | 'w'> = { n: 's', s: 'n', e: 'w', w: 'e' };

// R6 — interior CHARACTER. Each building type gets a distinct plan (a big
// PRIMARY room fronting the door — the nave / common room / hall / shopfront
// that gives the type its identity — plus a service band of smaller rooms)
// and a per-purpose FURNISHING pass, so a temple, a smithy, a tavern and a
// house read as themselves instead of the same bare BSP boxes.
const PRIMARY_FRAC: Record<string, number> = { house: 0.5, tavern: 0.6, keep: 0.55, shop: 0.42, temple: 0.74 };
const SERVICE_COUNT: Record<string, number> = { house: 2, tavern: 3, keep: 4, shop: 2, temple: 1 };
const PRIMARY_PURPOSE: Record<string, string> = { house: 'hall', tavern: 'common', keep: 'greathall', shop: 'shopfront', temple: 'nave' };

/** A service room's purpose from its label — drives what furniture it gets. */
function purposeOf(label: string): string {
  const l = label.toLowerCase();
  if (/kitchen/.test(l)) return 'kitchen';
  if (/bed|guest|quarter|solar|barrack|snug|cell\b|cells/.test(l)) return 'bed';
  if (/pantry|store|cellar|armory/.test(l)) return 'store';
  if (/work|forge|smith/.test(l)) return 'workshop';
  if (/nave|sanct|shrine|chapel|vestry|crypt/.test(l)) return 'sanctuary';
  return 'generic';
}

/** Set a cosmetic furnishing on a floor cell (never on a wall/door, never
 *  clobbering one already placed). */
function setFeat(cells: Cells, x: number, y: number, f: BuildFeature): void {
  const c = cells[cellKey(x, y)];
  if (c && c.t === 'floor' && !c.feature) c.feature = f;
}

/** Furnish one room for its purpose. `back`/`front` are the building's away-
 *  from-door / door sides, so a nave's altar lands at the far wall and a
 *  shopfront's counter faces the street. Cosmetic only (features on floor). */
function furnishRoom(
  cells: Cells, r: Rect, purpose: string, rng: Rng, front: string, back: string,
): void {
  if (r.w < 1 || r.h < 1) return;
  const isFloor = (x: number, y: number): boolean =>
    x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h && at(cells, x, y)?.t === 'floor';
  const set = (x: number, y: number, f: BuildFeature): void => { if (isFloor(x, y)) setFeat(cells, x, y, f); };
  const cx = r.x + (r.w >> 1), cy = r.y + (r.h >> 1);
  // the interior row/col just inside a wall of THIS room
  const wallLine = (side: string): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    if (side === 'n' || side === 's') { const y = side === 'n' ? r.y : r.y + r.h - 1; for (let x = r.x; x < r.x + r.w; x++) out.push([x, y]); }
    else { const x = side === 'w' ? r.x : r.x + r.w - 1; for (let y = r.y; y < r.y + r.h; y++) out.push([x, y]); }
    return out;
  };
  const along = (side: string, f: BuildFeature, step = 1): void => wallLine(side).forEach(([x, y], i) => { if (i % step === 0) set(x, y, f); });
  const mid = (side: string): [number, number] =>
    side === 'n' ? [cx, r.y] : side === 's' ? [cx, r.y + r.h - 1] : side === 'w' ? [r.x, cy] : [r.x + r.w - 1, cy];
  switch (purpose) {
    case 'hall': { const [hx, hy] = mid(rng() < 0.5 ? 'n' : 'w'); set(hx, hy, 'hearth'); set(cx, cy, 'table'); if (r.w >= 4) set(cx + 1, cy, 'table'); break; }
    case 'common': { along(rng() < 0.5 ? 'w' : 'e', 'counter'); set(cx, cy, 'table'); set(r.x + 1, r.y + 1, 'table'); set(r.x + r.w - 2, r.y + r.h - 2, 'table'); const [hx, hy] = mid('n'); set(hx, hy, 'hearth'); break; }
    case 'greathall': { const [hx, hy] = mid('n'); set(hx, hy, 'hearth'); for (let y = r.y + 1; y < r.y + r.h - 1; y++) set(cx, y, 'table'); set(r.x + 1, r.y + 1, 'statue'); break; }
    case 'nave': {
      // pews in double blocks with a central aisle, the altar at the far wall,
      // a font by the entrance — the room the whole type is named for
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x; x < r.x + r.w; x++) {
        if (x === cx) continue; // the aisle
        if ((back === 'n' || back === 's' ? y : x) % 2 === 0) set(x, y, 'pew');
      }
      const [ax, ay] = mid(back); set(ax, ay, 'altar'); if (r.w >= 3 && (back === 'n' || back === 's')) { set(ax - 1, ay, 'altar'); set(ax + 1, ay, 'altar'); }
      const [fx, fy] = mid(front); set(fx, fy, 'font');
      break;
    }
    case 'shopfront': { along(front, 'counter'); along(back, 'shelf'); break; }
    case 'kitchen': { const [hx, hy] = mid('n'); set(hx, hy, 'hearth'); set(cx, cy, 'table'); set(r.x, r.y + r.h - 1, 'barrel'); break; }
    case 'bed': { set(r.x, r.y, 'bed'); if (r.w * r.h >= 9) set(r.x + r.w - 1, r.y + r.h - 1, 'bed'); break; }
    case 'store': { along('e', 'shelf'); set(r.x, r.y, 'barrel'); set(r.x + 1, r.y, 'barrel'); set(r.x + r.w - 1, r.y + r.h - 1, 'chest'); break; }
    case 'workshop': { set(r.x, r.y, 'forge'); along(back, 'shelf'); set(r.x + r.w - 1, r.y, 'barrel'); break; }
    case 'sanctuary': { set(cx, cy, 'altar'); set(r.x, r.y, 'font'); set(r.x + r.w - 1, r.y + r.h - 1, 'chest'); break; }
    default: if (r.w * r.h >= 6 && rng() < 0.6) set(cx, cy, 'table'); break;
  }
}

function genBuildingBlock(
  rng: Rng, w: number, h: number, opts: Record<string, string>, areaId: (i: number) => string,
): FloorPlan {
  const cells: Cells = {};
  const type = ROOM_NAMES[opts.type ?? ''] ? opts.type! : 'house';
  const door = (NESW as readonly string[]).includes(opts.door ?? '') ? opts.door! : 's';
  const clampI = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const bw = clampI(Math.round(Number(opts.bw) || 9), 6, 16);
  const bh = clampI(Math.round(Number(opts.bh) || 9), 6, 16);
  // per-side parent edge: o open / w city wall / r waterfront (n,e,s,w order)
  const edge = /^[owr]{4}$/.test(opts.edge ?? '') ? opts.edge! : 'oooo';
  const edgeOf = (s: string): string => edge[NESW.indexOf(s as 'n')] ?? 'o';

  // the block is open ground (cobble/dirt = floor) under everything
  fillRect(cells, { x: 0, y: 0, w, h }, 'floor');
  // reserved = "a facade may not go here" (target, streets, yard, edges)
  const reserved = new Uint8Array(w * h);
  const reserve = (r: Rect): void => {
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (x >= 0 && y >= 0 && x < w && y < h) reserved[y * w + x] = 1;
    }
  };
  // salted integer hash so the packing loops never touch rng (draw order
  // independent of scan order — same trick as genCityWards)
  const salt = Math.floor(rng() * 0x7fffffff);
  const noise = (x: number, y: number): number => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  };
  const paint = (r: Rect, t: SiteCell['t']): void => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (x >= 0 && y >= 0 && x < w && y < h) put(cells, x, y, t);
    }
  };

  // 0. the parent's edges: a city wall or a waterfront on a flagged side
  for (const s of NESW) {
    const k = edgeOf(s);
    if (k === 'o') continue;
    const t: SiteCell['t'] = k === 'r' ? 'water' : 'wall';
    const depth = k === 'r' ? 3 : 2;
    const r: Rect = s === 'n' ? { x: 0, y: 0, w, h: depth }
      : s === 's' ? { x: 0, y: h - depth, w, h: depth }
      : s === 'w' ? { x: 0, y: 0, w: depth, h }
      : { x: w - depth, y: 0, w: depth, h };
    paint(r, t); reserve(r);
  }

  // 1. the clicked building, centred
  const bx = (w - bw) >> 1, by = (h - bh) >> 1;
  const target: Rect = { x: bx, y: by, w: bw, h: bh };
  reserve(target);

  // 2. a garden YARD behind the target (opposite the door), enclosed by the
  //    building and the neighbours' backs
  const back = OPP4[door]!;
  const yardR: Rect = back === 'n' ? { x: bx + 1, y: Math.max(1, by - 5), w: bw - 2, h: 4 }
    : back === 's' ? { x: bx + 1, y: by + bh + 1, w: bw - 2, h: 4 }
    : back === 'w' ? { x: Math.max(1, bx - 5), y: by + 1, w: 4, h: bh - 2 }
    : { x: bx + bw + 1, y: by + 1, w: 4, h: bh - 2 };
  for (let y = yardR.y; y < yardR.y + yardR.h; y++) for (let x = yardR.x; x < yardR.x + yardR.w; x++) {
    if (x >= 1 && y >= 1 && x < w - 1 && y < h - 1 && !reserved[y * w + x]) cells[cellKey(x, y)] = { t: 'floor', role: 'garden' };
  }
  reserve(yardR);

  // 3. streets: a main street the full span just OUTSIDE the target on the
  //    door side + a perpendicular cross-street, so the block reads as a
  //    corner with real circulation, never a dead-end forecourt. (Streets
  //    stay floor — reserving them just keeps facades off the thoroughfare.)
  const SD = 3;
  const horizDoor = door === 'n' || door === 's';
  const mainStreet: Rect = door === 'n' ? { x: 0, y: clampI(by - 1 - SD, 1, h), w, h: SD }
    : door === 's' ? { x: 0, y: clampI(by + bh + 1, 0, h - SD), w, h: SD }
    : door === 'w' ? { x: clampI(bx - 1 - SD, 1, w), y: 0, w: SD, h }
    : { x: clampI(bx + bw + 1, 0, w - SD), y: 0, w: SD, h };
  reserve(mainStreet);
  const crossAt = (noise(7, 3) & 1) ? bx - 4 - SD : bx + bw + 4;
  const cross: Rect = horizDoor ? { x: clampI(crossAt, 1, w - 1 - SD), y: 0, w: SD, h }
    : { x: 0, y: clampI(crossAt, 1, h - 1 - SD), w, h: SD };
  reserve(cross);

  // 4. neighbour facades: pack solid masses (cover, not enterable) on a loose
  //    grid, skipping the reserved zones; 1-cell alleys fall out between them
  for (let gy = 1; gy < h - 3; gy += 5) for (let gx = 1; gx < w - 3; gx += 5) {
    const n = noise(gx, gy);
    if (n % 5 === 0) continue; // a gap in the ring — an alley mouth / side yard
    const nbw = 3 + (n % 2), nbh = 3 + ((n >> 3) % 2);
    let ok = true;
    for (let y = gy - 1; y <= gy + nbh && ok; y++) for (let x = gx - 1; x <= gx + nbw; x++) {
      if (x < 0 || y < 0 || x >= w || y >= h || reserved[y * w + x]) { ok = false; break; }
    }
    if (!ok) continue;
    fillRect(cells, { x: gx, y: gy, w: nbw, h: nbh }, 'wall');
    for (let y = gy - 1; y <= gy + nbh; y++) for (let x = gx - 1; x <= gx + nbw; x++) reserved[y * w + x] = 1;
  }

  // 5. the interior: a PRIMARY room fronting the door (the room the type is
  //    named for — nave / common room / hall / shopfront) + a SERVICE band
  //    behind it, BSP'd into the smaller rooms. A distinct plan per type, not
  //    one uniform BSP for every building.
  fillRect(cells, target, 'wall');
  const innerR: Rect = { x: bx + 1, y: by + 1, w: bw - 2, h: bh - 2 };
  fillRect(cells, innerR, 'floor');
  const vert = door === 'n' || door === 's';
  const depth = vert ? innerR.h : innerR.w;
  const frac = PRIMARY_FRAC[type] ?? 0.5;
  let pd = Math.max(2, Math.min(depth - 2, Math.round(depth * frac)));
  const hasService = depth - pd - 1 >= 2;
  if (!hasService) pd = depth; // too shallow to split — the whole interior is primary
  let primaryR: Rect;
  let serviceR: Rect | null = null;
  let divWall: { axis: 'x' | 'y'; at: number; a: number; b: number } | null = null;
  if (vert) {
    if (door === 'n') { primaryR = { x: innerR.x, y: innerR.y, w: innerR.w, h: pd }; if (hasService) { serviceR = { x: innerR.x, y: innerR.y + pd + 1, w: innerR.w, h: innerR.h - pd - 1 }; divWall = { axis: 'y', at: innerR.y + pd, a: innerR.x, b: innerR.x + innerR.w - 1 }; } }
    else { primaryR = { x: innerR.x, y: innerR.y + innerR.h - pd, w: innerR.w, h: pd }; if (hasService) { serviceR = { x: innerR.x, y: innerR.y, w: innerR.w, h: innerR.h - pd - 1 }; divWall = { axis: 'y', at: innerR.y + innerR.h - pd - 1, a: innerR.x, b: innerR.x + innerR.w - 1 }; } }
  } else {
    if (door === 'w') { primaryR = { x: innerR.x, y: innerR.y, w: pd, h: innerR.h }; if (hasService) { serviceR = { x: innerR.x + pd + 1, y: innerR.y, w: innerR.w - pd - 1, h: innerR.h }; divWall = { axis: 'x', at: innerR.x + pd, a: innerR.y, b: innerR.y + innerR.h - 1 }; } }
    else { primaryR = { x: innerR.x + innerR.w - pd, y: innerR.y, w: pd, h: innerR.h }; if (hasService) { serviceR = { x: innerR.x, y: innerR.y, w: innerR.w - pd - 1, h: innerR.h }; divWall = { axis: 'x', at: innerR.x + innerR.w - pd - 1, a: innerR.y, b: innerR.y + innerR.h - 1 }; } }
  }
  if (divWall) { // the wall between primary and service
    if (divWall.axis === 'y') for (let x = divWall.a; x <= divWall.b; x++) put(cells, x, divWall.at, 'wall');
    else for (let y = divWall.a; y <= divWall.b; y++) put(cells, divWall.at, y, 'wall');
  }
  // BSP the service band into its rooms (walls + a door per split)
  const MIN = 2;
  const leaves: Rect[] = serviceR ? [{ ...serviceR }] : [];
  const splits: Array<{ axis: 'x' | 'y'; pos: number; s0: number; s1: number }> = [];
  const svcTarget = Math.max(1, SERVICE_COUNT[type] ?? 2);
  while (leaves.length < svcTarget) {
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
  // connect: a door in the primary↔service divider (both sides floor), then
  // one per service split — the whole interior stays walkable from the street
  const punch = (line: Array<[number, number]>, perp: 'x' | 'y'): void => {
    const cands = line.filter(([x, y]) => {
      const [ax, ay, bx2, by2] = perp === 'y' ? [x, y - 1, x, y + 1] : [x - 1, y, x + 1, y];
      return at(cells, ax, ay)?.t === 'floor' && at(cells, bx2, by2)?.t === 'floor';
    });
    if (cands.length) { const [x, y] = cands[Math.floor(rng() * cands.length)]!; put(cells, x, y, 'door'); }
  };
  if (divWall) {
    const line: Array<[number, number]> = [];
    for (let p = divWall.a; p <= divWall.b; p++) line.push(divWall.axis === 'y' ? [p, divWall.at] : [divWall.at, p]);
    punch(line, divWall.axis);
  }
  for (const s of splits) {
    const line: Array<[number, number]> = [];
    for (let p = s.s0; p <= s.s1; p++) line.push(s.axis === 'x' ? [s.pos, p] : [p, s.pos]);
    punch(line, s.axis);
  }

  // 6. the front door onto the street, and a back door into the yard
  const faceCells = (side: string): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    if (side === 's') { for (let x = bx + 1; x < bx + bw - 1; x++) if (at(cells, x, by + bh - 2)?.t === 'floor') out.push([x, by + bh - 1]); }
    else if (side === 'n') { for (let x = bx + 1; x < bx + bw - 1; x++) if (at(cells, x, by + 1)?.t === 'floor') out.push([x, by]); }
    else if (side === 'e') { for (let y = by + 1; y < by + bh - 1; y++) if (at(cells, bx + bw - 2, y)?.t === 'floor') out.push([bx + bw - 1, y]); }
    else { for (let y = by + 1; y < by + bh - 1; y++) if (at(cells, bx + 1, y)?.t === 'floor') out.push([bx, y]); }
    return out;
  };
  const frontFace = faceCells(door);
  if (frontFace.length) { const [x, y] = frontFace[Math.floor(rng() * frontFace.length)]!; put(cells, x, y, 'door'); }
  const backFace = faceCells(back);
  if (backFace.length) { const [x, y] = backFace[Math.floor(rng() * backFace.length)]!; put(cells, x, y, 'door'); }
  // a stair for an upper floor / cellar, tucked in a back room
  if ((type === 'tavern' || type === 'keep' || rng() < 0.3) && leaves.length) {
    const r = leaves[leaves.length - 1]!;
    if (at(cells, r.x, r.y)?.t === 'floor') put(cells, r.x, r.y, 'stairs');
  }

  // 7. FURNISH + key: the primary gets its signature fittings, each service
  //    room what its purpose calls for; the street/yard/facades stay unkeyed
  //    context (you fight across them but don't descend into them).
  const rooms: Rect[] = [primaryR, ...leaves];
  const names = ROOM_NAMES[type]!;
  const areas: SiteArea[] = [];
  rooms.forEach((r, i) => {
    const label = names[i] ?? `Room ${i + 1}`;
    const purpose = i === 0 ? (PRIMARY_PURPOSE[type] ?? 'hall') : purposeOf(label);
    furnishRoom(cells, r, purpose, rng, door, back);
    areas.push({ id: areaId(i), label, kind: 'room', ...r });
  });
  return { cells, areas };
}

// ---------- town & city: jittered block subdivision around a plaza ----------

const DISTRICTS = ['The Market Ward', 'Temple Row', 'The Guild Quarter', 'The Shambles', 'Garrison Ward', 'Lamplight', 'The Old Quarter', "Tanners' Row", 'The High Ward', "Potters' Field"];
const NOTABLES = ['The High Temple', 'The Guildhall', 'The Old Keep', 'The Counting House', 'The Baths', 'The Grand Stable'];
// each notable's civic role → the renderer's tint (LAYERED-SPACES R3)
const NOTABLE_ROLE: Record<string, BuildRole> = {
  'The High Temple': 'temple', 'The Guildhall': 'guild', 'The Old Keep': 'keep',
  'The Counting House': 'civic', 'The Baths': 'civic', 'The Grand Stable': 'warehouse',
};
const INN_NAMES = ['The Prancing Pony', 'The Gilded Eel', 'The Sleeping Dragon', 'The Wayfarer', 'The Broken Shield', 'The Copper Kettle'];
/** Tint every cell of a placed building with its civic role (cosmetic). */
function stampRole(cells: Cells, r: Rect, role: BuildRole): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const c = cells[cellKey(x, y)];
    if (c && c.t === 'wall') c.role = role;
  }
}

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
  // notable=1 (LAYERED-SPACES N-1): a district site drilled out of a city
  // overview GUARANTEES a landmark — the largest eligible block goes grand
  // up front, so the scale ladder never dead-ends at a ward with nothing to
  // enter. Existing town floors carry no such opt and are untouched.
  let forced: Rect | null = null;
  if (opts.notable === '1') {
    for (const b of blocks) {
      if (b.w < 9 || b.h < 9 || (forced && b.w * b.h <= forced.w * forced.h)) continue;
      const g: Rect = { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 };
      if (rectClearOfWater(g, isWater) && !overlaps(g, plaza, 0)) forced = b;
    }
  }
  for (const b of blocks) {
    if (b === forced) {
      const g: Rect = { x: b.x + 1, y: b.y + 1, w: b.w - 2, h: b.h - 2 };
      fillRect(cells, g, 'wall');
      addStreetDoor(cells, g, rng);
      notable.push(g);
      continue;
    }
    // some blocks stay green (a yard, a paddock); towns keep more of them
    if (rng() < (city ? 0.06 : 0.18)) continue;
    // a few city blocks are one grand building; notable=1 districts roll too
    if ((city || opts.notable === '1') && notable.length < 5 && b.w >= 9 && b.h >= 9 && rng() < 0.12) {
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

// ---------- city v2: Voronoi wards (multi-source flood over noisy ground) ----------
// v1's jittered blocks read as one grid stamped across the whole town; real
// cities read as NEIGHBOURHOODS that grew from a well, a gate, a market,
// with streets where two of them press together. So v2 plants ward seeds
// and floods outward over slightly-noisy ground (bucket-queue Dijkstra,
// O(cells)); where two floods meet, a street runs. Avenues join the gates
// to the plaza, buildings pack the street frontage ribbon by ribbon, deep
// block interiors stay yards. v1 stays dispatchable forever: every floor
// generated before this carries site:city:v1 in its gen block, and
// redrawing it here would strand its hand-edit overrides.

function genCityWards(
  rng: Rng, w: number, h: number, opts: Record<string, string>, areaId: (i: number) => string,
  preWater?: Set<string>,
): FloorPlan {
  const cells: Cells = {};
  const walled = opts.walls !== '0';
  const m = walled ? 2 : 1;
  const inner: Rect = { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
  const inInner = (x: number, y: number): boolean => inRect(inner, x, y);

  // water first, as in v1: a river bend or a coastline claims its cells.
  // v3's overview draws water at FULL-map scale and hands the core its cut
  // (preWater, core-local keys) — the v2 path draws its own and burns the
  // same rng draws it always did (per-version determinism).
  const water = opts.water ?? 'none';
  const isWater = preWater ?? new Set<string>();
  if (!preWater) if (water === 'river') {
    const vertical = rng() < 0.5;
    const span = vertical ? h : w;
    const across = vertical ? w : h;
    let c = ri(rng, Math.floor(across * 0.3), Math.floor(across * 0.7));
    for (let p = 0; p < span; p++) {
      c = Math.max(3, Math.min(across - 6, c + ri(rng, -1, 1)));
      for (let d = 0; d < 3; d++) {
        const [x, y] = vertical ? [c + d, p] : [p, c + d];
        isWater.add(cellKey(x!, y!));
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
        isWater.add(cellKey(x!, y!));
      }
    }
  }
  for (const k of isWater) cells[k] = { t: 'water' };

  // CITY SHAPE (LAYERED-SPACES R2): a SHAPED city fills an organic blob, not
  // the whole inner rectangle, so its wall traces an organic HULL and every
  // seed reads as a different silhouette instead of the same box. Unshaped
  // (v2/v3, no `shape` opt) fills the rect exactly as before and reuses the
  // very same `inInner` reference — byte-identical, no rng touched.
  const shaped = opts.shape === 'organic';
  // ROUGH overview (R7α, city v5): skip the building fabric — the ward Voronoi,
  // streets, avenues, water and hull are the skeleton; ward interiors become
  // coloured ZONES and the notables become drillable FLAG pins. `zones` implies
  // `shaped`. v2/v3/v4 never pass it, so their fabric is byte-identical.
  const zones = opts.zones === '1';
  const ccx = inner.x + inner.w / 2, ccy = inner.y + inner.h / 2;
  let inShape = inInner;
  if (shaped) {
    const cityCells = new Uint8Array(w * h);
    const baseR = Math.min(inner.w, inner.h) * 0.46;
    const K = 5, amp: number[] = [], pha: number[] = [];
    for (let k = 0; k < K; k++) { amp.push(0.05 + rng() * 0.13); pha.push(rng() * Math.PI * 2); }
    for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) {
      const dx = x + 0.5 - ccx, dy = y + 0.5 - ccy;
      const th = Math.atan2(dy, dx);
      let pert = 1;
      for (let k = 0; k < K; k++) pert += amp[k]! * Math.sin((k + 1) * th + pha[k]!);
      if (Math.hypot(dx, dy) <= baseR * pert) cityCells[y * w + x] = 1;
    }
    // one majority-rule smoothing pass: fill single-cell dimples, shave lone
    // spurs, so the hull reads as a clean organic wall, not a ragged fringe
    const src = cityCells.slice();
    for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) {
      let n = 0;
      for (let ddy = -1; ddy <= 1; ddy++) for (let ddx = -1; ddx <= 1; ddx++) {
        if ((ddx || ddy) && src[(y + ddy) * w + (x + ddx)]) n++;
      }
      cityCells[y * w + x] = src[y * w + x] ? (n >= 3 ? 1 : 0) : (n >= 6 ? 1 : 0);
    }
    inShape = (x, y) => inInner(x, y) && cityCells[y * w + x] === 1;
  }
  const inCity = (x: number, y: number): boolean => inShape(x, y) && !isWater.has(cellKey(x, y));

  // per-cell ground noise: a salted integer hash, so the hot loops never
  // touch the rng (draw order stays independent of scan order)
  const salt = Math.floor(rng() * 0x7fffffff);
  const noise = (x: number, y: number): number => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  };

  // ward seeds: the plaza at the centre (nudged off water), then a scatter
  // with a minimum gap between neighbourhood hearts
  let cx = Math.floor(w / 2) + ri(rng, -3, 3);
  const cy = Math.floor(h / 2) + ri(rng, -3, 3);
  while (isWater.has(cellKey(cx, cy)) && cx < inner.x + inner.w - 6) cx += 3;
  const seeds: Array<[number, number]> = [[cx, cy]];
  const wardTarget = Math.max(5, Math.min(10, Math.round(Math.min(w, h) / 24) + ri(rng, 1, 3)));
  const minGap = Math.max(9, Math.floor(Math.min(w, h) / 6));
  for (let attempt = 0; attempt < 300 && seeds.length < wardTarget; attempt++) {
    const x = ri(rng, inner.x + 4, inner.x + inner.w - 5);
    const y = ri(rng, inner.y + 4, inner.y + inner.h - 5);
    if (isWater.has(cellKey(x, y)) || !inShape(x, y)) continue;
    if (seeds.some(([sx, sy]) => Math.abs(sx - x) + Math.abs(sy - y) < minGap)) continue;
    seeds.push([x, y]);
  }

  // multi-source flood: bucket Dijkstra, step cost 2..3 from the ground
  // noise — the wobble keeps ward boundaries from running geometric
  const idx = (x: number, y: number): number => y * w + x;
  const BIG = 0x7fffffff;
  const dist = new Int32Array(w * h).fill(BIG);
  const wardOf = new Int16Array(w * h).fill(-1);
  const buckets: number[][] = [];
  const bpush = (d: number, i: number): void => { (buckets[d] ??= []).push(i); };
  seeds.forEach(([x, y], s) => { const i = idx(x, y); dist[i] = 0; wardOf[i] = s; bpush(0, i); });
  for (let d = 0; d < buckets.length; d++) {
    const q = buckets[d];
    if (!q) continue;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi]!;
      if (dist[i] !== d) continue; // stale queue entry
      const x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (!inShape(nx, ny) || isWater.has(cellKey(nx, ny))) continue;
        const ni = idx(nx, ny);
        const nd = d + 2 + (noise(nx, ny) & 1);
        if (nd < (dist[ni] ?? BIG)) { dist[ni] = nd; wardOf[ni] = wardOf[i]!; bpush(nd, ni); }
      }
    }
  }

  // streets where two wards meet; land that fronts water becomes a quay
  for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) {
    const wd = wardOf[idx(x, y)]!;
    if (wd < 0) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx, ny = y + dy;
      if (!inInner(nx, ny)) continue;
      if (isWater.has(cellKey(nx, ny))) { put(cells, x, y, 'floor'); break; }
      const nw = wardOf[idx(nx, ny)]!;
      if (nw >= 0 && nw !== wd) { put(cells, x, y, 'floor'); break; }
    }
  }
  // ragged dilation: the high streets swell to 2–4 wide (noise-gated), so
  // they stay legible against the 1-wide alleys the buildings leave behind
  {
    const grow: Array<[number, number]> = [];
    for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) {
      if (cells[cellKey(x, y)] || wardOf[idx(x, y)]! < 0 || !(noise(x, y) & 2)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at(cells, x + dx, y + dy)?.t === 'floor') { grow.push([x, y]); break; }
      }
    }
    for (const [x, y] of grow) put(cells, x, y, 'floor');
  }

  // avenues: a gate per chosen compass side, a bent 2-wide road to the
  // plaza, carved from the MAP edge so the road runs on past the wall; it
  // paints over water (a bridge) exactly like v1's main streets
  const laneV = (x: number, y0: number, y1: number): void => {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) { put(cells, x, y, 'floor'); put(cells, x + 1, y, 'floor'); }
  };
  const laneH = (y: number, x0: number, x1: number): void => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { put(cells, x, y, 'floor'); put(cells, x, y + 1, 'floor'); }
  };
  // VERISIMILITUDE (LAYERED-SPACES R1): if the world map handed us the sides
  // the real roads approach from (`gates`, n/e/s/w), the gates sit THERE —
  // you enter the city by the road you travelled. Absent (standalone cities,
  // roadless pins) keeps the original random 3–4 sides, and crucially burns
  // the SAME rng draws, so every gate-less city is byte-identical to before.
  let sides: number[] = [0, 1, 2, 3]; // N, E, S, W
  if (opts.gates && /^[nesw]+$/.test(opts.gates)) {
    const SIDE: Record<string, number> = { n: 0, e: 1, s: 2, w: 3 };
    sides = [...new Set(opts.gates.split(''))].map((c) => SIDE[c]!);
  } else {
    while (sides.length > (walled ? ri(rng, 3, 4) : 4)) sides.splice(Math.floor(rng() * sides.length), 1);
  }
  const gates: Array<{ axis: 'x' | 'y'; pos: number; at: number }> = [];
  const gateOut: NonNullable<FloorPlan['gates']> = [];
  if (shaped) {
    // organic city: the avenue for each gated side runs straight along the
    // central axis from the map edge to the plaza; the door is punched where
    // it crosses the hull wall (at:-1 signals "find the crossing"). The gate
    // boundary cell handed to the overview is the outermost built cell.
    const gcx = Math.round(ccx), gcy = Math.round(ccy);
    const edgeOf = (sx: number, sy: number, dx: number, dy: number): [number, number] => {
      let x = sx, y = sy;
      while (inCity(x + dx, y + dy)) { x += dx; y += dy; }
      return [x, y];
    };
    for (const side of sides) {
      if (side === 0 || side === 2) {
        laneV(gcx, side === 0 ? 0 : h - 1, cy); laneH(cy, gcx, cx);
        gates.push({ axis: 'x', pos: gcx, at: -1 });
        const dy = side === 0 ? -1 : 1;
        const [ex, ey] = edgeOf(gcx, Math.round(gcy), 0, dy);
        gateOut.push({ x: ex, y: ey, dx: 0, dy });
      } else {
        laneH(gcy, side === 1 ? w - 1 : 0, cx); laneV(cx, gcy, cy);
        gates.push({ axis: 'y', pos: gcy, at: -1 });
        const dx = side === 1 ? 1 : -1;
        const [ex, ey] = edgeOf(Math.round(gcx), gcy, dx, 0);
        gateOut.push({ x: ex, y: ey, dx, dy: 0 });
      }
    }
  } else for (const side of sides) {
    if (side === 0 || side === 2) {
      const gx = ri(rng, inner.x + Math.floor(inner.w / 3), inner.x + Math.floor((2 * inner.w) / 3));
      laneV(gx, side === 0 ? 0 : h - 1, cy);
      laneH(cy, gx, cx);
      gates.push({ axis: 'x', pos: gx, at: side === 0 ? m - 1 : m + inner.h });
    } else {
      const gy = ri(rng, inner.y + Math.floor(inner.h / 3), inner.y + Math.floor((2 * inner.h) / 3));
      laneH(gy, side === 1 ? w - 1 : 0, cx);
      laneV(cx, gy, cy);
      gates.push({ axis: 'y', pos: gy, at: side === 1 ? m + inner.w : m - 1 });
    }
  }

  // the plaza: a cleared square on the centre seed
  const ps = ri(rng, 9, 13);
  const plaza: Rect = { x: cx - (ps >> 1), y: cy - (ps >> 1), w: ps, h: ps };
  for (let y = plaza.y; y < plaza.y + plaza.h; y++) for (let x = plaza.x; x < plaza.x + plaza.w; x++) {
    if (inInner(x, y) && !isWater.has(cellKey(x, y))) put(cells, x, y, 'floor');
  }
  // R4: a market cross / monument at the plaza's heart, so the civic centre
  // reads as a PLACE, not a blank square (shaped only; pure stamp, no rng)
  if (shaped && inInner(cx, cy) && !isWater.has(cellKey(cx, cy))) {
    put(cells, cx, cy, 'wall');
    cells[cellKey(cx, cy)]!.role = 'civic';
  }

  // buildings pack the street frontage ribbon by ribbon: rects grown off
  // floor-adjacent ground, and each one paints the 1-wide alley around
  // itself, so the NEXT ribbon fronts that alley — the fabric fills inward
  // from the streets, connected by construction, never fused. The first
  // big placement in a few outer wards goes up grand (the ward's landmark).
  const openGround = (x: number, y: number): boolean =>
    inInner(x, y) && wardOf[idx(x, y)]! >= 0 && !cells[cellKey(x, y)];
  const tryPlace = (fx: number, fy: number, bw: number, bh: number): Rect | null => {
    for (const [ax, ay] of [[fx, fy], [fx - bw + 1, fy], [fx, fy - bh + 1], [fx - bw + 1, fy - bh + 1]] as const) {
      let fits = true;
      for (let y = ay; y < ay + bh && fits; y++) for (let x = ax; x < ax + bw; x++) {
        if (!openGround(x, y)) { fits = false; break; }
      }
      if (fits) return { x: ax, y: ay, w: bw, h: bh };
    }
    return null;
  };
  const grandIn = new Set<number>();
  for (let s = 1; s < seeds.length && grandIn.size < 3; s++) {
    if (noise(seeds[s]![0], seeds[s]![1]) % 2) grandIn.add(s);
  }
  const notable: Rect[] = [];
  const innCand: Rect[] = []; // ordinary buildings near the plaza — inn candidates (R3)
  if (!zones) for (let pass = 0; pass < 6; pass++) {
    let placedAny = false;
    for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) {
      if (!openGround(x, y)) continue;
      let fronts = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at(cells, x + dx, y + dy)?.t === 'floor') { fronts = true; break; }
      }
      if (!fronts) continue;
      const n = noise(x, y);
      // yards thicken toward the walls: a packed core, a looser skirt.
      // R4: a shaped/terraced core packs DENSER to the wall (skirt 6→3) — the
      // moat-free fabric would otherwise leave big voids inside the hull, and
      // a real city fills to its wall. (noise-gated, so no rng draw shifts.)
      const rad = (Math.abs(x - cx) + Math.abs(y - cy)) / (inner.w + inner.h);
      if (((n >> 6) % 12) < 1 + (shaped ? 3 : 6) * rad) continue;
      const wd = wardOf[idx(x, y)]!;
      const grand = grandIn.has(wd);
      const bw = grand ? 6 + (n % 3) : 2 + (n % 4);
      const bh = grand ? 6 + ((n >> 3) % 3) : 2 + ((n >> 3) % 4);
      const r = tryPlace(x, y, bw, bh) ?? (grand ? tryPlace(x, y, 2 + (n % 4), 2 + ((n >> 3) % 4)) : null);
      if (!r) continue;
      if (grand && r.w >= 6) { grandIn.delete(wd); notable.push(r); }
      else if (innCand.length < 60 && Math.abs(r.x - cx) + Math.abs(r.y - cy) < (inner.w + inner.h) * 0.14) innCand.push(r);
      fillRect(cells, r, 'wall');
      if (!shaped) {
        // v2/v3: moat the mass on all four sides (byte-identical to before —
        // this is what detaches every building and reads as a box of boxes)
        for (let yy = r.y - 1; yy <= r.y + r.h; yy++) for (let xx = r.x - 1; xx <= r.x + r.w; xx++) {
          const k = cellKey(xx, yy);
          if (!cells[k] && !isWater.has(k)) cells[k] = { t: 'floor' };
        }
      } else {
        // TERRACE (LAYERED-SPACES R4): DON'T moat. A building already fronts a
        // street (that is why it was placed), so we cut NO apron on the street
        // side and NONE on the two flanks — the next building along that same
        // street packs wall-to-wall into a terraced ROW (shared party walls),
        // and the masses fuse into blocks divided only by streets. That is
        // what un-boxes the city. We cut ONE back alley behind ~60% of them
        // (noise-gated, so no rng draw shifts) to deepen the fabric inward;
        // the pockets that stay un-alleyed become the garden courts below.
        const fronts = (dx: number, dy: number): boolean => {
          if (dx) { for (let yy = r.y; yy < r.y + r.h; yy++) if (at(cells, dx < 0 ? r.x - 1 : r.x + r.w, yy)?.t === 'floor') return true; }
          else { for (let xx = r.x; xx < r.x + r.w; xx++) if (at(cells, xx, dy < 0 ? r.y - 1 : r.y + r.h)?.t === 'floor') return true; }
          return false;
        };
        const alley = (dx: number, dy: number): void => {
          if (dx) { const ax = dx < 0 ? r.x - 1 : r.x + r.w; for (let yy = r.y; yy < r.y + r.h; yy++) { const k = cellKey(ax, yy); if (!cells[k] && !isWater.has(k)) cells[k] = { t: 'floor' }; } }
          else { const ay = dy < 0 ? r.y - 1 : r.y + r.h; for (let xx = r.x; xx < r.x + r.w; xx++) { const k = cellKey(xx, ay); if (!cells[k] && !isWater.has(k)) cells[k] = { t: 'floor' }; } }
        };
        // the back = the interior side OPPOSITE the (single) street frontage
        const fN = fronts(0, -1), fS = fronts(0, 1), fW = fronts(-1, 0), fE = fronts(1, 0);
        let bx = 0, by = 0;
        if (fN && !fS) by = 1; else if (fS && !fN) by = -1;
        else if (fW && !fE) bx = 1; else if (fE && !fW) bx = -1;
        if ((bx || by) && ((noise(r.x, r.y) >> 11) & 7) < 6) alley(bx, by);
      }
      addStreetDoor(cells, r, rng);
      placedAny = true;
    }
    if (!placedAny) break;
  }

  // ZONE FILL (R7α): with no buildings packed, each ward's interior takes its
  // zone tint. The streets/avenues (plain floor), plaza, water and hull stay
  // the skeleton — the city reads as coloured districts, not a box of boxes.
  if (zones) {
    for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) {
      const wd = wardOf[idx(x, y)]!;
      if (wd < 0) continue;
      const k = cellKey(x, y);
      if (cells[k]) continue; // a street / plaza / monument / water is already here
      cells[k] = { t: 'floor', zone: wd };
    }
  }

  // the ring: wall over everything but water, then the gates punch through
  // where the avenues cross it
  if (walled && shaped) {
    // organic HULL: wall every non-city, non-water cell that touches the
    // built-up blob (an 8-adjacent boundary follow), then re-open the gates
    // where an avenue axis crosses the wall.
    const hull: Array<[number, number]> = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (inCity(x, y) || isWater.has(cellKey(x, y))) continue;
      let adj = false;
      for (let ddy = -1; ddy <= 1 && !adj; ddy++) for (let ddx = -1; ddx <= 1; ddx++) {
        if ((ddx || ddy) && inCity(x + ddx, y + ddy)) { adj = true; break; }
      }
      if (adj) hull.push([x, y]);
    }
    for (const [x, y] of hull) put(cells, x, y, 'wall');
    // punch the gate ARCH: the hull wall cells immediately outside each gate's
    // boundary cell (2-wide), and nothing else — so the avenue pierces the
    // wall exactly where it exits and the rest of the hull stays sealed.
    for (const g of gateOut) {
      const [ox, oy] = [g.dx === 0 ? 1 : 0, g.dy === 0 ? 1 : 0]; // perpendicular
      for (const [bx, by] of [[g.x, g.y], [g.x + ox, g.y + oy]] as const) {
        let x = bx, y = by;
        // step outward across however thick the hull is here
        for (let s = 0; s < 4 && at(cells, x + g.dx, y + g.dy)?.t === 'wall'; s++) { x += g.dx; y += g.dy; put(cells, x, y, 'door'); }
      }
    }
  } else if (walled) {
    const ring: Rect[] = [
      { x: m - 1, y: m - 1, w: inner.w + 2, h: 1 },
      { x: m - 1, y: m + inner.h, w: inner.w + 2, h: 1 },
      { x: m - 1, y: m - 1, w: 1, h: inner.h + 2 },
      { x: m + inner.w, y: m - 1, w: 1, h: inner.h + 2 },
    ];
    for (const r of ring) for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
      if (!isWater.has(cellKey(x, y))) put(cells, x, y, 'wall');
    }
    for (const g of gates) for (let d = 0; d < 2; d++) {
      if (g.axis === 'x') put(cells, g.pos + d, g.at, 'door');
      else put(cells, g.at, g.pos + d, 'door');
    }
  }

  // areas: the plaza, a district per ward (its cells' bounding box), the
  // grand buildings; the wateriest ward docks the boats
  const areas: SiteArea[] = [];
  let ai = 0;
  areas.push({ id: areaId(ai++), label: 'The Grand Plaza', kind: 'plaza', ...plaza });
  const bbox: Array<{ x0: number; y0: number; x1: number; y1: number; quay: number } | null> = seeds.map(() => null);
  for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) {
    const wd = wardOf[idx(x, y)]!;
    if (wd < 0) continue;
    let b = bbox[wd];
    if (!b) { b = { x0: x, y0: y, x1: x, y1: y, quay: 0 }; bbox[wd] = b; }
    b.x0 = Math.min(b.x0, x); b.y0 = Math.min(b.y0, y);
    b.x1 = Math.max(b.x1, x); b.y1 = Math.max(b.y1, y);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      if (isWater.has(cellKey(x + dx, y + dy))) { b.quay++; break; }
    }
  }
  let dock = -1, dockBest = 0;
  if (water !== 'none') bbox.forEach((b, i) => { if (b && b.quay > dockBest) { dockBest = b.quay; dock = i; } });
  const pool = [...DISTRICTS];
  bbox.forEach((b, i) => {
    if (!b) return;
    const label = i === dock ? 'The Dock Ward'
      : pool.length ? pool.splice(Math.floor(rng() * pool.length), 1)[0]! : `Ward ${i + 1}`;
    areas.push({ id: areaId(ai++), label, kind: 'district', x: b.x0, y: b.y0, w: b.x1 - b.x0 + 1, h: b.y1 - b.y0 + 1 });
  });
  if (zones) {
    // FLAGS (R7α): named notable buildings as PINS — no masses at this scale.
    // The town hall at the plaza, a scatter of notables on outer ward seeds, a
    // couple of inns near the square. Each is a keyed, drillable building area;
    // its TYPE is read from the label when you descend (makeSubSite). These are
    // the through-line that ties the zoom layers together.
    const dry = (x: number, y: number): boolean => inInner(x, y) && !isWater.has(cellKey(x, y));
    const pin = (px: number, py: number, label: string): void => {
      const fx = Math.max(inner.x, Math.min(inner.x + inner.w - 3, px - 1));
      const fy = Math.max(inner.y, Math.min(inner.y + inner.h - 3, py - 1));
      if (!dry(fx + 1, fy + 1)) return;
      areas.push({ id: areaId(ai++), label, kind: 'building', flag: true, x: fx, y: fy, w: 3, h: 3 });
    };
    pin(cx, cy, 'The Town Hall');
    for (let s = 1; s < seeds.length && s <= NOTABLES.length; s++) pin(seeds[s]![0], seeds[s]![1], NOTABLES[(s - 1) % NOTABLES.length]!);
    const innBase = Math.floor(rng() * INN_NAMES.length);
    const off = Math.max(4, Math.floor(ps * 0.7));
    pin(cx - off, cy - 3, INN_NAMES[innBase % INN_NAMES.length]!);
    pin(cx + off, cy + 3, INN_NAMES[(innBase + 1) % INN_NAMES.length]!);
    return { cells, areas, gates: gateOut };
  }
  if (shaped) {
    // R3 role colors (shaped/v4 only — the inn rolls draw rng, and this rng
    // is shared with the overview, so the frozen v2/v3 path must not touch
    // it): grand buildings wear their civic role, a couple of near-plaza
    // inns are tinted + keyed. stampRole is cosmetic; it never moves a cell.
    notable.forEach((g, i) => {
      const label = NOTABLES[i % NOTABLES.length]!;
      stampRole(cells, g, NOTABLE_ROLE[label] ?? 'civic');
      areas.push({ id: areaId(ai++), label, kind: 'building', ...g });
    });
    // CIVIC HEART (R4): the building nearest the plaza becomes the town hall —
    // a seat of law FRONTING the square, not a random-ward notable. Pure min
    // (no rng); it just claims a candidate the inns would otherwise draw.
    if (innCand.length) {
      let bi = 0, bd = Infinity;
      innCand.forEach((g, i) => { const d = Math.abs(g.x + (g.w >> 1) - cx) + Math.abs(g.y + (g.h >> 1) - cy); if (d < bd) { bd = d; bi = i; } });
      const hall = innCand.splice(bi, 1)[0]!;
      stampRole(cells, hall, 'civic');
      areas.push({ id: areaId(ai++), label: 'The Town Hall', kind: 'building', ...hall });
    }
    const innN = Math.min(innCand.length, ri(rng, 2, 3));
    const innBase = Math.floor(rng() * INN_NAMES.length);
    const innsChosen: Rect[] = [];
    for (let t = 0; innsChosen.length < innN && innCand.length; t++) {
      const g = innCand.splice(Math.floor(rng() * innCand.length), 1)[0]!;
      if (innsChosen.some((o) => Math.abs(o.x - g.x) + Math.abs(o.y - g.y) < 10)) continue;
      innsChosen.push(g);
      stampRole(cells, g, 'inn');
      areas.push({ id: areaId(ai++), label: INN_NAMES[(innBase + innsChosen.length) % INN_NAMES.length]!, kind: 'building', ...g });
    }
    // GARDEN COURTS (R4): the block interiors terracing leaves un-built — a
    // pocket of open ground fully ringed by houses — read as green courts.
    // Flood the still-empty ward cells; a mid-size ENCLOSED pocket (not the
    // wide fringes that spill to the city edge, not a 1-cell alley gap) is
    // stamped a garden floor. Pure post-process, no rng; runs after the hull
    // and bboxes so it changes nothing structural.
    const seenG = new Uint8Array(w * h);
    for (let y = inner.y; y < inner.y + inner.h; y++) for (let x = inner.x; x < inner.x + inner.w; x++) {
      const i0 = idx(x, y);
      if (seenG[i0] || wardOf[i0]! < 0 || cells[cellKey(x, y)]) continue;
      const comp: number[] = [i0]; seenG[i0] = 1;
      let enclosed = true; // stays true only if the pocket never spills to the fringe/edge
      for (let qi = 0; qi < comp.length; qi++) {
        const i = comp[qi]!, px = i % w, py = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx, ny = py + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) { enclosed = false; continue; }
          if (cells[cellKey(nx, ny)]) continue; // a built/paved/water cell walls the court
          const ni = idx(nx, ny);
          if (wardOf[ni]! < 0) { enclosed = false; continue; } // open fringe, not a court
          if (!seenG[ni]) { seenG[ni] = 1; comp.push(ni); }
        }
      }
      // a real court (not an alley sliver, not a whole open fringe); and only
      // ~half of them are planted (noise-gated) so the rest stay bare work-
      // yards — green as an accent, not a blanket over the whole city
      if (enclosed && comp.length >= 6 && comp.length <= 44 && ((noise(x, y) >> 7) & 3) < 2) {
        for (const i of comp) cells[cellKey(i % w, (i / w) | 0)] = { t: 'floor', role: 'garden' };
      }
    }
    return { cells, areas, gates: gateOut };
  }
  notable.forEach((g, i) => areas.push({ id: areaId(ai++), label: NOTABLES[i % NOTABLES.length]!, kind: 'building', ...g }));
  return { cells, areas };
}

// ---------- city v3: the true-footprint overview (LAYERED-SPACES.md N-1) ----------
// 50 ft/cell — the WHOLE 2–3 mile city the batch-9 table promised, not just
// its walled heart: the ward-fabric core (genCityWards, offset into the
// centre), water at full-map scale, avenues running on past the gates to the
// map edges, and the BURROWS — hamlet clusters strung along the approach
// roads, each keyed as a district so it drills down like any ward. Farmland
// stays open ground (the ink pass draws fields; geometry stays honest).

const BURROWS = ['Wallside', 'The Tanneries', 'Millrow', 'Cross Keys',
  'The Shambles', 'Gallows Green', 'Orchard End', 'The Steads',
  'Beggars Rest', 'The Paddocks'];

function genCityOverview(
  rng: Rng, w: number, h: number, opts: Record<string, string>, areaId: (i: number) => string,
): FloorPlan {
  const cells: Cells = {};
  const zones = opts.zones === '1'; // R7α: the ROUGH overview (no drawn buildings)

  // the walled core: a share of the span that SCALES WITH POPULATION (batch
  // 312, owner) — a small market city fills ~a third of the overview and leaves
  // broad farmland + more burrows, a metropolis packs its core out to ~three
  // quarters. Jittered off dead-centre, clamped so outskirts always exist.
  // Opt-in on opts.pop: a popless generator string keeps the frozen 0.45, so
  // the smoke byte-identity (and every already-saved city site) is untouched.
  const pop = Number(opts.pop) || 0;
  const coreFrac = pop > 0
    ? Math.max(0.30, Math.min(0.75, 0.30 + 0.14 * Math.log10(pop / 8_000)))
    : 0.45;
  let coreW = Math.max(48, Math.round(w * coreFrac));
  let coreH = Math.max(48, Math.round(h * coreFrac));
  coreW = Math.min(coreW, w - 24); coreH = Math.min(coreH, h - 24);
  let coreX = Math.round((w - coreW) / 2 + (rng() - 0.5) * w * 0.1);
  let coreY = Math.round((h - coreH) / 2 + (rng() - 0.5) * h * 0.1);

  // 1. water spans the WHOLE map — a river truly crosses the city's world, a
  // coast owns a side (and pulls the core to it: a port city fronts its sea)
  const water = opts.water ?? 'none';
  const isWater = new Set<string>();
  if (water === 'river') {
    const vertical = rng() < 0.5;
    const span = vertical ? h : w;
    const across = vertical ? w : h;
    const RW = 4;
    // aim the course through the core's middle band so the city brackets it
    let c = (vertical ? coreX : coreY) + ri(rng, 10, (vertical ? coreW : coreH) - 10 - RW);
    for (let p = 0; p < span; p++) {
      c = Math.max(2, Math.min(across - 2 - RW, c + ri(rng, -1, 1)));
      for (let d = 0; d < RW; d++) {
        const [x, y] = vertical ? [c + d, p] : [p, c + d];
        isWater.add(cellKey(x!, y!));
      }
    }
  } else if (water === 'coast') {
    const side = ri(rng, 0, 3); // 0 E, 1 N, 2 W, 3 S
    let depth = ri(rng, 8, 12);
    const span = side % 2 === 0 ? h : w;
    for (let p = 0; p < span; p++) {
      depth = Math.max(6, Math.min(16, depth + ri(rng, -1, 1)));
      for (let d = 0; d < depth; d++) {
        const [x, y] = side === 0 ? [w - 1 - d, p] : side === 1 ? [p, d] : side === 2 ? [d, p] : [p, h - 1 - d];
        isWater.add(cellKey(x!, y!));
      }
    }
    // shift the core toward the shore, a small dry gap short of high water
    const gap = ri(rng, 2, 5);
    if (side === 0) coreX = Math.max(2, w - 17 - gap - coreW);
    else if (side === 2) coreX = Math.min(w - coreW - 2, 17 + gap);
    else if (side === 1) coreY = Math.min(h - coreH - 2, 17 + gap);
    else coreY = Math.max(2, h - 17 - gap - coreH);
  }
  for (const k of isWater) cells[k] = { t: 'water' };

  // 2. the core, generated on its own grid with its cut of the water, then
  // offset into place (cells override the water layer — quays and bridges
  // are the core's own business)
  const coreWater = new Set<string>();
  for (const k of isWater) {
    const [x, y] = parseCellKey(k);
    if (x >= coreX && x < coreX + coreW && y >= coreY && y < coreY + coreH) {
      coreWater.add(cellKey(x - coreX, y - coreY));
    }
  }
  const core = genCityWards(rng, coreW, coreH, { ...opts, walls: '1' }, areaId, coreWater);
  for (const [k, cell] of Object.entries(core.cells)) {
    const [x, y] = parseCellKey(k);
    cells[cellKey(x + coreX, y + coreY)] = cell;
  }
  const areas: SiteArea[] = core.areas.map((a) => ({ ...a, x: a.x + coreX, y: a.y + coreY }));
  let ai = core.areas.length;

  // 3. the avenues run on: every gate sends a 2-wide road wandering to its
  // map edge, bridging water on the way. An organic core (R2) hands us its
  // gate cells + outward dir directly; a rectangular core (v3) is read off
  // its wall-ring door cells as before.
  interface Gate { x: number; y: number; dx: number; dy: number }
  const gates: Gate[] = [];
  if (core.gates) {
    for (const g of core.gates) gates.push({ x: g.x + coreX, y: g.y + coreY, dx: g.dx, dy: g.dy });
  } else {
    const ringMin = 1, ringMaxX = coreW - 2, ringMaxY = coreH - 2; // walled m=2 ring, core-local
    const DIR: Array<[number, number]> = [[1, 0], [0, -1], [-1, 0], [0, 1]]; // E N W S
    for (const [k, cell] of Object.entries(core.cells)) {
      if (cell.t !== 'door') continue;
      const [lx, ly] = parseCellKey(k);
      const side = lx === ringMaxX ? 0 : ly === ringMin ? 1 : lx === ringMin ? 2 : ly === ringMaxY ? 3 : -1;
      if (side === -1) continue;
      const [dx, dy] = DIR[side]!;
      const g = { x: lx + coreX, y: ly + coreY, dx, dy };
      // gates are 2-wide door pairs — keep one per pair (skip if an adjacent
      // gate on the same side is already kept)
      if (!gates.some((o) => o.dx === dx && o.dy === dy && Math.abs(o.x - g.x) + Math.abs(o.y - g.y) <= 1)) gates.push(g);
    }
  }
  const roads: Array<Array<[number, number]>> = [];
  for (const g of gates) {
    const path: Array<[number, number]> = [];
    const dx = g.dx, dy = g.dy;
    let x = g.x + dx * 2, y = g.y + dy * 2; // start just beyond the ring
    let drift = 0;
    while (x >= 0 && x < w && y >= 0 && y < h) {
      // 2-wide lane, meandering a step sideways now and then; floor paints
      // over water exactly like the core's avenues — that is the bridge
      put(cells, x, y, 'floor');
      if (dx === 0) put(cells, x + 1, y, 'floor'); else put(cells, x, y + 1, 'floor');
      path.push([x, y]);
      if (rng() < 0.25 && Math.abs(drift) < 6) {
        const s = ri(rng, 0, 1) ? 1 : -1;
        drift += s;
        if (dx === 0) x = Math.max(1, Math.min(w - 2, x + s));
        else y = Math.max(1, Math.min(h - 2, y + s));
      }
      x += dx; y += dy;
    }
    if (path.length > 6) roads.push(path);
  }

  // 4. the burrows: hamlet clusters strung along the approach roads — each
  // keyed as a district, so the outskirts drill down exactly like a ward
  const pool = [...BURROWS];
  const placedHamlets: Rect[] = [];
  for (const path of roads) {
    const count = path.length > 40 ? ri(rng, 1, 2) : 1;
    for (let n = 0; n < count && pool.length; n++) {
      const at = ri(rng, Math.floor(path.length * 0.25), path.length - 5);
      const p = path[Math.max(0, Math.min(path.length - 1, at))]!;
      const hx = p[0] + ri(rng, -3, 3), hy = p[1] + ri(rng, -3, 3);
      const hr: Rect = { x: hx - 7, y: hy - 6, w: 15, h: 13 };
      if (hr.x < 1 || hr.y < 1 || hr.x + hr.w > w - 1 || hr.y + hr.h > h - 1) continue;
      // stay outside the walls and clear of water and other hamlets
      if (hr.x + hr.w > coreX && hr.x < coreX + coreW && hr.y + hr.h > coreY && hr.y < coreY + coreH) continue;
      if (placedHamlets.some((o) => overlaps(hr, o, 4))) continue;
      let wet = false;
      for (let yy = hr.y; yy < hr.y + hr.h && !wet; yy++) for (let xx = hr.x; xx < hr.x + hr.w; xx++) {
        if (isWater.has(cellKey(xx, yy))) { wet = true; break; }
      }
      if (wet) continue;
      if (zones) {
        // ROUGH overview: an outskirt hamlet is a small ZONE, not drawn cottages
        for (let yy = hr.y + 1; yy < hr.y + hr.h - 1; yy++) for (let xx = hr.x + 1; xx < hr.x + hr.w - 1; xx++) {
          const k = cellKey(xx, yy);
          if (!cells[k]) cells[k] = { t: 'floor', zone: 32 + placedHamlets.length };
        }
      } else {
        // 3–7 cottages, each with its floor apron, plus a lane to the road
        const homes = ri(rng, 3, 7);
        for (let b = 0; b < homes; b++) {
          const bw = ri(rng, 2, 3), bh = ri(rng, 2, 3);
          const bx = ri(rng, hr.x + 1, hr.x + hr.w - bw - 1), by = ri(rng, hr.y + 1, hr.y + hr.h - bh - 1);
          const br: Rect = { x: bx, y: by, w: bw, h: bh };
          let clear = true;
          for (let yy = by - 1; yy <= by + bh && clear; yy++) for (let xx = bx - 1; xx <= bx + bw; xx++) {
            if (cells[cellKey(xx, yy)]) { clear = false; break; }
          }
          if (!clear) continue;
          fillRect(cells, br, 'wall');
          for (let yy = by - 1; yy <= by + bh; yy++) for (let xx = bx - 1; xx <= bx + bw; xx++) {
            const k = cellKey(xx, yy);
            if (!cells[k]) cells[k] = { t: 'floor' };
          }
          addStreetDoor(cells, br, rng);
        }
      }
      // the lane: straight line from hamlet centre to the road point
      let lx = hx, ly = hy;
      while (lx !== p[0]) { lx += Math.sign(p[0] - lx); if (!cells[cellKey(lx, ly)]) put(cells, lx, ly, 'floor'); }
      while (ly !== p[1]) { ly += Math.sign(p[1] - ly); if (!cells[cellKey(lx, ly)]) put(cells, lx, ly, 'floor'); }
      placedHamlets.push(hr);
      const label = pool.splice(Math.floor(rng() * pool.length), 1)[0]!;
      areas.push({ id: areaId(ai++), label, kind: 'district', ...hr });
    }
  }

  return { cells, areas };
}

// ---------- district: one ward at 10 ft, honoring the context contract ----------
// (LAYERED-SPACES.md §2, N-2.) The child agrees with the parent: a street
// that crossed the ward boundary in the overview enters HERE at the same
// projected point; the side that abutted the city wall is walled (entries
// through it are gates); water enters where the river crossed. Standalone
// (no ctx — a hand-created district) defaults to a street through the middle.

function genDistrict(
  rng: Rng, w: number, h: number, opts: Record<string, string>, areaId: (i: number) => string,
  ctx?: SiteContext,
): FloorPlan {
  // v2 TERRACES the fabric (R7β-2): party walls + back-alleys + garden courts
  // instead of moating every house. v1 (stored floors) never sets it and is
  // byte-identical below. A salted integer hash textures the terrace WITHOUT
  // touching the rng (draw order stays scan-independent), same as the city.
  const terrace = opts.terrace === '1';
  const cells: Cells = {};
  const context: SiteContext = ctx && ctx.entries.length ? ctx : {
    entries: [
      { side: 'w', at: Math.floor(h / 2), kind: 'street' },
      { side: 'e', at: Math.floor(h / 2), kind: 'street' },
    ],
    edges: ctx?.edges ?? [],
  };
  const edgeKind = (side: string): string => context.edges.find((e) => e.side === side)?.kind ?? 'open';

  // 1. edge dressing: the sides the parent says are wall/water
  for (const side of ['n', 'e', 's', 'w'] as const) {
    const k = edgeKind(side);
    if (k === 'open') continue;
    const span = side === 'n' || side === 's' ? w : h;
    const depth = k === 'water' ? 3 : 1;
    for (let p = 0; p < span; p++) for (let d = 0; d < depth; d++) {
      const [x, y] = side === 'n' ? [p, d] : side === 's' ? [p, h - 1 - d]
        : side === 'w' ? [d, p] : [w - 1 - d, p];
      put(cells, x!, y!, k === 'water' ? 'water' : 'wall');
    }
  }

  // 2. the ward square, roughly central
  const ps = ri(rng, 7, 11);
  const cx = Math.floor(w / 2) + ri(rng, -4, 4);
  const cy = Math.floor(h / 2) + ri(rng, -4, 4);
  const plaza: Rect = { x: cx - (ps >> 1), y: cy - (ps >> 1), w: ps, h: ps };
  fillRect(cells, plaza, 'floor');

  // 3. every entry enters exactly where the parent projected it
  const lane = (x: number, y: number, horiz: boolean): void => {
    const putLane = (lx: number, ly: number): void => {
      if (lx < 1 || ly < 1 || lx > w - 2 || ly > h - 2) return;
      if (cells[cellKey(lx, ly)]?.t === 'water') { put(cells, lx, ly, 'floor'); return; } // a bridge
      put(cells, lx, ly, 'floor');
    };
    putLane(x, y);
    if (horiz) putLane(x, y + 1); else putLane(x + 1, y);
  };
  for (const e of context.entries) {
    const horizSide = e.side === 'w' || e.side === 'e';
    if (e.kind === 'water') {
      // a canal from the edge toward the centre; joins open water it meets
      const len = Math.floor((horizSide ? w : h) / 3);
      for (let d = 0; d < len; d++) for (let off = -1; off <= 1; off++) {
        const [x, y] = e.side === 'w' ? [d, e.at + off] : e.side === 'e' ? [w - 1 - d, e.at + off]
          : e.side === 'n' ? [e.at + off, d] : [e.at + off, h - 1 - d];
        if (x! >= 0 && y! >= 0 && x! < w && y! < h) put(cells, x!, y!, 'water');
      }
      continue;
    }
    // the boundary cells themselves: doors through a wall edge, open floor
    // otherwise (the street simply continues off-map toward the parent)
    for (let off = 0; off < 2; off++) {
      const [bx, by] = e.side === 'w' ? [0, e.at + off] : e.side === 'e' ? [w - 1, e.at + off]
        : e.side === 'n' ? [e.at + off, 0] : [e.at + off, h - 1];
      put(cells, bx!, by!, edgeKind(e.side) === 'wall' ? 'door' : 'floor');
    }
    // the L to the square: perpendicular leg, then along to the centre
    if (horizSide) {
      const x0 = e.side === 'w' ? 1 : w - 2;
      for (let x = Math.min(x0, cx); x <= Math.max(x0, cx); x++) lane(x, e.at, true);
      for (let y = Math.min(e.at, cy); y <= Math.max(e.at, cy); y++) lane(cx, y, false);
    } else {
      const y0 = e.side === 'n' ? 1 : h - 2;
      for (let y = Math.min(y0, cy); y <= Math.max(y0, cy); y++) lane(e.at, y, false);
      for (let x = Math.min(e.at, cx); x <= Math.max(e.at, cx); x++) lane(x, cy, true);
    }
  }

  // v2 terrace texture: a salted hash (no rng in the hot loop) + a market
  // cross at the square's heart, so the ward centre reads as a PLACE — the
  // same civic-monument note the city plaza carries (R4/R7β-2).
  const salt = terrace ? Math.floor(rng() * 0x7fffffff) : 0;
  const noise = (x: number, y: number): number => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + salt) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  };
  if (terrace && at(cells, cx, cy)?.t === 'floor') {
    put(cells, cx, cy, 'wall');
    cells[cellKey(cx, cy)]!.role = 'civic';
  }

  // 4. the ward's landmark, GUARANTEED: the clear patch nearest the square
  //    goes grand (the scale ladder must always have somewhere to enter —
  //    N-1's rule). A dense ward can radiate two dozen streets, so fixed
  //    spots beside the plaza are not enough: scan, nearest-first, shrinking
  //    if the fabric is truly packed.
  const notable: Rect[] = [];
  const gw0 = ri(rng, 7, 9), gh0 = ri(rng, 7, 9);
  for (const [gw, gh] of [[gw0, gh0], [7, 7], [6, 6], [5, 5]] as const) {
    let best: Rect | null = null;
    let bestD = Infinity;
    for (let y = 2; y + gh <= h - 2; y += 2) for (let x = 2; x + gw <= w - 2; x += 2) {
      const d = Math.abs(x + gw / 2 - cx) + Math.abs(y + gh / 2 - cy);
      if (d >= bestD) continue;
      let clear = true;
      for (let yy = y - 1; yy <= y + gh && clear; yy++) for (let xx = x - 1; xx <= x + gw; xx++) {
        if (cells[cellKey(xx, yy)]) { clear = false; break; }
      }
      if (clear) { best = { x, y, w: gw, h: gh }; bestD = d; }
    }
    if (!best) continue;
    fillRect(cells, best, 'wall');
    for (let yy = best.y - 1; yy <= best.y + best.h; yy++) for (let xx = best.x - 1; xx <= best.x + best.w; xx++) {
      const k = cellKey(xx, yy);
      if (!cells[k]) cells[k] = { t: 'floor' };
    }
    addStreetDoor(cells, best, rng);
    notable.push(best);
    break;
  }

  // 5. houses pack the street frontage. v1 MOATS each mass (a box of boxes);
  //    v2 TERRACES — shared party walls, one back-alley behind ~60% cutting
  //    the fabric inward, the un-alleyed pockets left for garden courts (the
  //    same de-box R4 gave the city, now one scale down; R7β-2).
  for (let pass = 0; pass < (terrace ? 7 : 5); pass++) {
    let placed = false;
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      if (cells[cellKey(x, y)]) continue;
      let fronts = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        if (at(cells, x + dx, y + dy)?.t === 'floor') { fronts = true; break; }
      }
      if (!fronts) continue;
      const n = noise(x, y);
      // v2 leaves ~1-in-10 frontage cells un-built (noise-gated, no rng draw),
      // so the terrace has breaks; v1 keeps its 35% rng skip byte-for-byte.
      if (terrace ? ((n >> 6) % 10 < 1) : (rng() < 0.35)) continue;
      const bw = terrace ? 2 + (n % 4) : 2 + Math.floor(rng() * 4);
      const bh = terrace ? 2 + ((n >> 3) % 4) : 2 + Math.floor(rng() * 4);
      let spot: Rect | null = null;
      for (const [ax, ay] of [[x, y], [x - bw + 1, y], [x, y - bh + 1], [x - bw + 1, y - bh + 1]] as const) {
        if (ax < 2 || ay < 2 || ax + bw > w - 2 || ay + bh > h - 2) continue;
        let fits = true;
        for (let yy = ay; yy < ay + bh && fits; yy++) for (let xx = ax; xx < ax + bw; xx++) {
          if (cells[cellKey(xx, yy)]) { fits = false; break; }
        }
        if (fits) { spot = { x: ax, y: ay, w: bw, h: bh }; break; }
      }
      if (!spot) continue;
      fillRect(cells, spot, 'wall');
      const r = spot;
      if (!terrace) {
        // v1: moat the mass on all four sides (byte-identical to before)
        for (let yy = r.y - 1; yy <= r.y + r.h; yy++) for (let xx = r.x - 1; xx <= r.x + r.w; xx++) {
          const k = cellKey(xx, yy);
          if (!cells[k]) cells[k] = { t: 'floor' };
        }
      } else {
        // v2: no moat. Cut ONE back alley (noise-gated ~60%) on the interior
        // side OPPOSITE the street frontage, so the fabric deepens inward and
        // the NEXT ribbon has a street to front; the rest fuses party-walled.
        const frontsSide = (dx: number, dy: number): boolean => {
          if (dx) { for (let yy = r.y; yy < r.y + r.h; yy++) if (at(cells, dx < 0 ? r.x - 1 : r.x + r.w, yy)?.t === 'floor') return true; }
          else { for (let xx = r.x; xx < r.x + r.w; xx++) if (at(cells, xx, dy < 0 ? r.y - 1 : r.y + r.h)?.t === 'floor') return true; }
          return false;
        };
        const alley = (dx: number, dy: number): void => {
          if (dx) { const ax = dx < 0 ? r.x - 1 : r.x + r.w; for (let yy = r.y; yy < r.y + r.h; yy++) { const k = cellKey(ax, yy); if (!cells[k]) cells[k] = { t: 'floor' }; } }
          else { const ay = dy < 0 ? r.y - 1 : r.y + r.h; for (let xx = r.x; xx < r.x + r.w; xx++) { const k = cellKey(xx, ay); if (!cells[k]) cells[k] = { t: 'floor' }; } }
        };
        const fN = frontsSide(0, -1), fS = frontsSide(0, 1), fW = frontsSide(-1, 0), fE = frontsSide(1, 0);
        let bxx = 0, byy = 0;
        if (fN && !fS) byy = 1; else if (fS && !fN) byy = -1;
        else if (fW && !fE) bxx = 1; else if (fE && !fW) bxx = -1;
        if ((bxx || byy) && ((noise(r.x, r.y) >> 11) & 7) < 6) alley(bxx, byy);
      }
      addStreetDoor(cells, spot, rng);
      placed = true;
    }
    if (!placed) break;
  }

  // GARDEN COURTS (R7β-2, v2 only): the block interiors terracing leaves
  // un-built — an empty pocket fully ringed by houses, never reaching the
  // ward's open frame — read as green courts, ~half planted (noise-gated).
  // Pure post-process, no rng; mirrors the city's courts one scale up.
  if (terrace) {
    const seenG = new Uint8Array(w * h);
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const i0 = y * w + x;
      if (seenG[i0] || cells[cellKey(x, y)]) continue;
      const comp: number[] = [i0]; seenG[i0] = 1;
      let enclosed = true; // false the moment the pocket touches the outer frame
      for (let qi = 0; qi < comp.length; qi++) {
        const i = comp[qi]!, px = i % w, py = (i / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = px + dx, ny = py + dy;
          if (nx < 2 || ny < 2 || nx >= w - 2 || ny >= h - 2) { enclosed = false; continue; }
          if (cells[cellKey(nx, ny)]) continue; // a built/paved cell walls the court
          const ni = ny * w + nx;
          if (!seenG[ni]) { seenG[ni] = 1; comp.push(ni); }
        }
      }
      if (enclosed && comp.length >= 4 && comp.length <= 80 && ((noise(x, y) >> 7) & 3) < 2) {
        for (const i of comp) cells[cellKey(i % w, (i / w) | 0)] = { t: 'floor', role: 'garden' };
      }
    }

    // RECLAIM: terracing can pinch a 1-wide alley or an un-planted yard off the
    // street. Flood the open network from the square; any floor/door it can't
    // reach that ISN'T a green court fuses back into its block (wall). The
    // streets then read clean and connected, and the only enclosed open ground
    // is the courts. Pure post-process, no rng.
    const reached = new Uint8Array(w * h);
    const stack: number[] = [];
    for (let yy = plaza.y; yy < plaza.y + plaza.h; yy++) for (let xx = plaza.x; xx < plaza.x + plaza.w; xx++) {
      const c = at(cells, xx, yy);
      if (c && OPEN.has(c.t)) { const i = yy * w + xx; if (!reached[i]) { reached[i] = 1; stack.push(i); } }
    }
    while (stack.length) {
      const i = stack.pop()!, px = i % w, py = (i / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = px + dx, ny = py + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const c = at(cells, nx, ny);
        if (!c || !OPEN.has(c.t)) continue;
        const ni = ny * w + nx;
        if (!reached[ni]) { reached[ni] = 1; stack.push(ni); }
      }
    }
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
      const c = at(cells, xx, yy);
      if (!c || (c.t !== 'floor' && c.t !== 'door') || c.role === 'garden') continue;
      if (!reached[yy * w + xx]) put(cells, xx, yy, 'wall');
    }
  }

  // 6. the key
  const areas: SiteArea[] = [];
  let ai = 0;
  areas.push({ id: areaId(ai++), label: 'The Ward Square', kind: 'plaza', ...plaza });
  notable.forEach((g) => {
    const label = NOTABLES[Math.floor(rng() * NOTABLES.length)]!;
    stampRole(cells, g, NOTABLE_ROLE[label] ?? 'civic'); // R3 tint (cosmetic)
    areas.push({ id: areaId(ai++), label, kind: 'building', ...g });
  });
  // FLAG PLACEMENT (LAYERED-SPACES R7β): stamp the ward's flags — the SAME
  // named buildings the overview showed for this ward, at the projected spots
  // — over the fabric, each with a carved lane to the square (so it's always
  // reachable) and a street door. Keyed drillable with `flag:true`, so the
  // temple you saw at the city level IS here when you zoom in. Pure/no rng, so
  // a ward with no flags leaves the district byte-identical.
  for (const f of ctx?.flags ?? []) {
    const fw = 5, fh = 5;
    const fx = Math.max(2, Math.min(w - 2 - fw, f.x - (fw >> 1)));
    const fy = Math.max(2, Math.min(h - 2 - fh, f.y - (fh >> 1)));
    const r: Rect = { x: fx, y: fy, w: fw, h: fh };
    fillRect(cells, r, 'wall');
    for (let yy = fy - 1; yy <= fy + fh; yy++) for (let xx = fx - 1; xx <= fx + fw; xx++) {
      const k = cellKey(xx, yy);
      if (!cells[k]) cells[k] = { t: 'floor' }; // apron: the mass reads separate + has street
    }
    // a 1-wide lane from the flag's square-facing edge to the ward square,
    // carving through any house in the way but never the flag itself
    const lcx = fx + (fw >> 1), lcy = fy + (fh >> 1);
    let px = cx >= lcx ? fx + fw : fx - 1;
    let py = Math.max(fy, Math.min(fy + fh - 1, cy));
    const inFlag = (x: number, y: number): boolean => x >= fx && x < fx + fw && y >= fy && y < fy + fh;
    for (let guard = 0; (px !== cx || py !== cy) && guard < w + h; guard++) {
      if (px > 0 && py > 0 && px < w - 1 && py < h - 1 && !inFlag(px, py) && at(cells, px, py)?.t !== 'water') put(cells, px, py, 'floor');
      if (px !== cx) px += Math.sign(cx - px); else py += Math.sign(cy - py);
    }
    // a door onto the first street-adjacent side of the mass
    let doored = false;
    for (let xx = fx; xx < fx + fw && !doored; xx++) {
      if (at(cells, xx, fy - 1)?.t === 'floor') { put(cells, xx, fy, 'door'); doored = true; }
      else if (at(cells, xx, fy + fh)?.t === 'floor') { put(cells, xx, fy + fh - 1, 'door'); doored = true; }
    }
    for (let yy = fy; yy < fy + fh && !doored; yy++) {
      if (at(cells, fx - 1, yy)?.t === 'floor') { put(cells, fx, yy, 'door'); doored = true; }
      else if (at(cells, fx + fw, yy)?.t === 'floor') { put(cells, fx + fw - 1, yy, 'door'); doored = true; }
    }
    stampRole(cells, r, NOTABLE_ROLE[f.label] ?? (INN_NAMES.includes(f.label) ? 'inn' : 'civic'));
    areas.push({ id: areaId(ai++), label: f.label, kind: 'building', flag: true, ...r });
  }
  return { cells, areas };
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
