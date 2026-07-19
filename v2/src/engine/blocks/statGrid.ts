// Stat grid (PLAN.md §6): the classic attribute strip. `computeMods` fills
// the d20 (v-10)/2 line; `rollable` turns each box into a check button —
// tap STR, the dice stage rolls 1d20+$str.mod. Zero per-sheet configuration:
// the var scope (engine/vars.ts) supplies the modifiers. A stat may carry
// its own `roll` formula — then THAT box rolls even in a non-rollable grid
// (Initiative beside a static AC and Speed). `title` heads the strip and
// `compact` shrinks the boxes (owner ask 2026-07-18: smaller stats, in
// their own titled sections).

import type { StatGridBlock } from '../types.ts';
import type { BlockDef, EditCtx, RenderCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';
import { slugify, modOf, fmtMod } from '../vars.ts';
import { randomSeed } from '../rng.ts';
import { pushRoll } from '../rollLog.ts';

function subLine(block: StatGridBlock, stat: StatGridBlock['stats'][number]): string {
  if (stat.sub) return stat.sub;
  const v = Number(stat.value);
  return block.computeMods && !Number.isNaN(v) ? fmtMod(modOf(v)) : '';
}

async function rollCheck(block: StatGridBlock, stat: StatGridBlock['stats'][number], ctx: RenderCtx | EditCtx): Promise<void> {
  const slug = slugify(stat.label);
  const formula = stat.roll ?? (block.computeMods ? `1d20+$${slug}.mod` : `1d20+$${slug}`);
  const [{ roll }, { showRoll }] = await Promise.all([import('../dice.ts'), import('../diceStage.ts')]);
  const result = roll(formula, randomSeed(), ctx.vars?.() ?? {});
  showRoll(result, `${stat.label} check`);
  pushRoll({ label: `${stat.label} check`, detail: result.breakdown, total: result.total });
}

function renderStrip(block: StatGridBlock, ctx: RenderCtx | EditCtx, editable: boolean): HTMLElement {
  const el = blockRoot('statGrid');
  if (block.compact) el.classList.add('sg-compact');
  if (block.title !== undefined || editable) {
    const b = document.createElement('b');
    b.className = 'b-label';
    if (editable) {
      editableText(b, ctx as EditCtx, () => block.title ?? '', (v) => (block.title = v));
    } else if (block.title) {
      b.textContent = block.title;
    }
    if (block.title || editable) el.appendChild(b);
  }
  const strip = document.createElement('div');
  strip.className = 'statgrid';
  block.stats.forEach((stat, i) => {
    const rollHere = (block.rollable || stat.roll !== undefined) && !editable;
    const box = document.createElement(rollHere ? 'button' : 'div');
    box.className = 'stat-box';
    if (box instanceof HTMLButtonElement) {
      box.type = 'button';
      box.title = `Roll ${stat.label} check`;
      box.addEventListener('click', () => {
        rollCheck(block, stat, ctx).catch((err) => {
          box.title = err instanceof Error ? err.message : 'roll failed';
          box.classList.add('stat-error');
        });
      });
    }
    const label = document.createElement('span');
    label.className = 'stat-label';
    const value = document.createElement('span');
    value.className = 'stat-value';
    const sub = document.createElement('span');
    sub.className = 'stat-sub';
    if (editable) {
      const edit = ctx as EditCtx;
      editableText(label, edit, () => stat.label, (v) => (stat.label = v));
      editableText(value, edit, () => stat.value, (v) => (stat.value = v));
      sub.textContent = subLine(block, stat);
      box.appendChild(
        mini('✕', 'Remove stat', () => {
          edit.execute({
            label: 'remove stat',
            apply: () => {
              const at = block.stats.indexOf(stat);
              if (at >= 0) block.stats.splice(at, 1);
            },
            revert: () => block.stats.splice(i, 0, stat),
          });
        }),
      );
    } else {
      label.textContent = stat.label;
      value.textContent = stat.value;
      sub.textContent = subLine(block, stat);
    }
    box.prepend(label, value, sub);
    strip.appendChild(box);
  });
  if (editable) {
    const edit = ctx as EditCtx;
    strip.appendChild(
      mini('＋ stat', 'Add stat', () => {
        const stat = { label: 'NEW', value: '10' };
        edit.execute({
          label: 'add stat',
          apply: () => block.stats.push(stat),
          revert: () => {
            const at = block.stats.indexOf(stat);
            if (at >= 0) block.stats.splice(at, 1);
          },
        });
      }),
    );
  }
  el.appendChild(strip);
  return el;
}

export const statGridDef: BlockDef<StatGridBlock> = {
  type: 'statGrid',
  renderStatic: (block, ctx) => renderStrip(block, ctx, false),
  renderEditable: (block, ctx) => renderStrip(block, ctx, ctx.mode === 'edit'),
  toMarkdown: (block) =>
    (block.title ? `**${block.title}:** ` : '') +
    block.stats
      .map((s) => {
        const sub = subLine(block, s);
        return `**${s.label}** ${s.value}${sub ? ` (${sub})` : ''}`;
      })
      .join(' · '),
};
