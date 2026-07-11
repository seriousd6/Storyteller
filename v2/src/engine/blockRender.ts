// Read-only DOM rendering for typed blocks — used by the composite preview
// (and anywhere else a non-editable sheet-style view is needed). The Sheet
// Builder has its own editable renderer.

import type { Block } from './types.ts';

export function renderBlockStatic(block: Block): HTMLElement {
  const el = document.createElement('div');
  el.className = `b b-${block.type}`;
  switch (block.type) {
    case 'title': {
      const h = document.createElement('h2');
      h.textContent = block.text;
      el.appendChild(h);
      if (block.subtitle) {
        const i = document.createElement('i');
        i.textContent = block.subtitle;
        el.appendChild(i);
      }
      break;
    }
    case 'paragraph': {
      const p = document.createElement('p');
      if (block.label) {
        const b = document.createElement('b');
        b.className = 'b-label';
        b.textContent = `${block.label}. `;
        p.appendChild(b);
      }
      p.appendChild(document.createTextNode(block.text));
      el.appendChild(p);
      break;
    }
    case 'keyValue': {
      for (const pair of block.pairs) {
        const p = document.createElement('p');
        const b = document.createElement('b');
        b.className = 'b-label';
        b.textContent = `${pair.key}. `;
        p.append(b, pair.value);
        el.appendChild(p);
      }
      break;
    }
    case 'list': {
      if (block.label) {
        const b = document.createElement('b');
        b.className = 'b-label';
        b.textContent = block.label;
        el.appendChild(b);
      }
      const list = document.createElement(block.ordered ? 'ol' : 'ul');
      for (const item of block.items) {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      }
      el.appendChild(list);
      break;
    }
    case 'table': {
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
      break;
    }
    case 'statblock': {
      const h = document.createElement('h3');
      h.textContent = block.name;
      el.appendChild(h);
      if (block.meta) {
        const i = document.createElement('i');
        i.textContent = block.meta;
        el.appendChild(i);
      }
      const rule = document.createElement('div');
      rule.className = 'b-rule';
      el.appendChild(rule);
      for (const section of block.sections) el.appendChild(renderBlockStatic(section));
      break;
    }
  }
  return el;
}
