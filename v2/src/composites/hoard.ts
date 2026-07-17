// Treasure hoard: DMG-style tiered hoards — coins by the sackful, gems from
// the matching value tiers, magic items, and the chest it all sits in.

import { makeComposer, type CompositeMeta, type Composer } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const GEM_CUT = '{pick:A rough-cut|A polished|A brilliant-cut|An uncut|A tumbled|A cabochon-cut}';

interface Tier {
  value: string;
  label: string;
  coins: (c: Composer) => { cp?: number; sp?: number; gp?: number; pp?: number };
  gemTiers: string[];
  gemCount: (c: Composer) => number;
  /** [chance, template] rolls for magic items, checked independently. */
  items: [number, string][];
}

const MINOR = '{table:gm/loot/magic-item-minor}';
const MAJOR = '{table:gm/loot/magic-item-major}';

const TIERS: Tier[] = [
  {
    value: '0-4',
    label: 'Challenge 0–4',
    coins: (c) => ({ cp: c.dice(6, 6) * 100, sp: c.dice(3, 6) * 100, gp: c.dice(2, 6) * 10 }),
    gemTiers: ['gm/loot/gems-tier1', 'gm/loot/gems-tier2'],
    gemCount: (c) => c.dice(2, 4),
    items: [
      [0.6, MINOR],
      [0.25, MINOR],
    ],
  },
  {
    value: '5-10',
    label: 'Challenge 5–10',
    coins: (c) => ({ cp: c.dice(2, 6) * 100, sp: c.dice(2, 6) * 1000, gp: c.dice(6, 6) * 100, pp: c.dice(3, 6) * 10 }),
    gemTiers: ['gm/loot/gems-tier2', 'gm/loot/gems-tier3'],
    gemCount: (c) => c.dice(3, 4),
    items: [
      [0.8, MINOR],
      [0.5, MINOR],
      [0.3, MAJOR],
    ],
  },
  {
    value: '11-16',
    label: 'Challenge 11–16',
    coins: (c) => ({ gp: c.dice(4, 6) * 1000, pp: c.dice(5, 6) * 100 }),
    gemTiers: ['gm/loot/gems-tier4', 'gm/loot/gems-tier5'],
    gemCount: (c) => c.dice(3, 6),
    items: [
      [0.85, MAJOR],
      [0.5, MAJOR],
      [0.4, MINOR],
    ],
  },
  {
    value: '17+',
    label: 'Challenge 17+',
    coins: (c) => ({ gp: c.dice(12, 6) * 1000, pp: c.dice(8, 6) * 1000 }),
    gemTiers: ['gm/loot/gems-tier5', 'gm/loot/gems-tier6'],
    gemCount: (c) => c.dice(4, 6),
    items: [
      [0.95, MAJOR],
      [0.7, MAJOR],
      [0.45, MAJOR],
      [0.35, MINOR],
    ],
  },
];

/** Tier lookup shared with the dungeon/lair composites, so a delve's prize
 *  draws from THE SAME DMG brackets as the Hoard tool — each used to keep a
 *  divergent private echo of these numbers (§10.6 review). */
export function tierFor(value: string): Tier {
  return TIERS.find((t) => t.value === value) ?? TIERS[1]!;
}
/** e.g. "2,100 gp, 90 pp" — the tier's coin dice, formatted. */
export function coinLine(c: Composer, tierValue: string): string {
  const coins = tierFor(tierValue).coins(c);
  return (['pp', 'gp', 'sp', 'cp'] as const)
    .filter((k) => coins[k])
    .map((k) => `${coins[k]!.toLocaleString('en-US')} ${k}`)
    .join(', ');
}
/** One gem-table id from the tier's value bracket. */
export function gemTableFor(c: Composer, tierValue: string): string {
  return c.among(tierFor(tierValue).gemTiers);
}
/** The tier's headline magic-item roll, as a ready TEMPLATE ('{table:…}') —
 *  pass it straight to c.text(); wrapping it in another {table:} nests the
 *  token and leaks it unresolved into the page. */
export function prizeTemplateFor(tierValue: string): string {
  return tierFor(tierValue).items[0]![1];
}

export const meta: CompositeMeta = {
  id: 'gm/hoard',
  title: 'Treasure Hoard',
  pillar: 'gm',
  description:
    'A full hoard by challenge tier: coins, gemstones from the right value bracket, magic items, and the trapped chest holding it all.',
  addLabel: 'Add hoard',
  options: [
    {
      id: 'tier',
      label: 'Challenge tier',
      choices: TIERS.map((t) => ({ value: t.value, label: t.label })),
      default: '5-10',
    },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const tier = TIERS.find((t) => t.value === opts.tier) ?? TIERS[1]!;

  const coinText = coinLine(c, tier.value);

  const gems: string[] = [];
  const gemCount = tier.gemCount(c);
  for (let i = 0; i < gemCount; i++) {
    gems.push(c.text(`${GEM_CUT} {table:${c.among(tier.gemTiers)}}`));
  }

  const items: string[] = [];
  for (const [p, template] of tier.items) {
    if (c.chance(p)) items.push(c.distinct(template, items));
  }

  const sections: Block[] = [
    {
      type: 'keyValue',
      pairs: [{ key: 'Coins', value: coinText }],
    },
    { type: 'list', label: 'Gems & Valuables', items: gems },
  ];
  if (items.length) sections.push({ type: 'list', label: 'Magic Items', items });
  else sections.push({ type: 'paragraph', label: 'Magic Items', text: 'None — this time.' });
  sections.push({ type: 'paragraph', label: 'The Container', text: c.text('{table:gm/loot/treasure-chest}') });
  if (c.chance(0.2)) {
    sections.push({ type: 'paragraph', label: 'Folded Among the Coins', text: c.text('{table:gm/loot/treasure-map}') });
  }

  return [
    {
      type: 'statblock',
      name: 'Treasure Hoard',
      meta: `${tier.label} · ${gemCount} gem${gemCount > 1 ? 's' : ''} · ${items.length} magic item${items.length === 1 ? '' : 's'}`,
      sections,
    },
  ];
}
