// Choice-list block (docs/CAMPAIGN-CODEX.md): a labelled group of dropdowns,
// each choosing from one shared pool — a spellbook level (pick from the class's
// spell list), a warlock's invocations, a sorcerer's metamagic. Emitted with
// rolled values; the player re-picks any row, adds a row, or removes one. Each
// pick is state (like a tracker tick): it goes through the commit sink, so it
// persists, syncs to the tray, and undoes with ctrl+Z. Prints as a bullet list.

import type { ChoiceListBlock } from '../types.ts';
import type { BlockDef, EditCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';
import { renderInlineText } from '../inline.ts';

function setAt(block: ChoiceListBlock, i: number, next: string, edit: EditCtx): void {
  if (block.values[i] === next) return;
  const prev = block.values[i] ?? '';
  edit.execute({
    label: 'choose',
    apply: () => (block.values[i] = next),
    revert: () => (block.values[i] = prev),
  });
}

/** A <select> for row `i`. If its value isn't in the pool (a hand-typed or
 *  rolled-then-removed option), it leads the list so nothing is lost. */
function selectEl(block: ChoiceListBlock, i: number, edit: EditCtx): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'choice-select';
  const cur = block.values[i] ?? '';
  const opts = cur && !block.options.includes(cur) ? [cur, ...block.options] : block.options;
  for (const o of opts) {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    if (o === cur) opt.selected = true;
    sel.appendChild(opt);
  }
  sel.addEventListener('change', () => setAt(block, i, sel.value, edit));
  return sel;
}

function render(block: ChoiceListBlock, edit?: EditCtx): HTMLElement {
  const el = blockRoot('choiceList');

  const b = document.createElement('b');
  b.className = 'b-label';
  if (edit && edit.mode === 'edit') {
    editableText(b, edit, () => block.label, (v) => (block.label = v));
  } else {
    b.textContent = block.label;
  }
  el.appendChild(b);

  const editing = !!edit && edit.mode === 'edit';
  const ul = document.createElement('ul');
  ul.className = 'choice-list';
  block.values.forEach((val, i) => {
    const li = document.createElement('li');
    if (editing) {
      // Edit mode: pick each row from the pool, and add/remove rows.
      li.appendChild(selectEl(block, i, edit!));
      li.appendChild(
        mini('✕', 'Remove', () => {
          const removed = block.values[i] ?? '';
          edit!.execute({
            label: 'remove choice',
            apply: () => block.values.splice(i, 1),
            revert: () => block.values.splice(i, 0, removed),
          });
        }),
      );
    } else if (block.hover === 'spell') {
      // Play / print: a spellbook you read — each value a hoverable spell chip.
      li.appendChild(val ? renderInlineText(`[[spell:${val}]]`) : document.createTextNode('—'));
    } else if (edit) {
      // Play, generic list: keep the dropdown so a pick can still change.
      li.appendChild(selectEl(block, i, edit));
    } else {
      li.textContent = val || '—';
    }
    ul.appendChild(li);
  });
  el.appendChild(ul);

  if (edit && edit.mode === 'edit') {
    el.appendChild(
      mini('＋ add', 'Add a row', () => {
        const val = block.options[0] ?? '';
        edit.execute({
          label: 'add choice',
          apply: () => block.values.push(val),
          revert: () => block.values.pop(),
        });
      }),
    );
  }

  return el;
}

export const choiceListDef: BlockDef<ChoiceListBlock> = {
  type: 'choiceList',
  renderStatic: (block, ctx) => render(block, ctx.edit),
  renderEditable: (block, ctx) => render(block, ctx),
  toMarkdown: (block) =>
    `**${block.label}**\n` + block.values.map((v) => `- ${v || '—'}`).join('\n'),
};
