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

function diceChip(formula: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const btn = chip(formula, `Roll ${formula}`, 'chip-dice');
  const out = resultSpan();
  btn.addEventListener('click', async () => {
    try {
      const [{ roll }, { showRoll }] = await Promise.all([import('./dice.ts'), import('./diceStage.ts')]);
      const result = roll(formula, randomSeed());
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

/** Render text with [[...]] tokens as live chips. Unknown/broken tokens stay
 *  literal — user text must never be eaten. Returns a plain text node when
 *  the text has no tokens (the overwhelmingly common case). */
export function renderInlineText(text: string): Node {
  INLINE_RE.lastIndex = 0;
  if (!INLINE_RE.test(text)) return document.createTextNode(text);
  INLINE_RE.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const inner = m[1]!.trim();
    if (inner.toLowerCase().startsWith('table:')) {
      const id = inner.slice('table:'.length).trim();
      if (/^[a-z0-9/-]+$/.test(id)) frag.appendChild(tableChip(id));
      else frag.appendChild(document.createTextNode(m[0]));
    } else if (looksLikeDice(inner)) {
      frag.appendChild(diceChip(inner));
    } else {
      frag.appendChild(document.createTextNode(m[0]));
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  return frag;
}
