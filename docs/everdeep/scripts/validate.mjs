#!/usr/bin/env node
// Everdeep Phase 0 validator: schemas, fixtures, cross-references, and the
// frozen-contract test vectors (CONTRACTS.md §3). Run from anywhere:
//   node docs/everdeep/scripts/validate.mjs
// Uses ajv from v2/node_modules (run `npm install` in v2/ first).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const require = createRequire(join(here, '../../../v2/package.json'));
const Ajv2020 = require('ajv/dist/2020.js').default;
const addFormats = require('ajv-formats').default;

const load = p => JSON.parse(readFileSync(join(root, p), 'utf8'));
let failures = 0;
const fail = msg => { failures++; console.error('  ✗ ' + msg); };
const ok = msg => console.log('  ✓ ' + msg);

// ---------- 1. schema validation ----------
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);

const entitySchema = load('schemas/entity.schema.json');
const worldSchema = load('schemas/world.schema.json');
const registrySchema = load('schemas/kind-registry.schema.json');
const planSchema = load('schemas/storyweb-plan.schema.json');
ajv.addSchema(entitySchema);

const registry = load('../../v2/src/everdeep/registry.json');
const world = load('examples/world.example.json');
const plan = load('examples/quest-web.plan.json');

console.log('Schema validation');
for (const [name, schema, doc] of [
  ['kind registry', registrySchema, registry],
  ['example world', worldSchema, world],
  ['example plan', planSchema, plan]
]) {
  const validate = ajv.compile(schema);
  if (validate(doc)) ok(`${name} valid`);
  else { fail(`${name} INVALID`); for (const e of validate.errors) console.error('    ', e.instancePath, e.message); }
}

// ---------- 2. registry cross-checks ----------
console.log('Registry cross-checks');
const kindIds = new Set(registry.kinds.map(k => k.id));
const dayOne = registry.kinds.filter(k => k.reveal === 'day-one').map(k => k.id);
if (dayOne.length === 6) ok(`six day-one kinds (Q8): ${dayOne.join(', ')}`);
else fail(`expected 6 day-one kinds, got ${dayOne.length}`);
for (const k of registry.kinds) {
  for (const c of k.childKinds ?? []) if (!kindIds.has(c)) fail(`kind ${k.id}: unknown childKind ${c}`);
  for (const f of k.suggestedFields ?? []) {
    if (f.type === 'entityRef' && !f.refKind) fail(`kind ${k.id}: entityRef field ${f.key} missing refKind`);
    if (f.refKind && !kindIds.has(f.refKind)) fail(`kind ${k.id}: field ${f.key} unknown refKind ${f.refKind}`);
  }
  for (const s of k.childSuggestions ?? []) {
    if (!kindIds.has(s.kind)) fail(`kind ${k.id}: childSuggestion unknown kind ${s.kind}`);
    if (!(k.childKinds ?? []).includes(s.kind)) fail(`kind ${k.id}: childSuggestion ${s.kind} not in childKinds`);
  }
}
// unbounded-depth sanity: the flagship chain must be expressible
const chain = ['world', 'region', 'biome', 'settlement', 'district', 'building', 'person', 'item', 'note'];
let chainOk = true;
const byId = Object.fromEntries(registry.kinds.map(k => [k.id, k]));
for (let i = 0; i + 1 < chain.length; i++) {
  const parent = byId[chain[i]];
  // hops may skip: check reachability within two steps
  const direct = (parent.childKinds ?? []).includes(chain[i + 1]);
  if (!direct) { chainOk = false; fail(`drill-down chain break: ${chain[i]} cannot contain ${chain[i + 1]}`); }
}
if (chainOk) ok('drill-down chain world→region→biome→settlement→district→building→person→item→note expressible');

// ---------- 3. world cross-checks ----------
console.log('World cross-checks');
const ents = world.entities ?? {};
const eIds = new Set(Object.keys(ents));
const mentionRe = /\{@e (e_[a-z0-9]{14})(\|[^}]*)?\}/g;
for (const [id, e] of Object.entries(ents)) {
  if (e.id !== id) fail(`entity key/id mismatch: ${id}`);
  if (!kindIds.has(e.kind)) fail(`entity ${id}: unknown kind ${e.kind}`);
  if (e.parentId) {
    if (!eIds.has(e.parentId)) fail(`entity ${id}: missing parent ${e.parentId}`);
    else {
      const pk = byId[ents[e.parentId].kind];
      if (!(pk.childKinds ?? []).includes(e.kind)) fail(`entity ${id} (${e.kind}) not allowed under ${ents[e.parentId].kind}`);
    }
  }
  for (const r of e.relations ?? []) if (!eIds.has(r.target)) fail(`entity ${id}: relation target ${r.target} missing`);
  for (const v of Object.values(e.fields ?? {})) if (v && typeof v === 'object' && v.ref && !eIds.has(v.ref)) fail(`entity ${id}: field ref ${v.ref} missing`);
  const blockIds = new Set((e.body ?? []).map(b => b.id));
  for (const sb of e.secretBlocks ?? []) if (!blockIds.has(sb)) fail(`entity ${id}: secretBlock ${sb} not in body`);
  for (const o of e.gen?.overrides ?? []) if (o.startsWith('block:') && !blockIds.has(o.slice(6))) fail(`entity ${id}: override ${o} not in body`);
  for (const b of e.body ?? []) {
    for (const m of String(b.text ?? '').matchAll(mentionRe)) {
      if (!eIds.has(m[1])) fail(`entity ${id}: mention of missing ${m[1]}`);
      else if (ents[m[1]].deleted) fail(`entity ${id}: mention of tombstoned ${m[1]}`);
    }
  }
  if (e.gen && !e.gen.seed.startsWith(world.seed)) fail(`entity ${id}: seed path does not start with world seed`);
}
ok(`entities checked (${eIds.size})`);

const planeIds = new Set((world.planes ?? []).map(p => p.id));
for (const p of world.planes ?? []) {
  const siteIds = new Set((p.sites ?? []).map(s => s.id));
  for (const a of p.anchors ?? []) if (!eIds.has(a.entityId)) fail(`plane ${p.id}: anchor for missing entity ${a.entityId}`);
  for (const eid of Object.keys(p.claims ?? {})) if (!eIds.has(eid)) fail(`plane ${p.id}: claim by missing entity ${eid}`);
  for (const l of p.links ?? []) if (!planeIds.has(l.toPlane)) fail(`plane ${p.id}: link to missing plane ${l.toPlane}`);
  for (const s of p.sites ?? []) {
    if (!eIds.has(s.entityId)) fail(`site ${s.id}: missing entity ${s.entityId}`);
    if (s.parentSiteId && !siteIds.has(s.parentSiteId)) fail(`site ${s.id}: missing parent site ${s.parentSiteId}`);
    for (const f of s.floors ?? []) for (const [addr, c] of Object.entries(f.cells ?? {})) {
      const [cx, cy] = addr.split(',').map(Number);
      if (cx >= f.w || cy >= f.h) fail(`site ${s.id} floor ${f.label}: cell ${addr} outside ${f.w}x${f.h}`);
      if (c.entityId && !eIds.has(c.entityId)) fail(`site ${s.id}: cell ${addr} missing entity ${c.entityId}`);
    }
  }
}
ok(`planes checked (${planeIds.size})`);

// ---------- 4. plan cross-checks ----------
console.log('Plan cross-checks');
const roleIds = new Set(plan.roles.map(r => r.id));
for (const r of plan.roles) {
  if (!kindIds.has(r.kind)) fail(`role ${r.id}: unknown kind ${r.kind}`);
  if (r.placement?.nearRole && !roleIds.has(r.placement.nearRole)) fail(`role ${r.id}: nearRole ${r.placement.nearRole} missing`);
  if (r.parentRole && !roleIds.has(r.parentRole)) fail(`role ${r.id}: parentRole missing`);
  for (const c of r.contains ?? []) if (!roleIds.has(c)) fail(`role ${r.id}: contains missing role ${c}`);
  for (const rel of r.relations ?? []) if (!roleIds.has(rel.toRole)) fail(`role ${r.id}: relation to missing role ${rel.toRole}`);
  if (r.filters?.relatedTo && !roleIds.has(r.filters.relatedTo)) fail(`role ${r.id}: relatedTo missing role`);
}
for (const b of plan.body ?? []) {
  for (const m of String(b.text ?? '').matchAll(/\{@role:([a-zA-Z0-9]+)\}/g)) {
    if (!roleIds.has(m[1])) fail(`plan body: unknown role token ${m[1]}`);
  }
}
ok(`roles checked (${roleIds.size})`);

// ---------- 5. frozen-contract test vectors (CONTRACTS.md §3) ----------
console.log('Contract test vectors');
function h32(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
const h64 = s => h32(s, 0x9E3779B9).toString(36).padStart(7, '0') + h32(s, 0x85EBCA6B).toString(36).padStart(7, '0');
const VECTORS = [
  ['vessia-prime', 1138472817, 'e_0a1jbsg1wf8upn'],
  ['vessia-prime/p:p_surface', 3925283698, 'e_1vbv1050m2vcfb'],
  ['vessia-prime/p:p_surface/h:region:12,-4', 2436773461, 'e_12gcu71171v671'],
  ['vessia-prime/p:p_surface/h:region:12,-4/f:settlement:3', 2760255946, 'e_1gl6hz11t41vf2'],
  ['vessia-prime/e_a1b2c3d4e5/c:person:0', 3851579379, 'e_1xwb45d0l9i7re'],
  ['vessia-prime/e_a1b2c3d4e5/c:person:0/r:2', 1662088585, 'e_00l8rkb1cf1mj4'],
  ['vessia-prime/e_q9r8s7t6u5/role:villain', 3528998643, 'e_0m2pmaq0l5hi4u']
];
for (const [path, want32, wantId] of VECTORS) {
  const got32 = h32(path, 0), gotId = 'e_' + h64(path);
  if (got32 !== want32) fail(`h32(${path}) = ${got32}, want ${want32}`);
  if (gotId !== wantId) fail(`id(${path}) = ${gotId}, want ${wantId}`);
}
ok(`${VECTORS.length} vectors pinned`);

console.log(failures ? `\nFAILED: ${failures} problem(s)` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
