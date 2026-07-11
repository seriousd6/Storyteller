// Quick NPC: a whole person as one statblock — race and name parsed out of
// the race wrapper, vocation in the header line, traits as fields, prose for
// appearance and backstory.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

export const meta: CompositeMeta = {
  id: 'gm/npc-block',
  title: 'Quick NPC',
  pillar: 'gm',
  description:
    'One click, one person: name, race, vocation, appearance, demeanor, motivation, flaw, and a hook — as a single ready-to-print statblock.',
  addLabel: 'Add NPC',
  options: [],
};

/** Race wrapper entries render to "Race: X( (gender))?. Name: N.( Racial note: R)?" */
const RACE_RE = /^Race: (.+?)\. Name: (.+?)\.(?:\s*Racial note: (.+))?$/s;

export function build(tables: TableRegistry, seed: string, _opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const raceRoll = c.text('{table:gm/npc/race}');
  const m = RACE_RE.exec(raceRoll.trim());
  const race = m?.[1] ?? 'Human';
  const name = m?.[2] ?? raceRoll.trim();
  const racialNote = m?.[3];

  const vocation = c.text('{table:gm/npc/vocation}');

  // Motivation entries lead with their own kind ("Goal: …" / "Fear: …") and
  // flaws sometimes with "Flaw: …" — fold those prefixes into the field key
  // instead of printing them twice.
  const motivation = c.text('{table:gm/npc/motivation}');
  const motMatch = /^(Goal|Fear):\s*(.+)$/s.exec(motivation);
  const motPair = motMatch
    ? { key: motMatch[1] === 'Fear' ? 'Fears' : 'Wants', value: motMatch[2]! }
    : { key: 'Wants', value: motivation };
  const flaw = c.text('{table:gm/npc/flaw-or-prejudice}').replace(/^Flaw:\s*/, '');

  const sections: Block[] = [
    {
      type: 'paragraph',
      label: 'Appearance',
      text: `${c.text('{table:gm/npc/feature}')} · ${c.text('{table:gm/npc/markings}')}`,
    },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Demeanor', value: c.text('{table:gm/npc/demeanor}') },
        { key: 'Right Now', value: c.text('{table:gm/npc/mood}') },
        motPair,
        { key: 'Flaw', value: flaw },
        { key: 'Quirk', value: c.text('{table:gm/npc/quirk}') },
        { key: 'Faith', value: c.text('{table:gm/npc/faith}') },
        { key: 'Keepsake', value: c.text('{table:gm/npc/keepsake}') },
      ],
    },
  ];
  if (racialNote) sections.push({ type: 'paragraph', label: 'Racial Note', text: racialNote });
  sections.push({ type: 'paragraph', label: 'Backstory', text: c.text('{table:gm/npc/backstory}') });
  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'If Asked About Home', text: c.text('{table:gm/npc/hometown}') });
  }

  return [
    {
      type: 'statblock',
      name,
      meta: `${race} · ${vocation}`,
      sections,
    },
  ];
}
