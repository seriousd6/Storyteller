// Tavern one-pager: the whole establishment as a single printable statblock —
// name, impressions, menu, entertainment, notice board, and tonight's trouble.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

export const meta: CompositeMeta = {
  id: 'gm/tavern-page',
  title: 'Tavern One-Pager',
  pillar: 'gm',
  description:
    'A complete tavern ready to run: name, first impression, house specialties, the bard and their song, the notice board, and tonight’s event.',
  addLabel: 'Add tavern',
  options: [],
};

export function build(tables: TableRegistry, seed: string, _opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const notices: string[] = [];
  for (let i = 0; i < 3; i++) notices.push(c.distinct('{table:gm/tavern/notice}', notices));

  const sections: Block[] = [
    { type: 'paragraph', label: 'First Impression', text: c.text('{table:gm/tavern/impression}') },
    { type: 'paragraph', label: 'On Second Glance', text: c.text('{table:gm/tavern/second-glance}') },
    {
      type: 'keyValue',
      pairs: [
        { key: 'House Drink', value: c.text('{table:gm/tavern/drink}') },
        { key: 'On the Menu', value: c.text('{table:gm/tavern/food}') },
      ],
    },
    {
      type: 'keyValue',
      pairs: [
        { key: 'The Bard', value: c.text('{table:gm/tavern/bards}') },
        { key: 'Playing', value: c.text('{table:gm/tavern/instruments}') },
        { key: 'Current Song', value: c.text('{table:gm/tavern/song}') },
      ],
    },
    { type: 'paragraph', label: 'Overheard', text: c.text('{table:gm/tavern/conversation}') },
    { type: 'list', label: 'The Notice Board', items: notices },
    { type: 'paragraph', label: 'Tonight', text: c.text('{table:gm/tavern/event}') },
  ];

  return [
    {
      type: 'statblock',
      name: c.text('{table:gm/tavern/name}'),
      meta: 'Tavern & Inn',
      sections,
    },
  ];
}
