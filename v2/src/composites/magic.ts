// Magic one-pager: the largest monolith in the set. The old "Magic System" slot
// rolled one line — "<School> Magic — Source: … Cost: … Potency: …
// Accessibility: … Mastery: …" — with all five sub-rolls gated by the rolled
// SCHOOL (146 of them, each its own tag). Static tags can't flow from a slot to
// its siblings, so breaking those five out into labelled, rerollable sections is
// a composite. lockOpts freezes the school so a per-section reroll keeps a
// Necromancy system a Necromancy system (government.ts / shop-page.ts pattern).
//
// No school dial: 146 is too long a dropdown, and the tool never offered school
// selection — "Surprise me" is the whole interaction. The school is read from
// the system table so no 146-entry array has to be kept in sync here.
//
// Registry scanner (gen-registries.mjs): the '{table:gm/magic/...' literals below
// carry the full ids into the closure even though the #<slug> tag is interpolated.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

export const meta: CompositeMeta = {
  id: 'gm/magic',
  title: 'Magic',
  pillar: 'gm',
  description:
    'Design a magic system: its school, where the power comes from, what it costs, how potent and how accessible it is, what mastery demands — plus its casting method, imagery, guiding principle, status in the world, and a wild-magic surge.',
  addLabel: 'Add magic system',
  options: [],
};

const entryText = (e: string | { text: string }): string => (typeof e === 'string' ? e : e.text);

/** Resolve the school: its slug (the #tag on the sub-rolls) and display name,
 *  read straight from the system table so the 146 schools live in one place.
 *  An explicit opts.school (what lockOpts pins on reroll) wins; else a seeded
 *  pick. Shared by build and lockOpts so the two always agree. */
function resolveSchool(tables: TableRegistry, c: ReturnType<typeof makeComposer>, opts: Record<string, string>): [string, string] {
  const rows = (tables.get('gm/magic/system')?.entries ?? []).map(entryText);
  const bySlug = opts.school ? rows.find((t) => t.includes(`#${opts.school}}`)) : undefined;
  const text = bySlug ?? c.among(rows);
  const name = (text.split(' — ')[0] ?? 'Magic').trim();
  const slug = text.match(/#([a-z0-9-]+)\}/)?.[1] ?? '';
  return [slug, name];
}

/** The spine Composite.astro folds into every per-part reroll: the school. */
export function lockOpts(tables: TableRegistry, seed: string, opts: Record<string, string>): Record<string, string> {
  const c = makeComposer(tables, seed);
  const [slug] = resolveSchool(tables, c, opts);
  return { school: slug };
}

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const [slug, name] = resolveSchool(tables, c, opts);
  const t = (tableId: string): string => c.text(`{table:${tableId}#${slug}}`);

  return [
    {
      type: 'statblock',
      name,
      meta: 'A magic system',
      sections: [
        { type: 'paragraph', label: 'Source', text: t('gm/magic/source') },
        { type: 'paragraph', label: 'Cost', text: t('gm/magic/cost') },
        { type: 'paragraph', label: 'Potency', text: t('gm/magic/potency') },
        { type: 'paragraph', label: 'Accessibility', text: t('gm/magic/accessibility') },
        { type: 'paragraph', label: 'Mastery', text: t('gm/magic/mastery') },
        { type: 'paragraph', label: 'Status in the World', text: c.text('{table:gm/magic/status}') },
      ],
    },
    {
      type: 'statblock',
      name: 'The Craft',
      sections: [
        { type: 'paragraph', label: 'Casting Method', text: c.text('{table:gm/magic/method}') },
        { type: 'paragraph', label: 'Imagery', text: c.text('{table:gm/magic/imagery}') },
      ],
    },
    {
      type: 'statblock',
      name: 'Its Nature',
      sections: [
        { type: 'paragraph', label: 'Guiding Principle', text: c.text('{table:gm/magic/concept}') },
        { type: 'paragraph', label: 'Theme', text: c.text('{table:gm/magic/theme}') },
      ],
    },
    {
      type: 'statblock',
      name: 'Wild Magic',
      sections: [{ type: 'paragraph', label: 'Wild Magic Surge', text: c.text('{table:gm/magic/wild-surge}') }],
    },
  ];
}
