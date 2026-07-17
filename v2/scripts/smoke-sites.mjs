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
      const gen = makeGenerator(kind, kind === 'dungeon' ? { rooms: 5 } : undefined);
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

// 5) settlements: plaza area present, walled city has gates, buildings have
//    street doors, main streets exist
{
  let clean = true;
  for (let s = 0; s < 4; s++) {
    const { cells, areas } = planFloor(makeGenerator('city', { walls: '1' }), `smoke/city/s:${s}`, 160, 160);
    if (!areas.some((a) => a.kind === 'plaza')) { fail(`city seed ${s}: no plaza`); clean = false; }
    if (!areas.some((a) => a.kind === 'district')) { fail(`city seed ${s}: no districts`); clean = false; }
    const t = Object.values(cells).reduce((acc, c) => { acc[c.t] = (acc[c.t] ?? 0) + 1; return acc; }, {});
    if (!(t.door > 4)) { fail(`city seed ${s}: only ${t.door ?? 0} doors (gates+buildings expected)`); clean = false; }
    if (!(t.wall > 500)) { fail(`city seed ${s}: suspiciously few wall cells (${t.wall ?? 0})`); clean = false; }
    if (!(t.floor > 800)) { fail(`city seed ${s}: suspiciously few street cells (${t.floor ?? 0})`); clean = false; }
  }
  if (clean) ok('city plans carry plaza, districts, gated walls, doored buildings (4 seeds)');
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
  if (!bad) ok('uvtt export: merged walls, portal at the door, open doorway');
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
