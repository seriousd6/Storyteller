// Quick NPC: a whole person as one statblock — race and name parsed out of
// the race wrapper, vocation in the header line, traits as fields, prose for
// appearance and backstory.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import { renderTemplate } from '../engine/roll.ts';
import type { Block, TableRegistry } from '../engine/types.ts';

// Race dials. Slugs match the tags added to gm/npc/race (race-slug + gender);
// the list is fixed here because meta.options can't reach the tables at module
// load. Order mirrors the table (Human/common first).
const RACES: { value: string; label: string }[] = [
  { value: '', label: 'Any race' },
  { value: 'human', label: 'Human' },
  { value: 'dwarf', label: 'Dwarf' },
  { value: 'high-elf', label: 'High-Elf' },
  { value: 'wood-elf', label: 'Wood-Elf' },
  { value: 'half-elf', label: 'Half-Elf' },
  { value: 'drow', label: 'Drow' },
  { value: 'gnome', label: 'Gnome' },
  { value: 'halfling', label: 'Halfling' },
  { value: 'half-orc', label: 'Half-Orc' },
  { value: 'orc', label: 'Orc' },
  { value: 'dragonborn', label: 'Dragonborn' },
  { value: 'tiefling', label: 'Tiefling' },
  { value: 'aasimar', label: 'Aasimar' },
  { value: 'genasi', label: 'Genasi' },
  { value: 'goliath', label: 'Goliath' },
  { value: 'tabaxi', label: 'Tabaxi' },
  { value: 'kenku', label: 'Kenku' },
  { value: 'aarakocra', label: 'Aarakocra' },
  { value: 'lizardfolk', label: 'Lizardfolk' },
  { value: 'yuan-ti', label: 'Yuan-Ti' },
  { value: 'tortle', label: 'Tortle' },
  { value: 'kobold', label: 'Kobold' },
  { value: 'hobgoblin', label: 'Hobgoblin' },
  { value: 'bugbear', label: 'Bugbear' },
  { value: 'changeling', label: 'Changeling' },
  { value: 'shifter', label: 'Shifter' },
  { value: 'kalashtar', label: 'Kalashtar' },
  { value: 'simic-hybrid', label: 'Simic Hybrid' },
  { value: 'warforged', label: 'Warforged' },
];

const GENDERS = [
  { value: '', label: 'Any' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
];

export const meta: CompositeMeta = {
  id: 'gm/npc-block',
  title: 'Quick NPC',
  pillar: 'gm',
  description:
    'One click, one person: name, race, vocation, appearance, demeanor, motivation, flaw, and a hook — as a single ready-to-print statblock. Dial in a specific race or gender, or leave it to chance.',
  addLabel: 'Add NPC',
  options: [
    { id: 'race', label: 'Race', choices: RACES, default: '' },
    { id: 'gender', label: 'Gender', choices: GENDERS, default: '' },
  ],
};

/** Race wrapper entries render to "Race: X( (gender))?. Name: N.( Racial note: R)?" */
const RACE_RE = /^Race: (.+?)\. Name: (.+?)\.(?:\s*Racial note: (.+))?$/s;

/** Roll a race wrapper, honoring the race/gender dials. With no dial it's the
 *  ordinary weighted roll (output identical to before). With a dial we filter
 *  the tagged pool in JS — the engine can only apply one #tag at a time, and a
 *  constrained NPC needs two (race AND gender). Falls back to the weighted roll
 *  if the pool is empty (an unknown slug), so a dial never yields a blank. */
function rollRace(
  c: ReturnType<typeof makeComposer>,
  tables: TableRegistry,
  seed: string,
  race: string,
  gender: string,
): string {
  if (!race && !gender) return c.text('{table:gm/npc/race}');
  const table = tables.get('gm/npc/race');
  const pool = (table?.entries ?? []).filter(
    (e) =>
      typeof e !== 'string' &&
      (!race || (e.tags?.includes(race) ?? false)) &&
      (!gender || (e.tags?.includes(gender) ?? false)),
  );
  if (pool.length === 0) return c.text('{table:gm/npc/race}');
  const chosen = pool[Math.floor(c.rng() * pool.length)] as { text: string };
  return renderTemplate(chosen.text, tables, `${seed}#race`);
}

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);

  const raceRoll = rollRace(c, tables, seed, opts.race ?? '', opts.gender ?? '');
  const m = RACE_RE.exec(raceRoll.trim());
  const race = m?.[1] ?? 'Human';
  const name = m?.[2] ?? raceRoll.trim();
  const racialNote = m?.[3];

  const vocation = c.text('{table:gm/npc/vocation}');

  // Motivation entries lead with their own kind ("Goal: …" / "Fear: …") and
  // flaws sometimes with "Flaw: …" — fold those prefixes into the field key
  // instead of printing them twice.
  const motivation = c.text('{table:gm/npc/motivation}');
  const motMatch = /^(Goal|Fear):\s*(.+)$/s.exec(motivation);
  const motPair = motMatch
    ? { key: motMatch[1] === 'Fear' ? 'Fears' : 'Wants', value: motMatch[2]! }
    : { key: 'Wants', value: motivation };
  const flaw = c.text('{table:gm/npc/flaw-or-prejudice}').replace(/^Flaw:\s*/, '');

  const sections: Block[] = [
    {
      type: 'paragraph',
      label: 'Appearance',
      text: `${c.text('{table:gm/npc/feature}')} · ${c.text('{table:gm/npc/markings}')}`,
    },
    {
      type: 'keyValue',
      pairs: [
        { key: 'Demeanor', value: c.text('{table:gm/npc/demeanor}') },
        { key: 'Right Now', value: c.text('{table:gm/npc/mood}') },
        motPair,
        { key: 'Flaw', value: flaw },
        { key: 'Quirk', value: c.text('{table:gm/npc/quirk}') },
        { key: 'Faith', value: c.text('{table:gm/npc/faith}') },
        { key: 'Keepsake', value: c.text('{table:gm/npc/keepsake}') },
      ],
    },
  ];
  if (racialNote) sections.push({ type: 'paragraph', label: 'Racial Note', text: racialNote });
  sections.push({ type: 'paragraph', label: 'Backstory', text: c.text('{table:gm/npc/backstory}') });
  if (c.chance(0.5)) {
    sections.push({ type: 'paragraph', label: 'If Asked About Home', text: c.text('{table:gm/npc/hometown}') });
  }

  return [
    {
      type: 'statblock',
      name,
      meta: `${race} · ${vocation}`,
      sections,
    },
  ];
}
