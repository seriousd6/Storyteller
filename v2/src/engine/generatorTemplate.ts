// Generators as self-filling one-pagers (docs/sheets/GENERATORS-AS-ONEPAGERS.md).
//
// Sheet Builder Phase 1 (Batch 189) shipped the template gallery: sheet.astro
// loads `SheetTemplate`s from src/sheets/templates/*.json and instantiate()
// fills every {table:…} token with one seed, stamping {template, seed}
// provenance so each fragment stays rerollable. Three templates are hand-
// authored. The owner's decision (2026-07-17) is that EVERY generator becomes
// one — with no second landing page for the same tables.
//
// A slot roll-table already IS such a template: its sections are its slots and
// the tokens are its own. So rather than hand-author 40 more, derive the
// template from the generator config. This module is that derivation — pure and
// dependency-free, so scripts/smoke-templates.mjs can prove every generator
// fills clean and deterministically today, and sheet.astro's gallery can consume
// generatorTemplate() over import.meta.glob('../generators/*.json') to register
// them all (the one open integration point, called out in the design doc).
//
// Output shape is a DROP-IN for sheet.astro's SheetTemplate + instantiate():
// no per-block `source`/`id` (instantiate stamps those); the name slot becomes
// the statblock's title token; every other slot a rerollable paragraph section.

import type { Block, GeneratorConfig, SlotConfig, StatblockBlock } from './types.ts';

/** A Sheet Builder template — the shape sheet.astro loads and instantiate()
 *  fills (PLAN.md §9). Kept in exact sync with that page's local interface so
 *  a derived template is indistinguishable from a hand-authored one. */
export interface SheetTemplate {
  id: string;
  title: string;
  kind?: string;
  description?: string;
  blocks: Block[];
}

/** Slot ids that name the thing rather than describe a facet of it — promoted to
 *  the statblock's title token instead of becoming a body section. */
const NAME_SLOT_IDS = new Set(['name']);

/** One slot → one labelled paragraph whose text is the UNROLLED token; fill
 *  happens at instantiation, which is also where provenance is stamped — so the
 *  template block itself carries no source/id (matches the hand-authored ones). */
function slotToBlock(slot: SlotConfig): Block {
  return { type: 'paragraph', label: slot.label, text: slot.template };
}

/** Derive the self-filling one-pager template for a slot generator.
 *
 *  The whole page is one statblock: the `name` slot (if any) becomes the title
 *  token — rolled, it is the tavern's name, the NPC's name — and every other
 *  slot becomes a rerollable section. No slot is dropped, no roll logic is
 *  duplicated: the tokens are the generator's own. */
export function generatorTemplate(config: GeneratorConfig): SheetTemplate {
  const nameSlot = config.slots.find((s) => NAME_SLOT_IDS.has(s.id));
  const sectionSlots = config.slots.filter((s) => s !== nameSlot);

  const statblock: StatblockBlock = {
    type: 'statblock',
    name: nameSlot ? nameSlot.template : config.title,
    meta: config.title,
    sections: sectionSlots.map(slotToBlock),
  };

  return {
    id: config.id, // the generator id IS the topic — one route, no `-page` twin
    title: config.title,
    kind: 'custom', // a generic one-pager; §12 refines (npc/dungeon/…) at wiring
    description: config.description ?? '',
    blocks: [statblock],
  };
}

/** The generator's sections as an "add section" menu (the piece the editor's
 *  add-a-blank-`＋ note` control is missing): re-add *Overheard* or *A Toast Is
 *  Raised*, not just an empty note. Excludes the name slot (it is the title). */
export function sectionPalette(config: GeneratorConfig): { label: string; block: Block }[] {
  return config.slots
    .filter((s) => !NAME_SLOT_IDS.has(s.id))
    .map((s) => ({ label: s.label, block: slotToBlock(s) }));
}

/** Every text field a template carries, in render order — mirrors sheet.astro's
 *  textsOf(); the surface the fill pass rolls and the smoke checks. Recurses
 *  into statblock sections; keyValue/list/table are handled for when composites,
 *  which emit those, adopt the same descriptor. */
export function templateTextFields(blocks: Block[]): string[] {
  const out: string[] = [];
  const walk = (b: Block): void => {
    switch (b.type) {
      case 'statblock':
        out.push(b.name);
        if (b.meta) out.push(b.meta);
        b.sections.forEach(walk);
        break;
      case 'paragraph':
        out.push(b.text);
        break;
      case 'title':
        out.push(b.text);
        if (b.subtitle) out.push(b.subtitle);
        break;
      case 'keyValue':
        for (const p of b.pairs) out.push(p.value);
        break;
      case 'list':
        out.push(...b.items);
        break;
      case 'table':
        for (const row of b.rows) out.push(...row);
        break;
    }
  };
  blocks.forEach(walk);
  return out;
}
