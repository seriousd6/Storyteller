// True 3D dice (owner ask 2026-07-19: "3d objects that roll on the screen
// like a table, similar to D&D Beyond"). Pure CSS 3D — no WebGL, no
// dependencies: each die is a real polyhedron (tetrahedron d4, cube d6,
// octahedron d8, pentagonal bipyramid d10, dodecahedron d12, icosahedron
// d20, cube for anything else) whose faces are placed with computed
// matrix3d transforms and thrown across the viewport by a tiny seeded
// physics step (gravity, floor bounce, wall bounce, spin decay).
//
// THE PHYSICS LANDS THE ROLL (owner ask, same day: "roll correctly so that
// the number selected ends on top"). Labels are FIXED to their faces —
// nothing is relabelled or snapped at rest. Instead: orientation never
// feeds back into the trajectory, and the whole throw is deterministic in
// fixed 120 Hz steps, so we run it once silently, measure each die's total
// accumulated tumble, and start the visible throw pre-rotated so the
// tumble TERMINATES exactly on the rolled face, label upright. After the
// last bounce the die spins itself out on the spot (a damped tail), coming
// to rest showing the number the engine rolled.
//
// THE ENGINE ROLLS FIRST: this module receives finished DieResults and
// animates toward them. All randomness (throw velocities, spins, fallback
// labels) comes from the roll's seed via makeRng — the same roll tumbles
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

/** Per-face orthonormal basis: u along the first vertex, n outward,
 *  w = n × u (so u × w = n — right-handed). Scale-free: the same basis
 *  places the face div (matrix3d columns) and derives its resting Euler.
 *  Exported for the smoke. */
export interface FaceBasis { u: V3; w: V3; n: V3 }
export function faceBases(sides: number): FaceBasis[] {
  const poly = polyhedron(sides);
  return poly.faces.map((face) => {
    const pts = face.map((i) => poly.vertices[i]!);
    const center = scale(pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / pts.length);
    // TRUE plane normal, oriented outward (the centroid of a face of a
    // convex solid around the origin sits on the plane at distance > 0).
    // The old centroid-direction shortcut only holds for the Platonic
    // solids — it left the d10 bipyramid's basis skewed, faces tilted.
    let n = norm(cross(sub(pts[1]!, pts[0]!), sub(pts[2]!, pts[0]!)));
    if (dot(n, center) < 0) n = scale(n, -1);
    const u = norm(sub(pts[0]!, center)); // in-plane: the centroid is coplanar
    const w = norm(cross(n, u));
    return { u, w, n };
  });
}

export interface Euler { rx: number; ry: number; rz: number }

/** The Euler angles (CSS `rotateX rotateY rotateZ` order, degrees) whose
 *  rotation turns this face to the camera with its label upright: it maps
 *  u → screen-right (+x), w → screen-down (CSS +y), n → viewer (+z). That
 *  rotation is the matrix with ROWS u, w, n; decompose it as Rx·Ry·Rz. */
export function restEuler({ u, w, n }: FaceBasis): Euler {
  const deg = (r: number): number => (r * 180) / Math.PI;
  const sb = Math.max(-1, Math.min(1, u[2])); // m02 of the row matrix
  const ry = Math.asin(sb);
  if (Math.abs(sb) > 1 - 1e-9) {
    // gimbal (the face's u axis points straight at/away from the camera):
    // the z-rotation folds into x — pick rz = 0
    return { rx: deg(Math.atan2(sb * w[0], w[1])), ry: deg(ry), rz: 0 };
  }
  return {
    rx: deg(Math.atan2(-w[2], n[2])),
    ry: deg(ry),
    rz: deg(Math.atan2(-u[1], u[0])),
  };
}

/** Rebuild the 3×3 rotation (row-major) from resting Euler angles — used
 *  by the smoke to pin that restEuler round-trips exactly: M·n = +z
 *  (face to camera), M·u = +x, M·w = +y (label upright). */
export function eulerMatrix({ rx, ry, rz }: Euler): number[][] {
  const r = Math.PI / 180;
  const [a, b, c] = [rx * r, ry * r, rz * r];
  const ca = Math.cos(a), sa = Math.sin(a);
  const cb = Math.cos(b), sbb = Math.sin(b);
  const cc = Math.cos(c), sc = Math.sin(c);
  return [
    [cb * cc, -cb * sc, sbb],
    [ca * sc + sa * sbb * cc, ca * cc - sa * sbb * sc, -sa * cb],
    [sa * sc - ca * sbb * cc, sa * cc + ca * sbb * sc, ca * cb],
  ];
}

export interface DieMesh {
  el: HTMLElement;
  faceEls: HTMLElement[];
  /** per-face resting Euler: the tumble ENDS here to show face i */
  faceRest: Euler[];
  /** the fixed label on each face — set at build, never changed */
  labels: string[];
}

/** Build one die's DOM: a preserve-3d body whose face divs are placed by
 *  matrix3d. `size` is the die's screen diameter in px. `labels` defaults
 *  to 1..N on faces in order; oddball shapes (a cube standing in for a
 *  d100) pass their own pre-dealt labels. */
export function buildDie(sides: number, size: number, labels?: string[]): DieMesh {
  const poly = polyhedron(sides);
  const shape = [4, 6, 8, 10, 12, 20].includes(sides) ? sides : 6;
  const R = size / 2;
  // normalize the solid so its circumradius is R
  const maxLen = Math.max(...poly.vertices.map(len));
  const verts = poly.vertices.map((v) => scale(v, R / maxLen));
  const bases = faceBases(sides);

  const el = document.createElement('span');
  el.className = `die3d die3d-${shape}`;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;

  const body = document.createElement('span');
  body.className = 'die3d-body';
  el.appendChild(body);

  const faceLabels = labels ?? poly.faces.map((_, i) => String(i + 1));
  const faceEls: HTMLElement[] = [];
  poly.faces.forEach((face, fi) => {
    const { u, w, n } = bases[fi]!;
    const pts = face.map((i) => verts[i]!);
    const center = scale(pts.reduce((s, p) => add(s, p), [0, 0, 0] as V3), 1 / pts.length);
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
    f.style.transform = `matrix3d(${u[0]},${u[1]},${u[2]},0,${w[0]},${w[1]},${w[2]},0,${n[0]},${n[1]},${n[2]},0,${center[0]},${center[1]},${center[2]},1)`;
    const label = document.createElement('span');
    label.className = 'df-n';
    label.textContent = faceLabels[fi] ?? String(fi + 1);
    f.appendChild(label);
    body.appendChild(f);
    faceEls.push(f);
  });

  return { el, faceEls, faceRest: bases.map(restEuler), labels: faceLabels };
}

export interface ThrowOpts {
  /** viewport-space table bounds */
  width: number;
  height: number;
  seed: string;
  /** called once every die has come to rest */
  onSettled?: () => void;
}

const G = 1650; // px/s² — a table-scale gravity
const HZ = 120;
const H = 1 / HZ;
/** force the landing if a die somehow never slows (6s of flight) */
const FLY_CAP = 6 * HZ;
/** the spin-out tail after the last bounce is capped at 2.5s */
const OUT_CAP = 300;
const OUT_DAMP = 0.9; // per-step spin decay once down
const OUT_STOP = 2; // deg/s — spun out

/** The numeric state the physics advances. Orientation (rx/ry/rz) NEVER
 *  feeds back into the trajectory — that independence is what lets the
 *  silent pre-run solve the landing orientation exactly. */
interface Motion {
  x: number; y: number; vx: number; vy: number;
  rx: number; ry: number; rz: number;
  wx: number; wy: number; wz: number;
  size: number;
  phase: 'fly' | 'out' | 'rest';
  steps: number;
}

interface DieBody extends Motion {
  mesh: DieMesh;
  die: DieResult;
  restAt: Euler;
}

/** One fixed 120 Hz step. Pure numbers — shared verbatim by the silent
 *  pre-run and the visible throw, so both walk the same float sequence.
 *  Returns true the step the die comes to rest. */
function substep(b: Motion, width: number, floor: number): boolean {
  if (b.phase === 'rest') return false;
  b.steps += 1;
  if (b.phase === 'out') {
    // down but still spinning: damp the tumble out on the spot
    b.wx *= OUT_DAMP; b.wy *= OUT_DAMP; b.wz *= OUT_DAMP;
    b.rx += b.wx * H; b.ry += b.wy * H; b.rz += b.wz * H;
    const spun = Math.max(Math.abs(b.wx), Math.abs(b.wy), Math.abs(b.wz)) < OUT_STOP;
    if (spun || b.steps >= OUT_CAP) {
      b.phase = 'rest';
      return true;
    }
    return false;
  }
  b.vy += G * H;
  b.x += b.vx * H;
  b.y += b.vy * H;
  b.rx += b.wx * H; b.ry += b.wy * H; b.rz += b.wz * H;
  const r = b.size / 2;
  if (b.x < r && b.vx < 0) { b.x = r; b.vx = -b.vx * 0.7; }
  if (b.x > width - r && b.vx > 0) { b.x = width - r; b.vx = -b.vx * 0.7; }
  if (b.y > floor && b.vy > 0) {
    b.y = floor;
    b.vy = -b.vy * 0.42;
    b.vx *= 0.82;
    b.wx *= 0.6; b.wy *= 0.6; b.wz *= 0.6;
    if (Math.abs(b.vy) < 90 && Math.abs(b.vx) < 60) {
      b.phase = 'out';
      b.steps = 0;
      return false;
    }
  }
  if (b.steps >= FLY_CAP) {
    b.y = Math.min(b.y, floor);
    b.phase = 'out';
    b.steps = 0;
  }
  return false;
}

/** Oddball shapes (the cube stand-in) pre-deal their six labels so one
 *  face carries the rolled value — fixed BEFORE the throw, like every
 *  other die. Small ranges (d2, d3) cycle like a real d2-on-a-cube; big
 *  ones (d100) deal seeded distinct values from the die's range. */
function fallbackLabels(die: DieResult, rng: () => number): string[] {
  const faces = 6;
  if (die.sides <= faces) {
    return Array.from({ length: faces }, (_, i) => String((i % die.sides) + 1));
  }
  const labels: string[] = new Array(faces).fill('');
  const at = Math.floor(rng() * faces);
  labels[at] = String(die.value);
  const used = new Set([die.value]);
  for (let i = 0; i < faces; i++) {
    if (i === at) continue;
    let v = 1 + Math.floor(rng() * die.sides);
    for (let tries = 0; tries < 20 && used.has(v); tries++) v = 1 + Math.floor(rng() * die.sides);
    used.add(v);
    labels[i] = String(v);
  }
  return labels;
}

const STANDARD = [4, 6, 8, 10, 12, 20];
const wrap360 = (x: number): number => ((x % 360) + 360) % 360;

/** Throw finished dice across the table. Returns a stop() that cancels the
 *  animation (dismiss). Deterministic per (seed, dice) — and the physics
 *  itself lands each die on its rolled face (see module header). */
export function throwDice(host: HTMLElement, dice: DieResult[], opts: ThrowOpts): () => void {
  const rng = makeRng(`throw:${opts.seed}`);
  const floor = opts.height * 0.78;
  const bodies: DieBody[] = dice.map((die, i) => {
    const size = die.sides >= 12 ? 64 : 56;
    const labels = STANDARD.includes(die.sides) ? undefined : fallbackLabels(die, rng);
    const mesh = buildDie(die.sides, size, labels);
    host.appendChild(mesh.el);
    // enter from the lower corner, thrown up and across — like a real toss
    const fromLeft = rng() < 0.5;
    const x = fromLeft ? -80 - i * 30 : opts.width + 80 + i * 30;
    const y = floor - 60 - rng() * 120;
    const face = Math.max(0, mesh.labels.indexOf(String(die.value)));
    return {
      mesh, die, size,
      x, y,
      vx: (fromLeft ? 1 : -1) * (420 + rng() * 380) * (0.85 + 0.3 * rng()),
      vy: -(160 + rng() * 320),
      rx: 0, ry: 0, rz: 0,
      wx: (rng() - 0.5) * 720, wy: (rng() - 0.5) * 720, wz: (rng() - 0.5) * 540,
      phase: 'fly' as const, steps: 0,
      restAt: mesh.faceRest[face]!,
    };
  });

  // THE HONEST LANDING: run the whole throw silently (a few hundred pure-
  // number steps), which measures each die's total accumulated tumble.
  // Rotating the START by (target − tumble) makes the visible throw END
  // exactly on the rolled face — same steps, same floats, no snap.
  const sim: Motion[] = bodies.map(({ x, y, vx, vy, rx, ry, rz, wx, wy, wz, size, phase, steps }) =>
    ({ x, y, vx, vy, rx, ry, rz, wx, wy, wz, size, phase, steps }));
  for (let g = 0; g < FLY_CAP + OUT_CAP + 8 && sim.some((s) => s.phase !== 'rest'); g++) {
    for (const s of sim) substep(s, opts.width, floor);
  }
  bodies.forEach((b, i) => {
    b.rx = wrap360(b.restAt.rx - sim[i]!.rx);
    b.ry = wrap360(b.restAt.ry - sim[i]!.ry);
    b.rz = wrap360(b.restAt.rz - sim[i]!.rz);
  });

  let last: number | null = null;
  let acc = 0;
  let raf = 0;
  let stopped = false;
  let settledCalled = false;

  const paint = (b: DieBody): void => {
    b.mesh.el.style.transform = `translate3d(${b.x - b.size / 2}px, ${b.y - b.size / 2}px, 0)`;
    (b.mesh.el.firstChild as HTMLElement).style.transform =
      `rotateX(${b.rx}deg) rotateY(${b.ry}deg) rotateZ(${b.rz}deg)`;
  };

  const finalize = (b: DieBody): void => {
    // the tumble already ends here — write the exact resting angles to shed
    // the last ulps of accumulated float dust
    b.rx = b.restAt.rx; b.ry = b.restAt.ry; b.rz = b.restAt.rz;
    paint(b);
    if (!b.die.kept) b.mesh.el.classList.add('dropped');
    b.mesh.el.classList.add('at-rest');
    if (!settledCalled && bodies.every((d) => d.phase === 'rest')) {
      settledCalled = true;
      opts.onSettled?.();
    }
  };

  const step = (now: number): void => {
    if (stopped) return;
    if (last === null) last = now;
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    // whole fixed steps only, remainder carried — the silent pre-run walked
    // this exact sequence, so the landing orientation is exact
    while (acc >= H) {
      acc -= H;
      for (const b of bodies) {
        if (substep(b, opts.width, floor)) finalize(b);
      }
    }
    for (const b of bodies) if (b.phase !== 'rest') paint(b);
    if (bodies.some((b) => b.phase !== 'rest')) raf = requestAnimationFrame(step);
  };

  for (const b of bodies) paint(b);
  raf = requestAnimationFrame(step);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
