// Choice block (docs/CAMPAIGN-CODEX.md): a labelled single-select dropdown. A
// character's discrete picks — subclass features, fighting style, a damage type
// — arrive with a rolled value; the player can pick another from the list, or
// add their own option. The pick is state (like a tracker tick): it goes through
// the commit sink, so it persists, syncs to the tray, and undoes with ctrl+Z.
// Prints as "Label: value". Add your own from the Sheet Builder palette.

import type { ChoiceBlock } from '../types.ts';
import type { BlockDef, EditCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';

function setValue(block: ChoiceBlock, next: string, edit?: EditCtx): void {
  if (next === block.value) return;
  const prev = block.value;
  if (edit) {
    edit.execute({
      label: 'choose',
      apply: () => (block.value = next),
      revert: () => (block.value = prev),
    });
  } else {
    block.value = next;
  }
}

/** The <select>. If the current value isn't among the options (a hand-typed
 *  or rolled-then-edited value), it's shown as the leading option so nothing
 *  is silently lost. */
function selectEl(block: ChoiceBlock, edit: EditCtx): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'choice-select';
  const opts = block.value && !block.options.includes(block.value)
    ? [block.value, ...block.options]
    : block.options;
  for (const o of opts) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    if (o === block.value) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => setValue(block, sel.value, edit));
  return sel;
}

function render(block: ChoiceBlock, edit?: EditCtx): HTMLElement {
  const el = blockRoot('choice');
  const p = document.createElement('p');
  const b = document.createElement('b');
  b.className = 'b-label';
  if (edit && edit.mode === 'edit') {
    editableText(b, edit, () => block.label, (v) => (block.label = v));
  } else {
    b.textContent = block.label;
  }
  p.append(b, ' ');

  if (edit && edit.mode === 'edit') {
    // Edit: a real dropdown; the pick persists + undoes. Play is for READING
    // the build, not remaking it (owner review 2026-07-18) — it gets the
    // static value below, same as print.
    p.appendChild(selectEl(block, edit));
    // 🎲 roller parity (owner ask 2026-07-19): roll a random option instead
    // of picking — always lands on a DIFFERENT option when there is one.
    if (block.options.length > 1 || (block.options.length === 1 && block.options[0] !== block.value)) {
      p.appendChild(
        mini('🎲', 'Roll a random option', () => {
          const pool = block.options.filter((o) => o !== block.value);
          const next = pool[Math.floor(Math.random() * pool.length)];
          if (next !== undefined) setValue(block, next, edit);
        }),
      );
    }
    {
      p.appendChild(
        mini('＋', 'Add an option', () => {
          const raw = prompt(`New option for ${block.label}:`);
          const val = raw?.trim();
          if (!val || block.options.includes(val)) return;
          edit.execute({
            label: 'add option',
            apply: () => block.options.push(val),
            revert: () => {
              const i = block.options.lastIndexOf(val);
              if (i >= 0) block.options.splice(i, 1);
            },
          });
        }),
      );
    }
  } else {
    // Static (print/preview): just the chosen value.
    const span = document.createElement('span');
    span.className = 'choice-value';
    span.textContent = block.value || '—';
    p.appendChild(span);
  }

  el.appendChild(p);
  return el;
}

export const choiceDef: BlockDef<ChoiceBlock> = {
  type: 'choice',
  renderStatic: (block, ctx) => render(block, ctx.edit),
  renderEditable: (block, ctx) => render(block, ctx),
  toMarkdown: (block) => `**${block.label}:** ${block.value || '—'}`,
};
