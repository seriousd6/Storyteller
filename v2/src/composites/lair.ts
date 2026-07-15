// Lair: the home of a single dangerous thing — the resident (a beast or a named
// villain), the guardians it keeps, the way in, the signs that give it away
// from a distance, and the treasure it hoards. Smaller and more focused than a
// dungeon: one resident and its den, not a whole delve (review complaint 3c).

import { makeComposer, type CompositeMeta, type Composer } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

// the resident stands above the party; the guardians are a rung or two below it
const residentCr = (level: number): number => Math.min(25, Math.max(1, level + 2));
const guardCr = (level: number): number => Math.min(20, Math.max(1, level - 1));
const hoardTier = (level: number): string => (level <= 4 ? '0-4' : level <= 10 ? '5-10' : level <= 16 ? '11-16' : '17+');

const COINS: Record<string, (c: Composer) => string> = {
  '0-4': (c) => `${(c.dice(2, 6) * 10).toLocaleString('en-US')} gp and a scatter of silver`,
  '5-10': (c) => `${(c.dice(6, 6) * 100).toLocaleString('en-US')} gp, ${(c.dice(3, 6) * 10).toLocaleString('en-US')} pp`,
  '11-16': (c) => `${(c.dice(4, 6) * 1000).toLocaleString('en-US')} gp, ${(c.dice(5, 6) * 100).toLocaleString('en-US')} pp`,
  '17+': (c) => `${(c.dice(12, 6) * 1000).toLocaleString('en-US')} gp, ${(c.dice(8, 6) * 1000).toLocaleString('en-US')} pp`,
};
const GEMS: Record<string, string> = { '0-4': 'gm/loot/gems-tier2', '5-10': 'gm/loot/gems-tier3', '11-16': 'gm/loot/gems-tier4', '17+': 'gm/loot/gems-tier5' };
const ITEM: Record<string, string> = { '0-4': 'gm/loot/magic-item-minor', '5-10': 'gm/loot/magic-item-minor', '11-16': 'gm/loot/magic-item-major', '17+': 'gm/loot/magic-item-major' };

export const meta: CompositeMeta = {
  id: 'gm/lair',
  title: 'Lair',
  pillar: 'gm',
  description:
    "A single monster's or villain's den: the resident, the guardians it keeps, the way in, the tell that betrays it, and the treasure it hoards — sized to your party.",
  addLabel: 'Add lair',
  options: [
    {
      id: 'kind',
      label: 'Resident',
      choices: [
        { value: 'beast', label: 'A beast or monster' },
        { value: 'villain', label: 'A named villain' },
      ],
      default: 'beast',
    },
    {
      id: 'level',
      label: 'Party level',
      choices: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` })),
      default: '3',
    },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const level = Math.min(20, Math.max(1, Number(opts.level) || 3));
  const villainLed = (opts.kind ?? 'beast') === 'villain';
  const rCr = residentCr(level);
  const gCr = guardCr(level);
  const tier = hoardTier(level);

  const beast = c.text(`{table:gm/monsters/all#cr-${rCr}}`);
  const name = villainLed
    ? `The Lair of ${c.text('{table:gm/tavern/name-person}')}`
    : `The ${beast[0]!.toUpperCase()}${beast.slice(1)}'s Den`;

  const sections: Block[] = [
    { type: 'paragraph', label: 'The Approach', text: c.text('{table:gm/adventure/point-of-interest}') },
    { type: 'paragraph', label: 'The Tell', text: `From a distance, something gives it away: ${c.text('{table:gm/dungeon/graffiti}')}` },
  ];

  const guardCount = 2 + Math.floor(c.rng() * 3); // 2–4 guardians
  const guardian = c.text(`{table:gm/monsters/all#cr-${gCr}}`);

  const pairs: Array<{ key: string; value: string }> = [];
  if (villainLed) {
    // a named villain who commands the den; the beast is its enforcer
    pairs.push({ key: 'The Villain', value: `${c.text('{table:gm/villain/motive}')} — served by ${beast} (CR ${rCr})` });
  } else {
    pairs.push({ key: 'The Resident', value: `${beast} — CR ${rCr}` });
  }
  pairs.push({ key: 'Guardians', value: `${guardCount} × ${guardian} — CR ${gCr} each` });
  pairs.push({ key: 'Hazard of the Den', value: c.text('{table:gm/dungeon/hazard}') });
  sections.push({ type: 'keyValue', pairs });

  // what it keeps — a beast hoards by instinct, a villain by design
  const gem = c.text(`{pick:A rough-cut|A polished|An uncut} {table:${GEMS[tier]}}`);
  const prize = c.chance(0.8) ? c.text(`{table:${ITEM[tier]}}`) : 'nothing enchanted — only what it has killed for';
  sections.push({
    type: 'keyValue',
    pairs: [
      { key: 'Coins', value: COINS[tier]!(c) },
      { key: 'Among the Filth', value: gem },
      { key: 'The Prize', value: prize },
    ],
  });

  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'Why Here', text: c.text('{table:gm/dungeon/room}') });
  }

  return [
    {
      type: 'statblock',
      name,
      meta: `Lair · ${villainLed ? 'villain' : 'beast'} · resident CR ${rCr}`,
      sections,
    },
  ];
}
