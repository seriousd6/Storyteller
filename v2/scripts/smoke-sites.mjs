// Site-generator smoke test (the nested-spaces epic): determinism, sealing,
// connectivity, the overrides storage contract, and OPD import. A failure
// here means generated floors would redraw under users' hand edits — the
// site equivalent of smoke-everdeep's "worlds silently redraw."
// Run: node scripts/smoke-sites.mjs (part of npm run smoke)

import { planFloor, cellsFor, makeGenerator, parseGenerator, importOnePageDungeon } from '../src/everdeep/siteGen.ts';
import { effectiveCells, writeCellOverride, siteIdForEntity } from '../src/everdeep/sites.ts';
import { sitePath } from '../src/everdeep/seeds.ts';

let failures = 0;
const fail = (msg) => { failures++; console.error('  ✗ ' + msg); };
const ok = (msg) => console.log('  ✓ ' + msg);

const OPEN = new Set(['floor', 'door', 'stairs', 'water', 'hazard', 'secret']);
const key = (x, y) => `${x},${y}`;

function components(cells, w, h) {
  const seen = new Set();
  const comps = [];
  for (const k of Object.keys(cells)) {
    if (!OPEN.has(cells[k].t) || seen.has(k)) continue;
    const comp = [];
    const stack = [k];
    seen.add(k);
    while (stack.length) {
      const c = stack.pop();
      comp.push(c);
      const i = c.indexOf(',');
      const x = Number(c.slice(0, i)), y = Number(c.slice(i + 1));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key(x + dx, y + dy);
        if (seen.has(nk)) continue;
        const n = cells[nk];
        if (n && OPEN.has(n.t)) { seen.add(nk); stack.push(nk); }
      }
    }
    comps.push(comp);
  }
  return comps;
}

// 1) determinism: the same generator+seed produces byte-identical plans, and
//    cellsFor (the override-resolution regen hook) matches planFloor exactly
{
  let clean = true;
  for (const [kind, w, h, opts] of [
    ['dungeon', 48, 36, { rooms: 6 }],
    ['cave', 48, 36, undefined],
    ['building', 24, 18, { type: 'tavern' }],
    ['town', 96, 96, undefined],
    ['city', 160, 160, { water: 'river' }],
    ['room', 20, 20, undefined],
  ]) {
    const gen = makeGenerator(kind, opts);
    const seed = sitePath('smoke-world', siteIdForEntity('smoke-world', 'e_abcdefghijklmn'), 0);
    const a = planFloor(gen, seed, w, h);
    const b = planFloor(gen, seed, w, h);
    if (JSON.stringify(a) !== JSON.stringify(b)) { fail(`${kind}: two runs differ`); clean = false; }
    if (JSON.stringify(a.cells) !== JSON.stringify(cellsFor({ generator: gen, seed }, w, h))) {
      fail(`${kind}: cellsFor != planFloor.cells — overrides would land on a different base`); clean = false;
    }
    if (kind !== 'room') { // the blank room shell is rng-free by design
      const c = planFloor(gen, seed + '/r:1', w, h);
      if (JSON.stringify(a.cells) === JSON.stringify(c.cells)) { fail(`${kind}: reroll suffix changed nothing`); clean = false; }
    }
  }
  if (clean) ok('deterministic: same seed → same plan; regen hook matches; reroll moves');
}

// 2) generator string round-trip
{
  const g = makeGenerator('dungeon', { rooms: 7 });
  const p = parseGenerator(g);
  if (!p || p.kind !== 'dungeon' || p.opts.rooms !== '7') fail(`generator round-trip broke: ${g}`);
  else ok('generator id round-trips its options');
}

// 3) interiors are sealed and fully connected (dungeon / cave / building /
//    room, across seeds) — every open cell reachable, nothing leaks into void
{
  let clean = true;
  for (const kind of ['dungeon', 'cave', 'building', 'room']) {
    for (let s = 0; s < 6; s++) {
      const [w, h] = kind === 'building' ? [24, 18] : [48, 36];
      // buildings: the SEALED standalone interior is v1 (still dispatched for
      // floors minted before R5); the v2 block window is open by design (its
      // streets run off-map) and owns its own reachability check in 5i
      const gen = kind === 'building' ? 'site:building:v1?type=tavern'
        : makeGenerator(kind, kind === 'dungeon' ? { rooms: 5 } : undefined);
      const { cells, areas } = planFloor(gen, `smoke/${kind}/s:${s}`, w, h);
      const comps = components(cells, w, h);
      if (comps.length !== 1) { fail(`${kind} seed ${s}: ${comps.length} disconnected pockets`); clean = false; }
      // sealed: interior open cells (not doors/stairs, which may pierce the
      // shell as the way in/out) never touch void or the map edge
      for (const [k, c] of Object.entries(cells)) {
        if (!['floor', 'water', 'hazard'].includes(c.t)) continue;
        const i = k.indexOf(',');
        const x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) { fail(`${kind} seed ${s}: open cell ${k} on the map edge`); clean = false; continue; }
          if (!cells[key(nx, ny)]) { fail(`${kind} seed ${s}: open cell ${k} leaks into void`); clean = false; }
        }
      }
      for (const a of areas) {
        if (a.x < 0 || a.y < 0 || a.x + a.w > w || a.y + a.h > h) { fail(`${kind} seed ${s}: area ${a.label} out of bounds`); clean = false; }
      }
      const ids = new Set(areas.map((a) => a.id));
      if (ids.size !== areas.length) { fail(`${kind} seed ${s}: duplicate area ids`); clean = false; }
    }
  }
  if (clean) ok('dungeon/cave/building/room: sealed, one connected interior, areas in bounds (6 seeds each)');
}

// 4) dungeon honours the content marriage: rooms=N yields exactly N keyed
//    rooms plus gate and sanctum
{
  const { areas } = planFloor(makeGenerator('dungeon', { rooms: 6 }), 'smoke/marriage', 48, 36);
  const rooms = areas.filter((a) => a.kind === 'room').length;
  const gate = areas.some((a) => a.kind === 'entrance');
  const sanct = areas.some((a) => a.kind === 'sanctum');
  if (rooms !== 6 || !gate || !sanct) fail(`dungeon rooms=6 → ${rooms} rooms, gate=${gate}, sanctum=${sanct}`);
  else ok('dungeon rooms=N marries the composite: N keyed rooms + gate + sanctum');
}

// 5) settlements: the DEFAULT mint (now v5, the rough overview) carries a
//    plaza, ward zones, a gated hull, and streets. The terraced-fabric wall
//    mass moved down a level — it's tested against v4 in 5f/5k, not here.
{
  let clean = true;
  for (let s = 0; s < 4; s++) {
    const { cells, areas } = planFloor(makeGenerator('city', { walls: '1' }), `smoke/city/s:${s}`, 160, 160);
    if (!areas.some((a) => a.kind === 'plaza')) { fail(`city seed ${s}: no plaza`); clean = false; }
    if (!areas.some((a) => a.kind === 'district')) { fail(`city seed ${s}: no districts`); clean = false; }
    const t = Object.values(cells).reduce((acc, c) => { acc[c.t] = (acc[c.t] ?? 0) + 1; return acc; }, {});
    if (!(t.door > 4)) { fail(`city seed ${s}: only ${t.door ?? 0} gate doors`); clean = false; }
    if (!(t.wall > 100)) { fail(`city seed ${s}: no city wall/hull (${t.wall ?? 0} wall cells)`); clean = false; }
    if (!(t.floor > 800)) { fail(`city seed ${s}: suspiciously few street/zone cells (${t.floor ?? 0})`); clean = false; }
    if (!Object.values(cells).some((c) => c.zone != null)) { fail(`city seed ${s}: no ward zones`); clean = false; }
  }
  if (clean) ok('city plans (v5 default) carry plaza, ward zones, a gated hull, and streets (4 seeds)');
}

// 5a-pop) the overview core SCALES WITH POPULATION (batch 312): a market city
//   fills a small core with broad outskirts; a metropolis packs its core wide.
//   Opt-in on `pop` — the popless default above stays the frozen 0.45 core (its
//   own test guards byte-identity), so this only asserts the scaling ordering.
{
  const W = 240, seed = 'smoke/city-pop';
  const coreSpan = (pop) => {
    const opts = { walls: '1' };
    if (pop) opts.pop = pop;
    const { cells } = planFloor(makeGenerator('city', opts), seed, W, W);
    let minX = W, maxX = 0, minY = W, maxY = 0;
    for (const [k, c] of Object.entries(cells)) {
      if (c.t !== 'wall') continue; // the walled hull traces the core
      const i = k.indexOf(','), x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return Math.max(maxX - minX, maxY - minY);
  };
  const small = coreSpan(9_000), dflt = coreSpan(0), big = coreSpan(1_500_000);
  if (!(big > small + 20)) fail(`city core does not scale with pop: 9k span ${small}, 1.5M span ${big}`);
  else if (!(dflt >= small && dflt <= big)) fail(`popless core span ${dflt} not between 9k ${small} and 1.5M ${big}`);
  else ok(`city overview core scales with population (9k span ${small} < popless ${dflt} < 1.5M ${big})`);
}

// 5b) city v2 (Voronoi wards): new cities carry :v2 in the generator id;
//     the :v1 id still dispatches ITS OWN algorithm on the same seed (an
//     existing floor's overrides sit on v1 geometry — redrawing it under
//     them is the exact drift this file exists to catch); and the plan is
//     walkable: every ring gate reaches the plaza without crossing water
{
  const W = 140, seed = 'smoke/city-v2';
  const v1 = planFloor('site:city:v1', seed, W, W);
  const v2 = planFloor('site:city:v2', seed, W, W);
  if (!v1.areas.some((a) => a.kind === 'plaza') || !v1.areas.some((a) => a.kind === 'district')) {
    fail('site:city:v1 stopped producing the v1 plan — old floors would redraw under their overrides');
  }
  if (JSON.stringify(v1.cells) === JSON.stringify(v2.cells)) {
    fail('v1 and v2 agree cell-for-cell on one seed — the version branch is dead');
  }
  const districts = v2.areas.filter((a) => a.kind === 'district');
  if (districts.length < 4) fail(`city v2: only ${districts.length} ward districts`);

  // walk the city on land: flood from the plaza centre over everything
  // open-but-not-water; gates and nearly all paved ground must be reached
  const landWalk = (plan) => {
    const walkable = new Set(['floor', 'door', 'stairs', 'hazard', 'secret']);
    const pa = plan.areas.find((a) => a.kind === 'plaza');
    const start = key(pa.x + (pa.w >> 1), pa.y + (pa.h >> 1));
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const k = stack.pop();
      const i = k.indexOf(',');
      const x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key(x + dx, y + dy);
        if (!seen.has(nk) && walkable.has(plan.cells[nk]?.t)) { seen.add(nk); stack.push(nk); }
      }
    }
    const open = Object.entries(plan.cells).filter(([, c]) => walkable.has(c.t));
    return { seen, reached: open.filter(([k]) => seen.has(k)).length / (open.length || 1) };
  };
  const { seen, reached } = landWalk(v2);
  const ringGates = Object.entries(v2.cells).filter(([k, c]) => {
    if (c.t !== 'door') return false;
    const [x, y] = k.split(',').map(Number);
    return x === 1 || y === 1 || x === W - 2 || y === W - 2;
  });
  if (ringGates.length < 4) fail(`city v2: only ${ringGates.length} gate door cells on the ring`);
  const cut = ringGates.filter(([k]) => !seen.has(k));
  if (cut.length) fail(`city v2: ${cut.length} gate cells cut off from the plaza`);
  if (reached < 0.95) fail(`city v2: only ${(reached * 100).toFixed(0)}% of the paved city reaches the plaza`);
  // a river city still holds together — the avenues bridge it
  const river = planFloor('site:city:v2?water=river', 'smoke/city-v2-river', W, W);
  const waterCells = Object.values(river.cells).filter((c) => c.t === 'water').length;
  if (waterCells < 100) fail(`city v2 river: only ${waterCells} water cells`);
  const r2 = landWalk(river);
  if (r2.reached < 0.85) fail(`city v2 river: only ${(r2.reached * 100).toFixed(0)}% walkable from the plaza — no bridge?`);
  if (!failures) ok('city v2: wards + gates walkable, rivers bridged, and site:city:v1 still dispatches v1');
}

// 5c) city v3 — the true-footprint OVERVIEW (LAYERED-SPACES.md N-1): new
//     cities mint :v3; v2 still dispatches its own algorithm (existing city
//     floors keep their geometry under their overrides); the overview's wall
//     ring sits strictly INSIDE the map (a core, not a border), avenues run
//     on to the map edges, a full-map river crosses border to border, and
//     the burrows key hamlet districts outside the walls
{
  const W = 240, seed = 'smoke/city-v3';
  const v2 = planFloor('site:city:v2?water=river', seed, W, W);
  const v3 = planFloor('site:city:v3?water=river', seed, W, W);
  if (!v2.areas.some((a) => a.kind === 'plaza')) {
    fail('site:city:v2 stopped producing the v2 plan — old floors would redraw under their overrides');
  }
  if (JSON.stringify(v2.cells) === JSON.stringify(v3.cells)) {
    fail('v2 and v3 agree cell-for-cell on one seed — the version branch is dead');
  }
  let clean = true;
  for (let s = 0; s < 4; s++) {
    const plan = planFloor('site:city:v3?water=river', `smoke/city-v3/s:${s}`, W, W);
    if (!plan.areas.some((a) => a.kind === 'plaza')) { fail(`v3 seed ${s}: no plaza`); clean = false; }
    // the wall ring is a CORE: no wall cell may touch the map border
    let borderWalls = 0, edgeFloorSides = new Set(), waterSides = new Set();
    for (const [k, c] of Object.entries(plan.cells)) {
      const [x, y] = k.split(',').map(Number);
      const onBorder = x === 0 || y === 0 || x === W - 1 || y === W - 1;
      if (!onBorder) continue;
      if (c.t === 'wall') borderWalls++;
      if (c.t === 'floor') edgeFloorSides.add(x === 0 ? 'w' : x === W - 1 ? 'e' : y === 0 ? 'n' : 's');
      if (c.t === 'water') waterSides.add(x === 0 ? 'w' : x === W - 1 ? 'e' : y === 0 ? 'n' : 's');
    }
    if (borderWalls) { fail(`v3 seed ${s}: ${borderWalls} wall cells on the map border — the core leaked to the edge`); clean = false; }
    if (edgeFloorSides.size < 2) { fail(`v3 seed ${s}: avenues reach only ${edgeFloorSides.size} map edges`); clean = false; }
    const opposite = (waterSides.has('n') && waterSides.has('s')) || (waterSides.has('e') && waterSides.has('w'));
    if (!opposite) { fail(`v3 seed ${s}: river does not cross the map border to border`); clean = false; }
    // burrows: hamlet districts (the 15×13 clusters) beyond the ward fabric
    const hamlets = plan.areas.filter((a) => a.kind === 'district' && a.w === 15 && a.h === 13);
    if (!hamlets.length) { fail(`v3 seed ${s}: no burrow hamlets keyed`); clean = false; }
  }
  if (clean) ok('city v3 overview: interior wall core, edge-running avenues, border-to-border river, keyed burrows (4 seeds)');
}

// 5c-bis) VERISIMILITUDE (R1): the `gates` opt puts the gates — and thus the
//     avenues that reach the map edge — on the sides the world roads approach
//     from. Directional proof: gates=n runs an avenue to the NORTH edge and
//     not the south; gates=s is the mirror; every requested side is served.
{
  const W = 240;
  const edgesWithAvenue = (opt, seed) => {
    const plan = planFloor(`site:city:v3?${opt}`, seed, W, W);
    const sidesHit = new Set();
    for (const [k, c] of Object.entries(plan.cells)) {
      if (c.t !== 'floor') continue;
      const [x, y] = k.split(',').map(Number);
      if (x === 0) sidesHit.add('w'); else if (x === W - 1) sidesHit.add('e');
      if (y === 0) sidesHit.add('n'); else if (y === W - 1) sidesHit.add('s');
    }
    return sidesHit;
  };
  let clean = true;
  for (let s = 0; s < 3; s++) {
    const seed = `smoke/city-gates/s:${s}`;
    const north = edgesWithAvenue('gates=n', seed);
    const south = edgesWithAvenue('gates=s', seed);
    if (!north.has('n')) { fail(`gates=n seed ${s}: no avenue reaches the north edge`); clean = false; }
    if (north.has('s')) { fail(`gates=n seed ${s}: an avenue reached the SOUTH edge (gate ignored)`); clean = false; }
    if (!south.has('s')) { fail(`gates=s seed ${s}: no avenue reaches the south edge`); clean = false; }
    if (south.has('n')) { fail(`gates=s seed ${s}: an avenue reached the NORTH edge (gate ignored)`); clean = false; }
    // every requested side is served (a 3-road crossroads city)
    const three = edgesWithAvenue('gates=new', seed);
    for (const side of ['n', 'e', 'w']) if (!three.has(side)) { fail(`gates=new seed ${s}: ${side} gate not served`); clean = false; }
  }
  // determinism: same gates opt + seed → identical plan
  const a = planFloor('site:city:v3?gates=ne', 'smoke/city-gates/det', W, W);
  const b = planFloor('site:city:v3?gates=ne', 'smoke/city-gates/det', W, W);
  if (JSON.stringify(a) !== JSON.stringify(b)) { fail('gates: not deterministic under the same opt'); clean = false; }
  // and a different gate set is a different city
  const c = planFloor('site:city:v3?gates=sw', 'smoke/city-gates/det', W, W);
  if (JSON.stringify(a.cells) === JSON.stringify(c.cells)) { fail('gates: ne and sw produced the same city — opt ignored'); clean = false; }
  if (clean) ok('city gates: the road-approach sides drive the gates/avenues (directional, served, deterministic)');
}

// 5f) CITY SHAPES (R2): new cities mint v4 with an ORGANIC ward-hull wall —
//     no long straight core wall (unlike v3's rectangle), a different
//     silhouette every seed, still plaza+districts+burrows, gates honored,
//     plaza connected to the gates, deterministic. v3 stays rectangular.
{
  // v4 is no longer the default mint (v5 is — see 5k); the organic hull it
  // introduced is still dispatched and tested here explicitly.
  const W = 240;
  const maxVertWall = (plan) => {
    let best = 0;
    for (let x = 0; x < W; x++) {
      let run = 0;
      for (let y = 0; y < W; y++) {
        if (plan.cells[`${x},${y}`]?.t === 'wall') { run++; if (run > best) best = run; } else run = 0;
      }
    }
    return best;
  };
  let clean = true;
  for (let s = 0; s < 4; s++) {
    const seed = `smoke/city-v4/s:${s}`;
    const v3 = planFloor('site:city:v3', seed, W, W);
    const v4 = planFloor('site:city:v4', seed, W, W);
    if (JSON.stringify(v3.cells) === JSON.stringify(v4.cells)) { fail(`v4 seed ${s}: identical to v3 — the shape branch is dead`); clean = false; }
    // the organic hull has no long straight wall; the v3 rectangle does
    const w4 = maxVertWall(v4), w3 = maxVertWall(v3);
    if (!(w4 < 45 && w4 <= w3 - 15)) { fail(`v4 seed ${s}: core wall not organic (v4 maxVertWall=${w4}, v3=${w3})`); clean = false; }
    if (!v4.areas.some((a) => a.kind === 'plaza')) { fail(`v4 seed ${s}: no plaza`); clean = false; }
    if (!v4.areas.some((a) => a.kind === 'district')) { fail(`v4 seed ${s}: no ward districts`); clean = false; }
    if (!v4.areas.some((a) => a.kind === 'district' && a.w === 15 && a.h === 13)) { fail(`v4 seed ${s}: no burrows`); clean = false; }
  }
  // gates honored on the organic hull, and plaza reaches the gate avenue edge
  const gated = planFloor('site:city:v4?gates=n', 'smoke/city-v4/gate', W, W);
  const edgesHit = new Set();
  for (const [k, c] of Object.entries(gated.cells)) {
    if (c.t !== 'floor') continue;
    const [x, y] = k.split(',').map(Number);
    if (y === 0) edgesHit.add('n'); else if (y === W - 1) edgesHit.add('s');
  }
  if (!edgesHit.has('n')) { fail('v4 gates=n: no avenue reaches the north edge'); clean = false; }
  if (edgesHit.has('s')) { fail('v4 gates=n: an avenue reached the SOUTH edge (gate ignored)'); clean = false; }
  // plaza walks out to the north edge through the gate (the hull is pierced)
  const pl = gated.areas.find((a) => a.kind === 'plaza');
  const walk = new Set(['floor', 'door', 'stairs']);
  const seen = new Set([`${pl.x + (pl.w >> 1)},${pl.y + (pl.h >> 1)}`]);
  const stack = [...seen];
  let reachedNorth = false;
  while (stack.length) {
    const k = stack.pop();
    const i = k.indexOf(',');
    const x = +k.slice(0, i), y = +k.slice(i + 1);
    if (y === 0) reachedNorth = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nk = `${x + dx},${y + dy}`;
      if (!seen.has(nk) && walk.has(gated.cells[nk]?.t)) { seen.add(nk); stack.push(nk); }
    }
  }
  if (!reachedNorth) { fail('v4 gates=n: the plaza does not walk out through the north gate — the hull is not pierced'); clean = false; }
  const d1 = planFloor('site:city:v4?water=river', 'smoke/city-v4/det', W, W);
  const d2 = planFloor('site:city:v4?water=river', 'smoke/city-v4/det', W, W);
  if (JSON.stringify(d1) !== JSON.stringify(d2)) { fail('v4: not deterministic'); clean = false; }
  if (clean) ok('city v4: organic ward-hull wall (no long straight wall, seed-varied), gates pierce the hull, plaza connected, v3 still rectangular');
}

// 5k) ROUGH OVERVIEW (R7α, city v5): the NEW default mint. The top level shows
//     only ROUGH SHAPES — ward ZONES (tinted floor) + the road/wall/water
//     skeleton + named building FLAGS — NOT individual buildings. Flags are
//     drillable. v4's terraced fabric is frozen and still dispatches.
{
  const W = 240;
  let clean = true;
  if (!makeGenerator('city').startsWith('site:city:v5')) { fail(`new city mints ${makeGenerator('city')} — expected v5`); clean = false; }
  const seed = 'smoke/city-v5';
  const v5 = planFloor('site:city:v5?water=river', seed, W, W);
  const v4 = planFloor('site:city:v4?water=river', seed, W, W);
  const wallsV5 = Object.values(v5.cells).filter((c) => c.t === 'wall').length;
  const wallsV4 = Object.values(v4.cells).filter((c) => c.t === 'wall').length;
  // no building masses: the only walls are the hull (+ the plaza monument), so
  // v5 carries a small FRACTION of v4's terraced wall mass
  if (!(wallsV5 < wallsV4 * 0.35)) { fail(`v5 not rough: ${wallsV5} walls vs v4 ${wallsV4} (want < 35%)`); clean = false; }
  // ward ZONES: many floor cells carry a zone tint, across several wards
  const zoneCells = Object.values(v5.cells).filter((c) => c.t === 'floor' && c.zone != null);
  const zoneSet = new Set(zoneCells.map((c) => c.zone));
  if (zoneCells.length < 1000) { fail(`v5 zones: only ${zoneCells.length} tinted zone cells`); clean = false; }
  if (zoneSet.size < 4) { fail(`v5 zones: only ${zoneSet.size} distinct wards tinted`); clean = false; }
  if (Object.values(v4.cells).some((c) => c.zone != null)) { fail('v4 gained zone tints — the frozen fabric changed'); clean = false; }
  // FLAGS: named notable buildings, drillable (kind building), incl. a hall/inn
  const flags = (v5.areas ?? []).filter((a) => a.flag);
  if (flags.length < 4) { fail(`v5 flags: only ${flags.length} named flags`); clean = false; }
  if (!flags.every((f) => f.kind === 'building' && f.label)) { fail('v5 flags: a flag is not a named building'); clean = false; }
  if (!flags.some((f) => f.label === 'The Town Hall')) { fail('v5 flags: no Town Hall'); clean = false; }
  if ((v4.areas ?? []).some((a) => a.flag)) { fail('v4 gained flags — the frozen fabric changed'); clean = false; }
  // the SKELETON survives: water (a river crosses), the plaza, ward districts,
  // and an avenue still runs to a map edge
  if (!Object.values(v5.cells).some((c) => c.t === 'water')) { fail('v5: the river vanished'); clean = false; }
  if (!(v5.areas ?? []).some((a) => a.kind === 'plaza')) { fail('v5: no plaza'); clean = false; }
  if (!(v5.areas ?? []).some((a) => a.kind === 'district')) { fail('v5: no ward zones keyed'); clean = false; }
  let edge = false;
  for (let x = 0; x < W; x++) if (v5.cells[`${x},0`]?.t === 'floor' || v5.cells[`${x},${W - 1}`]?.t === 'floor') edge = true;
  if (!edge) { fail('v5: no avenue reaches a map edge'); clean = false; }
  // deterministic
  const a2 = planFloor('site:city:v5?water=river', 'smoke/city-v5/det', W, W);
  const b2 = planFloor('site:city:v5?water=river', 'smoke/city-v5/det', W, W);
  if (JSON.stringify(a2) !== JSON.stringify(b2)) { fail('v5: not deterministic'); clean = false; }
  if (clean) ok(`rough overview (R7α): v5 = ${zoneSet.size} ward zones + skeleton + ${flags.length} flags, only ${wallsV5} walls (no buildings) vs v4 ${wallsV4}; drillable; v4 frozen`);
}

// 5g) ROLE COLORS (R3): a v4 city tints its notable buildings and a couple
//     of inns with a COSMETIC role (never changes cell type); the frozen
//     v2/v3 cities carry no role at all.
{
  const W = 240;
  let clean = true;
  const v4 = planFloor('site:city:v4?water=river', 'smoke/roles', W, W);
  const roled = Object.values(v4.cells).filter((c) => c.t === 'wall' && c.role);
  const roles = new Set(roled.map((c) => c.role));
  if (roled.length < 8) { fail(`v4 roles: only ${roled.length} tinted building cells`); clean = false; }
  if (!roles.has('inn')) { fail('v4 roles: no inn tinted (the owner asked for inns)'); clean = false; }
  if (![...roles].some((r) => r !== 'inn')) { fail('v4 roles: no civic landmark tinted'); clean = false; }
  if (!v4.areas.some((a) => a.kind === 'building' && /Pony|Eel|Dragon|Wayfarer|Shield|Kettle/.test(a.label))) { fail('v4 roles: no inn keyed'); clean = false; }
  // the frozen cities stay untinted
  const v3 = planFloor('site:city:v3?water=river', 'smoke/roles', W, W);
  if (Object.values(v3.cells).some((c) => c.role)) { fail('v3 gained roles — the frozen city changed'); clean = false; }
  const v2 = planFloor('site:city:v2?water=river', 'smoke/roles', W, W);
  if (Object.values(v2.cells).some((c) => c.role)) { fail('v2 gained roles — the frozen city changed'); clean = false; }
  const a = planFloor('site:city:v4?water=river', 'smoke/roles/det', W, W);
  const b = planFloor('site:city:v4?water=river', 'smoke/roles/det', W, W);
  if (JSON.stringify(a) !== JSON.stringify(b)) { fail('v4 roles: not deterministic'); clean = false; }
  // a drilled district tints its landmark too
  const dist = planFloor('site:district:v1', 'smoke/roles/dist', 100, 100);
  if (!Object.values(dist.cells).some((c) => c.t === 'wall' && c.role)) { fail('district: landmark not tinted'); clean = false; }
  if (clean) ok('city roles: v4 tints inns + civic landmarks (keyed), districts tint their landmark, v2/v3 untinted, deterministic');
}

// 5h) DE-BOX (R4): terracing removes the full-perimeter floor moat, so
//     building masses fuse into blocks (mean interior wall-block ≥1.4x v3's
//     moated boxes) divided by streets, not a box of boxes; enclosed pockets
//     become green garden courts; the plaza gains a civic monument + a town
//     hall fronting it. All v4-only — the frozen v2/v3 stay byte-identical.
{
  const W = 240;
  let clean = true;
  const key2 = (x, y) => `${x},${y}`;
  // mean size of interior wall/door components (4-connected), the hull (the
  // single largest component = the ring wall) dropped: a MOATED city's boxes
  // stay small and separate; TERRACED blocks fuse and grow.
  const meanBlock = (plan) => {
    const cells = plan.cells;
    const seen = new Set(); const sizes = [];
    for (const k of Object.keys(cells)) {
      const t = cells[k].t;
      if ((t !== 'wall' && t !== 'door') || seen.has(k)) continue;
      const stack = [k]; seen.add(k); let n = 0;
      while (stack.length) {
        const cur = stack.pop(); n++;
        const i = cur.indexOf(','); const x = +cur.slice(0, i), y = +cur.slice(i + 1);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nk = key2(x + dx, y + dy); if (seen.has(nk)) continue;
          const nc = cells[nk]; if (nc && (nc.t === 'wall' || nc.t === 'door')) { seen.add(nk); stack.push(nk); }
        }
      }
      sizes.push(n);
    }
    sizes.sort((a, b) => b - a);
    const interior = sizes.slice(1); // drop the hull ring
    return interior.length ? interior.reduce((s, v) => s + v, 0) / interior.length : 0;
  };
  const seed = 'smoke/debox';
  const v4 = planFloor('site:city:v4?water=river', seed, W, W);
  const v3 = planFloor('site:city:v3?water=river', seed, W, W);
  const b4 = meanBlock(v4), b3 = meanBlock(v3);
  if (!(b4 >= b3 * 1.4)) { fail(`v4 de-box: blocks did not fuse (mean interior wall-block v4=${b4.toFixed(1)} vs v3=${b3.toFixed(1)}; want ≥1.4x)`); clean = false; }

  // garden courts: green-role FLOOR pockets exist as real courts (not slivers)
  const gardenCells = Object.values(v4.cells).filter((c) => c.t === 'floor' && c.role === 'garden');
  const gseen = new Set(); let courts = 0;
  for (const k of Object.keys(v4.cells)) {
    if (v4.cells[k].role !== 'garden' || v4.cells[k].t !== 'floor' || gseen.has(k)) continue;
    courts++; const stack = [k]; gseen.add(k);
    while (stack.length) {
      const cur = stack.pop(); const i = cur.indexOf(','); const x = +cur.slice(0, i), y = +cur.slice(i + 1);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key2(x + dx, y + dy);
        if (!gseen.has(nk) && v4.cells[nk]?.role === 'garden') { gseen.add(nk); stack.push(nk); }
      }
    }
  }
  if (gardenCells.length < 60) { fail(`v4 gardens: only ${gardenCells.length} garden-court cells`); clean = false; }
  if (courts < 4) { fail(`v4 gardens: only ${courts} distinct courts`); clean = false; }

  // civic heart: a town hall keyed FRONTING the plaza, and a lone monument (a
  // civic-role wall cell ringed on all four sides by floor — the market cross)
  if (!v4.areas.some((a) => a.kind === 'building' && a.label === 'The Town Hall')) { fail('v4: no Town Hall fronting the plaza'); clean = false; }
  const isFloor = (x, y) => v4.cells[key2(x, y)]?.t === 'floor';
  let monument = false;
  for (const k of Object.keys(v4.cells)) {
    const c = v4.cells[k]; if (c.t !== 'wall' || c.role !== 'civic') continue;
    const i = k.indexOf(','); const x = +k.slice(0, i), y = +k.slice(i + 1);
    if (isFloor(x + 1, y) && isFloor(x - 1, y) && isFloor(x, y + 1) && isFloor(x, y - 1)) { monument = true; break; }
  }
  if (!monument) { fail('v4: no plaza monument (a lone civic wall cell ringed by floor)'); clean = false; }

  // the frozen cities gain NO garden floor and NO town hall (R4 is v4-only)
  if (Object.values(v3.cells).some((c) => c.role === 'garden')) { fail('v3 gained garden courts — the frozen city changed'); clean = false; }
  if (v3.areas.some((a) => a.label === 'The Town Hall')) { fail('v3 gained a Town Hall — the frozen city changed'); clean = false; }

  if (clean) ok(`city de-box (R4): terraced blocks fuse (${(b4 / b3).toFixed(1)}x v3's boxes), ${courts} garden courts, town hall + plaza monument; v3 frozen`);
}

// 5i) TACTICAL WINDOW (R5): drilling a building opens a 40×40 @5 ft (=200 ft)
//     BLOCK, not a footprint in a void — the clicked building detailed in the
//     centre with a door onto the street, a garden yard behind, neighbour
//     facades around it (cover), and the parent's water/wall on flagged edges.
//     Every interior room stays reachable from the block edge (you walk in off
//     the street). v1 (standalone interior) still dispatches unchanged.
{
  const W = 40;
  let clean = true;
  const key2 = (x, y) => `${x},${y}`;
  const walk = new Set(['floor', 'door', 'stairs']);
  // flood the outdoors from the block edge; a real in-city battle map lets you
  // walk from the street into the building
  const reachFromEdge = (cells) => {
    const seen = new Set(); const stack = [];
    const push = (x, y) => { const k = key2(x, y); if (!seen.has(k) && walk.has(cells[k]?.t)) { seen.add(k); stack.push(k); } };
    for (let i = 0; i < W; i++) { push(i, 0); push(i, W - 1); push(0, i); push(W - 1, i); }
    while (stack.length) { const k = stack.pop(); const [x, y] = k.split(',').map(Number);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) push(x + dx, y + dy); }
    return seen;
  };
  const blk = planFloor('site:building:v2?type=tavern&door=s&edge=oooo&bw=10&bh=9', 'smoke/blk', W, W);
  const rooms = (blk.areas ?? []).filter((a) => a.kind === 'room');
  if (rooms.length < 2) { fail(`v2 block: only ${rooms.length} interior rooms`); clean = false; }
  const seen = reachFromEdge(blk.cells);
  const unreached = rooms.filter((a) => {
    for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) if (seen.has(key2(x, y))) return false;
    return true;
  });
  if (unreached.length) { fail(`v2 block: ${unreached.length} room(s) walled off from the street — can't fight in`); clean = false; }
  // the garden yard behind the building
  if (!Object.values(blk.cells).some((c) => c.t === 'floor' && c.role === 'garden')) { fail('v2 block: no garden yard'); clean = false; }
  // neighbour facades: wall mass out in the block, away from the central target
  const outerWall = Object.entries(blk.cells).filter(([k, c]) => {
    if (c.t !== 'wall') return false; const [x, y] = k.split(',').map(Number);
    return Math.abs(x - W / 2) > 13 || Math.abs(y - W / 2) > 13;
  }).length;
  if (outerWall < 8) { fail(`v2 block: only ${outerWall} neighbour-facade wall cells (no surrounding block)`); clean = false; }
  // deterministic
  const a = planFloor('site:building:v2?type=house&door=e&edge=oooo&bw=8&bh=8', 'smoke/blk/det', W, W);
  const b = planFloor('site:building:v2?type=house&door=e&edge=oooo&bw=8&bh=8', 'smoke/blk/det', W, W);
  if (JSON.stringify(a) !== JSON.stringify(b)) { fail('v2 block: not deterministic'); clean = false; }
  // the parent's edges: a waterfront quay / a city rampart on flagged sides
  const wet = planFloor('site:building:v2?type=shop&door=s&edge=rooo&bw=8&bh=8', 'smoke/blk/wet', W, W);
  let northWater = 0; for (let x = 0; x < W; x++) if (wet.cells[key2(x, 0)]?.t === 'water') northWater++;
  if (northWater < W * 0.6) { fail(`v2 block: edge=r north not a waterfront (${northWater}/${W} water)`); clean = false; }
  const dry = planFloor('site:building:v2?type=shop&door=s&edge=oooo&bw=8&bh=8', 'smoke/blk/wet', W, W);
  if (Object.values(dry.cells).some((c) => c.t === 'water')) { fail('v2 block: edge=o gained water'); clean = false; }
  // v1 standalone interior still dispatches, unchanged (no yard, fills the grid)
  const v1 = planFloor('site:building:v1?type=house', 'smoke/blk', W, W);
  if (Object.values(v1.cells).some((c) => c.role === 'garden')) { fail('v1 building gained a yard — the frozen generator changed'); clean = false; }
  if (JSON.stringify(v1.cells) === JSON.stringify(blk.cells)) { fail('v1 and v2 buildings identical — the block branch is dead'); clean = false; }
  if (clean) ok(`building tactical window (R5): 200 ft block, all ${rooms.length} rooms reachable off the street, garden yard, neighbour facades, water/wall edges; v1 standalone frozen`);
}

// 5j) INTERIOR CHARACTER (R6): each building type furnishes DISTINCTLY — a
//     temple lays a nave of pews + an altar + a font, a smithy a forge behind
//     its shopfront counter, a tavern a long bar, a keep a great hall — so
//     interiors read as themselves, not bare boxes. Furniture is cosmetic
//     (the cell stays floor, never blocking), the plan stays reachable from
//     the street, and the frozen v1 building carries none.
{
  const W = 40; let clean = true;
  const key2 = (x, y) => `${x},${y}`;
  const walk = new Set(['floor', 'door', 'stairs']);
  const reachAll = (plan) => {
    const cells = plan.cells; const seen = new Set(); const stack = [];
    const push = (x, y) => { const k = key2(x, y); if (!seen.has(k) && walk.has(cells[k]?.t)) { seen.add(k); stack.push(k); } };
    for (let i = 0; i < W; i++) { push(i, 0); push(i, W - 1); push(0, i); push(W - 1, i); }
    while (stack.length) { const k = stack.pop(); const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) push(x + dx, y + dy); }
    return (plan.areas ?? []).filter((a) => a.kind === 'room').every((a) => {
      for (let y = a.y; y < a.y + a.h; y++) for (let x = a.x; x < a.x + a.w; x++) if (seen.has(key2(x, y))) return true;
      return false;
    });
  };
  const survey = (type, door, bw, bh) => {
    const plan = planFloor(`site:building:v2?type=${type}&door=${door}&edge=oooo&bw=${bw}&bh=${bh}`, `smoke/r6/${type}`, W, W);
    const feats = {};
    for (const c of Object.values(plan.cells)) {
      if (!c.feature) continue;
      feats[c.feature] = (feats[c.feature] || 0) + 1;
      if (c.t !== 'floor') { fail(`R6 ${type}: a ${c.feature} sits on ${c.t}, not floor`); clean = false; }
    }
    if (!reachAll(plan)) { fail(`R6 ${type}: a furnished room is walled off from the street`); clean = false; }
    return feats;
  };
  const temple = survey('temple', 's', 13, 14);
  if (!((temple.pew || 0) >= 6 && temple.altar && temple.font)) { fail(`R6 temple: nave not laid (pews=${temple.pew || 0}, altar=${temple.altar || 0}, font=${temple.font || 0})`); clean = false; }
  const shop = survey('shop', 'w', 12, 10);
  if (!(shop.counter && (shop.shelf || shop.forge))) { fail(`R6 shop: no counter+workshop (counter=${shop.counter || 0}, shelf=${shop.shelf || 0}, forge=${shop.forge || 0})`); clean = false; }
  const tavern = survey('tavern', 's', 14, 12);
  if (!(tavern.counter && tavern.hearth)) { fail(`R6 tavern: no bar+hearth`); clean = false; }
  const keep = survey('keep', 'n', 15, 15);
  if (!(keep.hearth && keep.bed)) { fail('R6 keep: no hearth+barracks bed'); clean = false; }
  const house = survey('house', 's', 11, 11);
  if (!house.hearth) { fail('R6 house: no hearth'); clean = false; }
  // type-DISTINCT: a tavern grows no pews, a temple grows no bar
  if (tavern.pew) { fail('R6: a tavern grew pews — layouts not type-distinct'); clean = false; }
  if (temple.counter) { fail('R6: a temple grew a bar'); clean = false; }
  // deterministic + the frozen v1 interior carries no furniture
  const a = planFloor('site:building:v2?type=temple&door=s&edge=oooo&bw=13&bh=14', 'smoke/r6/det', W, W);
  const b = planFloor('site:building:v2?type=temple&door=s&edge=oooo&bw=13&bh=14', 'smoke/r6/det', W, W);
  if (JSON.stringify(a) !== JSON.stringify(b)) { fail('R6: not deterministic'); clean = false; }
  const v1 = planFloor('site:building:v1?type=temple', 'smoke/r6/v1', 24, 18);
  if (Object.values(v1.cells).some((c) => c.feature)) { fail('R6: v1 building gained furniture — the frozen generator changed'); clean = false; }
  if (clean) ok(`interior character (R6): temple nave (${temple.pew} pews+altar+font), smithy forge+counter, tavern bar, keep hall — type-distinct, cosmetic, reachable, deterministic; v1 bare`);
}

// 5d) the scale ladder (LAYERED-SPACES.md §1): a city entity opens a 50
//     ft/cell overview; its ward district drills into a 10 ft district site
//     sized by the ward's footprint; a building there drills to 5 ft — the
//     parentSiteId chain intact and makeSubSite idempotent at every step
{
  const { makeSubSite, ensureGeneratedSite } = await import('../src/everdeep/siteOps.ts');
  const { defaultSpec } = await import('../src/everdeep/sites.ts');
  const world = {
    schemaVersion: 1, genVersion: 1, id: 'w_smokeladder', name: 'Ladder', seed: 'smoke-ladder',
    entities: {}, planes: [{ id: 'p_surface', name: 'The Surface' }], rev: 0,
    created: '2026-07-19T00:00:00.000Z', updated: '2026-07-19T00:00:00.000Z',
  };
  const city = {
    id: 'e_smokeladdrcty1', kind: 'settlement', name: 'Everspire',
    fields: { population: 12000 }, body: [], relations: [], rev: 0,
    created: world.created, updated: world.updated,
  };
  world.entities[city.id] = city;
  const spec = defaultSpec('city');
  if (spec.cellFt !== 50 || spec.w < 200) fail(`defaultSpec(city) = ${JSON.stringify(spec)} — expected the 50 ft overview`);
  const overview = ensureGeneratedSite(world, city, 'city', undefined, { water: 'river' });
  if (overview.cellFt !== 50) fail(`overview cellFt ${overview.cellFt} ≠ 50`);
  const ward = (overview.floors[0].areas ?? []).find((a) => a.kind === 'district');
  if (!ward) fail('overview has no district areas to drill into');
  else {
    const districtId = makeSubSite(world, overview, ward, 0);
    if (makeSubSite(world, overview, ward, 0) !== districtId) fail('makeSubSite not idempotent for the ward');
    const district = world.planes[0].sites.find((s) => s.id === districtId);
    if (district.cellFt !== 10) fail(`district cellFt ${district.cellFt} ≠ 10`);
    if (district.parentSiteId !== overview.id) fail('district parentSiteId broken');
    const expectW = Math.max(48, Math.min(220, Math.round(ward.w * 5)));
    if (district.floors[0].w !== expectW) fail(`district w ${district.floors[0].w} ≠ footprint-derived ${expectW}`);
    if (!district.floors[0].gen?.generator.startsWith('site:district:v1')) {
      fail(`ward drilled into ${district.floors[0].gen?.generator} — expected site:district:v1 (N-2)`);
    }
    if (!district.floors[0].gen?.ctx?.entries) fail('district gen carries no SiteContext — the layers cannot agree');
    const bArea = (district.floors[0].areas ?? []).find((a) => a.kind === 'building');
    if (!bArea) fail('district plan keys no buildings — the ladder dead-ends');
    else {
      const buildingId = makeSubSite(world, district, bArea, 0);
      const building = world.planes[0].sites.find((s) => s.id === buildingId);
      if (building.cellFt !== 5) fail(`building cellFt ${building.cellFt} ≠ 5`);
      if (building.parentSiteId !== district.id) fail('building parentSiteId broken');
      if (!failures) ok('scale ladder: city 50ft → ward district 10ft (footprint-sized) → building 5ft, chain + idempotence hold');
    }
  }
}

// 5e) THE CONTEXT CONTRACT (LAYERED-SPACES §2, N-2): entries project
//     exactly, the district honors them, buildings face their street, and
//     children follow parent edits — silently when unedited, by offer when
//     hand-edited
{
  const { computeSiteContext } = await import('../src/everdeep/sites.ts');
  const { makeSubSite, ensureGeneratedSite, refreshChildContext, generateInto } = await import('../src/everdeep/siteOps.ts');

  // exact projection on a hand-built parent: a 2-wide street crosses the
  // east border of a 20×20 area at local rows 8–9; a wall backs the north
  const cells = {};
  const rect = { x: 10, y: 10, w: 20, h: 20 };
  for (const y of [18, 19]) for (const x of [28, 29, 30, 31]) cells[key(x, y)] = { t: 'floor' };
  for (let x = 9; x < 31; x++) cells[key(x, 9)] = { t: 'wall' };
  const ctx = computeSiteContext(cells, rect, 100, 100);
  const street = ctx.entries.find((e) => e.side === 'e' && e.kind === 'street');
  const expAt = Math.round((((8 + 9) / 2 + 0.5) * 100) / 20); // run mid 8.5 → child 45
  if (!street) fail('context: the east street crossing was not detected');
  else if (street.at !== expAt) fail(`context: street projected to ${street.at}, expected ${expAt}`);
  const north = ctx.edges.find((e) => e.side === 'n');
  if (north?.kind !== 'wall') fail(`context: north edge ${north?.kind}, expected wall`);

  // the district honors it: walkable at the projected entry, wall row on the
  // walled side with a gate, and the entry walks to the ward square
  const plan = planFloor('site:district:v1', 'smoke/ctx-district', 100, 100, ctx);
  const entryCells = [plan.cells[key(99, expAt)], plan.cells[key(99, expAt + 1)]];
  if (!entryCells.some((c) => c && (c.t === 'floor' || c.t === 'door'))) {
    fail('district: nothing walkable at the projected east entry');
  }
  let wallRow = 0;
  for (let x = 0; x < 100; x++) if (plan.cells[key(x, 0)]?.t === 'wall' || plan.cells[key(x, 0)]?.t === 'door') wallRow++;
  if (wallRow < 60) fail(`district: walled north edge has only ${wallRow} wall cells`);
  const plazaA = plan.areas.find((a) => a.kind === 'plaza');
  if (!plazaA) fail('district: no ward square');
  else {
    const walkable = new Set(['floor', 'door', 'stairs']);
    const seen = new Set([key(plazaA.x + (plazaA.w >> 1), plazaA.y + (plazaA.h >> 1))]);
    const stack = [...seen];
    while (stack.length) {
      const k = stack.pop();
      const i = k.indexOf(',');
      const x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nk = key(x + dx, y + dy);
        if (!seen.has(nk) && walkable.has(plan.cells[nk]?.t)) { seen.add(nk); stack.push(nk); }
      }
    }
    if (!seen.has(key(99, expAt)) && !seen.has(key(99, expAt + 1))) {
      fail('district: the projected entry does not reach the ward square');
    }
  }
  if (!plan.areas.some((a) => a.kind === 'building')) fail('district: no guaranteed landmark building');
  const again = planFloor('site:district:v1', 'smoke/ctx-district', 100, 100, ctx);
  if (JSON.stringify(plan) !== JSON.stringify(again)) fail('district: not deterministic under the same ctx');

  // buildings face their street
  const east = planFloor('site:building:v1?door=e', 'smoke/ctx-door', 24, 18);
  let eastDoor = false;
  for (let y = 0; y < 18; y++) if (east.cells[key(23, y)]?.t === 'door') eastDoor = true;
  if (!eastDoor) fail('building door=e: no door on the east face');
  const south = planFloor('site:building:v1', 'smoke/ctx-door', 24, 18);
  let southDoor = false;
  for (let x = 0; x < 24; x++) if (south.cells[key(x, 17)]?.t === 'door') southDoor = true;
  if (!southDoor) fail('building default: south front door missing (compat break)');

  // children follow parent edits: silent for unedited, offered for edited
  const world = {
    schemaVersion: 1, genVersion: 1, id: 'w_smokectx', name: 'Ctx', seed: 'smoke-ctx',
    entities: {}, planes: [{ id: 'p_surface', name: 'The Surface' }], rev: 0,
    created: '2026-07-19T00:00:00.000Z', updated: '2026-07-19T00:00:00.000Z',
  };
  const city = {
    id: 'e_smokectxcity12', kind: 'settlement', name: 'Ctxburg',
    fields: { population: 12000 }, body: [], relations: [], rev: 0,
    created: world.created, updated: world.updated,
  };
  world.entities[city.id] = city;
  const overview = ensureGeneratedSite(world, city, 'city', undefined, { water: 'river' });
  // pin the refresh test to the frozen RECTANGULAR v3 overview: it exercises
  // the shape-agnostic N-2 refresh mechanism, and v4's organic wards would
  // move the carve target out from under the fixed coordinates below
  generateInto(world, overview, 0, 'site:city:v3?water=river');
  const ward = (overview.floors[0].areas ?? []).find((a) => a.kind === 'district');
  const districtId = makeSubSite(world, overview, ward, 0);
  const district = world.planes[0].sites.find((s) => s.id === districtId);
  if (refreshChildContext(world, district).state !== 'fresh') fail('ctx refresh: untouched child reported non-fresh');
  // carve a NEW street crossing the ward's west border in the overview
  const host = overview.floors[0];
  const wy = ward.y + Math.floor(ward.h / 2) + 3;
  for (const x of [ward.x - 1, ward.x]) host.cells[`${x},${wy}`] = { t: 'floor' };
  const before = JSON.stringify(district.floors[0].gen.ctx);
  const r1 = refreshChildContext(world, district);
  if (r1.state !== 'updated') fail(`ctx refresh: unedited child should follow silently, got ${r1.state}`);
  if (JSON.stringify(district.floors[0].gen.ctx) === before) fail('ctx refresh: ctx did not actually change');
  // now hand-edit the child, then revert the parent street (a guaranteed
  // ctx change — adding more can hit the per-side entry cap in a dense
  // ward boundary) — the edited child must NOT move
  district.floors[0].cells['5,5'] = { t: 'hazard' };
  for (const x of [ward.x - 1, ward.x]) delete host.cells[`${x},${wy}`];
  const r2 = refreshChildContext(world, district);
  if (r2.state !== 'stale-edited') fail(`ctx refresh: edited child should be offered, got ${r2.state}`);
  if (!r2.fresh) fail('ctx refresh: stale-edited carries no fresh ctx for the offer');
  // the landmark guarantee must hold under a DENSE real-ward context (two
  // dozen radiating streets once blocked every fixed spot — e2e caught it)
  for (let s = 0; s < 6; s++) {
    const p2 = planFloor('site:district:v1', `smoke/ctx-guarantee/s:${s}`,
      district.floors[0].w, district.floors[0].h, district.floors[0].gen.ctx);
    if (!p2.areas.some((a) => a.kind === 'building')) fail(`district guarantee: seed ${s} keys no landmark`);
  }
  if (!failures) ok('context contract: exact projection, honoring district, street-facing doors, follow-silently/offer-when-edited');
}

// 5l) FLAG CORRESPONDENCE (LAYERED-SPACES R7β): drilling a ward from the rough
//     v5 overview yields a district that PLACES that ward's flags — the SAME
//     named buildings the overview showed, drillable and reachable. An overview
//     flag drills to its ward district (one building per flag). A flag-less
//     district stays byte-identical (the placement is additive).
{
  const { makeSubSite, ensureGeneratedSite } = await import('../src/everdeep/siteOps.ts');
  const { cellsFor } = await import('../src/everdeep/siteGen.ts');
  let clean = true;
  const world = {
    schemaVersion: 1, genVersion: 1, id: 'w_r7b', name: 'R7b', seed: 'r7b-seed',
    entities: {}, planes: [{ id: 'p_surface', name: 'S' }], rev: 0,
    created: '2026-07-22T00:00:00.000Z', updated: '2026-07-22T00:00:00.000Z',
  };
  const city = { id: 'e_r7bcity1', kind: 'settlement', name: 'Flagford', fields: { population: 12000 }, body: [], relations: [], rev: 0, created: world.created, updated: world.updated };
  world.entities[city.id] = city;
  const overview = ensureGeneratedSite(world, city, 'city', undefined, { water: 'river' });
  if (!overview.floors[0].gen.generator.startsWith('site:city:v5')) { fail(`R7β: overview is ${overview.floors[0].gen.generator}, expected v5`); clean = false; }
  const oAreas = overview.floors[0].areas ?? [];
  const oFlags = oAreas.filter((a) => a.flag);
  const wards = oAreas.filter((a) => a.kind === 'district');
  // the ward holding the most flags
  let ward = null, wardFlags = [];
  for (const w of wards) {
    const inside = oFlags.filter((f) => { const cx = f.x + f.w / 2, cy = f.y + f.h / 2; return cx >= w.x && cx < w.x + w.w && cy >= w.y && cy < w.y + w.h; });
    if (inside.length > wardFlags.length) { ward = w; wardFlags = inside; }
  }
  if (!ward || wardFlags.length < 1) { fail('R7β: no ward holds a flag on the v5 overview'); clean = false; }
  else {
    const distId = makeSubSite(world, overview, ward, 0);
    const district = world.planes[0].sites.find((s) => s.id === distId);
    const df = district.floors[0];
    const dFlags = (df.areas ?? []).filter((a) => a.flag);
    // the district carries EXACTLY the ward's flags, by label, drillable
    const want = new Set(wardFlags.map((f) => f.label));
    const got = new Set(dFlags.map((f) => f.label));
    for (const label of want) if (!got.has(label)) { fail(`R7β: ward flag "${label}" not placed in the district`); clean = false; }
    if (!dFlags.every((f) => f.kind === 'building')) { fail('R7β: a placed flag is not a drillable building'); clean = false; }
    // every placed flag is reachable from the ward square (the lanes hold)
    const cells = cellsFor(df.gen, df.w, df.h);
    const plaza = (df.areas ?? []).find((a) => a.kind === 'plaza');
    const walk = new Set(['floor', 'door', 'stairs']);
    const seen = new Set(); const stack = [`${plaza.x + (plaza.w >> 1)},${plaza.y + (plaza.h >> 1)}`]; seen.add(stack[0]);
    while (stack.length) { const k = stack.pop(); const [x, y] = k.split(',').map(Number); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = `${x + dx},${y + dy}`; if (!seen.has(nk) && walk.has(cells[nk]?.t)) { seen.add(nk); stack.push(nk); } } }
    for (const f of dFlags) {
      let ok2 = false;
      for (let y = f.y - 1; y <= f.y + f.h && !ok2; y++) for (let x = f.x - 1; x <= f.x + f.w; x++) if (seen.has(`${x},${y}`)) { ok2 = true; break; }
      if (!ok2) { fail(`R7β: placed flag "${f.label}" is walled off from the ward square`); clean = false; }
    }
    // an overview FLAG drills to its ward DISTRICT (10 ft), not a 5 ft building
    const someFlag = wardFlags[0];
    const viaFlag = makeSubSite(world, overview, someFlag, 0);
    const viaFlagSite = world.planes[0].sites.find((s) => s.id === viaFlag);
    if (viaFlagSite.cellFt !== 10) { fail(`R7β: drilling a flag opened cellFt ${viaFlagSite.cellFt}, expected the 10 ft district`); clean = false; }
    if (viaFlag !== distId) { fail('R7β: the flag opened a different district than its ward'); clean = false; }
    if (clean) ok(`flag correspondence (R7β): ward "${ward.label}" → district places its ${dFlags.length} flags (${[...got].join(', ')}), all reachable; a flag drills to its ward district`);
  }
  // additive: a district generated with NO flags in ctx keys no flag areas
  const noFlag = planFloor('site:district:v1', 'smoke/r7b/noflag', 100, 100, { entries: [{ side: 'w', at: 50, kind: 'street' }], edges: [] });
  if ((noFlag.areas ?? []).some((a) => a.flag)) { fail('R7β: a flag-less district grew flags — placement not additive'); clean = false; }
}

// 6) the overrides storage contract (sites.ts): base + override resolution,
//    tombstones, and write-the-base-value deletes the override
{
  const gen = { generator: makeGenerator('dungeon', { rooms: 4 }), seed: 'smoke/override', genVersion: 1 };
  const floor = { label: 'G', z: 0, w: 48, h: 36, cells: {}, gen };
  const regen = (g, w, h) => cellsFor(g, w, h);
  const base = regen(gen, 48, 36);
  const someFloor = Object.keys(base).find((k) => base[k].t === 'floor');
  // hand-place a hazard over generated floor → ONE override stored
  writeCellOverride(floor, someFloor, { t: 'hazard' }, base[someFloor]);
  if (Object.keys(floor.cells).length !== 1) fail('override write stored more than the delta');
  let eff = effectiveCells(floor, regen);
  if (eff[someFloor]?.t !== 'hazard') fail('override not applied over the generated base');
  // erase it to void → tombstone; the cell disappears from the effective map
  writeCellOverride(floor, someFloor, null, base[someFloor]);
  eff = effectiveCells(floor, regen);
  if (eff[someFloor]) fail('void tombstone did not erase the generated cell');
  // write the generated value back → override record vanishes entirely
  writeCellOverride(floor, someFloor, base[someFloor], base[someFloor]);
  if (Object.keys(floor.cells).length !== 0) fail('writing the base value back did not clear the override');
  if (!failures) ok('overrides: minimal deltas, void tombstones, self-cleaning');
}

// 7) One Page Dungeon import: rects carve, doors map (6→secret, 8/9→stairs),
//    notes become keyed areas
{
  const opd = {
    title: 'Test Delve',
    rects: [{ x: -2, y: 0, w: 5, h: 4 }, { x: 3, y: 1, w: 6, h: 3 }],
    doors: [{ x: 3, y: 2, dir: { x: 1, y: 0 }, type: 6 }, { x: 0, y: 4, dir: { x: 0, y: 1 }, type: 8 }],
    notes: [{ text: 'A shallow pool.', ref: '1', pos: { x: 0, y: 1 } }],
    water: [{ x: -1, y: 1 }],
    columns: [{ x: 4, y: 2 }],
  };
  const { plan, w, h, title } = importOnePageDungeon(opd);
  const cellAt = (x, y) => plan.cells[key(x + 3, y + 1)]?.t; // import shifts by (1-minX, 1-minY)
  let bad = false;
  if (title !== 'Test Delve') { fail('opd title lost'); bad = true; }
  if (cellAt(-2, 0) !== 'floor') { fail('opd rect not carved'); bad = true; }
  if (cellAt(3, 2) !== 'secret') { fail('opd secret door not mapped'); bad = true; }
  if (cellAt(0, 4) !== 'stairs') { fail('opd stair door not mapped'); bad = true; }
  if (cellAt(-1, 1) !== 'water') { fail('opd water not mapped'); bad = true; }
  if (cellAt(4, 2) !== 'wall') { fail('opd column not mapped'); bad = true; }
  if (plan.areas.length !== 1 || plan.areas[0].note !== 'A shallow pool.') { fail('opd note not keyed'); bad = true; }
  if (w < 10 || h < 6) { fail(`opd bounds wrong: ${w}x${h}`); bad = true; }
  if (!bad) ok('One Page Dungeon JSON imports: rects, door enum, notes, water, columns');
}

// 8) sites-aware merge: two devices editing DIFFERENT sites in one world
//    both survive the sync (the whole-plane LWW exception), and a diverged
//    site resolves by per-site LWW
{
  const { mergeWorlds } = await import('../src/engine/worldStore.ts');
  const mkWorld = (rev) => ({
    schemaVersion: 1, genVersion: 1, id: 'w_mergetest01', name: 'M', seed: 's',
    entities: {}, conflicts: [], rev, created: '2026-01-01T00:00:00Z', updated: `2026-01-0${rev}T00:00:00Z`,
    planes: [{ id: 'p_surface', name: 'S', sites: [] }],
  });
  const site = (id, rev, label) => ({
    id, entityId: 'e_abcdefghijklmn', x: 0, y: 0, grid: 'square', cellFt: 5,
    rev, updated: `2026-01-0${rev}T00:00:00Z`,
    floors: [{ label, z: 0, w: 10, h: 10, cells: {} }],
  });
  const a = mkWorld(2), b = mkWorld(3);
  a.planes[0].sites.push(site('s_onlylocal0000', 1, 'A'), site('s_shared0000000', 5, 'stale'));
  b.planes[0].sites.push(site('s_onlyremote000', 1, 'B'), site('s_shared0000000', 6, 'fresh'));
  const merged = mergeWorlds(a, b).world;
  const got = new Map(merged.planes[0].sites.map((s) => [s.id, s]));
  if (got.size !== 3) fail(`site merge union lost something: ${[...got.keys()].join(',')}`);
  else if (got.get('s_shared0000000')?.floors[0].label !== 'fresh') fail('diverged site did not take the higher rev');
  else ok('merge: sites union by id, per-site LWW — no plane-level clobber');
}

// 8b) the room-key marriage across BOTH body eras, and the prize in the
//     sanctum: a heldBy lair stamps its holder into the sanctum's centre
{
  const { ensureGeneratedSite, bindAreasToBody, bodyRooms } = await import('../src/everdeep/siteOps.ts');
  // B187+ body: one statblock, rooms as label-less keyValue sections whose
  // first pair key is "Room N · The <Title>"
  const mkEntity = (id, body, relations) => ({
    id, kind: 'landmark', name: 'The Test Barrow', tags: ['dungeon'], body, relations,
    rev: 1, updated: '2026-01-01T00:00:00Z',
  });
  const newBody = [{
    id: 'b_testblock', type: 'statblock', name: 'The Test Barrow',
    sections: [
      { type: 'paragraph', label: 'The Warded Gate', text: 'A riddle.' },
      { type: 'keyValue', pairs: [{ key: 'Room 1 · The Flooded Ossuary', value: 'Bones float.' }] },
      { type: 'keyValue', pairs: [{ key: 'Room 2 · The Broken Oratory', value: 'A cracked altar.' }, { key: 'Trap', value: 'A dart.' }] },
      { type: 'paragraph', label: 'The Inner Sanctum', text: 'The boss waits.' },
    ],
  }];
  const rooms = bodyRooms(mkEntity('e_aaaaaaaaaaaaaa', newBody));
  if (rooms.size !== 2 || rooms.get(1)?.ref !== 'b_testblock#Room 1 · The Flooded Ossuary') {
    fail(`bodyRooms missed the B187 shape: ${JSON.stringify([...rooms])}`);
  }
  const world = {
    schemaVersion: 1, genVersion: 1, id: 'w_prizetest00', name: 'P', seed: 'prize-seed',
    entities: {}, planes: [], conflicts: [], rev: 1, created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
  };
  const boss = { id: 'e_bbbbbbbbbbbbbb', kind: 'person', name: 'The Wight-King', rev: 1, updated: '2026-01-01T00:00:00Z' };
  const lair = mkEntity('e_cccccccccccccc', newBody, [{ type: 'heldBy', target: boss.id }]);
  world.entities[boss.id] = boss;
  world.entities[lair.id] = lair;
  const site = ensureGeneratedSite(world, lair, 'dungeon');
  const floor = site.floors[0];
  const areaLabels = (floor.areas ?? []).map((a) => a.label);
  let bad = false;
  if ((floor.areas ?? []).filter((a) => a.kind === 'room').length !== 2) {
    fail(`marriage: rooms=${areaLabels.join('|')} — count should follow the body (2)`); bad = true;
  }
  if (!areaLabels.includes('Room 1 · The Flooded Ossuary')) {
    fail('marriage: area did not adopt the body room title'); bad = true;
  }
  const room1 = (floor.areas ?? []).find((a) => a.label === 'Room 1 · The Flooded Ossuary');
  if (room1?.blockId !== 'b_testblock#Room 1 · The Flooded Ossuary') {
    fail(`marriage: room 1 blockId=${room1?.blockId}`); bad = true;
  }
  const gate = (floor.areas ?? []).find((a) => a.kind === 'entrance');
  if (gate?.blockId !== 'b_testblock#The Warded Gate') { fail('marriage: gate did not bind'); bad = true; }
  const prizeCells = Object.entries(floor.cells).filter(([, c]) => c.entityId === boss.id);
  if (prizeCells.length !== 1) { fail(`prize: ${prizeCells.length} cells carry the holder, want 1`); bad = true; }
  else {
    const sanctum = (floor.areas ?? []).find((a) => a.kind === 'sanctum');
    const [k] = prizeCells[0];
    const [px, py] = k.split(',').map(Number);
    if (!sanctum || px < sanctum.x || px >= sanctum.x + sanctum.w || py < sanctum.y || py >= sanctum.y + sanctum.h) {
      fail(`prize: holder at ${k} is outside the sanctum`); bad = true;
    }
  }
  // rebinding is idempotent and label-drift-safe: rerun binds the same refs
  bindAreasToBody(lair, floor);
  const again = (floor.areas ?? []).find((a) => a.kind === 'room')?.blockId;
  if (again !== 'b_testblock#Room 1 · The Flooded Ossuary') { fail('marriage: rebind drifted'); bad = true; }
  if (!bad) ok('marriage v2: B187 bodies bind by ordinal, adopt titles; the prize stands in the sanctum');
}

// 8c) interior role-theming: the theme decides the ARCHITECTURE (a beast
//     warren digs a cave, a giant hold builds grand halls), chambers join
//     the room marriage, and a "Flooded" key actually floods its room
{
  const { ensureGeneratedSite, dressAreasFromTitles, themeOfEntity } = await import('../src/everdeep/siteOps.ts');
  const roomKV = (n, title) => ({ type: 'keyValue', pairs: [{ key: `Room ${n} · The ${title}`, value: 'x' }] });
  const mk = (id, themeLabel, titles) => ({
    id, kind: 'landmark', name: 'T', tags: ['dungeon'],
    body: [{
      id: 'b_block1', type: 'statblock', name: 'T', meta: `${themeLabel} · ${titles.length} rooms · boss CR 5`,
      sections: [
        { type: 'paragraph', label: 'The Warded Gate', text: 'g' },
        ...titles.map((t, i) => roomKV(i + 1, t)),
        { type: 'paragraph', label: 'The Inner Sanctum', text: 's' },
      ],
    }],
    rev: 1, updated: '2026-01-01T00:00:00Z',
  });
  const mkWorld = (seed) => ({
    schemaVersion: 1, genVersion: 1, id: 'w_themetest00', name: 'T', seed,
    entities: {}, planes: [], conflicts: [], rev: 1, created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
  });
  let bad = false;
  // beast warren → cave layout, chambers wear the room keys
  {
    const w = mkWorld('theme-a');
    const beast = mk('e_dddddddddddddd', 'Beast warren', ['Mossy Gallery', 'Cramped Guardroom']);
    w.entities[beast.id] = beast;
    if (themeOfEntity(beast) !== 'beast') { fail(`themeOfEntity: ${themeOfEntity(beast)}, want beast`); bad = true; }
    const site = ensureGeneratedSite(w, beast, 'dungeon');
    const f = site.floors[0];
    if (!f.gen.generator.startsWith('site:cave:')) { fail(`beast warren generator: ${f.gen.generator}`); bad = true; }
    const chamber1 = (f.areas ?? []).find((a) => a.label.startsWith('Room 1 ·'));
    if (!chamber1 || chamber1.blockId !== 'b_block1#Room 1 · The Mossy Gallery') {
      fail('cave chambers did not join the room marriage'); bad = true;
    }
  }
  // giant hold → grand dungeon (bigger rooms than the standard roll)
  {
    const w = mkWorld('theme-b');
    const giant = mk('e_eeeeeeeeeeeeee', 'Giant hold', ['Echoing Gallery']);
    w.entities[giant.id] = giant;
    const site = ensureGeneratedSite(w, giant, 'dungeon');
    if (!/scale=grand/.test(site.floors[0].gen.generator)) { fail(`giant hold generator: ${site.floors[0].gen.generator}`); bad = true; }
  }
  // dressing: a Flooded room holds water inside its own rect, deterministically
  {
    const w = mkWorld('theme-c');
    const wet = mk('e_ffffffffffffff', 'Undead crypt', ['Flooded Cistern', 'Silent Shrine']);
    w.entities[wet.id] = wet;
    const site = ensureGeneratedSite(w, wet, 'dungeon');
    const f = site.floors[0];
    const room1 = (f.areas ?? []).find((a) => a.label.includes('Flooded Cistern'));
    const waterCells = Object.entries(f.cells).filter(([, c]) => c.t === 'water');
    if (!room1) { fail('dressing: flooded room not bound'); bad = true; }
    else if (waterCells.length < 3) { fail(`dressing: only ${waterCells.length} water cells`); bad = true; }
    else if (!waterCells.every(([k]) => {
      const [x, y] = k.split(',').map(Number);
      return x >= room1.x && x < room1.x + room1.w && y >= room1.y && y < room1.y + room1.h;
    })) { fail('dressing: water leaked outside the flooded room'); bad = true; }
    // deterministic: re-dressing an identical floor writes identical cells
    const before = JSON.stringify(f.cells);
    const copy = { ...f, cells: {} };
    // rebuild bindings context: areas already bound; re-dress fresh
    copy.areas = structuredClone(f.areas);
    dressAreasFromTitles(copy);
    // the copy lacks the prize stamp (that's placePrize's cell) — compare
    // only the water/hazard dressing
    const dressOf = (cells) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(typeof cells === 'string' ? cells : JSON.stringify(cells))).filter(([, c]) => !c.entityId)));
    if (dressOf(before) !== dressOf(copy.cells)) { fail('dressing is not deterministic'); bad = true; }
  }
  if (!bad) ok('theming: beast→cave with married chambers, giant→grand, flooded keys flood their rooms');
}

// 8d) the city↔web marriage: a settlement whose life web minted child
//     building entities (inns, shops) seats them in the plan's notable
//     buildings — the area adopts the page's name and id — and
//     makeSubSite gives the BOUND page its interior instead of minting a
//     stranger
{
  const { ensureGeneratedSite, makeSubSite } = await import('../src/everdeep/siteOps.ts');
  const world = {
    schemaVersion: 1, genVersion: 1, id: 'w_webmarrytest', name: 'W', seed: 'web-marry-seed',
    entities: {}, planes: [], conflicts: [], rev: 1, created: '2026-01-01T00:00:00Z', updated: '2026-01-01T00:00:00Z',
  };
  const town = {
    id: 'e_dddddddddddddd', kind: 'settlement', name: 'Braehollow', tags: ['city'],
    fields: { population: 20000 }, rev: 1, updated: '2026-01-01T00:00:00Z',
  };
  const inn = { id: 'e_eeeeeeeeeeeee1', kind: 'building', name: 'The Gilded Swan', parentId: town.id, rev: 1, updated: '2026-01-01T00:00:00Z' };
  const shop = { id: 'e_eeeeeeeeeeeee2', kind: 'building', name: "Marra's Curios", parentId: town.id, rev: 1, updated: '2026-01-01T00:00:00Z' };
  world.entities[town.id] = town;
  world.entities[inn.id] = inn;
  world.entities[shop.id] = shop;
  const site = ensureGeneratedSite(world, town, 'city');
  const floor = site.floors[0];
  // how many seats exist is the plan's business (1–3 notables per city);
  // the contract is: every seat fills, in stable cast order, adopting names
  const seated = (floor.areas ?? []).filter((a) => a.kind === 'building' && a.entityId);
  let bad = false;
  if (!seated.length) { fail('city↔web: no building area seated a cast member'); bad = true; }
  const innSeat = seated[0];
  if (innSeat && innSeat.entityId !== inn.id) { fail(`city↔web: first seat went to ${innSeat.entityId}, want the lowest-id cast member (the inn)`); bad = true; }
  else if (innSeat && innSeat.label !== 'The Gilded Swan') { fail(`city↔web: seat label "${innSeat.label}" did not adopt the page name`); bad = true; }
  // interiors open the BOUND page's building, not a freshly minted one
  if (innSeat) {
    const before = Object.keys(world.entities).length;
    const subId = makeSubSite(world, site, innSeat, 0);
    if (Object.keys(world.entities).length !== before) { fail('city↔web: makeSubSite minted a new entity for a bound area'); bad = true; }
    const sub = (world.planes ?? []).flatMap((p) => p.sites ?? []).find((s) => s.id === subId);
    if (sub?.entityId !== inn.id) { fail(`city↔web: sub-site belongs to ${sub?.entityId}, want the inn`); bad = true; }
    if (makeSubSite(world, site, innSeat, 0) !== subId) { fail('city↔web: second makeSubSite did not reuse the interior'); bad = true; }
  }
  if (!bad) ok('city↔web: the cast seats into notable buildings, and interiors open their pages');
}

// 9) Universal VTT export: walls trace the passable boundary (merged runs),
//    door cells become portals and are NOT walled over
{
  const { buildUvtt } = await import('../src/everdeep/siteExport.ts');
  // a 5x4 room with one door in the south wall:
  //   #####
  //   #...#
  //   #.+.#   (+ = door at 2,2 in a wall line, floor above, void below)
  const cells = {};
  for (let x = 0; x < 5; x++) for (let y = 0; y < 3; y++) cells[`${x},${y}`] = { t: 'wall' };
  for (let x = 1; x < 4; x++) cells[`${x},1`] = { t: 'floor' };
  cells['2,2'] = { t: 'door' };
  const fakeCanvas = { toDataURL: () => 'data:image/png;base64,AAAA' };
  const uvtt = buildUvtt(cells, 5, 3, fakeCanvas, 32);
  let bad = false;
  if (uvtt.portals.length !== 1) { fail(`uvtt: ${uvtt.portals.length} portals, want 1`); bad = true; }
  const top = uvtt.line_of_sight.find((seg) => seg[0].y === 1 && seg[1].y === 1 && seg[0].x === 1 && seg[1].x === 4);
  if (!top) { fail('uvtt: north wall not merged into one 3-cell run'); bad = true; }
  const wallOverDoor = uvtt.line_of_sight.some((seg) =>
    seg[0].y === 2 && seg[1].y === 2 && seg[0].x <= 2 && seg[1].x >= 3);
  if (wallOverDoor) { fail('uvtt: the doorway is walled over'); bad = true; }
  if (uvtt.resolution.pixels_per_grid !== 32 || uvtt.image !== 'AAAA') { fail('uvtt: resolution/image wrong'); bad = true; }
  // lights: doors get sconces (door-sparse map), pins and stairs glow
  cells['1,1'] = { t: 'floor', entityId: 'e_boss' };
  cells['3,1'] = { t: 'stairs' };
  const lit = buildUvtt(cells, 5, 3, fakeCanvas, 32);
  if (lit.lights.length !== 3) { fail(`uvtt: ${lit.lights.length} lights, want 3 (pin + stairs + door sconce)`); bad = true; }
  // a player-facing file carries NO trace of a secret door: no portal,
  // and the LOS wall runs seal straight over it
  cells['2,2'] = { t: 'secret' };
  const gm = buildUvtt(cells, 5, 3, fakeCanvas, 32);
  const player = buildUvtt(cells, 5, 3, fakeCanvas, 32, { hideSecrets: true });
  if (gm.portals.length !== 1) { fail(`uvtt gm: ${gm.portals.length} portals, want the secret as 1`); bad = true; }
  if (player.portals.length !== 0) { fail('uvtt player: the secret door leaked as a portal'); bad = true; }
  const sealed = player.line_of_sight.some((seg) =>
    seg[0].y === 2 && seg[1].y === 2 && seg[0].x <= 2 && seg[1].x >= 3);
  if (!sealed) { fail('uvtt player: the secret doorway is not walled over'); bad = true; }
  if (!bad) ok('uvtt export: merged walls, portals, lights, and player files seal their secrets');
}

// 9b) One Page Dungeon EXPORT round-trips through our own importer: the
//     open space, doors, water, and keys all survive — so what we hand to
//     Dungeon Scrawl/Mipui is what we drew
{
  const { buildOpd } = await import('../src/everdeep/siteExport.ts');
  const { cells, areas } = planFloor(makeGenerator('dungeon', { rooms: 5 }), 'smoke/opd-rt', 48, 36);
  const opd = buildOpd(cells, areas, 'Round Trip');
  const back = importOnePageDungeon(opd);
  const openSet = (cs, exclude) => {
    let mnx = Infinity, mny = Infinity;
    const pts = [];
    for (const [k, c] of Object.entries(cs)) {
      if (['wall', 'void', ...exclude].includes(c.t)) continue;
      const i = k.indexOf(',');
      const x = Number(k.slice(0, i)), y = Number(k.slice(i + 1));
      pts.push([x, y]);
      mnx = Math.min(mnx, x); mny = Math.min(mny, y);
    }
    return new Set(pts.map(([x, y]) => `${x - mnx},${y - mny}`));
  };
  // the importer maps stairs/hazard glyphs it can't express to floor — so
  // compare the FULL open silhouette, normalised to each side's origin
  const before = openSet(cells, []);
  const after = openSet(back.plan.cells, []);
  let bad = false;
  if (before.size !== after.size || [...before].some((k) => !after.has(k))) {
    fail(`opd round-trip: open silhouette drifted (${before.size} → ${after.size})`); bad = true;
  }
  const doorsBefore = Object.values(cells).filter((c) => c.t === 'door' || c.t === 'secret').length;
  const doorsAfter = Object.values(back.plan.cells).filter((c) => c.t === 'door' || c.t === 'secret').length;
  if (doorsBefore !== doorsAfter) { fail(`opd round-trip: doors ${doorsBefore} → ${doorsAfter}`); bad = true; }
  if (opd.notes.length !== (areas.length)) { fail('opd export: keys missing from notes'); bad = true; }
  if (!bad) ok('opd export round-trips: silhouette, doors, and the key survive');
}

// 10) scale check: the flagship 180×180 city generates fast enough to regen
//    on every open (the storage contract depends on it)
{
  const t0 = performance.now();
  planFloor(makeGenerator('city'), 'smoke/perf', 180, 180);
  const ms = performance.now() - t0;
  if (ms > 500) fail(`city 180×180 took ${ms.toFixed(0)}ms — too slow to regen on open`);
  else ok(`city 180×180 generates in ${ms.toFixed(0)}ms`);
}

if (failures) { console.error(`smoke-sites: ${failures} failure(s)`); process.exit(1); }
console.log('smoke-sites: all green');
