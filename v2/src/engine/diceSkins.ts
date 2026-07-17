// Dice skins (docs/sheets/PLAN.md §17): a skin is DATA, not code — colors,
// a material recipe, optionally a small texture through the asset store.
// We ship one per genre (the pack's --dice-skin token names it) plus a few
// extras; players build their own in the editor and those are DOCUMENTS:
// they list in the Library, ride the auto-sync courier, travel in backups.

import type { GenreId } from './genres.ts';

export type DiceMaterial = 'matte' | 'gloss' | 'stone' | 'metal';

export interface DiceSkin {
  id: string;
  name: string;
  genre?: GenreId;
  body: { color: string; texture?: string }; // texture = asset id (≤512px)
  numerals: { color: string };
  edge: { color: string };
  material: DiceMaterial;
}

export interface UserDiceSkin extends DiceSkin {
  updatedAt: number;
}

// The shipped sets — each genre's default first (ids are what the packs'
// --dice-skin token names), then the extras every genre can pick from.
export const BUILTIN_SKINS: DiceSkin[] = [
  { id: 'parchment', name: 'Parchment & Ink', genre: 'fantasy', body: { color: '#f3ead8' }, numerals: { color: '#221c14' }, edge: { color: '#b9a77f' }, material: 'matte' },
  { id: 'console', name: 'Console Neon', genre: 'scifi', body: { color: '#0d1b21' }, numerals: { color: '#5eead4' }, edge: { color: '#22b8cf' }, material: 'gloss' },
  { id: 'bone', name: 'Bone & Rust', genre: 'horror', body: { color: '#e8e0d0' }, numerals: { color: '#4a0d0d' }, edge: { color: '#7a5540' }, material: 'stone' },
  { id: 'obsidian', name: 'Obsidian', body: { color: '#17141a' }, numerals: { color: '#e8dff2' }, edge: { color: '#4c3a63' }, material: 'gloss' },
  { id: 'gilt', name: 'Gilt & Crimson', body: { color: '#6d1a21' }, numerals: { color: '#f5d78e' }, edge: { color: '#c9a227' }, material: 'metal' },
];

// --- user skins: IndexedDB, same shape as the brew store -------------------

const DB_NAME = 'stb:diceskins';
const DB_VERSION = 1;
const STORE = 'skins';

/** Fired on window after every put/delete. */
export const DICESKIN_EVENT = 'stb:diceskins-changed';

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
    req.onerror = () => reject(req.error ?? new Error('could not open the dice-skin database'));
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
        req.onerror = () => reject(req.error ?? new Error('dice-skin database request failed'));
      }),
  );
}

function emit(): void {
  window.dispatchEvent(new CustomEvent(DICESKIN_EVENT));
}

export function newSkinId(): string {
  return `skin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getUserSkins(): Promise<UserDiceSkin[]> {
  const all = await tx('readonly', (s) => s.getAll() as IDBRequest<UserDiceSkin[]>);
  return all.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUserSkin(id: string): Promise<UserDiceSkin | undefined> {
  return await tx('readonly', (s) => s.get(id) as IDBRequest<UserDiceSkin | undefined>);
}

export async function putUserSkin(skin: DiceSkin): Promise<void> {
  await tx('readwrite', (s) => s.put({ ...skin, updatedAt: Date.now() }));
  emit();
}

export async function deleteUserSkin(id: string): Promise<void> {
  await tx('readwrite', (s) => s.delete(id));
  emit();
}

/** Restore from a backup or the sync courier: newest-wins per skin id. */
export async function restoreUserSkins(skins: UserDiceSkin[]): Promise<number> {
  let restored = 0;
  for (const sk of skins) {
    if (!sk?.id || !sk.body?.color || !sk.numerals?.color) continue;
    const local = await getUserSkin(sk.id);
    if (local && (local.updatedAt ?? 0) >= (sk.updatedAt ?? 0)) continue;
    await tx('readwrite', (s) => s.put(sk));
    restored += 1;
  }
  if (restored) emit();
  return restored;
}

// --- selection (PLAN.md §17): user-level choice, per-sheet pin -------------

export const SKIN_KEY = 'stb:dice-skin';

/** '' = follow the genre (the pack's --dice-skin token). */
export function chosenSkinId(): string {
  try {
    return localStorage.getItem(SKIN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setChosenSkinId(id: string): void {
  try {
    if (id) localStorage.setItem(SKIN_KEY, id);
    else localStorage.removeItem(SKIN_KEY);
  } catch {
    /* private mode — selection lasts for this page only */
  }
  emit();
}

/** The genre pack's default skin: the --dice-skin token wherever `at` sits,
 *  so a genre-pinned sheet brings its own dice. */
export function genreDefaultSkinId(at?: Element): string {
  const el = at ?? document.documentElement;
  const v = getComputedStyle(el).getPropertyValue('--dice-skin').trim();
  return v || 'parchment';
}

/** Resolve what the next roll should look like. Order: the sheet's pin
 *  (data-dice-skin on the sheet surface) → the user's picked skin → the
 *  active genre's default. Unknown ids fall through, never break a roll. */
export async function resolveActiveSkin(): Promise<DiceSkin> {
  const surface = document.querySelector<HTMLElement>('[data-sheet]');
  const candidates = [surface?.dataset.diceSkin, chosenSkinId(), genreDefaultSkinId(surface ?? undefined)];
  for (const id of candidates) {
    if (!id) continue;
    const builtin = BUILTIN_SKINS.find((s) => s.id === id);
    if (builtin) return builtin;
    const user = await getUserSkin(id).catch(() => undefined);
    if (user) return user;
  }
  return BUILTIN_SKINS[0]!;
}

/** Paint a skin onto a die-carrying element (the stage, or a preview die):
 *  CSS vars for the colors, a material class for the shading recipe, and
 *  the texture as a background image once its bytes resolve. */
export function applySkin(el: HTMLElement, skin: DiceSkin): void {
  el.style.setProperty('--dice-body', skin.body.color);
  el.style.setProperty('--dice-ink', skin.numerals.color);
  el.style.setProperty('--dice-edge', skin.edge.color);
  el.classList.remove('mat-matte', 'mat-gloss', 'mat-stone', 'mat-metal');
  el.classList.add(`mat-${skin.material}`);
  el.style.removeProperty('--dice-texture');
  if (skin.body.texture) {
    void import('./assetStore.ts').then(async ({ getAssetUrl }) => {
      const url = await getAssetUrl(skin.body.texture!);
      if (url) el.style.setProperty('--dice-texture', `url("${url}")`);
    });
  }
}
