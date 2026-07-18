// D&D 5e (SRD 5.1) character rules — a pure, deterministic ruleset engine.
//
// This is the "levelling and building" half of the character builder
// (docs/CAMPAIGN-CODEX.md): pick a class, race, background, and level, and this
// derives the mechanically-correct numbers — ability scores with racial
// increases applied, proficiency bonus, hit points, saving-throw and skill
// proficiencies, and spell slots per caster type. The composite
// (composites/dnd-character.ts) turns the result into sheet blocks; keeping the
// rules here means they are unit-testable (scripts/smoke-dnd5e.mjs) and shared.
//
// Content derived from the System Reference Document 5.1 (SRD 5.1) by Wizards of
// the Coast LLC, licensed under CC BY 4.0. See LICENSE-SRD.md. Background names
// beyond "Acolyte" (SRD) are generic skill archetypes, not PHB backgrounds.

export type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';
export const ABILITIES: Ability[] = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const ABILITY_LABEL: Record<Ability, string> = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

export const SKILLS: { name: string; ability: Ability }[] = [
  { name: 'Acrobatics', ability: 'dex' },
  { name: 'Animal Handling', ability: 'wis' },
  { name: 'Arcana', ability: 'int' },
  { name: 'Athletics', ability: 'str' },
  { name: 'Deception', ability: 'cha' },
  { name: 'History', ability: 'int' },
  { name: 'Insight', ability: 'wis' },
  { name: 'Intimidation', ability: 'cha' },
  { name: 'Investigation', ability: 'int' },
  { name: 'Medicine', ability: 'wis' },
  { name: 'Nature', ability: 'int' },
  { name: 'Perception', ability: 'wis' },
  { name: 'Performance', ability: 'cha' },
  { name: 'Persuasion', ability: 'cha' },
  { name: 'Religion', ability: 'int' },
  { name: 'Sleight of Hand', ability: 'dex' },
  { name: 'Stealth', ability: 'dex' },
  { name: 'Survival', ability: 'wis' },
];

export interface RaceDef {
  id: string;
  name: string;
  asi: Partial<Record<Ability, number>>;
  /** Extra +1s the player assigns freely (Half-Elf: 2). */
  freeAsi?: number;
  speed: number;
  size: 'Small' | 'Medium';
  traits: string[];
}

// SRD 5.1 races, each folding in the SRD's given subrace increase (Hill Dwarf,
// High Elf, Lightfoot Halfling, Rock Gnome) so the totals are play-ready.
export const RACES: RaceDef[] = [
  { id: 'human', name: 'Human', asi: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 }, speed: 30, size: 'Medium',
    traits: ['+1 to every ability score', 'One extra language'] },
  { id: 'dwarf', name: 'Dwarf (Hill)', asi: { con: 2, wis: 1 }, speed: 25, size: 'Medium',
    traits: ['Darkvision 60 ft.', 'Dwarven Resilience: advantage vs. poison, resistance to poison damage', 'Stonecunning', 'Dwarven Toughness: +1 HP per level'] },
  { id: 'elf', name: 'Elf (High)', asi: { dex: 2, int: 1 }, speed: 30, size: 'Medium',
    traits: ['Darkvision 60 ft.', 'Fey Ancestry: advantage vs. charm, no magical sleep', 'Trance (4-hour rest)', 'Keen Senses: Perception proficiency', 'One wizard cantrip'] },
  { id: 'halfling', name: 'Halfling (Lightfoot)', asi: { dex: 2, cha: 1 }, speed: 25, size: 'Small',
    traits: ['Lucky: reroll natural 1s on d20 attacks/checks/saves', 'Brave: advantage vs. frightened', 'Halfling Nimbleness', 'Naturally Stealthy'] },
  { id: 'gnome', name: 'Gnome (Rock)', asi: { int: 2, con: 1 }, speed: 25, size: 'Small',
    traits: ['Darkvision 60 ft.', 'Gnome Cunning: advantage on INT/WIS/CHA saves vs. magic', "Artificer's Lore", 'Tinker'] },
  { id: 'dragonborn', name: 'Dragonborn', asi: { str: 2, cha: 1 }, speed: 30, size: 'Medium',
    traits: ['Draconic Ancestry (choose a dragon type)', 'Breath Weapon (DC 8 + CON + prof)', 'Damage Resistance to your ancestry type'] },
  { id: 'half-elf', name: 'Half-Elf', asi: { cha: 2 }, freeAsi: 2, speed: 30, size: 'Medium',
    traits: ['Darkvision 60 ft.', 'Fey Ancestry', 'Skill Versatility: proficiency in two skills of your choice'] },
  { id: 'half-orc', name: 'Half-Orc', asi: { str: 2, con: 1 }, speed: 30, size: 'Medium',
    traits: ['Darkvision 60 ft.', 'Relentless Endurance (drop to 1 HP instead of 0, once per long rest)', 'Savage Attacks', 'Menacing: Intimidation proficiency'] },
  { id: 'tiefling', name: 'Tiefling', asi: { cha: 2, int: 1 }, speed: 30, size: 'Medium',
    traits: ['Darkvision 60 ft.', 'Hellish Resistance to fire', 'Infernal Legacy: Thaumaturgy cantrip (Hellish Rebuke at 3, Darkness at 5)'] },
];

export type CasterKind = 'none' | 'full' | 'half' | 'pact';

export interface ClassDef {
  id: string;
  name: string;
  hitDie: number;
  primary: Ability[];
  saves: [Ability, Ability];
  skillCount: number;
  skillList: string[];
  armor: string;
  weapons: string;
  caster: CasterKind;
  spellAbility?: Ability;
  level1: string[];
  /** A few signature features past 1st, shown when the level reaches them. */
  later: { level: number; name: string }[];
}

const ALL_SKILLS = SKILLS.map((s) => s.name);

export const CLASSES: ClassDef[] = [
  { id: 'barbarian', name: 'Barbarian', hitDie: 12, primary: ['str'], saves: ['str', 'con'], skillCount: 2,
    skillList: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
    armor: 'Light & medium armor, shields', weapons: 'Simple & martial weapons', caster: 'none',
    level1: ['Rage', 'Unarmored Defense (10 + DEX + CON)'],
    later: [{ level: 2, name: 'Reckless Attack, Danger Sense' }, { level: 3, name: 'Primal Path' }, { level: 5, name: 'Extra Attack, Fast Movement' }] },
  { id: 'bard', name: 'Bard', hitDie: 8, primary: ['cha'], saves: ['dex', 'cha'], skillCount: 3,
    skillList: ALL_SKILLS, armor: 'Light armor', weapons: 'Simple weapons, hand crossbows, longswords, rapiers, shortswords',
    caster: 'full', spellAbility: 'cha', level1: ['Spellcasting', 'Bardic Inspiration (d6)'],
    later: [{ level: 2, name: 'Jack of All Trades, Song of Rest' }, { level: 3, name: 'Bard College, Expertise' }, { level: 5, name: 'Font of Inspiration' }] },
  { id: 'cleric', name: 'Cleric', hitDie: 8, primary: ['wis'], saves: ['wis', 'cha'], skillCount: 2,
    skillList: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'], armor: 'Light & medium armor, shields',
    weapons: 'Simple weapons', caster: 'full', spellAbility: 'wis', level1: ['Spellcasting', 'Divine Domain'],
    later: [{ level: 2, name: 'Channel Divinity' }, { level: 5, name: 'Destroy Undead' }] },
  { id: 'druid', name: 'Druid', hitDie: 8, primary: ['wis'], saves: ['int', 'wis'], skillCount: 2,
    skillList: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
    armor: 'Light & medium (nonmetal), shields', weapons: 'Clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears',
    caster: 'full', spellAbility: 'wis', level1: ['Druidic', 'Spellcasting'],
    later: [{ level: 2, name: 'Wild Shape, Druid Circle' }] },
  { id: 'fighter', name: 'Fighter', hitDie: 10, primary: ['str', 'dex'], saves: ['str', 'con'], skillCount: 2,
    skillList: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
    armor: 'All armor, shields', weapons: 'Simple & martial weapons', caster: 'none',
    level1: ['Fighting Style', 'Second Wind'],
    later: [{ level: 2, name: 'Action Surge' }, { level: 3, name: 'Martial Archetype' }, { level: 5, name: 'Extra Attack' }] },
  { id: 'monk', name: 'Monk', hitDie: 8, primary: ['dex', 'wis'], saves: ['str', 'dex'], skillCount: 2,
    skillList: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'], armor: 'None',
    weapons: 'Simple weapons, shortswords', caster: 'none', level1: ['Unarmored Defense (10 + DEX + WIS)', 'Martial Arts'],
    later: [{ level: 2, name: 'Ki, Unarmored Movement' }, { level: 3, name: 'Monastic Tradition, Deflect Missiles' }, { level: 5, name: 'Extra Attack, Stunning Strike' }] },
  { id: 'paladin', name: 'Paladin', hitDie: 10, primary: ['str', 'cha'], saves: ['wis', 'cha'], skillCount: 2,
    skillList: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'], armor: 'All armor, shields',
    weapons: 'Simple & martial weapons', caster: 'half', spellAbility: 'cha', level1: ['Divine Sense', 'Lay on Hands'],
    later: [{ level: 2, name: 'Fighting Style, Spellcasting, Divine Smite' }, { level: 3, name: 'Sacred Oath, Divine Health' }, { level: 5, name: 'Extra Attack' }] },
  { id: 'ranger', name: 'Ranger', hitDie: 10, primary: ['dex', 'wis'], saves: ['str', 'dex'], skillCount: 3,
    skillList: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
    armor: 'Light & medium armor, shields', weapons: 'Simple & martial weapons', caster: 'half', spellAbility: 'wis',
    level1: ['Favored Enemy', 'Natural Explorer'],
    later: [{ level: 2, name: 'Fighting Style, Spellcasting' }, { level: 3, name: 'Ranger Archetype, Primeval Awareness' }, { level: 5, name: 'Extra Attack' }] },
  { id: 'rogue', name: 'Rogue', hitDie: 8, primary: ['dex'], saves: ['dex', 'int'], skillCount: 4,
    skillList: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'],
    armor: 'Light armor', weapons: 'Simple weapons, hand crossbows, longswords, rapiers, shortswords', caster: 'none',
    level1: ['Expertise', 'Sneak Attack', "Thieves' Cant"],
    later: [{ level: 2, name: 'Cunning Action' }, { level: 3, name: 'Roguish Archetype' }, { level: 5, name: 'Uncanny Dodge' }] },
  { id: 'sorcerer', name: 'Sorcerer', hitDie: 6, primary: ['cha'], saves: ['con', 'cha'], skillCount: 2,
    skillList: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'], armor: 'None',
    weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows', caster: 'full', spellAbility: 'cha',
    level1: ['Spellcasting', 'Sorcerous Origin'], later: [{ level: 2, name: 'Font of Magic' }, { level: 3, name: 'Metamagic' }] },
  { id: 'warlock', name: 'Warlock', hitDie: 8, primary: ['cha'], saves: ['wis', 'cha'], skillCount: 2,
    skillList: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'], armor: 'Light armor',
    weapons: 'Simple weapons', caster: 'pact', spellAbility: 'cha', level1: ['Otherworldly Patron', 'Pact Magic'],
    later: [{ level: 2, name: 'Eldritch Invocations' }, { level: 3, name: 'Pact Boon' }] },
  { id: 'wizard', name: 'Wizard', hitDie: 6, primary: ['int'], saves: ['int', 'wis'], skillCount: 2,
    skillList: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'], armor: 'None',
    weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows', caster: 'full', spellAbility: 'int',
    level1: ['Spellcasting', 'Arcane Recovery'], later: [{ level: 2, name: 'Arcane Tradition' }] },
];

export interface BackgroundDef { id: string; name: string; skills: string[]; feature: string }
// "Acolyte" is the SRD 5.1 background; the rest are generic skill archetypes
// (original names) so a builder has range without copying PHB backgrounds.
export const BACKGROUNDS: BackgroundDef[] = [
  { id: 'acolyte', name: 'Acolyte', skills: ['Insight', 'Religion'], feature: 'Shelter of the Faithful' },
  { id: 'scholar', name: 'Scholar', skills: ['Arcana', 'History'], feature: 'Researcher — you know where to find lore' },
  { id: 'soldier', name: 'Soldier', skills: ['Athletics', 'Intimidation'], feature: 'Military Rank — deference from those who serve' },
  { id: 'outsider', name: 'Wanderer', skills: ['Animal Handling', 'Survival'], feature: 'Wayfarer — you can always find food and shelter in the wild' },
  { id: 'rogue-bg', name: 'Underworld', skills: ['Deception', 'Stealth'], feature: 'A contact in the criminal underworld' },
  { id: 'courtier', name: 'Courtier', skills: ['History', 'Persuasion'], feature: 'Position of Privilege — welcomed in high society' },
];

export const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral', 'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'];

export const ASI_LEVELS = [4, 8, 12, 16, 19];

export const abilityMod = (score: number): number => Math.floor((score - 10) / 2);
export const profBonus = (level: number): number => 2 + Math.floor((Math.max(1, Math.min(20, level)) - 1) / 4);
export const fmtMod = (n: number): string => (n >= 0 ? `+${n}` : `${n}`);

// Spell-slot progressions (SRD 5.1). Arrays are slots for spell levels 1..9.
const FULL_SLOTS: number[][] = [
  [2], [3], [4, 2], [4, 3], [4, 3, 2], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 2, 1, 1, 1, 1], [4, 3, 3, 3, 3, 1, 1, 1, 1], [4, 3, 3, 3, 3, 2, 1, 1, 1], [4, 3, 3, 3, 3, 2, 2, 1, 1],
];
const HALF_SLOTS: number[][] = [
  [], [2], [3], [3], [4, 2], [4, 2], [4, 3], [4, 3], [4, 3, 2], [4, 3, 2],
  [4, 3, 3], [4, 3, 3], [4, 3, 3, 1], [4, 3, 3, 1], [4, 3, 3, 2], [4, 3, 3, 2], [4, 3, 3, 3, 1], [4, 3, 3, 3, 1], [4, 3, 3, 3, 2], [4, 3, 3, 3, 2],
];

/** Warlock Pact Magic: a small number of slots, all of one (rising) level. */
export function pactSlots(level: number): { count: number; slotLevel: number } {
  const L = Math.max(1, Math.min(20, level));
  const count = L >= 17 ? 4 : L >= 11 ? 3 : L >= 2 ? 2 : 1;
  const slotLevel = L >= 9 ? 5 : L >= 7 ? 4 : L >= 5 ? 3 : L >= 3 ? 2 : 1;
  return { count, slotLevel };
}

/** Leveled spell slots (levels 1..9) for full/half casters; [] for others. */
export function spellSlots(cls: ClassDef, level: number): number[] {
  const L = Math.max(1, Math.min(20, level));
  if (cls.caster === 'full') return FULL_SLOTS[L - 1] ?? [];
  if (cls.caster === 'half') return HALF_SLOTS[L - 1] ?? [];
  return [];
}

type Rng = () => number;
const roll4d6dropLowest = (rng: Rng): number => {
  const dice = [0, 0, 0, 0].map(() => 1 + Math.floor(rng() * 6)).sort((a, b) => a - b);
  return dice[1]! + dice[2]! + dice[3]!;
};
const pick = <T>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;

export type AbilityMethod = 'array' | 'roll';
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** Assign scores to abilities by the class's priorities, apply racial ASIs.
 *  Deterministic given (class, race, method, rng). */
export function assignAbilities(cls: ClassDef, race: RaceDef, method: AbilityMethod, rng: Rng): Record<Ability, number> {
  const pool = method === 'roll'
    ? [0, 0, 0, 0, 0, 0].map(() => roll4d6dropLowest(rng)).sort((a, b) => b - a)
    : [...STANDARD_ARRAY];
  // priority: class primaries, then CON (durability), then the rest in a stable order
  const order: Ability[] = [];
  for (const a of [...cls.primary, 'con' as Ability, 'dex' as Ability, 'wis' as Ability, 'cha' as Ability, 'int' as Ability, 'str' as Ability]) {
    if (!order.includes(a)) order.push(a);
  }
  const scores = {} as Record<Ability, number>;
  order.forEach((a, i) => { scores[a] = pool[i] ?? 10; });
  // fixed racial increases
  for (const [a, inc] of Object.entries(race.asi)) scores[a as Ability] += inc!;
  // free increases (Half-Elf): to the two highest scores that the race didn't already boost
  if (race.freeAsi) {
    const boosted = new Set(Object.keys(race.asi));
    const targets = order.filter((a) => !boosted.has(a)).slice(0, race.freeAsi);
    for (const a of targets) scores[a] += 1;
  }
  return scores;
}

export interface CharacterResult {
  race: RaceDef;
  cls: ClassDef;
  background: BackgroundDef;
  level: number;
  alignment: string;
  abilities: Record<Ability, number>;
  mods: Record<Ability, number>;
  prof: number;
  speed: number;
  size: string;
  maxHp: number;
  hitDice: string;
  saves: Ability[];
  skills: string[]; // proficient skill names
  ac: number; // unarmored baseline
  spellcasting?: { ability: Ability; saveDc: number; attack: number; slots: number[]; pact?: { count: number; slotLevel: number } };
  featureLog: { source: string; name: string }[];
}

export interface BuildOpts {
  cls: string; // class id, or '' for random
  race: string; // race id, or ''
  background: string; // bg id, or ''
  level: number;
  method: AbilityMethod;
}

/** The whole computation: choices (or random) → a mechanically-correct sheet. */
export function computeCharacter(opts: BuildOpts, rng: Rng): CharacterResult {
  const cls = CLASSES.find((c) => c.id === opts.cls) ?? pick(rng, CLASSES);
  const race = RACES.find((r) => r.id === opts.race) ?? pick(rng, RACES);
  const background = BACKGROUNDS.find((b) => b.id === opts.background) ?? pick(rng, BACKGROUNDS);
  const level = Math.max(1, Math.min(20, Math.floor(opts.level) || 1));

  const abilities = assignAbilities(cls, race, opts.method, rng);
  const mods = {} as Record<Ability, number>;
  for (const a of ABILITIES) mods[a] = abilityMod(abilities[a]);
  const prof = profBonus(level);

  // HP: max at 1st, class average per level after; +1/level for Hill Dwarf.
  const avg = Math.floor(cls.hitDie / 2) + 1;
  const dwarfToughness = race.id === 'dwarf' ? level : 0;
  const maxHp = cls.hitDie + mods.con + (level - 1) * (avg + mods.con) + dwarfToughness;

  // Proficient skills: class picks (first N of its list, minus any the
  // background already grants) + the background's two.
  const bgSkills = background.skills;
  const classPicks = cls.skillList.filter((s) => !bgSkills.includes(s)).slice(0, cls.skillCount);
  const skills = [...new Set([...classPicks, ...bgSkills])];

  const ac = 10 + mods.dex;

  let spellcasting: CharacterResult['spellcasting'];
  if (cls.caster !== 'none' && cls.spellAbility) {
    const sa = cls.spellAbility;
    spellcasting = {
      ability: sa,
      saveDc: 8 + prof + mods[sa],
      attack: prof + mods[sa],
      slots: spellSlots(cls, level),
      ...(cls.caster === 'pact' ? { pact: pactSlots(level) } : {}),
    };
  }

  const featureLog: { source: string; name: string }[] = [];
  for (const t of race.traits) featureLog.push({ source: race.name, name: t });
  for (const f of cls.level1) featureLog.push({ source: `${cls.name} 1`, name: f });
  for (const f of cls.later) if (f.level <= level) featureLog.push({ source: `${cls.name} ${f.level}`, name: f.name });
  for (const lv of ASI_LEVELS) if (lv <= level) featureLog.push({ source: `${cls.name} ${lv}`, name: 'Ability Score Improvement (or a feat)' });
  featureLog.push({ source: background.name, name: background.feature });

  return {
    race, cls, background, level,
    alignment: pick(rng, ALIGNMENTS),
    abilities, mods, prof,
    speed: race.speed, size: race.size,
    maxHp: Math.max(1, maxHp),
    hitDice: `${level}d${cls.hitDie}`,
    saves: cls.saves,
    skills,
    ac,
    spellcasting,
    featureLog,
  };
}
