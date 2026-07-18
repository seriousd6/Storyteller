// Homebrewery import smoke (PLAN.md §21.5/§19): the paste-a-brew heuristics,
// pinned. Run: node scripts/smoke-homebrew.mjs

import { importHomebrew, importedName } from '../src/engine/homebrewImport.ts';

let failed = 0;
const ok = (cond, name) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) failed += 1;
};

const BREW = `<style>.phb { color: red }</style>
# The Sunken Crypt
A dungeon for **4–6** adventurers of 3rd level.

## Approach
The marsh path is treacherous.

#### Random Encounters
| d6 | Encounter |
|:--:|-----------|
| 1  | 2d4 stirges |
| 2  | A *will-o-wisp* |

**Smell.** Rot and brine.
**Sound.** Dripping water.
**Light.** None past the door.

##### Supplies
- Rope, 50 ft.
- 3 torches
* A crowbar

1. Enter the crypt
2. Find the font

\\column

![map](https://example.com/map.png)

> ## Bog Ghast
> *Medium undead, neutral evil*
>
> **AC.** 13
> **HP.** 22
>
> Its breath reeks of the marsh.

\\page
## Lower Level
{{monster,frame
The frame chrome should vanish.
}}
`;

const { blocks, skipped } = importHomebrew(BREW);
const types = blocks.map((b) => b.type);

ok(importedName(blocks) === 'The Sunken Crypt', `sheet name from first heading (${importedName(blocks)})`);
ok(types[0] === 'title' && blocks[0].text === 'The Sunken Crypt', 'h1 → title');
ok(types[1] === 'paragraph' && blocks[1].text.includes('4–6 adventurers'), 'prose → paragraph, bold stripped');
ok(blocks.some((b) => b.type === 'title' && b.text === 'Approach'), 'h2 → title');

const table = blocks.find((b) => b.type === 'table');
ok(!!table, 'markdown table → table block');
ok(table?.label === 'Random Encounters', 'h4 labels the table, not a huge title');
ok(table?.columns.length === 2 && table?.rows.length === 2, `table shape 2×2 (${table?.columns.length}×${table?.rows.length})`);
ok(table?.rows[1]?.[1] === 'A will-o-wisp', 'cell emphasis stripped');

const kv = blocks.find((b) => b.type === 'keyValue');
ok(!!kv && kv.pairs.length === 3, `run of **Label.** lines → one keyValue (${kv?.pairs.length} pairs)`);
ok(kv?.pairs[0]?.key === 'Smell' && kv?.pairs[0]?.value === 'Rot and brine.', 'keyValue pair parsed');

const lists = blocks.filter((b) => b.type === 'list');
ok(lists.length === 2, `two list runs (${lists.length})`);
ok(lists[0]?.label === 'Supplies' && lists[0]?.items.length === 3, 'h5 labels the list; -/* mix in one run');
ok(lists[1]?.ordered === true && lists[1]?.items[0] === 'Enter the crypt', 'numbered list → ordered');

const sb = blocks.find((b) => b.type === 'statblock');
ok(!!sb && sb.name === 'Bog Ghast', 'quote-block statblock: name');
ok(sb?.meta === 'Medium undead, neutral evil', 'statblock meta from italic line');
ok(sb?.sections.some((s) => s.type === 'keyValue'), 'statblock AC/HP → keyValue section');
ok(sb?.sections.some((s) => s.type === 'paragraph' && s.text.includes('reeks')), 'statblock prose section');

ok(types.includes('pageBreak'), '\\page → pageBreak');
ok(blocks.some((b) => b.type === 'paragraph' && b.text.includes('frame chrome should vanish')), '{{frame}} chrome stripped, content kept');
ok(!JSON.stringify(blocks).includes('example.com'), 'image dropped from blocks');
ok(skipped.some((s) => s.includes('images')), 'image drop is reported, not silent');
ok(skipped.some((s) => s.includes('column')), '\\column drop is reported');
ok(skipped.some((s) => s.includes('style')), 'style block drop is reported');

// empty and junk-only input fail soft
ok(importHomebrew('').blocks.length === 0, 'empty input → no blocks');
ok(importHomebrew('<div></div>').blocks.length === 0, 'junk-only input → no blocks');

if (failed > 0) {
  console.error(`smoke-homebrew: ${failed} FAILED`);
  process.exit(1);
}
console.log('smoke-homebrew: all green');
