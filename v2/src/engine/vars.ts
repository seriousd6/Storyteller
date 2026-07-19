// The sheet var scope (docs/sheets/PLAN.md §4/§6): statGrid and tracker
// blocks EXPOSE numbers; dice formulas CONSUME them as $name. Flat namespace,
// numbers only, one level — this is deliberately not a spreadsheet.
//
// Exposure rules:
//   statGrid stat "STR" 16            → $str = 16
//     …with computeMods               → $str.mod = +3   (floor((v-10)/2))
//   tracker "Hit Points" 7/10        → $hit_points = 7, $hit_points.max = 10
// Later blocks shadow earlier ones on a slug collision (document order wins
// backwards — the LAST definition is what a formula sees, matching reading
// order expectations: the sheet's final say is the truth).

import type { Block } from './types.ts';

/** 'Hit Points' → 'hit_points', 'STR' → 'str'. Matches the dice grammar's
 *  $name charset ([a-z][a-z0-9_.]*). Returns '' when nothing survives. */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^[^a-z]+/, '');
}

/** d20 convention: 16 → +3, 9 → -1. */
export function modOf(value: number): number {
  return Math.floor((value - 10) / 2);
}

/** Format a modifier for display: +3 / −1 / +0. */
export function fmtMod(mod: number): string {
  return mod < 0 ? `−${Math.abs(mod)}` : `+${mod}`;
}

/** Walk a sheet's blocks (statblock sections included) and build the var
 *  scope for its dice formulas. */
export function collectVars(blocks: Block[]): Record<string, number> {
  const vars: Record<string, number> = {};
  const visit = (block: Block): void => {
    if (block.type === 'statGrid') {
      for (const stat of block.stats) {
        const slug = slugify(stat.label);
        if (!slug) continue;
        const value = Number(stat.value);
        if (Number.isNaN(value)) continue;
        vars[slug] = value;
        if (block.computeMods) vars[`${slug}.mod`] = modOf(value);
      }
    } else if (block.type === 'tracker') {
      const slug = slugify(block.label);
      if (slug) {
        vars[slug] = block.current;
        if (block.max !== undefined) vars[`${slug}.max`] = block.max;
      }
    } else if (block.type === 'statblock') {
      for (const section of block.sections) visit(section);
    } else if (block.type === 'columns') {
      // the 5e layout (B258) nests its stat strips in columns — a var is a
      // var wherever its block sits
      for (const col of block.columns) for (const child of col) visit(child);
    }
  };
  for (const block of blocks) visit(block);
  return vars;
}
