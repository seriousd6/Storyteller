# Everdeep Frozen Contracts — v1

*Phase 0 deliverable, drafted 2026-07-12. This document is a **compatibility
contract**: once worlds exist in the wild, nothing in here changes without a
`genVersion` bump and an explicit user-facing migration notice ("your
world's unwritten terrain will redraw"). Changes to this file during Phase 0
are free; after Phase B ships, they are breaking.*

*Smoke tests must pin every test vector in this file (the engine's
determinism tests are the model — `npm run smoke`).*

---

## 1. Canonical seed paths

Every generated thing derives from a **seed path**: a human-readable string
built from stable identifiers. Paths, not raw numbers, are the contract —
they are debuggable, loggable, and self-describing.

Grammar (segments joined by `/`):

```
worldSeed                                  user-chosen or generated string (non-empty,
                                           no "/" — enforce at world creation)
  /p:<planeId>                             a plane of the world
  /h:<tier>:<q>,<r>                        a hex (axial ints) at a tier of that plane
  /f:<kind>:<slot>                         a ghost feature suggestion (0-based slot)
  /e:<entityId>                            children of a materialized entity
  /c:<kind>:<slot>                         a ghost child suggestion (0-based slot)
  /role:<roleId>                           a story-web role resolution
  /s:<siteId>[/fl:<n>]                     a site (and floor) generation
  /r:<n>                                   reroll counter suffix (omitted when 0)
```

Examples (these exact strings are the test-vector inputs in §3):

```
vessia-prime
vessia-prime/p:p_surface
vessia-prime/p:p_surface/h:region:12,-4
vessia-prime/p:p_surface/h:region:12,-4/f:settlement:3
vessia-prime/e_a1b2c3d4e5/c:person:0
vessia-prime/e_a1b2c3d4e5/c:person:0/r:2
vessia-prime/e_q9r8s7t6u5/role:villain
```

Rules:

- **Children of materialized entities hang off the entity id**, not off the
  parent's own seed path (`/e:<id>/c:...`). Hand-made entities (no seed)
  therefore get ghost children exactly like generated ones, and moving or
  regenerating a parent never disturbs its children's seeds.
- **Reroll** bumps only the `/r:<n>` suffix; the counter is persisted on the
  parent's `ghostState.rerolls[slotKey]` (entity) or the hex record's
  `reroll` (map). `r:0` is never written.
- **Dismissal** stores the slotKey (`"person:0"`, `"settlement:3"`) in
  `ghostState.dismissed` — the slot renders nothing forever after.

## 2. Ghost identity

A ghost's entity id is derived from its seed path:

```
id = "e_" + h64(seedPath)
```

so ghost ids are **stable before materialization**. This is load-bearing:
story-web bodies can `{@e …}`-mention ghosts, dismissals can reference them,
and materialization keeps the id (the record simply becomes stored). Two
consequences to respect:

- Ids are 16 chars (`e_` + 14 base36 chars). Hand-made entities use the same
  format with 14 random base36 chars — indistinguishable by shape.
- A rerolled ghost is a **different entity** (different path → different id).
  Mentions to the old id die with the old ghost — correct behavior: rerolling
  a quest's villain must not leave the quest pointing at the discarded one;
  role re-resolution rewrites the mentions (story-web mint is atomic, §6).

## 3. The hash (frozen; exact implementation)

64 bits from two independent 32-bit passes. This exact JS is normative —
byte-for-byte:

```js
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
function h64(str) {
  return h32(str, 0x9E3779B9).toString(36).padStart(7, '0') +
         h32(str, 0x85EBCA6B).toString(36).padStart(7, '0');
}
```

Empty input is invalid everywhere (world seeds are non-empty by
construction). Collision check: 0 collisions across 100k derived ids
(2⁶⁴ space).

**Test vectors** (pin these in smoke tests):

| path | `h32(path, 0)` | `"e_" + h64(path)` |
|---|---|---|
| `vessia-prime` | 1138472817 | `e_0a1jbsg1wf8upn` |
| `vessia-prime/p:p_surface` | 3925283698 | `e_1vbv1050m2vcfb` |
| `vessia-prime/p:p_surface/h:region:12,-4` | 2436773461 | `e_12gcu71171v671` |
| `vessia-prime/p:p_surface/h:region:12,-4/f:settlement:3` | 2760255946 | `e_1gl6hz11t41vf2` |
| `vessia-prime/e_a1b2c3d4e5/c:person:0` | 3851579379 | `e_1xwb45d0l9i7re` |
| `vessia-prime/e_a1b2c3d4e5/c:person:0/r:2` | 1662088585 | `e_00l8rkb1cf1mj4` |
| `vessia-prime/e_q9r8s7t6u5/role:villain` | 3528998643 | `e_0m2pmaq0l5hi4u` |

## 4. RNG streams

Generation for a path uses the existing engine RNG (mulberry32) seeded with
`h32(path, STREAM)`. Stream constants keep independent concerns independent
(sampling terrain must not perturb name rolls):

| Stream | Constant | Used for |
|---|---|---|
| `TERRAIN` | `0x0000` | noise field sampling offsets |
| `CONTENT` | `0x0001` | table rolls / generator output |
| `LAYOUT`  | `0x0002` | site/dungeon layout |
| `PLACE`   | `0x0003` | story-web placement choices |

Adding streams is non-breaking; renumbering is breaking.

## 5. Terrain field & biomes (frozen with genVersion 1)

- Noise: value-noise fBm with domain warping, zoom-adaptive octaves
  (`octFor(hexFt)`), and a fixed-amplitude detail bias applied to elevation
  before biome thresholding (so coastlines stay organic at every zoom), as
  implemented in the prototype (`v2/public/labs/hex-zoom.html`, served at
  `/labs/hex-zoom.html`). **Exact parameters are under active tuning during
  Phase 0** — the prototype is the working reference; whatever functions and
  constants it holds at freeze time graduate to the engine verbatim as
  `genVersion 1`.
- **Biome enum (13, frozen ids):** `deep water beach snow tundra taiga
  desert savanna grass forest jungle hills mountain`. New biomes may be
  *added* (non-breaking); ids never change meaning.
- Tier ids `world | region | locale`, orientation `pointy`, unit `ft`,
  default hex sizes 316800 / 31680 / 500 ft. Per-world overrides are set at
  creation and immutable after.

## 6. Structure vs content: the drift policy (Q11)

- **Guaranteed stable within a genVersion:** seed paths, ghost ids, hash,
  stream constants, slot counts/kinds offered per parent kind (the *shape*
  of suggestion lists), biome ids, tier definitions.
- **Allowed to drift:** the *content* a ghost renders (table edits improve
  outputs). Materialized entities never change.
- **Story-web mint is atomic:** keeping a web materializes all its role
  entities and their cross-mentions in one write, so a web can never
  half-drift.
- **genVersion bump** (rare, deliberate): worlds carry their genVersion;
  opening a world with an older one offers migration with the plain-language
  notice. Generators are not kept alive across versions — the offer is
  "redraw unwritten content" (materialized content is untouched regardless).

## 7. Entity & block addressing (for overrides and secrets)

- Body blocks in entity bodies **must carry stable `id`s** (`b_` + 6+
  base36). The shared Block schema keeps `id` optional for sheets; Everdeep
  bodies require it. Reordering never breaks references.
- `gen.overrides` entries are strings: `name`, `field:<key>`, or
  `block:<blockId>`. Regeneration replaces everything *not* listed.
- Per-block secrets are `secretBlocks: [blockId]` on the entity — the shared
  Block schema stays secrecy-agnostic.

## 8. Sync primitives (Q23)

- Every entity and world carries `rev` (monotonic int, bumped per device
  write) and `updated` (ISO). Conflict = both copies changed since common
  ancestor `rev`; resolution = LWW by `updated` with the losing copy placed
  in the world's conflict inbox — never silently dropped.
- Deletions write tombstones (`deleted: ISO`) kept ≥ 180 days before
  compaction, so a deletion always beats a stale edit during merge.
