// Shared extraction pipeline: legacy JS arrays → schema-valid JSON tables.
// Used by extract-pilot.mjs (Tavern + Loot) and extract-phase3.mjs (the rest).

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const V1_JS = resolve(here, '../../v1/D&D/FANTASY/js');
const OUT = resolve(here, '../src/data');

export const CREDITS_COMMUNITY = [
  { source: 'r/d100', url: 'https://www.reddit.com/r/d100/' },
  { source: 'r/BehindTheTables', url: 'https://www.reddit.com/r/BehindTheTables/' },
  { source: 'r/DnDBehindTheScreen', url: 'https://www.reddit.com/r/DnDBehindTheScreen/' },
  { source: 'DnDSpeak', url: 'http://dndspeak.com/' },
];

export const stats = { dropped: 0, tables: 0 };

/** Find the nth declaration of `NAME = [` (or last if occurrence is -1) and return the array literal. */
export function extractArrayLiteral(src, varName, occurrence = 1) {
  const re = new RegExp(`(?:let|var|const)\\s+${varName}\\s*=\\s*\\[`, 'g');
  const starts = [];
  let m;
  while ((m = re.exec(src)) !== null) starts.push(m.index + m[0].length - 1);
  const start = occurrence === -1 ? starts[starts.length - 1] : starts[occurrence - 1];
  if (start === undefined) throw new Error(`let ${varName} (occurrence ${occurrence}) not found`);
  return src.slice(start, matchBracket(src, start) + 1);
}

/** Find the nth declaration of `NAME = {` (or last if -1) and return the object literal. */
export function extractObjectLiteral(src, varName, occurrence = 1) {
  const re = new RegExp(`(?:let|var|const)\\s+${varName}\\s*=\\s*\\{`, 'g');
  const starts = [];
  let m;
  while ((m = re.exec(src)) !== null) starts.push(m.index + m[0].length - 1);
  const start = occurrence === -1 ? starts[starts.length - 1] : starts[occurrence - 1];
  if (start === undefined) throw new Error(`let ${varName} = { (occurrence ${occurrence}) not found`);
  return src.slice(start, matchBrace(src, start) + 1);
}

/** Given index of '{', return index of its matching '}' (string/template/expr aware). */
export function matchBrace(src, start) {
  let depth = 0;
  // stack frames: 'code' | "'" | '"' | '`' | {expr depth}
  const ctx = [{ type: 'code' }];
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    const top = ctx[ctx.length - 1];
    if (top.type === 'code' || top.type === 'expr') {
      if (c === '/' && src[i + 1] === '/') {
        i = src.indexOf('\n', i);
        if (i === -1) break;
      } else if (c === '/' && src[i + 1] === '*') {
        i = src.indexOf('*/', i) + 1;
        if (i === 0) break;
      } else if (c === "'" || c === '"' || c === '`') ctx.push({ type: c });
      else if (c === '{') {
        if (top.type === 'expr') top.depth += 1;
        else depth += 1;
      } else if (c === '}') {
        if (top.type === 'expr') {
          if (top.depth > 0) top.depth -= 1;
          else ctx.pop();
        } else {
          depth -= 1;
          if (depth === 0) return i;
        }
      }
    } else if (top.type === '`') {
      if (c === '\\') i += 1;
      else if (c === '`') ctx.pop();
      else if (c === '$' && src[i + 1] === '{') {
        ctx.push({ type: 'expr', depth: 0 });
        i += 1;
      }
    } else {
      if (c === '\\') i += 1;
      else if (c === top.type) ctx.pop();
    }
  }
  throw new Error('Unbalanced braces');
}

const LOOSE_MARKER = '\u0000';

/** Evaluate a literal with a permissive scope: known helpers get useful stubs,
 *  every other identifier becomes a function returning a marker so entries
 *  containing junk calls can be detected and dropped instead of crashing. */
export function evalLoose(literal) {
  const scope = new Proxy(
    {},
    {
      has: () => true,
      get: (_t, k) => {
        if (k === Symbol.unscopables) return undefined;
        if (k === 'searchArray') return (a) => (Array.isArray(a) ? a[0] : LOOSE_MARKER);
        // rollDice must NOT freeze to a number: rewriteDice already converted
        // every supported form to {num:a-b} BEFORE eval, so a live rollDice
        // here is a compound die none of its patterns matched — a value that
        // would ship as frozen prose ("has eaten 430 bodies", §10.11). The
        // marker poisons the entry (string interp carries it; arithmetic makes
        // NaN, which cleanStrings also drops) so it's dropped and LOGGED for a
        // per-case replace instead of silently baked.
        if (k === 'rollDice') return () => LOOSE_MARKER;
        if (k === 'toWords' || k === 'toWordsUc') return (n) => String(n);
        return () => LOOSE_MARKER;
      },
    },
  );
  // eslint-disable-next-line no-new-func
  return new Function('scope', `with (scope) { return (${literal}); }`)(scope);
}

export function hasLooseMarker(value) {
  return typeof value === 'string' && value.includes(LOOSE_MARKER);
}

/** Tag-safe slug for category names ("Music and Song" → "music-and-song"). */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Given index of '[', return index of its matching ']' (string/template aware). */
export function matchBracket(src, start) {
  let depth = 0;
  const ctx = ['code'];
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    const top = ctx[ctx.length - 1];
    if (top === 'code') {
      if (c === '/' && src[i + 1] === '/') {
        i = src.indexOf('\n', i);
        if (i === -1) break;
      } else if (c === '/' && src[i + 1] === '*') {
        i = src.indexOf('*/', i) + 1;
        if (i === 0) break;
      } else if (c === '[') depth += 1;
      else if (c === ']') {
        depth -= 1;
        if (depth === 0) return i;
      } else if (c === "'" || c === '"' || c === '`') ctx.push(c);
      else if (c === '}' && ctx.length > 1) ctx.pop();
    } else if (top === '`') {
      if (c === '\\') i += 1;
      else if (c === '`') ctx.pop();
      else if (c === '$' && src[i + 1] === '{') {
        ctx.push('code');
        i += 1;
      }
    } else {
      if (c === '\\') i += 1;
      else if (c === top) ctx.pop();
    }
  }
  throw new Error('Unbalanced brackets');
}

/** Convert legacy inline choices — `${searchArray(["a","b"])}` — into {pick:a|b} tokens. */
export function inlinePicks(literal) {
  const MARK = '${searchArray([';
  let out = '';
  let i = 0;
  for (;;) {
    const idx = literal.indexOf(MARK, i);
    if (idx === -1) {
      out += literal.slice(i);
      return out;
    }
    out += literal.slice(i, idx);
    const arrStart = idx + MARK.length - 1;
    let arrEnd;
    try {
      arrEnd = matchBracket(literal, arrStart);
    } catch {
      arrEnd = -1;
    }
    let options = null;
    if (arrEnd !== -1 && literal.slice(arrEnd + 1, arrEnd + 3) === ')}') {
      try {
        // eslint-disable-next-line no-eval
        const arr = (0, eval)(`(${literal.slice(arrStart, arrEnd + 1)})`);
        if (Array.isArray(arr) && arr.length >= 2 && arr.every((x) => typeof x === 'string' && !/[{}|]/.test(x))) {
          options = arr.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
        }
      } catch {
        options = null;
      }
    }
    if (options) {
      out += `{pick:${options.join('|')}}`;
      i = arrEnd + 3;
    } else {
      out += literal.slice(idx, idx + MARK.length);
      i = idx + MARK.length;
    }
  }
}

const articleFor = (word) => (/^[aeiou]/i.test(word.trim()) ? 'an' : 'a');

/** Resolve legacy "a(n)" markers: per-option before a pick, by first letter otherwise. */
export function fixArticles(text) {
  return text
    .replace(/\b([Aa])\(n\)\s+\{pick:([^{}]+)\}/g, (_, a, opts) => {
      const cap = a === 'A';
      const options = opts.split('|').map((o) => {
        const art = articleFor(o);
        return `${cap ? art[0].toUpperCase() + art.slice(1) : art} ${o.trim()}`;
      });
      return `{pick:${options.join('|')}}`;
    })
    .replace(/\b([Aa])\(n\)\s+([a-zA-Z])/g, (_, a, ch) => {
      const an = /[aeiou]/i.test(ch);
      return `${a === 'A' ? (an ? 'An' : 'A') : an ? 'an' : 'a'} ${ch}`;
    });
}

// "Roll on the X table" instructions become live rolls — the reader should see
// the result, not homework. The validator warns whenever a new one slips in.
export const PHRASE_REWRITES = [
  [/,? ?roll(?:s)? on the Wild Magic Surge table to create a random magical effect\.?/gi, ', a wild magic surge occurs: {table:gm/magic/wild-surge}'],
  [/,? ?roll(?:s)? on (?:the )?wild magic table(?: \(this is in addition to any[^)]*\))?\.?/gi, ', a wild magic surge occurs: {table:gm/magic/wild-surge}'],
];

/** Convert legacy inline dice arithmetic into {num:a-b} tokens (rollDice(n) = 0..n-1). */
export function rewriteDice(text) {
  return text
    .replace(/\$\{\s*(\d+)\s*\+\s*rollDice\((\d+)\)\s*\}/g, (_, b, a) => `{num:${+b}-${+b + +a - 1}}`)
    .replace(/\$\{\s*rollDice\((\d+)\)\s*\+\s*(\d+)\s*\}/g, (_, a, b) => `{num:${+b}-${+b + +a - 1}}`)
    .replace(/\$\{\s*rollDice\((\d+)\)\s*\*\s*(\d+)\s*\+\s*(\d+)\s*\}/g, (_, a, b, c) => `{num:${+c}-${(+a - 1) * +b + +c}}`)
    .replace(/\$\{\s*rollDice\((\d+)\)\s*\*\s*(\d+)\s*\}/g, (_, a, b) => `{num:0-${(+a - 1) * +b}}`)
    .replace(/\$\{\s*rollDice\((\d+)\)\s*\}/g, (_, a) => `{num:0-${+a - 1}}`);
}

export function rewritePhrases(text) {
  let out = text;
  for (const [re, to] of PHRASE_REWRITES) out = out.replace(re, to);
  return out;
}

/** Attach tags to matching entries so templates can roll categorically ({table:id#tag}). */
export function applyTags(entries, tagMap) {
  const lookup = new Map();
  for (const [tag, names] of Object.entries(tagMap)) {
    for (const name of names) {
      if (!lookup.has(name)) lookup.set(name, []);
      lookup.get(name).push(tag);
    }
  }
  return entries.map((e) => {
    const text = typeof e === 'string' ? e : e.text;
    const tags = lookup.get(text);
    return tags ? { ...(typeof e === 'string' ? { text } : e), tags } : e;
  });
}

export function evalEntries(literal, replace = {}, label = '?') {
  let text = literal;
  for (const [from, to] of Object.entries(replace)) {
    text = text.split(from).join(to);
  }
  text = fixArticles(rewriteDice(inlinePicks(text)));
  // Stubs so stray inline expressions (dice math, nested inline arrays) resolve
  // to static values instead of crashing; usage is reported for review.
  let stubCalls = 0;
  const rollDice = (n) => {
    stubCalls += 1;
    return Math.floor(n / 2);
  };
  const searchArray = (a) => {
    stubCalls += 1;
    return Array.isArray(a) ? a[0] : String(a);
  };
  const toWords = (n) => {
    stubCalls += 1;
    return String(n);
  };
  const arr = new Function('rollDice', 'searchArray', 'toWords', `return (${text})`)(rollDice, searchArray, toWords);
  // FATAL, not a warning: a static resolution here means an expression none of
  // rewriteDice's patterns matched froze to one value forever — the exact
  // "invariant only in a console.log" failure that shipped the 430-body sword
  // (§10.11). Add an explicit replace for the expression and re-run.
  if (stubCalls > 0) throw new Error(`${label}: ${stubCalls} inline expression(s) would freeze to a static value — add an explicit replace`);
  if (!Array.isArray(arr)) throw new Error(`${label}: not an array`);
  const clean = [];
  for (const e of arr) {
    if (typeof e !== 'string') {
      stats.dropped += 1;
      console.warn(`  ! ${label}: dropped non-string entry (${String(e).slice(0, 40)})`);
      continue;
    }
    const t = rewritePhrases(e.replace(/\s+/g, ' ').trim());
    if (!t) continue;
    if (t.includes('${')) {
      stats.dropped += 1;
      console.warn(`  ! ${label}: dropped unresolved entry: ${t.slice(0, 60)}...`);
      continue;
    }
    clean.push(t);
  }
  return clean;
}

/** Shared post-eval cleanup: trim, rewrite phrases, drop junk/marker/unresolved entries. */
export function cleanStrings(arr, label) {
  const clean = [];
  for (const e of arr) {
    // "NaN" is what marker-poisoned dice arithmetic interpolates to — junk,
    // never legitimate table prose
    if (typeof e !== 'string' || hasLooseMarker(e) || /\bNaN\b/.test(e)) {
      stats.dropped += 1;
      console.warn(`  ! ${label}: dropped entry (${String(e).replace(/\u0000/g, '·').slice(0, 40)})`);
      continue;
    }
    const t = rewritePhrases(e.replace(/\s+/g, ' ').trim());
    if (!t) continue;
    if (t.includes('${')) {
      stats.dropped += 1;
      console.warn(`  ! ${label}: dropped unresolved entry: ${t.slice(0, 60)}...`);
      continue;
    }
    clean.push(t);
  }
  return clean;
}

/** evalEntries variant using the permissive scope — for legacy arrays containing
 *  stray function calls or unknown identifiers. */
export function evalEntriesLoose(literal, replace = {}, label = '?') {
  let text = literal;
  for (const [from, to] of Object.entries(replace)) {
    text = text.split(from).join(to);
  }
  text = fixArticles(rewriteDice(inlinePicks(text)));
  const arr = evalLoose(text);
  if (!Array.isArray(arr)) throw new Error(`${label}: not an array`);
  return cleanStrings(arr, label);
}

export function writeTable({ id, title, description, tags = ['fantasy'], credits = CREDITS_COMMUNITY, entries }) {
  if (!entries.length) throw new Error(`${id}: no entries`);
  const path = join(OUT, ...`${id}.json`.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  const table = { id, title, pillar: id.split('/')[0], tags, credits, entries };
  if (description) table.description = description;
  writeFileSync(path, JSON.stringify(table, null, 2) + '\n');
  stats.tables += 1;
  console.log(`  ✓ ${id} (${entries.length} entries)`);
}
