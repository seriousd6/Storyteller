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

export function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function emptySheet(name: string): Sheet {
  return { id: newId(), name, blocks: [] };
}

export function loadStore(): SheetStore {
  let store: SheetStore | null = null;
  try {
    store = JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    store = null;
  }
  if (!store || !Array.isArray(store.sheets) || store.sheets.length === 0) {
    const sheet = emptySheet('My Sheet');
    store = { activeId: sheet.id, sheets: [sheet] };
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

export function saveStore(store: SheetStore): void {
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function getActive(store: SheetStore): Sheet {
  return store.sheets.find((s) => s.id === store.activeId) ?? store.sheets[0]!;
}

/** Append a block to the active sheet (used by generator pin buttons). */
export function addBlockToActive(block: Block): void {
  const store = loadStore();
  getActive(store).blocks.push(block);
  saveStore(store);
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
