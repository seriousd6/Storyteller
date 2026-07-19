// Audit round 3 data probe: road connectivity + river overshoot, measured on
// the shipped Earth fixture with the app's own terrain module (real coast mask).
//
//   node audit-probe-roads-rivers.mjs <v2 dir> <out.json>
//
// Classes probed (owner complaints, 2026-07-19):
//   A. road endpoints dangling (far from any settlement AND any other road)
//   B. road endpoints stopping short of their city (0.5â€“3 mi gap)
//   C. near-miss pairs: two roads approach < 5 mi yet never touch nearby
//   D. overlap: two roads running near-coincident for a stretch
//   E. self-loop: one road returning within 1 mi of itself 8+ mi later (spin)
//   F. rivers overshooting the coast into open ocean
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

const v2 = process.argv[2];
const outPath = process.argv[3] || 'probe-out.json';
const MI = 5280;

const world = JSON.parse(readFileSync(join(v2, 'public/labs/earth.example.json'), 'utf8'));
const plane = world.planes[0];
const CIRCUM = plane.terrain.circumFt;

const terrain = await import(pathToFileURL(join(v2, 'src/everdeep/terrain.ts')));
await terrain.ensureEarthGrid();
const cfg = { seed: world.seed, ...plane.terrain };
const biome = (x, y) => terrain.biomeAt(cfg, x, y, 6);

// ---------- helpers ----------
const wrapDx = (a, b) => {
  let d = Math.abs(a - b) % CIRCUM;
  return d > CIRCUM / 2 ? CIRCUM - d : d;
};
const dist = (ax, ay, bx, by) => Math.hypot(wrapDx(ax, bx), ay - by);

// settlements with positions (from anchors) + population (from fields)
const anchorOf = new Map();
for (const a of plane.anchors) if (!anchorOf.has(a.entityId)) anchorOf.set(a.entityId, a);
const setts = [];
for (const e of Object.values(world.entities)) {
  if (e.kind !== 'settlement') continue;
  const a = anchorOf.get(e.id);
  if (!a) continue;
  const pop = Number(e.fields?.population?.value ?? e.fields?.population ?? 0) || 0;
  setts.push({ id: e.id, name: e.name, x: a.x, y: a.y, pop });
}
console.log(`settlements with anchors: ${setts.length}`);

// spatial grid for settlements (10-mi cells)
const SG = 10 * MI;
const settGrid = new Map();
const gk = (cx, cy) => cx + ':' + cy;
for (const s of setts) {
  const cx = Math.floor(s.x / SG), cy = Math.floor(s.y / SG);
  const k = gk(cx, cy);
  if (!settGrid.has(k)) settGrid.set(k, []);
  settGrid.get(k).push(s);
}
function nearestSett(x, y) {
  const cx = Math.floor(x / SG), cy = Math.floor(y / SG);
  let best = null, bd = Infinity;
  for (let r = 0; r <= 3; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      for (const s of settGrid.get(gk(cx + dx, cy + dy)) || []) {
        const d = dist(x, y, s.x, s.y);
        if (d < bd) { bd = d; best = s; }
      }
    }
    if (best && bd < (r - 0.5) * SG) break; // provably nearest
  }
  return { sett: best, d: bd };
}

// ---------- sample all road-class routes at ~1 mi ----------
const roads = plane.routes.filter((r) => r.kind === 'road' || r.kind === 'highway');
const rivers = plane.routes.filter((r) => r.kind === 'river');
console.log(`roads+highways: ${roads.length}, rivers: ${rivers.length}`);

const STEP = 1 * MI;
const samples = []; // {x,y,ri,arc}
const roadArcLen = [];
for (let ri = 0; ri < roads.length; ri++) {
  const pts = roads[ri].pts;
  let arc = 0;
  samples.push({ x: pts[0][0], y: pts[0][1], ri, arc: 0 });
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = dist(ax, ay, bx, by);
    if (seg === 0) continue;
    const n = Math.max(1, Math.round(seg / STEP));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      // wrap-safe interpolation: step along shortest dx
      let dx = bx - ax;
      if (dx > CIRCUM / 2) dx -= CIRCUM; else if (dx < -CIRCUM / 2) dx += CIRCUM;
      samples.push({ x: (ax + dx * t + CIRCUM) % CIRCUM, y: ay + (by - ay) * t, ri, arc: arc + seg * t });
    }
    arc += seg;
  }
  roadArcLen.push(arc);
}
console.log(`road samples: ${samples.length}`);

// grid the samples (2-mi cells) for pair queries
const RG = 2 * MI;
const roadGrid = new Map();
for (const s of samples) {
  const k = gk(Math.floor(s.x / RG), Math.floor(s.y / RG));
  if (!roadGrid.has(k)) roadGrid.set(k, []);
  roadGrid.get(k).push(s);
}
function* nearSamples(x, y, rings) {
  const cx = Math.floor(x / RG), cy = Math.floor(y / RG);
  for (let dx = -rings; dx <= rings; dx++) for (let dy = -rings; dy <= rings; dy++) {
    for (const s of roadGrid.get(gk(cx + dx, cy + dy)) || []) yield s;
  }
}

// ---------- A/B: endpoint attachment ----------
const endpoints = [];
for (let ri = 0; ri < roads.length; ri++) {
  const pts = roads[ri].pts;
  endpoints.push({ ri, x: pts[0][0], y: pts[0][1], end: 'start' });
  endpoints.push({ ri, x: pts[pts.length - 1][0], y: pts[pts.length - 1][1], end: 'end' });
}
const dangling = [], stopShort = [];
for (const ep of endpoints) {
  const { sett, d: dSett } = nearestSett(ep.x, ep.y);
  let dRoad = Infinity;
  for (const s of nearSamples(ep.x, ep.y, 2)) {
    if (s.ri === ep.ri) continue;
    const d = dist(ep.x, ep.y, s.x, s.y);
    if (d < dRoad) dRoad = d;
  }
  const rec = {
    route: roads[ep.ri].id, end: ep.end, x: Math.round(ep.x), y: Math.round(ep.y),
    dSettMi: +(dSett / MI).toFixed(2), sett: sett?.name, settPop: sett?.pop,
    dRoadMi: dRoad === Infinity ? null : +(dRoad / MI).toFixed(2),
  };
  if (dSett > 2 * MI && (dRoad === Infinity || dRoad > 0.5 * MI)) dangling.push(rec);
  else if (dSett > 0.5 * MI && dSett <= 3 * MI && (dRoad === Infinity || dRoad > 0.35 * MI)) stopShort.push(rec);
}
dangling.sort((a, b) => b.dSettMi - a.dSettMi);

// ---------- C/D: near-miss + overlap between route pairs ----------
// touching = any cross-route sample pair < 0.3 mi
const pairMin = new Map(); // 'ri:rj' -> {d, x, y, arcI, arcJ}
const pairTouch = new Map(); // 'ri:rj' -> [{x,y,arcI,arcJ}...] touch points
for (const s of samples) {
  for (const o of nearSamples(s.x, s.y, 3)) {
    if (o.ri <= s.ri) continue;
    const d = dist(s.x, s.y, o.x, o.y);
    if (d > 6 * MI) continue;
    const k = s.ri + ':' + o.ri;
    const cur = pairMin.get(k);
    if (!cur || d < cur.d) pairMin.set(k, { d, x: s.x, y: s.y, arcI: s.arc, arcJ: o.arc });
    if (d < 0.3 * MI) {
      if (!pairTouch.has(k)) pairTouch.set(k, []);
      const t = pairTouch.get(k);
      if (t.length < 4000) t.push({ arcI: s.arc, arcJ: o.arc });
    }
  }
}
const nearMiss = [];
for (const [k, m] of pairMin) {
  if (m.d < 0.3 * MI) continue; // they touch right here
  const touches = pairTouch.get(k) || [];
  // does a touch exist within 50 mi along EITHER route of the approach point?
  const connectedNearby = touches.some((t) =>
    Math.abs(t.arcI - m.arcI) < 50 * MI || Math.abs(t.arcJ - m.arcJ) < 50 * MI);
  if (!connectedNearby && m.d <= 5 * MI) {
    const [ri, rj] = k.split(':').map(Number);
    const ns = nearestSett(m.x, m.y);
    nearMiss.push({
      a: roads[ri].id, b: roads[rj].id, dMi: +(m.d / MI).toFixed(2),
      x: Math.round(m.x), y: Math.round(m.y), near: ns.sett?.name,
      touchesAtAll: touches.length > 0,
    });
  }
}
nearMiss.sort((a, b) => a.dMi - b.dMi);

// overlap: many touch samples spread over a long arc = two roads sharing pavement
const overlaps = [];
for (const [k, t] of pairTouch) {
  if (t.length < 8) continue;
  const arcs = t.map((p) => p.arcI).sort((a, b) => a - b);
  const span = arcs[arcs.length - 1] - arcs[0];
  if (span > 6 * MI && t.length > span / STEP * 0.6) {
    const [ri, rj] = k.split(':').map(Number);
    const mid = t[Math.floor(t.length / 2)];
    const s = samples.find((s2) => s2.ri === ri && Math.abs(s2.arc - mid.arcI) < STEP);
    overlaps.push({
      a: roads[ri].id, b: roads[rj].id, spanMi: +(span / MI).toFixed(1),
      x: Math.round(s?.x ?? 0), y: Math.round(s?.y ?? 0),
      near: s ? nearestSett(s.x, s.y).sett?.name : null,
    });
  }
}
overlaps.sort((a, b) => b.spanMi - a.spanMi);

// ---------- E: self-proximity (loops / spins) ----------
const selfLoops = [];
const byRoute = new Map();
for (const s of samples) {
  if (!byRoute.has(s.ri)) byRoute.set(s.ri, []);
  byRoute.get(s.ri).push(s);
}
// Metric v2 (fix lane): only an OPEN lasso is the defect — a route END that
// returns to within 1 mi of its own line 8+ mi back WITHOUT touching it
// (≤0.15 mi = a junction; the fix closes lassos into deliberate rings, which
// the old any-self-proximity count would keep flagging forever).
for (const [ri, ss] of byRoute) {
  let worst = null;
  for (const i of [0, ss.length - 1]) {
    // an end that TOUCHES any route (its own line or a foreign one) is a
    // junction, not a lasso — only a FREE end curling near its own line counts
    let connected = false;
    for (const o of nearSamples(ss[i].x, ss[i].y, 1)) {
      if (o.ri === ri && Math.abs(o.arc - ss[i].arc) < 2 * MI) continue; // its own tail
      if (dist(ss[i].x, ss[i].y, o.x, o.y) <= 0.15 * MI) { connected = true; break; }
    }
    if (connected) continue;
    for (const o of nearSamples(ss[i].x, ss[i].y, 1)) {
      if (o.ri !== ri) continue;
      const dArc = Math.abs(o.arc - ss[i].arc);
      if (dArc < 8 * MI) continue;
      const d = dist(ss[i].x, ss[i].y, o.x, o.y);
      if (d > 0.15 * MI && d < 1 * MI && (!worst || dArc > worst.dArc)) {
        worst = { d, dArc, x: ss[i].x, y: ss[i].y };
      }
    }
  }
  if (worst) {
    const ns = nearestSett(worst.x, worst.y);
    selfLoops.push({
      route: roads[ri].id, kind: roads[ri].kind, gapMi: +(worst.d / MI).toFixed(2),
      loopMi: +(worst.dArc / MI).toFixed(1), x: Math.round(worst.x), y: Math.round(worst.y),
      near: ns.sett?.name, nearDMi: +(ns.d / MI).toFixed(1),
    });
  }
}
selfLoops.sort((a, b) => b.loopMi - a.loopMi);

// ---------- F: rivers overshooting into ocean ----------
// Metric v2 (fix lane): SAMPLE the course at ~1 mi instead of summing whole
// segment lengths from a wet vertex — authored polylines carry ~44-mi legs, so
// one wet mouth vertex used to count its entire final segment as "water run"
// (the Congo read 44 mi of ocean that the oracle calls jungle for 95% of it).
const sampleCourse = (pts) => {
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = dist(ax, ay, bx, by);
    if (seg === 0) continue;
    const n = Math.max(1, Math.round(seg / MI));
    for (let k = i === 1 ? 0 : 1; k <= n; k++) {
      let dx = bx - ax;
      if (dx > CIRCUM / 2) dx -= CIRCUM; else if (dx < -CIRCUM / 2) dx += CIRCUM;
      out.push([(ax + dx * (k / n) + CIRCUM) % CIRCUM, ay + (by - ay) * (k / n)]);
    }
  }
  return out;
};
const overshoot = [];
for (const r of rivers) {
  const pts = sampleCourse(r.pts);
  if (pts.length < 2) continue;
  // whichever end sits in water is the mouth; walk inland counting water run
  for (const dir of [1, -1]) {
    const ordered = dir === 1 ? pts : [...pts].reverse(); // mouth last
    let runFt = 0, deepFt = 0, n = 0;
    for (let i = ordered.length - 1; i > 0; i--) {
      const [x, y] = ordered[i];
      const b = biome(x, y);
      if (b !== 'deep' && b !== 'water') break;
      const seg = dist(x, y, ordered[i - 1][0], ordered[i - 1][1]);
      runFt += seg; n++;
      if (b === 'deep') deepFt += seg;
    }
    if (n > 0 && runFt > 4 * MI) {
      const [mx, my] = ordered[ordered.length - 1];
      overshoot.push({
        route: r.id, band: r.w, mouthEnd: dir === 1 ? 'last' : 'first',
        waterRunMi: +(runFt / MI).toFixed(1), deepMi: +(deepFt / MI).toFixed(1),
        x: Math.round(mx), y: Math.round(my),
      });
      break; // one mouth per river
    }
  }
}
overshoot.sort((a, b) => b.waterRunMi - a.waterRunMi);

// ---------- report ----------
const out = {
  counts: {
    settlements: setts.length, roads: roads.length, rivers: rivers.length,
    endpoints: endpoints.length, danglingEndpoints: dangling.length,
    stopShortEndpoints: stopShort.length, nearMissPairs: nearMiss.length,
    overlapPairs: overlaps.length, selfLoopRoutes: selfLoops.length,
    riverOvershoots: overshoot.length,
  },
  dangling: dangling.slice(0, 30),
  stopShort: stopShort.slice(0, 30),
  nearMiss: nearMiss.slice(0, 30),
  overlaps: overlaps.slice(0, 30),
  selfLoops: selfLoops.slice(0, 30),
  overshoot: overshoot.slice(0, 30),
};
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.counts, null, 2));
console.log(`wrote ${outPath}`);
