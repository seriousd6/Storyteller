// The dice stage v2 (docs/sheets/PLAN.md §17): a lazy-loaded overlay that
// gives every roll a physical moment — now with dice that LOOK like dice
// (owner ask 2026-07-19: "3d rolling dice"). Each die is a shaped face
// (triangle d4, cube d6, diamond d8, kite d10, pentagon d12, hexagon d20,
// sphere d100) that tumbles in real CSS 3D under the stage's perspective,
// flickering faces, then settles on the result with a pop.
// THE ENGINE ROLLS FIRST — this module receives a finished RollResult and
// animates toward it; it never generates randomness of its own (flicker
// frames AND each die's tumble axis are hashed from the seed, so even the
// tumble is reproducible). Skins (§17) still apply: the shape carries
// --dice-body/-ink/-edge/texture and the material recipes.

import type { RollResult } from './dice.ts';
import { resolveActiveSkin, applySkin } from './diceSkins.ts';

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
  gap: 10px;
  padding: 10px 14px;
  background: var(--color-surface, #fffdf8);
  border: 1px solid var(--color-border, #d9cfbc);
  border-radius: 10px;
  box-shadow: 0 6px 24px rgb(0 0 0 / 0.25);
  cursor: pointer;
  font-family: inherit;
  perspective: 420px;
}
.dice-stage .die3 {
  display: inline-grid;
  justify-items: center;
  position: relative;
  transform-style: preserve-3d;
}
.dice-stage .die-shape {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  background-color: var(--dice-body, #f3ead8);
  background-image: var(--dice-texture, none);
  background-size: cover;
  background-position: center;
  color: var(--dice-ink, #221c14);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  filter: drop-shadow(0 0 1px var(--dice-edge, #b5a888)) drop-shadow(0 3px 4px rgb(0 0 0 / 0.3));
  transform-style: preserve-3d;
}
/* the shapes — a die you recognize at a glance */
.dice-stage .d4 .die-shape { clip-path: polygon(50% 0, 100% 92%, 0 92%); }
.dice-stage .d4 .die-shape .die-face { transform: translateY(0.35rem); }
.dice-stage .d6 .die-shape { border-radius: 6px; }
.dice-stage .d8 .die-shape { clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); }
.dice-stage .d10 .die-shape { clip-path: polygon(50% 0, 100% 42%, 50% 100%, 0 42%); }
.dice-stage .d12 .die-shape { clip-path: polygon(50% 0, 100% 38%, 81% 100%, 19% 100%, 0 38%); }
.dice-stage .d20 .die-shape { clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
.dice-stage .dx .die-shape { border-radius: 50%; }
/* material recipes (PLAN.md §17): preset highlight/shading, data picks one */
.mat-gloss .die-shape {
  background-image: var(--dice-texture, none), linear-gradient(160deg, rgb(255 255 255 / 0.4), transparent 55%);
}
.mat-stone .die-shape {
  background-image: var(--dice-texture, none), radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.16), rgb(0 0 0 / 0.24) 78%);
}
.mat-metal .die-shape {
  background-image: var(--dice-texture, none), linear-gradient(115deg, rgb(255 255 255 / 0.35) 0%, transparent 30%, rgb(0 0 0 / 0.22) 65%, rgb(255 255 255 / 0.18) 100%);
}
/* the 3D tumble: a full spin on a per-die axis (set inline from the seed),
   with a little hop — under the stage's perspective it reads as a thrown die */
.dice-stage .die3.tumbling .die-shape {
  animation: stb-die3-tumble 340ms linear infinite;
}
.dice-stage .die3.settled .die-shape {
  animation: stb-die3-settle 260ms ease-out;
}
.dice-stage .die3.dropped { opacity: 0.45; }
.dice-stage .die3.dropped .die-face { text-decoration: line-through; }
.dice-stage .die3 .sides {
  margin-top: 2px;
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
@keyframes stb-die3-tumble {
  0%   { transform: rotate3d(var(--ax, 1), var(--ay, 1), var(--az, 0), 0turn) translateY(0); }
  25%  { transform: rotate3d(var(--ax, 1), var(--ay, 1), var(--az, 0), 0.25turn) translateY(-5px); }
  50%  { transform: rotate3d(var(--ax, 1), var(--ay, 1), var(--az, 0), 0.5turn) translateY(0); }
  75%  { transform: rotate3d(var(--ax, 1), var(--ay, 1), var(--az, 0), 0.75turn) translateY(-3px); }
  100% { transform: rotate3d(var(--ax, 1), var(--ay, 1), var(--az, 0), 1turn) translateY(0); }
}
@keyframes stb-die3-settle {
  0%   { transform: rotate3d(var(--ax, 1), var(--ay, 1), var(--az, 0), 0.18turn) scale(1.12); }
  70%  { transform: rotate3d(var(--ax, 1), var(--ay, 1), var(--az, 0), -0.04turn) scale(0.97); }
  100% { transform: none; }
}
@keyframes stb-total-pop {
  0% { transform: scale(0.6); }
  70% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
@media print { .dice-stage { display: none; } }
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

function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** The shape class for a die: the classic set by sides, sphere for the rest. */
function shapeClass(sides: number): string {
  return [4, 6, 8, 10, 12, 20].includes(sides) ? `d${sides}` : 'dx';
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
 *  and each die's spin axis derive from (seed, die index), then the die
 *  settles on the value the engine already decided. The skin (§17) resolves
 *  per roll — sheet pin → user choice → genre default. */
export async function showRoll(result: RollResult, label?: string): Promise<void> {
  ensureStyle();
  dismiss();

  const skin = await resolveActiveSkin();
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const stage = document.createElement('div');
  stage.className = 'dice-stage no-print';
  applySkin(stage, skin);
  stage.setAttribute('role', 'status');
  stage.setAttribute('aria-live', 'polite');
  stage.title = result.breakdown;
  stage.addEventListener('click', dismiss);

  // a friendly name when the caller has one ("STR check", "Longsword — damage");
  // dice chips keep the formula — that IS their name
  const formula = document.createElement('span');
  formula.className = 'formula';
  formula.textContent = label ?? result.formula;
  stage.appendChild(formula);

  const seedHash = hash32(result.seed + result.formula);
  const dieEls: { el: HTMLElement; face: HTMLElement; final: number; sides: number; dropped: boolean }[] = [];
  for (let i = 0; i < result.dice.length; i++) {
    const die = result.dice[i]!;
    const el = document.createElement('span');
    el.className = `die3 ${shapeClass(die.sides)}`;
    // a per-die tumble axis from the seed — every die spins its own way
    const h = seedHash + i * 97;
    el.style.setProperty('--ax', String(1 + (h % 3)));
    el.style.setProperty('--ay', String(1 + ((h >> 2) % 3)));
    el.style.setProperty('--az', String((h >> 4) % 2));
    const shape = document.createElement('span');
    shape.className = 'die-shape';
    const face = document.createElement('span');
    face.className = 'die-face';
    face.textContent = String(die.value);
    shape.appendChild(face);
    const sides = document.createElement('span');
    sides.className = 'sides';
    sides.textContent = `d${die.sides}`;
    el.append(shape, sides);
    stage.appendChild(el);
    dieEls.push({ el, face, final: die.value, sides: die.sides, dropped: !die.kept });
  }

  const total = document.createElement('span');
  total.className = 'total';
  total.textContent = `= ${result.total}`;
  stage.appendChild(total);

  document.body.appendChild(stage);
  current = stage;

  const settle = (animate: boolean) => {
    for (const d of dieEls) {
      d.el.classList.remove('tumbling');
      if (animate) d.el.classList.add('settled');
      d.face.textContent = String(d.final);
      if (d.dropped) d.el.classList.add('dropped');
    }
    total.classList.add('shown');
  };

  if (reduced || dieEls.length === 0) {
    settle(false);
  } else {
    // flicker: 8 deterministic frames per die while the 3D tumble spins, then settle
    let frame = 0;
    for (const d of dieEls) d.el.classList.add('tumbling');
    const tick = window.setInterval(() => {
      frame += 1;
      if (frame > 8) {
        clearInterval(tick);
        settle(true);
        return;
      }
      dieEls.forEach((d, i) => {
        const face = 1 + ((seedHash + frame * 17 + i * 31) % d.sides);
        d.face.textContent = String(face);
      });
    }, 70);
    timers.push(tick as unknown as number);
  }

  timers.push(window.setTimeout(dismiss, reduced ? 1600 : 2400));
}
