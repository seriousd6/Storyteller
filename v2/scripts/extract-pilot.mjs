// Extracts pilot generator tables (Tavern, Loot) from the legacy v1 JS into
// schema-valid JSON under src/data/. Re-runnable: node scripts/extract-pilot.mjs
//
// Legacy composition like `The ${searchArray(person)}'s ${searchArray(thing)}`
// becomes engine template syntax: "The {table:gm/tavern/name-person}'s {table:...}".
// Entries that still contain unresolved ${...} after replacement are dropped
// with a warning (revisit in the Phase 3 bulk migration).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const V1_JS = resolve(here, '../../v1/D&D/FANTASY/js');
const OUT = resolve(here, '../src/data');

const CREDITS_COMMUNITY = [
  { source: 'r/d100', url: 'https://www.reddit.com/r/d100/' },
  { source: 'r/BehindTheTables', url: 'https://www.reddit.com/r/BehindTheTables/' },
  { source: 'r/DnDBehindTheScreen', url: 'https://www.reddit.com/r/DnDBehindTheScreen/' },
  { source: 'DnDSpeak', url: 'http://dndspeak.com/' },
];

/** Find the nth `let <name> = [` (or last, if occurrence is -1) and return the array literal text. */
function extractArrayLiteral(src, varName, occurrence = 1) {
  const re = new RegExp(`let\\s+${varName}\\s*=\\s*\\[`, 'g');
  const starts = [];
  let m;
  while ((m = re.exec(src)) !== null) starts.push(m.index + m[0].length - 1); // position of '['
  const start = occurrence === -1 ? starts[starts.length - 1] : starts[occurrence - 1];
  if (start === undefined) throw new Error(`let ${varName} (occurrence ${occurrence}) not found`);
  return src.slice(start, matchBracket(src, start) + 1);
}

/** Given index of '[', return index of its matching ']' (string/template aware). */
function matchBracket(src, start) {
  let depth = 0;
  // context stack: 'code' | "'" | '"' | '`'
  const ctx = ['code'];
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    const top = ctx[ctx.length - 1];
    if (top === 'code') {
      if (c === '[') depth += 1;
      else if (c === ']') {
        depth -= 1;
        if (depth === 0) return i;
      } else if (c === "'" || c === '"' || c === '`') ctx.push(c);
      else if (c === '}' && ctx.length > 1) ctx.pop(); // end of ${ } inside template
    } else if (top === '`') {
      if (c === '\\') i += 1;
      else if (c === '`') ctx.pop();
      else if (c === '$' && src[i + 1] === '{') {
        ctx.push('code');
        i += 1;
      }
    } else {
      // ' or "
      if (c === '\\') i += 1;
      else if (c === top) ctx.pop();
    }
  }
  throw new Error('Unbalanced brackets');
}

let dropped = 0;

function evalEntries(literal, replace = {}, label = '?') {
  let text = literal;
  for (const [from, to] of Object.entries(replace)) {
    text = text.split(from).join(to);
  }
  // Stubs so stray inline expressions (dice math, nested inline arrays) resolve
  // to static values instead of crashing; usage is reported for Phase 3 review.
  let stubCalls = 0;
  const rollDice = (n) => { stubCalls += 1; return Math.floor(n / 2); };
  const searchArray = (a) => { stubCalls += 1; return Array.isArray(a) ? a[0] : String(a); };
  const toWords = (n) => { stubCalls += 1; return String(n); };
  const arr = new Function('rollDice', 'searchArray', 'toWords', `return (${text})`)(rollDice, searchArray, toWords);
  if (stubCalls > 0) console.warn(`  ! ${label}: ${stubCalls} inline expression(s) resolved statically`);
  if (!Array.isArray(arr)) throw new Error(`${label}: not an array`);
  const clean = [];
  for (const e of arr) {
    if (typeof e !== 'string') {
      dropped += 1;
      console.warn(`  ! ${label}: dropped non-string entry (${String(e).slice(0, 40)})`);
      continue;
    }
    const t = e.replace(/\s+/g, ' ').trim();
    if (!t) continue;
    if (t.includes('${')) {
      dropped += 1;
      console.warn(`  ! ${label}: dropped unresolved entry: ${t.slice(0, 60)}...`);
      continue;
    }
    clean.push(t);
  }
  return clean;
}

function writeTable({ id, title, description, tags = ['fantasy'], credits = CREDITS_COMMUNITY, entries }) {
  if (!entries.length) throw new Error(`${id}: no entries`);
  const path = join(OUT, ...`${id}.json`.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  const table = { id, title, pillar: id.split('/')[0], tags, credits, entries };
  if (description) table.description = description;
  writeFileSync(path, JSON.stringify(table, null, 2) + '\n');
  console.log(`  ✓ ${id} (${entries.length} entries)`);
}

const tavernSrc = readFileSync(join(V1_JS, 'tavern.js'), 'utf8');
const lootSrc = readFileSync(join(V1_JS, 'loot.js'), 'utf8');

// ---------------------------------------------------------------------------
console.log('Tavern name parts:');
const T = 'gm/tavern';
const namePartRefs = {};
for (const [varName, slug] of [
  ['posts', 'name-post'],
  ['adjective', 'name-adjective'],
  ['verb', 'name-verb'],
  ['verbing', 'name-verbing'],
  ['person', 'name-person'],
  ['place', 'name-place'],
  ['thing', 'name-thing'],
  ['monster', 'name-monster'],
]) {
  const id = `${T}/${slug}`;
  namePartRefs[`\${searchArray(${varName})}`] = `{table:${id}}`;
  writeTable({
    id,
    title: `Tavern Name — ${slug.replace('name-', '')}`,
    entries: evalEntries(extractArrayLiteral(tavernSrc, varName, 1), {}, id),
  });
}
writeTable({
  id: `${T}/name-template`,
  title: 'Tavern Name Patterns',
  entries: evalEntries(extractArrayLiteral(tavernSrc, 'template', 1), {
    ...namePartRefs,
    '${toWords(3+rollDice(97))}': '{count:3-99} ',
    '${toWords(3+rollDice(7))}': '{count:3-9} ',
  }, 'name-template'),
});
writeTable({
  id: `${T}/name`,
  title: 'Tavern Name',
  description: 'A constructed tavern name, occasionally suffixed with an establishment type.',
  entries: [
    { text: `{table:${T}/name-template} {table:${T}/name-post}`, weight: 33 },
    { text: `{table:${T}/name-template}`, weight: 67 },
  ],
});

// ---------------------------------------------------------------------------
console.log('Tavern flavor, insults, rumors, conversation:');
writeTable({
  id: `${T}/rumor-topic`,
  title: 'Rumor Topic',
  entries: evalEntries(extractArrayLiteral(tavernSrc, 'mid2', 1), {}, `${T}/rumor-topic`),
});
const rumorRefs = { '${searchArray(mid2)}': `{table:${T}/rumor-topic}` };
const simpleTavern = [
  ['tavernFlavor1', 1, 'first-impression', 'Tavern First Impression'],
  ['tavernFlavor2', 1, 'second-glance', 'Tavern Second Glance'],
  ['primeLine', 1, 'insult-opener', 'Insult Opener'],
  ['adjective', 2, 'insult-adjective', 'Insult Adjective'],
  ['finishThem', 1, 'insult-finisher', 'Insult Finisher'],
  ['lawfulInsult', 1, 'insult-lawful', 'Lawful Insults'],
  ['completeRumors', 1, 'rumor-complete', 'Complete Rumors'],
  ['subject', 1, 'rumor-subject', 'Rumor Subject'],
  ['root', 1, 'rumor-root', 'Rumor Root'],
  ['action', 1, 'rumor-action', 'Rumor Action'],
  ['discovery', 1, 'rumor-discovery', 'Rumor Discovery'],
  ['result', 1, 'rumor-result', 'Rumor Result'],
  ['source', 1, 'rumor-source', 'Rumor Source'],
  ['tavernOverHear', 1, 'overheard', 'Overheard in the Tavern'],
  ['drunkBoast', 1, 'drunk-boast', 'Drunken Boasts'],
  ['braggart', 1, 'braggart', 'Braggarts'],
  ['toasts', 1, 'toasts', 'Toasts'],
  ['tavernBards', 1, 'bards', 'Bards'],
  ['bardInstrument', 1, 'instruments', 'Bard Instruments'],
  ['drinkSpecialty', 1, 'drink-alcohol', 'Specialty Drinks (Alcohol)'],
  ['teaSpecialty', 1, 'drink-tea', 'Specialty Teas'],
  ['foodEvent', 1, 'food-special', 'Food Specials'],
  ['bakedGoods', 1, 'food-baked', 'Baked Goods'],
  ['specialIngredient', 1, 'food-ingredient', 'Special Ingredients'],
  ['badTavernEvent', 1, 'event-bad', 'Bad Tavern Events'],
  ['tavernQuest', 1, 'event-hook', 'Tavern Quest Hooks'],
  ['goodTavernEvent', 1, 'event-good', 'Good Tavern Events'],
  ['questBoard', 1, 'notice-board', 'Notice Board Postings'],
  ['promo', 1, 'promo-flyers', 'Promotional Flyers'],
];
for (const [varName, occ, slug, title] of simpleTavern) {
  writeTable({
    id: `${T}/${slug}`,
    title,
    entries: evalEntries(extractArrayLiteral(tavernSrc, varName, occ), rumorRefs, `${T}/${slug}`),
  });
}

writeTable({
  id: `${T}/insult`,
  title: 'Tavern Insult',
  entries: [
    { text: `{table:${T}/insult-opener}, you {table:${T}/insult-adjective} {table:${T}/insult-finisher}.`, weight: 1 },
    { text: `{table:${T}/insult-lawful}`, weight: 1 },
  ],
});
writeTable({
  id: `${T}/rumor`,
  title: 'Tavern Rumor',
  entries: [
    { text: `Did you hear that {table:${T}/rumor-subject} {table:${T}/rumor-root}? I could be wrong — I heard it from {table:${T}/rumor-source}.`, weight: 1 },
    { text: `Did you hear that {table:${T}/rumor-subject} {table:${T}/rumor-action} and discovered {table:${T}/rumor-discovery}, and now {table:${T}/rumor-result}? I could be wrong — I heard it from {table:${T}/rumor-source}.`, weight: 1 },
    { text: `{table:${T}/rumor-complete}`, weight: 2 },
  ],
});
writeTable({
  id: `${T}/conversation`,
  title: 'Overheard Conversation',
  entries: [
    { text: `You overhear a rumor: “{table:${T}/rumor}”`, weight: 3 },
    { text: `{table:${T}/overheard}`, weight: 3 },
    { text: `{table:${T}/drunk-boast}`, weight: 1 },
    { text: `{table:${T}/braggart}`, weight: 1 },
    { text: `Someone raises a toast: “{table:${T}/toasts}”`, weight: 1 },
  ],
});
writeTable({
  id: `${T}/drink`,
  title: 'Drink Specialty',
  entries: [
    { text: `Non-alcoholic specialty: {table:${T}/drink-tea}`, weight: 40 },
    { text: `Specialty alcohol: {table:${T}/drink-alcohol}`, weight: 50 },
    { text: '“This here’s a milk-only tavern, including all milk derivatives.”', weight: 10 },
  ],
});
writeTable({
  id: `${T}/food`,
  title: 'Food Specialty',
  entries: [
    { text: `The special for the day: {table:${T}/food-special}`, weight: 33 },
    { text: `Today’s specials: {table:${T}/food-baked} They also have {table:${T}/food-ingredient}`, weight: 57 },
    { text: '“We just have the regular ol’ fare today.”', weight: 10 },
  ],
});
writeTable({
  id: `${T}/event`,
  title: 'Tavern Event',
  entries: [
    { text: `While you are there... {table:${T}/event-bad}`, weight: 15 },
    { text: `While you are there... {table:${T}/event-hook}`, weight: 15 },
    { text: `While you are there... {table:${T}/event-good}`, weight: 15 },
    { text: 'Nothing of note is going on.', weight: 55 },
  ],
});

// ---------------------------------------------------------------------------
console.log('Spell lists & DMG magic item tables (from tavern.js rival-party gear):');
const spellRefs = {};
const spellLevels = [
  ['cantrip', 'cantrips', 'Cantrips'],
  ['first', 'level-1', '1st-Level Spells'],
  ['second', 'level-2', '2nd-Level Spells'],
  ['third', 'level-3', '3rd-Level Spells'],
  ['fourth', 'level-4', '4th-Level Spells'],
  ['fifth', 'level-5', '5th-Level Spells'],
  ['sixth', 'level-6', '6th-Level Spells'],
  ['seventh', 'level-7', '7th-Level Spells'],
  ['eighth', 'level-8', '8th-Level Spells'],
  ['ninth', 'level-9', '9th-Level Spells'],
];
for (const [varName, slug, title] of spellLevels) {
  const id = `gm/spells/${slug}`;
  spellRefs[`\${searchArray(${varName})}`] = `{table:${id}}`;
  writeTable({ id, title, entries: evalEntries(extractArrayLiteral(tavernSrc, varName, 1), {}, id) });
}

writeTable({
  id: 'gm/loot/figurine-forms',
  title: 'Figurine of Wondrous Power — Forms',
  entries: ['(bronze griffon)', '(ebony fly)', '(golden lions)', '(ivory goats)', '(marble elephant)', '(onyx dog)', '(serpentine owl)'],
});
const figurineInline = `\${searchArray(["(bronze griffon)", "(ebony fly)", "(golden lions)", "(ivory goats)", "(marble elephant)", "(onyx dog)", "(serpentine owl)"])}`;

for (const letter of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']) {
  writeTable({
    id: `gm/loot/magic-items-${letter.toLowerCase()}`,
    title: `Magic Item Table ${letter}`,
    entries: evalEntries(extractArrayLiteral(tavernSrc, `magicItems${letter}`, 1), {
      ...spellRefs,
      [figurineInline]: '{table:gm/loot/figurine-forms}',
    }, `magic-items-${letter}`),
  });
}
writeTable({
  id: 'gm/loot/magic-item-minor',
  title: 'Minor Magic Item',
  entries: [
    { text: '{table:gm/loot/magic-items-a}', weight: 40 },
    { text: '{table:gm/loot/magic-items-b}', weight: 35 },
    { text: '{table:gm/loot/magic-items-c}', weight: 25 },
  ],
});
writeTable({
  id: 'gm/loot/magic-item-major',
  title: 'Major Magic Item',
  entries: [
    { text: '{table:gm/loot/magic-items-f}', weight: 40 },
    { text: '{table:gm/loot/magic-items-g}', weight: 30 },
    { text: '{table:gm/loot/magic-items-h}', weight: 20 },
    { text: '{table:gm/loot/magic-items-i}', weight: 10 },
  ],
});

// ---------------------------------------------------------------------------
console.log('Loot — weapons, armor, gems:');

// Weighted weapon types transcribed from the legacy rollDice(1000) if-chain.
writeTable({
  id: 'gm/loot/weapon-type',
  title: 'Weapon Type',
  entries: [
    { text: 'Dagger', weight: 55 }, { text: 'Quarterstaff', weight: 55 }, { text: 'Crossbow', weight: 55 },
    { text: 'Longbow', weight: 55 }, { text: 'Shortbow', weight: 55 }, { text: 'Staff', weight: 60 },
    { text: 'Longsword', weight: 30 }, { text: 'Rapier', weight: 30 }, { text: 'Scimitar', weight: 30 },
    { text: 'Shortsword', weight: 30 }, { text: 'Club', weight: 30 }, { text: 'Fist Weapon', weight: 30 },
    { text: 'Handaxe', weight: 30 }, { text: 'Javelin', weight: 30 }, { text: 'Mace', weight: 30 },
    { text: 'Sickle', weight: 30 }, { text: 'Greatclub', weight: 40 }, { text: 'Spear', weight: 40 },
    { text: 'Battleaxe', weight: 40 }, { text: 'Flail', weight: 40 }, { text: 'Glaive', weight: 40 },
    { text: 'Greatsword', weight: 40 }, { text: 'Halberd', weight: 30 }, { text: 'Lance', weight: 25 },
    { text: 'Trident', weight: 30 }, { text: 'Warhammer', weight: 40 },
  ],
});

const weaponRefs = {
  '${weaponType()}': '{table:gm/loot/weapon-type}',
  '${searchArray(damageTypes)}': '{table:gm/loot/damage-type}',
  '${searchArray(animalArray)}': '{table:gm/loot/animal-form}',
  '${searchArray(abilityTypes)}': '{table:gm/loot/ability-score}',
};
writeTable({ id: 'gm/loot/damage-type', title: 'Damage Types', entries: evalEntries(extractArrayLiteral(lootSrc, 'damageTypes', 1), {}, 'damage-type') });
writeTable({ id: 'gm/loot/animal-form', title: 'Animal Forms', entries: evalEntries(extractArrayLiteral(lootSrc, 'animalArray', 1), {}, 'animal-form') });
writeTable({ id: 'gm/loot/ability-score', title: 'Ability Scores', entries: evalEntries(extractArrayLiteral(lootSrc, 'abilityTypes', 1), {}, 'ability-score') });
writeTable({ id: 'gm/loot/weapon-quirk', title: 'Weapon Special Effects', entries: evalEntries(extractArrayLiteral(lootSrc, 'optionalProps', 1), weaponRefs, 'weapon-quirk') });
writeTable({ id: 'gm/loot/weapon-enchantment', title: 'Weapon Enchantments', entries: evalEntries(extractArrayLiteral(lootSrc, 'enchantmentArray', 1), weaponRefs, 'weapon-enchantment') });
writeTable({ id: 'gm/loot/weapon-history', title: 'Weapon Histories', entries: evalEntries(extractArrayLiteral(lootSrc, 'weaponHistories', 1), {}, 'weapon-history') });

let hasRunes = true;
try {
  writeTable({ id: 'gm/loot/weapon-rune', title: 'Weapon Runes', entries: evalEntries(extractArrayLiteral(lootSrc, 'runes', 1), weaponRefs, 'weapon-rune') });
} catch (e) {
  hasRunes = false;
  console.warn(`  ! weapon runes skipped: ${e.message}`);
}
writeTable({
  id: 'gm/loot/enchanted-weapon',
  title: 'Enchanted Weapon',
  entries: [
    { text: '{table:gm/loot/weapon-enchantment}', weight: 50 },
    { text: '{table:gm/loot/weapon-enchantment} Special effect: {table:gm/loot/weapon-quirk}', weight: 25 },
    ...(hasRunes
      ? [{ text: '{table:gm/loot/weapon-enchantment} It is covered in a runic inscription: {table:gm/loot/weapon-rune}', weight: 25 }]
      : []),
  ],
});

// Armor: materials are a nested pair of arrays; split them into two tables.
{
  const literal = extractArrayLiteral(lootSrc, 'material', 2);
  // eslint-disable-next-line no-eval
  const material = (0, eval)(`(${literal})`);
  writeTable({ id: 'gm/loot/armor-material-metal', title: 'Armor Materials (Metal)', entries: material[0].map((s) => s.trim()) });
  writeTable({ id: 'gm/loot/armor-material-hide', title: 'Armor Materials (Hide)', entries: material[1].map((s) => s.trim()) });
}
const armorRefs = {
  '${searchArray(material[0])}': '{table:gm/loot/armor-material-metal}',
  '${searchArray(material[1])}': '{table:gm/loot/armor-material-hide}',
  '${searchArray(armorTypes)}': '{table:gm/loot/armor-type}',
};
writeTable({ id: 'gm/loot/armor-type', title: 'Armor Types', entries: evalEntries(extractArrayLiteral(lootSrc, 'armorTypes', 1), armorRefs, 'armor-type') });
writeTable({ id: 'gm/loot/armor-enchantment', title: 'Armor Enchantments', entries: evalEntries(extractArrayLiteral(lootSrc, 'enchantmentArray', 2), armorRefs, 'armor-enchantment') });

// Gems: six tiers nested in one array.
{
  const literal = extractArrayLiteral(lootSrc, 'gems', -1);
  // eslint-disable-next-line no-eval
  const gems = (0, eval)(`(${literal})`);
  gems.forEach((tier, i) => {
    writeTable({ id: `gm/loot/gems-tier${i + 1}`, title: `Gemstones — Tier ${i + 1}`, entries: tier.map((s) => s.trim()) });
  });
  writeTable({
    id: 'gm/loot/gems',
    title: 'Gemstone',
    entries: [
      { text: '{table:gm/loot/gems-tier1}', weight: 30 },
      { text: '{table:gm/loot/gems-tier2}', weight: 25 },
      { text: '{table:gm/loot/gems-tier3}', weight: 18 },
      { text: '{table:gm/loot/gems-tier4}', weight: 12 },
      { text: '{table:gm/loot/gems-tier5}', weight: 9 },
      { text: '{table:gm/loot/gems-tier6}', weight: 6 },
    ],
  });
}

console.log(`\nDone. Dropped entries: ${dropped}`);
