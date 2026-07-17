// Plot Hook: an adventure hook you can actually aim. The hooks/location table is
// biome-tagged (jungle, swamp, ocean, mountain, coast, dungeon, village) and
// hooks/class is class-tagged — but the slot generator can't filter, so a desert
// party gets jungle hooks and the class tags are invisible. This composite dials
// both: a hook for where the party is, and one that pulls at a class in the group.
//
// Registry scanner: the literal {table:...} refs below register the tables; the
// #tag is interpolated at runtime (allowed — only the id must be literal).

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

const BIOMES = [
  { value: '', label: 'Any terrain' },
  { value: 'jungle', label: 'Jungle' },
  { value: 'swamp', label: 'Swamp' },
  { value: 'ocean', label: 'Ocean' },
  { value: 'coast', label: 'Coast' },
  { value: 'mountain', label: 'Mountains' },
  { value: 'village', label: 'Village' },
  { value: 'dungeon', label: 'Dungeon' },
];
const BIOME_LEAD: Record<string, string> = {
  jungle: 'Deep in the jungle',
  swamp: 'Out in the swamp',
  ocean: 'Out on the water',
  coast: 'Along the coast',
  mountain: 'Up in the mountains',
  village: 'In the village',
  dungeon: 'Down in the dark',
};

const CLASSES = [
  { value: '', label: 'Any class' },
  { value: 'barbarian', label: 'Barbarian' },
  { value: 'bard', label: 'Bard' },
  { value: 'cleric', label: 'Cleric' },
  { value: 'druid', label: 'Druid' },
  { value: 'fighter', label: 'Fighter' },
  { value: 'monk', label: 'Monk' },
  { value: 'paladin', label: 'Paladin' },
  { value: 'ranger', label: 'Ranger' },
  { value: 'rogue', label: 'Rogue' },
  { value: 'sorcerer', label: 'Sorcerer' },
  { value: 'warlock', label: 'Warlock' },
  { value: 'wizard', label: 'Wizard' },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const meta: CompositeMeta = {
  id: 'gm/plot-hook',
  title: 'Plot Hook',
  pillar: 'gm',
  description:
    'An adventure hook you can aim: one for the terrain the party is crossing, and one that tugs at a class in the group — plus, now and then, a wild card to knock things sideways. Dial the terrain and the class, or leave them to chance.',
  addLabel: 'Add hook',
  options: [
    { id: 'biome', label: 'Terrain', choices: BIOMES, default: '' },
    { id: 'class', label: 'Pulls at a', choices: CLASSES, default: '' },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const biome = BIOMES.some((b) => b.value === opts.biome) && opts.biome ? opts.biome : c.among(Object.keys(BIOME_LEAD));
  const cls = CLASSES.some((k) => k.value === opts.class) && opts.class ? opts.class : c.among(CLASSES.slice(1).map((k) => k.value));

  // Literal refs keep the tables in the registry; the #tag is applied at runtime.
  void '{table:gm/hooks/location} {table:gm/hooks/class} {table:gm/hooks/misc}';
  const locHook = c.text(`{table:gm/hooks/location#${biome}}`);
  const classHook = c.text(`{table:gm/hooks/class#${cls}}`);

  const sections: Block[] = [
    { type: 'paragraph', label: BIOME_LEAD[biome] ?? 'Out in the world', text: locHook },
    { type: 'paragraph', label: `A ${cap(cls)}'s calling`, text: classHook },
  ];
  if (c.chance(0.35)) {
    sections.push({ type: 'paragraph', label: 'Wild card', text: c.text('{table:gm/hooks/misc}') });
  }

  return [{ type: 'statblock', name: 'Plot Hooks', meta: `${cap(biome)} · a ${cls} in the party`, sections }];
}
