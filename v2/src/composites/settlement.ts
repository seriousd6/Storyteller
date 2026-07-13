// Settlement: a village, town, or city as one statblock — name, first
// impression, government, economy, trade, and what's brewing. The missing
// rung of the drill-down chain (region → settlement → building → person):
// with this, region pages suggest ghost settlements, and every kept
// settlement suggests its own taverns, shops, and residents.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

export const meta: CompositeMeta = {
  id: 'gm/settlement',
  title: 'Settlement',
  pillar: 'gm',
  description:
    'A whole settlement in one roll: name, first impression, government and mood, economy and trade, local cuisine, and the trouble currently brewing.',
  addLabel: 'Add settlement',
  options: [
    {
      id: 'size',
      label: 'Size',
      choices: [
        { value: 'village', label: 'Village' },
        { value: 'town', label: 'Town' },
        { value: 'city', label: 'City' },
      ],
      default: 'town',
    },
  ],
};

const POP: Record<string, string> = {
  village: '{num:80-600}',
  town: '{num:600-4000}',
  city: '{num:4000-30000}',
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const size = opts.size ?? 'town';
  // ancestor context (owner, batch 20): a town inside a realm lives under the
  // realm's law — it does not roll its own government. Anarchic realms are the
  // exception: there, every town fends for itself.
  const realmGov = (opts.government ?? '').trim();
  const anarchic = /anarch|lawless|no law|none/i.test(realmGov);

  // Names built from the shared name-part tables: "Swampholt", "Alder Crossing",
  // "Highmarket". Pattern chosen in code — {pick:} tokens don't nest.
  const pattern = Number(c.text('{num:1-3}'));
  const name =
    pattern === 1
      ? c.text('{table:gm/tavern/name-place}') + c.text('{pick:holt|ford|mere|stead|wick|bury|dale|march|haven|field}')
      : pattern === 2
        ? c.text('{table:gm/tavern/name-place} {pick:Crossing|Hollow|Reach|Gate|Rest|Landing}')
        : c.text('{pick:High|Old|New|North|West}') + c.text('{pick:bridge|market|shore|cliff|gate|well}');
  const population = c.text(POP[size] ?? POP.town!);

  const government = realmGov && !anarchic
    ? `${realmGov} — the realm's law runs here`
    : c.text('{table:gm/government/government}') + (anarchic ? ' (the realm holds no writ here)' : '');
  const sections: Block[] = [
    { type: 'paragraph', label: 'At First Glance', text: c.text('{table:gm/government/atmosphere}') },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Government', value: government },
        { key: 'Morale', value: c.text('{table:gm/government/morale}') },
        { key: 'Economy', value: c.text('{table:gm/government/economy}') },
        { key: 'Trade', value: c.text('{table:gm/government/trade}') },
        { key: 'Cuisine', value: c.text('{table:gm/government/cuisine}') },
      ],
    },
    { type: 'paragraph', label: 'Trouble Brewing', text: c.text('{table:gm/government/complication}') },
  ];
  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'Behind Closed Doors', text: c.text('{table:gm/government/intrigue}') });
  }

  return [
    {
      type: 'statblock',
      name,
      meta: `${size[0]!.toUpperCase()}${size.slice(1)} · pop. ${population}`,
      sections,
    },
  ];
}
