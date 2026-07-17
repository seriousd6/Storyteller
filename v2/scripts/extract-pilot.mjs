// Extracts pilot generator tables (Tavern, Loot) from the legacy v1 JS into
// schema-valid JSON under src/data/. Re-runnable: node scripts/extract-pilot.mjs
//
// Legacy composition like `The ${searchArray(person)}'s ${searchArray(thing)}`
// becomes engine template syntax: "The {table:gm/tavern/name-person}'s {table:...}".
// Entries that still contain unresolved ${...} after replacement are dropped
// with a warning (revisit in the Phase 3 bulk migration).
//
// The whole pipeline lives in lib.mjs, shared with extract-phase3.mjs. This
// file used to carry a ~200-line private copy whose evalEntries LACKED
// rewriteDice, so inline legacy dice froze to a static midpoint — that is how
// "…has eaten 430 bodies." (a frozen ${30+rollDice(800)}) shipped into
// weapon-enchantment.json (§10.11 review). One pipeline now.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  V1_JS, stats, extractArrayLiteral, evalEntries, applyTags, writeTable,
} from './lib.mjs';

const tavernSrc = readFileSync(join(V1_JS, 'tavern.js'), 'utf8');
const lootSrc = readFileSync(join(V1_JS, 'loot.js'), 'utf8');

// ---------------------------------------------------------------------------
console.log('Tavern name parts:');
const T = 'gm/tavern';

// Category tags enable contrast templates ("The Angel and the Devil").
// Names must match extracted entry text exactly (legacy typos included).
const MONSTER_TAGS = {
  good: ['Angel', 'Unicorn', 'Couatl', 'Pegasus', 'Sprite', 'Pixie', 'Faerie Dragon', 'Empyrean', 'Blink Dog', 'Treant', 'Giant Eagle', 'Dryad'],
  evil: ['Demon', 'Devil', 'Lich', 'Vampire', 'Banshee', 'Hag', 'Death Knight', 'Demilich', 'Specter', 'Succubus', 'Incubus', 'Nightmare', 'Rakshasa', 'Beholder', 'Mind Flayer', 'Zombie', 'Skeleton', 'Ghost', 'Dracolich', 'Hell Hound', 'Scarecrow', 'Revenant'],
  big: ['Giant', 'Dragon', 'Terrasque', 'Roc', 'Kraken', 'Purple Worm', 'Hydra', 'Mammoth', 'Elephant', 'Behir', 'Bulette', 'Dragon Turtle', 'Giant Ape', 'Ettin', 'Cyclops', 'Fomorian', 'Oni', 'Ogre', 'Troll', 'Giant Shark', 'Giant Crocodile', 'Rhinoceros', 'Polar Bear', 'Owlbear', 'Umber Hulk', 'Treant', 'Empyrean', 'Killer Whale', 'Giant Elk'],
  small: ['Rat', 'Cat', 'Bat', 'Frog', 'Crab', 'Spider', 'Scorpion', 'Lizard', 'Owl', 'Raven', 'Weasel', 'Badger', 'Sea Horse', 'Quipper', 'Pixie', 'Sprite', 'Kobold', 'Goblin', 'Crawling Claw', 'Homunculus', 'Stirge', 'Hawk', 'Jackal', 'Psuedodragon', 'Flumph'],
};
const PERSON_TAGS = {
  noble: ['King', 'Emperor', 'Duke', 'Count', 'Dutchess', 'Prince', 'Princess', 'Lord', 'Lady', 'Noble', 'Knight', 'Paladin', 'Ambassador', 'Diplomat', 'Emissary', 'Steward'],
  lowly: ['Beggar', 'Drunk', 'Fool', 'Wench', 'Commoner', 'Villager', 'Vagabond', 'Exile', 'Harlot', 'Refugee', 'Shepherd', 'Farmer', 'Miller', 'Gardener'],
  holy: ['Priest', 'Preist', 'Cleric', 'Acolyte', 'Abbot', 'Paladin', 'Pilgrim', 'Apostle', 'Oracle', 'Prophet', 'Monk', 'Healer'],
  shady: ['Thief', 'Assassin', 'Smuggler', 'Spy', 'Bandit', 'Thug', 'Cultist', 'Fanatic', 'Necromancer', 'Gambler', 'Pirate', 'Bounty Hunter'],
};

const namePartRefs = {};
for (const [varName, slug, tagMap] of [
  ['posts', 'name-post'],
  ['adjective', 'name-adjective'],
  ['verb', 'name-verb'],
  ['verbing', 'name-verbing'],
  ['person', 'name-person', PERSON_TAGS],
  ['place', 'name-place'],
  ['thing', 'name-thing'],
  ['monster', 'name-monster', MONSTER_TAGS],
]) {
  const id = `${T}/${slug}`;
  namePartRefs[`\${searchArray(${varName})}`] = `{table:${id}}`;
  let entries = evalEntries(extractArrayLiteral(tavernSrc, varName, 1), {}, id);
  if (tagMap) entries = applyTags(entries, tagMap);
  writeTable({
    id,
    title: `Tavern Name — ${slug.replace('name-', '')}`,
    entries,
  });
}
writeTable({
  id: `${T}/name-template`,
  title: 'Tavern Name Patterns',
  entries: [
    ...evalEntries(extractArrayLiteral(tavernSrc, 'template', 1), {
      ...namePartRefs,
      '${toWords(3+rollDice(97))}': '{count:3-99} ',
      '${toWords(3+rollDice(7))}': '{count:3-9} ',
    }, 'name-template'),
    // Contrast patterns: opposing categories make names that feel intentional.
    `The {table:${T}/name-monster#good} and the {table:${T}/name-monster#evil}`,
    `The {table:${T}/name-monster#big} and the {table:${T}/name-monster#small}`,
    `The {table:${T}/name-monster#small} and the {table:${T}/name-monster#big}`,
    `The {table:${T}/name-person#noble} and the {table:${T}/name-person#lowly}`,
    `The {table:${T}/name-person#holy} and the {table:${T}/name-person#shady}`,
    // Shared-adjective consistency: "The Drunken Duke and the Drunken Dragon".
    `The {var:adj=table:${T}/name-adjective} {table:${T}/name-person} and the {var:adj} {table:${T}/name-monster}`,
  ],
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
// Expansions for thin tables — written to match each table's grammar frame.
const EXPANSIONS = {
  'rumor-action': [
    'won a bet with a stranger',
    'inherited a locked chest',
    'followed a stray dog',
    'dug up the old orchard',
    'answered a knock at midnight',
    'bought a map from a peddler',
    'fell asleep in the shrine',
    'traded away their shadow',
    'fished something strange out of the river',
    'took a shortcut through the barrows',
  ],
  'rumor-discovery': [
    'a tunnel that was not there yesterday',
    'a coin that always returns',
    'a name that must not be spoken',
    'a staircase under the mill',
    'a mirror that shows somewhere else',
    'a song that opens locks',
    'an egg the size of a barrel',
    'a grave with their own name on it',
    'a light beneath the lake',
    'a second moon, visible only at dawn',
  ],
  'rumor-result': [
    'the wells are running dry!',
    'the animals refuse to cross the bridge!',
    'the church bells ring on their own!',
    'nobody remembers last Tuesday!',
    'the crops came in a season early!',
    "the graveyard gates won't stay shut!",
    'all the milk in town has soured!',
    'the children are all drawing the same picture!',
    'the birds have gone silent!',
    'strangers keep arriving asking the same question!',
  ],
  'event-hook': [
    'A courier bursts in, hands the nearest patron a sealed letter, and drops dead. The letter is addressed to no one.',
    'The barkeep quietly pays a patron to follow whoever sits at the corner table tonight.',
    "A hooded figure is buying rounds for anyone who will listen to a story about a door in the hills that wasn't there before.",
    'Every candle in the room gutters at once. One patron does not seem surprised.',
    'A wanted poster on the wall shows a face identical to one of the party — posted this morning.',
    'Two merchants at the next table are bidding, in increasingly absurd sums, on a plain iron key.',
    'The tavern cat drops a severed finger — still wearing a signet ring — at your feet.',
    "A tearful apprentice is trying to sell her master's spellbook before 'they' find her.",
  ],
};
// per-table source cleanups, applied in the pipeline so a re-extraction stays
// authoritative (hand-editing the JSON would be silently reverted by a re-run)
const SOURCE_FIXES = {
  toasts: {
    '[insert enemy race here]': '{pick:goblins|orcs|kobolds|giants|gnolls|lawyers}',
    'May at least one of live through this': 'May at least one of us live through this',
  },
};
for (const [varName, occ, slug, title] of simpleTavern) {
  writeTable({
    id: `${T}/${slug}`,
    title,
    entries: [...evalEntries(extractArrayLiteral(tavernSrc, varName, occ), { ...rumorRefs, ...(SOURCE_FIXES[slug] ?? {}) }, `${T}/${slug}`), ...(EXPANSIONS[slug] ?? [])],
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
    { text: `Did you hear that {var:who=table:${T}/rumor-subject} {table:${T}/rumor-root}? Go ask {var:who} yourself — but you didn't hear it from me.`, weight: 1 },
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
    { text: `Non-alcoholic specialty: {table:${T}/drink-tea}`, weight: 30 },
    { text: `Specialty alcohol: {table:${T}/drink-alcohol}`, weight: 40 },
    {
      text: `House special: "{table:${T}/drink-name}" — a {pick:dark|pale|golden|crimson|cloudy|glittering|jet-black} {table:${T}/drink-base} served {table:${T}/drink-serving}. {pick:Locals swear|Regulars claim|The barkeep insists|No one can prove} it {table:${T}/drink-effect}.`,
      weight: 25,
    },
    { text: '“This here’s a milk-only tavern, including all milk derivatives.”', weight: 5 },
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
    { text: `{table:${T}/game}`, weight: 15 },
    { text: 'Nothing of note is going on.', weight: 40 },
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
  // a COMPOUND die none of rewriteDice's patterns match — left alone it froze
  // to its midpoint and shipped "…has eaten 430 bodies." (§10.11); the real
  // range of (1+d6)*100 + 3*d20 is 100–557
  '${(1+rollDice(6)) * 100 + (3* rollDice(20))}': '{num:100-557}',
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
    { text: '{table:gm/loot/weapon-enchantment}', weight: 40 },
    { text: '{table:gm/loot/weapon-enchantment} Special effect: {table:gm/loot/weapon-quirk}', weight: 20 },
    { text: '{table:gm/loot/weapon-enchantment} {table:gm/loot/weapon-look}', weight: 20 },
    ...(hasRunes
      ? [{ text: '{table:gm/loot/weapon-enchantment} It is covered in a runic inscription: {table:gm/loot/weapon-rune}', weight: 20 }]
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
  const cut = '{pick:A rough-cut|A polished|A brilliant-cut|An uncut|A tumbled|A cabochon-cut}';
  writeTable({
    id: 'gm/loot/gems',
    title: 'Gemstone',
    entries: [
      { text: `${cut} {table:gm/loot/gems-tier1}`, weight: 30 },
      { text: `${cut} {table:gm/loot/gems-tier2}`, weight: 25 },
      { text: `${cut} {table:gm/loot/gems-tier3}`, weight: 18 },
      { text: `${cut} {table:gm/loot/gems-tier4}`, weight: 12 },
      { text: `${cut} {table:gm/loot/gems-tier5}`, weight: 9 },
      { text: `${cut} {table:gm/loot/gems-tier6}`, weight: 6 },
    ],
  });
}

// ---------------------------------------------------------------------------
console.log('Songs — ported legacy song builder + curated classics:');
for (const [varName, occ, slug, title] of [
  ['subject', 2, 'song-subject', 'Song Subjects'],
  ['popularity', 1, 'song-popularity', 'Why the Song Is Popular'],
  ['commonUse', 1, 'song-occasion', 'Where the Song Is Sung'],
  ['commonPerformance', 1, 'song-performance', 'How the Song Is Performed'],
  ['melody', 1, 'song-melody', 'Song Melodies'],
  ['bardSongs', 1, 'song-classics', 'Curated Songs'],
]) {
  writeTable({ id: `${T}/${slug}`, title, entries: evalEntries(extractArrayLiteral(tavernSrc, varName, occ), {}, `${T}/${slug}`) });
}
writeTable({
  id: `${T}/song-tempo`,
  title: 'Song Tempos',
  entries: ['a ponderous', 'a slow and steady', 'an andante', 'an allegro', 'a lively', 'a lilting', 'a fast-paced', 'a frenetic'],
});
writeTable({
  id: `${T}/song`,
  title: 'Current Song',
  entries: [
    { text: `{table:${T}/song-classics}`, weight: 1 },
    {
      text: `A song about {table:${T}/song-subject} and {table:${T}/song-subject}, popular because {table:${T}/song-popularity}. It is sung at {table:${T}/song-occasion} as {table:${T}/song-performance}, with a melody that is {table:${T}/song-melody} and {table:${T}/song-tempo} tempo.`,
      weight: 1,
    },
  ],
});

// ---------------------------------------------------------------------------
console.log('Gambling games — ported legacy card/dice/board builder:');
writeTable({
  id: `${T}/game-size`,
  title: 'Who Is Playing',
  entries: evalEntries(extractArrayLiteral(tavernSrc, 'size', 1), { '${toWords(2+rollDice(8))}people': '{count:2-9} people' }, 'game-size'),
});
for (const [varName, slug, title] of [
  ['stakes', 'game-stakes', 'Game Stakes'],
  ['renown', 'game-renown', 'What the Game Is Known For'],
  ['popular', 'game-popular', 'Who Loves the Game'],
  ['origin', 'game-origin', 'Where the Game Was Devised'],
]) {
  writeTable({ id: `${T}/${slug}`, title, entries: evalEntries(extractArrayLiteral(tavernSrc, varName, 1), {}, `${T}/${slug}`) });
}
for (const [kind, occ] of [
  ['cards', 1],
  ['dice', 2],
  ['board', 3],
]) {
  for (const [varName, slug] of [
    ['winner', 'winner'],
    ['best', 'best'],
    ['worst', 'worst'],
  ]) {
    writeTable({
      id: `${T}/game-${kind}-${slug}`,
      title: `${kind[0].toUpperCase()}${kind.slice(1)} Game — ${slug}`,
      entries: evalEntries(extractArrayLiteral(tavernSrc, varName, occ), {}, `game-${kind}-${slug}`),
    });
  }
}
for (const [varName, kind] of [
  ['cards', 'cards'],
  ['dice', 'dice'],
  ['board', 'board'],
]) {
  writeTable({
    id: `${T}/game-${kind}-rules`,
    title: `${kind[0].toUpperCase()}${kind.slice(1)} Game Rules`,
    entries: evalEntries(extractArrayLiteral(tavernSrc, varName, 1), {
      '${searchArray(winner)}': `{table:${T}/game-${kind}-winner}`,
      '${searchArray(best)}': `{table:${T}/game-${kind}-best}`,
      '${searchArray(worst)}': `{table:${T}/game-${kind}-worst}`,
    }, `game-${kind}-rules`),
  });
}
{
  const lore = `In this game {table:${T}/game-stakes}, and it is known for {table:${T}/game-renown} It is most loved by {table:${T}/game-popular} It was devised {table:${T}/game-origin}`;
  writeTable({
    id: `${T}/game`,
    title: 'Tavern Game',
    entries: [
      { text: `You notice a {table:${T}/game-size} playing a card game with a deck of {pick:over one hundred|53|52|24|22} cards. ${lore} {table:${T}/game-cards-rules}`, weight: 6 },
      { text: `You notice a {table:${T}/game-size} playing a dice game using {pick:a pair of dice|several dice|several dice, pencils, and paper|one or two dice and a board with pieces}. ${lore} {table:${T}/game-dice-rules}`, weight: 4 },
      { text: `You notice a {table:${T}/game-size} playing a board game with sets of {pick:matching|individual} pieces. ${lore} {table:${T}/game-board-rules}`, weight: 2 },
    ],
  });
}

// ---------------------------------------------------------------------------
console.log('Enrichment — constructed tavern content (new, reuses name-part tables):');
writeTable({
  id: `${T}/drink-name`,
  title: 'Drink Names',
  credits: [],
  entries: [
    'The {table:gm/tavern/name-adjective} {table:gm/tavern/name-monster}',
    "The {table:gm/tavern/name-person}'s {pick:Ruin|Reward|Secret|Remedy|Regret|Delight}",
    '{table:gm/tavern/name-adjective} {pick:Dawn|Dusk|Ember|Frost|Thunder|Petal}',
  ],
});
writeTable({
  id: `${T}/drink-base`,
  title: 'Drink Bases',
  credits: [],
  entries: ['ale', 'stout', 'porter', 'lager', 'mead', 'cider', 'mulled wine', 'brandy', 'rum', 'whiskey', 'gin', 'schnapps', 'herbal tea', 'spiced milk', 'cordial', 'moonshine'],
});
writeTable({
  id: `${T}/drink-serving`,
  title: 'How the Drink Is Served',
  credits: [],
  entries: [
    'in a frosted tankard',
    'in a smoking clay cup',
    'in a hollowed horn',
    'over crackling ice that never melts',
    'in a glass that glows faintly',
    'warm, with a cinnamon stick',
    'in a mug carved with a grinning face',
    'with a pickled eyeball garnish',
    'in a bottle that refills itself once, at midnight',
    'in a communal bowl with tiny ladles',
    'with a live flower floating on top',
    'in a tankard chained to the bar',
  ],
});
writeTable({
  id: `${T}/drink-effect`,
  title: 'Minor Drink Effects',
  credits: [],
  entries: [
    "makes the drinker's voice an octave deeper for an hour",
    'causes harmless sparks when the drinker hiccups',
    'gives the drinker perfect pitch until sunrise',
    'makes the drinker glow faintly in the dark for a few minutes',
    'lets the drinker taste colors',
    "makes the drinker's hair slowly stand on end",
    'causes the drinker to speak in rhyme for ten minutes',
    'makes the drinker feel pleasantly weightless',
    'shows the drinker a glimpse of their childhood home in the foam',
    'makes the drinker smell of fresh rain for a day',
    'causes small animals to trust the drinker',
    "makes the drinker's shadow lag half a second behind",
    'warms the drinker against even magical cold for an hour',
    "makes the drinker's laugh infectious — literally; the whole room joins in",
    'grants one vivid, strangely useful dream that night',
    "turns the drinker's tongue blue for a week",
  ],
});
writeTable({
  id: `${T}/impression-smell`,
  title: 'Tavern Smells',
  credits: [],
  entries: ['woodsmoke', 'stale ale', 'fresh bread', 'roasting meat', 'pipe tobacco', 'lamp oil', 'wet dog', 'sour wine', 'sea salt', 'sawdust', 'candle wax', 'old leather', 'spiced cider', 'something faintly burnt'],
});
writeTable({
  id: `${T}/impression-sound`,
  title: 'Tavern Sounds',
  credits: [],
  entries: [
    'a crackling hearth',
    'a badly tuned lute',
    'roaring laughter from a corner table',
    'a heated argument over dice',
    'clinking tankards',
    'a snoring patron',
    'a bard mid-ballad',
    'the steady thunk of darts',
    'a cook shouting orders',
    'rain against the shutters',
    'a cat yowling somewhere upstairs',
    'low, murmured bargaining',
  ],
});
writeTable({
  id: `${T}/impression-crowd`,
  title: 'Tavern Crowds',
  credits: [],
  entries: [
    'packed shoulder to shoulder',
    'nearly empty',
    'quietly busy',
    'rowdy and getting rowdier',
    'full of regulars who all turn to look at you',
    'half-asleep',
    'busier than it has any right to be',
    'tense, as if something just happened',
    'festive',
    "full of strangers avoiding each other's eyes",
  ],
});
writeTable({
  id: `${T}/impression-built`,
  title: 'Constructed First Impressions',
  credits: [],
  entries: [
    `The common room is {table:${T}/impression-crowd}. It smells of {table:${T}/impression-smell}, and beneath the noise you hear {table:${T}/impression-sound}.`,
    `The common room is {table:${T}/impression-crowd}, thick with the smell of {table:${T}/impression-smell} and {table:${T}/impression-smell}. Over it all: {table:${T}/impression-sound}.`,
  ],
});
writeTable({
  id: `${T}/impression`,
  title: 'First Impression',
  entries: [
    { text: `{table:${T}/first-impression}`, weight: 70 },
    { text: `{table:${T}/impression-built}`, weight: 30 },
  ],
});
writeTable({
  id: `${T}/notice-built`,
  title: 'Constructed Notices',
  credits: [],
  entries: [
    '{pick:REWARD|BOUNTY|HELP WANTED}: {num:5-120} gold to whoever {pick:finds|returns|slays|captures|quiets} the {table:gm/tavern/name-adjective} {table:gm/tavern/name-monster} {pick:seen near|lurking by|nesting in|haunting} the {table:gm/tavern/name-place}.',
    "MISSING: my {pick:beloved|prized|late mother's|cursed|second-best} {table:gm/tavern/name-thing}. Last seen {pick:by the docks|at the market|in the cellar|somewhere embarrassing}. Ask for the {table:gm/tavern/name-person} at the bar.",
    '{pick:A certain|One} {table:gm/tavern/name-person} seeks {pick:brave|discreet|expendable|sober} companions for {pick:a short journey|honest work|dishonest work|a matter best not written down}. Pay: {pick:negotiable|generous|in kind|half up front}. {pick:No questions asked.|Bring your own weapons.|Absolutely no bards.|References required.}',
    'FOR SALE: {pick:two|three|a crate of|a barrel of} {table:gm/tavern/name-thing}s{pick:.| — barely used.| — slightly cursed.} Inquire at the {table:gm/tavern/name-place}.',
    'LOST {pick:DOG|CAT|HOMUNCULUS|APPRENTICE}: answers to "{table:gm/tavern/name-adjective}". {num:2-20} silver reward.',
    'The {table:gm/tavern/name-place} {pick:guild|militia|temple} is hiring {pick:guards|porters|tasters|torchbearers}. {pick:Hazard pay included.|Survivors promoted quickly.|Meals provided.}',
    'WARNING: do not {pick:feed|approach|mock|bargain with} the {table:gm/tavern/name-monster} by the {table:gm/tavern/name-place}. This means you, {table:gm/tavern/name-person}.',
    'WANTED: the {var:m=table:gm/tavern/name-monster} of the {table:gm/tavern/name-place}. Do not approach the {var:m}. Do not feed the {var:m}. Report sightings to the militia.',
    "SEEKING: anyone who can read {pick:Draconic|Elvish|Dwarvish|Celestial|my late husband's handwriting}. Will pay {num:1-10} gold per page.",
  ],
});
writeTable({
  id: `${T}/notice`,
  title: 'Notice Board Posting',
  entries: [
    { text: `{table:${T}/notice-board}`, weight: 3 },
    { text: `{table:${T}/notice-built}`, weight: 1 },
  ],
});

// ---------------------------------------------------------------------------
console.log('Enrichment — loot:');
writeTable({
  id: 'gm/loot/weapon-look',
  title: 'Weapon Appearances',
  credits: [],
  entries: [
    'The weapon hums faintly when drawn.',
    'It is always cold to the touch.',
    'It never rusts, though it always looks like it might.',
    'It smells faintly of ozone.',
    'It is far lighter than it looks.',
    'It catches light strangely, as if underwater.',
    'Old teeth marks dent the grip.',
    'A faded ribbon is tied to it — and cannot be removed.',
    'Its shadow shows a slightly different weapon.',
    'It thrums like a purring cat when its bearer is angry.',
    'Runes appear on it in moonlight, spelling nothing in particular.',
    "The previous owner's name is scratched out.",
  ],
});
writeTable({
  id: 'gm/loot/coins',
  title: 'Coins',
  credits: [],
  entries: [
    { text: 'A handful of coppers: {num:8-60} cp.', weight: 20 },
    { text: 'A worn pouch: {num:10-80} sp and {num:2-30} gp.', weight: 35 },
    { text: 'A heavy purse: {num:20-150} gp.', weight: 30 },
    { text: 'A lockbox: {num:60-400} gp and {num:5-40} pp.', weight: 12 },
    { text: "A noble's ransom: {num:300-1500} gp, {num:20-120} pp, and a promissory note.", weight: 3 },
  ],
});

console.log(`\nDone. ${stats.tables} tables written, dropped entries: ${stats.dropped}`);
