// Trinket: an evocative small object — the classic "roll on the trinket table"
// staple, and a heavy evergreen search term. Surfaces the keepsake-* pools
// (curious oddities, sentimental mementos, unsettling curios) that were only
// reachable as one field inside Quick NPC, plus a constructed piece of jewelry.
//
// Registry scanner: table ids must be FULL literals (quoted 'gm/...' for drawN).

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const KINDS = [
  { value: '', label: 'Any' },
  { value: 'oddity', label: 'Curious oddity' },
  { value: 'sentimental', label: 'Sentimental keepsake' },
  { value: 'weird', label: 'Unsettling curio' },
  { value: 'jewelry', label: 'Piece of jewelry' },
];
const KEEP: Record<string, string> = {
  oddity: 'gm/npc/keepsake-oddity',
  sentimental: 'gm/npc/keepsake-sentimental',
  weird: 'gm/npc/keepsake-weird',
};
const COUNTS = [
  { value: '1', label: 'Just one' },
  { value: '3', label: 'Three' },
  { value: '5', label: 'Five' },
];

const clampCount = (v: string) => (v === '3' ? 3 : v === '5' ? 5 : 1);

export const meta: CompositeMeta = {
  id: 'gm/trinket',
  title: 'Trinket',
  pillar: 'gm',
  description:
    'A pocketful of the strange and sentimental: curious oddities, keepsakes with a story, unsettling curios, or a piece of jewelry — one at a time or a handful at once. Perfect for what an NPC is carrying or what turns up in a drawer.',
  addLabel: 'Add trinket',
  options: [
    { id: 'kind', label: 'Kind', choices: KINDS, default: '' },
    { id: 'count', label: 'How many', choices: COUNTS, default: '1' },
  ],
};

const jewelry = (c: ReturnType<typeof makeComposer>): string =>
  c.text('{table:gm/npc/jewelry-design} of {table:gm/npc/jewelry-material}, set with {table:gm/npc/jewelry-none}');

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const count = clampCount(opts.count ?? '1');

  const kind =
    opts.kind && KINDS.some((k) => k.value === opts.kind)
      ? opts.kind
      : c.weighted([
          ['oddity', 5],
          ['weird', 3],
          ['sentimental', 2],
          ['jewelry', 2],
        ]);

  const items =
    kind === 'jewelry'
      ? Array.from({ length: count }, () => jewelry(c))
      : c.drawN(KEEP[kind]!, count);

  if (items.length <= 1) {
    return [{ type: 'paragraph', text: items[0] ?? '' }];
  }
  return [{ type: 'list', label: 'Trinkets', items }];
}
