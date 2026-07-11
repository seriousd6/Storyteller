// Triage migration of v1/Unfinished Development/ — the provenance-SAFE,
// net-new, non-duplicate community lists only. Deliberately excluded:
//  - DMG "Dungeon Dressing" + 5e "Random Dungeons" tables (Unused So Far) — published
//  - DMG magic-item quirks #1–12 (Loot Queue) — published
//  - LONG term archive/Spells.js — published SRD spells (already in gm/spells)
//  - name lists, WIP/scratch/empty files, and medium-risk builders needing per-entry
//    source verification (SuperBuilder Bard/Thief, queue LOCATION builders, book titles)
// See OVERHAUL.md Phase 3 triage note.
//
// Run: node scripts/extract-unfinished.mjs  (then npm run registries)

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractArrayLiteral,
  evalEntriesLoose,
  inlinePicks,
  rewriteDice,
  fixArticles,
  writeTable,
  stats,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const UNF = resolve(here, '../../v1/Unfinished Development');
const read = (f) => readFileSync(resolve(UNF, f), 'utf8');

const CREDITS = [
  { source: 'r/d100', url: 'https://www.reddit.com/r/d100/' },
  { source: 'r/BehindTheTables', url: 'https://www.reddit.com/r/BehindTheTables/' },
  { source: 'r/DnDBehindTheScreen', url: 'https://www.reddit.com/r/DnDBehindTheScreen/' },
];

/** De-template one raw legacy string: inline choices → {pick}, dice → {num},
 *  fix a(n); drop anything with an unresolved ${…}. */
function clean(raw) {
  const t = fixArticles(rewriteDice(inlinePicks(raw))).replace(/\s+/g, ' ').trim();
  if (!t || t.includes('${')) return null;
  return t;
}

// ── b. holding cell.js — comment-delimited runs of `backtick` strings ───────
const hc = read('b. holding cell.js');
// Find every `//Header` and the text up to the next `//Header`.
const sections = new Map();
const headerRe = /^[ \t]*\/\/(.+)$/gm;
const marks = [];
let m;
// lineStart = start of the header line; contentStart = just after the header text.
while ((m = headerRe.exec(hc)) !== null) {
  marks.push({ name: m[1].trim(), lineStart: m.index, contentStart: m.index + m[0].length });
}
for (let i = 0; i < marks.length; i++) {
  const end = i + 1 < marks.length ? marks[i + 1].lineStart : hc.length;
  const body = hc.slice(marks[i].contentStart, end);
  const items = [...body.matchAll(/`([^`]*)`/g)].map((x) => clean(x[1])).filter(Boolean);
  if (items.length) sections.set(marks[i].name.replace(/[:=]\s*$/, '').trim(), items);
}

const get = (name) => sections.get(name) ?? [];

// Scavenge loot: one table, tagged by location, powering a per-location generator.
const SCAVENGE = [
  ["WIZARD's TOWER", 'wizards-tower'],
  ["ALCHEMIST's HOME", 'alchemists-home'],
  ['Cottage', 'cottage'],
  ["Bandit's Home", 'bandits-home'],
  ['Office', 'office'],
  ['Warehouse', 'warehouse'],
  ['ancient tomb', 'ancient-tomb'],
  ["Noble's Room", 'nobles-room'],
  ["Post master's office", 'post-office'],
  ['Adventurers Deads body', 'dead-adventurer'],
  ["Hunter's Camp", 'hunters-camp'],
  ["Captain's Quarters", 'captains-quarters'],
  ['Dead goblin', 'dead-goblin'],
  ['Desk', 'desk'],
  ["inn's kitchen", 'inns-kitchen'],
];
const scavenge = [];
for (const [name, tag] of SCAVENGE) {
  for (const text of get(name)) scavenge.push({ text, tags: [tag] });
}
writeTable({
  id: 'gm/loot/scavenge',
  title: 'Scavenge Loot',
  description: 'What you turn up rummaging through a place — tagged by location.',
  credits: CREDITS,
  entries: scavenge,
});

// Herbs (culinary + medicinal), potion reagents, catastrophes.
const herbs = [
  ...get('herbs').map((text) => ({ text, tags: ['culinary'] })),
  ...get('medical herbs').map((text) => ({ text, tags: ['medicinal'] })),
];
writeTable({ id: 'gm/loot/herb', title: 'Herbs', description: 'Culinary and medicinal herbs.', credits: CREDITS, entries: herbs });
writeTable({ id: 'gm/loot/reagent', title: 'Potion Reagents', description: 'Alchemical ingredients for a potion.', credits: CREDITS, entries: get('Potion ingrediants') });
writeTable({ id: 'gm/world/catastrophe', title: 'Catastrophe', description: 'A disaster that befalls a settlement.', credits: CREDITS, entries: get('catastrophes') });

// ── Unused So Far — safe community JS arrays only (NOT dungeonDresser/dungeon{}) ─
const uf = read('Unused So Far');
const arr = (name) => evalEntriesLoose(extractArrayLiteral(uf, name, 1), {}, name);
writeTable({ id: 'gm/dungeon/graffiti', title: 'Dungeon Graffiti', description: 'Words scrawled on a dungeon wall.', credits: CREDITS, entries: arr('graffiti') });
writeTable({ id: 'gm/dungeon/riddle', title: 'Riddle', description: 'A riddle, with its answer.', credits: CREDITS, entries: arr('simpleRiddle') });
writeTable({ id: 'gm/dungeon/hazard', title: 'Dungeon Hazard', description: 'A trap or hazard to spring on explorers.', credits: CREDITS, entries: arr('trap') });
writeTable({ id: 'gm/dungeon/room', title: 'Dungeon Room', description: 'A set-piece for a dungeon room.', credits: CREDITS, entries: arr('encounter') });

console.log(`\nUnfinished Development: ${stats.tables} tables, ${stats.dropped} dropped.`);
