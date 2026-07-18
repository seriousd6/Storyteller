// D&D 5e (SRD 5.1) character rules — a pure, deterministic ruleset engine.
//
// This is the "levelling and building" half of the character builder
// (docs/CAMPAIGN-CODEX.md): pick a class, race, background, subclass, and level,
// and this derives the mechanically-correct build — ability scores with racial
// increases AND level-up improvements applied, proficiency bonus, hit points,
// saving-throw and skill proficiencies, the full 1–20 feature progression, the
// chosen subclass's features (which unlock at the class's real subclass level),
// spell slots and spell/cantrip counts, and rolled choices (fighting style,
// metamagic, invocations, expertise). The composite (composites/dnd-character.ts)
// turns the result into sheet blocks; keeping the rules here means they are
// unit-testable (scripts/smoke-dnd5e.mjs) and shared.
//
// Content derived from the System Reference Document 5.1 (SRD 5.1) by Wizards of
// the Coast LLC, licensed under CC BY 4.0. See LICENSE-SRD.md. The SRD includes
// exactly one subclass per class and one feat (Grappler); a builder can add
// their own in the Sheet Builder. Background names beyond "Acolyte" (SRD) are
// generic skill archetypes, not PHB backgrounds.

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

/** One class or subclass feature, keyed to the character level that grants it. */
export interface Feature { level: number; name: string; note?: string }

/** A tier of always-available subclass spells (domain / oath / expanded),
 *  granted once the character reaches `level`. */
export interface SubSpellTier { level: number; names: string[] }

/** A build-time subclass choice the SRD asks you to make (Dragon Ancestor,
 *  Circle terrain, Hunter's Prey…), offered once the character reaches `level`. */
export interface SubChoice { level: number; label: string; options: string[] }

export interface SubclassDef {
  id: string;
  name: string;
  features: Feature[];
  /** Domain/Oath/Expanded spells, always prepared/known for the caster. */
  spells?: SubSpellTier[];
  /** Menu choices the subclass grants at given levels (rolled, or picked). */
  choices?: SubChoice[];
}

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
  /** Character level at which the subclass is chosen (3 for most; 1 for
   *  cleric/sorcerer/warlock; 2 for druid/wizard). */
  subclassLevel: number;
  /** What the class calls its subclass ("Primal Path", "Divine Domain"…). */
  subLabel: string;
  /** Levels granting an Ability Score Improvement (fighter & rogue get extras). */
  asiLevels: number[];
  /** The full 1–20 feature progression (ASI lines are injected separately). */
  features: Feature[];
  /** The SRD subclass(es). One per class in the SRD; users add their own. */
  subclasses: SubclassDef[];
}

const ALL_SKILLS = SKILLS.map((s) => s.name);
const STD_ASI = [4, 8, 12, 16, 19];

export const CLASSES: ClassDef[] = [
  {
    id: 'barbarian', name: 'Barbarian', hitDie: 12, primary: ['str'], saves: ['str', 'con'], skillCount: 2,
    skillList: ['Animal Handling', 'Athletics', 'Intimidation', 'Nature', 'Perception', 'Survival'],
    armor: 'Light & medium armor, shields', weapons: 'Simple & martial weapons', caster: 'none',
    subclassLevel: 3, subLabel: 'Primal Path', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Rage', note: 'bonus action; +damage, advantage on STR, resistance to bludgeoning/piercing/slashing' },
      { level: 1, name: 'Unarmored Defense', note: 'AC 10 + DEX + CON with no armor' },
      { level: 2, name: 'Reckless Attack' }, { level: 2, name: 'Danger Sense' },
      { level: 3, name: 'Primal Path' },
      { level: 5, name: 'Extra Attack' }, { level: 5, name: 'Fast Movement (+10 ft.)' },
      { level: 7, name: 'Feral Instinct' },
      { level: 9, name: 'Brutal Critical (1 die)' },
      { level: 11, name: 'Relentless Rage' },
      { level: 13, name: 'Brutal Critical (2 dice)' },
      { level: 15, name: 'Persistent Rage' },
      { level: 17, name: 'Brutal Critical (3 dice)' },
      { level: 18, name: 'Indomitable Might' },
      { level: 20, name: 'Primal Champion (+4 STR & CON, max 24)' },
    ],
    subclasses: [{
      id: 'berserker', name: 'Path of the Berserker', features: [
        { level: 3, name: 'Frenzy' }, { level: 6, name: 'Mindless Rage' },
        { level: 10, name: 'Intimidating Presence' }, { level: 14, name: 'Retaliation' },
      ],
    }],
  },
  {
    id: 'bard', name: 'Bard', hitDie: 8, primary: ['cha'], saves: ['dex', 'cha'], skillCount: 3,
    skillList: ALL_SKILLS, armor: 'Light armor', weapons: 'Simple weapons, hand crossbows, longswords, rapiers, shortswords',
    caster: 'full', spellAbility: 'cha', subclassLevel: 3, subLabel: 'Bard College', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Spellcasting' }, { level: 1, name: 'Bardic Inspiration (d6)' },
      { level: 2, name: 'Jack of All Trades' }, { level: 2, name: 'Song of Rest (d6)' },
      { level: 3, name: 'Bard College' }, { level: 3, name: 'Expertise' },
      { level: 5, name: 'Font of Inspiration' },
      { level: 6, name: 'Countercharm' },
      { level: 9, name: 'Song of Rest (d8)' },
      { level: 10, name: 'Bardic Inspiration (d8)' }, { level: 10, name: 'Expertise' }, { level: 10, name: 'Magical Secrets' },
      { level: 13, name: 'Song of Rest (d10)' },
      { level: 14, name: 'Magical Secrets' },
      { level: 15, name: 'Bardic Inspiration (d10)' },
      { level: 17, name: 'Song of Rest (d12)' },
      { level: 18, name: 'Magical Secrets' },
      { level: 20, name: 'Superior Inspiration' },
    ],
    subclasses: [{
      id: 'lore', name: 'College of Lore', features: [
        { level: 3, name: 'Bonus Proficiencies (three skills)' }, { level: 3, name: 'Cutting Words' },
        { level: 6, name: 'Additional Magical Secrets' }, { level: 14, name: 'Peerless Skill' },
      ],
    }],
  },
  {
    id: 'cleric', name: 'Cleric', hitDie: 8, primary: ['wis'], saves: ['wis', 'cha'], skillCount: 2,
    skillList: ['History', 'Insight', 'Medicine', 'Persuasion', 'Religion'], armor: 'Light & medium armor, shields',
    weapons: 'Simple weapons', caster: 'full', spellAbility: 'wis', subclassLevel: 1, subLabel: 'Divine Domain', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Spellcasting' }, { level: 1, name: 'Divine Domain' },
      { level: 2, name: 'Channel Divinity (1/rest)' },
      { level: 5, name: 'Destroy Undead (CR 1/2)' },
      { level: 6, name: 'Channel Divinity (2/rest)' },
      { level: 8, name: 'Destroy Undead (CR 1)' },
      { level: 10, name: 'Divine Intervention' },
      { level: 11, name: 'Destroy Undead (CR 2)' },
      { level: 14, name: 'Destroy Undead (CR 3)' },
      { level: 17, name: 'Destroy Undead (CR 4)' },
      { level: 18, name: 'Channel Divinity (3/rest)' },
      { level: 20, name: 'Divine Intervention Improvement' },
    ],
    subclasses: [{
      id: 'life', name: 'Life Domain', features: [
        { level: 1, name: 'Bonus Proficiency (heavy armor)' }, { level: 1, name: 'Disciple of Life' },
        { level: 2, name: 'Channel Divinity: Preserve Life' }, { level: 6, name: 'Blessed Healer' },
        { level: 8, name: 'Divine Strike' }, { level: 17, name: 'Supreme Healing' },
      ],
      spells: [
        { level: 1, names: ['Bless', 'Cure Wounds'] },
        { level: 3, names: ['Lesser Restoration', 'Spiritual Weapon'] },
        { level: 5, names: ['Beacon of Hope', 'Revivify'] },
        { level: 7, names: ['Death Ward', 'Guardian of Faith'] },
        { level: 9, names: ['Mass Cure Wounds', 'Raise Dead'] },
      ],
    }],
  },
  {
    id: 'druid', name: 'Druid', hitDie: 8, primary: ['wis'], saves: ['int', 'wis'], skillCount: 2,
    skillList: ['Arcana', 'Animal Handling', 'Insight', 'Medicine', 'Nature', 'Perception', 'Religion', 'Survival'],
    armor: 'Light & medium (nonmetal), shields', weapons: 'Clubs, daggers, darts, javelins, maces, quarterstaffs, scimitars, sickles, slings, spears',
    caster: 'full', spellAbility: 'wis', subclassLevel: 2, subLabel: 'Druid Circle', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Druidic' }, { level: 1, name: 'Spellcasting' },
      { level: 2, name: 'Wild Shape' }, { level: 2, name: 'Druid Circle' },
      { level: 4, name: 'Wild Shape Improvement' },
      { level: 8, name: 'Wild Shape Improvement' },
      { level: 18, name: 'Timeless Body' }, { level: 18, name: 'Beast Spells' },
      { level: 20, name: 'Archdruid' },
    ],
    subclasses: [{
      id: 'land', name: 'Circle of the Land', features: [
        { level: 2, name: 'Bonus Cantrip' }, { level: 2, name: 'Natural Recovery' },
        { level: 3, name: 'Circle Spells' }, { level: 6, name: "Land's Stride" },
        { level: 10, name: "Nature's Ward" }, { level: 14, name: "Nature's Sanctuary" },
      ],
      choices: [{ level: 2, label: 'Land (Circle Spells)', options: ['Arctic', 'Coast', 'Desert', 'Forest', 'Grassland', 'Mountain', 'Swamp', 'Underdark'] }],
    }],
  },
  {
    id: 'fighter', name: 'Fighter', hitDie: 10, primary: ['str', 'dex'], saves: ['str', 'con'], skillCount: 2,
    skillList: ['Acrobatics', 'Animal Handling', 'Athletics', 'History', 'Insight', 'Intimidation', 'Perception', 'Survival'],
    armor: 'All armor, shields', weapons: 'Simple & martial weapons', caster: 'none',
    subclassLevel: 3, subLabel: 'Martial Archetype', asiLevels: [4, 6, 8, 12, 14, 16, 19],
    features: [
      { level: 1, name: 'Fighting Style' }, { level: 1, name: 'Second Wind' },
      { level: 2, name: 'Action Surge (one use)' },
      { level: 3, name: 'Martial Archetype' },
      { level: 5, name: 'Extra Attack' },
      { level: 9, name: 'Indomitable (one use)' },
      { level: 11, name: 'Extra Attack (2)' },
      { level: 13, name: 'Indomitable (two uses)' },
      { level: 17, name: 'Action Surge (two uses)' }, { level: 17, name: 'Indomitable (three uses)' },
      { level: 20, name: 'Extra Attack (3)' },
    ],
    subclasses: [{
      id: 'champion', name: 'Champion', features: [
        { level: 3, name: 'Improved Critical (19–20)' }, { level: 7, name: 'Remarkable Athlete' },
        { level: 10, name: 'Additional Fighting Style' }, { level: 15, name: 'Superior Critical (18–20)' },
        { level: 18, name: 'Survivor' },
      ],
    }],
  },
  {
    id: 'monk', name: 'Monk', hitDie: 8, primary: ['dex', 'wis'], saves: ['str', 'dex'], skillCount: 2,
    skillList: ['Acrobatics', 'Athletics', 'History', 'Insight', 'Religion', 'Stealth'], armor: 'None',
    weapons: 'Simple weapons, shortswords', caster: 'none', subclassLevel: 3, subLabel: 'Monastic Tradition', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Unarmored Defense', note: 'AC 10 + DEX + WIS' }, { level: 1, name: 'Martial Arts' },
      { level: 2, name: 'Ki' }, { level: 2, name: 'Unarmored Movement (+10 ft.)' },
      { level: 3, name: 'Monastic Tradition' }, { level: 3, name: 'Deflect Missiles' },
      { level: 4, name: 'Slow Fall' },
      { level: 5, name: 'Extra Attack' }, { level: 5, name: 'Stunning Strike' },
      { level: 6, name: 'Ki-Empowered Strikes' },
      { level: 7, name: 'Evasion' }, { level: 7, name: 'Stillness of Mind' },
      { level: 10, name: 'Purity of Body' },
      { level: 13, name: 'Tongue of the Sun and Moon' },
      { level: 14, name: 'Diamond Soul' },
      { level: 15, name: 'Timeless Body' },
      { level: 18, name: 'Empty Body' },
      { level: 20, name: 'Perfect Self' },
    ],
    subclasses: [{
      id: 'open-hand', name: 'Way of the Open Hand', features: [
        { level: 3, name: 'Open Hand Technique' }, { level: 6, name: 'Wholeness of Body' },
        { level: 11, name: 'Tranquility' }, { level: 17, name: 'Quivering Palm' },
      ],
    }],
  },
  {
    id: 'paladin', name: 'Paladin', hitDie: 10, primary: ['str', 'cha'], saves: ['wis', 'cha'], skillCount: 2,
    skillList: ['Athletics', 'Insight', 'Intimidation', 'Medicine', 'Persuasion', 'Religion'], armor: 'All armor, shields',
    weapons: 'Simple & martial weapons', caster: 'half', spellAbility: 'cha', subclassLevel: 3, subLabel: 'Sacred Oath', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Divine Sense' }, { level: 1, name: 'Lay on Hands' },
      { level: 2, name: 'Fighting Style' }, { level: 2, name: 'Spellcasting' }, { level: 2, name: 'Divine Smite' },
      { level: 3, name: 'Divine Health' }, { level: 3, name: 'Sacred Oath' },
      { level: 5, name: 'Extra Attack' },
      { level: 6, name: 'Aura of Protection' },
      { level: 10, name: 'Aura of Courage' },
      { level: 11, name: 'Improved Divine Smite' },
      { level: 14, name: 'Cleansing Touch' },
      { level: 18, name: 'Aura Improvements (30 ft.)' },
    ],
    subclasses: [{
      id: 'devotion', name: 'Oath of Devotion', features: [
        { level: 3, name: 'Channel Divinity: Sacred Weapon & Turn the Unholy' },
        { level: 7, name: 'Aura of Devotion' }, { level: 15, name: 'Purity of Spirit' },
        { level: 20, name: 'Holy Nimbus' },
      ],
      spells: [
        { level: 3, names: ['Protection from Evil and Good', 'Sanctuary'] },
        { level: 5, names: ['Lesser Restoration', 'Zone of Truth'] },
        { level: 9, names: ['Beacon of Hope', 'Dispel Magic'] },
        { level: 13, names: ['Freedom of Movement', 'Guardian of Faith'] },
        { level: 17, names: ['Commune', 'Flame Strike'] },
      ],
    }],
  },
  {
    id: 'ranger', name: 'Ranger', hitDie: 10, primary: ['dex', 'wis'], saves: ['str', 'dex'], skillCount: 3,
    skillList: ['Animal Handling', 'Athletics', 'Insight', 'Investigation', 'Nature', 'Perception', 'Stealth', 'Survival'],
    armor: 'Light & medium armor, shields', weapons: 'Simple & martial weapons', caster: 'half', spellAbility: 'wis',
    subclassLevel: 3, subLabel: 'Ranger Archetype', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Favored Enemy' }, { level: 1, name: 'Natural Explorer' },
      { level: 2, name: 'Fighting Style' }, { level: 2, name: 'Spellcasting' },
      { level: 3, name: 'Ranger Archetype' }, { level: 3, name: 'Primeval Awareness' },
      { level: 5, name: 'Extra Attack' },
      { level: 8, name: "Land's Stride" },
      { level: 10, name: 'Hide in Plain Sight' },
      { level: 14, name: 'Vanish' },
      { level: 18, name: 'Feral Senses' },
      { level: 20, name: 'Foe Slayer' },
    ],
    subclasses: [{
      id: 'hunter', name: 'Hunter', features: [
        { level: 3, name: "Hunter's Prey" }, { level: 7, name: 'Defensive Tactics' },
        { level: 11, name: 'Multiattack' }, { level: 15, name: "Superior Hunter's Defense" },
      ],
      choices: [
        { level: 3, label: "Hunter's Prey", options: ['Colossus Slayer', 'Giant Killer', 'Horde Breaker'] },
        { level: 7, label: 'Defensive Tactics', options: ['Escape the Horde', 'Multiattack Defense', 'Steel Will'] },
        { level: 11, label: 'Multiattack', options: ['Volley', 'Whirlwind Attack'] },
        { level: 15, label: "Superior Hunter's Defense", options: ['Evasion', 'Stand Against the Tide', 'Uncanny Dodge'] },
      ],
    }],
  },
  {
    id: 'rogue', name: 'Rogue', hitDie: 8, primary: ['dex'], saves: ['dex', 'int'], skillCount: 4,
    skillList: ['Acrobatics', 'Athletics', 'Deception', 'Insight', 'Intimidation', 'Investigation', 'Perception', 'Performance', 'Persuasion', 'Sleight of Hand', 'Stealth'],
    armor: 'Light armor', weapons: 'Simple weapons, hand crossbows, longswords, rapiers, shortswords', caster: 'none',
    subclassLevel: 3, subLabel: 'Roguish Archetype', asiLevels: [4, 8, 10, 12, 16, 19],
    features: [
      { level: 1, name: 'Expertise' }, { level: 1, name: 'Sneak Attack (1d6)' }, { level: 1, name: "Thieves' Cant" },
      { level: 2, name: 'Cunning Action' },
      { level: 3, name: 'Roguish Archetype' }, { level: 3, name: 'Sneak Attack (2d6)' },
      { level: 5, name: 'Uncanny Dodge' },
      { level: 6, name: 'Expertise' },
      { level: 7, name: 'Evasion' },
      { level: 11, name: 'Reliable Talent' },
      { level: 14, name: 'Blindsense' },
      { level: 15, name: 'Slippery Mind' },
      { level: 18, name: 'Elusive' },
      { level: 20, name: 'Stroke of Luck' },
    ],
    subclasses: [{
      id: 'thief', name: 'Thief', features: [
        { level: 3, name: 'Fast Hands' }, { level: 3, name: 'Second-Story Work' },
        { level: 9, name: 'Supreme Sneak' }, { level: 13, name: 'Use Magic Device' },
        { level: 17, name: "Thief's Reflexes" },
      ],
    }],
  },
  {
    id: 'sorcerer', name: 'Sorcerer', hitDie: 6, primary: ['cha'], saves: ['con', 'cha'], skillCount: 2,
    skillList: ['Arcana', 'Deception', 'Insight', 'Intimidation', 'Persuasion', 'Religion'], armor: 'None',
    weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows', caster: 'full', spellAbility: 'cha',
    subclassLevel: 1, subLabel: 'Sorcerous Origin', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Spellcasting' }, { level: 1, name: 'Sorcerous Origin' },
      { level: 2, name: 'Font of Magic' },
      { level: 3, name: 'Metamagic' },
      { level: 10, name: 'Metamagic' },
      { level: 17, name: 'Metamagic' },
      { level: 20, name: 'Sorcerous Restoration' },
    ],
    subclasses: [{
      id: 'draconic', name: 'Draconic Bloodline', features: [
        { level: 1, name: 'Dragon Ancestor' }, { level: 1, name: 'Draconic Resilience (AC 13 + DEX)' },
        { level: 6, name: 'Elemental Affinity' }, { level: 14, name: 'Dragon Wings' },
        { level: 18, name: 'Draconic Presence' },
      ],
      choices: [{ level: 1, label: 'Dragon Ancestor', options: ['Black (acid)', 'Blue (lightning)', 'Brass (fire)', 'Bronze (lightning)', 'Copper (acid)', 'Gold (fire)', 'Green (poison)', 'Red (fire)', 'Silver (cold)', 'White (cold)'] }],
    }],
  },
  {
    id: 'warlock', name: 'Warlock', hitDie: 8, primary: ['cha'], saves: ['wis', 'cha'], skillCount: 2,
    skillList: ['Arcana', 'Deception', 'History', 'Intimidation', 'Investigation', 'Nature', 'Religion'], armor: 'Light armor',
    weapons: 'Simple weapons', caster: 'pact', spellAbility: 'cha', subclassLevel: 1, subLabel: 'Otherworldly Patron', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Otherworldly Patron' }, { level: 1, name: 'Pact Magic' },
      { level: 2, name: 'Eldritch Invocations' },
      { level: 3, name: 'Pact Boon' },
      { level: 11, name: 'Mystic Arcanum (6th level)' },
      { level: 13, name: 'Mystic Arcanum (7th level)' },
      { level: 15, name: 'Mystic Arcanum (8th level)' },
      { level: 17, name: 'Mystic Arcanum (9th level)' },
      { level: 20, name: 'Eldritch Master' },
    ],
    subclasses: [{
      id: 'fiend', name: 'The Fiend', features: [
        { level: 1, name: "Dark One's Blessing" }, { level: 6, name: "Dark One's Own Luck" },
        { level: 10, name: 'Fiendish Resilience' }, { level: 14, name: 'Hurl Through Hell' },
      ],
      spells: [
        { level: 1, names: ['Burning Hands', 'Command'] },
        { level: 3, names: ['Blindness/Deafness', 'Scorching Ray'] },
        { level: 5, names: ['Fireball', 'Stinking Cloud'] },
        { level: 7, names: ['Fire Shield', 'Wall of Fire'] },
        { level: 9, names: ['Flame Strike', 'Hallow'] },
      ],
    }],
  },
  {
    id: 'wizard', name: 'Wizard', hitDie: 6, primary: ['int'], saves: ['int', 'wis'], skillCount: 2,
    skillList: ['Arcana', 'History', 'Insight', 'Investigation', 'Medicine', 'Religion'], armor: 'None',
    weapons: 'Daggers, darts, slings, quarterstaffs, light crossbows', caster: 'full', spellAbility: 'int',
    subclassLevel: 2, subLabel: 'Arcane Tradition', asiLevels: STD_ASI,
    features: [
      { level: 1, name: 'Spellcasting' }, { level: 1, name: 'Arcane Recovery' },
      { level: 2, name: 'Arcane Tradition' },
      { level: 18, name: 'Spell Mastery' },
      { level: 20, name: 'Signature Spells' },
    ],
    subclasses: [{
      id: 'evocation', name: 'School of Evocation', features: [
        { level: 2, name: 'Evocation Savant' }, { level: 2, name: 'Sculpt Spells' },
        { level: 6, name: 'Potent Cantrip' }, { level: 10, name: 'Empowered Evocation' },
        { level: 14, name: 'Overchannel' },
      ],
    }],
  },
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

/** Kept for callers that want the common ASI schedule; per-class lives on cls.asiLevels. */
export const ASI_LEVELS = STD_ASI;

// ── Choice pools (SRD 5.1) ────────────────────────────────────────────────
export const FIGHTING_STYLES = ['Archery', 'Defense', 'Dueling', 'Great Weapon Fighting', 'Protection', 'Two-Weapon Fighting'];
const RANGER_STYLES = ['Archery', 'Defense', 'Dueling', 'Two-Weapon Fighting'];
export const METAMAGIC = ['Careful Spell', 'Distant Spell', 'Empowered Spell', 'Extended Spell', 'Heightened Spell', 'Quickened Spell', 'Subtle Spell', 'Twinned Spell'];
export const PACT_BOONS = ['Pact of the Chain', 'Pact of the Blade', 'Pact of the Tome'];
export const INVOCATIONS = [
  'Agonizing Blast', 'Armor of Shadows', 'Ascendant Step', 'Beast Speech', 'Beguiling Influence',
  'Bewitching Whispers', 'Book of Ancient Secrets', 'Chains of Carceri', "Devil's Sight", 'Dreadful Word',
  'Eldritch Sight', 'Eldritch Spear', 'Eyes of the Rune Keeper', 'Fiendish Vigor', 'Gaze of Two Minds',
  'Lifedrinker', 'Mask of Many Faces', 'Master of Myriad Forms', 'Minions of Chaos', 'Mire the Mind',
  'Misty Visions', 'One with Shadows', 'Otherworldly Leap', 'Repelling Blast', 'Sculptor of Flesh',
  'Sign of Ill Omen', 'Thief of Five Fates', 'Thirsting Blade', 'Visions of Distant Realms',
  'Voice of the Chain Master', 'Whispers of the Grave', 'Witch Sight',
];
// SRD 5.1 has exactly one feat; a builder can add more in the Sheet Builder.
export const FEATS = ['Grappler'];

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

// Cantrips known by character level (SRD 5.1), for the classes that have them.
const CANTRIPS_KNOWN: Partial<Record<string, number[]>> = {
  bard: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  cleric: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  druid: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  sorcerer: [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
  warlock: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  wizard: [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
};
// Spells KNOWN by character level (SRD 5.1) — the known casters. The prepared
// casters (cleric/druid/paladin/wizard) compute their count from ability + level.
const SPELLS_KNOWN: Partial<Record<string, number[]>> = {
  bard: [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22],
  ranger: [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11],
  sorcerer: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
};

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

/** Warlock Eldritch Invocations known by level (SRD 5.1). */
export function invocationsKnown(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  if (L < 2) return 0;
  if (L < 5) return 2;
  if (L < 7) return 3;
  if (L < 9) return 4;
  if (L < 12) return 5;
  if (L < 15) return 6;
  if (L < 18) return 7;
  return 8;
}

/** Sorcerer Metamagic options known by level (SRD 5.1). */
export function metamagicKnown(level: number): number {
  const L = Math.max(1, Math.min(20, level));
  return L >= 17 ? 4 : L >= 10 ? 3 : L >= 3 ? 2 : 0;
}

/** Cantrips known for a class at a level (0 if the class has none). */
export function cantripsKnown(clsId: string, level: number): number {
  const L = Math.max(1, Math.min(20, level));
  return CANTRIPS_KNOWN[clsId]?.[L - 1] ?? 0;
}

/** How many spells the character has: prepared (INT/WIS/CHA + level, half for
 *  paladin) or the class's fixed "known" count. `null` for non-casters. */
export function spellCount(cls: ClassDef, level: number, mods: Record<Ability, number>): { count: number; label: 'known' | 'prepared' } | null {
  const L = Math.max(1, Math.min(20, level));
  if (cls.caster === 'none' || !cls.spellAbility) return null;
  const known = SPELLS_KNOWN[cls.id];
  if (known) return { count: known[L - 1] ?? 0, label: 'known' };
  const mod = mods[cls.spellAbility];
  const base = cls.caster === 'half' ? mod + Math.floor(L / 2) : mod + L;
  return { count: Math.max(1, base), label: 'prepared' };
}

type Rng = () => number;
const roll4d6dropLowest = (rng: Rng): number => {
  const dice = [0, 0, 0, 0].map(() => 1 + Math.floor(rng() * 6)).sort((a, b) => a - b);
  return dice[1]! + dice[2]! + dice[3]!;
};
const pick = <T>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length)]!;
/** Draw `n` distinct items from `arr` (without replacement), deterministically. */
const pickN = <T>(rng: Rng, arr: T[], n: number): T[] => {
  const pool = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!);
  return out;
};

export type AbilityMethod = 'array' | 'roll';
const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

/** The class's ability priority: primaries, then CON, then the rest, stable. */
function abilityOrder(cls: ClassDef): Ability[] {
  const order: Ability[] = [];
  for (const a of [...cls.primary, 'con' as Ability, 'dex' as Ability, 'wis' as Ability, 'cha' as Ability, 'int' as Ability, 'str' as Ability]) {
    if (!order.includes(a)) order.push(a);
  }
  return order;
}

/** Assign scores to abilities by the class's priorities, apply racial ASIs.
 *  Deterministic given (class, race, method, rng). */
export function assignAbilities(cls: ClassDef, race: RaceDef, method: AbilityMethod, rng: Rng): Record<Ability, number> {
  const pool = method === 'roll'
    ? [0, 0, 0, 0, 0, 0].map(() => roll4d6dropLowest(rng)).sort((a, b) => b - a)
    : [...STANDARD_ARRAY];
  const order = abilityOrder(cls);
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

/** How level-up slots (Ability Score Improvements) are spent. */
export type FeatMode = 'roll' | 'scores' | 'feat';
export interface LevelUp { level: number; kind: 'asi' | 'feat'; detail: string; ability?: Ability }

/** Spend each Ability Score Improvement: +2 to the highest-priority ability
 *  below 20 (a legal, sensible default), or — when feats are allowed — the
 *  first slot on a rolled feat. The SRD has one feat, so at most one slot is a
 *  feat. Mutates `scores` for the ASI slots and returns the per-level plan. */
function planLevelUps(scores: Record<Ability, number>, cls: ClassDef, level: number, mode: FeatMode, rng: Rng): LevelUp[] {
  const order = abilityOrder(cls);
  const levels = cls.asiLevels.filter((lv) => lv <= level);
  const takeFeat = levels.length > 0 && (mode === 'feat' || (mode === 'roll' && rng() < 0.4));
  const out: LevelUp[] = [];
  let featSpent = false;
  for (const lv of levels) {
    if (takeFeat && !featSpent) {
      featSpent = true;
      out.push({ level: lv, kind: 'feat', detail: pick(rng, FEATS) });
      continue;
    }
    const target = order.find((a) => scores[a] < 20) ?? order[0]!;
    scores[target] = Math.min(20, scores[target] + 2);
    out.push({ level: lv, kind: 'asi', detail: `+2 ${ABILITY_LABEL[target]}`, ability: target });
  }
  return out;
}

/** Hit points by the fixed-average method (max at 1st, class average after). */
const hpAverage = (cls: ClassDef, level: number, conMod: number, bonus: number): number =>
  Math.max(1, cls.hitDie + conMod + (level - 1) * (Math.floor(cls.hitDie / 2) + 1 + conMod) + bonus);
/** Hit points rolled: max at 1st level, then a hit die + CON each level after. */
const hpRolled = (cls: ClassDef, level: number, conMod: number, bonus: number, rng: Rng): number => {
  let hp = cls.hitDie + conMod;
  for (let i = 1; i < level; i++) hp += Math.max(1, 1 + Math.floor(rng() * cls.hitDie) + conMod);
  return Math.max(1, hp + bonus);
};

/** A rolled choice. Single-pick choices carry `options` + a `value` (a dropdown
 *  in the sheet). Multi-pick ones (metamagic, invocations, expertise) also carry
 *  `values` — the several picks — over the shared `options` pool (a group of
 *  dropdowns). `value` stays the joined text for a plain fallback. */
export interface CharacterChoice { label: string; value: string; options?: string[]; values?: string[] }

export interface CharacterResult {
  race: RaceDef;
  cls: ClassDef;
  subclass?: SubclassDef;
  subclassLevel: number;
  background: BackgroundDef;
  level: number;
  alignment: string;
  abilities: Record<Ability, number>;
  mods: Record<Ability, number>;
  prof: number;
  speed: number;
  size: string;
  maxHp: number;
  hpMethod: 'average' | 'roll';
  hitDice: string;
  saves: Ability[];
  skills: string[]; // proficient skill names
  ac: number; // unarmored baseline
  asiSpent: { level: number; ability: Ability }[];
  levelUps: LevelUp[]; // each ASI level: an ability bump or a feat
  choices: CharacterChoice[]; // fighting style, metamagic, invocations, expertise, pact boon, subclass menus
  domainSpells: SubSpellTier[]; // always-prepared subclass spells up to level
  spellcasting?: {
    ability: Ability; saveDc: number; attack: number; slots: number[];
    cantrips: number; spells: number; spellsLabel: 'known' | 'prepared';
    pact?: { count: number; slotLevel: number };
  };
  featureLog: { source: string; name: string; note?: string }[];
}

export interface BuildOpts {
  cls: string; // class id, or '' for random
  race: string; // race id, or ''
  background: string; // bg id, or ''
  subclass?: string; // subclass id, '' for random (applied only at subclassLevel+)
  fightingStyle?: string; // style name, '' for random (only for classes that get one)
  level: number;
  method: AbilityMethod;
  hp?: 'average' | 'roll'; // hit points: fixed average (default) or rolled
  feats?: FeatMode; // level-up slots: 'roll' (default), 'scores' only, or 'feat'
}

/** The whole computation: choices (or random) → a mechanically-correct sheet. */
export function computeCharacter(opts: BuildOpts, rng: Rng): CharacterResult {
  const cls = CLASSES.find((c) => c.id === opts.cls) ?? pick(rng, CLASSES);
  const race = RACES.find((r) => r.id === opts.race) ?? pick(rng, RACES);
  const background = BACKGROUNDS.find((b) => b.id === opts.background) ?? pick(rng, BACKGROUNDS);
  const level = Math.max(1, Math.min(20, Math.floor(opts.level) || 1));

  // Subclass, if the character is high enough level for one.
  const hasSub = level >= cls.subclassLevel && cls.subclasses.length > 0;
  const subclass = hasSub
    ? (cls.subclasses.find((s) => s.id === opts.subclass) ?? pick(rng, cls.subclasses))
    : undefined;

  // Ability scores: assign, then spend level-up slots (raising primaries, or a
  // feat) so a higher-level build has the improvements the rules give it.
  const abilities = assignAbilities(cls, race, opts.method, rng);
  const featMode: FeatMode = opts.feats === 'scores' ? 'scores' : opts.feats === 'feat' ? 'feat' : 'roll';
  const levelUps = planLevelUps(abilities, cls, level, featMode, rng);
  const asiSpent = levelUps.filter((k) => k.kind === 'asi').map((k) => ({ level: k.level, ability: k.ability! }));
  const mods = {} as Record<Ability, number>;
  for (const a of ABILITIES) mods[a] = abilityMod(abilities[a]);
  const prof = profBonus(level);

  // HP: max at 1st; the rest averaged or rolled. +1/level for Hill Dwarf.
  const dwarfToughness = race.id === 'dwarf' ? level : 0;
  const hpMethod: 'average' | 'roll' = opts.hp === 'roll' ? 'roll' : 'average';
  const maxHp = hpMethod === 'roll'
    ? hpRolled(cls, level, mods.con, dwarfToughness, rng)
    : hpAverage(cls, level, mods.con, dwarfToughness);

  // Proficient skills: class picks (first N of its list, minus any the
  // background already grants) + the background's two.
  const bgSkills = background.skills;
  const classPicks = cls.skillList.filter((s) => !bgSkills.includes(s)).slice(0, cls.skillCount);
  const skills = [...new Set([...classPicks, ...bgSkills])];

  const ac = 10 + mods.dex;

  // Spellcasting: DC/attack, slots, and how many cantrips + spells are known/prepared.
  // Half casters (paladin, ranger) gain spellcasting at 2nd level, not 1st.
  let spellcasting: CharacterResult['spellcasting'];
  if (cls.caster !== 'none' && cls.spellAbility && (cls.caster !== 'half' || level >= 2)) {
    const sa = cls.spellAbility;
    const sc = spellCount(cls, level, mods);
    spellcasting = {
      ability: sa,
      saveDc: 8 + prof + mods[sa],
      attack: prof + mods[sa],
      slots: spellSlots(cls, level),
      cantrips: cantripsKnown(cls.id, level),
      spells: sc?.count ?? 0,
      spellsLabel: sc?.label ?? 'known',
      ...(cls.caster === 'pact' ? { pact: pactSlots(level) } : {}),
    };
  }

  // Rolled choices — a legal random pick for each choice the class grants by
  // this level. Surfaced so a player can keep or reroll them.
  const choices: CharacterChoice[] = [];
  const styleClass = cls.id === 'fighter' || cls.id === 'paladin' || cls.id === 'ranger';
  const styleLevel = cls.id === 'fighter' ? 1 : 2;
  if (styleClass && level >= styleLevel) {
    const pool = cls.id === 'ranger' ? RANGER_STYLES : FIGHTING_STYLES;
    const style = pool.includes(opts.fightingStyle ?? '') ? opts.fightingStyle! : pick(rng, pool);
    choices.push({ label: 'Fighting Style', value: style, options: pool });
  }
  if (cls.id === 'sorcerer' && metamagicKnown(level) > 0) {
    const picks = pickN(rng, METAMAGIC, metamagicKnown(level));
    choices.push({ label: 'Metamagic', value: picks.join(', '), options: METAMAGIC, values: picks });
  }
  if (cls.id === 'warlock') {
    if (invocationsKnown(level) > 0) {
      const picks = pickN(rng, INVOCATIONS, invocationsKnown(level));
      choices.push({ label: 'Eldritch Invocations', value: picks.join(', '), options: INVOCATIONS, values: picks });
    }
    if (level >= 3) choices.push({ label: 'Pact Boon', value: pick(rng, PACT_BOONS), options: PACT_BOONS });
  }
  // Expertise: bard (2 at 3, +2 at 10) and rogue (2 at 1, +2 at 6).
  const expertiseCount = cls.id === 'bard' ? (level >= 10 ? 4 : level >= 3 ? 2 : 0)
    : cls.id === 'rogue' ? (level >= 6 ? 4 : 2) : 0;
  if (expertiseCount > 0 && skills.length) {
    const picks = pickN(rng, skills, Math.min(expertiseCount, skills.length));
    choices.push({ label: 'Expertise', value: picks.join(', '), options: skills, values: picks });
  }
  // Subclass menu choices (Dragon Ancestor, Circle terrain, Hunter's options).
  for (const ch of subclass?.choices ?? []) {
    if (ch.level <= level) choices.push({ label: ch.label, value: pick(rng, ch.options), options: ch.options });
  }

  const domainSpells = (subclass?.spells ?? []).filter((t) => t.level <= level);

  // Feature log: race traits, then class + subclass features + ASI lines up to
  // the character's level (interleaved by level), then the background feature.
  const featureLog: CharacterResult['featureLog'] = [];
  for (const t of race.traits) featureLog.push({ source: race.name, name: t });
  const luByLevel = new Map(levelUps.map((k) => [k.level, k]));
  for (let lv = 1; lv <= level; lv++) {
    for (const f of cls.features) if (f.level === lv) featureLog.push({ source: `${cls.name} ${lv}`, name: f.name, note: f.note });
    if (subclass && lv >= cls.subclassLevel) {
      for (const f of subclass.features) if (f.level === lv) featureLog.push({ source: `${subclass.name} ${lv}`, name: f.name, note: f.note });
    }
    const lu = luByLevel.get(lv);
    if (lu) featureLog.push({ source: `${cls.name} ${lv}`, name: lu.kind === 'feat' ? `Feat: ${lu.detail}` : `Ability Score Improvement (${lu.detail})` });
  }
  featureLog.push({ source: background.name, name: background.feature });

  return {
    race, cls, subclass, subclassLevel: cls.subclassLevel, background, level,
    alignment: pick(rng, ALIGNMENTS),
    abilities, mods, prof,
    speed: race.speed, size: race.size,
    maxHp,
    hpMethod,
    hitDice: `${level}d${cls.hitDie}`,
    saves: cls.saves,
    skills,
    ac,
    asiSpent,
    levelUps,
    choices,
    domainSpells,
    spellcasting,
    featureLog,
  };
}
