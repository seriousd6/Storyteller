// Mines the CONCEPT-BASED, system-neutral material out of the parked legacy
// Colostle companion into the solo-oracle set: character depth (flaws, goals,
// secrets, struggles, emotions...), quest/NPC oracles, complications, found
// items, and enemy intentions. Anything Colostle-flavored is filtered out —
// the game-specific companion stays parked (see OVERHAUL.md Phase 5).
// Run: node scripts/extract-solo.mjs

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractArrayLiteral, evalEntriesLoose, evalLoose, cleanStrings, writeTable, stats } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const COLOSTLE = resolve(here, '../../v1/Colostle/js');

const charSrc = readFileSync(join(COLOSTLE, 'colostleCharacter.js'), 'utf8');
const depthSrc = readFileSync(join(COLOSTLE, 'CharacterDepth.js'), 'utf8');
const combatSrc = readFileSync(join(COLOSTLE, 'colostleCombat.js'), 'utf8');
const exploreSrc = readFileSync(join(COLOSTLE, 'colostleExploration.js'), 'utf8');

const CREDITS = [{ source: 'Storyteller Toolbox legacy solo tools (community expansions)' }];

/** Colostle-specific vocabulary — entries carrying it stay parked with the
 *  game. \brook\w* catches the compounds too (Rookstones, Rookhome, ...). */
const IP = /\brook\w*|\bcolostle\w*|\bcrackway\w*|\bashta\b|\bastrolithic\w*|\btundr(?:a)?room\w*|\broomtrotter\w*/i;

function conceptOnly(entries, label) {
  const kept = entries.filter((e) => !IP.test(typeof e === 'string' ? e : e.text));
  const dropped = entries.length - kept.length;
  if (dropped) console.log(`  – ${label}: filtered ${dropped} Colostle-flavored entries`);
  return kept;
}

const dedupe = (arr) => [...new Set(arr)];

/** Strip stray backticks and trailing ellipses; capitalize sentence starts. */
const tidy = (entries, { capitalize = false } = {}) =>
  entries.map((e) => {
    let t = e.replace(/`/g, '').replace(/\.{2,}$/, '').trim();
    if (capitalize && /^[a-z]/.test(t)) t = t[0].toUpperCase() + t.slice(1);
    return t;
  });

function grab(src, varName, label, occurrence = 1) {
  return conceptOnly(evalEntriesLoose(extractArrayLiteral(src, varName, occurrence), {}, label), label);
}

function solo({ id, title, description, entries, tags = ['system-neutral'] }) {
  writeTable({ id, title, description, tags, credits: CREDITS, entries });
}

function sample(label, entries, n = 3) {
  console.log(`    ${label} samples:`);
  for (const e of entries.slice(0, n)) {
    console.log(`      • ${(typeof e === 'string' ? e : e.text).slice(0, 110)}`);
  }
}

console.log('CHARACTER ORACLE — names, nature');
{
  // The same fantasy-name list appears three times across the legacy files;
  // merge the two clean sources and dedupe.
  const names = grab(charSrc, 'nameArray', 'name');
  const oracleNPC = evalLoose(extractArrayLiteral(exploreSrc, 'oracleNPC'));
  const npcNames = conceptOnly(cleanStrings(oracleNPC[0], 'npc-name'), 'npc-name');
  solo({ id: 'solo/character/name', title: 'Character Names', entries: dedupe([...names, ...npcNames]) });
  solo({ id: 'solo/character/look', title: 'At First Glance', entries: dedupe(conceptOnly(cleanStrings(oracleNPC[1], 'look'), 'look')) });
  solo({ id: 'solo/character/trait', title: 'Defining Characteristics', entries: dedupe(conceptOnly(cleanStrings(oracleNPC[2], 'trait'), 'trait')) });
  const nature = grab(charSrc, 'nature', 'nature');
  solo({ id: 'solo/character/nature', title: 'Natures', entries: dedupe(nature) });
  sample('nature', nature);
}

console.log('CHARACTER ORACLE — depth tables');
{
  const flaws = grab(depthSrc, 'personalityFlaw', 'flaw');
  const flawStories = grab(depthSrc, 'flawBackstory', 'flaw-story');
  solo({ id: 'solo/character/flaw', title: 'Personality Flaws', entries: dedupe(flaws) });
  solo({ id: 'solo/character/flaw-story', title: 'Where the Flaw Comes From', entries: flawStories });
  sample('flaw', flaws);
  sample('flaw-story', flawStories);

  const pairs = [
    ['majorGoals', 'solo/character/goal-major', 'Major Goals'],
    ['minorGoals', 'solo/character/goal-minor', 'Minor Goals'],
    ['motives', 'solo/character/motive', 'Motives'],
    ['intentions', 'solo/character/intention', 'Intentions'],
    ['majorChange', 'solo/character/change-major', 'Turning Points'],
    ['minorChange', 'solo/character/change-minor', 'Smaller Shifts'],
    ['majorWeakness', 'solo/character/weakness', 'Weaknesses'],
    ['majorStrength', 'solo/character/strength', 'Strengths'],
    ['secrets', 'solo/character/secret', 'Secrets'],
    ['secretReason', 'solo/character/secret-reason', 'Why the Secret Is Kept'],
    ['Struggles', 'solo/character/struggle', 'Struggles'],
  ];
  for (const [varName, id, title] of pairs) {
    const entries = grab(depthSrc, varName, id.split('/').pop());
    solo({ id, title, entries: dedupe(entries) });
    sample(id.split('/').pop(), entries, 2);
  }
}

console.log('CHARACTER ORACLE — emotions & little things (tagged categories)');
{
  const emotionCats = ['joy', 'pain', 'wonder', 'hope', 'interest', 'fear', 'frustration', 'fury'];
  const emotionOptions = evalLoose(extractArrayLiteral(depthSrc, 'emotionOptions'));
  const emotionEntries = emotionCats.flatMap((tag, i) =>
    dedupe(conceptOnly(cleanStrings(emotionOptions[i] ?? [], `emotion-${tag}`), `emotion-${tag}`)).map((text) => ({ text, tags: [tag] })),
  );
  solo({ id: 'solo/character/emotion', title: 'Emotional Landscape', entries: emotionEntries });
  sample('emotion', emotionEntries);

  // Category [2] ("favorites") is fill-in-the-blank prompts with modern
  // references ("Complete the Favorite: movie(s)") — skipped entirely.
  const littleCats = [
    ['like', 0],
    ['dislike', 1],
    ['tick', 3],
  ];
  const littleDetails = evalLoose(extractArrayLiteral(depthSrc, 'littleDetails'));
  const littleEntries = littleCats.flatMap(([tag, i]) =>
    dedupe(conceptOnly(cleanStrings(littleDetails[i] ?? [], `little-${tag}`), `little-${tag}`)).map((text) => ({ text, tags: [tag] })),
  );
  solo({ id: 'solo/character/little', title: 'The Little Things', entries: littleEntries });
  sample('little', littleEntries);
}

console.log('CHARACTER ORACLE — strangers');
{
  const strangers = grab(exploreSrc, 'villagerDescription', 'stranger');
  solo({ id: 'solo/character/stranger', title: 'Strangers', entries: dedupe(strangers) });
  sample('stranger', strangers);
}

console.log('QUEST & SCENE ORACLE');
{
  const oracleQuest = evalLoose(extractArrayLiteral(exploreSrc, 'oracleQuest'));
  const [actions, subjects, twists] = [0, 1, 2].map((i) =>
    dedupe(tidy(conceptOnly(cleanStrings(oracleQuest[i] ?? [], `quest-${i}`), `quest-${i}`))),
  );
  // The Colostle filter guts the subject list — top it back up with originals.
  const AUTHORED_SUBJECTS = [
    'A caravan that never reached the next town', 'The last speaker of a dying language',
    'A bridge the locals refuse to cross', 'An heirloom sold that should not have been',
    'A well that has started whispering', 'The winners of last year’s festival',
    'A prisoner due to be moved at dawn', 'A ledger with one page torn out',
    'The lighthouse that went dark mid-storm', 'A duelist who refuses to say why they fight',
    'An abandoned mine reopened by strangers', 'The shrine at the crossroads',
    'A ship in harbor that no one will crew', 'The healer who cures too well',
    'A border stone moved in the night', 'Letters arriving from someone dead',
    'A troupe of players performing a forbidden play', 'The orchard that fruits out of season',
    'A bell that rings itself', 'The garrison’s missing payroll',
    'A child who remembers a previous life', 'The map room of a ruined college',
    'A wedding both families want stopped', 'The last cask from a lost vineyard',
  ];
  const AUTHORED_CREDIT = { source: 'Storyteller Toolbox' };
  writeTable({
    id: 'solo/quest/subject',
    title: 'Quest Subjects',
    tags: ['system-neutral'],
    credits: [CREDITS[0], AUTHORED_CREDIT],
    entries: [...subjects, ...AUTHORED_SUBJECTS],
  });
  solo({ id: 'solo/quest/action', title: 'Quest Actions', entries: actions });
  solo({ id: 'solo/quest/twist', title: 'Quest Twists', entries: twists });
  sample('action', actions);
  sample('subject', subjects);
  sample('twist', twists);

  // Same for complications: most legacy rows were Colostle-flavored.
  const AUTHORED_COMPLICATIONS = [
    'Someone recognizes you — and leaves in a hurry.', 'The light is failing faster than it should.',
    'Whatever you came for, someone else came for it too.', 'Your way back is no longer there.',
    'An animal insists on following you.', 'The locals are celebrating something. Loudly. Tonight.',
    'A stranger offers help before you’ve asked for it.', 'Something here has been recently, hastily cleaned.',
    'You are being overcharged, and it’s a test.', 'The weather turns exactly when it’s least convenient.',
    'A door that was locked is standing open.', 'Two people you trust give opposite warnings.',
    'The bridge is out; the ferryman knows why.', 'Your supplies are lighter than they were this morning.',
    'A song you hear twice in one day, from different mouths.', 'The person you need is asleep and must not be woken.',
  ];
  const complications = tidy(grab(exploreSrc, 'situations', 'complication'), { capitalize: true });
  writeTable({
    id: 'solo/quest/complication',
    title: 'Complications',
    tags: ['system-neutral'],
    credits: [CREDITS[0], AUTHORED_CREDIT],
    entries: [...dedupe(complications), ...AUTHORED_COMPLICATIONS],
  });
  sample('complication', complications);

  const items = grab(exploreSrc, 'items', 'item');
  solo({ id: 'solo/quest/item', title: 'Found Items', entries: dedupe(items) });
  sample('item', items);

  const machines = grab(exploreSrc, 'foundMachinery', 'machine');
  solo({ id: 'solo/quest/machine', title: 'Strange Machinery', entries: dedupe(machines) });
  sample('machine', machines);

  const places = grab(exploreSrc, 'cityName', 'place-name');
  solo({ id: 'solo/quest/place-name', title: 'Place Names', entries: dedupe(places) });

  const enemyGoals = grab(combatSrc, 'intention', 'enemy-goal');
  solo({ id: 'solo/quest/enemy-goal', title: 'Enemy Intentions', entries: dedupe(enemyGoals) });
  sample('enemy-goal', enemyGoals);
}

console.log(`\nDone. Tables: ${stats.tables}, dropped entries: ${stats.dropped}`);
