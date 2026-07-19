// The dice stage v3 (docs/sheets/PLAN.md §17): the whole viewport is the
// table (owner ask 2026-07-19: "3d objects that roll on the screen like a
// table, similar to D&D Beyond"). Every roll THROWS real CSS-3D polyhedra
// (engine/dice3d.ts) across the screen — they arc, bounce on an invisible
// table line, tumble, and settle with the rolled face turned to the camera.
// A slim result bar at the bottom keeps the label, the breakdown (title),
// and the total, and stays the click-to-dismiss target.
// THE ENGINE ROLLS FIRST — this module receives a finished RollResult and
// animates toward it; every throw velocity and spin derives from the roll's
// seed (engine/rng), so the same roll tumbles the same way, forever.
// prefers-reduced-motion (and dice-less formulas) skip the physics and show
// the bar alone. Skins (§17) paint the polyhedra faces via --dice-* vars.

import type { RollResult } from './dice.ts';
import { resolveActiveSkin, applySkin } from './diceSkins.ts';
import { throwDice } from './dice3d.ts';

const STYLE_ID = 'stb-dice-stage-style';
/** More dice than this fly as a visual cap; the bar says so (never silent). */
const TABLE_CAP = 12;

const CSS = `
.dice-stage {
  position: fixed;
  left: 50%;
  bottom: 10vh;
  transform: translateX(-50%);
  z-index: 240;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-surface, #fffdf8);
  border: 1px solid var(--color-border, #d9cfbc);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.25);
  cursor: pointer;
  font-family: inherit;
}
.dice-stage .formula {
  font-size: 0.85rem;
  color: var(--color-ink-muted, #6b6152);
}
.dice-stage .total {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--color-statblock, #58180d);
  opacity: 0;
  transition: opacity 150ms;
}
.dice-stage .total.shown { opacity: 1; transform-origin: center; animation: stb-total-pop 220ms ease-out; }

/* The table: full-viewport, the dice fly here. Never intercepts input. */
.dice-table {
  position: fixed;
  inset: 0;
  z-index: 239;
  perspective: 900px;
  pointer-events: none;
  overflow: hidden;
}
.dice-table .die3d {
  position: absolute;
  top: 0;
  left: 0;
  transform-style: preserve-3d;
  will-change: transform;
  filter: drop-shadow(0 12px 10px rgb(0 0 0 / 0.28));
}
.dice-table .die3d-body { position: absolute; inset: 0; transform-style: preserve-3d; }
.dice-table .df {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background-color: var(--dice-body, #f3ead8);
  background-image: var(--dice-texture, none), radial-gradient(circle at 50% 42%, transparent 52%, rgb(0 0 0 / 0.30) 100%);
  background-size: cover;
  color: var(--dice-ink, #221c14);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  backface-visibility: hidden;
}
.mat-gloss .df {
  background-image: var(--dice-texture, none), linear-gradient(160deg, rgb(255 255 255 / 0.38), transparent 55%), radial-gradient(circle at 50% 42%, transparent 52%, rgb(0 0 0 / 0.30) 100%);
}
.mat-metal .df {
  background-image: var(--dice-texture, none), linear-gradient(115deg, rgb(255 255 255 / 0.3) 0%, transparent 35%, rgb(0 0 0 / 0.24) 70%), radial-gradient(circle at 50% 42%, transparent 52%, rgb(0 0 0 / 0.30) 100%);
}
.dice-table .df-n { font-size: 1rem; }
.dice-table .die3d-4 .df-n { transform: translateY(18%); }
.dice-table .die3d.dropped { opacity: 0.45; }
@keyframes stb-total-pop {
  0% { transform: scale(0.6); }
  70% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
@media print { .dice-stage, .dice-table { display: none; } }
`;

function ensureStyle(): void {
  const prev = document.getElementById(STYLE_ID);
  if (prev) {
    if (prev.textContent === CSS) return;
    prev.remove(); // a stale style from an earlier module version
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

let current: HTMLElement[] = [];
let timers: number[] = [];
let stopThrow: (() => void) | null = null;

function dismiss(): void {
  for (const t of timers) clearTimeout(t);
  timers = [];
  stopThrow?.();
  stopThrow = null;
  for (const el of current) el.remove();
  current = [];
}

/** Show a finished roll: throw its dice across the table, settle on the
 *  engine's values, land the total in the bar. The skin (§17) resolves per
 *  roll — sheet pin → user choice → genre default. */
export async function showRoll(result: RollResult, label?: string): Promise<void> {
  ensureStyle();
  dismiss();

  const skin = await resolveActiveSkin();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const bar = document.createElement('div');
  bar.className = 'dice-stage no-print';
  applySkin(bar, skin);
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.title = result.breakdown;
  bar.addEventListener('click', dismiss);

  // a friendly name when the caller has one ("STR check", "Longsword — damage");
  // dice chips keep the formula — that IS their name
  const formula = document.createElement('span');
  formula.className = 'formula';
  const flying = Math.min(result.dice.length, TABLE_CAP);
  const capNote = result.dice.length > TABLE_CAP ? ` (+${result.dice.length - TABLE_CAP} more off-table)` : '';
  formula.textContent = `${label ?? result.formula}${capNote}`;
  bar.appendChild(formula);

  const total = document.createElement('span');
  total.className = 'total';
  total.textContent = `= ${result.total}`;
  bar.appendChild(total);

  document.body.appendChild(bar);
  current.push(bar);

  const showTotal = (): void => total.classList.add('shown');

  if (reduced || flying === 0) {
    showTotal();
    timers.push(window.setTimeout(dismiss, 1800));
    return;
  }

  const table = document.createElement('div');
  table.className = 'dice-table no-print';
  applySkin(table, skin);
  document.body.appendChild(table);
  current.push(table);

  stopThrow = throwDice(table, result.dice.slice(0, TABLE_CAP), {
    width: window.innerWidth,
    height: window.innerHeight,
    seed: result.seed + result.formula,
    onSettled: () => {
      showTotal();
      timers.push(window.setTimeout(dismiss, 2200));
    },
  });
  // a hard stop in case a die never comes to rest (it converges, but the
  // table must never outstay its welcome)
  timers.push(
    window.setTimeout(() => {
      showTotal();
      timers.push(window.setTimeout(dismiss, 1200));
    }, 6000),
  );
}
