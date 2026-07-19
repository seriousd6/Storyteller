// Sites — the ground tier (MAPS.md §3.1, PLAN "Nested-spaces epic").
// A site is a bounded square-grid battle map (a dungeon level, a tavern
// interior, a whole city plan) anchored to an entity: `plane.sites[]` in
// world.schema.json — designed and frozen long before this module existed.
// This file is the single TS home for the site shapes and the helpers that
// find/create them inside a WorldDoc; the generators live in siteGen.ts and
// the canvas editor in siteView.ts. Nothing here touches the DOM.
//
// Determinism contract (CONTRACTS §1/§4): a site owned by an entity gets its
// id from the seed path `${worldSeed}/${entityId}/site`, so descending into
// the same landmark on two devices mints the SAME site id — and the layout
// RNG runs on `sitePath(worldSeed, siteId, floor)` under STREAM.LAYOUT.

import { h64 } from './seeds.ts';
import type { WorldDoc, EntityRecord } from '../engine/worldStore.ts';

// 'secret' (a door shown to players as wall) and 'void' (an override that
// erases a generated cell back to nothing) were added while the schema was
// still unimplemented — the last moment enum growth was free (review 2026-07-17).
export type CellType = 'floor' | 'wall' | 'door' | 'stairs' | 'water' | 'hazard' | 'secret' | 'void';

export interface SiteCell {
  t: CellType;
  /** Ground-tier landmark: the prize/enemy/trap AT this cell. */
  entityId?: string;
}

/** A labelled rectangular region of a floor — a room key, a plaza, a city
 *  district. Semantic layer over the structural cells: room 12 stays "room 12"
 *  however its walls are redrawn. `blockId` binds the area to a body block of
 *  the site's entity (the gm/dungeon "Room 3" paragraph IS room 3's key). */
export interface SiteArea {
  id: string;
  label: string;
  kind?: string; // room | entrance | sanctum | hall | plaza | street | district | building | chamber | other
  x: number;
  y: number;
  w: number;
  h: number;
  entityId?: string;
  blockId?: string;
  note?: string;
}

export interface SiteFloor {
  label: string;
  z: number; // 0 = entry level; negative = below (Q20)
  w: number;
  h: number;
  /** SPARSE cell map "x,y" -> cell.
   *
   *  THE STORAGE CONTRACT (review 2026-07-17): when `gen` is set, `cells`
   *  holds ONLY hand-edit overrides — the base layout regenerates
   *  deterministically from gen.seed on every open, and an edited city
   *  stores 40 cells, not 40,000 (the same nothing-until-touched rule the
   *  ghost layer lives by, Q11). A 'void' override erases a generated cell.
   *  Without `gen` the floor is hand-drawn and `cells` is authoritative. */
  cells: Record<string, SiteCell>;
  areas?: SiteArea[];
  gen?: { generator: string; seed: string; genVersion?: number };
}

export interface SiteRec {
  id: string;
  entityId: string;
  /** Nested sub-sites: a city site contains building sites (Q17). When set,
   *  x/y are CELL coordinates inside the parent site's entry floor, not plane
   *  feet. */
  parentSiteId?: string;
  x: number;
  y: number;
  grid: 'square';
  cellFt: number;
  floors: SiteFloor[];
  /** Per-site merge stamps: sites carry their own LWW so two devices editing
   *  DIFFERENT sites in one world both survive a sync (worldStore.mergeWorlds
   *  unions sites by id before the coarse whole-plane LWW). */
  rev?: number;
  updated?: string;
}

/** Resolve a floor's effective cells: generated base + stored overrides.
 *  Pure — callers render/read this and write edits back as overrides via
 *  `writeCellOverride`. `regen` is siteGen.generateFloor, injected to keep
 *  this module DOM- and generator-free. */
export function effectiveCells(
  floor: SiteFloor,
  regen: (gen: { generator: string; seed: string; genVersion?: number }, w: number, h: number) => Record<string, SiteCell>,
): Record<string, SiteCell> {
  if (!floor.gen) return floor.cells;
  const base = regen(floor.gen, floor.w, floor.h);
  for (const [k, c] of Object.entries(floor.cells)) {
    if (c.t === 'void' && !c.entityId) delete base[k];
    else base[k] = c;
  }
  return base;
}

/** Record a hand edit on a floor as the minimal override: writing the value
 *  the generator already produces DELETES the override (the edit vanished
 *  back into the base), and clearing a cell on a generated floor stores a
 *  'void' tombstone. `baseCell` = what the generator puts at this key. */
export function writeCellOverride(
  floor: SiteFloor,
  key: string,
  next: SiteCell | null,
  baseCell: SiteCell | null,
): void {
  if (!floor.gen) {
    // hand-drawn floor: cells are authoritative, no tombstones needed
    if (next) floor.cells[key] = next;
    else delete floor.cells[key];
    return;
  }
  const same = (a: SiteCell | null, b: SiteCell | null) =>
    (!a && !b) || (!!a && !!b && a.t === b.t && (a.entityId ?? '') === (b.entityId ?? ''));
  if (same(next, baseCell)) delete floor.cells[key];
  else if (next) floor.cells[key] = next;
  else floor.cells[key] = { t: 'void' };
}

/** The slice of a plane record this module reads/writes. `WorldDoc.planes`
 *  stays `unknown[]` in the store (the deliberate escape hatch); every
 *  everdeep module casts locally to just what it needs. */
interface PlaneWithSites {
  id: string;
  anchors?: Array<{ entityId: string; x: number; y: number }>;
  sites?: SiteRec[];
}

export const cellKey = (x: number, y: number): string => `${x},${y}`;

export function parseCellKey(k: string): [number, number] {
  const i = k.indexOf(',');
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
}

/** All sites of the world, across planes (v1 keeps them on the surface). */
export function sitesOf(world: WorldDoc): SiteRec[] {
  const out: SiteRec[] = [];
  for (const p of (world.planes ?? []) as PlaneWithSites[]) out.push(...(p.sites ?? []));
  return out;
}

export function siteById(world: WorldDoc, siteId: string): SiteRec | undefined {
  return sitesOf(world).find((s) => s.id === siteId);
}

export function siteForEntity(world: WorldDoc, entityId: string): SiteRec | undefined {
  return sitesOf(world).find((s) => s.entityId === entityId);
}

export function childSites(world: WorldDoc, siteId: string): SiteRec[] {
  return sitesOf(world).filter((s) => s.parentSiteId === siteId);
}

/** Deterministic site id for an entity's own site (CONTRACTS §1 spirit:
 *  the id IS the address, so both devices derive the same one). */
export function siteIdForEntity(worldSeed: string, entityId: string): string {
  return 's_' + h64(`${worldSeed}/${entityId}/site`);
}

/** The kind of space an entity opens into, from its wiki identity.
 *  Returns null for kinds that have no interior (a person, a note). */
export type SpaceKind = 'dungeon' | 'cave' | 'building' | 'town' | 'city' | 'room';

export function spaceKindFor(e: EntityRecord, anchorIcon?: string): SpaceKind | null {
  const icon = (anchorIcon ?? '').toLowerCase();
  const tags = (e.tags ?? []).map((t) => t.toLowerCase());
  const has = (t: string) => icon === t || tags.includes(t);
  if (e.kind === 'landmark') {
    if (has('cave') || has('lair')) return 'cave';
    return 'dungeon'; // ruins, towers, barrows, dungeons — keyed rooms
  }
  if (e.kind === 'building') return 'building';
  if (e.kind === 'district') return 'town';
  if (e.kind === 'settlement') {
    if (has('city') || (Number(e.fields?.population) || 0) >= 8000) return 'city';
    return 'town';
  }
  // any other kind opens an interior only by opting in ("space" tag) — a
  // plain note must not sprout an "Interior map" button (review 2026-07-17)
  if (tags.includes('space')) return 'room';
  return null;
}

/** Stamp a site after an edit (per-site LWW for merge). */
export function touchSite(site: SiteRec): void {
  site.rev = (site.rev ?? 0) + 1;
  site.updated = new Date().toISOString();
}

/** Default dimensions per space kind (Q17: battle maps sized to the space
 *  shown — a tavern 20×20). THE SCALE LADDER (LAYERED-SPACES.md §1): a city
 *  is an OVERVIEW at 50 ft/cell — 240 cells = 12,000 ft ≈ 2¼ mi, the true
 *  batch-9 footprint, walls to burrows — whose ward/district areas drill into
 *  10 ft district sites, whose buildings drill into 5 ft interiors. Scale
 *  comes from stacking sites, never from bigger grids. */
export function defaultSpec(kind: SpaceKind): { w: number; h: number; cellFt: number } {
  switch (kind) {
    case 'dungeon': return { w: 48, h: 36, cellFt: 5 };
    case 'cave': return { w: 48, h: 36, cellFt: 5 };
    case 'building': return { w: 24, h: 18, cellFt: 5 };
    case 'town': return { w: 96, h: 96, cellFt: 10 };
    case 'city': return { w: 240, h: 240, cellFt: 50 };
    case 'room': return { w: 20, h: 20, cellFt: 5 };
  }
}

/** Find-or-create the site for an entity, on the plane that anchors it (or
 *  the first/surface plane). New sites start with one empty entry floor; the
 *  generator fills it afterwards. Mutates `world`; caller saves. */
export function ensureSiteForEntity(
  world: WorldDoc,
  entity: EntityRecord,
  spec?: { w?: number; h?: number; cellFt?: number },
): SiteRec {
  const existing = siteForEntity(world, entity.id);
  if (existing) return existing;
  const planes = (world.planes ??= []) as unknown[] as PlaneWithSites[];
  let plane = planes.find((p) => (p.anchors ?? []).some((a) => a.entityId === entity.id)) ?? planes[0];
  if (!plane) {
    // a standalone-space world has no terrain to pin; a bare plane record is
    // enough to carry sites (the schema requires only id + name)
    plane = { id: 'p_surface', name: 'The Surface' } as PlaneWithSites;
    planes.push(plane);
  }
  const anchor = (plane.anchors ?? []).find((a) => a.entityId === entity.id);
  const kind = spaceKindFor(entity) ?? 'room';
  const d = { ...defaultSpec(kind), ...spec };
  const site: SiteRec = {
    id: siteIdForEntity(world.seed, entity.id),
    entityId: entity.id,
    x: anchor?.x ?? 0,
    y: anchor?.y ?? 0,
    grid: 'square',
    cellFt: d.cellFt,
    floors: [{ label: 'Ground', z: 0, w: d.w, h: d.h, cells: {} }],
  };
  (plane.sites ??= []).push(site);
  return site;
}

/** Remove a site and every sub-site nested under it. */
export function removeSite(world: WorldDoc, siteId: string): void {
  const doomed = new Set<string>([siteId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of sitesOf(world)) {
      if (s.parentSiteId && doomed.has(s.parentSiteId) && !doomed.has(s.id)) { doomed.add(s.id); grew = true; }
    }
  }
  for (const p of (world.planes ?? []) as PlaneWithSites[]) {
    if (p.sites) p.sites = p.sites.filter((s) => !doomed.has(s.id));
  }
}
