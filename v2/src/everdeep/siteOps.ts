// Site orchestration: the user-action layer between the pure generators
// (siteGen.ts) and the two surfaces that host the editor (/spaces/ and
// /world/). Everything here mutates a WorldDoc in memory and leaves saving
// to the caller. User-created entities take rid() ids like every hand-made
// page; the LAYOUT stays on the seed-path contract (floor seeds come from
// sitePath(worldSeed, siteId, z)), so a reroll is a /r:n bump, never a dice
// throw the world can't replay.

import { sitePath } from './seeds.ts';
import { newEntity, type WorldDoc, type EntityRecord } from '../engine/worldStore.ts';
import {
  ensureSiteForEntity, touchSite, effectiveCells, cellKey, parseCellKey, defaultSpec,
  type SiteRec, type SiteFloor, type SiteArea, type SpaceKind, type SiteCell,
} from './sites.ts';
import { planFloor, cellsFor, makeGenerator } from './siteGen.ts';

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
}

const ENTITY_KIND: Record<SpaceKind, string> = {
  dungeon: 'landmark', cave: 'landmark', building: 'building',
  room: 'building', town: 'settlement', city: 'settlement',
};

const FLOOR_LABEL = (z: number): string => (z === 0 ? 'Ground' : z > 0 ? `Upper ${z}` : `Depth ${-z}`);

/** Generate (or regenerate) one floor in place: sets gen + stored areas,
 *  clears overrides. The cells themselves are NOT stored — they re-derive
 *  from gen on every open (sites.ts storage contract). */
export function generateInto(world: WorldDoc, site: SiteRec, fi: number, generator: string, seed?: string): void {
  const floor = site.floors[fi]!;
  const s = seed ?? sitePath(world.seed, site.id, floor.z ?? fi);
  floor.gen = { generator, seed: s, genVersion: 1 };
  floor.cells = {};
  floor.areas = planFloor(generator, s, floor.w, floor.h).areas;
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
  if (!spec.blank) generateInto(world, site, 0, makeGenerator(spec.kind, spec.opts));
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
  generateInto(world, site, fi, floor.gen.generator, seed);
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
    generateInto(world, site, fi, from.gen.generator, sitePath(world.seed, site.id, z));
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
  if (area.entityId) {
    const existing = Object.values(world.entities).find((e) => e.id === area.entityId && !e.deleted);
    const s = existing && siteForEntityId(world, existing.id);
    if (s) return s.id;
  }
  const kind: SpaceKind = area.kind === 'district' ? 'town' : 'building';
  const label = area.label.toLowerCase();
  const type = /temple|shrine|church/.test(label) ? 'temple'
    : /keep|castle|garrison|barrack/.test(label) ? 'keep'
    : /tavern|inn|ale/.test(label) ? 'tavern'
    : /shop|market|counting|guild|bath|stable/.test(label) ? 'shop' : 'house';
  const parentEntity = world.entities[parentSite.entityId];
  const entity = newEntity(kind === 'town' ? 'district' : 'building', area.label, parentEntity?.id);
  (entity.tags ??= []).push('space');
  world.entities[entity.id] = entity;
  // interior dims scale from the footprint: parent cells are cellFt wide,
  // the interior is drawn at battle scale (5 ft)
  const scale = (parentSite.cellFt || 10) / 5;
  const w = Math.max(14, Math.min(80, Math.round(area.w * scale)));
  const h = Math.max(10, Math.min(80, Math.round(area.h * scale)));
  const site = ensureSiteForEntity(world, entity, kind === 'town' ? { w: 96, h: 96, cellFt: 10 } : { w, h, cellFt: 5 });
  site.parentSiteId = parentSite.id;
  site.x = area.x + area.w / 2;
  site.y = area.y + area.h / 2;
  void hostFloorFi;
  generateInto(world, site, 0, makeGenerator(kind, kind === 'town' ? {} : { type }));
  area.entityId = entity.id;
  touchSite(parentSite);
  return site.id;
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
 *  body when it has gm/dungeon "Room N" paragraphs. */
export function ensureGeneratedSite(world: WorldDoc, entity: EntityRecord, kind: SpaceKind, anchorIcon?: string): SiteRec {
  const pre = siteForEntityId(world, entity.id);
  if (pre) return pre;
  const site = ensureSiteForEntity(world, entity);
  const opts: Record<string, string | number> = {};
  if (kind === 'dungeon') {
    const rooms = [...bodyLabels(entity).keys()].filter((l) => /^room \d+$/.test(l)).length;
    if (rooms) opts.rooms = rooms;
  }
  if (kind === 'building') {
    const icon = (anchorIcon ?? '').toLowerCase();
    const gen = entity.gen?.generator ?? '';
    opts.type = icon === 'temple' ? 'temple' : icon === 'tower' ? 'keep'
      : gen.includes('tavern') ? 'tavern' : gen.includes('shop') ? 'shop' : 'house';
  }
  generateInto(world, site, 0, makeGenerator(kind, opts));
  bindAreasToBody(entity, site.floors[0]!);
  return site;
}

/** Index an entity body's labelled content: top-level block labels AND the
 *  labelled sections inside statblocks (a composite dungeon is ONE statblock
 *  whose sections are the rooms). Sections have no ids of their own, so a
 *  section reference is `blockId#Section Label` — resolveBlock callbacks
 *  split on the '#'. */
function bodyLabels(entity: EntityRecord): Map<string, string> {
  const byLabel = new Map<string, string>();
  const blocks = (entity.body ?? []) as Array<{ id?: string; label?: unknown; type?: string; sections?: Array<{ label?: unknown }> }>;
  for (const b of blocks) {
    if (!b.id) continue;
    if (typeof b.label === 'string') byLabel.set(b.label.toLowerCase(), b.id);
    for (const s of b.sections ?? []) {
      if (typeof s.label === 'string') byLabel.set(s.label.toLowerCase(), `${b.id}#${s.label}`);
    }
  }
  return byLabel;
}

/** Marry map areas to the entity's rolled room key: "Room N" sections, the
 *  Warded Gate, and the Inner Sanctum bind by label. Orphans keep their
 *  labels — a content reroll may drift counts, and a dangling key must
 *  degrade to a plain label, never break. */
export function bindAreasToBody(entity: EntityRecord, floor: SiteFloor): void {
  const byLabel = bodyLabels(entity);
  for (const a of floor.areas ?? []) {
    const want = a.kind === 'entrance' ? 'the warded gate' : a.kind === 'sanctum' ? 'the inner sanctum' : a.label.toLowerCase();
    const hit = byLabel.get(want);
    if (hit) a.blockId = hit;
  }
}
