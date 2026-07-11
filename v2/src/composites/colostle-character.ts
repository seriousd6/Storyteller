// Colostle explorer builder: rolls a character sheet's worth of depth — nature,
// drives, secrets, and a handful of drawn emotional notes and little details.
// The number drawn is keyed to a 1–5 "depth" dial, echoing Colostle's
// Exploration Score. All tables are community/original companion content; class
// names are listed for reference but their rules live in the Colostle rulebook.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

// Class NAMES only (game terms, not prose). Descriptions are rulebook material.
const CLASSES = ['Armed', 'Followed', 'Helmed', 'Mounted', 'Allied', 'Bastion'];

export const meta: CompositeMeta = {
  id: 'solo/colostle-character',
  title: 'Colostle Explorer',
  pillar: 'solo',
  description:
    'Build an explorer for a Colostle solo game: nature, drives, a secret, a flaw, and a handful of drawn emotional notes and little human details. Pin it to a sheet and it becomes your character journal.',
  addLabel: 'Add explorer',
  deck: true,
  note: 'Colostle is a solo RPG by Nich Angell — you need the rulebook to play. Class names below are for reference; their rules are in the book. Tables here are community & original companion content.',
  options: [
    {
      id: 'depth',
      label: 'Depth of detail',
      choices: [
        { value: '1', label: '1 · sketch' },
        { value: '2', label: '2 · light' },
        { value: '3', label: '3 · standard' },
        { value: '4', label: '4 · deep' },
        { value: '5', label: '5 · exhaustive' },
      ],
      default: '3',
    },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const depth = Math.max(1, Math.min(5, parseInt(opts.depth ?? '3', 10) || 3));

  const name = c.text('{table:solo/colostle/name}');
  const nature = c.text('{table:solo/colostle/nature}');
  const klass = c.among(CLASSES);

  const sections: Block[] = [
    {
      type: 'keyValue',
      pairs: [
        { key: 'Nature', value: nature },
        { key: 'Class', value: `${klass} (see rulebook)` },
      ],
    },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Wants most', value: c.text('{table:solo/colostle/goal-major}') },
        { key: 'Also wants', value: c.text('{table:solo/colostle/goal-minor}') },
        { key: 'Because', value: c.text('{table:solo/colostle/motive}') },
        { key: 'Plans to', value: c.text('{table:solo/colostle/intent}') },
      ],
    },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Strength', value: c.text('{table:solo/colostle/strength}') },
        { key: 'Weakness', value: c.text('{table:solo/colostle/weakness}') },
      ],
    },
    {
      type: 'paragraph',
      label: 'Flaw',
      text: `${c.text('{table:solo/colostle/flaw}')} ${c.text('{table:solo/colostle/flaw-backstory}')}`,
    },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Secret', value: c.text('{table:solo/colostle/secret}') },
        { key: 'Kept because', value: c.text('{table:solo/colostle/secret-reason}') },
      ],
    },
    { type: 'paragraph', label: 'Struggle', text: c.text('{table:solo/colostle/struggle}') },
  ];

  const emotions = c.drawN('solo/colostle/emotion', Math.min(depth + 1, 5));
  if (emotions.length) sections.push({ type: 'list', label: 'Emotional notes', items: emotions });

  const details = c.drawN('solo/colostle/little-detail', depth);
  if (details.length) sections.push({ type: 'list', label: 'Little details', items: details });

  return [{ type: 'statblock', name, meta: `Explorer · ${klass}`, sections }];
}
