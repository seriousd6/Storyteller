// Page break (docs/sheets/PLAN.md §6): a dashed rule on screen, a real page
// boundary in print (CSS in global.css). Homebrewery's \page, as a block.

import type { PageBreakBlock } from '../types.ts';
import type { BlockDef } from '../blockKit.ts';
import { blockRoot } from '../blockKit.ts';

function render(): HTMLElement {
  const el = blockRoot('pageBreak');
  const label = document.createElement('span');
  label.className = 'no-print';
  label.textContent = '✂ page break';
  el.appendChild(label);
  return el;
}

export const pageBreakDef: BlockDef<PageBreakBlock> = {
  type: 'pageBreak',
  renderStatic: () => render(),
  renderEditable: () => render(),
  toMarkdown: () => '---',
};
