// Site orchestration: the user-action layer between the pure generators
// (siteGen.ts) and the two surfaces that host the editor (/spaces/ and
// /world/). Everything here mutates a WorldDoc in memory and leaves saving
// to the caller. User-created entities take rid() ids like every hand-made
// page; the LAYOUT stays on the seed-path contract (floor seeds come from
// sitePath(worldSeed, siteId, z)), so a reroll is a /r:n bump, never a dice
// throw the world can't replay.

import { sitePath, rngFor, STREAM } from './seeds.ts';
import { THEMES } from '../composites/dungeon.ts';
import { newEntity, type WorldDoc, type EntityRecord } from '../engine/worldStore.ts';
import {
  ensureSiteForEntity, touchSite, effectiveCells, cellKey, parseCellKey, defaultSpec,
  computeSiteContext, siteById,
  type SiteRec, type SiteFloor, type SiteArea, type SpaceKind, type SiteCell, type SiteContext,
} from './sites.ts';
import { planFloor, cellsFor, makeGenerator, parseGenerator } from './siteGen.ts';

export interface NewSpaceSpec {
  name: string;
  kind: SpaceKind;
  w?: number;
  h?: number;
  cellFt?: number;
  /** generator options: rooms (dungeon), type (building), water/walls (town/city) */
  opts?: Record<string, string | number>;
  parentEntityId?: string;
  /** no generator — an empty hand-drawn canvas */
  blank?: boolean;
  /** layout seed for floor 0 — the New-space dialog previews a layout and
   *  passes the SAME seed here, so what you saw is what you get */
  seed?: string;
}

const ENTITY_KIND: Record<SpaceKind, string> = {
  dungeon: 'landmark', cave: 'landmark', building: 'building',
  room: 'building', town: 'settlement', city: 'settlement', district: 'district',
};

const FLOOR_LABEL = (z: number): string => (z === 0 ? 'Ground' : z > 0 ? `Upper ${z}` : `Depth ${-z}`);

/** Generate (or regenerate) one floor in place: sets gen + stored areas,
 *  clears overrides. The cells themselves are NOT stored — they re-derive
 *  from gen on every open (sites.ts storage contract). `ctx` is stored on
 *  the gen block so the base re-derives identically (LAYERED-SPACES §2). */
export function generateInto(
  world: WorldDoc, site: SiteRec, fi: number, generator: string, seed?: string, ctx?: SiteContext,
): void {
  const floor = site.floors[fi]!;
  const s = seed ?? sitePath(world.seed, site.id, floor.z ?? fi);
  floor.gen = { generator, seed: s, genVersion: 1, ...(ctx ? { ctx } : {}) };
  floor.cells = {};
  floor.areas = planFloor(generator, s, floor.w, floor.h, ctx).areas;
  touchSite(site);
}

/** Create a space: its wiki entity + its site, generated unless blank. */
export function createSpace(world: WorldDoc, spec: NewSpaceSpec): { entity: EntityRecord; site: SiteRec } {
  const entity = newEntity(ENTITY_KIND[spec.kind], spec.name, spec.parentEntityId);
  // the tag round-trips through spaceKindFor, so reopening derives the same
  // space kind ('room' also rides on it — its entity kind is plain building)
  (entity.tags ??= []).push(spec.kind === 'room' ? 'space' : spec.kind);
  world.entities[entity.id] = entity;
  const d = defaultSpec(spec.kind);
  const site = ensureSiteForEntity(world, entity, {
    w: spec.w ?? d.w, h: spec.h ?? d.h, cellFt: spec.cellFt ?? d.cellFt,
  });
  site.floors[0]!.label = FLOOR_LABEL(0);
  if (!spec.blank) generateInto(world, site, 0, makeGenerator(spec.kind, spec.opts), spec.seed);
  else touchSite(site);
  return { entity, site };
}

/** Reroll a generated floor: /r:n bump on the seed, overrides cleared,
 *  areas replaced by the new layout's. Destructive to hand edits — the
 *  caller confirms with the user first. */
export function rerollFloor(world: WorldDoc, site: SiteRec, fi: number): void {
  const floor = site.floors[fi]!;
  if (!floor.gen) return;
  const m = /^(.*?)(?:\/r:(\d+))?$/.exec(floor.gen.seed)!;
  const seed = `${m[1]}/r:${(Number(m[2]) || 0) + 1}`;
  generateInto(world, site, fi, floor.gen.generator, seed, floor.gen.ctx);
}

/** Add a floor above or below the given one. Generated sites generate the
 *  new level with the same generator; stairs on the source floor come
 *  through at the SAME cells (as overrides), each connected to the new
 *  layout so a z-stack is walkable, not decorative. */
export function addFloor(world: WorldDoc, site: SiteRec, fromFi: number, dir: 'above' | 'below'): number {
  const from = site.floors[fromFi]!;
  const zs = site.floors.map((f) => f.z ?? 0);
  const z = dir === 'above' ? Math.max(...zs) + 1 : Math.min(...zs) - 1;
  const floor: SiteFloor = { label: FLOOR_LABEL(z), z, w: from.w, h: from.h, cells: {} };
  site.floors.push(floor);
  site.floors.sort((a, b) => (b.z ?? 0) - (a.z ?? 0)); // top floor first in the tabs
  const fi = site.floors.indexOf(floor);
  const fromCells = effectiveCells(from, (g, w, h) => cellsFor(g, w, h));
  const stairKeys = Object.keys(fromCells).filter((k) => fromCells[k]!.t === 'stairs');
  if (from.gen) {
    generateInto(world, site, fi, from.gen.generator, sitePath(world.seed, site.id, z), from.gen.ctx);
    const base = cellsFor(floor.gen!, floor.w, floor.h);
    for (const k of stairKeys) {
      floor.cells[k] = { t: 'stairs' };
      connectToLayout(floor, base, k);
    }
  } else {
    for (const k of stairKeys) floor.cells[k] = { t: 'stairs' };
  }
  touchSite(site);
  return fi;
}

const OPEN = new Set(['floor', 'door', 'stairs', 'water', 'hazard', 'secret']);

/** Carve an L-corridor (as overrides) from a stamped stairs cell to the
 *  nearest open cell of the new floor's generated base. */
function connectToLayout(floor: SiteFloor, base: Record<string, SiteCell>, stairKey: string): void {
  const [sx, sy] = parseCellKey(stairKey);
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const [k, c] of Object.entries(base)) {
    if (!OPEN.has(c.t)) continue;
    const [x, y] = parseCellKey(k);
    const d = Math.abs(x - sx) + Math.abs(y - sy);
    if (d < bestD) { bestD = d; best = [x, y]; }
  }
  if (!best || bestD <= 1) return;
  const [tx, ty] = best;
  let x = sx, y = sy;
  const step = (): void => {
    const k = cellKey(x, y);
    if (k !== stairKey && !(base[k] && OPEN.has(base[k]!.t))) floor.cells[k] = { t: 'floor' };
  };
  while (x !== tx) { x += Math.sign(tx - x); step(); }
  while (y !== ty) { y += Math.sign(ty - y); step(); }
}

/** Materialize an area of a site (a grand building, a district) as its own
 *  nested sub-site with a child entity, generated to fit. Returns the new
 *  site's id; a second call just returns the existing one. */
export function makeSubSite(world: WorldDoc, parentSite: SiteRec, area: SiteArea, hostFloorFi = 0): string {
  const pre = area.entityId
    ? Object.values(world.entities).find((e) => e.id === area.entityId && !e.deleted)
    : undefined;
  if (pre) {
    const s = siteForEntityId(world, pre.id);
    if (s) return s.id;
  }
  // R7β: a FLAG at the ROUGH city overview opens its WARD DISTRICT (where the
  // flag is placed and drillable), not the building directly — the flag is a
  // sub-level at each level, and this keeps ONE building per flag (drilled from
  // inside the district). Find the ward whose footprint holds the flag's centre.
  if (area.flag && !pre && (parentSite.cellFt || 10) >= 50) {
    const host0 = parentSite.floors[hostFloorFi] ?? parentSite.floors[0]!;
    const fcx = area.x + area.w / 2, fcy = area.y + area.h / 2;
    const ward = (host0.areas ?? []).find((a) => a.kind === 'district'
      && fcx >= a.x && fcx < a.x + a.w && fcy >= a.y && fcy < a.y + a.h);
    if (ward) return makeSubSite(world, parentSite, ward, hostFloorFi);
  }
  const kind: SpaceKind = area.kind === 'district' ? 'district' : 'building';
  const label = area.label.toLowerCase();
  const type = /temple|shrine|church/.test(label) ? 'temple'
    : /keep|castle|garrison|barrack/.test(label) ? 'keep'
    : /tavern|inn|ale/.test(label) ? 'tavern'
    : /shop|market|counting|guild|bath|stable/.test(label) ? 'shop' : 'house';
  const parentEntity = world.entities[parentSite.entityId];
  // a web-married building (the area already points at a real page — an
  // inn, a shop) gets ITS interior; only unbound areas mint a fresh entity
  const entity = pre ?? newEntity(kind === 'district' ? 'district' : 'building', area.label, parentEntity?.id);
  if (!(entity.tags ?? []).includes('space')) (entity.tags ??= []).push('space');
  world.entities[entity.id] = entity;
  // interior dims scale from the FOOTPRINT (the scale ladder,
  // LAYERED-SPACES.md §1): a district descends to 10 ft/cell, a building to
  // battle scale (5 ft) — each sized by what the parent actually drew, so a
  // city-overview ward opens wide and a hamlet burrow opens small.
  const childFt = kind === 'district' ? 10 : 5;
  const scale = (parentSite.cellFt || 10) / childFt;
  // a district is sized by its footprint; a BUILDING opens a fixed 200 ft
  // tactical window (40 × 5 ft, LAYERED-SPACES R5) with the clicked footprint
  // drawn in its centre — so the street, neighbours, and yard always fit
  // however small (a hovel) or large (a keep) the footprint was.
  const WINDOW = 40;
  const w = kind === 'district' ? Math.max(48, Math.min(220, Math.round(area.w * scale))) : WINDOW;
  const h = kind === 'district' ? Math.max(48, Math.min(220, Math.round(area.h * scale))) : WINDOW;
  const site = ensureSiteForEntity(world, entity, { w, h, cellFt: childFt });
  site.parentSiteId = parentSite.id;
  site.x = area.x + area.w / 2;
  site.y = area.y + area.h / 2;
  // THE CONTEXT CONTRACT (LAYERED-SPACES §2): the child agrees with the
  // parent's EFFECTIVE geometry (gen + hand edits) around its footprint
  const host = parentSite.floors[hostFloorFi] ?? parentSite.floors[0]!;
  const hostCells = effectiveCells(host, (g, gw, gh) => cellsFor(g, gw, gh));
  // districts follow the parent via ctx; buildings freeze the block facts the
  // window needs (door side, edges, footprint size) into their generator id —
  // no ctx, so they don't spuriously "follow parent edits" (refreshChildContext)
  const ctx = kind === 'district' ? computeSiteContext(hostCells, area, w, h) : undefined;
  // R7β: hand the district the ward's FLAGS, projected into its cell space, so
  // it places the same named buildings the overview showed for this ward
  if (ctx) ctx.flags = projectFlags(host.areas ?? [], area, w, h);
  const opts: Record<string, string> = {};
  if (kind === 'building') {
    opts.type = type;
    // the front door + street face the busiest frontage the parent drew
    const streetSide = frontageSide(hostCells, area);
    if (streetSide) opts.door = streetSide;
    // the footprint's size in child cells (clamped so surroundings always fit)
    opts.bw = String(Math.max(6, Math.min(16, Math.round(area.w * scale))));
    opts.bh = String(Math.max(6, Math.min(16, Math.round(area.h * scale))));
    // sides that abut the parent's water (a quay) or the continuous city wall
    opts.edge = blockEdges(hostCells, area);
  }
  generateInto(world, site, 0, makeGenerator(kind, opts), undefined, ctx);
  area.entityId = entity.id;
  touchSite(parentSite);
  return site.id;
}

/** Which side of an area rect fronts the most walkable parent cells — the
 *  street its door should face. Null when nothing fronts (landlocked). */
function frontageSide(
  cells: Record<string, SiteCell>, area: { x: number; y: number; w: number; h: number },
): 'n' | 'e' | 's' | 'w' | null {
  const walk = (x: number, y: number): number => {
    const t = cells[cellKey(x, y)]?.t;
    return t === 'floor' || t === 'door' ? 1 : 0;
  };
  const counts: Array<['n' | 'e' | 's' | 'w', number]> = [['n', 0], ['e', 0], ['s', 0], ['w', 0]];
  for (let x = area.x; x < area.x + area.w; x++) {
    counts[0]![1] += walk(x, area.y - 1);
    counts[2]![1] += walk(x, area.y + area.h);
  }
  for (let y = area.y; y < area.y + area.h; y++) {
    counts[1]![1] += walk(area.x + area.w, y);
    counts[3]![1] += walk(area.x - 1, y);
  }
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0]![1] > 0 ? counts[0]![0] : null;
}

/** Per-side parent edge around a footprint (n,e,s,w order): 'r' if the cells
 *  just outside a side are mostly water, 'w' if a near-continuous city wall,
 *  else 'o'. Feeds the R5 block window's edge dressing — a waterfront building
 *  shows its quay, one built into the wall shows the rampart. Water is
 *  unambiguous; the wall bar is high so a mere party wall never reads as one. */
function blockEdges(
  cells: Record<string, SiteCell>, area: { x: number; y: number; w: number; h: number },
): string {
  const scan = (pts: Array<[number, number]>): string => {
    let wall = 0, water = 0;
    for (const [x, y] of pts) { const t = cells[cellKey(x, y)]?.t; if (t === 'wall') wall++; else if (t === 'water') water++; }
    const n = pts.length || 1;
    if (water / n >= 0.4) return 'r';
    if (wall / n >= 0.85) return 'w';
    return 'o';
  };
  const north: Array<[number, number]> = [], south: Array<[number, number]> = [];
  const west: Array<[number, number]> = [], east: Array<[number, number]> = [];
  for (let x = area.x; x < area.x + area.w; x++) { north.push([x, area.y - 1]); south.push([x, area.y + area.h]); }
  for (let y = area.y; y < area.y + area.h; y++) { west.push([area.x - 1, y]); east.push([area.x + area.w, y]); }
  return scan(north) + scan(east) + scan(south) + scan(west);
}

/** Project the parent's FLAG areas that fall within a ward footprint into the
 *  child's cell space (R7β), so the district places the same named buildings
 *  the overview flagged for this ward. Pure; `undefined` when the ward holds
 *  no flags (keeps a flag-less district's ctx — and base — byte-identical). */
function projectFlags(
  areas: SiteArea[], ward: { x: number; y: number; w: number; h: number }, cw: number, ch: number,
): NonNullable<SiteContext['flags']> | undefined {
  const out: NonNullable<SiteContext['flags']> = [];
  for (const a of areas) {
    if (!a.flag) continue;
    const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
    if (cx < ward.x || cx >= ward.x + ward.w || cy < ward.y || cy >= ward.y + ward.h) continue;
    const px = Math.max(3, Math.min(cw - 4, Math.round(((cx - ward.x) / ward.w) * cw)));
    const py = Math.max(3, Math.min(ch - 4, Math.round(((cy - ward.y) / ward.h) * ch)));
    out.push({ x: px, y: py, label: a.label });
  }
  return out.length ? out : undefined;
}

/** Re-derive a child's context from the CURRENT parent geometry. Unedited
 *  children follow silently (their base re-derives — nothing to lose);
 *  hand-edited children report 'stale-edited' so the editor can OFFER a
 *  destructive regenerate instead of forcing one (LAYERED-SPACES §2). */
export function refreshChildContext(
  world: WorldDoc, child: SiteRec,
): { state: 'fresh' | 'updated' | 'stale-edited'; fresh?: SiteContext } {
  const floor = child.floors[0];
  if (!floor?.gen?.ctx || !child.parentSiteId) return { state: 'fresh' };
  const parent = siteById(world, child.parentSiteId);
  if (!parent) return { state: 'fresh' };
  let area: SiteArea | undefined, hostFloor: SiteFloor | undefined;
  for (const f of parent.floors) {
    area = (f.areas ?? []).find((a) => a.entityId === child.entityId);
    if (area) { hostFloor = f; break; }
  }
  if (!area || !hostFloor) return { state: 'fresh' };
  const hostCells = effectiveCells(hostFloor, (g, gw, gh) => cellsFor(g, gw, gh));
  const fresh = computeSiteContext(hostCells, area, floor.w, floor.h);
  fresh.flags = projectFlags(hostFloor.areas ?? [], area, floor.w, floor.h); // R7β
  if (JSON.stringify(fresh) === JSON.stringify(floor.gen.ctx)) return { state: 'fresh' };
  if (Object.keys(floor.cells).length === 0) {
    relayWithContext(world, child, fresh);
    return { state: 'updated' };
  }
  return { state: 'stale-edited', fresh };
}

/** Re-lay a child floor under a new context. Destroys cell overrides (the
 *  caller confirms when any exist) but area ids are seed-stable, so authored
 *  labels/notes and — critically — the entityId bindings that link areas to
 *  grandchild sites survive the re-lay. */
export function relayWithContext(world: WorldDoc, child: SiteRec, fresh: SiteContext): void {
  const floor = child.floors[0];
  if (!floor?.gen) return;
  const prevAreas = floor.areas ?? [];
  generateInto(world, child, 0, floor.gen.generator, floor.gen.seed, fresh);
  for (const a of floor.areas ?? []) {
    const prev = prevAreas.find((o) => o.id === a.id);
    if (!prev) continue;
    a.label = prev.label;
    if (prev.note) a.note = prev.note;
    if (prev.entityId) a.entityId = prev.entityId;
    if (prev.blockId) a.blockId = prev.blockId;
  }
}

function siteForEntityId(world: WorldDoc, entityId: string): SiteRec | undefined {
  for (const p of (world.planes ?? []) as Array<{ sites?: SiteRec[] }>) {
    const s = (p.sites ?? []).find((x) => x.entityId === entityId);
    if (s) return s;
  }
  return undefined;
}

/** Find-or-create + generate the site for an existing world entity (the
 *  /world/ "Interior map" button). Room count marries the entity's rolled
 *  body (gm/dungeon rooms in either body era), a story-web lair gets its
 *  holder stamped into the sanctum, and settlement plans take water facts
 *  from the world (`theme`). */
/** A delve's theme decides its ARCHITECTURE (interior role-theming, the
 *  epic's deferred slice): a beast warren or aberrant deep digs a cave, a
 *  dragon's lair opens into grand hollows, a giant hold builds halls at
 *  giant scale. Everything else keeps the worked-stone dungeon layout. */
const THEME_SPACE: Record<string, { kind: 'dungeon' | 'cave'; scale?: 'grand' }> = {
  undead: { kind: 'dungeon' }, fiend: { kind: 'dungeon' }, construct: { kind: 'dungeon' },
  fey: { kind: 'dungeon' }, humanoid: { kind: 'dungeon' },
  aberration: { kind: 'cave' }, beast: { kind: 'cave' },
  dragon: { kind: 'cave', scale: 'grand' }, giant: { kind: 'dungeon', scale: 'grand' },
};

/** Recover a delve's theme: a user-picked option first, else the statblock
 *  meta's first segment ("Undead crypt · 5 rooms · boss CR 6") matched
 *  against the composite's own THEMES list — never a re-roll. */
export function themeOfEntity(entity: EntityRecord): string | null {
  const opt = entity.gen?.opts?.theme;
  if (opt && THEMES.some((t) => t.value === opt)) return opt;
  const sb = (entity.body ?? []).find((b) => b.type === 'statblock') as { meta?: string } | undefined;
  const head = sb?.meta?.split('·')[0]?.trim().toLowerCase();
  if (!head) return null;
  return THEMES.find((t) => t.label.toLowerCase() === head)?.value ?? null;
}

export function ensureGeneratedSite(
  world: WorldDoc,
  entity: EntityRecord,
  kind: SpaceKind,
  anchorIcon?: string,
  theme?: { water?: 'river' | 'coast'; gates?: string },
): SiteRec {
  const pre = siteForEntityId(world, entity.id);
  if (pre) return pre;
  const site = ensureSiteForEntity(world, entity);
  const opts: Record<string, string | number> = {};
  let genKind: SpaceKind = kind;
  if (kind === 'dungeon' || kind === 'cave') {
    const rooms = bodyRooms(entity).size;
    if (rooms) opts.rooms = rooms;
    const tv = themeOfEntity(entity);
    if (tv) {
      opts.theme = tv; // rides in the generator string: the tint + the record
      const space = THEME_SPACE[tv];
      if (space && kind === 'dungeon') {
        genKind = space.kind;
        if (space.scale) opts.scale = space.scale;
      }
    }
  }
  if (kind === 'building') {
    const icon = (anchorIcon ?? '').toLowerCase();
    const gen = entity.gen?.generator ?? '';
    opts.type = icon === 'temple' ? 'temple' : icon === 'tower' ? 'keep'
      : gen.includes('tavern') ? 'tavern' : gen.includes('shop') ? 'shop' : 'house';
  }
  if ((kind === 'town' || kind === 'city') && theme?.water) opts.water = theme.water;
  // the real roads approaching this settlement become its gates (R1) — a
  // city's overview places them where you'd actually ride in
  if (kind === 'city' && theme?.gates) opts.gates = theme.gates;
  // the overview core scales to how many souls live here (batch 312): read the
  // census off the entity so a market city and a metropolis draw different-sized
  // cores. Absent/0 → genCityOverview keeps its frozen 0.45 default (byte-ident).
  if (kind === 'city') { const pop = Number(entity.fields?.population) || 0; if (pop) opts.pop = pop; }
  generateInto(world, site, 0, makeGenerator(genKind, opts));
  furnishSite(world, entity, site, 0);
  return site;
}

/** Everything that marries a generated floor to its entity, in one place:
 *  bind the keys, dress the rooms from their titles, stand the prize in the
 *  sanctum. Reroll paths call this too, so a rerolled floor re-furnishes. */
export function furnishSite(world: WorldDoc, entity: EntityRecord, site: SiteRec, fi: number): void {
  const floor = site.floors[fi]!;
  bindAreasToBody(entity, floor);
  dressAreasFromTitles(floor);
  if (fi === 0) placePrize(world, entity, site);
  const kind = floor.gen ? parseGenerator(floor.gen.generator)?.kind : null;
  if (kind === 'town' || kind === 'city') marryCityToWeb(world, entity, floor);
}

/** The settlement analogue of the room-key marriage: if the town has a
 *  cast (buildLifeWeb minted inns and shops as child building entities),
 *  seat them in the plan's notable buildings — each unbound building area
 *  adopts a cast member's page and name, so the city map becomes an index
 *  into the town's people, and "Create interior" opens THEIR building
 *  (makeSubSite reuses a bound entity instead of minting a stranger). */
function marryCityToWeb(world: WorldDoc, entity: EntityRecord, floor: SiteFloor): void {
  const seats = (floor.areas ?? []).filter((a) => a.kind === 'building' && !a.entityId);
  if (!seats.length) return;
  const cast = Object.values(world.entities)
    .filter((e) => !e.deleted && e.parentId === entity.id && e.kind === 'building')
    .sort((a, b) => (a.id < b.id ? -1 : 1)); // stable seating order
  seats.forEach((a, i) => {
    const b = cast[i];
    if (!b) return;
    a.entityId = b.id;
    a.label = b.name;
  });
}

/** The map obeys the key (interior theming, the cheap half): a room titled
 *  "Flooded Cistern" holds water, a "Collapsed Gallery" lies under rubble.
 *  Carved as overrides, deterministically from the floor seed — the same
 *  key dresses the same cells on every device. Word lists follow the
 *  composite's ROOM_CONDITION vocabulary; an unmatched title stays bare. */
const DRESS_WATER = /flooded|sunken|drowned|cistern|tide|deluged/i;
const DRESS_RUBBLE = /collapsed|toppled|ruined|crumbl|caved|sagging|shattered/i;
const DRESS_PERIL = /scorched|ash-choked|burning|blood-slick|frozen|blighted/i;

export function dressAreasFromTitles(floor: SiteFloor): void {
  if (!floor.gen) return;
  const base = cellsFor(floor.gen, floor.w, floor.h);
  const rng = rngFor(`${floor.gen.seed}/dress`, STREAM.CONTENT);
  const openFloor = (x: number, y: number): boolean => {
    const k = cellKey(x, y);
    return (floor.cells[k] ?? base[k])?.t === 'floor';
  };
  for (const a of floor.areas ?? []) {
    if (!a.blockId) continue; // only rooms the key actually names
    const water = DRESS_WATER.test(a.label);
    const rubble = DRESS_RUBBLE.test(a.label);
    const peril = DRESS_PERIL.test(a.label);
    if (!water && !rubble && !peril) continue;
    if (water) {
      // a pool: seeded random walk filling ~a third of the room
      let x = a.x + Math.floor(a.w / 2), y = a.y + Math.floor(a.h / 2);
      const target = Math.max(3, Math.floor((a.w * a.h) / 3));
      for (let n = 0, guard = target * 6; n < target && guard > 0; guard--) {
        if (openFloor(x, y)) { floor.cells[cellKey(x, y)] = { t: 'water' }; n++; }
        x = Math.min(a.x + a.w - 1, Math.max(a.x, x + (rng() < 0.5 ? -1 : 1)));
        y = Math.min(a.y + a.h - 1, Math.max(a.y, y + (rng() < 0.5 ? -1 : 1)));
      }
    }
    if (rubble || peril) {
      const n = 1 + Math.floor(rng() * (rubble ? 3 : 2));
      for (let i = 0, guard = 24; i < n && guard > 0; guard--) {
        const x = a.x + Math.floor(rng() * a.w), y = a.y + Math.floor(rng() * a.h);
        if (openFloor(x, y)) { floor.cells[cellKey(x, y)] = { t: 'hazard' }; i++; }
      }
    }
  }
}

/** "…and the quest's prize is in room 12" (the epic's north star): a
 *  story-web lair is `heldBy` its boss/villain — stamp the holder into the
 *  sanctum's centre cell (a per-cell entityId override), so descending into
 *  the dungeon actually meets what the quest points at. */
export function placePrize(world: WorldDoc, entity: EntityRecord, site: SiteRec): void {
  const holder = (entity.relations ?? []).find((r) => r.type === 'heldBy')?.target;
  if (!holder || !world.entities[holder] || world.entities[holder]!.deleted) return;
  const floor = site.floors[0];
  if (!floor?.gen) return;
  const areas = floor.areas ?? [];
  const sanctum = areas.find((a) => a.kind === 'sanctum') ?? areas[areas.length - 1];
  if (!sanctum) return;
  const cx = sanctum.x + Math.floor(sanctum.w / 2);
  const cy = sanctum.y + Math.floor(sanctum.h / 2);
  const base = cellsFor(floor.gen, floor.w, floor.h);
  const k = cellKey(cx, cy);
  const under = base[k];
  if (!under || under.t === 'wall') return; // never bury the boss in masonry
  floor.cells[k] = { t: under.t, entityId: holder };
  sanctum.entityId ??= holder;
  touchSite(site);
}

type BodySection = { label?: unknown; pairs?: Array<{ key?: string }> };
type BodyBlock = { id?: string; label?: unknown; type?: string; sections?: BodySection[] };

/** Index an entity body's labelled content: top-level block labels AND the
 *  labelled sections inside statblocks (a composite dungeon is ONE statblock
 *  whose sections are the rooms). Sections have no ids of their own, so a
 *  section reference is `blockId#Section Label` — resolveBlock callbacks
 *  split on the '#'. */
function bodyLabels(entity: EntityRecord): Map<string, string> {
  const byLabel = new Map<string, string>();
  for (const b of (entity.body ?? []) as BodyBlock[]) {
    if (!b.id) continue;
    if (typeof b.label === 'string') byLabel.set(b.label.toLowerCase(), b.id);
    for (const s of b.sections ?? []) {
      if (typeof s.label === 'string') byLabel.set(s.label.toLowerCase(), `${b.id}#${s.label}`);
    }
  }
  return byLabel;
}

/** The body's numbered rooms, ordinal → {ref, label}. Two body eras:
 *  pre-B187 dungeons carried labelled "Room N" paragraph sections; the B187
 *  rebuild emits label-less keyValue sections whose FIRST pair key is
 *  "Room N · The <Title>". A keyValue section is referenced by that first
 *  key (`blockId#Room 3 · The Ossuary`) — resolvers match label OR first
 *  pair key. */
export function bodyRooms(entity: EntityRecord): Map<number, { ref: string; label: string }> {
  const out = new Map<number, { ref: string; label: string }>();
  for (const b of (entity.body ?? []) as BodyBlock[]) {
    if (!b.id) continue;
    if (typeof b.label === 'string') {
      const m = /^room (\d+)\b/i.exec(b.label);
      if (m) out.set(Number(m[1]), { ref: b.id, label: b.label });
    }
    for (const s of b.sections ?? []) {
      const key = typeof s.label === 'string' ? s.label : s.pairs?.[0]?.key;
      if (typeof key !== 'string') continue;
      const m = /^room (\d+)\b/i.exec(key);
      if (m) out.set(Number(m[1]), { ref: `${b.id}#${key}`, label: key });
    }
  }
  return out;
}

/** Marry map areas to the entity's rolled room key. The gate and sanctum
 *  bind by their fixed labels; numbered rooms bind by ORDINAL (the n-th
 *  room area is the body's Room n, whatever it is titled — labels drift,
 *  ordinals don't), and the map area ADOPTS the body's full room title
 *  ("Room 3 · The Flooded Ossuary"). Orphans keep their labels — a content
 *  reroll may drift counts, and a dangling key must degrade to a plain
 *  label, never break. */
export function bindAreasToBody(entity: EntityRecord, floor: SiteFloor): void {
  const byLabel = bodyLabels(entity);
  const rooms = bodyRooms(entity);
  let ordinal = 0;
  for (const a of floor.areas ?? []) {
    // cave CHAMBERS take room keys the same way — a beast warren's body
    // still rolls Room 1..N, and its first chambers wear them
    if (a.kind === 'room' || a.kind === 'chamber') {
      const hit = rooms.get(++ordinal);
      if (hit) { a.blockId = hit.ref; a.label = hit.label; }
      continue;
    }
    const want = a.kind === 'entrance' ? 'the warded gate' : a.kind === 'sanctum' ? 'the inner sanctum' : a.label.toLowerCase();
    const hit = byLabel.get(want);
    if (hit) a.blockId = hit;
  }
}
