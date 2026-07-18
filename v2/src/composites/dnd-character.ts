// D&D 5e character builder (SRD 5.1): pick a class, race, background, and level
// — or leave any to chance — and get a mechanically-correct, playable sheet.
// The rules live in engine/dnd5e.ts (pure + tested); this composes the result
// into sheet blocks. Opening it in the Sheet Builder (the Batch 219/220 bridge)
// makes the randomizable pieces editable in edit mode and locked in play, per
// the owner's ask. SRD 5.1 © Wizards of the Coast, CC BY 4.0 (LICENSE-SRD.md).

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, TableRegistry } from '../engine/types.ts';
import {
  CLASSES, RACES, BACKGROUNDS, ABILITIES, ABILITY_LABEL, SKILLS,
  computeCharacter, fmtMod, type Ability, type AbilityMethod,
} from '../engine/dnd5e.ts';

const FULL_ABILITY: Record<Ability, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
const ordinal = (n: number): string => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 === 10 ? 0 : n % 10)] ?? 'th'}`;

const RANDOM = { value: '', label: '✨ Random' };

export const meta: CompositeMeta = {
  id: 'gm/dnd-character',
  title: 'D&D Character',
  pillar: 'gm',
  description:
    'A playable 5e character (SRD 5.1): choose class, race, background, and level — or roll them — and the sheet computes ability scores with racial bonuses, proficiency, hit points, saves, skills, spell slots, and features. Open it in the Sheet Builder to tweak, reroll, and print.',
  addLabel: 'Add character',
  options: [
    { id: 'class', label: 'Class', default: '', choices: [RANDOM, ...CLASSES.map((c) => ({ value: c.id, label: c.name }))] },
    { id: 'race', label: 'Race', default: '', choices: [RANDOM, ...RACES.map((r) => ({ value: r.id, label: r.name }))] },
    { id: 'background', label: 'Background', default: '', choices: [RANDOM, ...BACKGROUNDS.map((b) => ({ value: b.id, label: b.name }))] },
    { id: 'level', label: 'Level', default: '1', choices: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` })) },
    { id: 'abilities', label: 'Ability scores', default: 'array', choices: [{ value: 'array', label: 'Standard array' }, { value: 'roll', label: 'Roll 4d6 drop lowest' }] },
  ],
};

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  // Consume the rng stream FIRST (computeCharacter), then the table rolls
  // (c.text uses derived seeds, not the rng) — keeps the whole build deterministic.
  const r = computeCharacter(
    {
      cls: opts.class ?? '', race: opts.race ?? '', background: opts.background ?? '',
      level: Number(opts.level) || 1, method: (opts.abilities as AbilityMethod) === 'roll' ? 'roll' : 'array',
    },
    c.rng,
  );

  const nameRoll = c.text('{table:gm/npc/race}');
  const name = /Name:\s*(.+?)\./.exec(nameRoll)?.[1]?.trim() ?? 'New Adventurer';
  const weaponAbility: Ability = r.mods.str >= r.mods.dex ? 'str' : 'dex';

  const blocks: Block[] = [
    { type: 'title', text: name, subtitle: `Level ${r.level} ${r.race.name} ${r.cls.name}` },
    { type: 'image', layout: 'float-right', caption: '' },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Class & Level', value: `${r.cls.name} ${r.level}` },
        { key: 'Race', value: r.race.name },
        { key: 'Background', value: r.background.name },
        { key: 'Alignment', value: r.alignment },
      ],
    },
    {
      type: 'statGrid', computeMods: true, rollable: true,
      stats: ABILITIES.map((a) => ({ label: ABILITY_LABEL[a], value: String(r.abilities[a]) })),
    },
    {
      type: 'statGrid', computeMods: false, rollable: false,
      stats: [
        { label: 'Prof', value: String(r.prof), sub: 'bonus' },
        { label: 'AC', value: String(r.ac), sub: 'unarmored' },
        { label: 'Init', value: fmtMod(r.mods.dex), sub: 'DEX' },
        { label: 'Speed', value: String(r.speed), sub: 'feet' },
      ],
    },
    { type: 'paragraph', label: 'How it rolls', text: `Tap an ability, save, skill, or attack to roll it — modifiers read live, so raising a score updates every roll. Proficient saves and skills already fold in $prof (${fmtMod(r.prof)}). Level up: bump Prof and Hit Points. Ability scores use the ${opts.abilities === 'roll' ? 'rolled 4d6-drop-lowest' : 'standard array'}, with ${r.race.name} increases applied.` },
    { type: 'tracker', label: 'Hit Points', current: r.maxHp, max: r.maxHp, style: 'number' },
    { type: 'tracker', label: 'Temp HP', current: 0, style: 'number' },
    { type: 'tracker', label: 'Hit Dice', current: r.level, max: r.level, style: 'number' },
    { type: 'tracker', label: 'Death Saves — Successes', current: 0, max: 3, style: 'boxes' },
    { type: 'tracker', label: 'Death Saves — Failures', current: 0, max: 3, style: 'boxes' },
    {
      type: 'actions', title: 'Saving Throws',
      items: ABILITIES.map((a) => {
        const prof = r.saves.includes(a);
        return { label: FULL_ABILITY[a], note: prof ? `${ABILITY_LABEL[a]} · proficient` : ABILITY_LABEL[a], rolls: [{ name: 'save', formula: `1d20+$${a}.mod${prof ? '+$prof' : ''}` }] };
      }),
    },
    {
      type: 'actions', title: 'Skills',
      items: SKILLS.map((s) => {
        const prof = r.skills.includes(s.name);
        return { label: s.name, note: prof ? `${ABILITY_LABEL[s.ability]} · proficient` : ABILITY_LABEL[s.ability], rolls: [{ name: 'check', formula: `1d20+$${s.ability}.mod${prof ? '+$prof' : ''}` }] };
      }),
    },
    {
      type: 'actions', title: 'Attacks',
      items: [
        { label: 'Weapon (melee)', note: ABILITY_LABEL[weaponAbility], rolls: [{ name: 'to hit', formula: `1d20+$${weaponAbility}.mod+$prof` }, { name: 'damage', formula: `1d8+$${weaponAbility}.mod` }] },
        { label: 'Unarmed strike', note: ABILITY_LABEL[weaponAbility], rolls: [{ name: 'to hit', formula: `1d20+$${weaponAbility}.mod+$prof` }, { name: 'damage', formula: `1+$${weaponAbility}.mod` }] },
      ],
    },
    {
      type: 'actions', title: 'Rolls',
      items: [
        { label: 'Initiative', note: 'DEX', rolls: [{ name: 'roll', formula: '1d20+$dex.mod' }] },
        ...(r.spellcasting ? [{ label: 'Spell attack', note: `${ABILITY_LABEL[r.spellcasting.ability]} + prof`, rolls: [{ name: 'to hit', formula: `1d20+$prof+$${r.spellcasting.ability}.mod` }] }] : []),
        { label: 'Death saving throw', note: '10+ succeeds', rolls: [{ name: 'd20', formula: '1d20' }] },
        { label: 'Roll a stat', note: '4d6 drop lowest', rolls: [{ name: 'score', formula: '4d6dl1' }] },
      ],
    },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Saving Throws', value: r.saves.map((a) => ABILITY_LABEL[a]).join(', ') },
        { key: 'Skill Proficiencies', value: r.skills.join(', ') },
        { key: 'Armor', value: r.cls.armor },
        { key: 'Weapons', value: r.cls.weapons },
      ],
    },
  ];

  if (r.spellcasting) {
    const sc = r.spellcasting;
    blocks.push({
      type: 'keyValue',
      pairs: [
        { key: 'Spellcasting Ability', value: ABILITY_LABEL[sc.ability] },
        { key: 'Spell Save DC', value: String(sc.saveDc) },
        { key: 'Spell Attack Bonus', value: fmtMod(sc.attack) },
      ],
    });
    if (sc.pact) {
      blocks.push({ type: 'tracker', label: `Pact Slots (${ordinal(sc.pact.slotLevel)}-level)`, current: sc.pact.count, max: sc.pact.count, style: 'boxes' });
    } else {
      sc.slots.forEach((n, i) => {
        if (n > 0) blocks.push({ type: 'tracker', label: `Spell Slots — ${ordinal(i + 1)}`, current: n, max: n, style: 'boxes' });
      });
    }
    blocks.push({
      type: 'list', label: 'Spells',
      items: ['Cantrip — {table:gm/spells/cantrips}', 'Cantrip — {table:gm/spells/cantrips}', '1st level — {table:gm/spells/level-1}', '1st level — {table:gm/spells/level-1}'].map((t) => c.text(t)),
    });
  }

  blocks.push(
    { type: 'list', label: 'Features & Traits', items: r.featureLog.map((f) => `${f.name} (${f.source})`) },
    { type: 'paragraph', label: 'Personality Trait', text: c.text('{table:gm/npc/demeanor}') },
    { type: 'paragraph', label: 'Ideal', text: 'What does your character believe in above all?' },
    { type: 'paragraph', label: 'Bond', text: `A cherished keepsake: ${c.text('{table:gm/npc/keepsake}')}` },
    { type: 'paragraph', label: 'Flaw', text: c.text('{table:gm/npc/flaw-or-prejudice}') },
    { type: 'paragraph', label: 'Backstory', text: c.text('{table:gm/npc/backstory}') },
    { type: 'list', label: 'Inventory', items: ['Explorer\'s pack', 'A weapon of note: {table:gm/loot/weapon-look}', 'Rope, 50 ft.', 'Rations, 5 days'].map((t) => c.text(t)) },
    { type: 'keyValue', pairs: [{ key: 'Gold (gp)', value: '10' }, { key: 'Silver (sp)', value: '0' }, { key: 'Copper (cp)', value: '0' }] },
    { type: 'paragraph', label: 'Notes', text: 'Write here…' },
  );

  return blocks;
}
