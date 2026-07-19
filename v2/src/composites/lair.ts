// Lair: the home of a single dangerous thing — the resident (a beast or a named
// villain), the guardians it keeps, the way in, the signs that give it away
// from a distance, and the treasure it hoards. Smaller and more focused than a
// dungeon: one resident and its den, not a whole delve (review complaint 3c).

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';
// ONE set of DMG brackets, shared with the Hoard tool (§10.6 review — this
// file's private coin echo had drifted). gen-registries follows this sibling
// import when computing the table closure.
import { coinLine, gemTableFor, prizeTemplateFor } from './hoard.ts';
import { srdSections } from './srd.ts';

// the resident stands above the party; the guardians are a rung or two below it
const residentCr = (level: number): number => Math.min(25, Math.max(1, level + 2));
const guardCr = (level: number): number => Math.min(20, Math.max(1, level - 1));
// the hoard matches the RESIDENT that gathered it, not the visiting party
const hoardTier = (cr: number): string => (cr <= 4 ? '0-4' : cr <= 10 ? '5-10' : cr <= 16 ? '11-16' : '17+');

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
  const tier = hoardTier(rCr);

  const beast = c.text(`{table:gm/monsters/all#cr-${rCr}}`);
  const name = villainLed
    ? `The Lair of ${c.text('{table:gm/tavern/name-person}')}`
    : `The ${beast[0]!.toUpperCase()}${beast.slice(1)}'s Den`;

  const sections: Block[] = [
    { type: 'paragraph', label: 'The Approach', text: c.text('{table:gm/adventure/point-of-interest}') },
    // a from-a-distance giveaway from its own authored table — this used to
    // read wall GRAFFITI as something visible from afar (§10.6 review)
    { type: 'paragraph', label: 'The Tell', text: `From a distance, something gives it away: ${c.text('{table:gm/lair/tell}')}` },
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
  const gem = c.text(`{pick:A rough-cut|A polished|An uncut} {table:${gemTableFor(c, tier)}}`);
  const prize = c.chance(0.8) ? c.text(prizeTemplateFor(tier)) : 'nothing enchanted — only what it has killed for';
  sections.push({
    type: 'keyValue',
    pairs: [
      { key: 'Coins', value: coinLine(c, tier) },
      { key: 'Among the Filth', value: gem },
      { key: 'The Prize', value: prize },
    ],
  });

  if (c.chance(0.5)) {
    // a MOTIVE for the site, not a room description (§10.6 review)
    sections.push({ type: 'paragraph', label: 'Why Here', text: c.text('{table:gm/lair/why-here}') });
  }

  // the resident and its guardians, runnable at the table (audit batch E)
  sections.push(...srdSections(tables, [beast, guardian]));

  return [
    {
      type: 'statblock',
      name,
      meta: `Lair · ${villainLed ? 'villain' : 'beast'} · resident CR ${rCr}`,
      sections,
    },
  ];
}
