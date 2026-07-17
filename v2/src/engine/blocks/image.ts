// Image block (docs/sheets/PLAN.md §14): the character portrait, the shop
// front, the handout art. References a content-hashed asset (assetStore) —
// the block itself stays tiny JSON. Layouts float text around the image the
// way character sheets and Homebrewery pages do. Fades/masks arrive with
// the genre packs (Phase 5); this is upload + caption + layout.

import type { ImageBlock } from '../types.ts';
import type { BlockDef, EditCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';

const LAYOUTS: NonNullable<ImageBlock['layout']>[] = ['float-right', 'float-left', 'block'];

function mountImage(figure: HTMLElement, block: ImageBlock): void {
  if (!block.assetId) return;
  const img = document.createElement('img');
  img.alt = block.caption ?? 'uploaded image';
  figure.prepend(img);
  void import('../assetStore.ts').then(async ({ getAssetUrl }) => {
    const url = await getAssetUrl(block.assetId!);
    if (url) img.src = url;
    else {
      // the sheet traveled to a device the image bytes never reached
      img.remove();
      const gap = document.createElement('p');
      gap.className = 'img-missing';
      gap.textContent = '⚠ image not on this device';
      figure.prepend(gap);
    }
  });
}

function setAsset(block: ImageBlock, next: string | undefined, ctx: EditCtx): void {
  const prev = block.assetId;
  ctx.execute({
    label: next ? 'set image' : 'remove image',
    apply: () => (block.assetId = next),
    revert: () => (block.assetId = prev),
  });
}

function uploadButton(block: ImageBlock, ctx: EditCtx, label: string): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'btn img-upload no-print';
  wrap.textContent = label;
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.hidden = true;
  input.setAttribute('aria-label', label);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (!file) return;
    void import('../assetStore.ts').then(async ({ putAssetFromFile }) => {
      try {
        const meta = await putAssetFromFile(file);
        setAsset(block, meta.id, ctx);
      } catch (err) {
        alert(err instanceof Error ? err.message : 'That image could not be read.');
      }
    });
  });
  wrap.appendChild(input);
  return wrap;
}

export const imageDef: BlockDef<ImageBlock> = {
  type: 'image',

  renderStatic(block) {
    const el = blockRoot('image');
    el.classList.add(`img-${block.layout ?? 'block'}`);
    if (!block.assetId) {
      el.hidden = true; // an empty slot is edit-mode furniture, not content
      return el;
    }
    const figure = document.createElement('figure');
    mountImage(figure, block);
    if (block.caption) {
      const cap = document.createElement('figcaption');
      cap.textContent = block.caption;
      figure.appendChild(cap);
    }
    el.appendChild(figure);
    return el;
  },

  renderEditable(block, ctx) {
    const el = blockRoot('image');
    el.classList.add(`img-${block.layout ?? 'block'}`);
    const figure = document.createElement('figure');
    if (block.assetId) {
      mountImage(figure, block);
      const cap = document.createElement('figcaption');
      editableText(cap, ctx, () => block.caption ?? '', (v) => (block.caption = v));
      if (!block.caption) cap.dataset.placeholder = 'caption…';
      figure.appendChild(cap);
      const tools = document.createElement('p');
      tools.className = 'img-tools no-print';
      tools.append(
        uploadButton(block, ctx, '⇄ Replace'),
        ' ',
        mini('⇋ layout', 'Cycle layout (right / left / full width)', () => {
          const current = block.layout ?? 'block';
          const next = LAYOUTS[(LAYOUTS.indexOf(current) + 1) % LAYOUTS.length]!;
          ctx.execute({
            label: 'image layout',
            apply: () => (block.layout = next),
            revert: () => (block.layout = current),
          });
        }),
        mini('✕ image', 'Remove the image (keeps the block)', () => setAsset(block, undefined, ctx)),
      );
      figure.appendChild(tools);
    } else {
      const empty = document.createElement('p');
      empty.className = 'img-empty no-print';
      empty.append('No image yet — ', uploadButton(block, ctx, '⬆ Upload an image'));
      figure.appendChild(empty);
    }
    el.appendChild(figure);
    return el;
  },

  toMarkdown(block) {
    if (!block.assetId) return '';
    return `*[image${block.caption ? `: ${block.caption}` : ''}]*`;
  },
};
