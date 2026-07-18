// Composite generators: one-click builders that run real logic (encounter
// budgets, hoard tiers) over the table data and emit fully-formed typed
// blocks for the Sheet Builder — not just strings.
//
// Each module in src/composites/ exports:
//   meta  — id/title/options; drives the page, the /gm/ index, and routing
//   build — (tables, seed, opts) => Block[]; pure and deterministic per seed

import { makeRng } from './rng.ts';
import { renderTemplate } from './roll.ts';
import type { Block, TableRegistry } from './types.ts';

export interface CompositeChoice {
  value: string;
  label: string;
}

export interface CompositeOption {
  id: string;
  label: string;
  choices: CompositeChoice[];
  default: string;
}

export interface CompositeMeta {
  id: string;
  title: string;
  pillar: 'gm' | 'solo' | 'writing';
  description: string;
  /** Label for the add-to-sheet button, e.g. "Add encounter". */
  addLabel: string;
  options: CompositeOption[];
  /** Show a countdown timer keyed off the given option id (writing challenge). */
  timer?: string;
  /** A short note rendered under the tool, e.g. a usage pointer. */
  note?: string;
  /** A free-text input rendered beside the dials (GM/solo audit batch C):
   *  its value flows through opts[id] like any dial, so the build weaves it
   *  into the blocks — a journal pin then records the QUESTION with the
   *  answer, and share links / the full-page bridge carry it as a param.
   *  It must never influence the rolls, only the prose. */
  ask?: { id: string; label: string; placeholder?: string };
  /** Heading for the on-page session log (per tab): each Generate files the
   *  previous result instead of destroying it — the solo loop asks dozens of
   *  questions a session. Entries store (seed, opts), so they re-derive. */
  log?: string;
  /** The tool draws on the ACTIVE world (audit batch D): the island reads the
   *  open world's people/factions/settlements into opts.cast, and the build
   *  can name them in events. The cast rides the hash like any dial, so a
   *  shared link reproduces the same named events on any device. */
  worldCast?: boolean;
}

export type CompositeBuild = (
  tables: TableRegistry,
  seed: string,
  opts: Record<string, string>,
) => Block[];

/** The world cast riding in opts.cast: `p:Name|f:Name|s:Name` entries built
 *  by the island from the active world (p person, f faction, s settlement).
 *  Parsed here so every composite reads it one way. Absent/malformed → []. */
export function parseCast(raw: string | undefined): { cat: 'p' | 'f' | 's'; name: string }[] {
  if (!raw) return [];
  const out: { cat: 'p' | 'f' | 's'; name: string }[] = [];
  for (const part of raw.split('|')) {
    const m = /^([pfs]):(.+)$/.exec(part);
    if (m) out.push({ cat: m[1] as 'p' | 'f' | 's', name: m[2]!.trim() });
  }
  return out;
}

/** How a dependent dial should look given the current selections: its choices
 *  can change (subclass depends on class), it can be disabled (a subclass locked
 *  until its level), and it can carry a short note ("Unlocks at level 3"). */
export interface OptionRefinement {
  choices?: CompositeChoice[];
  disabled?: boolean;
  note?: string;
}

export interface CompositeModule {
  meta: CompositeMeta;
  build: CompositeBuild;
  /** Recompute dependent dials whenever any selection changes. Keyed by option
   *  id → refinement. The UI (Composite.astro) calls this on load and on every
   *  change, before generating. Optional — most composites have static dials. */
  refineOptions?: (opts: Record<string, string>) => Record<string, OptionRefinement>;
}

/** Deterministic helpers bound to one build's seed. Template rolls get their
 *  own derived seeds so text() and the raw rng can interleave freely. */
export function makeComposer(tables: TableRegistry, seed: string) {
  const rng = makeRng(seed);
  let n = 0;

  const text = (template: string): string => renderTemplate(template, tables, `${seed}#${n++}`);
  const int = (min: number, max: number): number => min + Math.floor(rng() * (max - min + 1));
  const dice = (count: number, sides: number): number => {
    let total = 0;
    for (let i = 0; i < count; i++) total += 1 + Math.floor(rng() * sides);
    return total;
  };
  const chance = (p: number): boolean => rng() < p;
  const among = <T>(items: T[]): T => items[Math.floor(rng() * items.length)]!;
  const weighted = <T>(pairs: [T, number][]): T => {
    const total = pairs.reduce((sum, [, w]) => sum + w, 0);
    let r = rng() * total;
    for (const [item, w] of pairs) {
      r -= w;
      if (r < 0) return item;
    }
    return pairs[pairs.length - 1]![0];
  };
  /** text() variant that retries for a result not already in `taken`. */
  const distinct = (template: string, taken: string[], tries = 6): string => {
    let out = text(template);
    for (let i = 0; i < tries && taken.includes(out); i++) out = text(template);
    return out;
  };
  /** Draw N distinct rows from a table (draw-without-replacement), each rendered
   *  through the template engine. Keyed to a "score" the way Colostle draws a
   *  variable number of rows per exploration. Fewer than N returned if the table
   *  is smaller. Optional `tag` restricts the pool the way {table:id#tag} does —
   *  true without-replacement over a small tagged pool, where retry-based
   *  `distinct` can still repeat. */
  const drawN = (tableId: string, count: number, tag?: string): string[] => {
    const table = tables.get(tableId);
    if (!table) return [];
    const entries = tag
      ? table.entries.filter((e) => typeof e !== 'string' && e.tags?.includes(tag))
      : table.entries;
    const pool = entries.map((e) => (typeof e === 'string' ? e : e.text));
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j]!, pool[i]!];
    }
    return pool
      .slice(0, Math.max(0, Math.min(count, pool.length)))
      .map((tpl) => renderTemplate(tpl, tables, `${seed}#draw${n++}`));
  };

  return { rng, text, int, dice, chance, among, weighted, distinct, drawN };
}

export type Composer = ReturnType<typeof makeComposer>;
