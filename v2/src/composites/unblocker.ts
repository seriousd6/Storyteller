// Unblocker: for when the page won't move. Emits a concrete action to try, a
// pointed question about the work-in-progress, and a reframing to hold onto.
// One button, endless nudges. All content is original.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

export const meta: CompositeMeta = {
  id: 'writing/unblocker',
  title: 'Unblocker',
  pillar: 'writing',
  description:
    "Stuck? Get a concrete thing to try, a question to interrogate your draft with, and a reframe to loosen the grip. Keep hitting Generate until one of them moves you.",
  addLabel: 'Add nudge',
  options: [],
};

export function build(tables: TableRegistry, seed: string): Block[] {
  const c = makeComposer(tables, seed);
  return [
    {
      type: 'statblock',
      name: 'Unblock',
      sections: [
        { type: 'paragraph', label: 'Try this', text: c.text('{table:writing/unblocker/nudge}') },
        { type: 'paragraph', label: 'Ask yourself', text: c.text('{table:writing/unblocker/question}') },
        { type: 'paragraph', label: 'Remember', text: c.text('{table:writing/unblocker/perspective}') },
      ],
    },
  ];
}
