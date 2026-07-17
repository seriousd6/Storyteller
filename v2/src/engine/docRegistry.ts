// The document registry (docs/sheets/PLAN.md §12): every store registers
// its documents ONCE and they appear everywhere the registry is consumed —
// the Library today, the sync manifest in Phase 4. A new document type is
// a new DocTypeDef here, not a new page.

import {
  initSheetStore,
  loadStore,
  saveStore,
  activeSheets,
  deleteSheet,
  newId,
  type Sheet,
} from './sheetStore.ts';
import { listWorlds, deleteWorld } from './worldStore.ts';
import { getUserTables, deleteUserTable } from './brewStore.ts';
import { getUserSkins, deleteUserSkin } from './diceSkins.ts';
import { renderBlockStatic, blockToMarkdown } from './blockKit.ts';

export type DocTypeId = 'sheet' | 'world' | 'brew' | 'diceskin';

export interface DocMeta {
  id: string;
  type: DocTypeId;
  name: string;
  /** sheet kind chip ('character', 'session', …) when known */
  kind?: string;
  /** one-line summary shown under the name */
  detail: string;
  updatedAt?: number;
  /** flagged as the user's own boilerplate (sheets, PLAN.md §21.5) */
  template?: boolean;
  /** genre pin (PLAN.md §15) — shown as a chip on the shelf */
  genre?: string;
  /** lowercased body text for full-text search (capped) */
  haystack?: string;
}

export interface DocTypeDef {
  type: DocTypeId;
  label: string;
  icon: string;
  list(): Promise<DocMeta[]>;
  /** Activate the document and return the URL to open. */
  open(id: string): Promise<string>;
  /** Trash/delete semantics are the store's own (sheets → 30-day trash). */
  remove?(id: string): Promise<void>;
  duplicate?(id: string): Promise<void>;
  /** Small rendered preview for the library card. */
  thumb?(id: string): Promise<HTMLElement | null>;
}

const sheetType: DocTypeDef = {
  type: 'sheet',
  label: 'Sheets',
  icon: '📄',
  async list() {
    await initSheetStore();
    return activeSheets(loadStore()).map((s) => ({
      id: s.id,
      type: 'sheet' as const,
      name: s.name,
      kind: s.kind,
      template: s.template,
      genre: s.genre,
      detail: `${s.blocks.length} block(s)${s.mode === 'play' ? ' · play mode' : ''}${s.template ? ' · ★ template' : ''}`,
      haystack: s.blocks.map(blockToMarkdown).join(' ').toLowerCase().slice(0, 4000),
    }));
  },
  async thumb(id) {
    await initSheetStore();
    const sheet = loadStore().sheets.find((s) => s.id === id);
    if (!sheet || sheet.blocks.length === 0) return null;
    const inner = document.createElement('div');
    inner.className = 'lib-thumb-inner';
    for (const block of sheet.blocks.slice(0, 4)) {
      try {
        inner.appendChild(renderBlockStatic(block));
      } catch {
        /* a broken block must not take the shelf down */
      }
    }
    return inner;
  },
  async open(id) {
    await initSheetStore();
    const store = loadStore();
    if (store.sheets.some((s) => s.id === id)) {
      store.activeId = id;
      saveStore(store, 'library');
    }
    return '/sheet/';
  },
  async remove(id) {
    await initSheetStore();
    deleteSheet(loadStore(), id); // → the 30-day trash, not oblivion
  },
  async duplicate(id) {
    await initSheetStore();
    const store = loadStore();
    const source = store.sheets.find((s) => s.id === id);
    if (!source) return;
    const copy: Sheet = structuredClone(source);
    copy.id = newId();
    copy.name = `${source.name} (copy)`;
    delete copy.deletedAt;
    for (const b of copy.blocks) if (b.id) b.id = `pin-${newId()}`;
    store.sheets.push(copy);
    store.activeId = copy.id;
    saveStore(store, 'library');
  },
};

const worldType: DocTypeDef = {
  type: 'world',
  label: 'Worlds',
  icon: '🌍',
  async list() {
    const worlds = await listWorlds();
    return worlds.map((w) => ({
      id: w.id,
      type: 'world' as const,
      name: w.name,
      detail: `world · updated ${new Date(w.updated).toLocaleDateString()}`,
    }));
  },
  async open(id) {
    try {
      localStorage.setItem('stb:everdeep:activeWorld', id);
    } catch {
      /* the world page falls back to its own picker */
    }
    return '/world/';
  },
  async remove(id) {
    await deleteWorld(id);
  },
};

const brewType: DocTypeDef = {
  type: 'brew',
  label: 'My tables',
  icon: '🍺',
  async list() {
    const tables = await getUserTables();
    return tables.map((t) => ({
      id: t.id,
      type: 'brew' as const,
      name: t.title,
      detail: `${t.entries.length} entries · ${t.id}`,
      updatedAt: t.updatedAt,
      haystack: t.entries
        .map((e) => (typeof e === 'string' ? e : e.text))
        .join(' ')
        .toLowerCase()
        .slice(0, 4000),
    }));
  },
  async open() {
    return '/sheet/'; // the brew panel lives on the Sheet Builder
  },
  async remove(id) {
    await deleteUserTable(id);
  },
};

const diceskinType: DocTypeDef = {
  type: 'diceskin',
  label: 'Dice skins',
  icon: '🎲',
  async list() {
    const skins = await getUserSkins();
    return skins.map((sk) => ({
      id: sk.id,
      type: 'diceskin' as const,
      name: sk.name,
      genre: sk.genre,
      detail: `${sk.material} dice · ${sk.body.color}${sk.body.texture ? ' · textured' : ''}`,
      updatedAt: sk.updatedAt,
    }));
  },
  async open() {
    return '/sheet/'; // the dice panel lives on the Sheet Builder
  },
  async remove(id) {
    await deleteUserSkin(id);
  },
};

export const docTypes: DocTypeDef[] = [sheetType, worldType, brewType, diceskinType];

/** Flag/unflag a sheet as the user's own boilerplate (PLAN.md §21.5). */
export async function toggleSheetTemplate(id: string): Promise<void> {
  await initSheetStore();
  const store = loadStore();
  const sheet = store.sheets.find((s) => s.id === id);
  if (!sheet) return;
  sheet.template = !sheet.template;
  saveStore(store, 'library');
}
