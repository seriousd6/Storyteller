// Actions block (PLAN.md §6): attacks / spells / abilities as named roll
// buttons. Each item carries named formulas ("to-hit", "damage") that resolve
// against the sheet's var scope — raise STR once and every row updates,
// because the formula stores $str.mod, never a frozen number.

import type { ActionsBlock } from '../types.ts';
import type { BlockDef, EditCtx, RenderCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';
import { randomSeed } from '../rng.ts';
import { pushRoll } from '../rollLog.ts';
import { fmtMod } from '../vars.ts';

type ActionItem = ActionsBlock['items'][number];
type ActionRoll = ActionItem['rolls'][number];

async function doRoll(item: ActionItem, r: ActionRoll, ctx: RenderCtx | EditCtx, out: HTMLElement): Promise<void> {
  const [{ roll }, { showRoll }] = await Promise.all([import('../dice.ts'), import('../diceStage.ts')]);
  const result = roll(r.formula, randomSeed(), ctx.vars?.() ?? {});
  showRoll(result, `${item.label} — ${r.name}`);
  out.textContent = ` ${result.total}`;
  out.title = result.breakdown;
  pushRoll({ label: `${item.label} — ${r.name}`, detail: result.breakdown, total: result.total });
}

const TERM_RE = /([+-])\s*(\$[a-z][a-z0-9_.]*|\d+(?:\.\d+)?)/gi;

/** Fold a formula's flat tail against the sheet's vars, so the chip reads
 *  like a real character sheet: "1d20+$dex.mod+$prof" → "+5",
 *  "1d8+$str.mod" → "1d8+2" (owner review 2026-07-18: the number IS the
 *  sheet). Null when the tail isn't a flat sum we can resolve — the chip
 *  keeps its bare verb and the click still evaluates live. */
function foldedSuffix(formula: string, vars: Record<string, number>): string | null {
  const m = /^\s*(\d*d\d+(?:dl\d+|kh\d+|kl\d+)?)\s*(.*)$/i.exec(formula);
  const head = m ? m[1]!.toLowerCase() : '';
  let tail = m ? (m[2] ?? '') : formula;
  if (/d\d/i.test(tail)) return null; // extra dice — not a flat bonus
  // a headless flat formula ("1+$str.mod", unarmed damage) — sign its first term
  if (!head) {
    tail = tail.trim();
    if (!tail) return null;
    if (!/^[+-]/.test(tail)) tail = `+${tail}`;
  }
  if (tail.replace(TERM_RE, '').trim() !== '') return null; // junk we can't fold
  let bonus = 0;
  TERM_RE.lastIndex = 0;
  let t: RegExpExecArray | null;
  while ((t = TERM_RE.exec(tail)) !== null) {
    const raw = t[2]!;
    const v = raw.startsWith('$') ? vars[raw.slice(1).toLowerCase()] : Number(raw);
    if (v === undefined || Number.isNaN(v)) return null;
    bonus += t[1] === '-' ? -v : v;
  }
  if (!head) return String(bonus); // flat damage → the number itself
  if (head === '1d20' || head === 'd20') return fmtMod(bonus);
  return bonus === 0 ? head : `${head}${fmtMod(bonus)}`;
}

function rollButton(item: ActionItem, r: ActionRoll, ctx: RenderCtx | EditCtx): DocumentFragment {
  const frag = document.createDocumentFragment();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chip chip-action';
  const folded = foldedSuffix(r.formula, ctx.vars?.() ?? {});
  btn.textContent = folded ? `${r.name} ${folded}` : r.name;
  btn.title = `Roll ${r.formula}`;
  const out = document.createElement('span');
  out.className = 'chip-result';
  btn.addEventListener('click', () => {
    doRoll(item, r, ctx, out).catch((err) => {
      out.textContent = ' ⚠';
      out.title = err instanceof Error ? err.message : 'roll failed';
    });
  });
  frag.append(btn, out);
  return frag;
}

function render(block: ActionsBlock, ctx: RenderCtx | EditCtx, editable: boolean): HTMLElement {
  const el = blockRoot('actions');
  const edit = editable ? (ctx as EditCtx) : undefined;
  if (block.title !== undefined || editable) {
    const b = document.createElement('b');
    b.className = 'b-label';
    if (edit) editableText(b, edit, () => block.title ?? '', (v) => (block.title = v));
    else b.textContent = block.title ?? '';
    el.appendChild(b);
  }
  const rows = document.createElement('div');
  rows.className = 'action-rows';
  block.items.forEach((item, i) => {
    const row = document.createElement('p');
    row.className = 'action-row';
    const label = document.createElement('b');
    if (edit) editableText(label, edit, () => item.label, (v) => (item.label = v));
    else label.textContent = item.label;
    row.appendChild(label);
    if (item.note !== undefined) {
      const note = document.createElement('i');
      note.className = 'action-note';
      if (edit) editableText(note, edit, () => item.note ?? '', (v) => (item.note = v));
      else note.textContent = item.note;
      row.append(' ', note);
    }
    for (const r of item.rolls) {
      row.append(' ');
      if (edit) {
        const name = document.createElement('span');
        name.className = 'action-roll-name';
        editableText(name, edit, () => r.name, (v) => (r.name = v));
        const code = document.createElement('code');
        editableText(code, edit, () => r.formula, (v) => (r.formula = v.trim()));
        row.append(name, ' ', code);
      } else {
        row.appendChild(rollButton(item, r, ctx));
      }
    }
    if (edit) {
      row.appendChild(
        mini('✕', 'Remove action', () => {
          edit.execute({
            label: 'remove action',
            apply: () => {
              const at = block.items.indexOf(item);
              if (at >= 0) block.items.splice(at, 1);
            },
            revert: () => block.items.splice(i, 0, item),
          });
        }),
      );
    }
    rows.appendChild(row);
  });
  el.appendChild(rows);
  if (edit) {
    el.appendChild(
      mini('＋ action', 'Add action', () => {
        const item: ActionItem = { label: 'New action', rolls: [{ name: 'roll', formula: '1d20' }] };
        edit.execute({
          label: 'add action',
          apply: () => block.items.push(item),
          revert: () => {
            const at = block.items.indexOf(item);
            if (at >= 0) block.items.splice(at, 1);
          },
        });
      }),
    );
  }
  return el;
}

export const actionsDef: BlockDef<ActionsBlock> = {
  type: 'actions',
  renderStatic: (block, ctx) => render(block, ctx, false),
  renderEditable: (block, ctx) => render(block, ctx, ctx.mode === 'edit'),
  toMarkdown: (block) => {
    const lines = block.title ? [`**${block.title}**`] : [];
    for (const item of block.items) {
      const rolls = item.rolls.map((r) => `${r.name} \`${r.formula}\``).join(', ');
      lines.push(`- **${item.label}**${item.note ? ` (*${item.note}*)` : ''} — ${rolls}`);
    }
    return lines.join('\n');
  },
};
