// Proficiency grid (owner ask 2026-07-18): saving throws and skills as small
// clickable cards. The bonus on the face reads LIVE from the sheet's vars
// ($str.mod, $prof) — raise a score and every card updates. SRD 5.1 rules:
// proficiency adds $prof to the check; Expertise doubles it ("your
// proficiency bonus is doubled for any ability check you make that uses the
// chosen proficiency"). Outside edit mode a card is a roll button; in edit
// mode it wears the two flags as checkboxes instead (expertise implies
// proficiency — ticking one keeps the other legal). layout 'byAbility'
// groups cards under their governing ability — the six-column skills table;
// 'row' is the flat six-card strip of saving throws.

import type { ProfGridBlock } from '../types.ts';
import type { BlockDef, EditCtx, RenderCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';
import { fmtMod } from '../vars.ts';
import { randomSeed } from '../rng.ts';
import { pushRoll } from '../rollLog.ts';

type ProfItem = ProfGridBlock['items'][number];

const ABILITY_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/** 'expertise' beats 'proficiency'; '' when neither. The card text the owner
 *  asked for — the tier is spelled out beside the ability. */
function tierOf(item: ProfItem): '' | 'proficiency' | 'expertise' {
  return item.expertise ? 'expertise' : item.prof ? 'proficiency' : '';
}

function formulaOf(item: ProfItem): string {
  const tier = tierOf(item);
  return `1d20+$${item.ability}.mod${tier === 'expertise' ? '+$prof+$prof' : tier === 'proficiency' ? '+$prof' : ''}`;
}

/** The folded bonus for the card face; null when the sheet has no
 *  $<ability>.mod to read (a grid outside a character sheet). */
function bonusOf(item: ProfItem, vars: Record<string, number>): number | null {
  const mod = vars[`${item.ability}.mod`];
  if (mod === undefined) return null;
  const prof = vars['prof'] ?? 0;
  const tier = tierOf(item);
  return mod + (tier === 'expertise' ? 2 * prof : tier === 'proficiency' ? prof : 0);
}

async function doRoll(item: ProfItem, ctx: RenderCtx | EditCtx, kind: string): Promise<void> {
  const [{ roll }, { showRoll }] = await Promise.all([import('../dice.ts'), import('../diceStage.ts')]);
  const result = roll(formulaOf(item), randomSeed(), ctx.vars?.() ?? {});
  showRoll(result, `${item.name} ${kind}`);
  pushRoll({ label: `${item.name} ${kind}`, detail: result.breakdown, total: result.total });
}

/** One checkbox of the edit-mode pair. Expertise implies proficiency (SRD),
 *  so ticking expertise also sets prof, and clearing prof clears expertise —
 *  one undoable command either way. */
function flagBox(item: ProfItem, key: 'prof' | 'expertise', edit: EditCtx): HTMLLabelElement {
  const wrap = document.createElement('label');
  wrap.className = 'pg-flag no-print';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = !!item[key];
  box.setAttribute('aria-label', `${item.name}: ${key === 'prof' ? 'proficiency' : 'expertise'}`);
  box.addEventListener('change', () => {
    const next = box.checked;
    const prev = { prof: !!item.prof, expertise: !!item.expertise };
    const set = (v: { prof: boolean; expertise: boolean }) => {
      item.prof = v.prof || undefined;
      item.expertise = v.expertise || undefined;
    };
    edit.execute({
      label: key === 'prof' ? 'toggle proficiency' : 'toggle expertise',
      apply: () =>
        set(key === 'prof'
          ? { prof: next, expertise: next && prev.expertise }
          : { prof: prev.prof || next, expertise: next }),
      revert: () => set(prev),
    });
  });
  wrap.append(box, key === 'prof' ? 'prof' : 'expertise');
  return wrap;
}

function card(block: ProfGridBlock, item: ProfItem, ctx: RenderCtx | EditCtx, editable: boolean): HTMLElement {
  const kind = block.layout === 'row' ? 'save' : 'check';
  const el = document.createElement(editable ? 'div' : 'button');
  const tier = tierOf(item);
  el.className = `pg-card${tier === 'expertise' ? ' pg-exp' : tier === 'proficiency' ? ' pg-prof' : ''}`;
  if (el instanceof HTMLButtonElement) {
    el.type = 'button';
    el.title = `Roll ${item.name} ${kind} (${formulaOf(item)})`;
    el.addEventListener('click', () => {
      doRoll(item, ctx, kind).catch((err) => {
        el.title = err instanceof Error ? err.message : 'roll failed';
        el.classList.add('pg-error');
      });
    });
  }

  const name = document.createElement('span');
  name.className = 'pg-name';
  const bonus = document.createElement('span');
  bonus.className = 'pg-bonus';
  const b = bonusOf(item, ctx.vars?.() ?? {});
  bonus.textContent = b === null ? '—' : fmtMod(b);
  const sub = document.createElement('span');
  sub.className = 'pg-sub';
  sub.textContent = `${item.ability.toUpperCase()}${tier ? ` · ${tier}` : ''}`;
  if (tier) {
    const badge = document.createElement('span');
    badge.className = 'pg-badge';
    badge.textContent = tier === 'expertise' ? '◆' : '●';
    badge.title = tier;
    el.appendChild(badge);
  }

  if (editable) {
    const edit = ctx as EditCtx;
    editableText(name, edit, () => item.name, (v) => (item.name = v));
    el.append(name, bonus, sub);
    const flags = document.createElement('span');
    flags.className = 'pg-flags';
    flags.append(flagBox(item, 'prof', edit), flagBox(item, 'expertise', edit));
    el.appendChild(flags);
    el.appendChild(
      mini('✕', 'Remove entry', () => {
        const at = block.items.indexOf(item);
        edit.execute({
          label: 'remove entry',
          apply: () => {
            const i = block.items.indexOf(item);
            if (i >= 0) block.items.splice(i, 1);
          },
          revert: () => block.items.splice(at, 0, item),
        });
      }),
    );
  } else {
    name.textContent = item.name;
    el.append(name, bonus, sub);
  }
  return el;
}

function render(block: ProfGridBlock, ctx: RenderCtx | EditCtx, editable: boolean): HTMLElement {
  const el = blockRoot('profGrid');
  const edit = editable ? (ctx as EditCtx) : undefined;
  if (block.label !== undefined || editable) {
    const b = document.createElement('b');
    b.className = 'b-label';
    if (edit) editableText(b, edit, () => block.label ?? '', (v) => (block.label = v));
    else b.textContent = block.label ?? '';
    el.appendChild(b);
  }

  const grid = document.createElement('div');
  if (block.layout === 'byAbility') {
    // six ability columns, each headed by its ability; unknown abilities get
    // their own trailing column so a custom entry is never invisible
    grid.className = 'pg-grid pg-cols';
    const extras = [...new Set(block.items.map((i) => i.ability).filter((a) => !ABILITY_ORDER.includes(a)))];
    for (const ability of [...ABILITY_ORDER, ...extras]) {
      const col = document.createElement('div');
      col.className = 'pg-col';
      const head = document.createElement('span');
      head.className = 'pg-col-head';
      head.textContent = ability.toUpperCase();
      col.appendChild(head);
      const members = block.items.filter((i) => i.ability === ability);
      if (!members.length) {
        const dash = document.createElement('span');
        dash.className = 'pg-none';
        dash.textContent = '—';
        col.appendChild(dash);
      }
      for (const item of members) col.appendChild(card(block, item, ctx, editable));
      grid.appendChild(col);
    }
  } else {
    grid.className = 'pg-grid pg-row';
    for (const item of block.items) grid.appendChild(card(block, item, ctx, editable));
  }
  el.appendChild(grid);

  if (edit) {
    el.appendChild(
      mini('＋ entry', 'Add an entry', () => {
        const item: ProfItem = { name: 'New skill', ability: 'str' };
        edit.execute({
          label: 'add entry',
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

export const profGridDef: BlockDef<ProfGridBlock> = {
  type: 'profGrid',
  renderStatic: (block, ctx) => render(block, ctx, false),
  renderEditable: (block, ctx) => render(block, ctx, ctx.mode === 'edit'),
  toMarkdown: (block) => {
    const lines = block.label ? [`**${block.label}**`] : [];
    for (const item of block.items) {
      const tier = tierOf(item);
      lines.push(`- **${item.name}** (${item.ability.toUpperCase()})${tier ? ` — ${tier}` : ''}`);
    }
    return lines.join('\n');
  },
};
