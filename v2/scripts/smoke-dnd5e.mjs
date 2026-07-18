// The D&D 5e ruleset engine (engine/dnd5e.ts) must be correct and
// deterministic: proficiency bonus by level, racial ability increases, spell
// slots per caster type, and a clean build for every class at every level.
// A wrong number here ships a wrong character sheet. Run: node scripts/smoke-dnd5e.mjs
// (part of npm run smoke).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { makeRng } from '../src/engine/rng.ts';
import {
  CLASSES, RACES, BACKGROUNDS, ABILITIES, profBonus, spellSlots, pactSlots, computeCharacter,
  cantripsKnown, invocationsKnown, metamagicKnown,
} from '../src/engine/dnd5e.ts';
import { CLASS_SPELLS } from '../src/engine/dnd5e-spells.ts';

const SPELL_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/data/gm/spells');

// A build helper: fill the required opts, override what a test cares about.
// Defaults to deterministic ability-score level-ups + average HP so counts are
// stable; the 'roll'/'feat' modes are exercised explicitly where they matter.
const mk = (o) => computeCharacter({ cls: 'fighter', race: 'human', background: 'soldier', level: 1, method: 'array', feats: 'scores', hp: 'average', ...o }, makeRng(JSON.stringify(o)));

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error(`✗ ${msg}`); } };
const sum = (o) => ABILITIES.reduce((n, a) => n + o[a], 0);

// 1. proficiency bonus bands
for (const [lv, pb] of [[1, 2], [4, 2], [5, 3], [8, 3], [9, 4], [12, 4], [13, 5], [16, 5], [17, 6], [20, 6]]) {
  check(profBonus(lv) === pb, `profBonus(${lv}) should be ${pb}, got ${profBonus(lv)}`);
}
console.log('✓ proficiency bonus scales 2→6 across levels');

// 2. the SRD roster is complete
check(CLASSES.length === 12, `expected 12 classes, got ${CLASSES.length}`);
check(RACES.length === 9, `expected 9 races, got ${RACES.length}`);
check(BACKGROUNDS.length >= 6, `expected ≥6 backgrounds, got ${BACKGROUNDS.length}`);
console.log(`✓ roster: ${CLASSES.length} classes, ${RACES.length} races, ${BACKGROUNDS.length} backgrounds`);

// 3. determinism — same opts + seed → identical character
const opts = { cls: 'wizard', race: 'elf', background: 'scholar', level: 5, method: 'array' };
const a = computeCharacter(opts, makeRng('codex'));
const b = computeCharacter(opts, makeRng('codex'));
check(JSON.stringify(a) === JSON.stringify(b), 'computeCharacter is not deterministic for a fixed seed');
console.log('✓ deterministic: same class/race/level + seed → identical build');

// 4. racial ASIs land — standard array sums 72; race adds its total
const arraySum = 72;
const human = computeCharacter({ cls: 'fighter', race: 'human', background: 'soldier', level: 1, method: 'array' }, makeRng('h'));
check(sum(human.abilities) === arraySum + 6, `human should be +6 total, got ${sum(human.abilities) - arraySum}`);
const dwarf = computeCharacter({ cls: 'cleric', race: 'dwarf', background: 'acolyte', level: 1, method: 'array' }, makeRng('d'));
check(sum(dwarf.abilities) === arraySum + 3, `hill dwarf should be +3 total (CON2+WIS1), got ${sum(dwarf.abilities) - arraySum}`);
check(dwarf.mods.con >= 2, 'dwarf CON increase should raise its modifier');
console.log('✓ racial ability increases applied (human +6, hill dwarf CON+2/WIS+1)');

// 5. saves + skills proficiencies
check(a.saves.length === 2 && a.saves.every((s) => ABILITIES.includes(s)), 'a class has exactly two save proficiencies');
const bgSkills = BACKGROUNDS.find((x) => x.id === 'scholar').skills;
check(bgSkills.every((s) => a.skills.includes(s)), 'background skills are granted');
check(a.skills.length >= 2, 'at least the background skills are proficient');
console.log('✓ two save proficiencies; class + background skills granted');

// 6. spell slots by caster type
check(JSON.stringify(spellSlots(CLASSES.find((c) => c.id === 'wizard'), 1)) === '[2]', 'wizard L1 → one 1st-level pair? [2]');
check(JSON.stringify(spellSlots(CLASSES.find((c) => c.id === 'wizard'), 5)) === '[4,3,2]', 'wizard L5 slots should be [4,3,2]');
check(spellSlots(CLASSES.find((c) => c.id === 'fighter'), 5).length === 0, 'fighter has no leveled slots');
check(spellSlots(CLASSES.find((c) => c.id === 'paladin'), 1).length === 0, 'paladin has no slots at L1 (half caster starts at 2)');
check(spellSlots(CLASSES.find((c) => c.id === 'paladin'), 5)[0] === 4, 'paladin L5 has 1st-level slots');
check(pactSlots(1).count === 1 && pactSlots(11).count === 3 && pactSlots(9).slotLevel === 5, 'warlock pact slots scale');
const wiz = computeCharacter({ cls: 'wizard', race: 'gnome', background: 'scholar', level: 3, method: 'array' }, makeRng('w'));
check(!!wiz.spellcasting && wiz.spellcasting.ability === 'int', 'wizard is an INT caster with a spellcasting block');
check(!computeCharacter({ cls: 'barbarian', race: 'half-orc', background: 'soldier', level: 3, method: 'array' }, makeRng('b')).spellcasting, 'barbarian has no spellcasting');
console.log('✓ spell slots: full / half / pact / none all correct');

// 7. every class builds clean at every level, both methods
let built = 0;
for (const cls of CLASSES) {
  for (const level of [1, 5, 11, 20]) {
    for (const method of ['array', 'roll']) {
      const r = computeCharacter({ cls: cls.id, race: 'human', background: 'scholar', level, method }, makeRng(`${cls.id}-${level}-${method}`));
      check(r.maxHp >= 1 && Number.isFinite(r.maxHp), `${cls.id} L${level} ${method}: bad HP ${r.maxHp}`);
      check(r.prof === profBonus(level), `${cls.id} L${level}: prof mismatch`);
      built++;
    }
  }
}
console.log(`✓ ${built} class/level/method combinations build clean`);

// 8. subclasses: every class has one, and it unlocks at the class's real level
for (const cls of CLASSES) {
  check(cls.subclasses.length >= 1, `${cls.id} has at least one subclass`);
  const sub = cls.subclasses[0];
  check(sub.features.length >= 3, `${sub.id} has a feature progression`);
  check(sub.features.every((f) => f.level >= cls.subclassLevel), `${sub.id} grants nothing before the subclass level`);
}
check(mk({ cls: 'fighter', level: 2 }).subclass === undefined, 'fighter has no archetype before level 3');
check(mk({ cls: 'fighter', level: 3 }).subclass?.id === 'champion', 'fighter gets Champion at level 3');
check(mk({ cls: 'cleric', level: 1 }).subclass?.id === 'life', 'cleric gets a Divine Domain at level 1');
check(mk({ cls: 'sorcerer', level: 1 }).subclass?.id === 'draconic', 'sorcerer gets an Origin at level 1');
check(mk({ cls: 'warlock', level: 1 }).subclass?.id === 'fiend', 'warlock gets a Patron at level 1');
check(mk({ cls: 'wizard', level: 1 }).subclass === undefined, 'wizard has no tradition at level 1');
check(mk({ cls: 'wizard', level: 2 }).subclass?.id === 'evocation', 'wizard gets a tradition at level 2');
check(mk({ cls: 'druid', level: 2 }).subclass?.id === 'land', 'druid gets a circle at level 2');
check(mk({ cls: 'fighter', level: 5, subclass: 'champion' }).featureLog.some((f) => /Champion/.test(f.source)), 'subclass features land in the feature log');
console.log('✓ subclasses: one per class, unlock at the right level, features flow into the log');

// 9. level-up Ability Score Improvements are actually applied to scores
const f20 = mk({ cls: 'fighter', level: 20 });
check(f20.asiSpent.length === 7, `fighter has 7 ASIs by level 20, got ${f20.asiSpent.length}`);
check(mk({ cls: 'rogue', level: 20 }).asiSpent.length === 6, 'rogue has 6 ASIs by level 20');
check(mk({ cls: 'wizard', level: 20 }).asiSpent.length === 5, 'wizard has 5 ASIs by level 20');
check(f20.abilities.str === 20, `fighter's primary should climb to 20 via ASIs, got ${f20.abilities.str}`);
check(mk({ cls: 'fighter', level: 1 }).asiSpent.length === 0, 'no ASIs at level 1');
console.log('✓ ability score improvements applied by level (fighter/rogue get extras)');

// 10. rolled choices appear where the rules grant them
check(mk({ cls: 'fighter', level: 1 }).choices.some((ch) => ch.label === 'Fighting Style'), 'fighter picks a fighting style');
check(mk({ cls: 'fighter', level: 1, fightingStyle: 'Archery' }).choices.find((ch) => ch.label === 'Fighting Style')?.value === 'Archery', 'an explicit fighting style is honored');
check(mk({ cls: 'sorcerer', level: 3 }).choices.some((ch) => ch.label === 'Metamagic'), 'sorcerer picks metamagic at 3');
const wl = mk({ cls: 'warlock', level: 3 });
check(wl.choices.some((ch) => ch.label === 'Pact Boon'), 'warlock picks a pact boon at 3');
check(wl.choices.some((ch) => ch.label === 'Eldritch Invocations'), 'warlock knows invocations');
check(mk({ cls: 'rogue', level: 1 }).choices.some((ch) => ch.label === 'Expertise'), 'rogue has expertise at 1');
console.log('✓ rolled choices: fighting style, metamagic, invocations, pact boon, expertise');

// 11. spell counts: cantrips known + spells known/prepared, and domain spells
check(cantripsKnown('wizard', 5) === 4 && cantripsKnown('wizard', 1) === 3, 'wizard cantrips known scale');
check(cantripsKnown('fighter', 20) === 0, 'a non-caster knows no cantrips');
check(metamagicKnown(3) === 2 && metamagicKnown(10) === 3 && metamagicKnown(17) === 4, 'metamagic counts scale');
check(invocationsKnown(1) === 0 && invocationsKnown(2) === 2 && invocationsKnown(5) === 3 && invocationsKnown(20) === 8, 'invocation counts scale');
const wiz5 = mk({ cls: 'wizard', race: 'human', level: 5 });
check(wiz5.spellcasting?.spellsLabel === 'prepared' && wiz5.spellcasting.spells === wiz5.mods.int + 5, 'wizard prepares INT + level spells');
check(mk({ cls: 'bard', level: 1 }).spellcasting?.spells === 4, 'bard L1 knows 4 spells');
check(mk({ cls: 'ranger', level: 1 }).spellcasting === undefined, 'ranger has no spellcasting at level 1');
check(mk({ cls: 'ranger', level: 2 }).spellcasting?.spells === 2, 'ranger knows 2 spells at level 2');
const life5 = mk({ cls: 'cleric', level: 5 });
check(life5.domainSpells.some((t) => t.names.includes('Revivify')), 'Life Domain grants Revivify by level 5');
check(mk({ cls: 'cleric', level: 1 }).domainSpells.flatMap((t) => t.names).includes('Cure Wounds'), 'Life Domain grants Cure Wounds at level 1');
console.log('✓ spell counts (cantrips, known/prepared) and subclass domain spells');

// 12. the feature log grows with level and stays deterministic
check(mk({ cls: 'cleric', level: 11 }).featureLog.length > mk({ cls: 'cleric', level: 1 }).featureLog.length, 'higher level → more features');
const s1 = computeCharacter({ cls: 'paladin', race: 'half-orc', background: 'soldier', subclass: 'devotion', level: 10, method: 'array' }, makeRng('pal'));
const s2 = computeCharacter({ cls: 'paladin', race: 'half-orc', background: 'soldier', subclass: 'devotion', level: 10, method: 'array' }, makeRng('pal'));
check(JSON.stringify(s1) === JSON.stringify(s2), 'a subclassed build is deterministic for a fixed seed');
console.log('✓ feature log scales with level; subclassed builds stay deterministic');

// 13. class spell lists are real SRD spells at the right level. Cross-check
// every entry against the gm/spells/level-N name tables (normalized for the
// tables' curly apostrophes / "(Ritual)" tags), so the data can't drift.
const norm = (s) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s*\(ritual\)\s*/gi, '').replace(/\s+/g, ' ').trim();
const tableFile = (i) => (i === 0 ? 'cantrips' : `level-${i}`);
const spellsByLevel = Array.from({ length: 10 }, (_, i) => {
  const t = JSON.parse(readFileSync(join(SPELL_DIR, `${tableFile(i)}.json`), 'utf8'));
  return new Set(t.entries.map((e) => norm(typeof e === 'string' ? e : e.text)));
});
let spellChecks = 0;
let spellMisses = 0;
for (const [clsId, byLevel] of Object.entries(CLASS_SPELLS)) {
  check(CLASSES.some((c) => c.id === clsId), `${clsId} spell list maps to a real class`);
  byLevel.forEach((names, lvl) => {
    for (const name of names) {
      spellChecks++;
      if (!spellsByLevel[lvl].has(norm(name))) {
        spellMisses++;
        console.error(`✗ ${clsId} spell "${name}" is not in the ${tableFile(lvl)} table`);
      }
    }
    // no duplicates within a class/level
    check(new Set(names.map(norm)).size === names.length, `${clsId} ${tableFile(lvl)}: no duplicate spells`);
  });
}
check(spellMisses === 0, `${spellMisses} class-spell entries missing from the spell tables`);
// each caster has enough spells at each castable level to fill a starting book
for (const cls of CLASSES.filter((c) => c.caster !== 'none')) {
  const list = CLASS_SPELLS[cls.id];
  if (cantripsKnown(cls.id, 20) > 0) check((list[0] ?? []).length >= 2, `${cls.id} has cantrips to choose from`);
  check((list[1] ?? []).length >= 6, `${cls.id} has a healthy 1st-level list`);
}
// the eight SRD casters all have lists; non-casters have none
for (const cls of CLASSES) {
  const has = !!CLASS_SPELLS[cls.id];
  check(cls.caster === 'none' ? !has : has, `${cls.id} (${cls.caster}) ${has ? 'has' : 'has no'} spell list`);
}
console.log(`✓ ${spellChecks} class-spell entries all resolve to real SRD spells at the right level`);

// 14. rolled HP: valid, within min/max, and deterministic for a seed
const rollHp = (seed, o) => computeCharacter({ cls: 'barbarian', race: 'human', background: 'soldier', level: 10, method: 'array', hp: 'roll', feats: 'scores', ...o }, makeRng(seed)).maxHp;
const avgHp = mk({ cls: 'barbarian', level: 10, hp: 'average' }).maxHp;
check(rollHp('x') === rollHp('x'), 'rolled HP is deterministic for a fixed seed');
// L10 barbarian (d12): min 12+9*(1+con)+con... just bound it against average generously
check(rollHp('a') >= 10 && rollHp('a') <= avgHp + 9 * 6, `rolled HP is in a sane range (got ${rollHp('a')}, avg ${avgHp})`);
let hpVaries = false;
for (const s of ['a', 'b', 'c', 'd', 'e', 'f']) if (rollHp(s) !== avgHp) hpVaries = true;
check(hpVaries, 'rolling HP actually varies from the fixed average across seeds');
check(mk({ cls: 'wizard', level: 1, hp: 'roll' }).maxHp === mk({ cls: 'wizard', level: 1, hp: 'average' }).maxHp, 'level 1 HP is max either way (no roll yet)');
console.log('✓ hit points can be rolled (deterministic, in range, varies from average)');

// 15. feats: a level-up slot can become a feat instead of an ability bump
const featBuild = mk({ cls: 'fighter', level: 8, feats: 'feat' });
check(featBuild.levelUps.some((k) => k.kind === 'feat'), 'a feat-mode build spends a slot on a feat');
check(featBuild.levelUps.filter((k) => k.kind === 'feat').length === 1, 'only one feat (the SRD has one)');
check(featBuild.asiSpent.length < featBuild.levelUps.length, 'a feat slot is not counted as an ASI');
check(mk({ cls: 'fighter', level: 8, feats: 'scores' }).levelUps.every((k) => k.kind === 'asi'), 'scores-only build never takes a feat');
console.log('✓ feats: a level-up can be spent on a feat, or kept as ability scores');

// 16. subclass menu choices (Dragon Ancestor, Circle terrain, Hunter's options)
const draconic = mk({ cls: 'sorcerer', level: 1, subclass: 'draconic' });
check(draconic.choices.some((ch) => ch.label === 'Dragon Ancestor'), 'draconic sorcerer chooses a dragon ancestor');
const hunter = mk({ cls: 'ranger', level: 11, subclass: 'hunter' });
check(hunter.choices.filter((ch) => ["Hunter's Prey", 'Defensive Tactics', 'Multiattack'].includes(ch.label)).length === 3, "hunter has made its level 3/7/11 choices by level 11");
check(!mk({ cls: 'ranger', level: 3, subclass: 'hunter' }).choices.some((ch) => ch.label === 'Multiattack'), 'a level-3 hunter has not chosen its level-11 option yet');
check(mk({ cls: 'druid', level: 2, subclass: 'land' }).choices.some((ch) => ch.label === 'Land (Circle Spells)'), 'land druid chooses a terrain');
console.log('✓ subclass menu choices roll at the right level (Dragon Ancestor, terrain, Hunter picks)');

// 17. single-pick choices carry their options (for the sheet's dropdown);
// multi-pick choices (metamagic, invocations, expertise) do not
const dragon = mk({ cls: 'sorcerer', level: 1, subclass: 'draconic' }).choices.find((ch) => ch.label === 'Dragon Ancestor');
check(dragon?.options?.length === 10, 'Dragon Ancestor offers all ten dragon options');
check(dragon.options.includes(dragon.value), 'the rolled ancestor is one of its options');
const style = mk({ cls: 'fighter', level: 1 }).choices.find((ch) => ch.label === 'Fighting Style');
check(style?.options?.includes(style.value), 'fighting style carries its options and the roll is one of them');
check(mk({ cls: 'warlock', level: 3 }).choices.find((ch) => ch.label === 'Pact Boon')?.options?.length === 3, 'pact boon offers its three options');
check(!mk({ cls: 'sorcerer', level: 3 }).choices.find((ch) => ch.label === 'Metamagic')?.options, 'multi-pick metamagic carries no single-select options');
console.log('✓ single-pick choices carry dropdown options; multi-pick ones stay a list');

if (failures) { console.error(`\n${failures} failure(s).`); process.exit(1); }
console.log('\nD&D 5e ruleset: all green.');
