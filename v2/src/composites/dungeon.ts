// Dungeon: a themed multi-room delve as one page — a warded gate, a run of
// rooms each with its own trouble, and an inner sanctum where the boss guards a
// hoard. Assembles the dungeon content tables (room / riddle / hazard /
// graffiti) with a party-sized boss (gm/monsters/all, CR-tagged like the
// encounter builder) and treasure drawn from the matching hoard tier. The
// missing rung below a landmark (ARCHITECTURE §5.3, review complaint 3c):
// a landmark is one room; a dungeon is the whole delve.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';
// ONE set of DMG brackets: the tier tables live in hoard.ts, and the private
// echo this file used to keep had already drifted from them (§10.6 review).
// gen-registries follows this sibling import when computing the table closure.
import { coinLine, gemTableFor, prizeTemplateFor } from './hoard.ts';

const THEME = ['Sunken', 'Forgotten', 'Blighted', 'Weeping', 'Gilded', 'Shattered', 'Whispering', 'Buried', 'Drowned', 'Ashen', 'Thorned', 'Hollow', 'Cursed', 'Starless', 'Sundered'];
const SITE = ['Crypt', 'Warren', 'Vault', 'Catacomb', 'Barrow', 'Delve', 'Hold', 'Sanctum', 'Undercroft', 'Labyrinth', 'Reliquary', 'Oubliette', 'Deep', 'Tomb'];

const SIZES: Record<string, [number, number]> = { small: [3, 4], medium: [4, 6], large: [6, 8] };

// The boss stands a little above the party (a delve's finale), and the hoard
// matches the BOSS's tier — keyed off party level it crossed the DMG bracket
// one rung below the guardian (a CR-6 boss over a 70 gp vault).
const bossCr = (level: number): number => Math.min(25, Math.max(1, level + 2));
const hoardTier = (cr: number): string => (cr <= 4 ? '0-4' : cr <= 10 ? '5-10' : cr <= 16 ? '11-16' : '17+');

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
  const cr = bossCr(level);
  const tier = hoardTier(cr); // the vault matches its guardian, not the visitors

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
  const gem = c.text(`{pick:A rough-cut|A polished|A brilliant-cut|An uncut} {table:${gemTableFor(c, tier)}}`);
  const prize = c.chance(0.85) ? c.text(prizeTemplateFor(tier)) : 'nothing enchanted — this time';
  sections.push({ type: 'paragraph', label: 'The Inner Sanctum', text: `The delve ends here, where ${boss} keeps what the delvers came for.` });
  sections.push({
    type: 'keyValue',
    pairs: [
      { key: 'Guardian', value: `${boss} — CR ${cr}` },
      { key: 'Coins', value: coinLine(c, tier) },
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
