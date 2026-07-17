// Columns block (docs/sheets/PLAN.md §10): the two-column book layout as a
// block that HOLDS blocks. Children render through ctx.renderChild, so every
// child type works in a column exactly as it does at the top level — edit,
// play, print, thumbnails. The sheet toolbar's "＋ Columns" wraps the last
// blocks on the page; inside, children can be added, removed, and pushed
// between columns.

import type { Block, ColumnsBlock, ParagraphBlock } from '../types.ts';
import type { BlockDef, EditCtx } from '../blockKit.ts';
import { blockRoot, mini } from '../blockKit.ts';

function colWrap(count: number): string {
  return `cols-${Math.min(count, 3)}`;
}

export const columnsDef: BlockDef<ColumnsBlock> = {
  type: 'columns',

  renderStatic(block, ctx) {
    const el = blockRoot('columns');
    el.classList.add(colWrap(block.columns.length));
    for (const column of block.columns) {
      const col = document.createElement('div');
      col.className = 'col';
      for (const child of column) col.appendChild(ctx.renderChild(child));
      el.appendChild(col);
    }
    return el;
  },

  renderEditable(block, ctx) {
    const el = blockRoot('columns');
    el.classList.add(colWrap(block.columns.length));
    block.columns.forEach((column, ci) => {
      const col = document.createElement('div');
      col.className = 'col';
      column.forEach((child, i) => {
        const wrap = document.createElement('div');
        wrap.className = 'col-child';
        wrap.appendChild(ctx.renderChild(child));
        const tools = document.createElement('p');
        tools.className = 'col-tools no-print';
        tools.append(
          mini('⇄', 'Move to the next column', () => {
            const to = (ci + 1) % block.columns.length;
            ctx.execute({
              label: 'move between columns',
              apply: () => {
                const at = block.columns[ci]!.indexOf(child);
                if (at >= 0) {
                  block.columns[ci]!.splice(at, 1);
                  block.columns[to]!.push(child);
                }
              },
              revert: () => {
                const at = block.columns[to]!.indexOf(child);
                if (at >= 0) {
                  block.columns[to]!.splice(at, 1);
                  block.columns[ci]!.splice(i, 0, child);
                }
              },
            });
          }),
          mini('✕', 'Remove from this column', () => {
            ctx.execute({
              label: 'remove column child',
              apply: () => {
                const at = block.columns[ci]!.indexOf(child);
                if (at >= 0) block.columns[ci]!.splice(at, 1);
              },
              revert: () => block.columns[ci]!.splice(i, 0, child),
            });
          }),
        );
        wrap.appendChild(tools);
        col.appendChild(wrap);
      });
      const add = document.createElement('p');
      add.className = 'col-add no-print';
      add.append(
        mini('＋ note', 'Add a note to this column', () => {
          const note: ParagraphBlock = { type: 'paragraph', text: '' };
          ctx.execute({
            label: 'add column note',
            apply: () => block.columns[ci]!.push(note),
            revert: () => {
              const at = block.columns[ci]!.indexOf(note);
              if (at >= 0) block.columns[ci]!.splice(at, 1);
            },
          });
        }),
      );
      col.appendChild(add);
      el.appendChild(col);
    });
    return el;
  },

  toMarkdown(block, md) {
    // Markdown is linear — columns flatten left to right
    return block.columns
      .map((column) => column.map(md).filter(Boolean).join('\n\n'))
      .filter(Boolean)
      .join('\n\n');
  },
};

/** Wrap the given blocks into a fresh two-column block, split evenly —
 *  the sheet toolbar's "＋ Columns" (needs the page's list, so it lives
 *  there; the shape lives here with its block). */
export function columnsOf(blocks: Block[]): ColumnsBlock {
  const mid = Math.ceil(blocks.length / 2);
  return { type: 'columns', columns: [blocks.slice(0, mid), blocks.slice(mid)] };
}
