// Faction: who is really pulling the strings. Assembles a power group from the
// government/* and villain/* vocabularies (goal, methods, leader, resource,
// renown, scheme, weakness) plus tavern name-parts for the name — a core GM
// staple the site had no tool for. Reuses existing tables only.
//
// Registry scanner (gen-registries.mjs): table ids must be FULL literals.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const KINDS = [
  { value: '', label: 'Any kind' },
  { value: 'Order', label: 'Holy / knightly order' },
  { value: 'Guild', label: 'Guild' },
  { value: 'Cult', label: 'Cult' },
  { value: 'Syndicate', label: 'Criminal syndicate' },
  { value: 'Court', label: 'Noble court' },
  { value: 'Cabal', label: 'Arcane cabal' },
];
const KIND_WORDS = ['Order', 'Guild', 'Circle', 'Cabal', 'Covenant', 'Hand', 'Syndicate', 'Court', 'Conclave', 'League'];

/** The bold "Label" off a "Label: description" (or "Label - description") entry
 *  — government/leader mixes both delimiters. */
const head = (s: string): string => {
  const m = /^(.*?)(?::| [-–—] )/.exec(s);
  return (m ? m[1] : s).trim();
};

export const meta: CompositeMeta = {
  id: 'gm/faction',
  title: 'Faction',
  pillar: 'gm',
  description:
    'Who is really pulling the strings: a faction with a name and reputation, the goal it chases, the methods it uses, the figure who leads it, what it controls, and the scheme it is running right now — plus, for your eyes only, the weakness that can bring it down.',
  addLabel: 'Add faction',
  options: [{ id: 'kind', label: 'Kind', choices: KINDS, default: '' }],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const kindWord = KINDS.some((k) => k.value === opts.kind) && opts.kind ? opts.kind : c.among(KIND_WORDS);
  const adj = c.text('{table:gm/tavern/name-adjective}');
  const noun = c.text('{table:gm/tavern/name-monster}');
  const name = `The ${kindWord} of the ${adj} ${noun}`;

  const renown = head(c.text('{table:gm/government/renown}'));
  const leader = head(c.text('{table:gm/government/leader}'));
  const resource = head(c.text('{table:gm/government/trade-resource}'));

  return [
    {
      type: 'statblock',
      name,
      meta: renown,
      sections: [
        {
          type: 'keyValue',
          pairs: [
            { key: 'Led by', value: leader },
            { key: 'They control', value: resource },
          ],
        },
        { type: 'paragraph', label: 'What they want', text: c.text('{table:gm/government/goal}') },
        { type: 'paragraph', label: 'How they operate', text: c.text('{table:gm/government/method}') },
        { type: 'paragraph', label: 'Right now', text: c.text('{table:gm/government/scheme}') },
        { type: 'paragraph', label: 'Secret weakness — GMs only', text: c.text('{table:gm/villain/weakness}') },
      ],
    },
  ];
}
