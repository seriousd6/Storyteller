// D&D 5e character builder (SRD 5.1): pick a class, race, background, subclass,
// and level — or leave any to chance — and get a mechanically-correct, playable
// sheet that follows the rules to 20th level. The rules live in engine/dnd5e.ts
// (pure + tested); this composes the result into sheet blocks.
//
// The subclass dial follows the chosen class and unlocks at the class's real
// subclass level (3 for most; 1 for cleric/sorcerer/warlock; 2 for druid/wizard)
// — see refineOptions below, which Composite.astro applies live. Rolling picks a
// subclass and every level feature, spell, and choice; the dropdowns let a
// player pick instead, and opening the result in the Sheet Builder (the Batch
// 219/220 bridge) makes each piece editable in edit mode and locked in play.
// SRD 5.1 © Wizards of the Coast, CC BY 4.0 (LICENSE-SRD.md).

import { makeComposer, type CompositeMeta, type OptionRefinement } from '../engine/composite.ts';
import { makeRng } from '../engine/rng.ts';
import type { Block, TableRegistry } from '../engine/types.ts';
import {
  CLASSES, RACES, BACKGROUNDS, ABILITIES, ABILITY_LABEL, SKILLS, FIGHTING_STYLES,
  computeCharacter, fmtMod, type Ability, type AbilityMethod, type FeatMode,
} from '../engine/dnd5e.ts';
import { CLASS_SPELLS } from '../engine/dnd5e-spells.ts';

const FULL_ABILITY: Record<Ability, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
const ordinal = (n: number): string => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 === 10 ? 0 : n % 10)] ?? 'th'}`;

const RANDOM = { value: '', label: '✨ Random' };
// Ranger draws from a shorter fighting-style list than fighter/paladin (SRD 5.1).
const RANGER_STYLES = ['Archery', 'Defense', 'Dueling', 'Two-Weapon Fighting'];

export const meta: CompositeMeta = {
  id: 'gm/dnd-character',
  title: 'D&D Character',
  pillar: 'gm',
  description:
    'A playable 5e character (SRD 5.1) that follows the rules to 20th level: choose class, race, background, subclass, and level — or roll them — and the sheet computes ability scores (with racial bonuses and level-up improvements), proficiency, hit points, saves, skills, the full feature progression, subclass features, spell slots, and rolled choices. The subclass dropdown unlocks at your class’s subclass level. Open it in the Sheet Builder to tweak, reroll, and print.',
  addLabel: 'Add character',
  options: [
    { id: 'class', label: 'Class', default: '', choices: [RANDOM, ...CLASSES.map((c) => ({ value: c.id, label: c.name }))] },
    { id: 'race', label: 'Race', default: '', choices: [RANDOM, ...RACES.map((r) => ({ value: r.id, label: r.name }))] },
    { id: 'background', label: 'Background', default: '', choices: [RANDOM, ...BACKGROUNDS.map((b) => ({ value: b.id, label: b.name }))] },
    { id: 'level', label: 'Level', default: '1', choices: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` })) },
    // subclass + fightingStyle are dependent dials — Composite.astro repopulates
    // their choices (and disables them) from refineOptions() as class/level change.
    { id: 'subclass', label: 'Subclass', default: '', choices: [RANDOM] },
    { id: 'fightingStyle', label: 'Fighting Style', default: '', choices: [RANDOM] },
    { id: 'abilities', label: 'Ability scores', default: 'array', choices: [{ value: 'array', label: 'Standard array' }, { value: 'roll', label: 'Roll 4d6 drop lowest' }] },
    { id: 'hp', label: 'Hit points', default: 'average', choices: [{ value: 'average', label: 'Average (fixed)' }, { value: 'roll', label: 'Roll hit dice' }] },
    { id: 'feats', label: 'Level-ups', default: 'roll', choices: [{ value: 'roll', label: 'Roll (scores or a feat)' }, { value: 'scores', label: 'Ability scores only' }, { value: 'feat', label: 'Take a feat' }] },
  ],
};

/** Recompute the subclass + fighting-style dials from the current class/level:
 *  the subclass list follows the class and unlocks at its subclass level; the
 *  fighting-style list appears only for fighter/paladin/ranger, at the right
 *  level. Called by Composite.astro on load and on every change. */
export function refineOptions(opts: Record<string, string>): Record<string, OptionRefinement> {
  const cls = CLASSES.find((c) => c.id === opts.class);
  const level = Number(opts.level) || 1;
  const out: Record<string, OptionRefinement> = {};

  if (!cls) {
    out.subclass = { choices: [RANDOM], disabled: true, note: 'Choose a class first' };
  } else {
    const locked = level < cls.subclassLevel;
    out.subclass = {
      choices: [RANDOM, ...cls.subclasses.map((s) => ({ value: s.id, label: s.name }))],
      disabled: locked,
      note: locked ? `${cls.subLabel} unlocks at level ${cls.subclassLevel}` : cls.subLabel,
    };
  }

  const styleClass = cls && (cls.id === 'fighter' || cls.id === 'paladin' || cls.id === 'ranger');
  const styleLevel = cls?.id === 'fighter' ? 1 : 2;
  if (!styleClass) {
    out.fightingStyle = { choices: [RANDOM], disabled: true, note: cls ? '—' : '' };
  } else {
    const locked = level < styleLevel;
    const pool = cls!.id === 'ranger' ? RANGER_STYLES : FIGHTING_STYLES;
    out.fightingStyle = {
      choices: [RANDOM, ...pool.map((s) => ({ value: s, label: s }))],
      disabled: locked,
      note: locked ? `Chosen at level ${styleLevel}` : '',
    };
  }
  return out;
}

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  // Consume the rng stream FIRST (computeCharacter), then the table rolls
  // (c.text/c.drawN use derived seeds, not the rng) — keeps the build deterministic.
  const r = computeCharacter(
    {
      cls: opts.class ?? '', race: opts.race ?? '', background: opts.background ?? '',
      subclass: opts.subclass ?? '', fightingStyle: opts.fightingStyle ?? '',
      level: Number(opts.level) || 1, method: (opts.abilities as AbilityMethod) === 'roll' ? 'roll' : 'array',
      hp: opts.hp === 'roll' ? 'roll' : 'average', feats: (opts.feats as FeatMode) || 'roll',
    },
    c.rng,
  );

  // Draw class-appropriate spells from the SRD class list, deterministically and
  // independently of the rng stream (so a per-item reroll swaps just that spell).
  const drawFrom = (arr: string[], n: number, key: string): string[] => {
    if (n <= 0 || !arr.length) return [];
    const pool = [...arr];
    const rng = makeRng(`${seed}#${key}`);
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
    return pool.slice(0, Math.min(n, pool.length));
  };

  const nameRoll = c.text('{table:gm/npc/race}');
  const name = /Name:\s*(.+?)\./.exec(nameRoll)?.[1]?.trim() ?? 'New Adventurer';
  const weaponAbility: Ability = r.mods.str >= r.mods.dex ? 'str' : 'dex';
  const subName = r.subclass ? r.subclass.name : `unlocks at level ${r.subclassLevel}`;
  const passivePerception = 10 + r.mods.wis + (r.skills.includes('Perception') ? r.prof : 0);

  const blocks: Block[] = [
    { type: 'title', text: name, subtitle: `Level ${r.level} ${r.race.name} ${r.cls.name}${r.subclass ? ` · ${r.subclass.name}` : ''}` },
    { type: 'image', layout: 'float-right', caption: '' },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Class & Level', value: `${r.cls.name} ${r.level}` },
        { key: r.cls.subLabel, value: subName },
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
        { label: 'Prof', value: fmtMod(r.prof), sub: 'bonus' },
        { label: 'AC', value: String(r.ac), sub: 'unarmored' },
        { label: 'Init', value: fmtMod(r.mods.dex), sub: 'DEX' },
        { label: 'Speed', value: String(r.speed), sub: 'feet' },
        { label: 'Pass. Per', value: String(passivePerception), sub: 'WIS' },
      ],
    },
    { type: 'paragraph', label: 'How it rolls', text: `Tap an ability, save, skill, or attack to roll it — modifiers read live, so raising a score updates every roll. Proficient saves and skills already fold in $prof (${fmtMod(r.prof)}). Ability scores use the ${opts.abilities === 'roll' ? 'rolled 4d6-drop-lowest' : 'standard array'} with ${r.race.name} increases${r.asiSpent.length ? ` and ${r.asiSpent.length} Ability Score Improvement${r.asiSpent.length > 1 ? 's' : ''} applied` : ''}; hit points are ${r.hpMethod === 'roll' ? 'rolled' : 'the fixed average'}. The ${r.cls.subLabel} ${r.subclass ? `is ${r.subclass.name}` : `unlocks at level ${r.subclassLevel}`} — every feature it grants by this level is listed below.` },
    { type: 'tracker', label: 'Hit Points', current: r.maxHp, max: r.maxHp, style: 'number' },
    { type: 'tracker', label: 'Temp HP', current: 0, style: 'number' },
    { type: 'tracker', label: 'Hit Dice', current: r.level, max: r.level, style: 'number' },
    { type: 'tracker', label: 'Inspiration', current: 0, max: 1, style: 'boxes' },
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
        { key: 'Tools', value: '—' },
        { key: 'Languages', value: 'Common, plus one from your race or background' },
      ],
    },
  ];

  // Single-pick choices (fighting style, pact boon, subclass menus) become
  // in-sheet dropdowns — the value is rolled, but the player can pick another
  // or add their own. Multi-pick choices (metamagic, invocations, expertise)
  // stay a rerollable list.
  const listChoices = r.choices.filter((ch) => !ch.options?.length);
  if (listChoices.length) {
    blocks.push({ type: 'list', label: 'Choices', items: listChoices.map((ch) => `${ch.label}: ${ch.value}`) });
  }
  for (const ch of r.choices) {
    if (ch.options?.length) blocks.push({ type: 'choice', label: ch.label, value: ch.value, options: ch.options });
  }
  // Level-up decisions — each Ability Score Improvement, taken as a stat bump or
  // a feat. The rules let you choose either at 4/8/12/16/19 (fighter & rogue more).
  if (r.levelUps.length) {
    blocks.push({
      type: 'list', label: 'Level-Up Choices',
      items: r.levelUps.map((k) => `Level ${k.level}: ${k.kind === 'feat' ? `Feat — ${k.detail}` : k.detail}`),
    });
  }

  if (r.spellcasting) {
    const sc = r.spellcasting;
    blocks.push({
      type: 'keyValue',
      pairs: [
        { key: 'Spellcasting Ability', value: ABILITY_LABEL[sc.ability] },
        { key: 'Spell Save DC', value: String(sc.saveDc) },
        { key: 'Spell Attack Bonus', value: fmtMod(sc.attack) },
        ...(sc.cantrips ? [{ key: 'Cantrips Known', value: String(sc.cantrips) }] : []),
        { key: sc.spellsLabel === 'known' ? 'Spells Known' : 'Spells Prepared', value: String(sc.spells) },
      ],
    });
    if (sc.pact) {
      blocks.push({ type: 'tracker', label: `Pact Slots (${ordinal(sc.pact.slotLevel)}-level)`, current: sc.pact.count, max: sc.pact.count, style: 'boxes' });
    } else {
      sc.slots.forEach((n, i) => {
        if (n > 0) blocks.push({ type: 'tracker', label: `Spell Slots — ${ordinal(i + 1)}`, current: n, max: n, style: 'boxes' });
      });
    }
    // Always-available subclass spells (Life Domain, Oath of Devotion, The Fiend).
    if (r.domainSpells.length) {
      blocks.push({
        type: 'list',
        label: `${r.subclass?.name ?? 'Subclass'} Spells (always prepared)`,
        items: r.domainSpells.flatMap((t) => t.names),
      });
    }
    // A rolled starting spellbook drawn from this CLASS's SRD spell list — the
    // right number of cantrips, then spells spread across the levels you can
    // cast — so a wizard rolls wizard spells, a cleric rolls cleric spells.
    const classSpells = CLASS_SPELLS[r.cls.id];
    if (classSpells) {
      const cantrips = drawFrom(classSpells[0] ?? [], sc.cantrips, 'cantrips');
      if (cantrips.length) blocks.push({ type: 'list', label: 'Cantrips', items: cantrips });
      const maxLvl = sc.pact ? sc.pact.slotLevel : Math.max(1, sc.slots.length);
      const nSpells = Math.min(sc.spells, 18);
      const perLevel = Array.from({ length: maxLvl }, () => 0);
      for (let i = 0; i < nSpells; i++) perLevel[i % maxLvl]!++;
      perLevel.forEach((cnt, i) => {
        const picks = drawFrom(classSpells[i + 1] ?? [], cnt, `spells-${i + 1}`);
        if (picks.length) blocks.push({ type: 'list', label: `${ordinal(i + 1)}-Level Spells`, items: picks });
      });
    }
  }

  // The full feature progression: race traits, then every class + subclass
  // feature (and each Ability Score Improvement) the character has by this level.
  blocks.push(
    { type: 'list', label: 'Features & Traits', items: r.featureLog.map((f) => `${f.name}${f.note ? ` — ${f.note}` : ''} (${f.source})`) },
    { type: 'paragraph', label: 'Personality Trait', text: c.text('{table:gm/npc/demeanor}') },
    { type: 'paragraph', label: 'Ideal', text: 'What does your character believe in above all?' },
    { type: 'paragraph', label: 'Bond', text: `A cherished keepsake: ${c.text('{table:gm/npc/keepsake}')}` },
    { type: 'paragraph', label: 'Flaw', text: c.text('{table:gm/npc/flaw-or-prejudice}') },
    { type: 'paragraph', label: 'Appearance', text: `A ${r.race.name.toLowerCase()} of the ${r.background.name.toLowerCase()} — age, height, eyes, skin, hair, and the marks that set them apart.` },
    { type: 'paragraph', label: 'Backstory', text: c.text('{table:gm/npc/backstory}') },
    { type: 'list', label: 'Inventory', items: ['Explorer\'s pack', 'A weapon of note: {table:gm/loot/weapon-look}', 'Rope, 50 ft.', 'Rations, 5 days'].map((t) => c.text(t)) },
    { type: 'keyValue', pairs: [{ key: 'Gold (gp)', value: '10' }, { key: 'Silver (sp)', value: '0' }, { key: 'Copper (cp)', value: '0' }] },
    { type: 'paragraph', label: 'Notes', text: 'Write here…' },
  );

  return blocks;
}
