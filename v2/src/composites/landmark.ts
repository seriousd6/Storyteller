// Landmark: a place worth a map pin — ruin, shrine, monument, oddity — as one
// statblock: what it is, what's within, what's dangerous, why anyone goes,
// and (half the time) what's really going on. First rung of the drill-down
// chain between settlements and dungeons (Everdeep ARCHITECTURE §5.3).

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

export const meta: CompositeMeta = {
  id: 'gm/landmark',
  title: 'Landmark',
  pillar: 'gm',
  description:
    'A place worth a pin: a named site with a description, a set-piece, a hazard, and a reason to go — ruin, shrine, monument, or something stranger.',
  addLabel: 'Add landmark',
  options: [
    {
      // where the landmark stands — a wild site out in the country, or a
      // city-level feature inside a town (owner, batch 80). Settlements offer
      // both as pickable details on their edit page.
      id: 'setting',
      label: 'Where',
      choices: [
        { value: 'wild', label: 'Out in the country' },
        { value: 'urban', label: 'Inside a town' },
      ],
      default: 'wild',
    },
  ],
};

/** The context that must survive a reroll (§10.6 review): the biome grounds
 *  the EXCLUDE filter — dropped on reroll, a desert ruin's "Within" could come
 *  back as a flooded, ice-rimmed cistern (the batch-82 regression). Setting
 *  keeps an in-town feature in town. Pure pass-through; nothing is rolled. */
export function lockOpts(_tables: TableRegistry, _seed: string, opts: Record<string, string>): Record<string, string> {
  const locked: Record<string, string> = {};
  if (opts.setting) locked.setting = opts.setting;
  if (opts.biome) locked.biome = opts.biome;
  return locked;
}

/** A city-level landmark that stands inside a settlement (batch 80). Entries
 *  are "Name: what it is"; the lead phrase becomes the page name. */
function buildUrban(c: ReturnType<typeof makeComposer>): Block[] {
  const raw = c.text('{table:gm/settlement/feature}').trim();
  const cut = raw.indexOf(':');
  const name = cut > 0 ? raw.slice(0, cut).trim() : raw;
  // guard the empty tail: an entry ending in a bare colon would crash on
  // desc[0].toUpperCase()
  const tail = cut > 0 ? raw.slice(cut + 1).trim() : raw;
  const desc = tail || raw;
  const sections: Block[] = [
    { type: 'paragraph', label: 'In Town', text: `${desc[0]!.toUpperCase()}${desc.slice(1)}` },
  ];
  // half the time, one concrete detail that turns a building into a scene
  if (c.chance(0.5)) {
    sections.push({ type: 'keyValue', pairs: [{ key: 'Right Now', value: c.text('{table:gm/tavern/notice-board}') }] });
  }
  return [{ type: 'statblock', name, meta: 'Landmark · in town', sections }];
}

// ancestor context (owner, batch 20): "water landmarks ending up in the
// plains" — the site must fit its ground. Each biome group gets a setting
// line, and picks that contradict the biome are rerolled.
type BiomeGroup = 'dry' | 'cold' | 'wood' | 'open' | 'high' | 'shore' | 'wet';
const BIOME_GROUP: Record<string, BiomeGroup> = {
  desert: 'dry', savanna: 'dry',
  snow: 'cold', tundra: 'cold', taiga: 'cold',
  forest: 'wood', jungle: 'wood',
  grass: 'open', hills: 'open',
  mountain: 'high',
  beach: 'shore', water: 'shore', deep: 'shore',
  swamp: 'wet', marsh: 'wet',
};
const SETTING: Record<BiomeGroup, string> = {
  dry: '{pick:Half-swallowed by drifting sand, it shimmers in the heat|Sun-bleached and cracked, it rises from the hardpan|Wind-scoured stone in a land that has forgotten rain}.',
  cold: '{pick:Rimmed in old ice, it creaks in the cold|Snow lies unmelted on its northern face year-round|Frost has split its stones into leaning teeth}.',
  wood: '{pick:The canopy closes over it; moss claims every edge|Roots have pried it apart patiently, for centuries|You smell the loam and rot before you see it}.',
  open: '{pick:Visible for miles across the open grass|The wind never stops moving here, and neither does the grass around it|Cattle tracks and old cart ruts converge on it}.',
  high: '{pick:Perched where the air thins and ravens circle|Scree slopes guard every approach|Cloud shadow slides across it like a second architecture}.',
  shore: '{pick:Salt-crusted and hung with dried weed at the tide line|Gulls wheel over it; the surf argues below|Half of it stands in the water, and the water is winning}.',
  wet: '{pick:The ground gives underfoot for a hundred paces around it|Black water pools in every hollow near it|Mist off the marsh hides its base until noon}.',
};
// picks that cannot exist in the biome — rerolled away. Applied to the site
// AND the interior rolls (batch 82: a desert ruin no longer holds a "flooded,
// ice-rimmed cistern"); shore/wet now covered too.
const EXCLUDE: Partial<Record<BiomeGroup, RegExp>> = {
  dry: /waterfall|spring|river|lake|pond|marsh|bog|swamp|moss|snow|glacier|frozen|ice\b|reef|coral|tide|tidal|raining|rainfall|mangrove|kelp|flooded/i,
  cold: /jungle|palm|desert|dune|scorch|cactus/i,
  open: /waterfall|glacier|dune|jungle/i,
  high: /swamp|marsh|dune|palm/i,
  wood: /dune|desert|glacier/i,
  shore: /dune|desert|scorch|cactus|volcano/i,
  wet: /desert|dune|scorch|cactus|arid|drought|glacier|snow|frozen|ice\b/i,
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  if ((opts.setting ?? '') === 'urban') return buildUrban(c);

  const name = c.text('{table:solo/quest/place-name}');
  const group = BIOME_GROUP[(opts.biome ?? '').trim()] ?? null;
  const ex = group ? EXCLUDE[group] : undefined;
  // roll a value, rerolling up to 4× if it contradicts the biome — used for the
  // site and the interior alike so nothing inside fights the ground outside
  const fit = (tpl: string): string => {
    let v = c.text(tpl);
    for (let i = 0; i < 4 && ex && ex.test(v); i++) v = c.text(tpl);
    return v;
  };

  const sections: Block[] = [
    ...(group ? [{ type: 'paragraph', label: 'The Setting', text: c.text(SETTING[group]) } as Block] : []),
    { type: 'paragraph', label: 'The Site', text: fit('{table:gm/adventure/point-of-interest}') },
    { type: 'paragraph', label: 'Within', text: fit('{table:gm/dungeon/room}') },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Hazard', value: fit('{table:gm/dungeon/hazard}') },
        { key: 'Scrawled Here', value: c.text('{table:gm/dungeon/graffiti}') },
      ],
    },
  ];
  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'The Truth of It', text: c.text('{table:gm/adventure/twist}') });
  }

  return [
    {
      type: 'statblock',
      name,
      meta: group ? `Landmark · ${opts.biome}` : 'Landmark',
      sections,
    },
  ];
}
