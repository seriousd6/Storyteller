// Image block (docs/sheets/PLAN.md §14): the character portrait, the shop
// front, the handout art. References a content-hashed asset (assetStore) —
// the block itself stays tiny JSON. Layouts float text around the image the
// way character sheets and Homebrewery pages do; fades apply a genre mask
// with mask-image, so the source pixels are never edited and every look is
// one undo away from gone.

import type { ImageBlock } from '../types.ts';
import type { BlockDef, EditCtx } from '../blockKit.ts';
import { blockRoot, editableText, mini } from '../blockKit.ts';
import { MASKS, maskById, genreAt } from '../genres.ts';

const LAYOUTS: NonNullable<ImageBlock['layout']>[] = ['float-right', 'float-left', 'block'];

/** Paint the block's fade/blend props onto the shell. Strength works as a
 *  two-layer mask: a uniform alpha floor of (1 − strength) unioned (`add`)
 *  with the grayscale mask — 1 is the full fade, 0 is no fade at all. */
function applyFade(shell: HTMLElement, block: ImageBlock): void {
  shell.className = 'img-shell';
  for (const prop of ['mask-image', '-webkit-mask-image', 'mask-composite', '-webkit-mask-composite']) {
    shell.style.removeProperty(prop);
  }
  if (block.blend === 'multiply') shell.classList.add('img-blend-multiply');
  const def = block.fade ? maskById(block.fade.mask) : undefined;
  if (!block.fade || !def) return;
  shell.classList.add('img-faded');
  if (block.fade.flip) shell.classList.add('img-flip');
  const floor = (1 - Math.max(0, Math.min(1, block.fade.strength))).toFixed(3);
  const layers = `linear-gradient(rgb(0 0 0 / ${floor}), rgb(0 0 0 / ${floor})), url("${def.url}")`;
  shell.style.setProperty('mask-image', layers);
  shell.style.setProperty('-webkit-mask-image', layers);
  shell.style.setProperty('mask-composite', 'add');
  shell.style.setProperty('-webkit-mask-composite', 'source-over');
}

/** figure > .img-shell (mask carrier) > img — shared by both renderers. */
function mountImage(figure: HTMLElement, block: ImageBlock): void {
  if (!block.assetId) return;
  const shell = document.createElement('div');
  applyFade(shell, block);
  const img = document.createElement('img');
  img.alt = block.caption ?? 'uploaded image';
  shell.appendChild(img);
  figure.prepend(shell);
  void import('../assetStore.ts').then(async ({ getAssetUrl }) => {
    const url = await getAssetUrl(block.assetId!);
    if (url) img.src = url;
    else {
      // the sheet traveled to a device the image bytes never reached
      shell.remove();
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

function setFade(block: ImageBlock, next: ImageBlock['fade'], ctx: EditCtx, label: string): void {
  const prev = block.fade;
  ctx.execute({
    label,
    apply: () => (block.fade = next),
    revert: () => (block.fade = prev),
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

/** The fade picker (§14): cycles none → the ACTIVE genre's three masks —
 *  a pinned horror sheet offers decay/smoke/vignette even on a fantasy site. */
function fadeTools(block: ImageBlock, ctx: EditCtx, host: HTMLElement): HTMLElement[] {
  const current = block.fade ? maskById(block.fade.mask) : undefined;
  const out: HTMLElement[] = [];

  out.push(
    mini(`◐ ${current ? current.label : 'fade'}`, 'Cycle the fade mask (genre set, then none)', () => {
      // genre resolves at CLICK time — host is in the document by then, so a
      // per-sheet pin or a mid-session picker change is honored
      const set = MASKS[genreAt(host)];
      const at = set.findIndex((m) => m.id === block.fade?.mask);
      const next = set[at + 1]; // past the end (or a foreign-genre mask) → none; -1+1=0 starts the cycle
      setFade(
        block,
        next ? { mask: next.id, strength: block.fade?.strength ?? 0.85, flip: block.fade?.flip } : undefined,
        ctx,
        next ? `fade: ${next.label}` : 'fade off',
      );
    }),
  );

  if (block.fade) {
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0.2';
    slider.max = '1';
    slider.step = '0.05';
    slider.value = String(block.fade.strength);
    slider.className = 'fade-strength no-print';
    slider.setAttribute('aria-label', 'Fade strength');
    slider.title = 'Fade strength';
    // live preview while dragging; ONE undoable command on release
    slider.addEventListener('input', () => {
      const shell = host.querySelector<HTMLElement>('.img-shell');
      if (shell) applyFade(shell, { ...block, fade: { ...block.fade!, strength: Number(slider.value) } });
    });
    slider.addEventListener('change', () => {
      setFade(block, { ...block.fade!, strength: Number(slider.value) }, ctx, 'fade strength');
    });
    out.push(slider);

    out.push(
      mini('⇋ flip', 'Mirror the fade mask (not the image)', () =>
        setFade(block, { ...block.fade!, flip: !block.fade!.flip }, ctx, 'flip fade'),
      ),
    );
  }

  out.push(
    mini(block.blend === 'multiply' ? '▦ inked' : '▦ blend', 'Multiply-blend the image into the page background', () => {
      const prev = block.blend;
      const next = prev === 'multiply' ? undefined : 'multiply';
      ctx.execute({
        label: 'image blend',
        apply: () => (block.blend = next),
        revert: () => (block.blend = prev),
      });
    }),
  );

  return out;
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
        ...fadeTools(block, ctx, el),
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
