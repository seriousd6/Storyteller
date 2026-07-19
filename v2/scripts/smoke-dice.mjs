// Dice grammar smoke (docs/sheets/PLAN.md §4/§19): the grammar is FROZEN —
// these are the pinned semantics user text depends on forever.
// Run: node scripts/smoke-dice.mjs

import { parse, roll, minOf, maxOf, meanOf, looksLikeDice } from '../src/engine/dice.ts';

let failed = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failed += 1;
};
const throws = (fn) => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

// determinism
const a = roll('2d6+3', 'seed-1');
const b = roll('2d6+3', 'seed-1');
const c = roll('2d6+3', 'seed-2');
ok(a.total === b.total && a.breakdown === b.breakdown, 'same seed → same roll');
ok(a.total !== c.total || a.breakdown !== c.breakdown, 'different seed → (almost surely) different roll');

// bounds over many seeds
let inBounds = true;
for (let i = 0; i < 300; i++) {
  const r = roll('3d6', `bounds-${i}`);
  if (r.total < 3 || r.total > 18) inBounds = false;
}
ok(inBounds, '3d6 stays in [3,18] across 300 seeds');

// keep/drop semantics
let dlOk = true;
for (let i = 0; i < 300; i++) {
  const r = roll('4d6dl1', `dl-${i}`);
  const kept = r.dice.filter((d) => d.kept);
  const dropped = r.dice.filter((d) => !d.kept);
  const sum = kept.reduce((s, d) => s + d.value, 0);
  if (kept.length !== 3 || dropped.length !== 1) dlOk = false;
  if (dropped[0].value > Math.min(...kept.map((d) => d.value))) dlOk = false;
  if (r.total !== sum) dlOk = false;
}
ok(dlOk, '4d6dl1 keeps the best three and totals only them');

let khOk = true;
for (let i = 0; i < 300; i++) {
  const r = roll('2d20kh1', `kh-${i}`);
  const kept = r.dice.filter((d) => d.kept);
  if (kept.length !== 1) khOk = false;
  if (kept[0].value !== Math.max(...r.dice.map((d) => d.value))) khOk = false;
}
ok(khOk, '2d20kh1 keeps the higher die (advantage)');

// advantage really helps: mean(2d20kh1) ≈ 13.82 vs mean(1d20) = 10.5
const adv = meanOf('2d20kh1');
ok(adv > 13 && adv < 14.6, `mean(2d20kh1) ≈ 13.8 (got ${adv.toFixed(2)})`);
ok(meanOf('2d6+3') === 10, 'mean(2d6+3) = 10 exactly');
ok(minOf('4d6dl1') === 3 && maxOf('4d6dl1') === 18, '4d6dl1 bounds are [3,18]');

// disadvantage: keep the LOWER die (kl) — the mirror of kh, and never tested
let klOk = true;
for (let i = 0; i < 300; i++) {
  const r = roll('2d20kl1', `kl-${i}`);
  const kept = r.dice.filter((d) => d.kept);
  if (kept.length !== 1) klOk = false;
  if (kept[0].value !== Math.min(...r.dice.map((d) => d.value))) klOk = false;
}
ok(klOk, '2d20kl1 keeps the lower die (disadvantage)');
const dis = meanOf('2d20kl1');
ok(dis > 6.5 && dis < 8, `mean(2d20kl1) ≈ 7.2 (got ${dis.toFixed(2)})`);

// drop-highest (dh): keeps the rest, drops the single biggest
let dhOk = true;
for (let i = 0; i < 300; i++) {
  const r = roll('4d6dh1', `dh-${i}`);
  const kept = r.dice.filter((d) => d.kept);
  const dropped = r.dice.filter((d) => !d.kept);
  if (kept.length !== 3 || dropped.length !== 1) dhOk = false;
  if (dropped[0].value < Math.max(...kept.map((d) => d.value))) dhOk = false;
}
ok(dhOk, '4d6dh1 drops the highest die');

// a subtracted dice term flips its bound (min total when the dice roll HIGH)
let negOk = true;
for (let i = 0; i < 300; i++) {
  const t = roll('10-2d6', `neg-${i}`).total;
  if (t < -2 || t > 8) negOk = false;
}
ok(negOk, '10-2d6 stays in [-2, 8] across 300 seeds');
// minOf/maxOf apply the per-die floor/ceiling UNIFORMLY, so a subtracted dice
// term SWAPS them (dice.ts bound(): "callers pair accordingly"). This pins that
// documented contract; whether the swap should instead return true min/max is a
// recorded question (docs/TEST-AUDIT.md § blockers).
ok(minOf('10-2d6') === 8 && maxOf('10-2d6') === -2, '10-2d6: a subtracted dice term swaps minOf/maxOf (per bound() contract)');

// variables
const v = roll('1d20+$str', 'var-1', { str: 5 });
ok(v.total === v.dice[0].value + 5, '$str resolves into the total');
ok(throws(() => roll('1d20+$str', 'var-2')), 'missing variable throws');
ok(throws(() => roll('1d20+$str', 'var-3', { dex: 2 })), 'wrong variable name throws');

// parsing
ok(parse('d20').terms[0].count === 1, 'bare d20 means 1d20');
ok(parse(' 2D6 + 3 ').terms.length === 2, 'whitespace and case are tolerated');
ok(parse('2d6+1d4-1').terms.length === 3, 'multi-term formulas parse');
ok(throws(() => parse('2x6')), 'garbage is rejected');
ok(throws(() => parse('1d0')), 'd0 is rejected');
ok(throws(() => parse('1d6kh2')), 'keeping more dice than rolled is rejected');
ok(throws(() => parse('2d6dl2')), 'dropping every die is rejected');
ok(throws(() => parse('999d6')), 'absurd dice counts are rejected');
ok(throws(() => parse('')), 'empty formula is rejected');

// inline-chip gate
ok(looksLikeDice('2d6+3') && looksLikeDice('1d20+$str'), 'dice formulas look like dice');
ok(!looksLikeDice('42') && !looksLikeDice('table:gm/loot/gems') && !looksLikeDice('hello'), 'non-dice do not');

if (failed) {
  console.error(`\nDice smoke: ${failed} failure(s).`);
  process.exit(1);
}
console.log('Dice smoke: all green.');
