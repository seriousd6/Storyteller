// Portents & Omens: a cryptic warning delivered by an unsettling stranger, a
// sign in the sky, or both. Surfaces the omen-* tables (a mysterious figure who
// speaks a prophecy while something wrong shows through) and the world/phenomenon
// table — buried, respectively, inside an NPC sub-roll and the World grab-bag.
//
// Registry scanner (gen-registries.mjs): table ids must be FULL literals.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const KINDS = [
  { value: '', label: 'Any' },
  { value: 'spoken', label: 'A stranger’s prophecy' },
  { value: 'sign', label: 'A sign in the sky' },
  { value: 'both', label: 'Both — a warning and a sign' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The headline of a phenomenon entry, before its mechanics gloss. */
const headline = (s: string) => s.split(/\s[-–—(]/)[0]!.trim();
/** One atmospheric sentence of a phenomenon — the flavour, not the wall of
 *  weather mechanics some entries carry in nested parentheticals. */
const sketch = (s: string): string => {
  const g = s.replace(/^.*?[-–—(]\s*/, '').replace(/^[^A-Za-z]+/, '');
  const m = /^(.*?[.!?])(\s|$)/.exec(g);
  return (m ? m[1]! : g).replace(/[()]+$/, '').trim();
};

export const meta: CompositeMeta = {
  id: 'gm/omen',
  title: 'Portents & Omens',
  pillar: 'gm',
  description:
    'A chill down the spine: a wild-eyed stranger presses a prophecy on the party while something wrong shows through them, or a sign burns in the sky overhead — or both at once. Drop it on the road, in a crowd, or the night before everything changes.',
  addLabel: 'Add omen',
  options: [{ id: 'kind', label: 'How it comes', choices: KINDS, default: '' }],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const kind =
    opts.kind && KINDS.some((k) => k.value === opts.kind)
      ? opts.kind
      : c.weighted([
          ['spoken', 5],
          ['both', 3],
          ['sign', 2],
        ]);

  const sections: Block[] = [];
  let name = 'An Omen';
  let metaLine = '';

  if (kind === 'spoken' || kind === 'both') {
    const words = c.text('{table:gm/npc/omen-text}');
    const manner = c.text('{table:gm/npc/communicate}');
    const tell = `${c.text('{table:gm/npc/omen-attention}')} ${c.text('{table:gm/npc/omen-freak-out}')}`;
    name = 'A Stranger’s Prophecy';
    metaLine = `They ${manner}`;
    sections.push({ type: 'paragraph', text: `“${words}”` });
    sections.push({ type: 'paragraph', label: 'As they speak', text: cap(tell) + '.' });
  }

  if (kind === 'sign' || kind === 'both') {
    const p = c.text('{table:gm/world/phenomenon}');
    if (kind === 'sign') {
      name = headline(p);
      metaLine = 'A sign in the sky';
      sections.push({ type: 'paragraph', text: sketch(p) });
    } else {
      sections.push({ type: 'paragraph', label: 'A sign in the sky', text: headline(p) });
    }
  }

  return [{ type: 'statblock', name, meta: metaLine, sections }];
}
