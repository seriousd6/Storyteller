import type { ParagraphBlock } from '../types.ts';
import type { BlockDef } from '../blockKit.ts';
import { blockRoot, editableText } from '../blockKit.ts';
import { renderInlineText } from '../inline.ts';

export const paragraphDef: BlockDef<ParagraphBlock> = {
  type: 'paragraph',

  renderStatic(block) {
    const el = blockRoot('paragraph');
    const p = document.createElement('p');
    if (block.label) {
      const b = document.createElement('b');
      b.className = 'b-label';
      b.textContent = `${block.label}. `;
      p.appendChild(b);
    }
    p.appendChild(renderInlineText(block.text));
    el.appendChild(p);
    return el;
  },

  renderEditable(block, ctx) {
    const el = blockRoot('paragraph');
    const p = document.createElement('p');
    if (block.label !== undefined) {
      const b = document.createElement('b');
      b.className = 'block-label';
      editableText(b, ctx, () => block.label ?? '', (v) => (block.label = v));
      p.append(b, ' ');
    }
    const span = document.createElement('span');
    editableText(span, ctx, () => block.text, (v) => (block.text = v));
    p.appendChild(span);
    el.appendChild(p);
    return el;
  },

  toMarkdown(block) {
    return block.label ? `**${block.label}.** ${block.text}` : block.text;
  },
};
