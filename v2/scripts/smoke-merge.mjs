// Two-device world merge (queue #38, CONTRACTS §8): the invariants the
// design table promises — entity UNION (a page made on either device
// survives), per-entity LWW on collisions with the loser recoverable from
// the conflict inbox, tombstones respected both ways, orphaned children
// reparented — and commutativity on disjoint edits, so it doesn't matter
// which device syncs first. Part of `npm run smoke`.

import { mergeWorlds } from '../src/engine/worldStore.ts';

let failures = 0;
const fail = (m) => { failures++; console.error('  ✗ ' + m); };
const ok = (m) => console.log('  ✓ ' + m);

const T0 = '2026-07-17T00:00:00.000Z';
const T1 = '2026-07-17T01:00:00.000Z';
const T2 = '2026-07-17T02:00:00.000Z';

const ent = (id, name, over = {}) => ({
  id, kind: 'note', name, fields: {}, body: [], rev: 1, created: T0, updated: T0, ...over,
});
const world = (entities, over = {}) => ({
  schemaVersion: 1, genVersion: 1, id: 'w_test', name: 'Test', seed: 's',
  entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  planes: [], settings: {}, conflicts: [], rev: 1, created: T0, updated: T0, ...over,
});

// ---- 1. disjoint edits: union, no conflicts, commutative ----
{
  const base = ent('e_base', 'Shared');
  const A = world([base, ent('e_desk', 'Desktop page')], { rev: 2, updated: T1 });
  const B = world([base, ent('e_phone', 'Phone page')], { rev: 2, updated: T2 });
  const ab = mergeWorlds(A, B, T2);
  const ba = mergeWorlds(B, A, T2);
  const ids = (r) => Object.keys(r.world.entities).sort().join(',');
  ids(ab) === 'e_base,e_desk,e_phone' && ids(ba) === ids(ab)
    ? ok('disjoint pages from both devices survive, either sync order')
    : fail(`union lost a page: ab=${ids(ab)} ba=${ids(ba)}`);
  ab.conflicts.length === 0 && ba.conflicts.length === 0
    ? ok('disjoint edits raise no conflicts')
    : fail(`phantom conflicts on disjoint edits: ${ab.conflicts.length}/${ba.conflicts.length}`);
  JSON.stringify(ab.world.entities) === JSON.stringify(ba.world.entities)
    ? ok('the merged entity set is identical both ways (commutative)')
    : fail('merge is not commutative on disjoint edits');
  ab.added === 2 && ba.added === 2
    ? ok('added counts the one-sided pages (2)')
    : fail(`added miscounted: ${ab.added}/${ba.added}`);
}

// ---- 2. collision: higher rev wins either way; the loser is recoverable ----
// A edited twice quickly (rev 3 at T1); B edited once, later (rev 2 at T2) —
// the mixed rev/updated ordering is the parallel-edit signature
{
  const A = world([ent('e_x', 'Edited on desktop', { rev: 3, updated: T1 })], { rev: 3, updated: T1 });
  const B = world([ent('e_x', 'Edited on phone', { rev: 2, updated: T2 })], { rev: 2, updated: T2 });
  const ab = mergeWorlds(A, B, T2);
  const ba = mergeWorlds(B, A, T2);
  ab.world.entities.e_x.name === 'Edited on desktop' && ba.world.entities.e_x.name === 'Edited on desktop'
    ? ok('higher rev wins the collision in either sync order')
    : fail(`LWW picked wrong: ab=${ab.world.entities.e_x.name} ba=${ba.world.entities.e_x.name}`);
  const lostAb = ab.conflicts.find((c) => c.id === 'e_x')?.loser?.name;
  const lostBa = ba.conflicts.find((c) => c.id === 'e_x')?.loser?.name;
  lostAb === 'Edited on phone' && lostBa === 'Edited on phone'
    ? ok('the losing edit is preserved whole in the conflict inbox')
    : fail(`loser not recoverable: ${lostAb}/${lostBa}`);
}

// ---- 3. tombstones: a newer deletion wins; a newer edit revives ----
{
  const live = world([ent('e_t', 'Still here', { rev: 3, updated: T1 })]);
  const dead = world([ent('e_t', 'Still here', { rev: 4, updated: T2, deleted: T2 })]);
  const r1 = mergeWorlds(live, dead, T2);
  r1.world.entities.e_t.deleted
    ? ok('a newer deletion beats an older live copy')
    : fail('deletion lost to an older live copy');
  const edited = world([ent('e_t', 'Revived by edit', { rev: 5, updated: T2 })]);
  const r2 = mergeWorlds(dead, edited, T2);
  !r2.world.entities.e_t.deleted && r2.world.entities.e_t.name === 'Revived by edit'
    ? ok('a newer edit revives over an older tombstone')
    : fail('tombstone beat a newer edit');
}

// ---- 4. no id is ever lost, whatever the overlap ----
{
  const A = world([ent('e_1', 'a'), ent('e_2', 'b'), ent('e_3', 'c', { rev: 2, updated: T1 })]);
  const B = world([ent('e_3', 'c-edited', { rev: 3, updated: T2 }), ent('e_4', 'd')]);
  const r = mergeWorlds(A, B, T2);
  Object.keys(r.world.entities).length === 4
    ? ok('the union never loses an entity id (4 of 4)')
    : fail(`ids lost: ${Object.keys(r.world.entities).join(',')}`);
}

// ---- 5. a child whose parent was deleted on the other device ----
{
  const parent = ent('e_p', 'Doomed parent');
  const A = world([ent('e_p', 'Doomed parent', { rev: 3, updated: T2, deleted: T2 })], { rev: 3, updated: T2 });
  const B = world([parent, ent('e_c', 'Orphan child', { parentId: 'e_p' })]);
  const r = mergeWorlds(A, B, T2);
  const c = r.world.entities.e_c;
  c && !c.parentId
    ? ok('a child of a deleted parent is reparented to the root')
    : fail(`orphan mishandled: parentId=${c?.parentId}`);
  r.conflicts.some((x) => x.id === 'e_c' && x.reason === 'parent-missing')
    ? ok('…and the reparenting is noted in the inbox')
    : fail('reparenting left no note');
}

// ---- 6. plane divergence files a note; rev is never bumped ----
// same world rev reached on both devices with different planes = divergence
{
  const A = world([], { planes: [{ id: 'p1', anchors: [1] }], rev: 5, updated: T2 });
  const B = world([], { planes: [{ id: 'p1', anchors: [2] }], rev: 5, updated: T1 });
  const r = mergeWorlds(A, B, T2);
  r.conflicts.some((c) => c.id === 'planes')
    ? ok('diverged planes file an inbox note (coarse LWW for v1)')
    : fail('plane divergence went unnoted');
  r.world.rev === 5
    ? ok('the merged rev is max(local, incoming) — never bumped')
    : fail(`rev inflated: ${r.world.rev}`);
  JSON.stringify(r.world.planes) === JSON.stringify(A.planes)
    ? ok('the world-level winner keeps its planes')
    : fail('planes came from the losing side');
}

// ---- 7. a STALE backup is staleness, not conflict: restoring yesterday's
// copy must not flood the inbox or force a write ----
{
  const A = world([ent('e_x', 'Today', { rev: 4, updated: T2 })], { planes: [{ id: 'p1', anchors: [9] }], rev: 6, updated: T2 });
  const stale = world([ent('e_x', 'Yesterday', { rev: 2, updated: T0 })], { planes: [{ id: 'p1', anchors: [1] }], rev: 3, updated: T0 });
  const r = mergeWorlds(A, stale, T2);
  r.world.entities.e_x.name === 'Today' && r.collided === 0 && r.conflicts.length === 0 && r.added === 0
    ? ok('a strictly-older backup merges silently: no conflicts, nothing added')
    : fail(`stale backup made noise: collided=${r.collided} conflicts=${r.conflicts.length} added=${r.added}`);
}

console.log(failures ? `\nMerge smoke FAILED: ${failures}` : 'Merge smoke: all green.');
process.exit(failures ? 1 : 0);
