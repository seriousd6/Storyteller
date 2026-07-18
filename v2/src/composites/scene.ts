// Solo scene-framing oracle: the beat-to-beat loop the Solo pillar was missing.
// You picture the scene you expect; this tests whether it plays out that way,
// comes in ALTERED, or gets INTERRUPTED — the Mythic-style scene test — and
// hands you a lens to read it by. A chaos dial shifts how often the world
// refuses to cooperate. Original mechanic over the existing solo/oracle tables.

import { makeComposer, parseCast, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

// Per chaos level, the d10 bands for [expected-max, altered-max]; above the
// second number is an interrupt. Calmer worlds go as planned more often.
const CHAOS: Record<string, { label: string; expected: number; altered: number }> = {
  calm: { label: 'Calm', expected: 7, altered: 9 },
  average: { label: 'Average', expected: 5, altered: 8 },
  chaotic: { label: 'Chaotic', expected: 3, altered: 6 },
};

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const meta: CompositeMeta = {
  id: 'solo/scene',
  title: 'Scene Oracle',
  pillar: 'solo',
  description:
    'Frame the scene you expect, then test it: it plays out as you pictured, comes in altered, or is interrupted by something you did not see coming — plus a lens to read the moment by. The beat-to-beat companion to the yes/no Solo Oracle. Pin scenes to build a play journal.',
  addLabel: 'Add to journal',
  options: [
    {
      id: 'chaos',
      label: 'How unpredictable?',
      choices: [
        { value: 'calm', label: 'Calm — scenes usually go as planned' },
        { value: 'average', label: 'Average' },
        { value: 'chaotic', label: 'Chaotic — expect the unexpected' },
      ],
      default: 'average',
    },
  ],
  // The expected scene rides through opts into the result (audit batch C):
  // "The scene is altered" means nothing in a journal without what you pictured.
  ask: { id: 'expect', label: 'The scene you expect', placeholder: 'We corner the informant at the docks' },
  log: 'Scenes this session',
  // With a world open, interruptions usually arrive BY NAME (audit batch D).
  worldCast: true,
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const chaos = CHAOS[opts.chaos ?? 'average'] ?? CHAOS.average!;
  const r = c.int(1, 10);

  const sections: Block[] = [];
  // prose only — the framing must never steer the scene test above
  const expect = (opts.expect ?? '').trim();
  if (expect) sections.push({ type: 'paragraph', label: 'You pictured', text: expect });
  let verdict: string;
  if (r <= chaos.expected) {
    verdict = 'As you expected';
  } else if (r <= chaos.altered) {
    verdict = 'The scene is altered';
    sections.push({ type: 'paragraph', label: "What's different", text: c.text('{table:solo/oracle/twist}') });
  } else {
    verdict = 'Interrupted!';
    // With a cast (opts.cast, from the active world) the interruption usually
    // has a NAME. Castless builds draw nothing extra, so pre-cast share links
    // reproduce unchanged. NOTE: this draw precedes the lens roll below, so a
    // cast changes the lens too — fine: cast rides the hash like any dial.
    const cast = parseCast(opts.cast);
    const actor = cast.length && c.chance(0.7) ? c.among(cast) : null;
    sections.push({
      type: 'paragraph',
      label: 'Instead, this happens',
      text: actor
        ? c.text(`{table:solo/oracle/focus-named#${actor.cat}}`).replace(/\{\{who\}\}/g, actor.name)
        : c.text('{table:solo/oracle/focus}'),
    });
  }

  // A lens to read the beat by — same inspiration seed the yes/no oracle uses.
  const lens = c.text('{table:solo/oracle/descriptor} {table:solo/oracle/action} {table:solo/oracle/theme}');
  sections.push({ type: 'paragraph', label: 'Read the scene as', text: cap(lens) + '.' });

  return [
    {
      type: 'statblock',
      name: verdict,
      meta: `Scene test · d10 rolled ${r} · ${chaos.label} chaos`,
      sections,
    },
  ];
}
