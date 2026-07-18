// Homebrewery markdown import (PLAN.md §21.5): years of brews become living
// blocks. Heuristic BY DESIGN — 80% fidelity you then edit beats a parser
// that refuses. Pure module: no DOM, no stores; smoke-tested in Node.
//
// Recognized: #/##/### → title · ####–###### → a label for what follows ·
// markdown tables → table · consecutive **Label.** value lines → keyValue ·
// -/* and 1. lists → list · > ## Name quote-blocks → statblock ·
// \page → pageBreak · plain prose → paragraph.
// Dropped, honestly (returned in `skipped`): images, \column, style/HTML
// chrome, {{...}} frame syntax.

import type { Block } from './types.ts';

export interface HomebrewImport {
  blocks: Block[];
  /** What could not become a block — shown to the user, never silent. */
  skipped: string[];
}

/** Markdown emphasis/link markers become plain text — sheet blocks hold
 *  prose, and literal asterisks read as noise, not bold. */
function cleanInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

const BOLD_LEAD = /^\*\*([^*]+?)[.:]?\*\*[.:]?\s+(\S.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const ORDERED_ITEM = /^\s*\d+[.)]\s+/;
const TABLE_SEP = /^\|?[\s:|-]+\|?$/;

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => cleanInline(c));
}

export function importHomebrew(md: string): HomebrewImport {
  const skipped: string[] = [];
  const noted = new Set<string>();
  const note = (what: string) => {
    if (!noted.has(what)) {
      noted.add(what);
      skipped.push(what);
    }
  };

  let text = md.replace(/\r\n?/g, '\n');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, () => {
    note('style blocks');
    return '';
  });
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  function parseLines(lines: string[]): Block[] {
    const blocks: Block[] = [];
    let para: string[] = [];
    let pendingLabel: string | undefined;

    const takeLabel = (): string | undefined => {
      const l = pendingLabel;
      pendingLabel = undefined;
      return l;
    };

    const flushPara = () => {
      const t = cleanInline(para.join(' '));
      para = [];
      if (!t) return;
      const label = takeLabel();
      blocks.push({ type: 'paragraph', text: t, ...(label ? { label } : {}) });
    };

    for (let i = 0; i < lines.length; i++) {
      const raw = lines[i]!;
      const line = raw.trimEnd();
      const t = line.trim();

      if (t === '') {
        flushPara();
        continue;
      }
      if (t === '\\page') {
        flushPara();
        blocks.push({ type: 'pageBreak' });
        continue;
      }
      if (t === '\\column' || t === '\\columnbreak') {
        flushPara();
        note('\\column breaks (column layout is not imported — wrap blocks with ＋ Columns instead)');
        continue;
      }
      // v3 frame chrome: {{monster,frame  /  }} on their own lines
      if (/^\{\{/.test(t) || t === '}}') {
        flushPara();
        continue;
      }
      if (/^<\/?\w/.test(t)) {
        flushPara();
        note('HTML tags');
        continue;
      }
      if (/^!\[[^\]]*\]\([^)]*\)/.test(t)) {
        flushPara();
        note('images (upload them onto an ＋ Image block after import)');
        continue;
      }
      if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
        flushPara();
        continue;
      }

      const h = HEADING.exec(t);
      if (h) {
        flushPara();
        const txt = cleanInline(h[2]!);
        if (!txt) continue;
        if (h[1]!.length <= 3) blocks.push({ type: 'title', text: txt });
        else pendingLabel = txt; // #### and below label the thing that follows
        continue;
      }

      // table: a | row whose NEXT line is the |---|---| separator
      if (t.startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!.trim()) && lines[i + 1]!.includes('-')) {
        flushPara();
        const columns = splitRow(t);
        i += 2;
        const rows: string[][] = [];
        while (i < lines.length && lines[i]!.trim().startsWith('|')) {
          const cells = splitRow(lines[i]!.trim());
          while (cells.length < columns.length) cells.push('');
          rows.push(cells.slice(0, columns.length));
          i++;
        }
        i--;
        const label = takeLabel();
        blocks.push({ type: 'table', columns, rows, ...(label ? { label } : {}) });
        continue;
      }

      // blockquote run — "> ## Name" opens the classic statblock convention
      if (/^>\s?/.test(t)) {
        flushPara();
        const quote: string[] = [];
        while (i < lines.length && /^\s*>/.test(lines[i]!)) {
          quote.push(lines[i]!.replace(/^\s*>\s?/, ''));
          i++;
        }
        i--;
        const headIdx = quote.findIndex((q) => q.trim() !== '');
        const head = headIdx >= 0 ? /^#{2,3}\s+(.*)$/.exec(quote[headIdx]!.trim()) : null;
        if (head) {
          const name = cleanInline(head[1]!);
          let rest = quote.slice(headIdx + 1);
          let meta: string | undefined;
          const metaIdx = rest.findIndex((q) => q.trim() !== '');
          const metaLine = metaIdx >= 0 ? rest[metaIdx]!.trim() : '';
          if (/^\*[^*].*\*$/.test(metaLine)) {
            meta = cleanInline(metaLine);
            rest = rest.slice(metaIdx + 1);
          }
          blocks.push({ type: 'statblock', name, ...(meta ? { meta } : {}), sections: parseLines(rest) });
        } else {
          blocks.push(...parseLines(quote)); // a plain quote is just prose
        }
        continue;
      }

      if (LIST_ITEM.test(t)) {
        flushPara();
        const ordered = ORDERED_ITEM.test(t);
        const items: string[] = [];
        while (i < lines.length && LIST_ITEM.test(lines[i]!.trim())) {
          items.push(cleanInline(LIST_ITEM.exec(lines[i]!.trim())![1]!));
          i++;
        }
        i--;
        const label = takeLabel();
        blocks.push({ type: 'list', items, ...(ordered ? { ordered: true } : {}), ...(label ? { label } : {}) });
        continue;
      }

      // bold-lead lines: a RUN of short ones is a keyValue block (AC, Speed…);
      // a lone or long one is a labeled paragraph
      if (BOLD_LEAD.test(t)) {
        flushPara();
        const pairs: { key: string; value: string }[] = [];
        while (i < lines.length) {
          const m = BOLD_LEAD.exec(lines[i]!.trim());
          if (!m) break;
          pairs.push({ key: cleanInline(m[1]!), value: cleanInline(m[2]!) });
          i++;
        }
        i--;
        if (pairs.length >= 2 && pairs.every((p) => p.value.length <= 120)) {
          blocks.push({ type: 'keyValue', pairs });
        } else {
          for (const p of pairs) blocks.push({ type: 'paragraph', label: p.key, text: p.value });
        }
        continue;
      }

      para.push(line);
    }
    flushPara();
    return blocks;
  }

  const blocks = parseLines(text.split('\n'));
  return { blocks, skipped };
}

/** A name for the imported sheet: its first heading, else a fallback. */
export function importedName(blocks: Block[]): string {
  const title = blocks.find((b) => b.type === 'title');
  return title && title.type === 'title' && title.text ? title.text : 'Imported brew';
}
