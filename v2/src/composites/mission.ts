// Mission Oracle — a composable job/quest generator: an opposition, an objective,
// a mission-wide complication or two, an advantage, and an opening situation. The
// structure is inspired by rules-light mission builders where small tables feed
// each other (including a "two forces at war" recursion); all content here is
// original and system-neutral. Higher stakes stack more complications.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const STAKES: Record<string, { complications: number; label: string }> = {
  low: { complications: 1, label: 'Low stakes' },
  standard: { complications: 1, label: 'Standard' },
  high: { complications: 2, label: 'High stakes' },
};

export const meta: CompositeMeta = {
  id: 'solo/mission',
  title: 'Mission Oracle',
  pillar: 'solo',
  description:
    'Generate a whole mission at once: who opposes you, what you must do, what makes it hard, what you have going for you, and the situation you walk into. Genre-neutral — read it as a heist, a quest, or a patrol. Pin it and the Sheet Builder is your mission board.',
  addLabel: 'Add mission',
  options: [
    {
      id: 'stakes',
      label: 'Stakes',
      choices: [
        { value: 'low', label: 'Low' },
        { value: 'standard', label: 'Standard' },
        { value: 'high', label: 'High' },
      ],
      default: 'standard',
    },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const stakes = STAKES[opts.stakes ?? 'standard'] ?? STAKES.standard!;

  // ~1 in 4 missions: two opposing forces already at war — you're the third party.
  const twoSided = c.chance(0.25);
  const opposition = twoSided
    ? `${c.text('{table:solo/mission/threat}')}, already at war with ${c.text('{table:solo/mission/threat}')}`
    : c.text('{table:solo/mission/threat}');

  const complications: string[] = [];
  for (let i = 0; i < stakes.complications; i++) {
    complications.push(c.distinct('{table:solo/mission/complication}', complications));
  }

  const sections: Block[] = [
    {
      type: 'keyValue',
      pairs: [
        { key: 'Opposition', value: opposition },
        { key: 'Objective', value: c.text('{table:solo/mission/objective}') },
        { key: 'In your favor', value: c.text('{table:solo/mission/boon}') },
      ],
    },
  ];

  if (complications.length > 1) {
    sections.push({ type: 'list', label: 'Complications', items: complications });
  } else {
    sections.push({ type: 'keyValue', pairs: [{ key: 'Complication', value: complications[0]! }] });
  }

  sections.push({ type: 'paragraph', label: 'Opening', text: c.text('{table:solo/mission/prompt}') });

  return [{ type: 'statblock', name: 'Mission', meta: stakes.label, sections }];
}
