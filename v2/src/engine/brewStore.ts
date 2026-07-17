// User-authored roll tables ("brews", docs/sheets/PLAN.md §7), IndexedDB-
// backed. Ids are namespaced `user/<slug>` and can never shadow site ids;
// the lazy loader (tableLoader.ts) resolves them transparently, so a user
// table works everywhere a site table does — rollTable widgets, inline
// [[table:…]] chips, even referenced from other user tables.

import type { Table } from './types.ts';

export interface UserTable extends Table {
  updatedAt: number;
}

const DB_NAME = 'stb:brews';
const DB_VERSION = 1;
const STORE = 'tables';

/** Fired on window after every put/delete. */
export const BREW_EVENT = 'stb:brews-changed';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('could not open the brew database'));
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = run(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('brew database request failed'));
      }),
  );
}

function emit(): void {
  window.dispatchEvent(new CustomEvent(BREW_EVENT));
}

export function userTableId(slug: string): string {
  return `user/${slug}`;
}

/** 'Crit Fails!' → 'crit-fails' (the table-id charset is [a-z0-9/-]). */
export function slugForTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export async function getUserTables(): Promise<UserTable[]> {
  const all = await tx('readonly', (s) => s.getAll() as IDBRequest<UserTable[]>);
  return all.sort((a, b) => a.title.localeCompare(b.title));
}

export async function getUserTable(id: string): Promise<UserTable | undefined> {
  return await tx('readonly', (s) => s.get(id) as IDBRequest<UserTable | undefined>);
}

export async function putUserTable(table: Omit<UserTable, 'updatedAt'>): Promise<void> {
  await tx('readwrite', (s) => s.put({ ...table, updatedAt: Date.now() }));
  emit();
}

export async function deleteUserTable(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  emit();
}

/** Restore from a backup: newer-wins per table id (device clocks are good
 *  enough for a personal table list; conflicted edits are rare and small). */
export async function restoreUserTables(tables: UserTable[]): Promise<number> {
  let restored = 0;
  for (const t of tables) {
    if (!t?.id?.startsWith('user/') || !Array.isArray(t.entries)) continue;
    const local = await getUserTable(t.id);
    if (local && (local.updatedAt ?? 0) >= (t.updatedAt ?? 0)) continue;
    await tx('readwrite', (s) => s.put(t));
    restored += 1;
  }
  if (restored) emit();
  return restored;
}
