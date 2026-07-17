import type { KeyValueBlock } from '../types.ts';
import type { BlockDef } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';
import { renderInlineText } from '../inline.ts';

export const keyValueDef: BlockDef<KeyValueBlock> = {
  type: 'keyValue',

  renderStatic(block) {
    const el = blockRoot('keyValue');
    for (const pair of block.pairs) {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.className = 'b-label';
      b.textContent = `${pair.key}. `;
      p.append(b, renderInlineText(pair.value));
      el.appendChild(p);
    }
    return el;
  },

  renderEditable(block, ctx) {
    const el = blockRoot('keyValue');
    block.pairs.forEach((pair, i) => {
      const p = document.createElement('p');
      const b = document.createElement('b');
      b.className = 'block-label';
      editableText(b, ctx, () => pair.key, (v) => (pair.key = v));
      const span = document.createElement('span');
      editableText(span, ctx, () => pair.value, (v) => (pair.value = v));
      p.append(b, '. ', span, mini('✕', 'Remove field', () => {
        ctx.execute({
          label: 'remove field',
          apply: () => {
            const at = block.pairs.indexOf(pair);
            if (at >= 0) block.pairs.splice(at, 1);
          },
          revert: () => block.pairs.splice(i, 0, pair),
        });
      }));
      el.appendChild(p);
    });
    el.appendChild(mini('＋ field', 'Add field', () => {
      const pair = { key: 'Field', value: '…' };
      ctx.execute({
        label: 'add field',
        apply: () => block.pairs.push(pair),
        revert: () => {
          const at = block.pairs.indexOf(pair);
          if (at >= 0) block.pairs.splice(at, 1);
        },
      });
    }));
    return el;
  },

  toMarkdown(block) {
    return block.pairs.map((p) => `- **${p.key}:** ${p.value}`).join('\n');
  },
};
