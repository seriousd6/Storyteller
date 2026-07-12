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
  settings?: { ghostDensity?: number; unitsDisplay?: 'imperial' | 'metric' };
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
