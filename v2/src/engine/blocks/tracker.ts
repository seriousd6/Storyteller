// Tracker block (PLAN.md §6): HP, spell slots, ammo. Ticks are state, not
// chrome — they go through the commit sink, so they persist, sync to the
// tray, undo with ctrl+Z, and will work on world entities. Prints as empty
// boxes (CSS in global.css). Exposes $<slug> / $<slug>.max (engine/vars.ts).

import type { TrackerBlock } from '../types.ts';
import type { BlockDef, EditCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';

function clamp(v: number, max: number | undefined): number {
  const hi = max ?? Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.min(v, hi));
}

function setCurrent(block: TrackerBlock, next: number, edit?: EditCtx): void {
  const value = clamp(next, block.max);
  if (value === block.current) return;
  const prev = block.current;
  if (edit) {
    edit.execute({
      label: 'tick tracker',
      apply: () => (block.current = value),
      revert: () => (block.current = prev),
    });
  } else {
    block.current = value;
  }
}

function styleOf(block: TrackerBlock): 'boxes' | 'bar' | 'number' {
  if (block.style) return block.style;
  return block.max !== undefined && block.max <= 20 ? 'boxes' : 'number';
}

function widget(block: TrackerBlock, edit?: EditCtx): HTMLElement {
  const wrap = document.createElement('span');
  wrap.className = 'tracker-widget';
  const style = styleOf(block);
  const interactive = edit !== undefined;

  if (style === 'boxes' && block.max !== undefined) {
    for (let i = 0; i < block.max; i++) {
      const box = document.createElement(interactive ? 'button' : 'span');
      box.className = `tracker-box${i < block.current ? ' filled' : ''}`;
      if (box instanceof HTMLButtonElement) {
        box.type = 'button';
        box.title = `Set ${block.label} to ${i + 1 === block.current ? i : i + 1}`;
        box.setAttribute('aria-label', `${block.label}: ${i + 1} of ${block.max}`);
        // clicking the last filled box unticks it; any other box sets the level
        box.addEventListener('click', () => setCurrent(block, i + 1 === block.current ? i : i + 1, edit));
      }
      wrap.appendChild(box);
    }
    return wrap;
  }

  const minus = document.createElement('button');
  minus.type = 'button';
  minus.className = 'btn tracker-step no-print';
  minus.textContent = '−';
  minus.setAttribute('aria-label', `${block.label} minus one`);
  minus.addEventListener('click', () => setCurrent(block, block.current - 1, edit));

  const plus = document.createElement('button');
  plus.type = 'button';
  plus.className = 'btn tracker-step no-print';
  plus.textContent = '＋';
  plus.setAttribute('aria-label', `${block.label} plus one`);
  plus.addEventListener('click', () => setCurrent(block, block.current + 1, edit));

  const value = document.createElement('span');
  value.className = 'tracker-value';
  value.textContent = block.max !== undefined ? `${block.current} / ${block.max}` : String(block.current);

  if (style === 'bar' && block.max !== undefined) {
    const bar = document.createElement('span');
    bar.className = 'tracker-bar';
    const fill = document.createElement('span');
    fill.className = 'tracker-bar-fill';
    fill.style.width = `${Math.round((100 * block.current) / Math.max(1, block.max))}%`;
    bar.appendChild(fill);
    if (interactive) wrap.append(minus, bar, value, plus);
    else wrap.append(bar, value);
    return wrap;
  }

  // number style, interactive: the value is TYPABLE (owner ask 2026-07-18 —
  // HP you can type over in edit and play, not only step by one)
  if (interactive) {
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'tracker-input';
    input.min = '0';
    if (block.max !== undefined) input.max = String(block.max);
    input.value = String(block.current);
    input.setAttribute('aria-label', `${block.label} current value`);
    input.addEventListener('change', () => {
      const next = parseInt(input.value, 10);
      if (Number.isNaN(next)) {
        input.value = String(block.current);
        return;
      }
      setCurrent(block, next, edit);
      input.value = String(block.current); // reflect the clamp
    });
    const ofMax = document.createElement('span');
    ofMax.className = 'tracker-value';
    ofMax.textContent = block.max !== undefined ? `/ ${block.max}` : '';
    wrap.append(minus, input, ofMax, plus);
    return wrap;
  }
  wrap.append(value);
  return wrap;
}

function render(block: TrackerBlock, edit?: EditCtx): HTMLElement {
  const el = blockRoot('tracker');
  const p = document.createElement('p');
  const b = document.createElement('b');
  b.className = 'b-label';
  if (edit && edit.mode === 'edit') {
    editableText(b, edit, () => block.label, (v) => (block.label = v));
  } else {
    b.textContent = block.label;
  }
  p.append(b, ' ', widget(block, edit));
  if (edit && edit.mode === 'edit' && block.max !== undefined) {
    p.appendChild(
      mini('⟳ max', 'Change maximum', () => {
        const raw = prompt(`Maximum for ${block.label}:`, String(block.max));
        const next = raw === null ? NaN : parseInt(raw, 10);
        if (Number.isNaN(next) || next < 1) return;
        const prevMax = block.max!;
        const prevCur = block.current;
        edit.execute({
          label: 'change tracker max',
          apply: () => {
            block.max = next;
            block.current = clamp(block.current, next);
          },
          revert: () => {
            block.max = prevMax;
            block.current = prevCur;
          },
        });
      }),
    );
  }
  el.appendChild(p);
  return el;
}

export const trackerDef: BlockDef<TrackerBlock> = {
  type: 'tracker',
  renderStatic: (block, ctx) => render(block, ctx.edit),
  renderEditable: (block, ctx) => render(block, ctx),
  toMarkdown: (block) =>
    `**${block.label}:** ${block.current}${block.max !== undefined ? ` / ${block.max}` : ''}`,
};
