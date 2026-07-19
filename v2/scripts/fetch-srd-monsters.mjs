// Builds src/data/gm/monsters/srd.json — compact SRD 5.1 statblock lines for
// every monster in gm/monsters/all that the SRD covers (~308 of 697; the rest
// are non-SRD names that legally can't carry these stats). The GM/solo audit's
// batch E: "5 × Sprite — CR 1/4" must not dead-end — the encounter, lair, and
// dungeon composites append these lines so a rolled fight is runnable at the
// table without opening a book.
//
// This is a CACHE-FILLER in the bake-earth mould: it fetches the 5e-bits SRD
// database (pinned to one commit so a re-run is reproducible), transforms, and
// writes a normal table file. The COMMITTED JSON is the source of truth — the
// site never fetches anything. Re-run only to change the transform or refresh
// the pin: node scripts/fetch-srd-monsters.mjs [--from <downloaded.json>]
//
// Content: System Reference Document 5.1, Wizards of the Coast LLC, CC BY 4.0
// (see LICENSE-SRD.md). Database shape: github.com/5e-bits/5e-database.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PIN = '5afdb8f0bf02a3f06c56339f78f9f9206dda5068'; // 5e-bits/5e-database, 2026-06-02
const URL = `https://raw.githubusercontent.com/5e-bits/5e-database/${PIN}/src/2014/en/5e-SRD-Monsters.json`;

const here = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(here, '../src/data/gm/monsters');

const fromArg = process.argv.indexOf('--from');
const raw =
  fromArg > -1
    ? JSON.parse(readFileSync(process.argv[fromArg + 1], 'utf8'))
    : await (await fetch(URL)).json();

const allTable = JSON.parse(readFileSync(resolve(DATA, 'all.json'), 'utf8'));
const rollable = new Map(
  allTable.entries.map((e) => [(typeof e === 'string' ? e : e.text).toLowerCase(), typeof e === 'string' ? e : e.text]),
);

// The same slug the runtime lookup (composites/srd.ts) derives from a rolled
// name — change one, change both.
const slug = (name) => 'n-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const crLabel = (cr) => (cr === 0.125 ? '1/8' : cr === 0.25 ? '1/4' : cr === 0.5 ? '1/2' : String(cr));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** "AC 15 (leather armor)" — the note only when it says something. */
function acPart(m) {
  const ac = m.armor_class?.[0];
  if (!ac) return null;
  const note =
    ac.type === 'natural' ? 'natural armor'
    : ac.type === 'armor' ? (ac.armor ?? []).map((a) => a.name.toLowerCase()).join(', ')
    : ac.type === 'spell' ? (ac.spell?.name ? ac.spell.name.toLowerCase() : 'spell')
    : ac.type === 'condition' ? `while ${ac.condition?.name?.toLowerCase() ?? 'conditioned'}`
    : '';
  return `AC ${ac.value}${note ? ` (${note})` : ''}`;
}

function speedPart(m) {
  const s = m.speed ?? {};
  const bits = [];
  for (const k of ['walk', 'burrow', 'climb', 'fly', 'swim']) {
    if (!s[k]) continue;
    const label = k === 'walk' ? s[k] : `${k} ${s[k]}`;
    bits.push(k === 'fly' && s.hover ? `${label} (hover)` : label);
  }
  return bits.length ? `Speed ${bits.join(', ')}` : null;
}

function profParts(m) {
  const saves = [];
  const skills = [];
  for (const p of m.proficiencies ?? []) {
    const idx = p.proficiency?.index ?? '';
    if (idx.startsWith('saving-throw-')) saves.push(`${cap(idx.slice(13))} +${p.value}`);
    else if (idx.startsWith('skill-')) skills.push(`${p.proficiency.name.slice(7)} +${p.value}`);
  }
  return [saves.length ? `Saves ${saves.join(', ')}` : null, skills.length ? `Skills ${skills.join(', ')}` : null];
}

function sensesPart(m) {
  const s = m.senses ?? {};
  const bits = [];
  for (const k of ['blindsight', 'darkvision', 'tremorsense', 'truesight']) if (s[k]) bits.push(`${k} ${s[k]}`);
  if (s.passive_perception != null) bits.push(`passive Perception ${s.passive_perception}`);
  return bits.length ? `Senses ${bits.join(', ')}` : null;
}

const diceOf = (dmg) =>
  (dmg ?? [])
    .filter((d) => d.damage_dice)
    .map((d) => `${d.damage_dice} ${d.damage_type?.name?.toLowerCase() ?? ''}`.trim())
    .join(' + ');

/** One action, compacted: attacks get to-hit + dice, save effects get the DC,
 *  Multiattack keeps its first sentence (it IS the routine), the rest are
 *  named in "Also" — enough to run the fight, the SRD has the paragraph. */
function actionPart(a) {
  const dice = diceOf(a.damage);
  if (a.attack_bonus != null && dice) return `${a.name} ${a.attack_bonus >= 0 ? '+' : ''}${a.attack_bonus} (${dice})`;
  if (a.dc && dice) return `${a.name} (DC ${a.dc.dc_value} ${a.dc.dc_type?.name ?? ''}, ${dice})`;
  if (a.name === 'Multiattack') {
    // the routine is sometimes the SECOND sentence ("The dragon can use its
    // Frightful Presence. It then makes three attacks…") — keep up to two
    const sentences = (a.desc ?? '').split(/(?<=\.)\s+/);
    const routine = sentences.slice(0, sentences[0].length < 60 ? 2 : 1).join(' ');
    return `Multiattack — ${routine.replace(/^The \S+ /i, '')}`;
  }
  return null;
}

function lineFor(m) {
  const parts = [
    acPart(m),
    `HP ${m.hit_points}${m.hit_dice ? ` (${m.hit_dice})` : ''}`,
    speedPart(m),
    `STR ${m.strength} DEX ${m.dexterity} CON ${m.constitution} INT ${m.intelligence} WIS ${m.wisdom} CHA ${m.charisma}`,
    ...profParts(m),
    m.damage_vulnerabilities?.length ? `Vulnerable ${m.damage_vulnerabilities.join(', ')}` : null,
    m.damage_resistances?.length ? `Resist ${m.damage_resistances.join(', ')}` : null,
    m.damage_immunities?.length ? `Immune ${m.damage_immunities.join(', ')}` : null,
    m.condition_immunities?.length ? `Condition immune ${m.condition_immunities.map((c) => c.name.toLowerCase()).join(', ')}` : null,
    sensesPart(m),
    `CR ${crLabel(m.challenge_rating)} (${m.xp.toLocaleString('en-US')} XP)`,
  ].filter(Boolean);

  const attacks = [];
  const also = [];
  for (const a of m.actions ?? []) {
    const p = actionPart(a);
    if (p) attacks.push(p);
    else also.push(a.name);
  }
  for (const t of m.special_abilities ?? []) also.push(t.name.replace(/ \(.*\)$/, ''));
  if (m.legendary_actions?.length) also.push('Legendary Actions');

  let line = parts.join(' · ');
  if (attacks.length) line += ` — ${attacks.join('; ')}`;
  if (also.length) line += `. Also: ${[...new Set(also)].join(', ')}.`;
  return line;
}

const entries = [];
let skipped = 0;
for (const m of raw) {
  const tableName = rollable.get(m.name.toLowerCase());
  if (!tableName) {
    skipped++;
    continue; // an SRD monster our CR table never rolls
  }
  entries.push({ text: lineFor(m), tags: [slug(tableName)] });
}
entries.sort((a, b) => a.tags[0].localeCompare(b.tags[0]));

const table = {
  id: 'gm/monsters/srd',
  title: 'SRD 5.1 statblock lines',
  pillar: 'gm',
  description:
    'Compact table-ready statblocks, one line per monster, keyed by an n-<name> tag. Looked up by name (never rolled) from the encounter, lair, and dungeon composites via composites/srd.ts. Built by scripts/fetch-srd-monsters.mjs from the 5e-bits SRD database — edit that script, not this file.',
  tags: ['fantasy'],
  credits: [
    { source: 'System Reference Document 5.1, Wizards of the Coast LLC, CC BY 4.0' },
    { source: '5e-bits/5e-database', url: 'https://github.com/5e-bits/5e-database' },
  ],
  entries,
};

writeFileSync(resolve(DATA, 'srd.json'), JSON.stringify(table, null, 2) + '\n');
console.log(`gm/monsters/srd: ${entries.length} statblock lines (${skipped} SRD monsters not in the CR table)`);
