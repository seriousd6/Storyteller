// Inline markup (docs/sheets/PLAN.md §4): [[2d6+3]] and [[table:gm/loot/gems]]
// inside block text become live chips on static/play surfaces. In EDIT mode
// the tokens stay literal text (blocks call this only outside editing —
// contenteditable and live widgets do not mix, by policy).
//
// The dice stage and table chunks are lazy: a page costs nothing until the
// first click.

import { looksLikeDice } from './dice.ts';
import { randomSeed } from './rng.ts';
import { pushRoll } from './rollLog.ts';

const INLINE_RE = /\[\[([^[\]]+)\]\]/g;

export function hasInlineTokens(text: string): boolean {
  INLINE_RE.lastIndex = 0;
  return INLINE_RE.test(text);
}

function chip(label: string, title: string, cls: string): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `chip ${cls}`;
  btn.textContent = label;
  btn.title = title;
  return btn;
}

function resultSpan(): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'chip-result';
  return span;
}

export type VarsFn = () => Record<string, number>;

function diceChip(formula: string, vars?: VarsFn): DocumentFragment {
  const frag = document.createDocumentFragment();
  const btn = chip(formula, `Roll ${formula}`, 'chip-dice');
  const out = resultSpan();
  btn.addEventListener('click', async () => {
    try {
      const [{ roll }, { showRoll }] = await Promise.all([import('./dice.ts'), import('./diceStage.ts')]);
      // vars are read at CLICK time — a raised STR reaches this roll
      const result = roll(formula, randomSeed(), vars?.() ?? {});
      out.textContent = ` ${result.total}`;
      out.title = result.breakdown;
      showRoll(result);
      pushRoll({ label: formula, detail: result.breakdown, total: result.total });
    } catch (err) {
      out.textContent = ' ⚠';
      out.title = err instanceof Error ? err.message : 'roll failed';
    }
  });
  frag.append(btn, out);
  return frag;
}

function tableChip(id: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const label = id.split('/').pop() ?? id;
  const btn = chip(`⚄ ${label}`, `Roll on ${id}`, 'chip-table');
  const out = resultSpan();
  btn.addEventListener('click', async () => {
    try {
      const [{ loadClosure }, { renderTemplate }] = await Promise.all([
        import('./tableLoader.ts'),
        import('./roll.ts'),
      ]);
      const registry = await loadClosure([id]);
      const text = renderTemplate(`{table:${id}}`, registry, randomSeed());
      out.textContent = ` ${text}`;
      pushRoll({ label, detail: text });
    } catch (err) {
      out.textContent = ' ⚠';
      out.title = err instanceof Error ? err.message : 'roll failed';
    }
  });
  frag.append(btn, out);
  return frag;
}

/** [[spell:Fireball]] — a hoverable spell chip. The card (its level, casting
 *  time, effect… and, with vars, its to-hit/damage roll buttons) is built
 *  lazily on first hover, so the spell dataset stays out of the bundle until
 *  a spell is inspected. Unknown names show no card. Hiding is on a short
 *  grace timer and the card cancels it — the pointer can travel INTO the
 *  card to click a roll button (owner review 2026-07-18). */
function spellChip(name: string, vars?: VarsFn): HTMLElement {
  const span = document.createElement('span');
  span.className = 'chip chip-spell';
  span.tabIndex = 0;
  span.textContent = name;
  let card: HTMLElement | null = null;
  let building = false;
  let hideTimer: number | undefined;
  const place = (): void => {
    if (!card) return;
    const r = span.getBoundingClientRect();
    const cw = 320;
    card.style.left = `${Math.max(6, Math.min(r.left, window.innerWidth - cw - 6))}px`;
    card.style.top = `${r.bottom + 4}px`;
  };
  const cancelHide = (): void => window.clearTimeout(hideTimer);
  const hide = (): void => {
    cancelHide();
    hideTimer = window.setTimeout(() => {
      if (card) card.hidden = true;
    }, 250);
  };
  const show = async (): Promise<void> => {
    cancelHide();
    if (!card && !building) {
      building = true;
      const { buildSpellCard } = await import('./spellCard.ts');
      card = buildSpellCard(name, vars);
      building = false;
      if (card) {
        document.body.appendChild(card);
        card.addEventListener('mouseenter', cancelHide);
        card.addEventListener('mouseleave', hide);
        card.addEventListener('focusin', cancelHide);
        card.addEventListener('focusout', hide);
      }
    }
    cancelHide();
    if (card) {
      card.hidden = false;
      place();
    }
  };
  span.addEventListener('mouseenter', () => void show());
  span.addEventListener('mouseleave', hide);
  span.addEventListener('focus', () => void show());
  span.addEventListener('blur', hide);
  return span;
}

/** [[@worldId:entityId]] — an @-mention (engine/mentions.ts): the entity's
 *  name as a link into its wiki page. The name resolves async through the
 *  entityRef doc cache (dynamic import: entityRef pulls in blockKit, and a
 *  static import here would close a cycle). Missing entity → the literal
 *  token stays visible, per the never-eat-user-text rule. */
function entityChip(inner: string): Node {
  const m = /^@([^:\s]+):(\S+)$/.exec(inner);
  if (!m) return document.createTextNode(`[[${inner}]]`);
  const a = document.createElement('a');
  a.className = 'chip chip-entity';
  a.href = `/world/?world=${encodeURIComponent(m[1]!)}&entity=${encodeURIComponent(m[2]!)}`;
  a.textContent = '@…';
  a.title = 'A world entity — opens its wiki page';
  void import('./blocks/entityRef.ts').then(async ({ peekEntity }) => {
    const entity = await peekEntity(m[1]!, m[2]!);
    if (entity) {
      a.textContent = `@${entity.name}`;
    } else {
      a.textContent = `[[${inner}]]`;
      a.removeAttribute('href');
      a.title = 'This entity is not on this device (deleted, or another device\'s world)';
    }
  });
  return a;
}

/** Render text with [[...]] tokens as live chips. Unknown/broken tokens stay
 *  literal — user text must never be eaten. Returns a plain text node when
 *  the text has no tokens (the overwhelmingly common case). */
export function renderInlineText(text: string, vars?: VarsFn): Node {
  INLINE_RE.lastIndex = 0;
  if (!INLINE_RE.test(text)) return document.createTextNode(text);
  INLINE_RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const inner = m[1]!.trim();
    if (inner.startsWith('@')) {
      frag.appendChild(entityChip(inner));
    } else if (inner.toLowerCase().startsWith('table:')) {
      const id = inner.slice('table:'.length).trim();
      if (/^[a-z0-9/-]+$/.test(id)) frag.appendChild(tableChip(id));
      else frag.appendChild(document.createTextNode(m[0]));
    } else if (inner.toLowerCase().startsWith('spell:')) {
      const name = inner.slice('spell:'.length).trim();
      if (name) frag.appendChild(spellChip(name, vars));
      else frag.appendChild(document.createTextNode(m[0]));
    } else if (looksLikeDice(inner)) {
      frag.appendChild(diceChip(inner, vars));
    } else {
      frag.appendChild(document.createTextNode(m[0]));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}
