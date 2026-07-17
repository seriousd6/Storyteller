// The Drive backup envelope, shared by /sheet/ and /world/. Versioned so
// document types can join without breaking older backups (OVERHAUL.md §4):
//   v1: { sheets }   v2: { sheets, worlds }   v3: { sheets, worlds, brews }
// Building always reads EVERY store, so saving from either page never drops
// another store's documents. Per-world Drive files arrive with images
// (PLAN.md F1/Q22); until then everything is small JSON in the single file.

import type { SheetStore } from './sheetStore.ts';
import { getAllWorlds, putWorldRaw, getWorld, looksLikeWorld, mergeWorlds, type WorldDoc } from './worldStore.ts';
import { getUserTables, restoreUserTables, type UserTable } from './brewStore.ts';

export const BACKUP_FORMAT = 'storyteller-toolbox-backup';

export interface BackupV3 {
  format: typeof BACKUP_FORMAT;
  version: 3;
  savedAt: string;
  sheets: SheetStore;
  worlds: WorldDoc[];
  brews: UserTable[];
}

/** Assemble the full envelope: the given sheet store + every world and every
 *  user table in IndexedDB. */
export async function buildBackup(sheets: SheetStore): Promise<string> {
  const backup: BackupV3 = {
    format: BACKUP_FORMAT,
    version: 3,
    savedAt: new Date().toISOString(),
    sheets,
    worlds: await getAllWorlds(),
    brews: await getUserTables(),
  };
  return JSON.stringify(backup);
}

export interface ParsedBackup {
  sheets: SheetStore | null;
  worlds: WorldDoc[];
  brews: UserTable[];
}

/** Tolerant unwrap: v3, v2, v1, or a bare SheetStore from the very first builds. */
export function parseBackup(raw: string): ParsedBackup {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return { sheets: null, worlds: [], brews: [] };
  const p = parsed as Record<string, unknown>;
  if (p.format === BACKUP_FORMAT) {
    const worlds = Array.isArray(p.worlds) ? p.worlds.filter(looksLikeWorld) : [];
    const sheets = (p.sheets as SheetStore | undefined) ?? null;
    const brews = Array.isArray(p.brews) ? (p.brews as UserTable[]) : [];
    return { sheets, worlds, brews };
  }
  // bare SheetStore (pre-envelope backups)
  return { sheets: parsed as SheetStore, worlds: [], brews: [] };
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
