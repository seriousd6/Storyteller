// Client-side store for the Sheet Builder: named sheets of typed blocks in
// localStorage. Generators push pinned blocks into the active sheet; the
// /sheet/ page edits, reorders, prints, and exports them.

import type { Block } from './types.ts';

export interface Sheet {
  id: string;
  name: string;
  blocks: Block[];
}

export interface SheetStore {
  activeId: string;
  sheets: Sheet[];
}

const KEY = 'stb:sheets:v1';
const LEGACY_PINS = 'stb:pins:v1';

/** Fired on window after every save; detail.source identifies the writer so
 *  components can ignore their own writes (e.g. while an edit has focus). */
export const SHEET_EVENT = 'stb:sheet-changed';

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptySheet(name: string): Sheet {
  return { id: newId(), name, blocks: [] };
}

export function loadStore(): SheetStore {
  const raw = localStorage.getItem(KEY);
  let store: SheetStore | null = null;
  let unreadable = false;
  if (raw !== null) {
    try {
      store = JSON.parse(raw);
    } catch {
      unreadable = true;
    }
  }
  // A PRESENT-but-broken value must not be treated like an absent one: silently
  // replacing it with a fresh empty store throws away every sheet the user had
  // (one bad write, a quota-truncated value, or a foreign import). Stash the raw
  // bytes under a backup key and warn, so the work is recoverable, before reset.
  const malformed = unreadable || (store !== null && !Array.isArray(store.sheets));
  if (malformed) {
    try {
      if (raw !== null) localStorage.setItem(`${KEY}:corrupt`, raw);
    } catch {
      /* backup is best-effort */
    }
    console.error(`sheet store at "${KEY}" was unreadable — backed up to "${KEY}:corrupt" and reset`);
  }
  if (!store || !Array.isArray(store.sheets) || store.sheets.length === 0) {
    const sheet = emptySheet('My Sheet');
    store = { activeId: sheet.id, sheets: [sheet] };
  }
  // Normalize each sheet: a hand-edited or foreign backup can carry a sheet with
  // no blocks array, and downstream rendering does sheet.blocks.map — which
  // would throw and take the whole page down.
  for (const s of store.sheets) {
    if (!Array.isArray(s.blocks)) s.blocks = [];
  }
  if (!store.sheets.some((s) => s.id === store!.activeId)) {
    store.activeId = store.sheets[0]!.id;
  }

  // One-time migration of blocks pinned before named sheets existed.
  try {
    const legacy: Block[] = JSON.parse(localStorage.getItem(LEGACY_PINS) ?? 'null');
    if (Array.isArray(legacy) && legacy.length) {
      getActive(store).blocks.push(...legacy);
      localStorage.removeItem(LEGACY_PINS);
      saveStore(store);
    }
  } catch {
    /* ignore malformed legacy pins */
  }

  return store;
}

let quotaWarned = false;
export function saveStore(store: SheetStore, source = 'unknown'): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch (err) {
    // Quota/oversize: the write is lost — say so VISIBLY (once), instead of
    // throwing out of a pin handler with no signal. The event below still
    // fires so every view resyncs to what localStorage actually holds.
    console.error('sheet store save failed', err);
    if (!quotaWarned && typeof window !== 'undefined') {
      quotaWarned = true;
      alert('Storage is full — your last sheet change was NOT saved. Export or delete some sheets to free space.');
    }
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: { source } }));
  }
}

// Cross-tab sync: a CustomEvent only reaches its own window, so without this a
// pin in tab A was invisible to tab B until B's next whole-store overwrite
// clobbered it. The browser's `storage` event fires in every OTHER tab; re-emit
// it as a normal sheet event so both islands resync through their usual path.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (ev) => {
    if (ev.key !== KEY) return;
    window.dispatchEvent(new CustomEvent(SHEET_EVENT, { detail: { source: 'storage' } }));
  });
}

export function getActive(store: SheetStore): Sheet {
  return store.sheets.find((s) => s.id === store.activeId) ?? store.sheets[0]!;
}

/** Append a block to the active sheet (used by generator pin buttons). */
export function addBlockToActive(block: Block): void {
  const store = loadStore();
  getActive(store).blocks.push(block);
  saveStore(store, 'pin');
}

export function createSheet(store: SheetStore, name: string): Sheet {
  const sheet = emptySheet(name);
  store.sheets.push(sheet);
  store.activeId = sheet.id;
  saveStore(store);
  return sheet;
}

export function deleteSheet(store: SheetStore, id: string): void {
  store.sheets = store.sheets.filter((s) => s.id !== id);
  if (store.sheets.length === 0) store.sheets.push(emptySheet('My Sheet'));
  if (store.activeId === id) store.activeId = store.sheets[0]!.id;
  saveStore(store);
}

// ---------------------------------------------------------------------------
// Markdown export

function blockToMarkdown(block: Block): string {
  switch (block.type) {
    case 'title':
      return `## ${block.text}${block.subtitle ? `\n*${block.subtitle}*` : ''}`;
    case 'paragraph':
      return block.label ? `**${block.label}.** ${block.text}` : block.text;
    case 'keyValue':
      return block.pairs.map((p) => `- **${p.key}:** ${p.value}`).join('\n');
    case 'list':
      return (
        (block.label ? `**${block.label}**\n` : '') +
        block.items.map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `- ${item}`)).join('\n')
      );
    case 'table': {
      const header = `| ${block.columns.join(' | ')} |`;
      const rule = `| ${block.columns.map(() => '---').join(' | ')} |`;
      const rows = block.rows.map((r) => `| ${r.join(' | ')} |`);
      return [block.label ? `**${block.label}**` : null, header, rule, ...rows].filter(Boolean).join('\n');
    }
    case 'statblock':
      return [`### ${block.name}`, block.meta ? `*${block.meta}*` : null, ...block.sections.map(blockToMarkdown)]
        .filter(Boolean)
        .join('\n\n');
  }
}

export function sheetToMarkdown(sheet: Sheet): string {
  return [`# ${sheet.name}`, ...sheet.blocks.map(blockToMarkdown)].join('\n\n') + '\n';
}
