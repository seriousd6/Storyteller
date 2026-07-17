// Art Object: a piece of art with a form, a material, a subject it depicts, and
// a state of repair — and, when you want it, something uncanny about it or an
// outright curse. A v2 rebuild of the old FANTASY loot page's "Art Pieces" +
// "Art Effect" rollers, on our own cleaned + moderated tables.
//
// Registry scanner (gen-registries.mjs): table ids must be FULL literals.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** "a" / "an" for the following word. */
const article = (s: string) => (/^[aeiou]/i.test(s.trim()) ? 'An' : 'A');

const MAGIC = [
  { value: 'maybe', label: 'Maybe — a chance it’s special' },
  { value: 'none', label: 'Mundane' },
  { value: 'uncanny', label: 'Something uncanny' },
  { value: 'cursed', label: 'Cursed' },
];

const SIZES = ['miniature', 'small', 'modest', 'large', 'life-size', 'oversized', 'monumental'];
const SHOWING = ['depicting', 'showing', 'portraying', 'illustrating'];

export const meta: CompositeMeta = {
  id: 'gm/art',
  title: 'Art Object',
  pillar: 'gm',
  description:
    'A work of art for a hoard, a gallery, or a manor wall: its form and material, the scene it depicts, and what shape it’s in — plus, if you like, something uncanny about it or a curse for the unlucky owner. Great as treasure with a story attached.',
  addLabel: 'Add art object',
  options: [{ id: 'magic', label: 'Anything special?', choices: MAGIC, default: 'maybe' }],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const form = c.text('{table:gm/loot/art-form}');
  const material = c.text('{table:gm/loot/art-material}');
  const size = c.among(SIZES);
  const subject = c.text('{table:gm/loot/art-subject}');
  const condition = c.text('{table:gm/loot/art-condition}');

  const sections: Block[] = [
    {
      type: 'paragraph',
      text: `${cap(c.among(SHOWING))} ${subject}. It is ${condition}.`,
    },
  ];

  // Decide whether — and how — the piece is more than it seems.
  const magic = MAGIC.some((m) => m.value === opts.magic) ? opts.magic : 'maybe';
  let kind = magic;
  if (magic === 'maybe') {
    kind = c.chance(0.65) ? 'none' : c.chance(0.55) ? 'uncanny' : 'cursed';
  }
  if (kind === 'uncanny') {
    sections.push({ type: 'paragraph', label: 'Something is off', text: c.text('{table:gm/loot/art-uncanny}') });
  } else if (kind === 'cursed') {
    sections.push({ type: 'paragraph', label: 'Cursed — GMs only', text: c.text('{table:gm/loot/art-curse}') });
  }

  return [
    {
      type: 'statblock',
      name: `${article(form)} ${form}`,
      meta: `${cap(material)} · ${size}`,
      sections,
    },
  ];
}
