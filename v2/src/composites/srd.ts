// SRD statblock lines for rolled monsters (GM/solo audit batch E): the
// encounter, lair, and dungeon composites name creatures — "5 × Sprite —
// CR 1/4" — and until now that line dead-ended; running the fight meant
// opening a book. gm/monsters/srd (built by scripts/fetch-srd-monsters.mjs)
// carries one compact statblock line per SRD 5.1 monster, keyed by an
// n-<name> tag, and this module looks them up BY NAME — never a roll, so
// appending stats consumes no randomness and every existing seed keeps its
// result, just with the stats attached.
//
// Registry note: the quoted table id below is what gen-registries' closure
// scan picks up; the composites reach this file as a sibling import (the
// same one-hop rule hoard.ts documents).

import type { Block, TableRegistry } from '../engine/types.ts';

const SRD = 'gm/monsters/srd';

// the same slug fetch-srd-monsters.mjs stamps into the tag — change one,
// change both (smoke-srd-statblocks pins the round-trip)
const slug = (name: string): string =>
  'n-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The statblock line for a rolled monster name, or null if the SRD doesn't
 *  cover it (389 of the CR table's names are non-SRD flavor — they stay
 *  prose, which is honest: we have no licensed stats to give them). */
export function srdLine(tables: TableRegistry, name: string): string | null {
  const tag = slug(name);
  for (const e of tables.get(SRD)?.entries ?? []) {
    if (typeof e !== 'string' && (e.tags?.includes(tag) ?? false)) return e.text;
  }
  return null;
}

/** The "Statblocks" tail for a result: an attribution line (CC BY 4.0 asks
 *  for it, and as a block it travels with every copy/pin/share for free)
 *  plus one key/value row per unique SRD-covered name. Empty array when
 *  nothing matched — callers just spread it. */
export function srdSections(tables: TableRegistry, names: string[]): Block[] {
  const seen = new Set<string>();
  const pairs: { key: string; value: string }[] = [];
  for (const name of names) {
    const key = slug(name);
    if (seen.has(key)) continue;
    seen.add(key);
    const line = srdLine(tables, name);
    if (line) pairs.push({ key: name, value: line });
  }
  if (!pairs.length) return [];
  return [
    {
      type: 'paragraph',
      label: 'Statblocks',
      text: 'Table-ready stats for the creatures above — System Reference Document 5.1, CC BY 4.0.',
    },
    { type: 'keyValue', pairs },
  ];
}
