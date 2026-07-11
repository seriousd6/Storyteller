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
}

export type CompositeBuild = (
  tables: TableRegistry,
  seed: string,
  opts: Record<string, string>,
) => Block[];

export interface CompositeModule {
  meta: CompositeMeta;
  build: CompositeBuild;
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

  return { rng, text, int, dice, chance, among, weighted, distinct };
}

export type Composer = ReturnType<typeof makeComposer>;
