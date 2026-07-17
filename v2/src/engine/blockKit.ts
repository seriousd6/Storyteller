// The Block Kit (docs/sheets/PLAN.md §3): ONE definition per block type —
// static DOM, editable DOM, and Markdown — consumed by every surface
// (blockRender.ts, /sheet/, sheetToMarkdown). Adding a block type is one new
// file under engine/blocks/ plus a schema entry; forgetting a renderer is a
// compile error, not a silent drift between surfaces.

import type { Block } from './types.ts';
import type { Command } from './commands.ts';

export type EditMode = 'edit' | 'play';

/** Services available to read-only rendering. `edit` is present when a
 *  static-looking surface can still persist state — play mode (PLAN.md §16)
 *  renders blocks statically but interactive widgets (rollTable) write their
 *  results through it. */
export interface RenderCtx {
  renderChild(block: Block): HTMLElement;
  edit?: EditCtx;
  /** The sheet's live var scope ($str.mod and friends, PLAN.md §4) — read at
   *  CLICK time, never captured, so a raised STR reaches every later roll. */
  vars?: () => Record<string, number>;
}

/** Services available to editable rendering. The ctx is the seam that keeps
 *  block defs store-agnostic: /sheet/ backs save() with sheetStore, a future
 *  world-page adoption backs it with worldStore — the defs never know. */
export interface EditCtx {
  mode: EditMode;
  renderChild(block: Block): HTMLElement;
  /** Persist the model NOW without re-rendering (live text edits). */
  save(): void;
  /** Apply a structural command through the undo bus, then save + re-render. */
  execute(cmd: Command): void;
  /** Record an already-applied command (coalesced text-edit session). */
  record(cmd: Command): void;
  /** Same contract as RenderCtx.vars. */
  vars?: () => Record<string, number>;
}

export interface BlockDef<B extends Block = Block> {
  type: B['type'];
  renderStatic(block: B, ctx: RenderCtx): HTMLElement;
  renderEditable(block: B, ctx: EditCtx): HTMLElement;
  toMarkdown(block: B, md: (child: Block) => string): string;
  /** Optional: activate interactive chrome (dice chips, roll buttons) on a
   *  static surface. Unused until PLAN.md §4/§17 land. */
  hydrate?(el: HTMLElement, block: B, ctx: RenderCtx): void;
}

// ---------------------------------------------------------------------------
// Shared helpers for block defs

/** The standard block root: `.b.b-<type>`, matched by sheet/world/print CSS. */
export function blockRoot(type: Block['type']): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `b b-${type}`;
  return el;
}

/** A small inline control (add/remove), hidden until the block is hovered. */
export function mini(glyph: string, label: string, fn: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mini no-print';
  btn.textContent = glyph;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.addEventListener('click', fn);
  return btn;
}

/** Contenteditable text bound to the model. Edits save in place on every
 *  input (so the tray stays live and nothing is lost); the whole focus→blur
 *  session coalesces into ONE undo entry, recorded only if the value actually
 *  changed. Browser-native ctrl+Z still works while the field is focused —
 *  its input events run set() so the model stays in sync. */
export function editableText(
  el: HTMLElement,
  ctx: EditCtx,
  get: () => string,
  set: (v: string) => void,
): void {
  el.contentEditable = 'true';
  el.spellcheck = false;
  el.textContent = get();
  let before: string | null = null;
  el.addEventListener('focus', () => {
    before = get();
  });
  el.addEventListener('input', () => {
    set(el.textContent ?? '');
    ctx.save();
  });
  el.addEventListener('blur', () => {
    if (before === null || before === get()) {
      before = null;
      return;
    }
    const prev = before;
    const next = get();
    before = null;
    ctx.record({ apply: () => set(next), revert: () => set(prev), label: 'edit text' });
  });
}

// ---------------------------------------------------------------------------
// Registry + dispatchers

import { titleDef } from './blocks/title.ts';
import { paragraphDef } from './blocks/paragraph.ts';
import { keyValueDef } from './blocks/keyValue.ts';
import { listDef } from './blocks/list.ts';
import { tableDef } from './blocks/table.ts';
import { statblockDef } from './blocks/statblock.ts';
import { rollTableDef } from './blocks/rollTable.ts';
import { pageBreakDef } from './blocks/pageBreak.ts';
import { trackerDef } from './blocks/tracker.ts';
import { statGridDef } from './blocks/statGrid.ts';
import { actionsDef } from './blocks/actions.ts';

export const blockKit: { [K in Block['type']]: BlockDef<Extract<Block, { type: K }>> } = {
  title: titleDef,
  paragraph: paragraphDef,
  keyValue: keyValueDef,
  list: listDef,
  table: tableDef,
  statblock: statblockDef,
  rollTable: rollTableDef,
  pageBreak: pageBreakDef,
  tracker: trackerDef,
  statGrid: statGridDef,
  actions: actionsDef,
};

const staticCtx: RenderCtx = { renderChild: (b) => renderBlockStatic(b) };

export function renderBlockStatic(block: Block): HTMLElement {
  return (blockKit[block.type] as BlockDef).renderStatic(block, staticCtx);
}

export function renderBlockEditable(block: Block, ctx: EditCtx): HTMLElement {
  return (blockKit[block.type] as BlockDef).renderEditable(block, ctx);
}

/** Play mode (PLAN.md §16): blocks render like the static surface — inline
 *  tokens live, no contenteditable, no structural chrome — but interactive
 *  widgets persist through the EditCtx so a roll at the table is saved (and
 *  undoable) like any other edit. */
export function renderBlockPlay(block: Block, edit: EditCtx): HTMLElement {
  const ctx: RenderCtx = { renderChild: (b) => renderBlockPlay(b, edit), edit, vars: edit.vars };
  return (blockKit[block.type] as BlockDef).renderStatic(block, ctx);
}

export function blockToMarkdown(block: Block): string {
  return (blockKit[block.type] as BlockDef).toMarkdown(block, blockToMarkdown);
}
