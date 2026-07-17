// The dice stage v1 (docs/sheets/PLAN.md §17): a lazy-loaded overlay that
// gives every roll a physical moment. THE ENGINE ROLLS FIRST — this module
// receives a finished RollResult and animates toward it; it never generates
// randomness of its own (the flicker frames are hashed from the seed, so even
// the tumble is reproducible). v1 is SVG-free CSS flicker; a fancier renderer
// can replace the internals without touching call sites.

import type { RollResult } from './dice.ts';

const STYLE_ID = 'stb-dice-stage-style';

const CSS = `
.dice-stage {
  position: fixed;
  left: 50%;
  bottom: 12vh;
  transform: translateX(-50%);
  z-index: 240;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-surface, #fffdf8);
  border: 1px solid var(--color-border, #d9cfbc);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.25);
  cursor: pointer;
  font-family: inherit;
}
.dice-stage .die {
  display: inline-grid;
  place-items: center;
  min-width: 2.1rem;
  height: 2.1rem;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--dice-body, #f3ead8);
  color: var(--dice-ink, #221c14);
  border: 1px solid var(--color-border, #d9cfbc);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  position: relative;
}
.dice-stage .die.tumbling { animation: stb-die-tumble 90ms linear infinite; }
.dice-stage .die.dropped { opacity: 0.45; text-decoration: line-through; }
.dice-stage .die .sides {
  position: absolute;
  bottom: -0.95em;
  font-size: 0.6rem;
  font-weight: 400;
  color: var(--color-ink-muted, #6b6152);
}
.dice-stage .total {
  margin-left: 6px;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--color-statblock, #58180d);
  opacity: 0;
  transition: opacity 150ms;
}
.dice-stage .total.shown { opacity: 1; transform-origin: center; animation: stb-total-pop 220ms ease-out; }
.dice-stage .formula {
  font-size: 0.8rem;
  color: var(--color-ink-muted, #6b6152);
  margin-right: 4px;
}
@keyframes stb-die-tumble {
  0% { transform: rotate(-6deg) translateY(0); }
  50% { transform: rotate(5deg) translateY(-2px); }
  100% { transform: rotate(-6deg) translateY(0); }
}
@keyframes stb-total-pop {
  0% { transform: scale(0.6); }
  70% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
@media print { .dice-stage { display: none; } }
`;

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

let current: HTMLElement | null = null;
let timers: number[] = [];

function dismiss(): void {
  for (const t of timers) clearTimeout(t);
  timers = [];
  current?.remove();
  current = null;
}

/** Show a finished roll. The tumble is presentation only: every flicker frame
 *  is derived from (seed, die index, frame), then the die settles on the
 *  value the engine already decided. */
export function showRoll(result: RollResult): void {
  ensureStyle();
  dismiss();

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const stage = document.createElement('div');
  stage.className = 'dice-stage no-print';
  stage.setAttribute('role', 'status');
  stage.setAttribute('aria-live', 'polite');
  stage.title = result.breakdown;
  stage.addEventListener('click', dismiss);

  const formula = document.createElement('span');
  formula.className = 'formula';
  formula.textContent = result.formula;
  stage.appendChild(formula);

  const seedHash = hash32(result.seed + result.formula);
  const dieEls: { el: HTMLElement; final: number; sides: number; dropped: boolean }[] = [];
  for (let i = 0; i < result.dice.length; i++) {
    const die = result.dice[i]!;
    const el = document.createElement('span');
    el.className = 'die';
    const sides = document.createElement('span');
    sides.className = 'sides';
    sides.textContent = `d${die.sides}`;
    el.textContent = String(die.value);
    el.appendChild(sides);
    stage.appendChild(el);
    dieEls.push({ el, final: die.value, sides: die.sides, dropped: !die.kept });
  }

  const total = document.createElement('span');
  total.className = 'total';
  total.textContent = `= ${result.total}`;
  stage.appendChild(total);

  document.body.appendChild(stage);
  current = stage;

  const settle = () => {
    for (const d of dieEls) {
      d.el.classList.remove('tumbling');
      d.el.childNodes[0]!.textContent = String(d.final);
      if (d.dropped) d.el.classList.add('dropped');
    }
    total.classList.add('shown');
  };

  if (reduced || dieEls.length === 0) {
    settle();
  } else {
    // flicker: 8 deterministic frames per die, then settle
    let frame = 0;
    for (const d of dieEls) d.el.classList.add('tumbling');
    const tick = window.setInterval(() => {
      frame += 1;
      if (frame > 8) {
        clearInterval(tick);
        settle();
        return;
      }
      dieEls.forEach((d, i) => {
        const face = 1 + ((seedHash + frame * 17 + i * 31) % d.sides);
        d.el.childNodes[0]!.textContent = String(face);
      });
    }, 70);
    timers.push(tick as unknown as number);
  }

  timers.push(window.setTimeout(dismiss, reduced ? 1600 : 2400));
}
