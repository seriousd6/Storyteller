// Settlement: a village, town, or city as one statblock — name, first
// impression, government, economy, trade, and what's brewing. The missing
// rung of the drill-down chain (region → settlement → building → person):
// with this, region pages suggest ghost settlements, and every kept
// settlement suggests its own taverns, shops, and residents.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';
import { SETTLE_TYPES, deriveSettleType, profileFor, typeLabel, localGovernment, type SettleType } from '../everdeep/placeProfile.ts';

export const meta: CompositeMeta = {
  id: 'gm/settlement',
  title: 'Settlement',
  pillar: 'gm',
  description:
    'A whole settlement in one roll: its kind of place (which locks a coherent economy and trade), name, first impression, government and mood, local cuisine, and the trouble currently brewing.',
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
    {
      // node-type locking (owner, batch 76): choosing a kind of place first
      // keeps the economy/trade/standing self-consistent even in a blind roll.
      // "auto" derives it from size + biome the way the world map does.
      id: 'type',
      label: 'Kind of place',
      choices: [
        { value: 'auto', label: 'Fit the land' },
        { value: 'farming village', label: 'Farming village' },
        { value: 'fishing village', label: 'Fishing village' },
        { value: 'market town', label: 'Market town' },
        { value: 'river port', label: 'River port' },
        { value: 'coastal town', label: 'Coastal town' },
        { value: 'regional city', label: 'Regional city' },
        { value: 'royal seat', label: 'Royal seat' },
      ],
      default: 'auto',
    },
  ],
};

const POP: Record<string, string> = {
  hamlet: '{num:25-180}',
  village: '{num:80-600}',
  town: '{num:600-4000}',
  city: '{num:4000-30000}',
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const size = opts.size ?? 'town';
  const abandoned = /^(1|true|yes)$/i.test(opts.abandoned ?? '');
  // ancestor context (owner, batch 20): a town inside a realm lives under the
  // realm's law — it does not roll its own government. Anarchic realms are the
  // exception: there, every town fends for itself.
  const realmGov = (opts.government ?? '').trim();
  const anarchic = /anarch|lawless|no law|none/i.test(realmGov);

  // --- coherent CORE first, flavor after (owner, batch 76) ---
  // A node type is fixed before anything is rolled, then it LOCKS the economy,
  // trade, and standing so they can never contradict each other or the biome —
  // the additive pattern the encounter builder already uses. When the caller
  // knows the type (a baked node, an explicit pick) we honour it; otherwise it
  // is derived from size + biome the way the world map derives it.
  const biome = (opts.biome ?? '').trim();
  const known = SETTLE_TYPES.includes(opts.type as SettleType) ? (opts.type as SettleType) : null;
  const type = known ?? deriveSettleType({
    biome: biome || undefined,
    size,
    coastal: opts.coastal ? /^(1|true|yes)$/i.test(opts.coastal) : undefined,
    river: opts.river ? /^(1|true|yes)$/i.test(opts.river) : undefined,
    greatRiver: opts.greatRiver ? /^(1|true|yes)$/i.test(opts.greatRiver) : undefined,
    roll: c.rng(),
  });
  const profile = profileFor(type, biome);

  // Names built from the shared name-part tables: "Swampholt", "Alder Crossing",
  // "Highmarket". Pattern chosen in code — {pick:} tokens don't nest.
  const pattern = Number(c.text('{num:1-3}'));
  const name =
    pattern === 1
      ? c.text('{table:gm/tavern/name-place}') + c.text('{pick:holt|ford|mere|stead|wick|bury|dale|march|haven|field}')
      : pattern === 2
        ? c.text('{table:gm/tavern/name-place} {pick:Crossing|Hollow|Reach|Gate|Rest|Landing}')
        : c.text('{pick:High|Old|New|North|West}') + c.text('{pick:bridge|market|shore|cliff|gate|well}');
  // tier-aware slots (owner, batch 26): when the world already KNOWS this
  // place's population (a density ghost, a baked town), the page must agree
  // with the map instead of rolling a contradiction
  const popGiven = Number(opts.population);
  const popNum = Number.isFinite(popGiven) && popGiven > 0 ? Math.round(popGiven) : null;
  const population = abandoned ? '0'
    : popNum !== null ? popNum.toLocaleString('en-US')
    : c.text(POP[size] ?? POP.town!);

  const metaLine = `${size[0]!.toUpperCase()}${size.slice(1)} · pop. ${population} · ${typeLabel(type)}`;

  // An abandoned place isn't a thriving town with a note pinned to it — it is
  // generated as empty from the start, so nothing inside contradicts the ruin.
  if (abandoned) {
    return [{
      type: 'statblock',
      name,
      meta: metaLine,
      sections: [
        { type: 'paragraph', label: 'What Remains', text: `Once ${profile.economy.charAt(0).toLowerCase()}${profile.economy.slice(1).replace(/\.$/, '')} — now doors swing on their hinges and the wells are choked with leaves. Whatever lairs nearby emptied it; clear that, and people may return.` },
        { type: 'keyValue', pairs: [{ key: 'Was', value: typeLabel(type) }, { key: 'Standing', value: profile.standing }] },
      ],
    }];
  }

  // a settlement-scale LOCAL government, not the realm's page-long constitution
  // (batch 77): a reeve/mayor/council keeping the realm's law, or self-rule
  const government = localGovernment({ size, realmGov, anarchic, roll: c.rng() });
  const sections: Block[] = [
    { type: 'paragraph', label: 'At First Glance', text: c.text('{table:gm/settlement/first-glance}') },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Government', value: government },
        // town-scale mood, not a nation's morale essay (owner, batch 81)
        { key: 'Mood', value: c.text('{table:gm/settlement/mood}') },
        // economy & trade are LOCKED to the node type + biome, not blind rolls
        { key: 'Economy', value: profile.economy },
        { key: 'Trade', value: profile.trade },
        { key: 'Cuisine', value: c.text('{table:gm/government/cuisine}') },
      ],
    },
    // the one memorable thing about this place — rolled once, always, the way an
    // NPC always gets a quirk (owner, batch 77: places had no such roller)
    { type: 'paragraph', label: 'What Sets It Apart', text: c.text('{table:gm/settlement/signature}') },
    { type: 'paragraph', label: 'Why It Stands Here', text: profile.standing },
    // town-scale trouble, not realm politics (owner, batch 81)
    { type: 'paragraph', label: 'Trouble Brewing', text: c.text('{table:gm/settlement/trouble}') },
  ];
  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'Behind Closed Doors', text: c.text('{table:gm/settlement/undercurrent}') });
  }

  return [
    {
      type: 'statblock',
      name,
      meta: metaLine,
      sections,
    },
  ];
}
