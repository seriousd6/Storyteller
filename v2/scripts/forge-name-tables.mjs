// Rebuild the gm/npc/names/<race> tables FROM our own morpheme forge.
//
// These files used to hold flat name lists exported from fantasynamegenerators.
// The forge (src/engine/nameforge.ts) replaced that content model; this script
// materialises the forge into the same table files both NPC tools already read
// through gm/npc/race (Quick NPC and the gm/npc slot generator). So the names
// are now ours, coined from authored morphemes, while the table interface — ids,
// the #male/#female tags the wrapper filters on — stays exactly as it was.
//
//   node scripts/forge-name-tables.mjs          # rewrite the 29 files
//   node scripts/forge-name-tables.mjs --check   # assert they match the forge
//
// Deterministic: each pool is drawn from a fixed per-race/gender seed, so the
// committed files rebuild byte-identically (smoke-names enforces --check).

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SYSTEMS, forgeNames, forgeName } from '../src/engine/nameforge.ts';
import { makeRng } from '../src/engine/rng.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '../src/data/gm/npc/names');

// The races whose wrapper token filters by #male / #female need gender-tagged
// pools; the rest are drawn genderless (the wrapper references them with no tag).
const WRAPPER_GENDERED = new Set([
  'aasimar', 'dragonborn', 'drow', 'dwarf', 'gnome', 'goliath', 'half-elf', 'half-orc',
  'halfling', 'high-elf', 'human', 'kalashtar', 'orc', 'shifter', 'simic-hybrid', 'tiefling', 'wood-elf',
]);
const N_GENDERED = 150; // per gender
const N_UNISEX = 200;

/** True only when the forge REALLY genders this race — distinct, non-identical
 *  male and female patterns. Some wrapper-gendered races (goliath, kalashtar,
 *  simic-hybrid, tiefling) draw masculine and feminine from the SAME pool, so
 *  splitting them into #male/#female would just duplicate names across genders. */
function trulyGendered(sys) {
  const m = sys.patterns.male;
  const f = sys.patterns.female;
  return !!(m && m.length && f && f.length && JSON.stringify(m) !== JSON.stringify(f));
}

/** Forge up to n names for a gender that aren't already in `seen` (shared across
 *  the male and female passes so the two never collide). One rng stream, so it's
 *  deterministic. */
function forgeDistinct(sys, gender, n, rng, seen) {
  const out = [];
  for (let i = 0; i < n * 25 && out.length < n; i++) {
    const name = forgeName(sys, gender, rng);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

const CREDITS = [
  { source: 'Storyteller Toolbox — nameforge', url: 'https://storytellertoolbox.com/gm/names/' },
];

/** The full JSON text for one race's table, header preserved, entries forged. */
function tableFor(slug) {
  const path = join(dir, `${slug}.json`);
  const orig = JSON.parse(readFileSync(path, 'utf8'));
  const sys = SYSTEMS[slug];
  if (!sys) throw new Error(`no forge system for ${slug}`);

  let entries;
  if (WRAPPER_GENDERED.has(slug) && trulyGendered(sys)) {
    // Disjoint masculine/feminine pools — female skips any name the male pass took.
    const seen = new Set();
    const male = forgeDistinct(sys, 'male', N_GENDERED, makeRng(`nametable/${slug}/male`), seen).map((t) => ({ text: t, tags: ['male'] }));
    const female = forgeDistinct(sys, 'female', N_GENDERED, makeRng(`nametable/${slug}/female`), seen).map((t) => ({ text: t, tags: ['female'] }));
    entries = [...male, ...female];
  } else if (WRAPPER_GENDERED.has(slug)) {
    // Wrapper filters by #male/#female, but the names are unisex — one deduped
    // pool, every entry valid for either tag (so no cross-gender duplicates).
    entries = forgeNames(sys, '', N_UNISEX, makeRng(`nametable/${slug}`)).map((t) => ({ text: t, tags: ['male', 'female'] }));
  } else {
    entries = forgeNames(sys, '', N_UNISEX, makeRng(`nametable/${slug}`)).map((t) => ({ text: t }));
  }

  const out = {
    id: orig.id,
    title: orig.title,
    pillar: orig.pillar,
    tags: orig.tags ?? ['fantasy'],
    credits: CREDITS,
    entries,
  };
  return `${JSON.stringify(out, null, 2)}\n`;
}

const check = process.argv.includes('--check');
let stale = 0;
for (const slug of Object.keys(SYSTEMS)) {
  const content = tableFor(slug);
  const path = join(dir, `${slug}.json`);
  if (check) {
    if (readFileSync(path, 'utf8') !== content) {
      console.error(`  ✗ ${slug}.json is stale vs the forge — run node scripts/forge-name-tables.mjs`);
      stale++;
    }
  } else {
    writeFileSync(path, content);
  }
}

if (check) {
  if (stale) {
    console.error(`forge-name-tables: ${stale} table(s) out of sync with the forge`);
    process.exit(1);
  }
  console.log(`  ✓ all ${Object.keys(SYSTEMS).length} name tables match the forge`);
} else {
  console.log(`wrote ${Object.keys(SYSTEMS).length} forge-derived name tables`);
}
