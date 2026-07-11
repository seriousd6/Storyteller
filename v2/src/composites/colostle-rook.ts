// Colossal Rook builder: assembles a Rook enemy the way the legacy combat tool
// did — a magic type, a weapon, a reward, and a handful of drawn descriptive
// facets (material, architecture, defenses, roar, and more). The number of
// facets is keyed to a "scale" dial, echoing Colostle's draw-a-few-rows idiom.
// All descriptive tables are community/original companion content.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

export const meta: CompositeMeta = {
  id: 'solo/colostle-rook',
  title: 'Colossal Rook',
  pillar: 'solo',
  description:
    'Conjure a Colossal Rook to fight or flee: its magic, its weapon, the reward it guards, and a portrait built from a few drawn details. Draw a card to resolve the fight the Colostle way.',
  addLabel: 'Add Rook',
  deck: true,
  note: 'Colostle is a solo RPG by Nich Angell — the rulebook holds the combat rules. These descriptive tables are community & original companion content.',
  options: [
    {
      id: 'scale',
      label: 'Scale',
      choices: [
        { value: '2', label: 'Lesser (2 traits)' },
        { value: '3', label: 'Standard (3 traits)' },
        { value: '4', label: 'Greater (4 traits)' },
        { value: '5', label: 'Titanic (5 traits)' },
      ],
      default: '3',
    },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const scale = Math.max(2, Math.min(5, parseInt(opts.scale ?? '3', 10) || 3));

  const magic = c.text('{table:solo/colostle/rook-magic}');
  const weapon = c.chance(0.5)
    ? c.text('{table:solo/colostle/weapon-melee}')
    : c.text('{table:solo/colostle/weapon-ranged}');
  // Fight reward: usually salvage, occasionally a legendary item (as in the original).
  const reward = c.chance(0.1)
    ? c.text('{table:solo/colostle/legendary-item}')
    : c.text('{table:solo/colostle/reward}');

  const traits = c.drawN('solo/colostle/rook-detail', scale);

  const sections: Block[] = [
    {
      type: 'keyValue',
      pairs: [
        { key: 'Magic', value: magic },
        { key: 'Weapon', value: weapon },
        { key: 'Reward', value: reward },
      ],
    },
  ];
  if (traits.length) sections.push({ type: 'list', label: 'Appearance', items: traits });

  return [{ type: 'statblock', name: 'A Colossal Rook', meta: `Infused with ${magic} magic`, sections }];
}
