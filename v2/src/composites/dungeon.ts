// Dungeon: a themed multi-room delve as one page — a warded gate, a run of
// rooms each with its own trouble, and an inner sanctum where the boss guards a
// hoard. Assembles the dungeon content tables (room / riddle / hazard /
// graffiti) with a party-sized boss (gm/monsters/all, CR-tagged like the
// encounter builder) and treasure drawn from the matching hoard tier. The
// missing rung below a landmark (ARCHITECTURE §5.3, review complaint 3c):
// a landmark is one room; a dungeon is the whole delve.

import { makeComposer, type CompositeMeta, type Composer } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const THEME = ['Sunken', 'Forgotten', 'Blighted', 'Weeping', 'Gilded', 'Shattered', 'Whispering', 'Buried', 'Drowned', 'Ashen', 'Thorned', 'Hollow', 'Cursed', 'Starless', 'Sundered'];
const SITE = ['Crypt', 'Warren', 'Vault', 'Catacomb', 'Barrow', 'Delve', 'Hold', 'Sanctum', 'Undercroft', 'Labyrinth', 'Reliquary', 'Oubliette', 'Deep', 'Tomb'];

const SIZES: Record<string, [number, number]> = { small: [3, 4], medium: [4, 6], large: [6, 8] };

// The boss stands a little above the party (a delve's finale), and the hoard
// matches its tier — the same DMG brackets the Hoard tool uses.
const bossCr = (level: number): number => Math.min(25, Math.max(1, level + 2));
const hoardTier = (level: number): string => (level <= 4 ? '0-4' : level <= 10 ? '5-10' : level <= 16 ? '11-16' : '17+');

// coins by tier — a compact echo of hoard.ts so a dungeon's prize stands alone
const COINS: Record<string, (c: Composer) => string> = {
  '0-4': (c) => `${(c.dice(2, 6) * 10).toLocaleString('en-US')} gp, ${(c.dice(3, 6) * 100).toLocaleString('en-US')} sp`,
  '5-10': (c) => `${(c.dice(6, 6) * 100).toLocaleString('en-US')} gp, ${(c.dice(3, 6) * 10).toLocaleString('en-US')} pp`,
  '11-16': (c) => `${(c.dice(4, 6) * 1000).toLocaleString('en-US')} gp, ${(c.dice(5, 6) * 100).toLocaleString('en-US')} pp`,
  '17+': (c) => `${(c.dice(12, 6) * 1000).toLocaleString('en-US')} gp, ${(c.dice(8, 6) * 1000).toLocaleString('en-US')} pp`,
};
const GEMS: Record<string, string> = { '0-4': 'gm/loot/gems-tier2', '5-10': 'gm/loot/gems-tier3', '11-16': 'gm/loot/gems-tier4', '17+': 'gm/loot/gems-tier5' };
const ITEM: Record<string, string> = { '0-4': 'gm/loot/magic-item-minor', '5-10': 'gm/loot/magic-item-minor', '11-16': 'gm/loot/magic-item-major', '17+': 'gm/loot/magic-item-major' };

export const meta: CompositeMeta = {
  id: 'gm/dungeon',
  title: 'Dungeon',
  pillar: 'gm',
  description:
    'A themed delve in one roll: a warded gate, a run of rooms each with its own trouble, and an inner sanctum where the boss guards a hoard — sized to your party.',
  addLabel: 'Add dungeon',
  options: [
    {
      id: 'size',
      label: 'Size',
      choices: [
        { value: 'small', label: 'Small (3–4 rooms)' },
        { value: 'medium', label: 'Medium (4–6 rooms)' },
        { value: 'large', label: 'Large (6–8 rooms)' },
      ],
      default: 'medium',
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
  const [lo, hi] = SIZES[opts.size ?? 'medium'] ?? SIZES.medium!;
  const roomCount = lo + Math.floor(c.rng() * (hi - lo + 1));
  const name = `The ${c.among(THEME)} ${c.among(SITE)}`;
  const tier = hoardTier(level);
  const cr = bossCr(level);

  const sections: Block[] = [];
  // the way in is warded — a riddle-gate the delvers must answer or outwit
  sections.push({ type: 'paragraph', label: 'The Warded Gate', text: c.text('{table:gm/dungeon/riddle}') });

  // the rooms — each its own trouble (the room table carries creatures + loot),
  // some with a hazard on top, all kept distinct so no two repeat
  const seen: string[] = [];
  for (let i = 0; i < roomCount; i++) {
    let text = c.distinct('{table:gm/dungeon/room}', seen);
    seen.push(text);
    if (c.chance(0.4)) text += ` **Hazard:** ${c.text('{table:gm/dungeon/hazard}')}`;
    sections.push({ type: 'paragraph', label: `Room ${i + 1}`, text });
  }

  // scratched into the walls somewhere along the way
  sections.push({ type: 'keyValue', pairs: [{ key: 'Scratched Into the Walls', value: c.text('{table:gm/dungeon/graffiti}') }] });

  // the inner sanctum: the boss and the hoard it guards
  const boss = c.text(`{table:gm/monsters/all#cr-${cr}}`);
  const gem = c.text(`{pick:A rough-cut|A polished|A brilliant-cut|An uncut} {table:${GEMS[tier]}}`);
  const prize = c.chance(0.85) ? c.text(`{table:${ITEM[tier]}}`) : 'nothing enchanted — this time';
  sections.push({ type: 'paragraph', label: 'The Inner Sanctum', text: `The delve ends here, where ${boss} keeps what the delvers came for.` });
  sections.push({
    type: 'keyValue',
    pairs: [
      { key: 'Guardian', value: `${boss} — CR ${cr}` },
      { key: 'Coins', value: COINS[tier]!(c) },
      { key: 'Among the Coins', value: gem },
      { key: 'The Prize', value: prize },
      { key: 'The Vault', value: c.text('{table:gm/loot/treasure-chest}') },
    ],
  });

  // half the time, the delve isn't what it looked like from the gate
  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'The Truth of It', text: c.text('{table:gm/adventure/twist}') });
  }

  return [
    {
      type: 'statblock',
      name,
      meta: `Dungeon · ${roomCount} rooms · boss CR ${cr}`,
      sections,
    },
  ];
}
