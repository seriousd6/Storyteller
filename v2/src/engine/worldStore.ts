// Client-side store for Everdeep worlds: whole-world documents in IndexedDB
// (localStorage is too small once maps and images arrive). One record per
// world, matching docs/everdeep/schemas/world.schema.json; the /world/ page
// reads and edits them. Sync/merge primitives (rev, tombstones, conflicts)
// follow docs/everdeep/CONTRACTS.md §8.

export interface EntityRelation {
  type: string;
  target: string;
  note?: string;
  start?: string;
  end?: string;
}

export type FieldValue =
  | string
  | number
  | boolean
  | string[]
  | { ref: string }
  | { date: string };

export interface EntityGen {
  generator: string;
  seed: string;
  genVersion?: number;
  plan?: string;
  role?: string;
  overrides?: string[];
  /** Locked generator options (batch 93): dimensions that must survive a reroll
   *  — a shop's merchant type, etc. Resolved once from the base seed and kept, so
   *  rerolling the inventory doesn't turn a weaponsmith into a florist. */
  opts?: Record<string, string>;
}

export interface EntityRecord {
  id: string;
  kind: string;
  name: string;
  aliases?: string[];
  parentId?: string;
  relations?: EntityRelation[];
  fields?: Record<string, FieldValue>;
  body?: Array<Record<string, unknown> & { type: string; id: string }>;
  tags?: string[];
  secret?: boolean;
  secretBlocks?: string[];
  gen?: EntityGen;
  ghostState?: { rerolls?: Record<string, number>; dismissed?: string[] };
  rev: number;
  created?: string;
  updated: string;
  deleted?: string;
}

export interface WorldDoc {
  schemaVersion: number;
  genVersion: number;
  id: string;
  name: string;
  seed: string;
  entities: Record<string, EntityRecord>;
  planes?: unknown[];
  settings?: {
    ghostDensity?: number;
    unitsDisplay?: 'imperial' | 'metric';
    /** Party composition (batch 94): the level and headcount encounters and
     *  hoards rolled in this world size themselves to. */
    party?: { level?: number; size?: number };
  };
  conflicts?: unknown[];
  rev: number;
  created: string;
  updated: string;
}

export interface WorldSummary {
  id: string;
  name: string;
  updated: string;
  entityCount: number;
}

const DB_NAME = 'stb:everdeep';
const DB_VERSION = 1;
const STORE = 'worlds';

/** Fired on window after every world save. */
export const WORLD_EVENT = 'stb:world-changed';

const BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';
export function rid(prefix: string, len = 14): string {
  let s = '';
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  for (let i = 0; i < len; i++) s += BASE36[buf[i] % 36];
  return prefix + s;
}

export const now = (): string => new Date().toISOString();

let dbPromise: Promise<IDBDatabase> | null = null;
function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    // A rejected open must not be memoized: one transient failure (blocked
    // upgrade, private mode hiccup) would brick every later read/write for
    // the whole session. Clear it so the next call retries.
    dbPromise.catch(() => { dbPromise = null; });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

/** Every world document, whole — used by the Drive backup envelope. */
export function getAllWorlds(): Promise<WorldDoc[]> {
  return tx<WorldDoc[]>('readonly', (s) => s.getAll() as IDBRequest<WorldDoc[]>);
}

export async function listWorlds(): Promise<WorldSummary[]> {
  const all = await tx<WorldDoc[]>('readonly', (s) => s.getAll() as IDBRequest<WorldDoc[]>);
  return all
    .map((w) => ({
      id: w.id,
      name: w.name,
      updated: w.updated,
      entityCount: Object.values(w.entities ?? {}).filter((e) => !e.deleted).length,
    }))
    .sort((a, b) => (a.updated < b.updated ? 1 : -1));
}

export function getWorld(id: string): Promise<WorldDoc | undefined> {
  return tx<WorldDoc | undefined>('readonly', (s) => s.get(id) as IDBRequest<WorldDoc | undefined>);
}

/** Persist a world; bumps world rev/updated and notifies listeners. */
export async function putWorld(world: WorldDoc): Promise<void> {
  world.rev = (world.rev ?? 0) + 1;
  world.updated = now();
  return putWorldRaw(world);
}

/** Write a world EXACTLY as given — no rev bump, no fresh `updated`. For
 *  restore/sync paths, where inflating `rev` would make an unchanged copy
 *  look strictly newer than the identical copy on every other device and
 *  win merges it should lose. Ordinary edits go through putWorld. */
export async function putWorldRaw(world: WorldDoc): Promise<void> {
  await tx('readwrite', (s) => s.put(world));
  window.dispatchEvent(new CustomEvent(WORLD_EVENT, { detail: { id: world.id } }));
}

export async function deleteWorld(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  window.dispatchEvent(new CustomEvent(WORLD_EVENT, { detail: { id } }));
}

export function newWorld(name: string, seed: string): WorldDoc {
  const stamp = now();
  return {
    schemaVersion: 1,
    genVersion: 1,
    id: rid('w_', 12),
    name,
    seed,
    entities: {},
    planes: [],
    settings: { ghostDensity: 4, unitsDisplay: 'imperial' },
    conflicts: [],
    rev: 1,
    created: stamp,
    updated: stamp,
  };
}

export function newEntity(kind: string, name: string, parentId?: string): EntityRecord {
  const stamp = now();
  const e: EntityRecord = {
    id: rid('e_'),
    kind,
    name,
    fields: {},
    body: [],
    rev: 1,
    created: stamp,
    updated: stamp,
  };
  if (parentId) e.parentId = parentId;
  return e;
}

/** Bump an entity's revision after an edit (CONTRACTS §8). */
export function touchEntity(e: EntityRecord): void {
  e.rev = (e.rev ?? 0) + 1;
  e.updated = now();
}

// ---------- two-device merge (queue #38, CONTRACTS §8, Q23) ----------
//
// One person, two devices, one world: before this, whichever copy synced
// second was DISCARDED whole (world-level LWW). The merge is an entity UNION —
// a page that exists on only one side is the "tree merge" the owner asked for
// and always survives — with per-entity LWW where both sides carry an id, and
// every LWW loser preserved in the conflict inbox so nothing is silently gone.

export interface MergeConflict {
  /** entity id, or 'planes' for the coarse plane-array note */
  id: string;
  name?: string;
  kept: 'local' | 'incoming';
  reason: 'both-edited' | 'parent-missing' | 'planes-differ';
  at: string;
  /** the losing record, whole — recoverable from the inbox */
  loser?: EntityRecord;
}

export interface MergeResult {
  world: WorldDoc;
  /** entities that existed on one side only (both directions) */
  added: number;
  /** ids present on both sides whose records differed */
  collided: number;
  conflicts: MergeConflict[];
}

/** Same lineage, no divergence: rev AND updated agree. */
const sameVersion = (a: EntityRecord, b: EntityRecord): boolean =>
  (a.rev ?? 0) === (b.rev ?? 0) && a.updated === b.updated;

/** Per-entity LWW (CONTRACTS §8): higher rev wins; tie → newer `updated`;
 *  full tie → local, for stability. Tombstones are ordinary records here, so
 *  a deletion with the higher rev beats an older live copy — and a NEWER live
 *  copy revives over an older tombstone. */
const winner = (local: EntityRecord, incoming: EntityRecord): 'local' | 'incoming' => {
  if ((incoming.rev ?? 0) > (local.rev ?? 0)) return 'incoming';
  if ((incoming.rev ?? 0) < (local.rev ?? 0)) return 'local';
  return incoming.updated > local.updated ? 'incoming' : 'local';
};

/**
 * Merge `incoming` into `local`, pure (inputs untouched). Entity union with
 * per-entity LWW; whole-plane LWW at world level (per-anchor merge is a later
 * refinement — a note is filed when the plane arrays differ); a merged child
 * whose parent lost or vanished is reparented to the root with a note.
 * The result's rev is max(local, incoming) — NEVER bumped, so a merged copy
 * doesn't outrank the identical merge made on the other device.
 */
export function mergeWorlds(local: WorldDoc, incoming: WorldDoc, at = now()): MergeResult {
  const worldWinner: 'local' | 'incoming' = winner(
    { rev: local.rev, updated: local.updated } as EntityRecord,
    { rev: incoming.rev, updated: incoming.updated } as EntityRecord,
  );
  const base = structuredClone(worldWinner === 'local' ? local : incoming);
  const other = worldWinner === 'local' ? incoming : local;
  const conflicts: MergeConflict[] = [];
  let added = 0, collided = 0;

  // Entity union over BOTH sides, decided per entity — not by world winner.
  // SORTED ids, so the two devices' merges serialize byte-identically and the
  // next sync sees two equal copies instead of two differently-ordered ones.
  const merged: Record<string, EntityRecord> = {};
  const ids = [...new Set([...Object.keys(local.entities ?? {}), ...Object.keys(incoming.entities ?? {})])].sort();
  for (const id of ids) {
    const l = local.entities?.[id], i = incoming.entities?.[id];
    if (l && !i) { merged[id] = structuredClone(l); added++; continue; }
    if (i && !l) { merged[id] = structuredClone(i); added++; continue; }
    if (!l || !i) continue;
    if (sameVersion(l, i)) { merged[id] = structuredClone(l); continue; }
    const w = winner(l, i);
    const keep = w === 'local' ? l : i;
    const lose = w === 'local' ? i : l;
    merged[id] = structuredClone(keep);
    // STALENESS is not divergence: a loser strictly older on BOTH axes is
    // just yesterday's copy of the same lineage (restoring an old backup
    // must not flood the inbox). Divergence shows as MIXED ordering — the
    // same rev reached with different content, or a lower rev carrying a
    // newer timestamp — the signature of two devices editing in parallel.
    const diverged = (lose.rev ?? 0) === (keep.rev ?? 0) || lose.updated > keep.updated;
    if (diverged) {
      collided++;
      conflicts.push({ id, name: keep.name, kept: w, reason: 'both-edited', at, loser: structuredClone(lose) });
    }
  }
  base.entities = merged;

  // a live child whose parent lost or never came across → root, with a note
  for (const e of Object.values(merged)) {
    if (e.deleted || !e.parentId) continue;
    const p = merged[e.parentId];
    if (!p || p.deleted) {
      conflicts.push({ id: e.id, name: e.name, kept: 'local', reason: 'parent-missing', at });
      delete e.parentId;
    }
  }

  // planes: coarse whole-array LWW (the base already carries the winner's);
  // noted only on genuine world-level divergence — a stale backup's old
  // planes are staleness, not a conflict (same rule as the entities above)
  const wLose = worldWinner === 'local' ? incoming : local;
  const wKeep = worldWinner === 'local' ? local : incoming;
  const worldDiverged = (wLose.rev ?? 0) === (wKeep.rev ?? 0) || wLose.updated > wKeep.updated;
  if (worldDiverged && JSON.stringify(local.planes ?? []) !== JSON.stringify(incoming.planes ?? [])) {
    conflicts.push({ id: 'planes', kept: worldWinner, reason: 'planes-differ', at });
  }

  // SITES are the exception to coarse plane LWW (nested-spaces epic,
  // 2026-07-17): hours of map authoring live in plane.sites, so they union
  // by id with their own rev/updated stamps — two devices editing DIFFERENT
  // sites both survive the sync, and a diverged site falls back to per-site
  // LWW instead of vanishing with its whole plane.
  interface SiteLike { id: string; rev?: number; updated?: string }
  interface PlaneLike { id?: string; name?: string; sites?: SiteLike[] }
  const collectSites = (w: WorldDoc): Map<string, SiteLike> => {
    const m = new Map<string, SiteLike>();
    for (const p of (w.planes ?? []) as PlaneLike[]) for (const s of p.sites ?? []) m.set(s.id, s);
    return m;
  };
  const ls = collectSites(local), is = collectSites(incoming);
  if (ls.size || is.size) {
    const mergedSites: SiteLike[] = [];
    for (const id of [...new Set([...ls.keys(), ...is.keys()])].sort()) {
      const l = ls.get(id), i = is.get(id);
      if (l && i) {
        const w = winner(
          { rev: l.rev ?? 0, updated: l.updated ?? '' } as EntityRecord,
          { rev: i.rev ?? 0, updated: i.updated ?? '' } as EntityRecord,
        );
        mergedSites.push(structuredClone(w === 'local' ? l : i));
      } else {
        mergedSites.push(structuredClone((l ?? i)!));
      }
    }
    const basePlanes = (base.planes ??= []) as PlaneLike[];
    if (!basePlanes.length) basePlanes.push({ id: 'p_surface', name: 'The Surface' });
    // the union lives on the first plane (where every writer puts sites in
    // v1); other planes' site arrays are cleared so no site appears twice
    for (const p of basePlanes) if (p.sites) p.sites = [];
    basePlanes[0]!.sites = mergedSites;
  }

  base.rev = Math.max(local.rev ?? 0, incoming.rev ?? 0);
  base.updated = local.updated > incoming.updated ? local.updated : incoming.updated;
  base.conflicts = [...((worldWinner === 'local' ? local : incoming).conflicts ?? []), ...conflicts];
  return { world: base, added, collided, conflicts };
}

/** Basic shape check for imported world JSON; not a full schema validation. */
export function looksLikeWorld(x: unknown): x is WorldDoc {
  if (typeof x !== 'object' || x === null) return false;
  const w = x as Record<string, unknown>;
  return (
    typeof w.id === 'string' &&
    typeof w.name === 'string' &&
    typeof w.seed === 'string' &&
    typeof w.schemaVersion === 'number' &&
    typeof w.entities === 'object' &&
    w.entities !== null
  );
}
