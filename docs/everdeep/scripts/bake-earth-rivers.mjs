#!/usr/bin/env node
// Extract authored river courses from Natural Earth 10m rivers+lake centerlines
// and merge them into v2/public/data/earth-rivers.json (audit V11: "London has
// no Thames at any zoom — only 23 authored great rivers").
//
// Like bake-earth-admin1.mjs this is a ONE-SHOT generator: run it by hand when
// the curated list below changes, commit the output, and keep the 7 MB source
// geojson out of the repo. The first 23 rivers in earth-rivers.json were
// hand-authored waypoint by waypoint; everything this script appends rides the
// REAL Natural Earth course instead, simplified to ≤24 waypoints.
//
//   node bake-earth-rivers.mjs <path-to-ne_10m_rivers_lake_centerlines.geojson>
//
// Band semantics (see earth2026.ts): band ≥3 feeds road planning + bridge
// minting (withAuthoredRivers / bridgeCrossings); band 2 is visual texture and
// a name only. So the missing great TRUNKS go in at 3 and the famous CITY
// rivers at 2 — adding the Thames must not reroute the M1.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', '..', 'v2', 'public', 'data', 'earth-rivers.json');

const src = process.argv[2];
if (!src) { console.error('usage: node bake-earth-rivers.mjs <ne_10m_rivers_lake_centerlines.geojson>'); process.exit(1); }

// NE names carry diacritics ("Sénégal", "Godävari") and stray double spaces
// ("Amu  Darya", "São  Francisco") — match on a folded form.
const fold = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

// The curated list. `mouth` is [lat, lon] near the real mouth/confluence — it
// picks the right river when a name is shared (the Don of Rostov, not of
// Yorkshire; Seoul's Han, not Wuhan's) and orients the course source→mouth.
// `match` lists the NE spellings when they differ from ours.
const WANT = [
  // -- the great trunks the original 23 missed (band 3: roads + bridges) --
  { name: 'Missouri', band: 3, mouth: [38.8, -90.12], region: 'Americas' },
  { name: 'Ohio', band: 3, mouth: [36.99, -89.13], region: 'Americas' },
  { name: 'Columbia', band: 3, mouth: [46.25, -124.05], region: 'Americas' },
  { name: 'Rio Grande', band: 3, mouth: [25.96, -97.15], region: 'Americas' },
  { name: 'Yukon', band: 3, mouth: [62.6, -164.8], region: 'Americas' },
  { name: 'Orinoco', band: 3, mouth: [8.6, -62.3], region: 'Americas' },
  { name: 'Sao Francisco', band: 3, mouth: [-10.5, -36.4], region: 'Americas', match: ['São Francisco'] },
  { name: 'Magdalena', band: 3, mouth: [11.06, -74.85], region: 'Americas' },
  { name: 'Tigris', band: 3, mouth: [31.0, 47.44], region: 'Asia' },
  { name: 'Euphrates', band: 3, mouth: [31.0, 47.44], region: 'Asia' },
  { name: 'Shatt al Arab', band: 3, mouth: [29.94, 48.57], region: 'Asia' },
  // NE names the Tsangpo→Dihang→Brahmaputra stretches separately, and China's
  // Pearl is "Xi" plus its upstream chain (NE's lone "Pearl" is Mississippi's)
  { name: 'Brahmaputra', band: 3, mouth: [23.8, 89.7], region: 'Asia', match: ['Brahmaputra', 'Dihang', 'Yarlung'] },
  { name: 'Irrawaddy', band: 3, mouth: [15.8, 95.1], region: 'Asia' },
  { name: 'Salween', band: 3, mouth: [16.5, 97.6], region: 'Asia' },
  { name: 'Pearl River', band: 3, mouth: [22.75, 113.6], region: 'Asia', match: ['Xi', 'Xun', 'Quan', 'Hongshui', 'Nanpan'] },
  // mouth = the main stem's END in NE (the historical Aral delta), NOT today's
  // diverted trickle — guessing lower picked a distributary stub facing wrong
  { name: 'Amu Darya', band: 3, mouth: [44.2, 59.6], region: 'Asia', match: ['Amu Darya', 'Panj'] },
  { name: 'Syr Darya', band: 3, mouth: [46.0, 61.0], region: 'Asia' },
  { name: 'Ural River', band: 3, mouth: [46.9, 51.7], region: 'Asia', match: ['Ural'] },
  { name: 'Dnieper', band: 3, mouth: [46.5, 32.3], region: 'Europe' },
  { name: 'Don', band: 3, mouth: [47.09, 39.3], region: 'Europe' },
  { name: 'Orange', band: 3, mouth: [-28.63, 16.45], region: 'Africa' },
  { name: 'Limpopo', band: 3, mouth: [-25.17, 33.53], region: 'Africa' },

  // -- famous city rivers (band 2: texture + a name; no road interaction) --
  { name: 'Thames', band: 2, mouth: [51.5, 0.6], region: 'Europe' },
  { name: 'Seine', band: 2, mouth: [49.43, 0.2], region: 'Europe' },
  { name: 'Loire', band: 2, mouth: [47.28, -2.1], region: 'Europe' },
  { name: 'Rhone', band: 2, mouth: [43.33, 4.83], region: 'Europe', match: ['Rhône'] },
  { name: 'Po', band: 2, mouth: [44.95, 12.45], region: 'Europe' },
  { name: 'Tiber', band: 2, mouth: [41.75, 12.23], region: 'Europe' },
  { name: 'Elbe', band: 2, mouth: [53.88, 8.7], region: 'Europe', match: ['Elbe', 'Labe'] },
  { name: 'Oder', band: 2, mouth: [53.65, 14.6], region: 'Europe' },
  { name: 'Vistula', band: 2, mouth: [54.36, 18.95], region: 'Europe' },
  { name: 'Neva', band: 2, mouth: [59.95, 30.2], region: 'Europe' },
  { name: 'Tagus', band: 2, mouth: [38.69, -9.3], region: 'Europe', match: ['Tagus', 'Tejo'] },
  { name: 'Douro', band: 2, mouth: [41.14, -8.67], region: 'Europe', match: ['Duero'] },
  { name: 'Ebro', band: 2, mouth: [40.72, 0.87], region: 'Europe' },
  { name: 'Guadalquivir', band: 2, mouth: [36.79, -6.35], region: 'Europe' },
  { name: 'Hudson', band: 2, mouth: [40.68, -74.02], region: 'Americas' },
  { name: 'Potomac', band: 2, mouth: [37.95, -76.25], region: 'Americas' },
  { name: 'Delaware', band: 2, mouth: [39.4, -75.5], region: 'Americas' },
  { name: 'Fraser', band: 2, mouth: [49.1, -123.2], region: 'Americas' },
  { name: 'Sacramento', band: 2, mouth: [38.06, -121.8], region: 'Americas' },
  { name: 'Uruguay River', band: 2, mouth: [-34.0, -58.4], region: 'Americas', match: ['Uruguay'] },
  { name: 'Han River', band: 2, mouth: [37.6, 126.6], region: 'Asia', match: ['Han'] },
  { name: 'Chao Phraya', band: 2, mouth: [13.54, 100.6], region: 'Asia' },
  { name: 'Red River', band: 2, mouth: [20.25, 106.55], region: 'Asia', match: ['Red'] },
  { name: 'Tone', band: 2, mouth: [35.74, 140.85], region: 'Asia' },
  { name: 'Godavari', band: 2, mouth: [16.7, 82.3], region: 'Asia', match: ['Godävari'] },
  { name: 'Krishna', band: 2, mouth: [15.75, 80.92], region: 'Asia' },
  { name: 'Senegal', band: 2, mouth: [15.96, -16.5], region: 'Africa', match: ['Sénégal'] },
  { name: 'Volta', band: 2, mouth: [5.78, 0.68], region: 'Africa' },
  { name: 'Darling', band: 2, mouth: [-34.1, 141.9], region: 'Oceania' },
  { name: 'Waikato', band: 2, mouth: [-37.35, 174.73], region: 'Oceania' },
];

const gj = JSON.parse(readFileSync(src, 'utf8'));

// index every LineString part by folded name (a river is many features: main
// stem sections, lake centerlines, alternate names)
const segsByName = new Map();
for (const ft of gj.features) {
  const names = new Set();
  for (const k of ['name_en', 'name', 'name_alt']) if (ft.properties[k]) names.add(fold(ft.properties[k]));
  if (!names.size) continue;
  const parts = ft.geometry.type === 'MultiLineString' ? ft.geometry.coordinates : [ft.geometry.coordinates];
  for (const part of parts) {
    if (part.length < 2) continue;
    const pts = part.map(([lo, la]) => [la, lo]);
    for (const n of names) {
      if (!segsByName.has(n)) segsByName.set(n, []);
      segsByName.get(n).push(pts);
    }
  }
}

// planar distance in degrees with a cos-lat squeeze on longitude — plenty for
// picking components and simplifying; nobody navigates by this
const dist = (a, b) => {
  const c = Math.cos(((a[0] + b[0]) / 2) * Math.PI / 180);
  return Math.hypot(a[0] - b[0], (a[1] - b[1]) * c);
};
const segLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]); return L; };

const key = (p) => `${Math.round(p[0] * 50)},${Math.round(p[1] * 50)}`; // 0.02° weld

// Douglas–Peucker, tolerance grown until the course fits in maxPts waypoints
function simplify(pts, maxPts) {
  let tol = 0.05;
  const dp = (arr, t) => {
    if (arr.length <= 2) return arr;
    const [a, b] = [arr[0], arr[arr.length - 1]];
    let worst = 0, wi = 0;
    for (let i = 1; i < arr.length - 1; i++) {
      const p = arr[i];
      const c = Math.cos((p[0] * Math.PI) / 180);
      const [ax, ay] = [a[1] * c, a[0]], [bx, by] = [b[1] * c, b[0]], [px, py] = [p[1] * c, p[0]];
      const dx = bx - ax, dy = by - ay;
      const L2 = dx * dx + dy * dy;
      const u = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
      const d = Math.hypot(px - (ax + u * dx), py - (ay + u * dy));
      if (d > worst) { worst = d; wi = i; }
    }
    if (worst <= t) return [a, b];
    return [...dp(arr.slice(0, wi + 1), t).slice(0, -1), ...dp(arr.slice(wi), t)];
  };
  let out = dp(pts, tol);
  while (out.length > maxPts) { tol *= 1.4; out = dp(pts, tol); }
  return out;
}

const report = [];
const newRivers = [];
for (const W of WANT) {
  const segs = [];
  for (const m of W.match ?? [W.name]) segs.push(...(segsByName.get(fold(m)) ?? []));
  if (!segs.length) { report.push(`  MISSING ${W.name} — no NE feature matched`); continue; }

  // start at the matched endpoint nearest the given mouth (this is also what
  // disambiguates a shared name — the Don of Rostov, not of Yorkshire)
  let mouthPt = null, md = Infinity;
  for (const s of segs) for (const p of [s[0], s[s.length - 1]]) {
    const d = dist(p, W.mouth);
    if (d < md) { md = d; mouthPt = p; }
  }
  if (md > 2.5) { report.push(`  MISSING ${W.name} — nearest endpoint ${md.toFixed(1)}° from mouth`); continue; }

  const adj = new Map(); // weld key -> [{si, rev}]
  segs.forEach((s, si) => {
    const a = key(s[0]), b = key(s[s.length - 1]);
    if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ si, rev: false });
    if (!adj.has(b)) adj.set(b, []); adj.get(b).push({ si, rev: true });
  });
  let calls = 0;
  const walk = (nodeKey, used) => {
    // longest onward chain (by length) through unused segments
    let bestLen = 0, bestPath = [];
    for (const step of adj.get(nodeKey) ?? []) {
      if (used.has(step.si) || calls > 200000) continue;
      calls++;
      const s = segs[step.si];
      const far = key(step.rev ? s[0] : s[s.length - 1]);
      used.add(step.si);
      const [l, p] = walk(far, used);
      used.delete(step.si);
      const total = segLen(s) + l;
      if (total > bestLen) { bestLen = total; bestPath = [step, ...p]; }
    }
    return [bestLen, bestPath];
  };

  // NE splits a river where a reservoir interrupts it (the lake centerline is
  // named after the LAKE) and sometimes on bare rounding (Tigris breaks at a
  // 0.01° seam). So: walk as far as the welds go, then JUMP to the nearest
  // unused same-name endpoint within 0.6° and keep walking. The jump gap
  // becomes a straight connector — under a band-wide stroke nobody can see it.
  const JUMP = 0.75; // the Godavari's delta-to-stem gap is 0.65°
  const used = new Set();
  const line = [mouthPt]; // built mouth→source
  let chainLen = 0, cursor = mouthPt;
  for (;;) {
    const [len, path] = walk(key(cursor), used);
    for (const step of path) {
      used.add(step.si);
      const s = segs[step.si];
      const pts = step.rev ? [...s].reverse() : s;
      for (const p of pts) {
        const last = line[line.length - 1];
        if (!last || dist(last, p) > 1e-6) line.push(p);
      }
    }
    chainLen += len;
    cursor = line[line.length - 1];
    let jump = null, jumpScore = 0;
    for (let si = 0; si < segs.length; si++) {
      if (used.has(si)) continue;
      const s = segs[si];
      for (const p of [s[0], s[s.length - 1]]) {
        if (dist(p, cursor) > JUMP) continue;
        const [l] = walk(key(p), used);
        if (l > jumpScore) { jumpScore = l; jump = p; }
      }
    }
    if (!jump) break;
    chainLen += dist(cursor, jump);
    line.push(jump);
    cursor = jump;
  }
  line.reverse(); // walked mouth→source; the file wants source→mouth
  // NE often stops at the estuary head — close the visible last mile so the
  // river actually reaches its city and the sea (the Hudson ended 40mi north
  // of the harbor). snapToWater at bake time handles the final water snap.
  if (md > 0.25) { line.push(W.mouth); chainLen += md; }

  const simple = simplify(line, 24).map(([la, lo]) => [Math.round(la * 100) / 100, Math.round(lo * 100) / 100]);
  const mid = simple[Math.floor(simple.length / 2)];
  newRivers.push({ name: W.name, band: W.band, pts: simple, region: W.region, mid });
  report.push(`  ok ${W.name.padEnd(14)} band ${W.band}  segs ${String(used.size).padStart(3)}/${String(segs.length).padEnd(3)} course ${chainLen.toFixed(1).padStart(5)}°  pts ${String(simple.length).padStart(2)}  mouth-gap ${md.toFixed(2)}°`);
}

console.log(`${newRivers.length}/${WANT.length} rivers extracted:`);
console.log(report.join('\n'));

// merge: hand-authored originals verbatim, extracted courses appended
const existing = JSON.parse(readFileSync(OUT, 'utf8'));
const have = new Set(existing.rivers.map((r) => r.name));
const dupes = newRivers.filter((r) => have.has(r.name));
if (dupes.length) { console.error(`refusing to overwrite hand-authored rivers: ${dupes.map((d) => d.name).join(', ')}`); process.exit(1); }

const row = (r) => `    { "name": ${JSON.stringify(r.name)}, "band": ${r.band}, "pts": [${r.pts.map((p) => `[${p[0]},${p[1]}]`).join(',')}] }`;
const note = 'Major real rivers as source→mouth [lat,lon] waypoints + width band. The coarse world-hex drainage can\'t resolve a sub-grid channel like the Nile\'s incised valley (it flows the flat Sahara westward instead), so the flagship Earth authors the iconic trunks on their real courses and drops the generated band-≥3 rivers. Generated small rivers/streams (band 1-2) stay for texture. The first 23 are hand-authored; the rest are Natural Earth 10m courses extracted by docs/everdeep/scripts/bake-earth-rivers.mjs (V11) — band 3 trunks steer roads and mint bridges, band 2 city rivers are texture and a name.';
const keep = existing.rivers.map(row).join(',\n');
// keep the original visual grouping: grand / great / extracted
const g4 = existing.rivers.filter((r) => r.band === 4).map(row).join(',\n');
const g3 = existing.rivers.filter((r) => r.band === 3).map(row).join(',\n');
const gNew = newRivers.map(row).join(',\n');
void keep;
const out = `{\n  "_note": ${JSON.stringify(note)},\n  "rivers": [\n${g4},\n\n${g3},\n\n${gNew}\n  ]\n}\n`;
JSON.parse(out); // choke here, not at world-gen time
writeFileSync(OUT, out);
console.log(`\nwrote ${OUT} — ${existing.rivers.length} kept + ${newRivers.length} extracted`);

// feature rows for earth-features.json (paste into the rivers block; Euphrates
// already has one, so it is skipped here)
console.log('\nfeature rows (mid-course label points):');
for (const r of newRivers) {
  if (r.name === 'Euphrates') continue;
  console.log(`  { "name": ${JSON.stringify(r.name)}, "kind": "river", "lat": ${r.mid[0]}, "lon": ${r.mid[1]}, "region": ${JSON.stringify(r.region)} },`);
}
