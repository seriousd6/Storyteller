// Nameforge smoke: every race system forges clean, gendered, deterministic
// names. Guards the hand-authored morpheme pools — a pattern that references a
// missing pool key would leave a raw "{token}" in the output, and a system with
// no patterns for a gender would forge blanks. Part of `npm run smoke`.

import { SYSTEMS, RACE_ORDER, forgeName, forgeNames, casing } from '../src/engine/nameforge.ts';
import { makeRng } from '../src/engine/rng.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

// 0. RACE_ORDER and SYSTEMS agree.
for (const slug of RACE_ORDER) {
  if (!SYSTEMS[slug]) fail(`RACE_ORDER lists "${slug}" but SYSTEMS has no such system`);
}

const TOKEN = /\{[a-z]+\}/i;

for (const [slug, sys] of Object.entries(SYSTEMS)) {
  if (!sys.label || !sys.theme) fail(`${slug}: missing label/theme`);

  // 1. Every {token} in every pattern resolves to a non-empty pool.
  const allPatterns = [...(sys.patterns.male ?? []), ...(sys.patterns.female ?? []), ...(sys.patterns.any ?? [])];
  if (!allPatterns.length) fail(`${slug}: no patterns at all`);
  for (const p of allPatterns) {
    for (const m of p.matchAll(/\{(\w+)\}/g)) {
      const pool = sys.pools[m[1]];
      if (!pool || !pool.length) fail(`${slug}: pattern "${p}" references empty/missing pool {${m[1]}}`);
    }
  }

  // 2. Forge a stack for each gender request — non-empty and no leftover tokens.
  for (const g of ['', 'male', 'female']) {
    for (let i = 0; i < 40; i++) {
      const name = forgeName(sys, g, makeRng(`${slug}/${g}/${i}`));
      if (!name) { fail(`${slug} (${g || 'any'}): forged an empty name at ${i}`); break; }
      if (TOKEN.test(name)) { fail(`${slug} (${g || 'any'}): unresolved token in "${name}"`); break; }
      if (name !== name.trim() || /\s{2,}/.test(name)) { fail(`${slug}: ragged whitespace in "${name}"`); break; }
    }
  }

  // 3. Distinctness — a batch of 5 has no repeats when the pool space allows.
  const batch = forgeNames(sys, '', 5, makeRng(`${slug}/batch`));
  if (new Set(batch).size !== batch.length) fail(`${slug}: forgeNames returned duplicates: ${batch.join(', ')}`);

  // 4. Determinism — same seed, same forge.
  const a = forgeNames(sys, 'male', 5, makeRng(`${slug}/det`));
  const b = forgeNames(sys, 'male', 5, makeRng(`${slug}/det`));
  if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${slug}: non-deterministic forge`);
}

// 5. casing keeps connector words low but capitalises the lead + real words.
if (casing('whisper of the morning sky') !== 'Whisper of the Morning Sky') fail('casing mishandles connectors');
if (casing('elandriel') !== 'Elandriel') fail('casing mishandles a mononym');
if (casing("med'ashar clan norixius") !== "Med'ashar Clan Norixius") fail('casing mishandles apostrophes');

if (failures) {
  console.error(`\nnameforge smoke: ${failures} failure(s)`);
  process.exit(1);
}
ok(`nameforge: ${Object.keys(SYSTEMS).length} race systems forge clean, gendered, deterministic names`);
