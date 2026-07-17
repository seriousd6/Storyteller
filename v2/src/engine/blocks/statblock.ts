import type { Block, StatblockBlock } from '../types.ts';
import type { BlockDef } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';

export const statblockDef: BlockDef<StatblockBlock> = {
  type: 'statblock',

  renderStatic(block, ctx) {
    const el = blockRoot('statblock');
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
    for (const section of block.sections) el.appendChild(ctx.renderChild(section));
    return el;
  },

  renderEditable(block, ctx) {
    const el = blockRoot('statblock');
    const h = document.createElement('h3');
    editableText(h, ctx, () => block.name, (v) => (block.name = v));
    el.appendChild(h);
    if (block.meta !== undefined) {
      const i = document.createElement('i');
      editableText(i, ctx, () => block.meta ?? '', (v) => (block.meta = v));
      el.appendChild(i);
    }
    const rule = document.createElement('div');
    rule.className = 'b-rule';
    el.appendChild(rule);
    block.sections.forEach((section, i) => {
      const sub = document.createElement('div');
      sub.className = 'sub';
      sub.append(ctx.renderChild(section), mini('✕', 'Remove section', () => {
        ctx.execute({
          label: 'remove section',
          apply: () => {
            const at = block.sections.indexOf(section);
            if (at >= 0) block.sections.splice(at, 1);
          },
          revert: () => block.sections.splice(i, 0, section),
        });
      }));
      el.appendChild(sub);
    });
    el.appendChild(mini('＋ note', 'Add a note section', () => {
      const section: Block = { type: 'paragraph', label: 'Note', text: 'Write here…' };
      ctx.execute({
        label: 'add section',
        apply: () => block.sections.push(section),
        revert: () => {
          const at = block.sections.indexOf(section);
          if (at >= 0) block.sections.splice(at, 1);
        },
      });
    }));
    return el;
  },

  toMarkdown(block, md) {
    return [`### ${block.name}`, block.meta ? `*${block.meta}*` : null, ...block.sections.map(md)]
      .filter(Boolean)
      .join('\n\n');
  },
};
