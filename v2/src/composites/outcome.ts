// Action Oracle — resolve "I try something; how does it go?" on a single d6 with
// a wide middle band, so most rolls give you the thing AND a complication rather
// than a flat yes/no. Inspired by rules-light action ladders (setback / success
// at a cost / clean success); all content original. A favorable/unfavorable dial
// rolls two dice and keeps the better/worse one.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const ODDS: Record<string, { label: string; how: 'high' | 'one' | 'low' }> = {
  favored: { label: 'Favored (keep the better of 2d6)', how: 'high' },
  even: { label: 'Even (1d6)', how: 'one' },
  unfavored: { label: 'Unfavored (keep the worse of 2d6)', how: 'low' },
};

export const meta: CompositeMeta = {
  id: 'solo/outcome',
  title: 'Action Oracle',
  pillar: 'solo',
  description:
    "When a yes/no won't do — you're attempting something and want to know how it lands. One die, three outcomes: a clean success, a success that costs you, or a setback. Every result moves the story. Pin the ones that sting.",
  addLabel: 'Add outcome',
  options: [
    {
      id: 'odds',
      label: 'How stacked are the odds?',
      choices: [
        { value: 'favored', label: 'Favored' },
        { value: 'even', label: 'Even' },
        { value: 'unfavored', label: 'Unfavored' },
      ],
      default: 'even',
    },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const odds = ODDS[opts.odds ?? 'even'] ?? ODDS.even!;

  const a = c.int(1, 6);
  const b = c.int(1, 6);
  const roll = odds.how === 'one' ? a : odds.how === 'high' ? Math.max(a, b) : Math.min(a, b);

  let name: string;
  const sections: Block[] = [];
  if (roll === 6) {
    name = 'Success';
  } else if (roll >= 3) {
    name = 'Success — but…';
    sections.push({ type: 'paragraph', label: 'The cost', text: capitalize(c.text('{table:solo/outcome/complication}')) });
  } else {
    name = 'Setback';
    sections.push({ type: 'paragraph', label: 'And it costs you', text: capitalize(c.text('{table:solo/outcome/cost}')) });
  }

  const read = c.text('{table:solo/oracle/descriptor} {table:solo/oracle/action} {table:solo/oracle/theme}');
  sections.push({ type: 'paragraph', label: 'Read it as', text: capitalize(read) + '.' });

  const shown = odds.how === 'one' ? `${roll}` : `${roll} (rolled ${a} & ${b})`;
  return [{ type: 'statblock', name, meta: `${odds.label} · d6 = ${shown}`, sections }];
}

function capitalize(s: string): string {
  const t = s.replace(/^(but|and)\s+/i, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}
