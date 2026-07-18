// The SRD spell reference (engine/spells.ts) behind the [[spell:]] hover cards
// must be well-formed and — critically — sit at the right level: a Fireball that
// claims to be 4th level would mislead at the table. Every authored spell's
// level is cross-checked against the gm/spells/level-N name tables (normalized).
// Run: node scripts/smoke-spells.mjs (part of npm run smoke).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SPELLS, lookupSpell, normSpell } from '../src/engine/spells.ts';

let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.error(`✗ ${msg}`); } };

const SPELL_DIR = join(dirname(fileURLToPath(import.meta.url)), '../src/data/gm/spells');
const tableFile = (i) => (i === 0 ? 'cantrips' : `level-${i}`);
const spellsByLevel = Array.from({ length: 10 }, (_, i) => {
  const t = JSON.parse(readFileSync(join(SPELL_DIR, `${tableFile(i)}.json`), 'utf8'));
  return new Set(t.entries.map((e) => normSpell(typeof e === 'string' ? e : e.text)));
});

// 1. dataset shape: valid level/school and every field present, no duplicates
const SCHOOLS = new Set(['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation']);
const seen = new Set();
for (const s of SPELLS) {
  check(typeof s.name === 'string' && s.name.length > 0, 'a spell has a name');
  check(Number.isInteger(s.level) && s.level >= 0 && s.level <= 9, `${s.name}: level in 0..9`);
  check(SCHOOLS.has(s.school), `${s.name}: valid school (got "${s.school}")`);
  for (const f of ['castingTime', 'range', 'components', 'duration', 'desc']) {
    check(typeof s[f] === 'string' && s[f].length > 0, `${s.name}: has ${f}`);
  }
  const key = normSpell(s.name);
  check(!seen.has(key), `${s.name}: no duplicate entry`);
  seen.add(key);
}
console.log(`✓ ${SPELLS.length} spells: level/school/fields well-formed, no duplicates`);

// 2. authored levels match the spell tables — a Fireball IS a 3rd-level spell
let wrong = 0;
for (const s of SPELLS) {
  if (!spellsByLevel[s.level].has(normSpell(s.name))) {
    wrong++;
    console.error(`✗ ${s.name} authored at level ${s.level} but not in the ${tableFile(s.level)} table`);
  }
}
check(wrong === 0, `${wrong} authored spell(s) at a wrong level`);
console.log('✓ every authored spell sits at its real SRD level (cross-checked vs the spell tables)');

// 3. lookup: authored → full card; a real class spell → level-only; unknown → null
const fb = lookupSpell('fireball');
check(fb?.full?.name === 'Fireball' && fb.level === 3, 'lookup finds Fireball (authored, level 3)');
check(lookupSpell('FIREBALL')?.full?.school === 'Evocation', 'lookup is case-insensitive');
const classOnly = lookupSpell("Tasha's Hideous Laughter"); // a real class spell we haven't written up
check(classOnly && classOnly.full === null && classOnly.level === 1, 'an un-authored class spell resolves to a level-only card');
check(lookupSpell('Definitely Not A Real Spell') === null, 'an unknown name resolves to null (no card)');
console.log('✓ lookupSpell: authored → full card, class spell → level-only, unknown → null');

// 4. spread: the reference reaches across the whole level range
const levels = new Set(SPELLS.map((s) => s.level));
check(levels.has(0) && levels.has(9), 'the reference spans cantrips through 9th level');
check(SPELLS.length >= 40, `a useful starter set (${SPELLS.length} spells)`);
console.log('✓ the reference spans cantrips → 9th level');

if (failures) { console.error(`\n${failures} failure(s).`); process.exit(1); }
console.log('\nSpell reference: all green.');
