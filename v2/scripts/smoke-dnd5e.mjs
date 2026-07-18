// The D&D 5e ruleset engine (engine/dnd5e.ts) must be correct and
// deterministic: proficiency bonus by level, racial ability increases, spell
// slots per caster type, and a clean build for every class at every level.
// A wrong number here ships a wrong character sheet. Run: node scripts/smoke-dnd5e.mjs
// (part of npm run smoke).

import { makeRng } from '../src/engine/rng.ts';
import {
  CLASSES, RACES, BACKGROUNDS, ABILITIES, profBonus, spellSlots, pactSlots, computeCharacter,
} from '../src/engine/dnd5e.ts';

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

if (failures) { console.error(`\n${failures} failure(s).`); process.exit(1); }
console.log('\nD&D 5e ruleset: all green.');
