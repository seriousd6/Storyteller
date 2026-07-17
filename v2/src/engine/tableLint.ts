// Token linting for table entries (docs/sheets/PLAN.md §7): ONE
// implementation shared by the Node validator (scripts/validate-data.mjs)
// and the in-browser brew editor — the Earth-2026 lesson applied to lint.
// Grammar checks only; site-content policies (prose warnings, duplicate
// entries) stay in the validator script.

export interface LintIssue {
  level: 'error' | 'warn';
  message: string;
}

/** Resolver contract: return the table for an id (site or user), or
 *  undefined if it does not exist. `tags` lists the tags its entries carry
 *  (for #tag filter checks); omit to skip tag verification. */
export type TableResolver = (id: string) => { tags?: Set<string> } | undefined;

const REF_RE = /\{(?:table|var:[a-z][a-z0-9-]*=table):([a-z0-9/-]+)(?:#([a-z0-9-]+))?\}/g;
const RANGE_RE = /\{(count|num):([^{}]*)\}/g;
const PICK_RE = /\{pick:([^{}]*)\}/g;
const KIND_RE = /\{([a-z]+):/g;
const KNOWN_KINDS = new Set(['table', 'count', 'num', 'pick', 'var']);

/** Lint one entry's text. Pure; no I/O. */
export function lintEntryText(text: string, resolve: TableResolver): LintIssue[] {
  const issues: LintIssue[] = [];
  for (const m of text.matchAll(REF_RE)) {
    const target = resolve(m[1]!);
    if (!target) {
      issues.push({ level: 'error', message: `unresolved reference {table:${m[1]}}` });
    } else if (m[2] && target.tags && !target.tags.has(m[2])) {
      issues.push({ level: 'error', message: `no entries in ${m[1]} carry tag #${m[2]}` });
    }
  }
  for (const m of text.matchAll(RANGE_RE)) {
    const parts = m[2]!.split('-').map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN) || parts[0]! > parts[1]!) {
      issues.push({ level: 'error', message: `bad range token {${m[1]}:${m[2]}}` });
    }
  }
  for (const m of text.matchAll(PICK_RE)) {
    const options = m[1]!.split('|').map((s) => s.trim());
    if (options.length < 2 || options.some((o) => !o)) {
      issues.push({ level: 'error', message: `bad pick token {pick:${m[1]!.slice(0, 40)}}` });
    }
  }
  for (const m of text.matchAll(KIND_RE)) {
    if (!KNOWN_KINDS.has(m[1]!)) {
      issues.push({ level: 'error', message: `unknown token kind {${m[1]}:...}` });
    }
  }
  return issues;
}

/** Entry tags of a table, in the resolver's shape. */
export function tagSetOf(table: { entries: (string | { tags?: string[] })[] }): Set<string> {
  const tags = new Set<string>();
  for (const e of table.entries) {
    if (typeof e !== 'string') for (const t of e.tags ?? []) tags.add(t);
  }
  return tags;
}
