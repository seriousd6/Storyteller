// Treasure hoard: DMG-style tiered hoards — coins by the sackful, gems from
// the matching value tiers, art objects, magic items, and the trapped chest it
// all sits in. Every category has its own dial (the old site let you ask for
// "more money" or "more magic items" — this brings that back), and the
// assembly lives in hoardSections() so the Dungeon builder can drop a full,
// dial-able hoard into its inner sanctum instead of a couple of loose lines.

import { makeComposer, type CompositeMeta, type Composer } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const GEM_CUT = '{pick:A rough-cut|A polished|A brilliant-cut|An uncut|A tumbled|A cabochon-cut}';
const MINOR = '{table:gm/loot/magic-item-minor}';
const MAJOR = '{table:gm/loot/magic-item-major}';

interface Tier {
  value: string;
  label: string;
  coins: (c: Composer) => { cp?: number; sp?: number; gp?: number; pp?: number };
  gemTiers: string[];
  gemCount: (c: Composer) => number;
  /** [chance, template] rolls for magic items, checked independently. */
  items: [number, string][];
}

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

// Small tier helpers for composites that want a LEAN, hand-shaped treasure
// (the Lair keeps "what it killed for", not a full DMG hoard) rather than the
// whole hoardSections() assembly.
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
/** The tier's headline magic-item roll as a ready TEMPLATE ('{table:…}') — pass
 *  straight to c.text(); wrapping it in another {table:} leaks the token. */
export function prizeTemplateFor(tierValue: string): string {
  return tierFor(tierValue).items[0]![1];
}

// ── Generosity dials ────────────────────────────────────────────────────────
// Each category scales independently. Multipliers are deliberately chunky so
// the difference between "lean" and "rich" is felt at the table, not lost in
// the dice noise.
const COIN_MULT: Record<string, number> = { none: 0, lean: 0.5, standard: 1, rich: 2.5 };
const GEM_MULT: Record<string, number> = { none: 0, few: 0.5, standard: 1, many: 2 };
// magic items: how many rolls to add (+) or trim (−; −99 clears the pile).
const ITEM_SHIFT: Record<string, number> = { none: -99, fewer: -1, standard: 0, more: 1, loaded: 3 };

export const COIN_CHOICES = [
  { value: 'none', label: 'None' },
  { value: 'lean', label: 'Lean' },
  { value: 'standard', label: 'Standard' },
  { value: 'rich', label: 'Rich' },
];
export const GEM_CHOICES = [
  { value: 'none', label: 'None' },
  { value: 'few', label: 'Few' },
  { value: 'standard', label: 'Standard' },
  { value: 'many', label: 'Many' },
];
export const ITEM_CHOICES = [
  { value: 'none', label: 'None' },
  { value: 'fewer', label: 'Fewer' },
  { value: 'standard', label: 'Standard' },
  { value: 'more', label: 'More' },
  { value: 'loaded', label: 'Loaded' },
];

export interface HoardDials {
  coins?: string;
  valuables?: string;
  items?: string;
}

const pick = (map: Record<string, number>, key: string | undefined, fallback: string) =>
  map[key ?? fallback] ?? map[fallback]!;

/** Round to a table-friendly figure: exact when small, to the nearest ten
 *  once it's into the hundreds (nobody counts out 2,137 gp). */
function tidy(n: number): number {
  if (n <= 0) return 0;
  return n >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
}

function coinsFor(c: Composer, tier: Tier, dial: string | undefined): string {
  const mult = pick(COIN_MULT, dial, 'standard');
  if (mult === 0) return '';
  const raw = tier.coins(c);
  return (['pp', 'gp', 'sp', 'cp'] as const)
    .map((k) => [k, tidy((raw[k] ?? 0) * mult)] as const)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${v.toLocaleString('en-US')} ${k}`)
    .join(', ');
}

/** One art object as a prose line, reusing the Art Object tables so treasure
 *  comes with a story attached. Rolls the FORM first so the article agrees
 *  ("An etched mirror", not "A etched mirror") — a table roll can't carry a/an. */
export function artObjectLine(c: Composer, withCondition = false): string {
  const form = c.text('{table:gm/loot/art-form}');
  const article = /^[aeiou]/i.test(form) ? 'An' : 'A';
  const tail = c.text(
    '{table:gm/loot/art-material}, of {table:gm/loot/art-subject}.' +
      (withCondition ? ' It is {table:gm/loot/art-condition}.' : ''),
  );
  return `${article} ${form} worked in ${tail}`;
}

export interface HoardResult {
  sections: Block[];
  coinText: string;
  gemCount: number;
  artCount: number;
  itemCount: number;
}

/** Assemble a full hoard's blocks for a challenge tier under the given dials.
 *  Shared by the Hoard tool and the Dungeon builder's inner sanctum. */
export function hoardSections(
  c: Composer,
  tierValue: string,
  dials: HoardDials = {},
  opts: { container?: boolean; map?: boolean } = {},
): HoardResult {
  const tier = tierFor(tierValue);
  const container = opts.container ?? true;

  const coinText = coinsFor(c, tier, dials.coins);

  // Gems & valuables: the tier's gem count, scaled, plus a few art objects at
  // the richer settings (treasure with a story).
  const gemMult = pick(GEM_MULT, dials.valuables, 'standard');
  const gemCount = Math.max(0, Math.round(tier.gemCount(c) * gemMult));
  const valuables: string[] = [];
  for (let i = 0; i < gemCount; i++) {
    valuables.push(c.text(`${GEM_CUT} {table:${c.among(tier.gemTiers)}}`));
  }
  const artCount =
    dials.valuables === 'none' || dials.valuables === 'few'
      ? 0
      : dials.valuables === 'many'
        ? 1 + (c.chance(0.5) ? 1 : 0)
        : c.chance(0.5)
          ? 1
          : 0;
  for (let i = 0; i < artCount; i++) valuables.push(artObjectLine(c));

  // Magic items: roll the tier's independent chances, then trim or pad by dial.
  let items: string[] = [];
  const shift = pick(ITEM_SHIFT, dials.items, 'standard');
  if (shift > -50) {
    for (const [p, template] of tier.items) {
      if (c.chance(p)) items.push(c.distinct(template, items));
    }
    if (shift < 0) items = items.slice(0, Math.max(0, items.length + shift));
    else for (let i = 0; i < shift; i++) items.push(c.distinct(tier.items[0]![1], items));
  }

  const sections: Block[] = [
    { type: 'keyValue', pairs: [{ key: 'Coins', value: coinText || 'none — the wealth here is all in kind' }] },
  ];
  if (valuables.length) sections.push({ type: 'list', label: 'Gems & Valuables', items: valuables });
  if (items.length) sections.push({ type: 'list', label: 'Magic Items', items });
  else sections.push({ type: 'paragraph', label: 'Magic Items', text: 'None — this time.' });
  if (container) {
    sections.push({ type: 'paragraph', label: 'The Container', text: c.text('{table:gm/loot/treasure-chest}') });
  }
  if ((opts.map ?? true) && c.chance(0.2)) {
    sections.push({ type: 'paragraph', label: 'Folded Among the Coins', text: c.text('{table:gm/loot/treasure-map}') });
  }

  return { sections, coinText, gemCount, artCount, itemCount: items.length };
}

export const meta: CompositeMeta = {
  id: 'gm/hoard',
  title: 'Treasure Hoard',
  pillar: 'gm',
  description:
    'A full hoard by challenge tier: coins, gemstones from the right value bracket, art objects, magic items, and the trapped chest holding it all. Dial each category up or down — lean on the coin, load it with magic, strip it to a bare purse — to match what your table actually needs.',
  addLabel: 'Add hoard',
  options: [
    {
      id: 'tier',
      label: 'Challenge tier',
      choices: TIERS.map((t) => ({ value: t.value, label: t.label })),
      default: '5-10',
    },
    { id: 'coins', label: 'Coins', choices: COIN_CHOICES, default: 'standard' },
    { id: 'valuables', label: 'Gems & art', choices: GEM_CHOICES, default: 'standard' },
    { id: 'items', label: 'Magic items', choices: ITEM_CHOICES, default: 'standard' },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const tier = tierFor(opts.tier ?? '5-10');
  const { sections, gemCount, artCount, itemCount } = hoardSections(c, tier.value, {
    coins: opts.coins,
    valuables: opts.valuables,
    items: opts.items,
  });

  const valuableCount = gemCount + artCount;
  const bits = [
    tier.label,
    `${valuableCount} valuable${valuableCount === 1 ? '' : 's'}`,
    `${itemCount} magic item${itemCount === 1 ? '' : 's'}`,
  ];
  return [{ type: 'statblock', name: 'Treasure Hoard', meta: bits.join(' · '), sections }];
}
