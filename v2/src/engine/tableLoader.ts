// Lazy table loading for sheets (docs/sheets/PLAN.md §5). Generator pages
// ship precomputed per-tool registry closures (gen-registries.mjs); a sheet's
// tables are chosen at runtime, so this loader pulls individual ~1 KB table
// chunks on demand and follows {table:} references transitively. `overlay`
// (user brews, Phase 2) is consulted first and never fetched.

import type { Table, TableRegistry } from './types.ts';
import { referencedTables } from './roll.ts';

// NOT eager: Vite code-splits one chunk per table file.
const chunks = import.meta.glob('../data/**/*.json');

const cache = new Map<string, Table>();

function pathFor(id: string): string {
  return `../data/${id}.json`;
}

/** True if `id` names a table this build ships. */
export function knownTable(id: string): boolean {
  return cache.has(id) || pathFor(id) in chunks;
}

/** Every table id this build ships, sorted — the table picker's index.
 *  Derived from the glob keys, so it costs no chunk loads. */
export function listSiteTables(): string[] {
  const prefix = '../data/';
  return Object.keys(chunks)
    .map((p) => p.slice(prefix.length, -'.json'.length))
    .sort();
}

/** Load `ids` plus every table they transitively reference. Throws with the
 *  full list of unknown ids (a sheet naming a table that doesn't exist should
 *  say so once, loudly, not fail ref-by-ref). */
export async function loadClosure(ids: string[], overlay?: Map<string, Table>): Promise<TableRegistry> {
  const registry: TableRegistry = new Map();
  const queue = [...ids];
  const missing = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (registry.has(id) || missing.has(id)) continue;
    let table = overlay?.get(id) ?? cache.get(id);
    if (!table && id.startsWith('user/')) {
      // brews (PLAN.md §7): user tables resolve here transparently, so they
      // work everywhere site tables do. Never cached — the user may be
      // editing them between rolls.
      const { getUserTable } = await import('./brewStore.ts');
      table = await getUserTable(id);
      if (!table) {
        missing.add(id);
        continue;
      }
    } else if (!table) {
      const load = chunks[pathFor(id)];
      if (!load) {
        missing.add(id);
        continue;
      }
      table = ((await load()) as { default: Table }).default;
      cache.set(id, table);
    }
    registry.set(id, table);
    for (const entry of table.entries) {
      const text = typeof entry === 'string' ? entry : entry.text;
      for (const ref of referencedTables(text)) {
        if (!registry.has(ref)) queue.push(ref);
      }
    }
  }
  if (missing.size > 0) throw new Error(`unknown table id(s): ${[...missing].join(', ')}`);
  return registry;
}
