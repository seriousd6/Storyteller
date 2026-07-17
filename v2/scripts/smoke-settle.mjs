// Settlement & road smoke (batch 69): the browser civilisation pass. Locks in
// that a world gets populated — capitals/towns/villages on the food and water,
// a road network (highways/roads/dirt) between them, bridges at great-river
// crossings — and crucially that NO ONE settles the ice. Part of `npm run smoke`.

import { readFileSync } from 'node:fs';
import { ensureEarthGrid, temperatureNorm, biomeAt, octFor, EARTH_CIRCUM_FT, EARTH_HEIGHT_FT } from '../src/everdeep/terrain.ts';
import { generateHydrology } from '../src/everdeep/hydrology.ts';
import { generateSettlements, settleTier } from '../src/everdeep/settlements.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

await ensureEarthGrid();
const octW = octFor(316_800);
const WATER = new Set(['deep', 'water']);

function gen(over) {
  const cfg = { seed: '', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, landform: 'earth', waterPct: 50, climate: 'temperate', ...over };
  const hy = generateHydrology(cfg);
  const s = generateSettlements(cfg, hy.grid);
  return { cfg, s, hy };
}

const MI = 5280;
const wrapD = (cfg, ax, ay, bx, by) => {
  let dx = Math.abs(ax - bx);
  if (dx > cfg.circumFt / 2) dx = cfg.circumFt - dx; // the world wraps east–west
  return Math.hypot(dx, ay - by);
};

// 1. Earth is populated with a real road network
{
  const { cfg, s } = gen({});
  const tier = s.nodes.reduce((m, n) => { m[n.tier] = (m[n.tier] || 0) + 1; return m; }, {});
  const kind = s.routes.reduce((m, r) => { m[r.kind] = (m[r.kind] || 0) + 1; return m; }, {});
  console.log(`   Earth: ${s.nodes.length} settlements ${JSON.stringify(tier)}, ${s.routes.length} roads ${JSON.stringify(kind)}, ${s.bridges.length} bridges`);
  (s.nodes.length > 150 && (tier.capital ?? 0) >= 5 && (tier.town ?? 0) >= 20 && (tier.village ?? 0) >= 20)
    ? ok(`populated (${tier.capital} capitals, ${tier.town} towns, ${tier.village} villages)`)
    : fail(`sparse settlement: ${JSON.stringify(tier)}`);
  ((kind.highway ?? 0) >= 5 && (kind.road ?? 0) >= 20 && (kind.dirt ?? 0) >= 10)
    ? ok(`road network built (${kind.highway} highways, ${kind.road} roads, ${kind.dirt} dirt)`)
    : fail(`thin road network: ${JSON.stringify(kind)}`);
  (s.bridges.length >= 1)
    ? ok(`${s.bridges.length} bridges at great-river crossings`)
    : fail('no bridges built');

  // 2. NO ONE settles the ice — every settlement is warm enough to farm
  const frozen = s.nodes.filter((n) => temperatureNorm(cfg, n.x, n.y, octW) < 0.28);
  frozen.length === 0
    ? ok('no settlements on frozen ground (Antarctica/Arctic ice stays wild)')
    : fail(`${frozen.length} settlements on the ice (e.g. ${frozen[0].name})`);

  // 3. settlements sit on farmable/water sites, not open sea (sanity)
  const onLand = s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y));
  onLand ? ok('all settlements have valid positions') : fail('settlement with a bad position');
}

// 4. AUDIT the network invariants (batch 101). "0 unbridged crossings" and "no
// roadless town" were claimed by batches 51/52/53/57 — but only ever as console
// logs inside the old Vessia bake, never as tests. That is precisely how the
// authored-river regression (roads bridging a river nobody can see) shipped
// unnoticed. Assert them here, against the shared module EVERY world uses.
{
  const { cfg, s, hy } = gen({});
  const isGreat = (k) => hy.grid.riverOn.has(k) && hy.grid.bandOf(k) >= 2;

  // Every great-river crossing carries a bridge (dirt never bridges — batch 46).
  // Compare by HEX KEY, not distance: a bridge is planted at the crossing hex's
  // CENTRE, while these are points on the drawn (meandered, smoothed) line — and
  // a world hex is ~60 mi across, so a perfectly good bridge sits tens of miles
  // from the line that crosses it. The key is the exact test.
  const bridgeKeys = new Set(s.bridges.map((b) => hy.grid.worldKeyAt(b[0], b[1])));
  const crossed = new Set();
  for (const rt of s.routes) {
    if (rt.kind === 'dirt') continue;
    let prev = null;
    for (const [x, y] of rt.pts) {
      const k = hy.grid.worldKeyAt(x, y);
      const g = isGreat(k);
      if (g && prev === false) crossed.add(k);
      prev = g;
    }
  }
  const crossings = crossed.size;
  const unbridged = [...crossed].filter((k) => !bridgeKeys.has(k)).length;
  console.log(`   road×great-river crossing hexes: ${crossings}, unbridged: ${unbridged}`);
  unbridged === 0
    ? ok(`every great-river crossing is bridged (${crossings} crossings, ${s.bridges.length} bridges)`)
    : fail(`${unbridged}/${crossings} great-river crossings have NO bridge`);

  // No town left STRANDED — a clean assertion now, not a ratchet (item #11).
  //
  // The history is worth keeping, because the number kept meaning different
  // things: 7 (batch 101) → 5 → 3 (batch 118, the junction pass linking every
  // planned settlement to the nearest drawn road). Chasing the last 3 to ground
  // (batch 126) found they were never one bug:
  //   - TWO (Ithoth, Olaara) were placed IN THE SEA. A sub-hex the region octave
  //     (6 mi) calls good grass, the world octave (60 mi, which the road pass
  //     uses) calls open ocean — so the town sat in octW's water with no dry land
  //     within ten miles, and every road off it was severed at the doorstep.
  //     Fixed at the source: `siteAt` now rejects a sub-hex that is water at octW.
  //   - ONE (Koreia) is CORRECTLY trackless: its nearest neighbour is 689 mi off,
  //     past the 600 mi reach beyond which the town pass builds no road at all.
  //     It was never a bug; the old count just couldn't tell the two apart.
  //
  // So split them: a town beyond ISO_REACH of any neighbour is allowed to be
  // trackless; any nearer roadless town is STRANDED, and that must be zero. This
  // is strictly stronger than "<= 3" — it now fails on a single town stranded
  // beside a neighbour, which is the actual bug, while no longer miscounting the
  // genuinely remote as broken.
  const ISO_REACH = 600 * MI; // matches the town road-reach cutoff in settlements.ts
  const pts = s.routes.flatMap((r) => r.pts);
  const townish = s.nodes.filter((n) => n.tier !== 'village');
  const roadless = townish.filter((n) => !pts.some((p) => wrapD(cfg, p[0], p[1], n.x, n.y) < 8 * MI));
  const nearestOther = (n) => {
    let d = Infinity;
    for (const o of s.nodes) if (o !== n) d = Math.min(d, wrapD(cfg, n.x, n.y, o.x, o.y));
    return d;
  };
  const ranked = roadless.map((n) => ({ n, d: nearestOther(n) })).sort((a, b) => a.d - b.d);
  const stranded = ranked.filter((r) => r.d <= ISO_REACH);
  const isolated = ranked.filter((r) => r.d > ISO_REACH);
  // no settlement may sit in octW's water — the placement bug, asserted directly
  const inSea = s.nodes.filter((n) => WATER.has(biomeAt(cfg, n.x, n.y, octW)));
  console.log(`   towns+capitals: ${townish.length}, roadless: ${roadless.length} (stranded ${stranded.length}, correctly-isolated ${isolated.length}` +
    (ranked.length ? `: ${ranked.map((r) => `${r.n.name} ${(r.d / MI).toFixed(0)}mi`).join(', ')}` : '') + ')');
  inSea.length === 0
    ? ok(`no settlement sits in open sea at the road octave (${s.nodes.length} placed)`)
    : fail(`${inSea.length} settlements are in octW water — a road can never reach them (e.g. ${inSea[0].name})`);
  stranded.length === 0
    ? ok(`no town stranded beside a neighbour (${isolated.length} correctly trackless, >${ISO_REACH / MI}mi from anything — PLAN item #11 closed)`)
    : fail(`${stranded.length} town(s) roadless within reach of a neighbour — the #11 bug is back (e.g. ${stranded[0].n.name}, ${(stranded[0].d / MI).toFixed(0)}mi from its nearest)`);

  // ---- roads must not be drawn twice (items #10b / #30b) ----
  //
  // The owner, twice: roads drawn visibly parallel — two lines a mile or three
  // apart running together for tens of miles (their screenshot is Johannesburg).
  //
  // MEASURE THIS BY HEADING. Two cheaper metrics both lied, in opposite
  // directions, and between them nearly lost the fix:
  //   - by route id: a road is SPLIT into a route per rank change, so it counts
  //     a road against ITSELF. The worst "pair" on the fixture was one road
  //     either side of a bend (6.2%).
  //   - chaining routes that share an endpoint into "logical roads": a spur and
  //     its trunk share the hub, so it excludes the exact pair being measured,
  //     and reports 1.0% — small enough to talk yourself out of the fix. Worse,
  //     a junction stub landing mid-segment shares no vertex, so it doesn't
  //     chain and reads as a parallel road (2.5% — the metric moved the WRONG
  //     WAY across a change that halved the real artifact).
  // What the owner sees is two lines RUNNING TOGETHER: close, AND pointing the
  // same way. Heading is the discriminator, and with it no grouping hack is
  // needed at all — a spur meeting a trunk at 90° is a junction whoever's id it
  // carries. On the shipped Earth: 11.8% before, 5.2% after.
  {
    const NEAR = 3 * MI, COS = Math.cos((30 * Math.PI) / 180), TOUCH = 0.25 * MI;
    const segs = [];
    for (const rt of s.routes) {
      for (let i = 1; i < rt.pts.length; i++) {
        const [ax, ay] = rt.pts[i - 1], [bx, by] = rt.pts[i];
        if (Math.abs(bx - ax) > cfg.circumFt / 2) continue;
        const len = Math.hypot(bx - ax, by - ay);
        if (len < 1) continue;
        segs.push({ rid: rt.id, ax, ay, bx, by, ux: (bx - ax) / len, uy: (by - ay) / len });
      }
    }
    const G = 31_680, grid = new Map();
    for (const [i, sg] of segs.entries()) {
      const steps = Math.max(1, Math.ceil(Math.hypot(sg.bx - sg.ax, sg.by - sg.ay) / (G / 2)));
      let last = '';
      for (let t = 0; t <= steps; t++) {
        const x = sg.ax + (sg.bx - sg.ax) * (t / steps), y = sg.ay + (sg.by - sg.ay) * (t / steps);
        const k = Math.floor((((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt) / G) + ',' + Math.floor(y / G);
        if (k === last) continue; last = k;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
    }
    const segD2 = (px, py, g) => {
      const dx = g.bx - g.ax, dy = g.by - g.ay, d2 = dx * dx + dy * dy;
      let t = d2 > 0 ? ((px - g.ax) * dx + (py - g.ay) * dy) / d2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = g.ax + dx * t - px, qy = g.ay + dy * t - py;
      return qx * qx + qy * qy;
    };
    let totalMi = 0, parMi = 0;
    for (const sg of segs) {
      const len = Math.hypot(sg.bx - sg.ax, sg.by - sg.ay);
      const n = Math.max(1, Math.ceil(len / MI));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const x = sg.ax + (sg.bx - sg.ax) * t, y = sg.ay + (sg.by - sg.ay) * t;
        const mi = len / n / MI;
        totalMi += mi;
        const xn = ((x % cfg.circumFt) + cfg.circumFt) % cfg.circumFt;
        const cx = Math.floor(xn / G), cy = Math.floor(y / G);
        let hit = false;
        for (let dx = -1; dx <= 1 && !hit; dx++) for (let dy = -1; dy <= 1 && !hit; dy++) {
          for (const j of grid.get((cx + dx) + ',' + (cy + dy)) ?? []) {
            const o = segs[j];
            if (o.rid === sg.rid) continue;
            if (Math.abs(o.ux * sg.ux + o.uy * sg.uy) < COS) continue; // not running WITH it
            const d2 = segD2(xn, y, o);
            if (d2 > NEAR * NEAR || d2 < TOUCH * TOUCH) continue;      // a touch is a junction
            hit = true; break;
          }
        }
        if (hit) parMi += mi;
      }
    }
    const pct = (parMi / totalMi) * 100;
    // This world is ONE generateRoads call, so the dedupe sees the whole planet
    // and lands at 3.3%. The shipped Earth is 5.2% because `bake-earth-2026`
    // calls generateRoads PER COUNTRY (O(n²) A* over 1,500 global nodes "would
    // never finish"), and each call keeps its own drawn-edge set — so Nigeria
    // cannot see that Cameroon has already built the road it is about to build
    // alongside. That gap IS the remaining artifact, and it is the same root
    // cause as item #11's missing cross-border roads.
    // Guard the ABSOLUTE miles drawn alongside, not the ratio. The dead-end prune
    // (batch 135) removes non-parallel offcut miles, which shrinks the DENOMINATOR
    // and lifts the % even when nothing is doubled — here 3.5% → 4.5% while the
    // real figure, miles-run-twice, actually FELL 2,270 → 2,100. A ratio can't
    // tell those apart; the mileage can. So this is stricter than the old 4.0%
    // ratio, not looser: lower the ceiling whenever the number drops, and raise
    // it only with proof the doubling itself grew (not just the denominator).
    const MAX_PARALLEL_MI = 2_200; // 11.8%/~6,700mi in b117 → 2,270 (b118) → 2,100 (b135 prune)
    console.log(`   road-miles running WITH another road (≤3mi, within 30°): ${Math.round(parMi).toLocaleString()}/${Math.round(totalMi).toLocaleString()} (${pct.toFixed(1)}%)`);
    parMi <= MAX_PARALLEL_MI
      ? ok(`roads are not drawn twice (${Math.round(parMi).toLocaleString()}mi alongside, ${pct.toFixed(1)}% — PLAN item #10b)`)
      : fail(`${Math.round(parMi).toLocaleString()}mi of road run alongside another (>${MAX_PARALLEL_MI}) — the #10b doubling is back`);
  }

  // route ids must be unique — anything that looks a route up by id (select,
  // edit, delete) breaks silently on collisions
  const ids = new Set(s.routes.map((r) => r.id));
  ids.size === s.routes.length
    ? ok(`route ids unique (${ids.size})`)
    : fail(`route id collisions: ${s.routes.length} routes but only ${ids.size} unique ids`);
}

// 5. procedural (non-Earth) worlds also populate + road
{
  const s = generateSettlements(
    { seed: 'proc-smoke', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, landform: 'continents', continents: 3, waterPct: 55, climate: 'temperate', climateModel: 'earthlike' },
    generateHydrology({ seed: 'proc-smoke', circumFt: EARTH_CIRCUM_FT, heightFt: EARTH_HEIGHT_FT, landform: 'continents', continents: 3, waterPct: 55, climate: 'temperate', climateModel: 'earthlike' }).grid,
  );
  (s.nodes.length > 30 && s.routes.length > 20)
    ? ok(`procedural world populates too (${s.nodes.length} settlements, ${s.routes.length} roads)`)
    : fail(`procedural world under-populated: ${s.nodes.length} settlements, ${s.routes.length} roads`);
}

// ---- the browser must re-forge the roads for the world it is LOOKING AT ----
//
// `generateRoads` is shared, but its INPUT was derived twice: the bake computed
// each settlement's tier from a local variable, and world.astro re-derived it
// from tags as "capital → capital, town → town, everything else → village".
// The bake tags by CLASS though — 'city' at 500k, 'town' at 60k, 'village'
// below — so every city-tagged settlement came back a village, and so did a
// two-million-soul city that isn't a national capital.
//
// Nothing failed. A user who nudged one town just had every road on Earth
// re-forged for a world that doesn't exist: dirt tracks between megacities, and
// the isolation rule cutting most of them off entirely. `settleTier` is the one
// rule now; this holds it to the census the bake prints.
{
  const w = JSON.parse(readFileSync(new URL('../public/labs/earth.example.json', import.meta.url), 'utf8'));
  const by = { capital: 0, town: 0, village: 0 };
  for (const a of w.planes[0].anchors ?? []) {
    const e = w.entities[a.entityId];
    if (!e || e.kind !== 'settlement' || e.deleted) continue;
    by[settleTier(e.tags ?? [], Number(e.fields?.population ?? 0))]++;
  }
  const cities = by.capital + by.town;
  console.log(`   the browser reads the shipped Earth as ${by.capital} capitals, ${by.town} towns, ${by.village} villages`);
  // the bake prints "1500 cities placed … 2012 feeder villages" — the browser
  // has to agree, and it read 249/3/3260 before this rule was shared
  cities === 1500 && by.village === 2012
    ? ok(`settleTier reconstructs the bake's own census exactly (${cities} cities, ${by.village} villages)`)
    : fail(`the browser would re-forge roads for a different world: ${cities} cities (want 1500), ${by.village} villages (want 2012)`);
  by.town > 500
    ? ok(`${by.town} towns read as towns (read as 3 before — the rest were silently villages)`)
    : fail(`only ${by.town} settlements read as towns — city-tagged places are falling through to village again`);
}

// ---- one composite seed is ONE city (batch 123) ----
//
// A generated page is rolled off `gen.seed`, and that seed WAS just
// `earth/<iso2>/<city>` — which does not pin one city. `earth/CN/Fuyang` names
// two different real places (23 such pairs, all in China's romanized names), and
// where both were big enough to earn a generated page they rolled the SAME page:
// the same statblock name ("Citydale"), the same trade goods, differing only on
// the line the population option happened to move. It never tripped a check: the
// entity ids differ (the path carries coordinates), so nothing collided — two
// distinct cities just quietly read as one. A composite seed identifies a ROLL,
// so it must be unique; the fix folds the coordinates into it for shared names.
{
  const w = JSON.parse(readFileSync(new URL('../public/labs/earth.example.json', import.meta.url), 'utf8'));
  const bySeed = new Map();
  for (const e of Object.values(w.entities)) {
    const s = e.gen?.seed;
    if (!s || e.deleted) continue;
    (bySeed.get(s) ?? bySeed.set(s, []).get(s)).push(e.name);
  }
  const shared = [...bySeed.entries()].filter(([, v]) => v.length > 1);
  console.log(`   composite seeds: ${bySeed.size} over ${[...bySeed.values()].reduce((n, v) => n + v.length, 0)} generated pages`);
  shared.length === 0
    ? ok('every composite seed rolls exactly one page (no two cities share a statblock)')
    : fail(`${shared.length} seeds roll >1 page — a shared seed gives identical prose (e.g. ${shared[0][0]} → ${shared[0][1].join(' = ')})`);
}

console.log(failures ? `\nSettlement smoke FAILED: ${failures}` : 'Settlement smoke: all green.');
process.exit(failures ? 1 : 0);
