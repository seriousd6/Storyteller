// @-mentions (PLAN.md Phase 5, last item): type @ in any editable text field
// and pick a world entity — an inline [[@worldId:entityId]] token lands in
// the text. inline.ts renders the token as a name-link chip on static/play
// surfaces; exports resolve it to the entity's plain name (the recipient has
// no world to link into). One shared floating menu for the whole page.
//
// The menu is runtime-created DOM: its styles live in global.css, NOT in any
// scoped block (the recurring scoped-vs-runtime bug class).

import { getAllWorlds, WORLD_EVENT } from './worldStore.ts';

export interface MentionCandidate {
  worldId: string;
  entityId: string;
  name: string;
  kind: string;
  worldName: string;
}

let cache: MentionCandidate[] | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener(WORLD_EVENT, () => {
    cache = null;
  });
}

async function candidates(): Promise<MentionCandidate[]> {
  if (cache) return cache;
  const worlds = await getAllWorlds().catch(() => []);
  cache = worlds.flatMap((w) =>
    Object.values(w.entities)
      .filter((e) => !e.deleted && !e.secret) // GM-secret entities never autocomplete
      .map((e) => ({ worldId: w.id, entityId: e.id, name: e.name, kind: e.kind, worldName: w.name })),
  );
  return cache;
}

const MAX_SHOWN = 8;

// --- the shared menu ---

let menu: HTMLDivElement | null = null;
let activeEl: HTMLElement | null = null;
let items: MentionCandidate[] = [];
let activeIndex = 0;

function ensureMenu(): HTMLDivElement {
  if (menu) return menu;
  menu = document.createElement('div');
  menu.className = 'mention-menu no-print';
  menu.hidden = true;
  // mousedown, not click: the field must keep focus while picking
  menu.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const row = (e.target as HTMLElement).closest<HTMLElement>('[data-mention-index]');
    if (row) pick(items[Number(row.dataset.mentionIndex)]!);
  });
  document.body.appendChild(menu);
  window.addEventListener('scroll', hide, true);
  return menu;
}

function hide(): void {
  if (menu) menu.hidden = true;
  items = [];
  activeIndex = 0;
}

export function mentionMenuOpen(): boolean {
  return !!menu && !menu.hidden;
}

/** Where the caret's pending "@query" sits inside the field's text node. */
function queryAt(el: HTMLElement): { text: Text; start: number; end: number; q: string } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return null;
  const text = node as Text;
  const upto = text.data.slice(0, sel.anchorOffset);
  // an @ at the start or after whitespace/bracket, then a short query
  const m = /(^|[\s([{])@([^@[\]]{0,40})$/.exec(upto);
  if (!m) return null;
  const start = m.index + m[1]!.length;
  return { text, start, end: sel.anchorOffset, q: m[2]! };
}

function pick(c: MentionCandidate): void {
  if (!activeEl) return;
  const ctx = queryAt(activeEl);
  if (!ctx) {
    hide();
    return;
  }
  const token = `[[@${c.worldId}:${c.entityId}]] `;
  ctx.text.replaceData(ctx.start, ctx.end - ctx.start, token);
  window.getSelection()?.collapse(ctx.text, ctx.start + token.length);
  const el = activeEl;
  hide();
  el.dispatchEvent(new Event('input', { bubbles: true })); // editableText syncs the model
}

function render(rect: DOMRect): void {
  const m = ensureMenu();
  m.replaceChildren(
    ...items.map((c, i) => {
      const row = document.createElement('div');
      row.className = 'mention-item';
      row.dataset.mentionIndex = String(i);
      if (i === activeIndex) row.setAttribute('aria-selected', 'true');
      const name = document.createElement('b');
      name.textContent = c.name;
      const meta = document.createElement('span');
      meta.textContent = ` ${c.kind} · ${c.worldName}`;
      row.append(name, meta);
      return row;
    }),
  );
  m.hidden = false;
  m.style.left = `${Math.min(rect.left, window.innerWidth - 21 * 16)}px`;
  m.style.top = `${rect.bottom + 4}px`;
}

async function refresh(el: HTMLElement): Promise<void> {
  const ctx = queryAt(el);
  if (!ctx) {
    hide();
    return;
  }
  const q = ctx.q.trim().toLowerCase();
  const all = await candidates();
  items = all.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, MAX_SHOWN);
  activeIndex = 0;
  if (items.length === 0) {
    hide();
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    hide();
    return;
  }
  const rect = sel.getRangeAt(0).getBoundingClientRect();
  render(rect);
}

/** Wire a contenteditable field for @-mentions. Called by editableText —
 *  every text field on every block gets this for free. */
export function attachMentions(el: HTMLElement): void {
  el.addEventListener('input', () => {
    activeEl = el;
    void refresh(el);
  });
  el.addEventListener('keydown', (e) => {
    if (!mentionMenuOpen() || activeEl !== el) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) render(sel.getRangeAt(0).getBoundingClientRect());
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(items[activeIndex]!);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  });
  el.addEventListener('blur', () => {
    // let a menu mousedown land first (it preventDefaults, but belt+braces)
    setTimeout(() => {
      if (activeEl === el) hide();
    }, 0);
  });
}
