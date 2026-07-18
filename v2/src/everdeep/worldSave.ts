// Save-a-result-to-a-world, shared by both generator surfaces (Everdeep
// Phase B). Composite.astro carried the only copy; the audit's batch B gives
// slot-roller pages the same door, so the wiring moves here — one
// implementation, two islands. The markup half is components/WorldSavePanel.astro.

import { listWorlds, getWorld, putWorld } from '../engine/worldStore';
import { blocksToEntity, kindForGenerator } from './adapters';
import REGISTRY from './registry.json';
import type { Block } from '../engine/types';

export interface WorldSaveSource {
  /** e.g. 'gm/npc' — decides the saved page's kind via kindForGenerator. */
  generatorId: string;
  /** Page name when the blocks don't carry one (no statblock/title). */
  fallbackName: string;
  /** The CURRENT result. Empty array = nothing to save, buttons no-op. */
  getBlocks: () => Block[];
  getSeed: () => string;
  /** Composite-only (batch 93): dials to freeze onto entity.gen.opts so a
   *  Fishing Village saved to a world stays one across rerolls. */
  getLockedOpts?: () => Record<string, string> | undefined;
  /** 'generator' for slot pages — the world page must not offer composite
   *  rerolls it has no module for. */
  genPrefix?: 'composite' | 'generator';
}

/** Wire the [data-save-world] button and the WorldSavePanel inside `root`.
 *  With no worlds yet, the button sends the user to /world/ to make one. */
export function wireWorldSave(root: HTMLElement, src: WorldSaveSource): void {
  const panel = root.querySelector<HTMLElement>('[data-world-save]');
  const worldPick = root.querySelector<HTMLSelectElement>('[data-world-pick]');
  const parentPick = root.querySelector<HTMLSelectElement>('[data-parent-pick]');
  const status = root.querySelector<HTMLElement>('[data-world-status]');
  if (!panel || !worldPick || !parentPick) return;

  const esc = (s: string) => s.replace(/</g, '&lt;');
  // parents legal for this generator's kind, per the registry containment rules
  const savedKind = kindForGenerator(src.generatorId);
  const canHold = new Set(
    REGISTRY.kinds.filter((k) => (k.childKinds ?? []).includes(savedKind)).map((k) => k.id),
  );
  const iconOf = (kind: string) => REGISTRY.kinds.find((k) => k.id === kind)?.icon ?? '';

  async function fillParents(): Promise<void> {
    if (!worldPick!.value) return;
    const world = await getWorld(worldPick!.value);
    const options = Object.values(world?.entities ?? {})
      .filter((en) => !en.deleted && canHold.has(en.kind))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((en) => `<option value="${en.id}">${iconOf(en.kind)} ${esc(en.name)}</option>`);
    parentPick!.innerHTML = `<option value="">— top level —</option>` + options.join('');
  }

  root.querySelector('[data-save-world]')?.addEventListener('click', async () => {
    if (!src.getBlocks().length) return;
    const worlds = await listWorlds();
    if (!worlds.length) {
      window.location.href = '/world/';
      return;
    }
    worldPick.innerHTML = worlds
      .map((w) => `<option value="${w.id}">${esc(w.name)}</option>`)
      .join('');
    await fillParents();
    if (status) status.textContent = `saves a new ${savedKind} page`;
    panel.hidden = false;
  });
  worldPick.addEventListener('change', () => void fillParents());
  root.querySelector('[data-world-cancel]')?.addEventListener('click', () => {
    panel.hidden = true;
  });
  root.querySelector('[data-world-confirm]')?.addEventListener('click', async () => {
    const blocks = src.getBlocks();
    if (!blocks.length || !worldPick.value) return;
    const world = await getWorld(worldPick.value);
    if (!world) return;
    const entity = blocksToEntity(
      src.generatorId,
      src.getSeed(),
      blocks,
      src.fallbackName,
      parentPick.value || undefined,
      src.genPrefix ?? 'composite',
    );
    // the options this page was rolled WITH survive its future rerolls
    const locked = src.getLockedOpts?.();
    if (locked && Object.keys(locked).length && entity.gen) entity.gen.opts = locked;
    world.entities[entity.id] = entity;
    await putWorld(world);
    if (status) {
      const home = parentPick.value ? world.entities[parentPick.value]?.name : world.name;
      status.innerHTML =
        `✓ Saved — <a href="/world/#${entity.id}">open “${esc(entity.name)}” in ${esc(home ?? world.name)}</a>`;
    }
  });
}
