// Mystery / whodunit: a case in one roll — the crime and scene, the clues to
// find, a lineup of persons of interest to chase, a distraction to muddy the
// trail, and (GMs only) who actually did it and why. Built entirely from the
// eleven gm/adventure/crime-* tables, which until now surfaced only as a single
// mashed-together "Crime Scene" slot.
//
// NOTE for the registry scanner (gen-registries.mjs): table ids must be FULL
// literals — `{table:gm/adventure/crime}` and quoted 'gm/adventure/...' for
// drawN — never string-interpolated, or the closure misses them.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const clamp = (v: string, lo: number, hi: number, dflt: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : dflt;
};

const COUNTS = [
  { value: '2', label: '2' },
  { value: '3', label: '3' },
  { value: '4', label: '4' },
];

export const meta: CompositeMeta = {
  id: 'gm/mystery',
  title: 'Mystery',
  pillar: 'gm',
  description:
    'A whodunit in one roll: the crime and its scene, the clues to find, a lineup of persons of interest to chase, and a distraction to muddy the trail — plus, for your eyes only, who actually did it and why. Pin the case and hand the suspects to your players.',
  addLabel: 'Add case',
  options: [
    { id: 'clues', label: 'Clues to find', choices: COUNTS, default: '3' },
    { id: 'suspects', label: 'Persons of interest', choices: COUNTS, default: '3' },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const crime = c.text('{table:gm/adventure/crime}');
  const location = c.text('{table:gm/adventure/crime-location}');
  const evidence = c.text('{table:gm/adventure/crime-clue}');
  const perpetrator = c.text('{table:gm/adventure/crime-perpetrator}');
  const outsider = c.text('{table:gm/adventure/crime-outsider}');
  const timeSince = c.text('{table:gm/adventure/crime-time-since}');
  const timeOfDay = c.text('{table:gm/adventure/crime-time-of-day}');
  const weather = c.text('{table:gm/adventure/crime-weather}');

  // The assumed motive and the real one should differ — that gap is the case.
  const trueMotive = c.text('{table:gm/adventure/crime-motive}');
  const assumedMotive = c.distinct('{table:gm/adventure/crime-motive}', [trueMotive]);

  const clues = c.drawN('gm/adventure/crime-clue', clamp(opts.clues, 2, 4, 3));
  const suspects = c.drawN('gm/adventure/crime-interested', clamp(opts.suspects, 2, 4, 3));

  const sections: Block[] = [
    {
      type: 'keyValue',
      pairs: [
        { key: 'Crime', value: cap(crime) },
        { key: 'Discovered', value: `${cap(timeSince)} after the fact, ${timeOfDay}` },
        { key: 'Weather since', value: cap(weather) },
      ],
    },
    {
      type: 'paragraph',
      label: 'The scene',
      text: `The case of the ${crime} ${location}. The main piece of evidence the guard is holding: ${evidence}.`,
    },
    { type: 'list', label: 'Clues to find', items: clues.map(cap) },
    { type: 'list', label: 'Persons of interest', items: suspects.map(cap) },
    {
      type: 'paragraph',
      label: 'A distraction',
      text: `Meanwhile, another group keeps ${outsider} — pulling attention the wrong way.`,
    },
    {
      type: 'paragraph',
      label: 'The truth — GMs only',
      text: `The culprit is in fact ${perpetrator}. The real motive: ${trueMotive}. The motive everyone assumes — ${assumedMotive} — is a red herring.`,
    },
  ];

  return [
    {
      type: 'statblock',
      name: cap(`The ${crime} ${location}`),
      meta: 'Investigation',
      sections,
    },
  ];
}
