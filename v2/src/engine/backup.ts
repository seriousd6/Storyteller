// The Drive backup envelope, shared by /sheet/ and /world/. Versioned so
// document types can join without breaking older backups (OVERHAUL.md §4):
//   v1: { sheets }   v2: { sheets, worlds }   v3: { sheets, worlds, brews }
// Building always reads EVERY store, so saving from either page never drops
// another store's documents. Per-world Drive files arrive with images
// (PLAN.md F1/Q22); until then everything is small JSON in the single file.

import type { SheetStore } from './sheetStore.ts';
import type { Block } from './types.ts';
import { getAllWorlds, putWorldRaw, getWorld, looksLikeWorld, mergeWorlds, type WorldDoc } from './worldStore.ts';
import { getUserTables, restoreUserTables, type UserTable } from './brewStore.ts';
import { getAsset, putAssetRaw, type AssetMeta } from './assetStore.ts';

export const BACKUP_FORMAT = 'storyteller-toolbox-backup';

/** An asset riding the envelope: metadata + base64 bytes. Only assets a
 *  sheet actually references travel; the total is capped so one wallpaper
 *  upload can't balloon the single-file backup. */
export interface BackupAsset extends AssetMeta {
  dataB64: string;
}

const ASSET_BUDGET_BYTES = 8 * 1024 * 1024;

export interface BackupV4 {
  format: typeof BACKUP_FORMAT;
  version: 4;
  savedAt: string;
  sheets: SheetStore;
  worlds: WorldDoc[];
  brews: UserTable[];
  assets: BackupAsset[];
}

function collectAssetIds(blocks: Block[], into: Set<string>): void {
  for (const b of blocks) {
    if (b.type === 'image' && b.assetId) into.add(b.assetId);
    if (b.type === 'statblock') collectAssetIds(b.sections, into);
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '');
    reader.onerror = () => reject(reader.error ?? new Error('could not read image bytes'));
    reader.readAsDataURL(blob);
  });
}

async function referencedAssets(sheets: SheetStore): Promise<BackupAsset[]> {
  const ids = new Set<string>();
  for (const sheet of sheets.sheets) collectAssetIds(sheet.blocks, ids);
  const out: BackupAsset[] = [];
  let budget = ASSET_BUDGET_BYTES;
  for (const id of ids) {
    const record = await getAsset(id);
    if (!record) continue;
    if (record.blob.size > budget) {
      console.warn(`backup: skipping asset ${id} (${record.blob.size} bytes) — over the envelope budget`);
      continue;
    }
    budget -= record.blob.size;
    out.push({
      id: record.id,
      mime: record.mime,
      w: record.w,
      h: record.h,
      createdAt: record.createdAt,
      dataB64: await blobToBase64(record.blob),
    });
  }
  return out;
}

/** Assemble the full envelope: the given sheet store + every world, every
 *  user table, and every REFERENCED image in IndexedDB. */
export async function buildBackup(sheets: SheetStore): Promise<string> {
  const backup: BackupV4 = {
    format: BACKUP_FORMAT,
    version: 4,
    savedAt: new Date().toISOString(),
    sheets,
    worlds: await getAllWorlds(),
    brews: await getUserTables(),
    assets: await referencedAssets(sheets),
  };
  return JSON.stringify(backup);
}

export interface ParsedBackup {
  sheets: SheetStore | null;
  worlds: WorldDoc[];
  brews: UserTable[];
  assets: BackupAsset[];
}

/** Tolerant unwrap: v4…v1, or a bare SheetStore from the very first builds. */
export function parseBackup(raw: string): ParsedBackup {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return { sheets: null, worlds: [], brews: [], assets: [] };
  const p = parsed as Record<string, unknown>;
  if (p.format === BACKUP_FORMAT) {
    const worlds = Array.isArray(p.worlds) ? p.worlds.filter(looksLikeWorld) : [];
    const sheets = (p.sheets as SheetStore | undefined) ?? null;
    const brews = Array.isArray(p.brews) ? (p.brews as UserTable[]) : [];
    const assets = Array.isArray(p.assets) ? (p.assets as BackupAsset[]) : [];
    return { sheets, worlds, brews, assets };
  }
  // bare SheetStore (pre-envelope backups)
  return { sheets: parsed as SheetStore, worlds: [], brews: [], assets: [] };
}

/** Write backed-up images into the asset store (skips ones already present —
 *  content-hash ids make this idempotent). */
export async function restoreAssets(assets: BackupAsset[]): Promise<number> {
  let restored = 0;
  for (const a of assets) {
    if (!a?.id || typeof a.dataB64 !== 'string') continue;
    try {
      const bytes = Uint8Array.from(atob(a.dataB64), (c) => c.charCodeAt(0));
      await putAssetRaw(
        { id: a.id, mime: a.mime, w: a.w, h: a.h, createdAt: a.createdAt },
        new Blob([bytes], { type: a.mime }),
      );
      restored += 1;
    } catch {
      console.warn(`backup: could not restore asset ${a.id}`);
    }
  }
  return restored;
}

/** Restore user tables: newer-wins per id (brewStore.restoreUserTables). */
export async function restoreBrews(brews: UserTable[]): Promise<number> {
  return brews.length ? await restoreUserTables(brews) : 0;
}

export interface WorldRestoreResult {
  restored: number;
  skippedOlder: number;
  /** worlds that were MERGED with a diverged local copy (queue #38) */
  mergedWorlds: number;
  /** pages brought in by those merges that one side didn't have */
  mergedPages: number;
  /** LWW collisions filed into the conflict inboxes */
  conflicts: number;
}

/** Restore worlds from a backup. A world with no local copy is written as-is;
 *  a world with a local copy is MERGED (queue #38): entity union, per-entity
 *  LWW, losers filed in the world's conflict inbox — so prepping on two
 *  devices no longer discards whichever synced second. An identical copy is a
 *  no-op. Writes are RAW: restoring must not bump rev/updated, or an
 *  unchanged world comes back looking strictly newer than the same copy on
 *  every other device and each backup→restore round-trip inflates rev. */
export async function restoreWorlds(worlds: WorldDoc[]): Promise<WorldRestoreResult> {
  let restored = 0;
  let skippedOlder = 0;
  let mergedWorlds = 0;
  let mergedPages = 0;
  let conflicts = 0;
  for (const w of worlds) {
    const local = await getWorld(w.id);
    if (!local) {
      await putWorldRaw(w);
      restored++;
      continue;
    }
    const r = mergeWorlds(local, w);
    if (r.added === 0 && r.collided === 0 && r.conflicts.length === 0
      && (local.rev ?? 0) >= (w.rev ?? 0)) {
      // nothing the local copy doesn't already have
      skippedOlder++;
      continue;
    }
    await putWorldRaw(r.world);
    restored++;
    if (r.added || r.collided) { mergedWorlds++; mergedPages += r.added; conflicts += r.conflicts.length; }
  }
  return { restored, skippedOlder, mergedWorlds, mergedPages, conflicts };
}
