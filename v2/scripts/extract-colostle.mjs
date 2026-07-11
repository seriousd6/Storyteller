// Colostle companion — extract ONLY the community/AI-authored table rows from
// the legacy v1/Colostle tools. Nich Angell's published rulebook prose (class
// descriptions, canonical Callings, biome/weather tables, the city/expansion
// module text, the core loot & situations tables) is deliberately NOT ported —
// those arrays are skipped wholesale. See OVERHAUL.md Phase 5 provenance notes.
//
// Run: node scripts/extract-colostle.mjs  (then npm run registries)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractArrayLiteral,
  evalEntriesLoose,
  evalLoose,
  cleanStrings,
  writeTable,
  stats,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const JS = resolve(here, '../../v1/Colostle/js');
const read = (f) => readFileSync(resolve(JS, f), 'utf8');

// Colostle is a solo RPG by Nich Angell. These companion tables are the
// community/original roll-table rows only; the rulebook is required to play.
const CREDITS = [
  { source: 'Colostle solo-RPG community & original companion tables' },
  { source: 'Colostle © Nich Angell — rulebook required to play', url: 'https://www.colostle.com/' },
];

const TAGS = ['colostle'];

function table(id, title, description, entries) {
  writeTable({ id, title, description, tags: TAGS, credits: CREDITS, entries });
}

/** 1-D legacy string array → clean entries. */
function strings(src, varName, occurrence = 1) {
  return evalEntriesLoose(extractArrayLiteral(src, varName, occurrence), {}, varName);
}

/** 2-D legacy array (array of sub-arrays) → one flattened, de-duplicated list. */
function flat2D(src, varName, occurrence = 1) {
  const arr = evalLoose(extractArrayLiteral(src, varName, occurrence));
  if (!Array.isArray(arr)) throw new Error(`${varName}: not an array`);
  const flat = [];
  for (const sub of arr) (Array.isArray(sub) ? flat.push(...sub) : flat.push(sub));
  return [...new Set(cleanStrings(flat, varName))];
}

// ── Character creation (colostleCharacter.js) ──────────────────────────────
const character = read('colostleCharacter.js');
table('solo/colostle/nature', 'Character Nature', 'A personality in a phrase for a Colostle explorer.', strings(character, 'nature'));
table('solo/colostle/name', 'Explorer Name', 'A name for a Colostle character.', [...new Set(strings(character, 'nameArray'))]);

// ── Combat / the Rook (colostleCombat.js) ──────────────────────────────────
const combat = read('colostleCombat.js');
table('solo/colostle/rook-magic', 'Rook Magic', 'The magic a Colossal Rook is infused with.', [...new Set(strings(combat, 'magic'))]);
table('solo/colostle/rook-detail', 'Rook Detail', 'A descriptive facet of a Colossal Rook — material, architecture, defenses, roar, and more. Draw a few for one Rook.', flat2D(combat, 'rook'));
table('solo/colostle/legendary-item', 'Legendary Item', 'A powerful reward pried from a fallen Rook.', strings(combat, 'legendaryItems'));
table('solo/colostle/reward', 'Fight Reward', 'What you salvage after a fight.', strings(combat, 'reward'));
table('solo/colostle/enemy-intention', 'Enemy Intention', 'What a human enemy wants from you.', strings(combat, 'intention'));
table('solo/colostle/weapon-melee', 'Rook Melee Weapon', 'A melee weapon wielded by a Rook.', strings(combat, 'melee'));
table('solo/colostle/weapon-ranged', 'Rook Ranged Weapon', 'A ranged weapon wielded by a Rook.', strings(combat, 'ranged'));

// ── Exploration (colostleExploration.js) ───────────────────────────────────
const exploration = read('colostleExploration.js');
table('solo/colostle/rookling', 'Rookling', 'A small autonomous Rook creature.', strings(exploration, 'rooklings'));

// ── Character depth (CharacterDepth.js) — all community/AI-authored ─────────
const depth = read('CharacterDepth.js');
table('solo/colostle/flaw', 'Character Flaw', 'A personality flaw to complicate a character.', strings(depth, 'personalityFlaw'));
table('solo/colostle/flaw-backstory', 'Flaw Origin', 'Where a flaw came from.', strings(depth, 'flawBackstory'));
table('solo/colostle/goal-major', 'Major Goal', 'What a character wants most.', strings(depth, 'majorGoals'));
table('solo/colostle/goal-minor', 'Minor Goal', 'A smaller want driving a character.', strings(depth, 'minorGoals'));
table('solo/colostle/motive', 'Motive', 'Why a character wants what they want.', strings(depth, 'motives'));
table('solo/colostle/intent', 'Intent', 'How a character plans to get it.', strings(depth, 'intentions'));
table('solo/colostle/change-major', 'Major Change', 'A defining change a character has undergone.', strings(depth, 'majorChange'));
table('solo/colostle/change-minor', 'Minor Change', 'A smaller shift in a character.', strings(depth, 'minorChange'));
table('solo/colostle/weakness', 'Weakness', 'A weakness that can undo a character.', strings(depth, 'majorWeakness'));
table('solo/colostle/strength', 'Strength', 'A strength a character can lean on.', strings(depth, 'majorStrength'));
table('solo/colostle/secret', 'Secret', 'A secret a character is keeping.', strings(depth, 'secrets'));
table('solo/colostle/secret-reason', 'Secret Reason', 'Why the secret is kept.', strings(depth, 'secretReason'));
table('solo/colostle/struggle', 'Struggle', 'An inner or outer struggle a character faces.', strings(depth, 'Struggles'));
table('solo/colostle/emotion', 'Emotional Note', 'A way a character shows what they feel. Draw a few for a scene.', flat2D(depth, 'emotionOptions'));
table('solo/colostle/little-detail', 'Little Detail', 'A small human detail that brings a character to life. Draw a few.', flat2D(depth, 'littleDetails'));

console.log(`\nColostle: ${stats.tables} tables written, ${stats.dropped} entries dropped.`);
