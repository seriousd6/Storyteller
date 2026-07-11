// Writing Challenge: a timed exercise card — a word target, a formal constraint
// to obey, a word you may not use, an element that must appear, and a prompt to
// write toward. The built-in timer counts down the chosen limit. All content is
// original.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const WORD_TARGETS: Record<string, string> = {
  '5': '~150 words (a scene in miniature)',
  '10': '~400 words (one strong scene)',
  '15': '~750 words (a complete short-short)',
  '30': '~1,500 words (a full short story draft)',
};

export const meta: CompositeMeta = {
  id: 'writing/challenge',
  title: 'Writing Challenge',
  pillar: 'writing',
  description:
    'A timed writing sprint with teeth: a word target, a constraint to obey, a forbidden word, a required element, and a prompt. Set the clock and go. Pin the card to keep a record of what you attempted.',
  addLabel: 'Add challenge',
  timer: 'time',
  options: [
    {
      id: 'time',
      label: 'Time limit (minutes)',
      choices: [
        { value: '5', label: '5 minutes' },
        { value: '10', label: '10 minutes' },
        { value: '15', label: '15 minutes' },
        { value: '30', label: '30 minutes' },
      ],
      default: '10',
    },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const time = opts.time ?? '10';

  const sections: Block[] = [
    {
      type: 'keyValue',
      pairs: [
        { key: 'Time', value: `${time} minutes` },
        { key: 'Target', value: WORD_TARGETS[time] ?? 'as far as you get' },
      ],
    },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Constraint', value: c.text('{table:writing/challenge/constraint}') },
        { key: 'Forbidden word', value: `“${c.text('{table:writing/challenge/forbidden-word}')}”` },
        { key: 'Must include', value: c.text('{table:writing/challenge/required-element}') },
      ],
    },
    {
      type: 'paragraph',
      label: 'Prompt',
      text: `Write about ${c.text('{table:writing/prompt/protagonist}')} who ${c.text('{table:writing/prompt/situation}')}.`,
    },
  ];

  return [{ type: 'statblock', name: 'Writing Challenge', meta: `${time}-minute sprint`, sections }];
}
