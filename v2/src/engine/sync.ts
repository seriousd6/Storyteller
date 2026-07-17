// The Drive auto-sync courier (docs/sheets/PLAN.md §13), v1. Local-first:
// every change lands locally first; this module ferries per-document files
// to the user's own Drive in the background. Dirty tracking hangs off the
// stores' OWN events (sheet/brew/world), so every creation point — a pin, a
// tray edit, a tracker tick, a world save — is covered by construction.
//
// Reconciliation is a 3-way hash compare, no manifest to race on:
//   local hash  h  = hash(doc json)
//   remote hash rh = the file's appProperties.stbHash (no download needed)
//   base hash   b  = what THIS device last synced (localStorage map)
// h==rh → in sync. b==h → remote is newer, pull. b==rh → local is newer,
// push. All three differ → conflict (worlds merge; sheets keep both, the
// remote as a "(conflicted copy)"; brews newest-wins). A missing remote
// with a base entry means REMOTELY DELETED (locally deleted mirrors it) —
// that is how deletion propagates without tombstone files.
//
// Tokens: silent refresh when possible; otherwise the courier PAUSES —
// a quiet pill, never a surprise popup. Nothing is ever lost while paused.

import {
  SHEET_EVENT,
  initSheetStore,
  loadStore,
  saveStore,
  newId,
  type Sheet,
} from './sheetStore.ts';
import { BREW_EVENT, getUserTables, restoreUserTables, deleteUserTable, type UserTable } from './brewStore.ts';
import { WORLD_EVENT, getAllWorlds, getWorld, putWorldRaw, deleteWorld, mergeWorlds, looksLikeWorld, type WorldDoc } from './worldStore.ts';
import { isConnected, tryConnect, connectInteractive } from './drive.ts';
import { listDocFiles, uploadDocFile, downloadDocText, downloadDocBlob, deleteDocFile, type DriveDocFile } from './driveFiles.ts';
import { getAsset, putAssetRaw, type AssetMeta } from './assetStore.ts';
import type { Block } from './types.ts';

export const SYNC_EVENT = 'stb:sync-changed';

export interface SyncStatus {
  state: 'off' | 'idle' | 'syncing' | 'paused';
  lastSync: number | null;
  detail?: string;
}

const AUTO_KEY = 'stb:sync:auto';
const BASE_KEY = 'stb:sync:base:v1';
const DEBOUNCE_MS = 3_000;
const MAX_LAG_MS = 15_000;

let status: SyncStatus = { state: 'off', lastSync: null };
let debounceT = 0;
let maxLagT = 0;
let running = false;
let rerunWanted = false;

export function syncStatus(): SyncStatus {
  return status;
}

function setStatus(next: Partial<SyncStatus>): void {
  status = { ...status, ...next };
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

export function autoSyncEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

// --- the base map: what this device last synced, hash per doc key ---------

type BaseMap = Record<string, string>;

function loadBase(): BaseMap {
  try {
    return JSON.parse(localStorage.getItem(BASE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function saveBase(base: BaseMap): void {
  try {
    localStorage.setItem(BASE_KEY, JSON.stringify(base));
  } catch {
    /* base is a cache; worst case the next sync re-compares */
  }
}

function hashOf(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// --- doc adapters: each type serializes, applies remote, resolves conflict -

interface LocalDoc {
  id: string;
  name: string;
  json: string;
}

interface DocAdapter {
  type: 'sheet' | 'brew' | 'world';
  list(): Promise<LocalDoc[]>;
  applyRemote(json: string): Promise<void>;
  applyDelete(id: string): Promise<void>;
  /** all three hashes differ; both sides changed since this device synced */
  applyConflict(local: LocalDoc, remoteJson: string): Promise<'kept-local' | 'merged'>;
}

const sheetAdapter: DocAdapter = {
  type: 'sheet',
  async list() {
    await initSheetStore();
    // trashed sheets sync too — the 30-day trash travels as data
    return loadStore().sheets.map((s) => ({ id: s.id, name: s.name, json: JSON.stringify(s) }));
  },
  async applyRemote(json) {
    await initSheetStore();
    const incoming = JSON.parse(json) as Sheet;
    if (!incoming?.id || !Array.isArray(incoming.blocks)) return;
    const store = loadStore();
    const at = store.sheets.findIndex((s) => s.id === incoming.id);
    if (at >= 0) store.sheets[at] = incoming;
    else store.sheets.push(incoming);
    saveStore(store, 'sync');
  },
  async applyDelete(id) {
    await initSheetStore();
    const store = loadStore();
    store.sheets = store.sheets.filter((s) => s.id !== id);
    saveStore(store, 'sync');
  },
  async applyConflict(local, remoteJson) {
    await initSheetStore();
    const incoming = JSON.parse(remoteJson) as Sheet;
    if (!incoming?.id || !Array.isArray(incoming.blocks)) return 'kept-local';
    const store = loadStore();
    const copy: Sheet = { ...incoming, id: newId(), name: `${incoming.name} (conflicted copy)` };
    delete copy.template;
    store.sheets.push(copy);
    saveStore(store, 'sync');
    return 'kept-local';
  },
};

const brewAdapter: DocAdapter = {
  type: 'brew',
  async list() {
    const tables = await getUserTables();
    return tables.map((t) => ({ id: t.id, name: t.title, json: JSON.stringify(t) }));
  },
  async applyRemote(json) {
    const incoming = JSON.parse(json) as UserTable;
    await restoreUserTables([{ ...incoming, updatedAt: incoming.updatedAt ?? Date.now() }]);
  },
  async applyDelete(id) {
    await deleteUserTable(id);
  },
  async applyConflict(local, remoteJson) {
    // small personal tables: newest-wins is honest enough
    const incoming = JSON.parse(remoteJson) as UserTable;
    const mine = JSON.parse(local.json) as UserTable;
    if ((incoming.updatedAt ?? 0) > (mine.updatedAt ?? 0)) {
      await restoreUserTables([incoming]);
    }
    return 'kept-local';
  },
};

const worldAdapter: DocAdapter = {
  type: 'world',
  async list() {
    const worlds = await getAllWorlds();
    return worlds.map((w) => ({ id: w.id, name: w.name, json: JSON.stringify(w) }));
  },
  async applyRemote(json) {
    const incoming = JSON.parse(json) as WorldDoc;
    if (!looksLikeWorld(incoming)) return;
    await putWorldRaw(incoming);
  },
  async applyDelete(id) {
    await deleteWorld(id);
  },
  async applyConflict(local, remoteJson) {
    const incoming = JSON.parse(remoteJson) as WorldDoc;
    if (!looksLikeWorld(incoming)) return 'kept-local';
    const mine = await getWorld(incoming.id);
    if (!mine) {
      await putWorldRaw(incoming);
      return 'merged';
    }
    const merged = mergeWorlds(mine, incoming);
    await putWorldRaw(merged.world);
    return 'merged';
  },
};

const adapters = [sheetAdapter, brewAdapter, worldAdapter];

// --- asset ferry ----------------------------------------------------------

function referencedAssetIds(sheets: Sheet[]): Set<string> {
  const ids = new Set<string>();
  const walk = (blocks: Block[]): void => {
    for (const b of blocks) {
      if (b.type === 'image' && b.assetId) ids.add(b.assetId);
      if (b.type === 'statblock') walk(b.sections);
    }
  };
  for (const s of sheets) walk(s.blocks);
  return ids;
}

async function syncAssets(remote: DriveDocFile[]): Promise<void> {
  await initSheetStore();
  const wanted = referencedAssetIds(loadStore().sheets);
  const remoteAssets = new Map(remote.filter((f) => f.stbType === 'asset').map((f) => [f.stbId, f]));
  for (const id of wanted) {
    const local = await getAsset(id);
    if (local && !remoteAssets.has(id)) {
      await uploadDocFile(null, `asset-${id}`, { stbId: id, stbType: 'asset', stbHash: id }, local.blob, local.mime || 'application/octet-stream');
    } else if (!local && remoteAssets.has(id)) {
      const blob = await downloadDocBlob(remoteAssets.get(id)!.fileId);
      const meta: AssetMeta = { id, mime: blob.type || 'image/jpeg', w: 0, h: 0, createdAt: Date.now() };
      await putAssetRaw(meta, blob);
    }
  }
}

// --- the reconciliation pass ---------------------------------------------

async function syncAll(): Promise<void> {
  const base = loadBase();
  const remote = await listDocFiles();
  const remoteByKey = new Map(remote.filter((f) => f.stbType !== 'asset').map((f) => [`${f.stbType}:${f.stbId}`, f]));
  const seen = new Set<string>();

  for (const adapter of adapters) {
    for (const doc of await adapter.list()) {
      const key = `${adapter.type}:${doc.id}`;
      seen.add(key);
      const h = hashOf(doc.json);
      const r = remoteByKey.get(key);
      if (!r) {
        if (base[key] !== undefined) {
          // pushed before, remote gone → deleted on another device
          await adapter.applyDelete(doc.id);
          delete base[key];
        } else {
          await uploadDocFile(null, `${adapter.type}-${doc.id}.json`, { stbId: doc.id, stbType: adapter.type, stbHash: h }, doc.json);
          base[key] = h;
        }
        continue;
      }
      if (r.stbHash === h) {
        base[key] = h;
        continue;
      }
      if (base[key] === h) {
        // local unchanged since last sync → remote is newer → pull
        await adapter.applyRemote(await downloadDocText(r.fileId));
        base[key] = r.stbHash;
      } else if (base[key] === r.stbHash) {
        // remote unchanged since last sync → local is newer → push
        await uploadDocFile(r.fileId, `${adapter.type}-${doc.id}.json`, { stbId: doc.id, stbType: adapter.type, stbHash: h }, doc.json);
        base[key] = h;
      } else {
        // both moved → conflict
        const outcome = await adapter.applyConflict(doc, await downloadDocText(r.fileId));
        const winner = outcome === 'merged'
          ? (await adapter.list()).find((d) => d.id === doc.id)
          : doc;
        if (winner) {
          const wh = hashOf(winner.json);
          await uploadDocFile(r.fileId, `${adapter.type}-${doc.id}.json`, { stbId: doc.id, stbType: adapter.type, stbHash: wh }, winner.json);
          base[key] = wh;
        }
      }
    }
  }

  // remote docs with no local counterpart
  for (const [key, r] of remoteByKey) {
    if (seen.has(key)) continue;
    const adapter = adapters.find((a) => a.type === r.stbType);
    if (!adapter) continue;
    if (base[key] !== undefined) {
      // this device synced it before and no longer has it → locally deleted
      await deleteDocFile(r.fileId);
      delete base[key];
    } else {
      await adapter.applyRemote(await downloadDocText(r.fileId));
      base[key] = r.stbHash;
    }
  }

  await syncAssets(remote);
  saveBase(base);
}

// --- scheduling -----------------------------------------------------------

async function flush(): Promise<void> {
  if (running) {
    rerunWanted = true;
    return;
  }
  running = true;
  try {
    const lock = navigator.locks?.request
      ? navigator.locks.request('stb:sync-leader', { ifAvailable: true }, async (granted) => {
          if (!granted) return; // another tab is the courier
          await flushInner();
        })
      : flushInner();
    await lock;
  } finally {
    running = false;
    if (rerunWanted) {
      rerunWanted = false;
      schedule();
    }
  }
}

async function flushInner(): Promise<void> {
  if (!isConnected() && !(await tryConnect())) {
    setStatus({ state: 'paused', detail: 'reconnect to resume' });
    return;
  }
  setStatus({ state: 'syncing', detail: undefined });
  try {
    await syncAll();
    setStatus({ state: 'idle', lastSync: Date.now() });
  } catch (err) {
    setStatus({ state: 'paused', detail: err instanceof Error ? err.message : 'sync failed' });
  }
}

function schedule(): void {
  if (!autoSyncEnabled()) return;
  clearTimeout(debounceT);
  debounceT = window.setTimeout(() => {
    clearTimeout(maxLagT);
    maxLagT = 0;
    void flush();
  }, DEBOUNCE_MS);
  if (!maxLagT) {
    maxLagT = window.setTimeout(() => {
      clearTimeout(debounceT);
      maxLagT = 0;
      void flush();
    }, MAX_LAG_MS);
  }
}

let started = false;

/** Boot the courier (Base.astro calls this on every page). No-op unless the
 *  user opted in; safe to call twice. */
export function startSyncIfEnabled(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const onChange = (e: Event): void => {
    if ((e as CustomEvent).detail?.source === 'sync') return; // our own writes
    schedule();
  };
  window.addEventListener(SHEET_EVENT, onChange);
  window.addEventListener(BREW_EVENT, onChange);
  window.addEventListener(WORLD_EVENT, onChange);
  window.addEventListener('focus', () => {
    if (autoSyncEnabled()) schedule();
  });
  if (autoSyncEnabled()) {
    setStatus({ state: 'idle', lastSync: null });
    schedule();
  }
}

/** User gesture: turn auto-sync ON (may show the consent popup once). */
export async function enableAutoSync(): Promise<void> {
  await connectInteractive();
  try {
    localStorage.setItem(AUTO_KEY, '1');
  } catch {
    /* without localStorage there is no persistence to sync anyway */
  }
  setStatus({ state: 'idle' });
  void flush();
}

export function disableAutoSync(): void {
  try {
    localStorage.removeItem(AUTO_KEY);
  } catch {
    /* ignore */
  }
  setStatus({ state: 'off', detail: undefined });
}

/** User gesture from the paused pill: reconnect and drain the queue. */
export async function resumeSync(): Promise<void> {
  await connectInteractive();
  void flush();
}
