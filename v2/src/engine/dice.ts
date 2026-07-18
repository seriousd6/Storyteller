// Dice math (docs/sheets/PLAN.md §4). Pure module, no DOM. THE GRAMMAR IS
// FROZEN: these tokens live inside user sheet text forever, so extending it
// is fine but changing meaning is a data migration. Grammar:
//   terms joined by + or -   : 2d6+1d4-1
//   NdM                      : N dice of M sides (N omitted = 1, e.g. d20)
//   keep/drop                : khX klX dhX dlX after NdM — 4d6dl1, 2d20kh1
//   integers                 : flat modifiers
//   $name                    : a sheet variable (statGrid/tracker exposure,
//                              Phase 2) — numbers only, flat namespace
// Seeded via engine/rng so every roll is reproducible; the dice stage
// animates TOWARD a result computed here, never the other way around.

import { makeRng } from './rng.ts';

export interface KeepRule {
  mode: 'kh' | 'kl' | 'dh' | 'dl';
  n: number;
}

export interface DiceTerm {
  kind: 'dice';
  sign: 1 | -1;
  count: number;
  sides: number;
  keep?: KeepRule;
}

export interface NumTerm {
  kind: 'num';
  sign: 1 | -1;
  value: number;
}

export interface VarTerm {
  kind: 'var';
  sign: 1 | -1;
  name: string;
}

export type Term = DiceTerm | NumTerm | VarTerm;

export interface DiceAst {
  formula: string;
  terms: Term[];
}

export interface DieResult {
  sides: number;
  value: number;
  /** false when a keep/drop rule discarded this die */
  kept: boolean;
}

export interface RollResult {
  formula: string;
  seed: string;
  total: number;
  dice: DieResult[];
  /** e.g. "4d6dl1 [5, 4, 3, (1)] + 2 = 14" — dropped dice in parens */
  breakdown: string;
}

const MAX_COUNT = 100;
const MAX_SIDES = 1000;

const TERM_RE = /([+-]?)\s*(?:(\d*)[dD](\d+)(?:(kh|kl|dh|dl|KH|KL|DH|DL)(\d+))?|(\d+)|\$([a-zA-Z][a-zA-Z0-9_.]*))\s*/y;

/** Parse a formula or throw an Error with a human-readable message. */
export function parse(formula: string): DiceAst {
  const src = formula.trim();
  if (!src) throw new Error('empty dice formula');
  const terms: Term[] = [];
  TERM_RE.lastIndex = 0;
  let at = 0;
  let first = true;
  while (at < src.length) {
    TERM_RE.lastIndex = at;
    const m = TERM_RE.exec(src);
    if (!m || m.index !== at) throw new Error(`cannot read dice formula at "${src.slice(at, at + 12)}"`);
    const sign: 1 | -1 = m[1] === '-' ? -1 : 1;
    if (!first && m[1] === '') throw new Error(`missing + or - before "${src.slice(at, at + 12)}"`);
    if (m[3] !== undefined) {
      const count = m[2] === '' || m[2] === undefined ? 1 : parseInt(m[2], 10);
      const sides = parseInt(m[3], 10);
      if (count < 1 || count > MAX_COUNT) throw new Error(`dice count must be 1–${MAX_COUNT} (got ${count})`);
      if (sides < 2 || sides > MAX_SIDES) throw new Error(`die sides must be 2–${MAX_SIDES} (got ${sides})`);
      let keep: KeepRule | undefined;
      if (m[4] !== undefined) {
        const mode = m[4].toLowerCase() as KeepRule['mode'];
        const n = parseInt(m[5]!, 10);
        if (n < 1 || n > count) throw new Error(`${mode}${n} is out of range for ${count} dice`);
        if ((mode === 'dh' || mode === 'dl') && n >= count) throw new Error(`${mode}${n} would drop every die`);
        keep = { mode, n };
      }
      terms.push({ kind: 'dice', sign, count, sides, keep });
    } else if (m[6] !== undefined) {
      terms.push({ kind: 'num', sign, value: parseInt(m[6], 10) });
    } else {
      terms.push({ kind: 'var', sign, name: m[7]!.toLowerCase() });
    }
    at = TERM_RE.lastIndex;
    first = false;
  }
  if (terms.length === 0) throw new Error('empty dice formula');
  return { formula: src, terms };
}

/** True if the string parses as a dice formula (used by inline markup). */
export function looksLikeDice(text: string): boolean {
  try {
    // a bare integer is a valid formula but a useless chip — require dice or vars
    return parse(text).terms.some((t) => t.kind !== 'num');
  } catch {
    return false;
  }
}

function resolveVar(name: string, vars: Record<string, number> | undefined): number {
  const v = vars?.[name];
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`unknown variable $${name}`);
  return v;
}

/** Roll a formula (or pre-parsed AST) with a seed. Deterministic: same seed,
 *  same vars → same result, always. */
export function roll(formula: string | DiceAst, seed: string, vars?: Record<string, number>): RollResult {
  const ast = typeof formula === 'string' ? parse(formula) : formula;
  const rng = makeRng(`dice:${seed}:${ast.formula}`);
  const dice: DieResult[] = [];
  let total = 0;
  const parts: string[] = [];
  for (const term of ast.terms) {
    const signGlyph = parts.length === 0 ? (term.sign < 0 ? '-' : '') : term.sign < 0 ? ' - ' : ' + ';
    if (term.kind === 'num') {
      total += term.sign * term.value;
      parts.push(`${signGlyph}${term.value}`);
    } else if (term.kind === 'var') {
      const v = resolveVar(term.name, vars);
      const signed = term.sign * v;
      total += signed;
      // human-readable: "+ 3 (str.mod)", never "$str.mod(3)" — the log and
      // tooltips face players. Fold a negative value into the sign glyph.
      const glyph = parts.length === 0 ? (signed < 0 ? '-' : '') : signed < 0 ? ' - ' : ' + ';
      parts.push(`${glyph}${Math.abs(signed)} (${term.name})`);
    } else {
      const rolls: DieResult[] = [];
      for (let i = 0; i < term.count; i++) {
        rolls.push({ sides: term.sides, value: 1 + Math.floor(rng() * term.sides), kept: true });
      }
      if (term.keep) {
        // rank dice by value; mark the discarded ones kept:false
        const order = rolls
          .map((d, i) => ({ d, i }))
          .sort((a, b) => a.d.value - b.d.value || a.i - b.i); // ascending, stable
        const { mode, n } = term.keep;
        const drop =
          mode === 'kh' ? order.slice(0, term.count - n)
          : mode === 'kl' ? order.slice(n)
          : mode === 'dh' ? order.slice(term.count - n)
          : order.slice(0, n); // dl
        for (const { d } of drop) d.kept = false;
      }
      const sum = rolls.reduce((s, d) => s + (d.kept ? d.value : 0), 0);
      total += term.sign * sum;
      dice.push(...rolls);
      const keepTxt = term.keep ? term.keep.mode + term.keep.n : '';
      const list = rolls.map((d) => (d.kept ? String(d.value) : `(${d.value})`)).join(', ');
      parts.push(`${signGlyph}${term.count}d${term.sides}${keepTxt} [${list}]`);
    }
  }
  return { formula: ast.formula, seed, total, dice, breakdown: `${parts.join('')} = ${total}` };
}

function bound(ast: DiceAst, vars: Record<string, number> | undefined, perDie: (t: DiceTerm) => number): number {
  let total = 0;
  for (const term of ast.terms) {
    if (term.kind === 'num') total += term.sign * term.value;
    else if (term.kind === 'var') total += term.sign * resolveVar(term.name, vars);
    else {
      const keptCount = term.keep
        ? term.keep.mode.startsWith('k') ? term.keep.n : term.count - term.keep.n
        : term.count;
      // a negative dice term flips which bound this contributes to; callers
      // pair minOf/maxOf accordingly (rare in practice — negative dice are odd)
      total += term.sign * keptCount * perDie(term);
    }
  }
  return total;
}

export function minOf(formula: string | DiceAst, vars?: Record<string, number>): number {
  const ast = typeof formula === 'string' ? parse(formula) : formula;
  return bound(ast, vars, () => 1);
}

export function maxOf(formula: string | DiceAst, vars?: Record<string, number>): number {
  const ast = typeof formula === 'string' ? parse(formula) : formula;
  return bound(ast, vars, (t) => t.sides);
}

/** Expected value. Exact for plain terms; keep/drop terms are estimated by a
 *  deterministic 2,000-roll sample (plenty for tooltips and sanity checks). */
export function meanOf(formula: string | DiceAst, vars?: Record<string, number>): number {
  const ast = typeof formula === 'string' ? parse(formula) : formula;
  if (!ast.terms.some((t) => t.kind === 'dice' && t.keep)) {
    let total = 0;
    for (const term of ast.terms) {
      if (term.kind === 'num') total += term.sign * term.value;
      else if (term.kind === 'var') total += term.sign * resolveVar(term.name, vars);
      else total += term.sign * (term.count * (term.sides + 1)) / 2;
    }
    return total;
  }
  let sum = 0;
  const SAMPLES = 2000;
  for (let i = 0; i < SAMPLES; i++) sum += roll(ast, `mean:${i}`, vars).total;
  return sum / SAMPLES;
}
