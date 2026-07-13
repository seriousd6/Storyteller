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
  options: [],
};

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
// picks that cannot exist in the biome — rerolled away
const EXCLUDE: Partial<Record<BiomeGroup, RegExp>> = {
  dry: /waterfall|spring|river|lake|pond|marsh|bog|swamp|moss|snow|glacier|frozen|ice\b/i,
  cold: /jungle|palm|desert|dune|scorch|cactus/i,
  open: /waterfall|glacier|dune|jungle/i,
  high: /swamp|marsh|dune|palm/i,
  wood: /dune|desert|glacier/i,
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const name = c.text('{table:solo/quest/place-name}');
  const group = BIOME_GROUP[(opts.biome ?? '').trim()] ?? null;
  let site = c.text('{table:gm/adventure/point-of-interest}');
  const ex = group ? EXCLUDE[group] : undefined;
  for (let i = 0; i < 4 && ex && ex.test(site); i++) site = c.text('{table:gm/adventure/point-of-interest}');

  const sections: Block[] = [
    ...(group ? [{ type: 'paragraph', label: 'The Setting', text: c.text(SETTING[group]) } as Block] : []),
    { type: 'paragraph', label: 'The Site', text: site },
    { type: 'paragraph', label: 'Within', text: c.text('{table:gm/dungeon/room}') },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Hazard', value: c.text('{table:gm/dungeon/hazard}') },
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
