// True 3D dice (owner ask 2026-07-19: "3d objects that roll on the screen
// like a table, similar to D&D Beyond"). Pure CSS 3D — no WebGL, no
// dependencies: each die is a real polyhedron (tetrahedron d4, cube d6,
// octahedron d8, pentagonal bipyramid d10, dodecahedron d12, icosahedron
// d20, cube for anything else) whose faces are placed with computed
// matrix3d transforms, thrown across the viewport by a tiny seeded physics
// step (gravity, floor bounce, wall bounce, spin decay), and snapped at
// rest so the ROLLED face looks at the camera.
//
// THE ENGINE ROLLS FIRST: this module receives finished DieResults and
// animates toward them. All randomness (throw velocities, spins, landing
// spots) comes from the roll's seed via makeRng — the same roll tumbles
// the same way, forever. Skins still apply: faces read --dice-body /
// --dice-ink / --dice-edge / --dice-texture from the stage that hosts them.

import type { DieResult } from './dice.ts';
import { makeRng } from './rng.ts';

type V3 = [number, number, number];

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));

interface Poly {
  vertices: V3[];
  faces: number[][];
}

const PHI = (1 + Math.sqrt(5)) / 2;

/** The solids, unit-ish scale; faces wind outward. Exported for the smoke
 *  (face counts and closure are pure math — a wrong hull renders as a
 *  half-invisible die, which no e2e assertion would catch). */
export function polyhedron(sides: number): Poly {
  if (sides === 4) {
    return {
      vertices: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]],
      faces: [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]],
    };
  }
  if (sides === 8) {
    return {
      vertices: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
      faces: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]],
    };
  }
  if (sides === 10) {
    // pentagonal bipyramid — planar by construction, reads as a d10
    const vertices: V3[] = [[0, 0, 1.15], [0, 0, -1.15]];
    for (let k = 0; k < 5; k++) {
      const a = (k * 2 * Math.PI) / 5;
      vertices.push([Math.cos(a), Math.sin(a), 0]);
    }
    const faces: number[][] = [];
    for (let k = 0; k < 5; k++) {
      faces.push([0, 2 + k, 2 + ((k + 1) % 5)]);
      faces.push([1, 2 + ((k + 1) % 5), 2 + k]);
    }
    return { vertices, faces };
  }
  if (sides === 12) {
    const v: V3[] = [];
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      v.push([0, s / PHI, t * PHI]);
      v.push([s / PHI, t * PHI, 0]);
      v.push([s * PHI, 0, t / PHI]);
    }
    return { vertices: v, faces: facesFromHull(v, 5) };
  }
  if (sides === 20) {
    const v: V3[] = [];
    for (const s of [-1, 1]) for (const t of [-1, 1]) {
      v.push([0, s, t * PHI]);
      v.push([s, t * PHI, 0]);
      v.push([s * PHI, 0, t]);
    }
    return { vertices: v, faces: facesFromHull(v, 3) };
  }
  // cube — d6 and the fallback body for d100 and oddballs
  const v: V3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  return {
    vertices: v,
    faces: [
      [0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3],
    ],
  };
}

/** Faces of a regular hull by plane grouping: every k-gon face lies in a
 *  plane where dot(v, n) is maximal and equal for its k vertices. Works for
 *  the dodecahedron and icosahedron vertex sets above. */
function facesFromHull(vertices: V3[], k: number): number[][] {
  const faces: number[][] = [];
  const seen = new Set<string>();
  const n = vertices.length;
  // candidate face normals: every triple's plane normal, deduped
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++) {
    const nrm = norm(cross(sub(vertices[b]!, vertices[a]!), sub(vertices[c]!, vertices[a]!)));
    if (!Number.isFinite(nrm[0])) continue;
    for (const sign of [1, -1]) {
      const dir = scale(nrm, sign);
      const d = dot(dir, vertices[a]!);
      if (d <= 0) continue;
      // all vertices on or below this plane?
      let onPlane: number[] = [];
      let outside = false;
      for (let i = 0; i < n; i++) {
        const di = dot(dir, vertices[i]!);
        if (di > d + 1e-6) { outside = true; break; }
        if (Math.abs(di - d) < 1e-6) onPlane.push(i);
      }
      if (outside || onPlane.length !== k) continue;
      // order the face's vertices around its center
      const center = scale(onPlane.reduce((s, i) => add(s, vertices[i]!), [0, 0, 0] as V3), 1 / k);
      const u = norm(sub(vertices[onPlane[0]!]!, center));
      const w = norm(cross(dir, u));
      onPlane = onPlane
        .map((i) => ({ i, ang: Math.atan2(dot(sub(vertices[i]!, center), w), dot(sub(vertices[i]!, center), u)) }))
        .sort((p, q) => p.ang - q.ang)
        .map((p) => p.i);
      const key = [...onPlane].sort((x, y) => x - y).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      faces.push(onPlane);
    }
  }
  return faces;
}

export interface DieMesh {
  el: HTMLElement;
  /** rotate3d(axis, angle) that brings face i to look at the camera */
  faceUp: { axis: V3; angle: number }[];
  faceEls: HTMLElement[];
}

/** Build one die's DOM: a preserve-3d body whose face divs are placed by
 *  matrix3d. `size` is the die's screen diameter in px. */
export function buildDie(sides: number, size: number): DieMesh {
  const poly = polyhedron(sides);
  const shape = [4, 6, 8, 10, 12, 20].includes(sides) ? sides : 6;
  const R = size / 2;
  // normalize the solid so its circumradius is R
  const maxLen = Math.max(...poly.vertices.map(len));
  const verts = poly.vertices.map((v) => scale(v, R / maxLen));

  const el = document.createElement('span');
  el.className = `die3d die3d-${shape}`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  const body = document.createElement('span');
  body.className = 'die3d-body';
  el.appendChild(body);

  const faceUp: DieMesh['faceUp'] = [];
  const faceEls: HTMLElement[] = [];
  poly.faces.forEach((face, fi) => {
    const pts = face.map((i) => verts[i]!);
    const center = scale(pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / pts.length);
    const nrm = norm(center); // regular solids: face normal = center direction
    const u = norm(sub(pts[0]!, center));
    const w = norm(cross(nrm, u));
    // 2D outline of the face in its own plane, centered in a size×size box
    const half = size / 2;
    const poly2d = pts
      .map((p) => [dot(sub(p, center), u) + half, dot(sub(p, center), w) + half] as const)
      .map(([x, y]) => `${((x / size) * 100).toFixed(2)}% ${((y / size) * 100).toFixed(2)}%`)
      .join(', ');
    const f = document.createElement('span');
    f.className = 'df';
    f.style.clipPath = `polygon(${poly2d})`;
    // matrix3d columns: u, w, n (face basis) + face center, so the flat div
    // sits exactly on the solid's surface
    f.style.transform = `matrix3d(${u[0]},${u[1]},${u[2]},0,${w[0]},${w[1]},${w[2]},0,${nrm[0]},${nrm[1]},${nrm[2]},0,${center[0]},${center[1]},${center[2]},1)`;
    const label = document.createElement('span');
    label.className = 'df-n';
    label.textContent = String(fi + 1);
    f.appendChild(label);
    body.appendChild(f);
    faceEls.push(f);
    // the rotation that brings this face's normal to +Z (the camera)
    const target: V3 = [0, 0, 1];
    const axisRaw = cross(nrm, target);
    const angle = Math.acos(Math.max(-1, Math.min(1, dot(nrm, target))));
    const axis = len(axisRaw) < 1e-6 ? ([1, 0, 0] as V3) : norm(axisRaw);
    faceUp.push({ axis, angle: (angle * 180) / Math.PI });
  });

  return { el, faceUp, faceEls };
}

export interface ThrowOpts {
  /** viewport-space table bounds */
  width: number;
  height: number;
  seed: string;
  /** called once every die has come to rest */
  onSettled?: () => void;
}

interface DieBody {
  mesh: DieMesh;
  die: DieResult;
  x: number; y: number; vx: number; vy: number;
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
  resting: boolean;
  size: number;
}

/** Throw finished dice across the table. Returns a stop() that cancels the
 *  animation (dismiss). Deterministic per (seed, dice). */
export function throwDice(host: HTMLElement, dice: DieResult[], opts: ThrowOpts): () => void {
  const rng = makeRng(`throw:${opts.seed}`);
  const floor = opts.height * 0.78;
  const bodies: DieBody[] = dice.map((die, i) => {
    const size = die.sides >= 12 ? 64 : 56;
    const mesh = buildDie(die.sides, size);
    host.appendChild(mesh.el);
    // enter from the lower corner, thrown up and across — like a real toss
    const fromLeft = rng() < 0.5;
    const x = fromLeft ? -80 - i * 30 : opts.width + 80 + i * 30;
    const y = floor - 60 - rng() * 120;
    return {
      mesh, die, size,
      x, y,
      vx: (fromLeft ? 1 : -1) * (420 + rng() * 380) * (0.85 + 0.3 * rng()),
      vy: -(160 + rng() * 320),
      rx: rng() * 360, ry: rng() * 360, rz: rng() * 360,
      wx: (rng() - 0.5) * 720, wy: (rng() - 0.5) * 720, wz: (rng() - 0.5) * 540,
      resting: false,
    };
  });

  const G = 1650; // px/s² — a table-scale gravity
  let last: number | null = null;
  let raf = 0;
  let stopped = false;
  let settledCalled = false;

  const paint = (b: DieBody): void => {
    b.mesh.el.style.transform = `translate3d(${b.x - b.size / 2}px, ${b.y - b.size / 2}px, 0)`;
    (b.mesh.el.firstChild as HTMLElement).style.transform =
      `rotateX(${b.rx}deg) rotateY(${b.ry}deg) rotateZ(${b.rz}deg)`;
  };

  const rest = (b: DieBody): void => {
    b.resting = true;
    // the rolled face turns to the camera: relabel so the front face IS the
    // result (the tumble is far too fast to track individual faces)
    const fi = Math.floor(rng() * b.mesh.faceUp.length);
    const swap = b.mesh.faceEls.findIndex((f) => f.firstChild!.textContent === String(b.die.value));
    if (swap >= 0 && swap !== fi) {
      const a = b.mesh.faceEls[fi]!.firstChild!;
      const c = b.mesh.faceEls[swap]!.firstChild!;
      const t = a.textContent;
      a.textContent = c.textContent;
      c.textContent = t;
    } else if (swap < 0) {
      b.mesh.faceEls[fi]!.firstChild!.textContent = String(b.die.value);
    }
    const up = b.mesh.faceUp[fi]!;
    const body = b.mesh.el.firstChild as HTMLElement;
    body.style.transition = 'transform 240ms ease-out';
    body.style.transform = `rotate3d(${up.axis[0]}, ${up.axis[1]}, ${up.axis[2]}, ${up.angle}deg)`;
    if (!b.die.kept) b.mesh.el.classList.add('dropped');
    b.mesh.el.classList.add('at-rest');
    if (!settledCalled && bodies.every((d) => d.resting)) {
      settledCalled = true;
      opts.onSettled?.();
    }
  };

  const step = (now: number): void => {
    if (stopped) return;
    if (last === null) last = now;
    // fixed 120Hz sub-steps for frame-rate independence
    let dtLeft = Math.min(0.1, (now - last) / 1000);
    last = now;
    const H = 1 / 120;
    while (dtLeft > 0) {
      const dt = Math.min(H, dtLeft);
      dtLeft -= dt;
      for (const b of bodies) {
        if (b.resting) continue;
        b.vy += G * dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
        const r = b.size / 2;
        if (b.x < r && b.vx < 0) { b.x = r; b.vx = -b.vx * 0.7; }
        if (b.x > opts.width - r && b.vx > 0) { b.x = opts.width - r; b.vx = -b.vx * 0.7; }
        if (b.y > floor && b.vy > 0) {
          b.y = floor;
          b.vy = -b.vy * 0.42;
          b.vx *= 0.82;
          b.wx *= 0.6; b.wy *= 0.6; b.wz *= 0.6;
          if (Math.abs(b.vy) < 90 && Math.abs(b.vx) < 60) {
            rest(b);
            continue;
          }
        }
      }
    }
    for (const b of bodies) if (!b.resting) paint(b);
    if (bodies.some((b) => !b.resting)) raf = requestAnimationFrame(step);
  };

  for (const b of bodies) paint(b);
  raf = requestAnimationFrame(step);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
