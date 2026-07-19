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
//
// Owner review 2026-07-18 reshaped the sheet: a compact combat strip up top
// (Initiative rolls on tap), titled ability/senses sections, HP + Death Saves
// as condensed groups (HP typable in edit AND play), saves and skills as
// clickable proficiency-grid cards (expertise checkboxes fold 2×prof in, per
// the SRD's Expertise rule), a race-and-sex-locked generated portrait with a
// name drawn from the SAME race's name table, an aggregated Features & Traits
// panel, and a proper inventory page — purse, attunement, optional bag of
// holding — with the notes/lore/personality section at the bottom.
// SRD 5.1 © Wizards of the Coast, CC BY 4.0 (LICENSE-SRD.md).

import { makeComposer, type CompositeMeta, type OptionRefinement } from '../engine/composite.ts';
import { makeRng } from '../engine/rng.ts';
import type { Block, TableRegistry } from '../engine/types.ts';
import {
  CLASSES, RACES, BACKGROUNDS, ABILITIES, ABILITY_LABEL, SKILLS, FIGHTING_STYLES, ALIGNMENTS,
  computeCharacter, fmtMod, type Ability, type AbilityMethod, type FeatMode,
} from '../engine/dnd5e.ts';
import { CLASS_SPELLS } from '../engine/dnd5e-spells.ts';
import { defaultRecipe, knownRace, serializeRecipe, type Sex } from '../everdeep/portraits.ts';

const FULL_ABILITY: Record<Ability, string> = {
  str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma',
};
const ordinal = (n: number): string => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - n % 10 === 10 ? 0 : n % 10)] ?? 'th'}`;

const RANDOM = { value: '', label: '✨ Random' };
// Ranger draws from a shorter fighting-style list than fighter/paladin (SRD 5.1).
const RANGER_STYLES = ['Archery', 'Defense', 'Dueling', 'Two-Weapon Fighting'];

// Each SRD race's own name table (forged per race, tagged male/female), so a
// dwarf gets a dwarven name in the rolled sex's column — the same identity the
// portrait recipe locks. Quoted ids stay FULL literals for the registry
// scanner (gen-registries.mjs).
const NAME_TABLE: Record<string, string> = {
  human: 'gm/npc/names/human',
  dwarf: 'gm/npc/names/dwarf',
  elf: 'gm/npc/names/high-elf',
  halfling: 'gm/npc/names/halfling',
  gnome: 'gm/npc/names/gnome',
  dragonborn: 'gm/npc/names/dragonborn',
  'half-elf': 'gm/npc/names/half-elf',
  'half-orc': 'gm/npc/names/half-orc',
  tiefling: 'gm/npc/names/tiefling',
};

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

  // One identity, three locks: the sex is seeded outside the build stream (so
  // rerolling a dial never flips it), the name comes from THIS race's name
  // table in that sex's column, and the portrait recipe carries both — the
  // face in the corner matches the name at the top, forever.
  const sex: Sex = makeRng(`${seed}#sex`)() < 0.5 ? 'male' : 'female';
  const name = c.text(`{table:${NAME_TABLE[r.race.id] ?? 'gm/npc/names/human'}#${sex}}`).trim() || 'New Adventurer';
  const portrait = serializeRecipe(defaultRecipe(`${seed}#face`, knownRace(r.race.name) ?? 'human', sex));

  const weaponAbility: Ability = r.mods.str >= r.mods.dex ? 'str' : 'dex';
  const subName = r.subclass ? r.subclass.name : `unlocks at level ${r.subclassLevel}`;

  // Expertise (bard/rogue): the rolled picks seed the skills grid's checkbox
  // state — the grid IS the source of truth now, so the old Expertise dropdown
  // group no longer renders beside it (two copies would drift).
  const expertisePicks = r.choices.find((ch) => ch.label === 'Expertise')?.values ?? [];
  const percTier = expertisePicks.includes('Perception') ? 2 : r.skills.includes('Perception') ? 1 : 0;
  const passivePerception = 10 + r.mods.wis + percTier * r.prof;

  // Every rolled choice is a dropdown in the sheet: single-pick ones (fighting
  // style, pact boon, subclass menus) a `choice`; multi-pick ones (metamagic,
  // invocations) a `choiceList` — a group of dropdowns over the pool.
  const choiceBlocks: Block[] = r.choices
    .filter((ch) => ch.label !== 'Expertise')
    .map((ch) =>
      ch.values
        ? { type: 'choiceList', label: ch.label, options: ch.options ?? [], values: ch.values }
        : ch.options?.length
          ? { type: 'choice', label: ch.label, value: ch.value, options: ch.options }
          : { type: 'paragraph', label: ch.label, text: ch.value },
    );
  // Level-up decisions — each Ability Score Improvement, taken as a stat bump or
  // a feat. The rules let you choose either at 4/8/12/16/19 (fighter & rogue more).
  const levelUpBlocks: Block[] = r.levelUps.length
    ? [{ type: 'list', label: 'Level-Up Choices', items: r.levelUps.map((k) => `Level ${k.level}: ${k.kind === 'feat' ? `Feat — ${k.detail}` : k.detail}`) }]
    : [];

  // ── Page 1: the classic three-column character sheet ──────────────────────
  // A compact combat strip spans the top (Initiative rolls on tap), then the
  // three-column body — abilities, senses and saves down the LEFT; hit points,
  // death saves and attacks in the MIDDLE; the portrait, choices and features
  // on the RIGHT — and the full-width skills table under it. Every field stays
  // a live block: tap a card to roll it, type over the HP, tick a checkbox.
  const header: Block[] = [
    { type: 'title', text: name, subtitle: `Level ${r.level} ${r.race.name} ${r.cls.name}${r.subclass ? ` · ${r.subclass.name}` : ''}` },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Level', value: String(r.level) },
        { key: r.cls.subLabel, value: subName },
        { key: 'Background', value: r.background.name },
      ],
    },
    // Race / class / alignment as dropdowns with 🎲 (owner ask 2026-07-19).
    // These are the sheet's LABELS — re-picking one relabels the character;
    // the mechanically-recomputed build still comes from the page's dials
    // (a class swap here doesn't re-derive HP or spells).
    { type: 'choice', label: 'Race', value: r.race.name, options: RACES.map((x) => x.name) },
    { type: 'choice', label: 'Class', value: r.cls.name, options: CLASSES.map((x) => x.name) },
    { type: 'choice', label: 'Alignment', value: r.alignment, options: ALIGNMENTS },
    { type: 'paragraph', label: 'How it rolls', text: `Tap an ability, save, skill, or attack to roll it — modifiers read live, so raising a score updates every roll. Proficient saves and skills already fold in $prof (${fmtMod(r.prof)}), and expertise doubles it; in edit mode every skill card carries proficiency and expertise checkboxes. Ability scores use the ${opts.abilities === 'roll' ? 'rolled 4d6-drop-lowest' : 'standard array'} with ${r.race.name} increases${r.asiSpent.length ? ` and ${r.asiSpent.length} Ability Score Improvement${r.asiSpent.length > 1 ? 's' : ''} applied` : ''}; hit points are ${r.hpMethod === 'roll' ? 'rolled' : 'the fixed average'} and typable at the table. Spell slots tick as you cast, and hovering any spell shows its card. The ${r.cls.subLabel} ${r.subclass ? `is ${r.subclass.name}` : `unlocks at level ${r.subclassLevel}`}.` },
  ];

  // The upper combat section: AC and Speed read, Initiative ROLLS.
  const combat: Block = {
    type: 'statGrid', title: 'Combat', compact: true, computeMods: false, rollable: false,
    stats: [
      { label: 'AC', value: String(r.ac), sub: 'unarmored' },
      { label: 'Initiative', value: fmtMod(r.mods.dex), sub: 'DEX · tap to roll', roll: '1d20+$dex.mod' },
      { label: 'Speed', value: String(r.speed), sub: 'feet' },
    ],
  };

  // Saves: the six-card set, proficiency badged and folded into the bonus.
  const savesGrid: Block = {
    type: 'profGrid', label: 'Saving Throws', layout: 'row',
    items: ABILITIES.map((a) => ({ name: FULL_ABILITY[a], ability: a, ...(r.saves.includes(a) ? { prof: true } : {}) })),
  };

  // Skills: the six-column ability table, every card rollable, proficiency and
  // expertise highlighted (and toggleable in edit mode).
  const skillsGrid: Block = {
    type: 'profGrid', label: 'Skills', layout: 'byAbility',
    items: SKILLS.map((s) => ({
      name: s.name, ability: s.ability,
      ...(r.skills.includes(s.name) || expertisePicks.includes(s.name) ? { prof: true } : {}),
      ...(expertisePicks.includes(s.name) ? { expertise: true } : {}),
    })),
  };

  const leftCol: Block[] = [
    {
      type: 'statGrid', title: 'Ability Scores', compact: true, computeMods: true, rollable: true,
      stats: ABILITIES.map((a) => ({ label: ABILITY_LABEL[a], value: String(r.abilities[a]) })),
    },
    {
      type: 'statGrid', title: 'Proficiency & Senses', compact: true, computeMods: false, rollable: false,
      stats: [
        { label: 'Prof', value: fmtMod(r.prof), sub: 'bonus' },
        { label: 'Pass. Per', value: String(passivePerception), sub: 'WIS' },
      ],
    },
    { type: 'tracker', label: 'Inspiration', current: 0, max: 1, style: 'boxes' },
    savesGrid,
  ];

  const middleCol: Block[] = [
    // The condensed vitals group: HP typable in edit and play, hit dice as
    // spendable boxes, all under one frame.
    {
      type: 'statblock', name: 'Hit Points', meta: `${r.hitDice} hit dice`,
      sections: [
        { type: 'tracker', label: 'Hit Points', current: r.maxHp, max: r.maxHp, style: 'number' },
        { type: 'tracker', label: 'Temp HP', current: 0, style: 'number' },
        { type: 'tracker', label: 'Hit Dice', current: r.level, max: r.level, style: 'boxes' },
        // The roll beside the counter (owner ask 2026-07-19): SRD hit dice
        // are the class die × level. "spend" is the short-rest heal
        // (1 die + CON); "all" throws the whole pool at once.
        {
          type: 'actions',
          items: [{
            label: 'Roll hit dice',
            note: `d${r.cls.hitDie} × ${r.level} — spend one to heal on a short rest`,
            rolls: [
              { name: 'spend one', formula: `1d${r.cls.hitDie}+$con.mod` },
              { name: 'all', formula: `${r.level}d${r.cls.hitDie}` },
            ],
          }],
        },
      ],
    },
    // Death saves: the boxes AND the roll, one group.
    {
      type: 'statblock', name: 'Death Saves',
      sections: [
        { type: 'tracker', label: 'Successes', current: 0, max: 3, style: 'boxes' },
        { type: 'tracker', label: 'Failures', current: 0, max: 3, style: 'boxes' },
        { type: 'actions', items: [{ label: 'Death saving throw', note: '10+ succeeds', rolls: [{ name: 'd20', formula: '1d20' }] }] },
      ],
    },
    {
      type: 'actions', title: 'Attacks',
      items: [
        { label: 'Weapon (melee)', note: ABILITY_LABEL[weaponAbility], rolls: [{ name: 'to hit', formula: `1d20+$${weaponAbility}.mod+$prof` }, { name: 'damage', formula: `1d8+$${weaponAbility}.mod` }] },
        { label: 'Unarmed strike', note: ABILITY_LABEL[weaponAbility], rolls: [{ name: 'to hit', formula: `1d20+$${weaponAbility}.mod+$prof` }, { name: 'damage', formula: `1+$${weaponAbility}.mod` }] },
        ...(r.spellcasting ? [{ label: 'Spell attack', note: `${ABILITY_LABEL[r.spellcasting.ability]} + prof`, rolls: [{ name: 'to hit', formula: `1d20+$prof+$${r.spellcasting.ability}.mod` }] }] : []),
      ],
    },
    {
      type: 'actions', title: 'Rolls',
      items: [{ label: 'Roll a stat', note: '4d6 drop lowest', rolls: [{ name: 'score', formula: '4d6dl1' }] }],
    },
  ];

  const rightCol: Block[] = [
    // The generated portrait — race and sex locked to the character; reroll
    // the look or replace it with a photo in edit mode.
    { type: 'image', layout: 'block', caption: '', portrait },
    ...choiceBlocks,
    ...levelUpBlocks,
    // Everything the character IS, aggregated in one panel: proficiencies in
    // text, armor/weapons/tools/languages, and the full feature log.
    {
      type: 'statblock', name: 'Features & Traits',
      sections: [
        {
          type: 'paragraph', label: 'Skill Proficiencies',
          text: SKILLS.filter((s) => r.skills.includes(s.name) || expertisePicks.includes(s.name))
            .map((s) => `${s.name} (${expertisePicks.includes(s.name) ? 'expertise' : 'proficiency'})`)
            .join(', ') || '—',
        },
        {
          type: 'keyValue',
          pairs: [
            { key: 'Armor', value: r.cls.armor },
            { key: 'Weapons', value: r.cls.weapons },
            { key: 'Tools', value: '—' },
            { key: 'Languages', value: 'Common, plus one from your race or background' },
          ],
        },
        { type: 'list', items: r.featureLog.map((f) => `${f.name}${f.note ? ` — ${f.note}` : ''} (${f.source})`) },
      ],
    },
  ];

  // ── Page 2: inventory & equipment, then notes/lore at the bottom ──────────
  const details: Block[] = [
    { type: 'title', text: 'Inventory & Equipment', subtitle: `${r.race.name} · ${r.background.name}` },
    {
      type: 'columns',
      columns: [
        [
          { type: 'list', label: 'Equipment', items: ['Explorer\'s pack', 'A weapon of note: {table:gm/loot/weapon-look}', 'Rope, 50 ft.', 'Rations, 5 days'].map((t) => c.text(t)) },
          {
            type: 'statblock', name: 'Money Purse',
            sections: [{
              type: 'keyValue',
              pairs: [
                { key: 'Copper (cp)', value: '0' },
                { key: 'Silver (sp)', value: '0' },
                { key: 'Electrum (ep)', value: '0' },
                { key: 'Gold (gp)', value: '10' },
                { key: 'Platinum (pp)', value: '0' },
              ],
            }],
          },
        ],
        [
          {
            type: 'statblock', name: 'Attunement', meta: 'three slots',
            sections: [
              { type: 'tracker', label: 'Attuned', current: 0, max: 3, style: 'boxes' },
              { type: 'list', items: ['Slot 1 — empty', 'Slot 2 — empty', 'Slot 3 — empty'] },
            ],
          },
          { type: 'paragraph', label: 'Bag of Holding (optional)', text: 'If the party carries one, list its contents here — 500 lb. of storage in a bag that always weighs 15 lb.' },
        ],
      ],
    },
    { type: 'title', text: 'Notes & Lore' },
    {
      type: 'columns',
      columns: [
        [
          { type: 'paragraph', label: 'Personality Trait', text: c.text('{table:gm/npc/demeanor}') },
          { type: 'paragraph', label: 'Ideal', text: 'What does your character believe in above all?' },
          { type: 'paragraph', label: 'Bond', text: `A cherished keepsake: ${c.text('{table:gm/npc/keepsake}')}` },
          { type: 'paragraph', label: 'Flaw', text: c.text('{table:gm/npc/flaw-or-prejudice}') },
        ],
        [
          { type: 'paragraph', label: 'Appearance', text: `A ${r.race.name.toLowerCase()} of the ${r.background.name.toLowerCase()} — age, height, eyes, skin, hair, and the marks that set them apart.` },
          { type: 'paragraph', label: 'Backstory', text: c.text('{table:gm/npc/backstory}') },
          { type: 'paragraph', label: 'Allies & Organizations', text: 'Who stands with them — a guild, a patron, a companion?' },
          { type: 'paragraph', label: 'Notes', text: 'Write here…' },
        ],
      ],
    },
  ];

  // ── Page 3: spellcasting (only for casters) ───────────────────────────────
  // Laid out like the printed spell page: the casting summary, always-prepared
  // subclass spells, cantrips, then each spell level as its slots (clickable
  // boxes that tick down as you cast) beside that level's spells (a dropdown per
  // slot, each spell hoverable for its card).
  const spellPage: Block[] = [];
  if (r.spellcasting) {
    const sc = r.spellcasting;
    spellPage.push(
      { type: 'title', text: 'Spellcasting', subtitle: `${r.cls.name} · ${FULL_ABILITY[sc.ability]}` },
      {
        type: 'statGrid', compact: true, computeMods: false, rollable: false,
        stats: [
          { label: 'Ability', value: ABILITY_LABEL[sc.ability] },
          { label: 'Save DC', value: String(sc.saveDc) },
          { label: 'Attack', value: fmtMod(sc.attack), sub: 'to hit' },
          ...(sc.cantrips ? [{ label: 'Cantrips', value: String(sc.cantrips), sub: 'known' }] : []),
          { label: sc.spellsLabel === 'known' ? 'Known' : 'Prepared', value: String(sc.spells), sub: 'spells' },
        ],
      },
    );
    // Warlock Pact Magic is one shared pool of slots, not one per spell level.
    if (sc.pact) {
      spellPage.push({ type: 'tracker', label: `Pact Slots (${ordinal(sc.pact.slotLevel)}-level)`, current: sc.pact.count, max: sc.pact.count, style: 'boxes' });
    }
    // Always-available subclass spells (Life Domain, Oath of Devotion, The
    // Fiend) — hoverable spell chips, like the spellbook below.
    if (r.domainSpells.length) {
      spellPage.push({
        type: 'list',
        label: `${r.subclass?.name ?? 'Subclass'} Spells (always prepared)`,
        items: r.domainSpells.flatMap((t) => t.names).map((n) => `[[spell:${n}]]`),
      });
    }
    // A rolled starting spellbook drawn from this CLASS's SRD spell list — the
    // right number of cantrips, then spells spread across the levels you can
    // cast — so a wizard rolls wizard spells, a cleric rolls cleric spells.
    const classSpells = CLASS_SPELLS[r.cls.id];
    if (classSpells) {
      // Cantrips have no slot — a full-width dropdown group.
      const cantripPool = classSpells[0] ?? [];
      const cantrips = drawFrom(cantripPool, sc.cantrips, 'cantrips');
      if (cantrips.length) spellPage.push({ type: 'choiceList', label: 'Cantrips', options: cantripPool, values: cantrips, hover: 'spell' });
    }
    // Spread the known/prepared spells across every level you can cast, then
    // pair each level's slots (clickable boxes) with that level's spells.
    const maxLvl = sc.pact ? sc.pact.slotLevel : Math.max(1, sc.slots.length);
    const nSpells = classSpells ? Math.min(sc.spells, 18) : 0;
    const perLevel = Array.from({ length: maxLvl }, () => 0);
    for (let i = 0; i < nSpells; i++) perLevel[i % maxLvl]!++;
    for (let lvl = 1; lvl <= maxLvl; lvl++) {
      // Leveled casters get a slot tracker per level; the warlock's single pool
      // is already placed above, so its per-level rows are spells only.
      const slots = sc.pact ? 0 : (sc.slots[lvl - 1] ?? 0);
      const slotTracker: Block | null = slots > 0
        ? { type: 'tracker', label: `Level ${lvl} Slots`, current: slots, max: slots, style: 'boxes' }
        : null;
      const pool = classSpells?.[lvl] ?? [];
      const picks = drawFrom(pool, perLevel[lvl - 1] ?? 0, `spells-${lvl}`);
      const spells: Block | null = picks.length
        ? { type: 'choiceList', label: `${ordinal(lvl)}-Level Spells`, options: pool, values: picks, hover: 'spell' }
        : null;
      if (slotTracker && spells) spellPage.push({ type: 'columns', columns: [[slotTracker], [spells]] });
      else if (slotTracker) spellPage.push(slotTracker);
      else if (spells) spellPage.push(spells);
    }
  }

  return [
    ...header,
    combat,
    { type: 'columns', columns: [leftCol, middleCol, rightCol] },
    skillsGrid,
    { type: 'pageBreak' },
    ...details,
    ...(spellPage.length ? [{ type: 'pageBreak' } as Block, ...spellPage] : []),
  ];
}
