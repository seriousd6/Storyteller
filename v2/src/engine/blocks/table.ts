import type { TableBlock } from '../types.ts';
import type { BlockDef } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';

export const tableDef: BlockDef<TableBlock> = {
  type: 'table',

  renderStatic(block) {
    const el = blockRoot('table');
    const table = document.createElement('table');
    const head = document.createElement('tr');
    for (const c of block.columns) {
      const th = document.createElement('th');
      th.textContent = c;
      head.appendChild(th);
    }
    table.appendChild(head);
    for (const row of block.rows) {
      const tr = document.createElement('tr');
      for (const cell of row) {
        const td = document.createElement('td');
        td.textContent = cell;
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    el.appendChild(table);
    return el;
  },

  renderEditable(block, ctx) {
    const el = blockRoot('table');
    const table = document.createElement('table');
    const head = document.createElement('tr');
    block.columns.forEach((_, i) => {
      const th = document.createElement('th');
      editableText(th, ctx, () => block.columns[i] ?? '', (v) => (block.columns[i] = v));
      head.appendChild(th);
    });
    const headTools = document.createElement('th');
    headTools.className = 'row-tools no-print';
    head.appendChild(headTools);
    table.appendChild(head);
    block.rows.forEach((row, r) => {
      const tr = document.createElement('tr');
      row.forEach((_, i) => {
        const td = document.createElement('td');
        editableText(td, ctx, () => row[i] ?? '', (v) => (row[i] = v));
        tr.appendChild(td);
      });
      const tools = document.createElement('td');
      tools.className = 'row-tools no-print';
      tools.appendChild(mini('✕', 'Remove row', () => {
        ctx.execute({
          label: 'remove row',
          apply: () => {
            const at = block.rows.indexOf(row);
            if (at >= 0) block.rows.splice(at, 1);
          },
          revert: () => block.rows.splice(r, 0, row),
        });
      }));
      tr.appendChild(tools);
      table.appendChild(tr);
    });
    el.appendChild(table);
    el.appendChild(mini('＋ row', 'Add row', () => {
      const row = block.columns.map(() => '…');
      ctx.execute({
        label: 'add row',
        apply: () => block.rows.push(row),
        revert: () => {
          const at = block.rows.indexOf(row);
          if (at >= 0) block.rows.splice(at, 1);
        },
      });
    }));
    return el;
  },

  toMarkdown(block) {
    // A cell's own "|" would open a phantom column and a newline would break
    // the row — both silently corrupt the table. Escape the pipe, flatten
    // newlines. (Only tables are delimiter-sensitive; prose blocks are fine.)
    const cell = (s: string) => String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
    const header = `| ${block.columns.map(cell).join(' | ')} |`;
    const rule = `| ${block.columns.map(() => '---').join(' | ')} |`;
    const rows = block.rows.map((r) => `| ${r.map(cell).join(' | ')} |`);
    return [block.label ? `**${block.label}**` : null, header, rule, ...rows].filter(Boolean).join('\n');
  },
};
