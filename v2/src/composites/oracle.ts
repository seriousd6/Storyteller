// Solo oracle: ask a yes/no question, set the odds, get an answer with
// "and/but" shadings, an interpretation prompt, and the occasional event
// that moves the story sideways. Entirely original tables and mechanics.

import { makeComposer, parseCast, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const LIKELIHOODS = [
  { value: 'certain', label: 'Near certain', chance: 90 },
  { value: 'likely', label: 'Likely', chance: 75 },
  { value: 'even', label: 'Fifty-fifty', chance: 50 },
  { value: 'unlikely', label: 'Unlikely', chance: 25 },
  { value: 'doubtful', label: 'Very doubtful', chance: 10 },
];

export const meta: CompositeMeta = {
  id: 'solo/oracle',
  title: 'Solo Oracle',
  pillar: 'solo',
  description:
    'The GM in a box: ask a yes/no question, set the odds, and get an answer with and/but shadings, a prompt to read it by, and the occasional event that moves the story on its own. Pin answers to a sheet and it becomes your adventure journal.',
  addLabel: 'Add to journal',
  options: [
    {
      id: 'likelihood',
      label: 'How likely is a yes?',
      choices: LIKELIHOODS.map((l) => ({ value: l.value, label: l.label })),
      default: 'even',
    },
  ],
  // The question rides through opts into the answer block (audit batch C):
  // without it the journal filled with disembodied "Yes, but…" entries.
  ask: { id: 'question', label: 'Your question', placeholder: 'Will the guard believe us?' },
  log: 'Questions this session',
  // With a world open, "Meanwhile" usually speaks BY NAME (audit batch D).
  worldCast: true,
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const odds = LIKELIHOODS.find((l) => l.value === opts.likelihood) ?? LIKELIHOODS[2]!;
  const r = c.int(1, 100);
  const chance = odds.chance;

  let answer: string;
  if (r <= chance) {
    if (r <= Math.round(chance / 5)) answer = 'Yes, and…';
    else if (r > chance - 10) answer = 'Yes, but…';
    else answer = 'Yes.';
  } else {
    if (r > 100 - Math.round((100 - chance) / 5)) answer = 'No, and…';
    else if (r <= chance + 10) answer = 'No, but…';
    else answer = 'No.';
  }

  const inspiration = c.text(
    '{table:solo/oracle/descriptor} {table:solo/oracle/action} {table:solo/oracle/theme}',
  );

  const sections: Block[] = [];
  // The question is prose only — it must never touch the rolls above, or a
  // shared link with an edited question would change the answer.
  const question = (opts.question ?? '').trim();
  if (question) sections.push({ type: 'paragraph', label: 'You asked', text: question });
  sections.push({
    type: 'paragraph',
    label: 'Read it as',
    text: inspiration.charAt(0).toUpperCase() + inspiration.slice(1) + '.',
  });

  // Multiples of 11 stir the pot (~9% of asks): the world acts on its own.
  // With a cast (opts.cast, from the active world), it usually acts BY NAME —
  // the named frames live in focus-named, pooled by actor category. The cast
  // draw comes AFTER every other roll, so a castless build's stream (and
  // every pre-cast share link) is untouched.
  if (r % 11 === 0) {
    const cast = parseCast(opts.cast);
    const actor = cast.length && c.chance(0.7) ? c.among(cast) : null;
    const text = actor
      ? c.text(`{table:solo/oracle/focus-named#${actor.cat}}`).replace(/\{\{who\}\}/g, actor.name)
      : c.text('{table:solo/oracle/focus}');
    sections.push({ type: 'paragraph', label: 'Meanwhile', text });
  }

  return [
    {
      type: 'statblock',
      name: answer,
      meta: `${odds.label} · d100 rolled ${r} against ${chance}`,
      sections,
    },
  ];
}
