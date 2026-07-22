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

/** A building's civic role — COSMETIC ONLY (LAYERED-SPACES R3). It never
 *  affects passability, sealing, doors, or export (those read `t`), so an
 *  inn's walls are still `wall`; the renderer just tints them so a temple,
 *  a keep, and a hovel read differently instead of one dark mass. Generators
 *  stamp it when they place a notable building; it is not user-paintable. */
export type BuildRole =
  | 'inn' | 'temple' | 'keep' | 'market' | 'guild' | 'civic' | 'mill' | 'warehouse' | 'garden';

/** A furnishing / fixture sitting ON a floor cell (LAYERED-SPACES R6). Like
 *  `role` it is COSMETIC — the cell stays `floor` (walkable; a combat layer
 *  may later treat these as cover), so it never touches passability, sealing,
 *  export, or overrides. It is what makes a temple's nave read as a nave and a
 *  smithy's workshop as a smithy, instead of every interior being bare boxes. */
export type BuildFeature =
  | 'hearth' | 'table' | 'bed' | 'counter' | 'shelf' | 'barrel' | 'chest'
  | 'altar' | 'pew' | 'font' | 'forge' | 'statue' | 'rug';

export interface SiteCell {
  t: CellType;
  /** Ground-tier landmark: the prize/enemy/trap AT this cell. */
  entityId?: string;
  /** Cosmetic building tint (BuildRole). Rides on generated base cells and
   *  survives `effectiveCells` untouched; `writeCellOverride` compares only
   *  `t`+`entityId`, so hand edits never diff on it. */
  role?: BuildRole;
  /** Cosmetic furniture / fixture (BuildFeature). Rides on floor cells the
   *  same way `role` rides on walls — never diffed by `writeCellOverride`. */
  feature?: BuildFeature;
  /** Ward index for the ROUGH city overview (R7α): a floor cell in ward N is
   *  tinted by a zone palette so the city reads as coloured districts, not
   *  buildings. Cosmetic — same free-ride as `role`/`feature`. */
  zone?: number;
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
  /** A named building FLAG (R7α): drawn as a pin + label at the ROUGH city
   *  level (where individual buildings aren't drawn) and drillable straight
   *  into its sub-level. The through-line that ties the zoom layers together. */
  flag?: boolean;
}

/** THE CONTEXT CONTRACT (LAYERED-SPACES.md §2, N-2): what a child site knows
 *  about the parent geometry around its footprint, so the layers AGREE — a
 *  street that crosses the ward boundary in the overview continues as a
 *  street in the district map; the side that abuts the city wall is walled;
 *  water enters where the river crossed. Context shapes LAYOUT only: seeds
 *  and ids stay on the CONTRACTS §1 path, so a context change re-lays
 *  streets but never re-mints entities. Stored on `gen.ctx` so the base
 *  layout re-derives identically on every open. */
export interface SiteContextEntry {
  side: 'n' | 'e' | 's' | 'w';
  /** position along that side, in CHILD cells */
  at: number;
  kind: 'street' | 'gate' | 'water';
}
export interface SiteContext {
  entries: SiteContextEntry[];
  edges: Array<{ side: 'n' | 'e' | 's' | 'w'; kind: 'wall' | 'water' | 'open' }>;
  /** The parent's named building FLAGS that fall within this child's footprint,
   *  projected into CHILD cells (R7β). The district places them as the same
   *  named, drillable buildings the overview showed for this ward — so the
   *  layers AGREE. Frozen on gen.ctx at mint, re-derived on refresh. */
  flags?: Array<{ x: number; y: number; label: string }>;
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
  gen?: { generator: string; seed: string; genVersion?: number; ctx?: SiteContext };
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

/** Compute a child's SiteContext from the parent's EFFECTIVE cells (gen +
 *  overrides — hand-edits flow down) and the area footprint. Pure. For each
 *  side of the rect: positions where a walkable (or water) run CROSSES the
 *  boundary become entries, projected into child edge coordinates; a side
 *  mostly backed by wall/water outside is flagged so the child draws its
 *  edge to match. */
export function computeSiteContext(
  cells: Record<string, SiteCell>,
  area: { x: number; y: number; w: number; h: number },
  childW: number,
  childH: number,
): SiteContext {
  const walk = (c: SiteCell | undefined): boolean => !!c && (c.t === 'floor' || c.t === 'door');
  const wet = (c: SiteCell | undefined): boolean => c?.t === 'water';
  const entries: SiteContextEntry[] = [];
  const edges: SiteContext['edges'] = [];
  const SIDES: Array<{ side: SiteContextEntry['side']; span: number; childSpan: number;
    inAt: (p: number) => [number, number]; outAt: (p: number) => [number, number] }> = [
    { side: 'n', span: area.w, childSpan: childW, inAt: (p) => [area.x + p, area.y], outAt: (p) => [area.x + p, area.y - 1] },
    { side: 's', span: area.w, childSpan: childW, inAt: (p) => [area.x + p, area.y + area.h - 1], outAt: (p) => [area.x + p, area.y + area.h] },
    { side: 'w', span: area.h, childSpan: childH, inAt: (p) => [area.x, area.y + p], outAt: (p) => [area.x - 1, area.y + p] },
    { side: 'e', span: area.h, childSpan: childH, inAt: (p) => [area.x + area.w - 1, area.y + p], outAt: (p) => [area.x + area.w, area.y + p] },
  ];
  for (const S of SIDES) {
    let wallOut = 0, waterOut = 0;
    // classify every boundary position, then merge consecutive runs
    let run: { kind: SiteContextEntry['kind']; start: number; end: number } | null = null;
    const flush = (): void => {
      if (!run) return;
      const mid = (run.start + run.end) / 2;
      const at = Math.max(1, Math.min(S.childSpan - 2, Math.round(((mid + 0.5) * S.childSpan) / S.span)));
      if (entries.filter((e) => e.side === S.side).length < 6) entries.push({ side: S.side, at, kind: run.kind });
      run = null;
    };
    for (let p = 0; p < S.span; p++) {
      const cin = cells[cellKey(...S.inAt(p))];
      const cout = cells[cellKey(...S.outAt(p))];
      if (cout?.t === 'wall') wallOut++;
      if (cout?.t === 'water') waterOut++;
      const kind: SiteContextEntry['kind'] | null =
        walk(cin) && walk(cout) ? (cin!.t === 'door' || cout!.t === 'door' ? 'gate' : 'street')
        : wet(cin) && wet(cout) ? 'water' : null;
      if (kind && run && run.kind === kind && p === run.end + 1) run.end = p;
      else { flush(); if (kind) run = { kind, start: p, end: p }; }
    }
    flush();
    edges.push({ side: S.side, kind: wallOut / S.span >= 0.3 ? 'wall' : waterOut / S.span >= 0.3 ? 'water' : 'open' });
  }
  return { entries, edges };
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
export type SpaceKind = 'dungeon' | 'cave' | 'building' | 'town' | 'city' | 'district' | 'room';

export function spaceKindFor(e: EntityRecord, anchorIcon?: string): SpaceKind | null {
  const icon = (anchorIcon ?? '').toLowerCase();
  const tags = (e.tags ?? []).map((t) => t.toLowerCase());
  const has = (t: string) => icon === t || tags.includes(t);
  if (e.kind === 'landmark') {
    if (has('cave') || has('lair')) return 'cave';
    return 'dungeon'; // ruins, towers, barrows, dungeons — keyed rooms
  }
  if (e.kind === 'building') return 'building';
  if (e.kind === 'district') return 'district';
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
    case 'district': return { w: 120, h: 120, cellFt: 10 };
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
