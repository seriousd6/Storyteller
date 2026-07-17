import type { TitleBlock } from '../types.ts';
import type { BlockDef } from '../blockKit.ts';
import { blockRoot, editableText } from '../blockKit.ts';

export const titleDef: BlockDef<TitleBlock> = {
  type: 'title',

  renderStatic(block) {
    const el = blockRoot('title');
    const h = document.createElement('h2');
    h.textContent = block.text;
    el.appendChild(h);
    if (block.subtitle) {
      const i = document.createElement('i');
      i.textContent = block.subtitle;
      el.appendChild(i);
    }
    return el;
  },

  renderEditable(block, ctx) {
    const el = blockRoot('title');
    const h = document.createElement('h2');
    editableText(h, ctx, () => block.text, (v) => (block.text = v));
    el.appendChild(h);
    return el;
  },

  toMarkdown(block) {
    return `## ${block.text}${block.subtitle ? `\n*${block.subtitle}*` : ''}`;
  },
};
