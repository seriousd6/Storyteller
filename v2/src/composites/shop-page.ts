// Shop one-pager: a premise with its name parsed out, shelves stocked from
// the chosen merchant type's tagged inventory, and the keeper behind the
// counter — one printable statblock.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

/** The 28 merchant types tagging gm/shop/inventory. */
const TYPES: [string, string][] = [
  ['alchemy-potions', 'Alchemy & Potions'],
  ['alcohol-refreshments', 'Alcohol & Refreshments'],
  ['animals', 'Animals'],
  ['armor', 'Armor'],
  ['art', 'Art'],
  ['astral-curiosities', 'Astral Curiosities'],
  ['books-maps', 'Books & Maps'],
  ['devilish-bargains', 'Devilish Bargains'],
  ['enchantments', 'Enchantments'],
  ['fashion', 'Fashion'],
  ['fey-bazaar', 'Fey Bazaar'],
  ['flowers', 'Flowers'],
  ['food', 'Food'],
  ['instruments', 'Instruments'],
  ['jewelry', 'Jewelry'],
  ['knick-knacks', 'Knick-Knacks'],
  ['leatherworks', 'Leatherworks'],
  ['magic-items', 'Magic Items'],
  ['magical-creatures', 'Magical Creatures'],
  ['mechanica', 'Mechanica'],
  ['necromantic-wares', 'Necromantic Wares'],
  ['religious-goods', 'Religious Goods'],
  ['spells-scrolls', 'Spells & Scrolls'],
  ['thieves-market', "Thieves' Market"],
  ['timelost-goods', 'Timelost Goods'],
  ['tools', 'Tools'],
  ['vehicles', 'Vehicles'],
  ['weapons', 'Weapons'],
];

export const meta: CompositeMeta = {
  id: 'gm/shop-page',
  title: 'Shop One-Pager',
  pillar: 'gm',
  description:
    'A shop ready to open: premise, shelves stocked from 28 merchant types, and the keeper — personality, ideal, bond, and flaw included.',
  addLabel: 'Add shop',
  options: [
    {
      id: 'type',
      label: 'Merchant type',
      choices: [{ value: 'random', label: 'Surprise me' }, ...TYPES.map(([value, label]) => ({ value, label }))],
      default: 'random',
    },
  ],
};

/** Premise entries render to "Name - description". */
const PREMISE_RE = /^(.{2,60}?) [-–—] (.+)$/s;

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const [slug, label] =
    TYPES.find(([value]) => value === opts.type) ?? c.among(TYPES);

  const premise = c.text('{table:gm/shop/premise}').trim();
  const m = PREMISE_RE.exec(premise);
  const name = m?.[1] ?? `The ${label} Shop`;
  const about = m?.[2] ?? premise;

  const stock: string[] = [];
  for (let i = 0; i < 6; i++) stock.push(c.distinct(`{table:gm/shop/inventory#${slug}}`, stock));

  return [
    {
      type: 'statblock',
      name,
      meta: `${label} merchant`,
      sections: [
        { type: 'paragraph', label: 'The Premises', text: about },
        { type: 'list', label: 'On the Shelves', items: stock },
        {
          type: 'keyValue',
          pairs: [
            { key: 'Keeper Personality', value: c.text('{table:gm/shop/keeper-personality}') },
            { key: 'Ideal', value: c.text('{table:gm/shop/keeper-ideal}') },
            { key: 'Bond', value: c.text('{table:gm/shop/keeper-bond}') },
            { key: 'Flaw', value: c.text('{table:gm/shop/keeper-flaw}') },
          ],
        },
      ],
    },
  ];
}
