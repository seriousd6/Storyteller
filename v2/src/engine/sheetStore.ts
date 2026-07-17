// Client-side store for the Sheet Builder: named sheets of typed blocks.
// IndexedDB-backed since PLAN.md §8 (images and roll history outgrow the
// ~5 MB localStorage budget), with a SYNCHRONOUS in-memory mirror so every
// existing call site keeps its shape:
//
//   await initSheetStore();     // once per island, top-level await
//   const store = loadStore();  // sync, returns the mirror
//   saveStore(store, source);   // sync mirror update + write-behind to IDB
//
// Cross-tab sync is a BroadcastChannel (localStorage 'storage' events died
// with the migration). The one-time migration imports the old
// `stb:sheets:v1` localStorage value, preserves corrupt bytes under
// `:corrupt` exactly as before, and leaves a `:migrated` marker so a
// stale-deploy tab's localStorage writes can never be re-imported as
// zombies. Deleted sheets go to a 30-day TRASH (deletedAt), not oblivion.

import type { Block } from './types.ts';
import { blockToMarkdown } from './blockKit.ts';

export interface Sheet {
  id: string;
  name: string;
  blocks: Block[];
  /** Play mode locks text and brings tokens alive (PLAN.md §16); character
   *  sheets live in play, prep sheets in edit. Remembered per sheet. */
  mode?: 'edit' | 'play';
  /** Set when the sheet is in the trash; purged ~30 days later. */
  deletedAt?: number;
}

export interface SheetStore {
  activeId: string;
  sheets: Sheet[];
  schemaVersion?: number;
}

const SCHEMA_VERSION = 1;
const LEGACY_KEY = 'stb:sheets:v1';
const LEGACY_PINS = 'stb:pins:v1';
const MIGRATED_KEY = 'stb:sheets:v1:migrated';
const TRASH_DAYS = 30;

const DB_NAME = 'stb:sheets';
const DB_VERSION = 1;
const SHEETS = 'sheets';
const META = 'meta';

/** Fired on window after every save; detail.source identifies the writer so
 *  components can ignore their own writes (e.g. while an edit has focus). */
export const SHEET_EVENT = 'stb:sheet-changed';

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptySheet(name: string): Sheet {
  return { id: newId(), name, blocks: [] };
}

function defaultStore(): SheetStore {
  const sheet = emptySheet('My Sheet');
  return { activeId: sheet.id, sheets: [sheet], schemaVersion: SCHEMA_VERSION };
}

/** Live (non-trashed) sheets, the ones pickers and the tray should show. */
export function activeSheets(store: SheetStore): Sheet[] {
  return store.sheets.filter((s) => s.deletedAt === undefined);
}

export function trashedSheets(store: SheetStore): Sheet[] {
  return store.sheets.filter((s) => s.deletedAt !== undefined);
}

/** Repair whatever arrives (foreign backups, hand edits): blocks arrays
 *  exist, at least one live sheet exists, activeId points at a live sheet. */
function normalizeStore(store: SheetStore): SheetStore {
  if (!Array.isArray(store.sheets)) store.sheets = [];
  for (const s of store.sheets) {
    if (!Array.isArray(s.blocks)) s.blocks = [];
  }
  if (activeSheets(store).length === 0) store.sheets.push(emptySheet('My Sheet'));
  const live = activeSheets(store);
  if (!live.some((s) => s.id === store.activeId)) store.activeId = live[0]!.id;
  store.schemaVersion = SCHEMA_VERSION;
  return store;
}

// ---------------------------------------------------------------------------
// IndexedDB plumbing + the mirror

let mirror: SheetStore | null = null;
let db: IDBDatabase | null = null;
let initPromise: Promise<void> | null = null;
let channel: BroadcastChannel | null = null;
let writeChain: Promise<void> = Promise.resolve();
let persistRequested = false;
let quotaWarned = false;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(SHEETS)) req.result.createObjectStore(SHEETS, { keyPath: 'id' });
      if (!req.result.objectStoreNames.contains(META)) req.result.createObjectStore(META);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('could not open the sheet database'));
  });
}

function readAll(database: IDBDatabase): Promise<{ sheets: Sheet[]; activeId: string | undefined }> {
  return new Promise((resolve, reject) => {
    const t = database.transaction([SHEETS, META], 'readonly');
    const sheetsReq = t.objectStore(SHEETS).getAll() as IDBRequest<Sheet[]>;
    const activeReq = t.objectStore(META).get('activeId') as IDBRequest<string | undefined>;
    t.oncomplete = () => resolve({ sheets: sheetsReq.result ?? [], activeId: activeReq.result });
    t.onerror = () => reject(t.error ?? new Error('sheet database read failed'));
  });
}

function writeAll(database: IDBDatabase, store: SheetStore): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = database.transaction([SHEETS, META], 'readwrite');
    const s = t.objectStore(SHEETS);
    s.clear();
    for (const sheet of store.sheets) s.put(sheet);
    t.objectStore(META).put(store.activeId, 'activeId');
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error ?? new Error('sheet database write failed'));
  });
}

/** The old localStorage store, with the old corrupt-value safety net: broken
 *  bytes are backed up under `:corrupt` and reported, never silently reset. */
function readLegacy(): SheetStore | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEGACY_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: SheetStore | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (parsed === null || !Array.isArray(parsed.sheets)) {
    try {
      localStorage.setItem(`${LEGACY_KEY}:corrupt`, raw);
    } catch {
      /* backup is best-effort */
    }
    console.error(`sheet store at "${LEGACY_KEY}" was unreadable — backed up to "${LEGACY_KEY}:corrupt" and reset`);
    return null;
  }
  // one-time migration of blocks pinned before named sheets existed
  try {
    const legacyPins: Block[] = JSON.parse(localStorage.getItem(LEGACY_PINS) ?? 'null');
    if (Array.isArray(legacyPins) && legacyPins.length) {
      normalizeStore(parsed);
      getActive(parsed).blocks.push(...legacyPins);
      localStorage.removeItem(LEGACY_PINS);
    }
  } catch {
    /* ignore malformed legacy pins */
  }
  return parsed;
}

function purgeExpiredTrash(store: SheetStore): boolean {
  const cutoff = Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000;
  const before = store.sheets.length;
  store.sheets = store.sheets.filter((s) => s.deletedAt === undefined || s.deletedAt > cutoff);
  return store.sheets.length !== before;
}

/** Open the database, run the one-time localStorage migration, hydrate the
 *  mirror. Idempotent; every island that touches sheets awaits this once. */
export function initSheetStore(): Promise<void> {
  initPromise ??= (async () => {
    db = await openDb();
    const { sheets, activeId } = await readAll(db);
    let store: SheetStore;
    let dirty = false;
    if (sheets.length > 0) {
      store = { activeId: activeId ?? sheets[0]!.id, sheets, schemaVersion: SCHEMA_VERSION };
    } else {
      let migrated = false;
      try {
        migrated = localStorage.getItem(MIGRATED_KEY) === '1';
      } catch {
        /* no localStorage — nothing to migrate either */
      }
      const legacy = migrated ? null : readLegacy();
      store = legacy ?? defaultStore();
      if (legacy) {
        dirty = true; // persist the imported store now
        // Marker ONLY after a real import: it exists to stop a stale-deploy
        // tab's localStorage writes from being re-imported as zombies. An
        // empty first visit must NOT set it, or a later legacy value (or a
        // test seeding localStorage) could never migrate in.
        try {
          localStorage.setItem(MIGRATED_KEY, '1');
        } catch {
          /* marker is best-effort */
        }
      }
    }
    normalizeStore(store);
    if (purgeExpiredTrash(store)) dirty = true;
    mirror = store;
    if (dirty) queueWrite();

    channel = new BroadcastChannel(DB_NAME);
    channel.onmessage = (ev: MessageEvent<{ store: SheetStore; source: string }>) => {
      if (!ev.data?.store) return;
      mirror = normalizeStore(ev.data.store);
      window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: { source: 'broadcast' } }));
    };
  })();
  return initPromise;
}

function queueWrite(): void {
  const snapshot = mirror;
  if (!snapshot || !db) return;
  const database = db;
  // structuredClone: the mirror keeps mutating while the write is in flight
  const frozen = structuredClone(snapshot);
  writeChain = writeChain
    .then(() => writeAll(database, frozen))
    .catch((err) => {
      // Quota/eviction: the write is lost — say so VISIBLY (once). The event
      // already fired, so every view shows the in-memory state; the warning
      // tells the user it will not survive a reload.
      console.error('sheet store save failed', err);
      if (!quotaWarned && typeof window !== 'undefined') {
        quotaWarned = true;
        alert('Storage is full — your last sheet change was NOT saved. Export or delete some sheets to free space.');
      }
    });
}

/** Synchronous read of the current store. Requires initSheetStore() to have
 *  resolved; before that it returns a throwaway default (and warns) rather
 *  than crashing an early caller. */
export function loadStore(): SheetStore {
  if (!mirror) {
    console.warn('loadStore() before initSheetStore() resolved — returning a transient empty store');
    return defaultStore();
  }
  return mirror;
}

export function saveStore(store: SheetStore, source = 'unknown'): void {
  mirror = normalizeStore(store);
  if (!persistRequested && typeof navigator !== 'undefined' && navigator.storage?.persist) {
    // PLAN.md §8: without this the browser may evict IndexedDB under
    // pressure (Safari: 7 days unused) — the local-first data-loss vector.
    persistRequested = true;
    void navigator.storage.persist().catch(() => {});
  }
  queueWrite();
  channel?.postMessage({ store: structuredClone(mirror), source });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: { source } }));
  }
}

/** Resolves when every queued IndexedDB write has landed (tests, unload). */
export function flushSheetWrites(): Promise<void> {
  return writeChain;
}

// ---------------------------------------------------------------------------
// Store operations (unchanged call shapes)

export function getActive(store: SheetStore): Sheet {
  const live = activeSheets(store);
  return live.find((s) => s.id === store.activeId) ?? live[0] ?? store.sheets[0]!;
}

/** Append a block to the active sheet (generator pin buttons). Safe to call
 *  before init: the write happens as soon as the store is ready. */
export function addBlockToActive(block: Block): void {
  void initSheetStore().then(() => {
    const store = loadStore();
    getActive(store).blocks.push(block);
    saveStore(store, 'pin');
  });
}

export function createSheet(store: SheetStore, name: string): Sheet {
  const sheet = emptySheet(name);
  store.sheets.push(sheet);
  store.activeId = sheet.id;
  saveStore(store);
  return sheet;
}

/** Move a sheet to the trash (30-day retention), never hard-delete. */
export function deleteSheet(store: SheetStore, id: string): void {
  const sheet = store.sheets.find((s) => s.id === id);
  if (sheet) sheet.deletedAt = Date.now();
  saveStore(store);
}

export function restoreSheet(store: SheetStore, id: string): void {
  const sheet = store.sheets.find((s) => s.id === id);
  if (sheet) {
    delete sheet.deletedAt;
    store.activeId = sheet.id;
  }
  saveStore(store);
}

/** Hard-delete from the trash. */
export function purgeSheet(store: SheetStore, id: string): void {
  store.sheets = store.sheets.filter((s) => s.id !== id);
  saveStore(store);
}

// ---------------------------------------------------------------------------
// Markdown export — per-type rules live in engine/blocks/* (the Block Kit),
// beside the DOM renderers for the same type, so the surfaces cannot drift.

export function sheetToMarkdown(sheet: Sheet): string {
  return [`# ${sheet.name}`, ...sheet.blocks.map(blockToMarkdown)].join('\n\n') + '\n';
}
