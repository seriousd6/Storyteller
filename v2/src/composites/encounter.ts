// Encounter builder: picks monsters from the CR-tagged monster database to
// fit a 5e-style adjusted-XP budget (party size × level threshold), then
// dresses the fight with tactics, a twist, and weather. Emits one statblock.

import { makeComposer, type CompositeMeta } from '../engine/composite.ts';
import type { Block, ListBlock, TableRegistry } from '../engine/types.ts';

const MONSTERS = 'gm/monsters/all';

/** CRs present in the monster table, with standard XP values. */
const CRS = [
  { tag: 'cr-0', label: '0', xp: 10 },
  { tag: 'cr-1-8', label: '1/8', xp: 25 },
  { tag: 'cr-1-4', label: '1/4', xp: 50 },
  { tag: 'cr-1-2', label: '1/2', xp: 100 },
  { tag: 'cr-1', label: '1', xp: 200 },
  { tag: 'cr-2', label: '2', xp: 450 },
  { tag: 'cr-3', label: '3', xp: 700 },
  { tag: 'cr-4', label: '4', xp: 1100 },
  { tag: 'cr-5', label: '5', xp: 1800 },
  { tag: 'cr-6', label: '6', xp: 2300 },
  { tag: 'cr-7', label: '7', xp: 2900 },
  { tag: 'cr-8', label: '8', xp: 3900 },
  { tag: 'cr-9', label: '9', xp: 5000 },
  { tag: 'cr-10', label: '10', xp: 5900 },
  { tag: 'cr-11', label: '11', xp: 7200 },
  { tag: 'cr-12', label: '12', xp: 8400 },
  { tag: 'cr-13', label: '13', xp: 10000 },
  { tag: 'cr-14', label: '14', xp: 11500 },
  { tag: 'cr-15', label: '15', xp: 13000 },
  { tag: 'cr-16', label: '16', xp: 15000 },
  { tag: 'cr-17', label: '17', xp: 18000 },
  { tag: 'cr-18', label: '18', xp: 20000 },
  { tag: 'cr-19', label: '19', xp: 22000 },
  { tag: 'cr-20', label: '20', xp: 25000 },
  { tag: 'cr-21', label: '21', xp: 33000 },
  { tag: 'cr-22', label: '22', xp: 41000 },
  { tag: 'cr-23', label: '23', xp: 50000 },
  { tag: 'cr-24', label: '24', xp: 62000 },
  { tag: 'cr-25', label: '25', xp: 75000 },
  { tag: 'cr-30', label: '30', xp: 155000 },
] as const;

type Cr = (typeof CRS)[number];

/** XP thresholds per character level: [easy, medium, hard, deadly]. */
const THRESHOLDS: [number, number, number, number][] = [
  [25, 50, 75, 100],
  [50, 100, 150, 200],
  [75, 150, 225, 400],
  [125, 250, 375, 500],
  [250, 500, 750, 1100],
  [300, 600, 900, 1400],
  [350, 750, 1100, 1700],
  [450, 900, 1400, 2100],
  [550, 1100, 1600, 2400],
  [600, 1200, 1900, 2800],
  [800, 1600, 2400, 3600],
  [1000, 2000, 3000, 4500],
  [1100, 2200, 3400, 5100],
  [1250, 2500, 3800, 5700],
  [1400, 2800, 4300, 6400],
  [1600, 3200, 4800, 7200],
  [2000, 3900, 5900, 8800],
  [2100, 4200, 6300, 9500],
  [2400, 4900, 7300, 10900],
  [2800, 5700, 8500, 12700],
];

const DIFFICULTIES = ['easy', 'medium', 'hard', 'deadly'] as const;

// Creature-type themes (tags added to gm/monsters/all). Value '' = any.
const THEMES: { value: string; label: string }[] = [
  { value: '', label: 'Any type' },
  { value: 'aberration', label: 'Aberrations' },
  { value: 'beast', label: 'Beasts' },
  { value: 'celestial', label: 'Celestials' },
  { value: 'construct', label: 'Constructs' },
  { value: 'dragon', label: 'Dragons' },
  { value: 'elemental', label: 'Elementals' },
  { value: 'fey', label: 'Fey' },
  { value: 'fiend', label: 'Fiends' },
  { value: 'giant', label: 'Giants' },
  { value: 'humanoid', label: 'Humanoids' },
  { value: 'monstrosity', label: 'Monstrosities' },
  { value: 'ooze', label: 'Oozes' },
  { value: 'plant', label: 'Plants' },
  { value: 'undead', label: 'Undead' },
];

/** Encounter multiplier by total monster count (DMG), shifted one column by
 *  party size: fewer than 3 characters count every fight one step harder,
 *  more than 5 one step easier (the DMG's own table margin — without it a
 *  "Hard" horde for 8 players was actually below their Easy threshold). */
const MULTS = [0.5, 1, 1.5, 2, 2.5, 3, 4] as const;
function multiplier(count: number, partySize = 4): number {
  let s = count <= 1 ? 1 : count === 2 ? 2 : count <= 6 ? 3 : count <= 10 ? 4 : count <= 14 ? 5 : 6;
  if (partySize < 3) s = Math.min(MULTS.length - 1, s + 1);
  else if (partySize > 5) s = Math.max(0, s - 1);
  return MULTS[s]!;
}

type Style = 'solo' | 'pair' | 'pack' | 'horde' | 'boss';

interface Config {
  style: Style;
  cr: Cr;
  count: number;
  bossCr?: Cr;
  adjusted: number;
}

// `crs` is the CR pool the solver may draw from — the full table, or (with a
// creature-type theme) only the CRs that actually have a monster of that type,
// so a themed fight never asks for a CR the theme can't fill.
function enumerate(budget: number, lo: number, hi: number, size: number, crs: readonly Cr[]): Config[] {
  const min = budget * lo;
  const max = budget * hi;
  const ok = (adj: number) => adj >= min && adj <= max;
  const configs: Config[] = [];
  for (const cr of crs) {
    const solo = cr.xp * multiplier(1, size);
    if (ok(solo)) configs.push({ style: 'solo', cr, count: 1, adjusted: solo });
    const pair = 2 * cr.xp * multiplier(2, size);
    if (ok(pair)) configs.push({ style: 'pair', cr, count: 2, adjusted: pair });
    for (let n = 3; n <= 6; n++) {
      const adj = n * cr.xp * multiplier(n, size);
      if (ok(adj)) configs.push({ style: 'pack', cr, count: n, adjusted: adj });
    }
    for (let n = 7; n <= 12; n++) {
      const adj = n * cr.xp * multiplier(n, size);
      if (ok(adj)) configs.push({ style: 'horde', cr, count: n, adjusted: adj });
    }
  }
  for (const boss of crs) {
    for (const minion of crs) {
      if (minion.xp * 4 > boss.xp) continue; // minions stay clearly below the boss
      for (let m = 2; m <= 6; m++) {
        const adj = (boss.xp + m * minion.xp) * multiplier(1 + m, size);
        if (ok(adj)) configs.push({ style: 'boss', cr: minion, count: m, bossCr: boss, adjusted: adj });
      }
    }
  }
  return configs;
}

export const meta: CompositeMeta = {
  id: 'gm/encounter',
  title: 'Encounter Builder',
  pillar: 'gm',
  description:
    'A balanced fight in one click: monsters chosen by XP budget from 697 creatures, plus tactics, a twist, and the weather overhead. Filter by creature type for a themed fight — an undead crypt, a beasts-only wilderness, a dragon’s lair.',
  addLabel: 'Add encounter',
  options: [
    {
      id: 'size',
      label: 'Party size',
      choices: Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} player${i ? 's' : ''}` })),
      default: '4',
    },
    {
      id: 'level',
      label: 'Party level',
      choices: Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` })),
      default: '3',
    },
    {
      id: 'difficulty',
      label: 'Difficulty',
      choices: DIFFICULTIES.map((d) => ({ value: d, label: d[0]!.toUpperCase() + d.slice(1) })),
      default: 'medium',
    },
    {
      id: 'theme',
      label: 'Creature type',
      choices: THEMES,
      default: '',
    },
  ],
};

/** Monster names carrying a CR tag and (optionally) a creature-type tag. */
function monsterPool(tables: TableRegistry, crTag: string, theme: string): string[] {
  const table = tables.get(MONSTERS);
  return (table?.entries ?? [])
    .filter(
      (e) =>
        typeof e !== 'string' &&
        (e.tags?.includes(crTag) ?? false) &&
        (!theme || (e.tags?.includes(theme) ?? false)),
    )
    .map((e) => (typeof e === 'string' ? e : e.text));
}

export function build(tables: TableRegistry, seed: string, opts: Record<string, string>): Block[] {
  const c = makeComposer(tables, seed);
  const size = Math.min(8, Math.max(1, Number(opts.size) || 4));
  const level = Math.min(20, Math.max(1, Number(opts.level) || 3));
  const difficulty = (DIFFICULTIES as readonly string[]).includes(opts.difficulty ?? '')
    ? (opts.difficulty as (typeof DIFFICULTIES)[number])
    : 'medium';
  const budget = THRESHOLDS[level - 1]![DIFFICULTIES.indexOf(difficulty)]! * size;

  const theme = THEMES.some((t) => t.value === opts.theme) ? (opts.theme ?? '') : '';
  // With a theme, the solver may only use CRs the theme can actually fill, so a
  // themed fight never asks for a CR with no monster of that type.
  const themedCrs = theme ? CRS.filter((cr) => monsterPool(tables, cr.tag, theme).length > 0) : CRS;
  const crs = themedCrs.length ? themedCrs : CRS;

  // Find compositions that land near the budget; widen the net if needed.
  let configs = enumerate(budget, 0.65, 1.15, size, crs);
  if (configs.length === 0) configs = enumerate(budget, 0.4, 1.4, size, crs);
  let config: Config;
  if (configs.length === 0) {
    // Degenerate budgets (tiny parties at level 1): closest single monster.
    const cr = [...crs].sort((a, b) => Math.abs(a.xp - budget) - Math.abs(b.xp - budget))[0]!;
    config = { style: 'solo', cr, count: 1, adjusted: cr.xp };
  } else {
    const styles = [...new Set(configs.map((k) => k.style))];
    const weights: Record<Style, number> = { solo: 20, pair: 15, pack: 30, horde: 15, boss: 20 };
    const style = c.weighted(styles.map((s) => [s, weights[s]] as [Style, number]));
    config = c.among(configs.filter((k) => k.style === style));
  }

  // Pull a monster of the wanted CR (and theme, if any). With no theme this is
  // the ordinary weighted table roll — output is unchanged; with a theme the
  // pick is done in JS over the cr+type pool (the engine filters one #tag only).
  const roll = (cr: Cr, taken: string[] = []): string => {
    if (!theme) {
      return taken.length
        ? c.distinct(`{table:${MONSTERS}#${cr.tag}}`, taken)
        : c.text(`{table:${MONSTERS}#${cr.tag}}`);
    }
    const pool = monsterPool(tables, cr.tag, theme);
    const avail = pool.filter((m) => !taken.includes(m));
    const src = avail.length ? avail : pool;
    if (src.length === 0) return c.text(`{table:${MONSTERS}#${cr.tag}}`);
    return src[Math.floor(c.rng() * src.length)]!;
  };
  const lines: string[] = [];
  let name: string;
  const fmt = (n: number) => n.toLocaleString('en-US');

  if (config.style === 'pair') {
    const a = roll(config.cr);
    const b = roll(config.cr, [a]);
    lines.push(`1 × ${a} — CR ${config.cr.label}, ${fmt(config.cr.xp)} XP`);
    lines.push(`1 × ${b} — CR ${config.cr.label}, ${fmt(config.cr.xp)} XP`);
    name = `${a} & ${b}`;
  } else if (config.style === 'boss') {
    const boss = roll(config.bossCr!);
    const minion = roll(config.cr, [boss]);
    lines.push(`1 × ${boss} — CR ${config.bossCr!.label}, ${fmt(config.bossCr!.xp)} XP`);
    lines.push(`${config.count} × ${minion} — CR ${config.cr.label}, ${fmt(config.cr.xp)} XP each`);
    name = `${boss} & ${config.count} × ${minion}`;
  } else {
    const monster = roll(config.cr);
    lines.push(
      `${config.count} × ${monster} — CR ${config.cr.label}, ${fmt(config.cr.xp)} XP${config.count > 1 ? ' each' : ''}`,
    );
    name = config.count === 1 ? monster : `${monster} × ${config.count}`;
  }

  const forces: ListBlock = { type: 'list', label: 'Forces', items: lines };
  const label = difficulty[0]!.toUpperCase() + difficulty.slice(1);
  return [
    {
      type: 'statblock',
      name,
      meta: `${label} encounter · ${size} character${size > 1 ? 's' : ''}, level ${level} · ~${fmt(Math.round(config.adjusted))} adjusted XP (budget ${fmt(budget)})`,
      sections: [
        forces,
        {
          type: 'keyValue',
          pairs: [
            { key: 'Tactics', value: c.text('{table:gm/encounter/tactics}') },
            { key: 'Twist', value: c.text('{table:gm/encounter/twist}') },
          ],
        },
      ],
    },
  ];
}
