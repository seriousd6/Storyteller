// The flagship live block (docs/sheets/PLAN.md §6): a site roll table
// embedded in a sheet as a working widget. Rolls go through the real engine
// (nested {table:} refs and all) via the lazy loader; every kept result
// carries its seed, so it is re-derivable and pin-provenanced.

import type { RollTableBlock, RollTableResult } from '../types.ts';
import type { BlockDef, EditCtx, RenderCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';
import { randomSeed } from '../rng.ts';
import { pushRoll } from '../rollLog.ts';

const DEFAULT_KEEP = 5;

function labelOf(block: RollTableBlock): string {
  return block.title || (block.ref.split('/').pop() ?? block.ref);
}

async function rollOnce(block: RollTableBlock): Promise<RollTableResult> {
  const [{ loadClosure }, { renderTemplate }] = await Promise.all([
    import('../tableLoader.ts'),
    import('../roll.ts'),
  ]);
  const registry = await loadClosure([block.ref]);
  const seed = randomSeed();
  const text = renderTemplate(`{table:${block.ref}}`, registry, seed);
  pushRoll({ label: labelOf(block), detail: text });
  return { text, seed };
}

function renderResults(list: HTMLOListElement, block: RollTableBlock, edit?: EditCtx): void {
  list.replaceChildren(
    ...(block.results ?? []).map((r, i) => {
      const li = document.createElement('li');
      li.textContent = r.text;
      li.title = `seed ${r.seed}`;
      if (edit && edit.mode === 'edit') {
        li.appendChild(
          mini('✕', 'Remove result', () => {
            edit.execute({
              label: 'remove result',
              apply: () => {
                const at = block.results?.indexOf(r) ?? -1;
                if (at >= 0) block.results!.splice(at, 1);
              },
              revert: () => (block.results ??= []).splice(i, 0, r),
            });
          }),
        );
      }
      return li;
    }),
  );
}

/** Roll and keep the result. With an EditCtx the roll is a persisted,
 *  undoable command; on a bare static surface (composite preview, world
 *  page) it updates the DOM only. */
async function rollAndKeep(block: RollTableBlock, list: HTMLOListElement, edit?: EditCtx): Promise<void> {
  const result = await rollOnce(block);
  const cap = block.keep ?? DEFAULT_KEEP;
  if (edit) {
    edit.execute({
      label: 'roll table',
      apply: () => {
        (block.results ??= []).unshift(result);
        block.results.length = Math.min(block.results.length, cap);
      },
      revert: () => {
        const at = block.results?.indexOf(result) ?? -1;
        if (at >= 0) block.results!.splice(at, 1);
      },
    });
  } else {
    const li = document.createElement('li');
    li.textContent = result.text;
    list.prepend(li);
    while (list.children.length > cap) list.lastElementChild!.remove();
  }
}

function rollButton(block: RollTableBlock, list: HTMLOListElement, edit?: EditCtx): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn rt-roll no-print';
  btn.textContent = '🎲 Roll';
  btn.setAttribute('aria-label', `Roll on ${labelOf(block)}`);
  btn.addEventListener('click', () => {
    btn.disabled = true;
    rollAndKeep(block, list, edit)
      .catch((err) => {
        const li = document.createElement('li');
        li.textContent = `⚠ ${err instanceof Error ? err.message : 'roll failed'}`;
        list.prepend(li);
      })
      .finally(() => (btn.disabled = false));
  });
  return btn;
}

/** display:'full' — fill the listing with the table's own entries; each row
 *  click forces that entry as a kept result (its sub-refs still roll). */
async function fillListing(listing: HTMLElement, block: RollTableBlock, list: HTMLOListElement, edit?: EditCtx): Promise<void> {
  try {
    const [{ loadClosure }, { renderTemplate }] = await Promise.all([
      import('../tableLoader.ts'),
      import('../roll.ts'),
    ]);
    const registry = await loadClosure([block.ref]);
    const table = registry.get(block.ref);
    if (!table) return;
    const ol = document.createElement('ol');
    ol.className = 'rt-entries';
    for (const entry of table.entries) {
      const text = typeof entry === 'string' ? entry : entry.text;
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rt-entry';
      btn.textContent = text;
      btn.title = 'Force this result';
      btn.addEventListener('click', () => {
        const seed = randomSeed();
        const resolved = renderTemplate(text, registry, seed);
        pushRoll({ label: labelOf(block), detail: resolved });
        const result: RollTableResult = { text: resolved, seed };
        const cap = block.keep ?? DEFAULT_KEEP;
        if (edit) {
          edit.execute({
            label: 'force result',
            apply: () => {
              (block.results ??= []).unshift(result);
              block.results.length = Math.min(block.results.length, cap);
            },
            revert: () => {
              const at = block.results?.indexOf(result) ?? -1;
              if (at >= 0) block.results!.splice(at, 1);
            },
          });
        } else {
          const out = document.createElement('li');
          out.textContent = resolved;
          list.prepend(out);
        }
      });
      li.appendChild(btn);
      ol.appendChild(li);
    }
    listing.replaceChildren(ol);
  } catch (err) {
    listing.textContent = `⚠ ${err instanceof Error ? err.message : 'could not load table'}`;
  }
}

function renderWidget(block: RollTableBlock, edit?: EditCtx): HTMLElement {
  const el = blockRoot('rollTable');
  const head = document.createElement('p');
  const b = document.createElement('b');
  b.className = 'block-label';
  if (edit && edit.mode === 'edit') {
    editableText(b, edit, () => block.title ?? '', (v) => (block.title = v));
    if (!block.title) b.textContent = labelOf(block);
  } else {
    b.textContent = labelOf(block);
  }
  head.appendChild(b);

  const list = document.createElement('ol');
  list.className = 'rt-results';
  head.appendChild(rollButton(block, list, edit));

  if (edit && edit.mode === 'edit') {
    const ref = document.createElement('code');
    ref.className = 'rt-ref no-print';
    editableText(ref, edit, () => block.ref, (v) => (block.ref = v.trim()));
    head.appendChild(ref);
  }

  el.appendChild(head);
  el.appendChild(list);
  renderResults(list, block, edit);

  if (block.display === 'full') {
    const listing = document.createElement('div');
    listing.className = 'rt-listing';
    listing.textContent = '…';
    el.appendChild(listing);
    void fillListing(listing, block, list, edit);
  }
  return el;
}

export const rollTableDef: BlockDef<RollTableBlock> = {
  type: 'rollTable',

  renderStatic(block, ctx: RenderCtx) {
    return renderWidget(block, ctx.edit);
  },

  renderEditable(block, ctx: EditCtx) {
    return renderWidget(block, ctx);
  },

  toMarkdown(block) {
    const lines = [`**${labelOf(block)}** — roll on \`${block.ref}\``];
    for (const r of block.results ?? []) lines.push(`- ${r.text}`);
    return lines.join('\n');
  },
};
