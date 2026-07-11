// The roll engine: weighted picks and template composition.
// Template tokens:
//   {table:<id>}        — roll on another table, recursively
//   {table:<id>#<tag>}  — roll restricted to entries carrying <tag>
//                         (categorical templating: "The {table:x#good} and
//                         the {table:x#evil}")
//   {count:<a>-<b>}     — a random integer in [a, b] in words ("Seven")
//   {num:<a>-<b>}       — a random integer in [a, b] as digits ("37")
//   {pick:<a>|<b>|…}    — an inline uniform choice
//   {var:<n>=table:<id>} — roll and REMEMBER the result under <n>
//   {var:<n>}           — repeat the remembered text (internal consistency:
//                         a rumor can mention the same person twice).
//                         References re-resolve only when the whole line
//                         rerolls, not on fragment rerolls.
//
// resolveTemplate returns a TREE of nodes, not a string: every token that was
// resolved randomly is a node carrying its source and its own seed. The UI
// renders each node as an individually rerollable fragment, and rerollNode()
// re-resolves just that node. flattenNodes() gives the plain text.
// Pure functions over a TableRegistry so they behave identically in the
// browser bundle, the smoke test, and build-time rendering.

import { makeRng, randomSeed, type Rng } from './rng.ts';
import type { Table, TableEntryObject, TableRegistry } from './types.ts';

const MAX_DEPTH = 16;
const TOKEN_SOURCE =
  /\{(table|count|num):([a-z0-9/#-]+)\}|\{pick:([^{}]+)\}|\{var:([a-z][a-z0-9-]*)(?:=table:([a-z0-9/#-]+))?\}/g
    .source;

export interface TextNode {
  kind: 'text';
  text: string;
}

export interface CountNode {
  kind: 'count';
  style: 'words' | 'digits';
  min: number;
  max: number;
  seed: string;
  value: number;
}

export interface PickNode {
  kind: 'pick';
  options: string[];
  seed: string;
  index: number;
}

export interface RollNode {
  kind: 'roll';
  tableId: string;
  tableTitle: string;
  filter?: string;
  seed: string;
  children: RenderNode[];
}

export type RenderNode = TextNode | CountNode | PickNode | RollNode;

/** Shared per-resolution state: {var:} bindings visible across the whole tree. */
interface ResolveContext {
  bindings: Map<string, string>;
}

function normalize(entry: Table['entries'][number]): TableEntryObject {
  return typeof entry === 'string' ? { text: entry } : entry;
}

export function pickEntry(table: Table, rng: Rng, filter?: string): TableEntryObject {
  let entries = table.entries.map(normalize);
  if (filter) {
    const tagged = entries.filter((e) => e.tags?.includes(filter));
    if (tagged.length > 0) entries = tagged; // fall back to all entries if the tag is empty
  }
  const total = entries.reduce((sum, e) => sum + (e.weight ?? 1), 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.weight ?? 1;
    if (r < 0) return e;
  }
  return entries[entries.length - 1]!;
}

const ONES = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const TEENS = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

/** 0–99 in words; enough for "The Seven Wolves" style names. */
export function countWords(n: number): string {
  if (n < 10) return ONES[n]!;
  if (n < 20) return TEENS[n - 10]!;
  const tens = TENS[Math.floor(n / 10) - 2]!;
  return n % 10 === 0 ? tens : `${tens}-${ONES[n % 10]!.toLowerCase()}`;
}

/** Deterministically derive a child seed from a parent stream. */
function nextSeed(rng: Rng): string {
  return Math.floor(rng() * 0xffffffff).toString(36);
}

function makeCountNode(style: 'words' | 'digits', min: number, max: number, seed: string): CountNode {
  const rng = makeRng(seed);
  return { kind: 'count', style, min, max, seed, value: min + Math.floor(rng() * (max - min + 1)) };
}

function makePickNode(options: string[], seed: string): PickNode {
  const rng = makeRng(seed);
  return { kind: 'pick', options, seed, index: Math.floor(rng() * options.length) };
}

function makeRollNode(
  table: Table,
  tables: TableRegistry,
  seed: string,
  depth: number,
  ctx: ResolveContext,
  filter?: string,
): RollNode {
  const rng = makeRng(seed);
  const entry = pickEntry(table, rng, filter);
  const children = resolveTemplate(entry.text, tables, nextSeed(rng), depth + 1, ctx);
  const tableTitle = filter ? `${table.title} — ${filter}` : table.title;
  return { kind: 'roll', tableId: table.id, tableTitle, filter, seed, children };
}

function splitRef(ref: string): { id: string; filter?: string } {
  const hash = ref.indexOf('#');
  return hash === -1 ? { id: ref } : { id: ref.slice(0, hash), filter: ref.slice(hash + 1) };
}

/** Resolve a template into a render tree, rolling referenced tables recursively. */
export function resolveTemplate(
  template: string,
  tables: TableRegistry,
  seed: string,
  depth = 0,
  ctx: ResolveContext = { bindings: new Map() },
): RenderNode[] {
  const rng = makeRng(seed);
  const re = new RegExp(TOKEN_SOURCE, 'g');
  const nodes: RenderNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) nodes.push({ kind: 'text', text: template.slice(last, m.index) });
    const raw = m[0];
    const kind = m[1]; // table | count | num
    const arg = m[2];
    const pickArg = m[3];
    const varName = m[4];
    const varRef = m[5];
    const childSeed = nextSeed(rng);
    if (varName !== undefined) {
      if (varRef !== undefined) {
        // {var:n=table:id} — roll, remember, and render
        const { id, filter } = splitRef(varRef);
        const table = tables.get(id);
        if (!table || depth >= MAX_DEPTH) {
          nodes.push({ kind: 'text', text: raw });
        } else {
          const node = makeRollNode(table, tables, childSeed, depth, ctx, filter);
          ctx.bindings.set(varName, flattenNodes(node.children));
          nodes.push(node);
        }
      } else {
        // {var:n} — repeat the remembered text
        const bound = ctx.bindings.get(varName);
        nodes.push({ kind: 'text', text: bound ?? raw });
      }
    } else if (pickArg !== undefined) {
      const options = pickArg.split('|').map((s) => s.trim());
      if (options.length < 2) nodes.push({ kind: 'text', text: raw });
      else nodes.push(makePickNode(options, childSeed));
    } else if (kind === 'count' || kind === 'num') {
      const [a, b] = arg!.split('-').map(Number);
      if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b) || a > b) {
        nodes.push({ kind: 'text', text: raw });
      } else {
        nodes.push(makeCountNode(kind === 'num' ? 'digits' : 'words', a, b, childSeed));
      }
    } else {
      const { id, filter } = splitRef(arg!);
      const table = tables.get(id);
      if (!table || depth >= MAX_DEPTH) {
        nodes.push({ kind: 'text', text: raw });
      } else {
        nodes.push(makeRollNode(table, tables, childSeed, depth, ctx, filter));
      }
    }
    last = m.index + raw.length;
  }
  if (last < template.length) nodes.push({ kind: 'text', text: template.slice(last) });
  return nodes;
}

/** Re-resolve a single node with a fresh seed, leaving everything around it alone. */
export function rerollNode(node: CountNode | PickNode | RollNode, tables: TableRegistry): CountNode | PickNode | RollNode {
  const seed = randomSeed();
  if (node.kind === 'count') return makeCountNode(node.style, node.min, node.max, seed);
  if (node.kind === 'pick') return makePickNode(node.options, seed);
  const table = tables.get(node.tableId);
  if (!table) return node;
  return makeRollNode(table, tables, seed, 0, { bindings: new Map() }, node.filter);
}

export function nodeText(node: RenderNode): string {
  switch (node.kind) {
    case 'text':
      return node.text;
    case 'count':
      return node.style === 'digits' ? String(node.value) : countWords(node.value);
    case 'pick':
      return node.options[node.index]!;
    case 'roll':
      return flattenNodes(node.children);
  }
}

export function flattenNodes(nodes: RenderNode[]): string {
  return nodes.map(nodeText).join('');
}

/** Convenience: resolve straight to text (smoke tests, exports). */
export function renderTemplate(template: string, tables: TableRegistry, seed: string): string {
  return flattenNodes(resolveTemplate(template, tables, seed));
}
