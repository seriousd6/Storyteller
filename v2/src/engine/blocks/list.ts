import type { ListBlock } from '../types.ts';
import type { BlockDef } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';
import { renderInlineText } from '../inline.ts';

export const listDef: BlockDef<ListBlock> = {
  type: 'list',

  renderStatic(block, ctx) {
    const el = blockRoot('list');
    if (block.label) {
      const b = document.createElement('b');
      b.className = 'b-label';
      b.textContent = block.label;
      el.appendChild(b);
    }
    const list = document.createElement(block.ordered ? 'ol' : 'ul');
    for (const item of block.items) {
      const li = document.createElement('li');
      li.appendChild(renderInlineText(item, ctx.vars));
      list.appendChild(li);
    }
    el.appendChild(list);
    return el;
  },

  renderEditable(block, ctx) {
    const el = blockRoot('list');
    if (block.label !== undefined) {
      const b = document.createElement('b');
      b.className = 'block-label';
      editableText(b, ctx, () => block.label ?? '', (v) => (block.label = v));
      el.appendChild(b);
    }
    const list = document.createElement(block.ordered ? 'ol' : 'ul');
    block.items.forEach((_, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      editableText(span, ctx, () => block.items[i] ?? '', (v) => (block.items[i] = v));
      li.append(span, mini('✕', 'Remove item', () => {
        const removed = block.items[i];
        ctx.execute({
          label: 'remove item',
          apply: () => block.items.splice(i, 1),
          revert: () => block.items.splice(i, 0, removed ?? ''),
        });
      }));
      list.appendChild(li);
    });
    el.appendChild(list);
    el.appendChild(mini('＋ item', 'Add item', () => {
      ctx.execute({
        label: 'add item',
        apply: () => block.items.push('…'),
        revert: () => block.items.pop(),
      });
    }));
    return el;
  },

  toMarkdown(block) {
    return (
      (block.label ? `**${block.label}**\n` : '') +
      block.items.map((item, i) => (block.ordered ? `${i + 1}. ${item}` : `- ${item}`)).join('\n')
    );
  },
};
