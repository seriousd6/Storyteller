// Landmark: a place worth a map pin — ruin, shrine, monument, oddity — as one
// statblock: what it is, what's within, what's dangerous, why anyone goes,
// and (half the time) what's really going on. First rung of the drill-down
// chain between settlements and dungeons (Everdeep ARCHITECTURE §5.3).

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

export const meta: CompositeMeta = {
  id: 'gm/landmark',
  title: 'Landmark',
  pillar: 'gm',
  description:
    'A place worth a pin: a named site with a description, a set-piece, a hazard, and a reason to go — ruin, shrine, monument, or something stranger.',
  addLabel: 'Add landmark',
  options: [],
};

export function build(tables: TableRegistry, seed: string, _opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const name = c.text('{table:solo/quest/place-name}');

  const sections: Block[] = [
    { type: 'paragraph', label: 'The Site', text: c.text('{table:gm/adventure/point-of-interest}') },
    { type: 'paragraph', label: 'Within', text: c.text('{table:gm/dungeon/room}') },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Hazard', value: c.text('{table:gm/dungeon/hazard}') },
        { key: 'Scrawled Here', value: c.text('{table:gm/dungeon/graffiti}') },
      ],
    },
  ];
  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'The Truth of It', text: c.text('{table:gm/adventure/twist}') });
  }

  return [
    {
      type: 'statblock',
      name,
      meta: 'Landmark',
      sections,
    },
  ];
}
