// Government one-pager: a whole state, broken out of the old single-blob
// "Government" slot into labelled, individually-rerollable sections. The
// government TYPE is the spine — leadership, goals, methods, what the citizenry
// wants and the complication are all rolled from that type's tagged pools, the
// way the monolith baked #<type> into one entry. Because the sub-rolls depend on
// the rolled type (tags are static, so a slot generator can't flow it), this has
// to be a composite; lockOpts freezes the type so a per-section reroll keeps an
// autocracy an autocracy (shop-page.ts is the pattern).
//
// Registry scanner (gen-registries.mjs): the '{table:gm/government/...' literals
// below carry the full ids into the closure even though the #<slug> tag is
// interpolated.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

/** The 24 government types tagging leader/goal/method/citizen-goal/complication
 *  /archetype. slug ⇄ display name. */
const TYPES: [string, string][] = [
  ['autocracy', 'Autocracy'],
  ['authoritarian', 'Authoritarian'],
  ['aristocracy', 'Aristocracy'],
  ['bureaucracy', 'Bureaucracy'],
  ['confederacy', 'Confederacy'],
  ['communalism', 'Communalism'],
  ['democracy', 'Democracy'],
  ['feudalism', 'Feudalism'],
  ['gerontocracy', 'Gerontocracy'],
  ['hierarchy', 'Hierarchy'],
  ['kleptocracy', 'Kleptocracy'],
  ['magocracy', 'Magocracy'],
  ['matriarchy', 'Matriarchy'],
  ['meritocracy', 'Meritocracy'],
  ['militocracy', 'Militocracy'],
  ['oligarchy', 'Oligarchy'],
  ['patriarchy', 'Patriarchy'],
  ['plutocracy', 'Plutocracy'],
  ['puppet', 'Puppet State'],
  ['republic', 'Republic'],
  ['satrapy', 'Satrapy'],
  ['theocracy', 'Theocracy'],
  ['tribalism', 'Tribalism'],
  ['utopia', 'Utopia'],
];

export const meta: CompositeMeta = {
  id: 'gm/government',
  title: 'Government',
  pillar: 'gm',
  description:
    'A complete state: its system of rule, its leadership, the goals it chases and the methods it uses, what the people want, the complication history remembers — plus its era, mood, wealth, and the intrigue in its court.',
  addLabel: 'Add government',
  options: [
    {
      id: 'type',
      label: 'Government',
      choices: [{ value: 'random', label: 'Surprise me' }, ...TYPES.map(([value, label]) => ({ value, label }))],
      default: 'random',
    },
  ],
};

/** Resolve the government type: an explicit dial choice wins, else a seeded pick.
 *  Shared by build and lockOpts so the two always agree. */
function resolveType(c: ReturnType<typeof makeComposer>, opts: Record<string, string>): [string, string] {
  return TYPES.find(([value]) => value === opts.type) ?? c.among(TYPES);
}

/** The spine that must survive a per-section reroll (Composite.astro folds this
 *  into every salted rebuild): the government type. Resolved once from the base
 *  seed so rerolling the leadership keeps a democracy a democracy. */
export function lockOpts(tables: TableRegistry, seed: string, opts: Record<string, string>): Record<string, string> {
  const c = makeComposer(tables, seed);
  const [slug] = resolveType(c, opts);
  return { type: slug };
}

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const [slug, name] = resolveType(c, opts);
  const t = (tableId: string): string => c.text(`{table:${tableId}#${slug}}`);

  return [
    {
      type: 'statblock',
      name,
      meta: 'A complete state',
      sections: [
        { type: 'paragraph', label: 'The System', text: t('gm/government/archetype') },
        { type: 'paragraph', label: 'Alignment', text: c.text('{table:gm/government/alignment}') },
        { type: 'paragraph', label: 'Leadership', text: t('gm/government/leader') },
        { type: 'list', label: 'State Goals', items: c.drawN('gm/government/goal', 2, slug) },
        { type: 'list', label: 'Methods', items: c.drawN('gm/government/method', 2, slug) },
        { type: 'paragraph', label: 'The Citizenry Wants', text: t('gm/government/citizen-goal') },
        { type: 'paragraph', label: 'Complication', text: t('gm/government/complication') },
      ],
    },
    {
      type: 'statblock',
      name: 'Rule',
      sections: [
        { type: 'paragraph', label: 'Landmark Policy', text: c.text('({num:15-800} years ago) {table:gm/government/policy}') },
        { type: 'paragraph', label: 'Government Era', text: c.text('{table:gm/government/era-government}') },
        { type: 'paragraph', label: 'Civilization Era', text: c.text('{table:gm/government/era-civilization}') },
      ],
    },
    {
      type: 'statblock',
      name: 'The People',
      sections: [
        { type: 'paragraph', label: 'Public Morale', text: c.text('{table:gm/government/morale}') },
        { type: 'paragraph', label: 'Atmosphere', text: c.text('{table:gm/government/atmosphere}') },
        { type: 'paragraph', label: 'Citizens Known For', text: c.text('{table:gm/government/renown}') },
      ],
    },
    {
      type: 'statblock',
      name: 'Wealth',
      sections: [
        { type: 'paragraph', label: 'Economy', text: c.text('{table:gm/government/economy}') },
        { type: 'paragraph', label: 'Trade', text: c.text('{table:gm/government/trade}') },
        { type: 'paragraph', label: 'Cuisine', text: c.text('{table:gm/government/cuisine}') },
      ],
    },
    {
      type: 'statblock',
      name: 'The Court',
      sections: [
        { type: 'paragraph', label: 'Foreign Policy', text: c.text('{table:gm/government/foreign-policy}') },
        { type: 'paragraph', label: 'Court Intrigue', text: c.text('{table:gm/government/intrigue}') },
        { type: 'paragraph', label: 'Scheme', text: c.text('{table:gm/government/scheme}') },
      ],
    },
  ];
}
