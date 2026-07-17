// Run a composite one-click builder as a Sheet Builder document
// (GENERATORS-AS-ONEPAGERS.md §3.2). A composite runs real logic (encounter
// budgets, hoard tiers, shop draw-without-replacement) and exposes option dials
// — so, unlike a slot generator, it can't be a static template whose tokens the
// gallery fills. Instead we build it the SAME way its own page does: load the
// tool's registry, call build(tables, seed, opts). One code path, no re-implemented
// logic, and the dials survive as opts carried in the deep-link URL.
//
// Modules are globbed LAZILY (no `eager`): the /sheet/ bundle must not pull in
// all ~24 composites' code, so a deep link loads only the one composite it opens.
// (The gallery listing of every composite — which needs each meta up front —
// waits on a precomputed catalog to keep that promise; see the design doc §5.)

import type { Block, Table, TableRegistry } from './types.ts';
import type { CompositeModule } from './composite.ts';

const modules = import.meta.glob<CompositeModule>('../composites/*.ts');
const registries = import.meta.glob<Record<string, Table>>('../generators/registries/*.json', {
  import: 'default',
});

/** The composite file/registry key for an id like `gm/hoard` → `hoard`. */
const toolOf = (id: string) => id.split('/')[1] ?? '';

/** True if `id` (pillar/tool) names a composite one-click builder — so the
 *  deep link builds it rather than filling a template. Synchronous: a lazy glob
 *  still exposes its keys without loading anything. */
export function isComposite(id: string): boolean {
  return !!modules[`../composites/${toolOf(id)}.ts`];
}

export interface CompositeRun {
  title: string;
  blocks: Block[];
}

/** Build a composite as blocks — the same logic and dials its own page runs.
 *  Unset dials fall back to their defaults (exactly as the page's selects do).
 *  Returns null if the id has no module/registry (never happens for a real
 *  composite id; guards a stale or hand-typed URL). */
export async function runComposite(
  id: string,
  seed: string,
  opts: Record<string, string>,
): Promise<CompositeRun | null> {
  const tool = toolOf(id);
  const loadModule = modules[`../composites/${tool}.ts`];
  const loadRegistry = registries[`../generators/registries/${tool}.json`];
  if (!loadModule || !loadRegistry) return null;

  const [mod, registry] = await Promise.all([loadModule(), loadRegistry()]);
  const tables: TableRegistry = new Map(Object.entries(registry));
  const resolved: Record<string, string> = {};
  for (const o of mod.meta.options) resolved[o.id] = opts[o.id] ?? o.default;

  return { title: mod.meta.title, blocks: mod.build(tables, seed, resolved) };
}
