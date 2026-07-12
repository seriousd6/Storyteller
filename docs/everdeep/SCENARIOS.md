# Phase 0 Scenario Walks

*2026-07-12. Ten real prep workflows walked through the v1 schemas
(`schemas/`), the kind registry (`kinds/registry.json`), and the frozen
contracts (CONTRACTS.md) — on paper, before any application code. Several
scenarios are literally embodied in `examples/world.example.json` (the
Vessia fixture), which the validator (`scripts/validate.mjs`) checks
structurally, cross-referentially, and against the contract test vectors.*

*Each walk ends in a verdict; findings are numbered SF-n and their
resolutions are already baked into the schemas/contracts.*

---

## S1 — Blank start: hand-build a village, tavern, keeper

Steps: new world (blank option) → create settlement under world → building
under it → person under that → prose in each body, a few suggested fields.

Records after: 4 entities, no `gen` blocks, containment via `parentId`.
Suggested fields never blocked saving (prose-first pillar holds — fields
are offered, not demanded).

**SF-1:** hand-made entities need ghost children too ("+ Add" suggestions on
a hand-made tavern). → Ghost child seeds hang off the **entity id**
(`<worldSeed>/e:<id>/c:<kind>:<slot>`), not off the parent's own generation
seed. Hand-made and generated parents behave identically, and regenerating
or moving a parent never disturbs its children's seeds. (CONTRACTS §1.)
Verdict: **works.**

## S2 — "Generate me a world" (campaign starter)

Steps: generate-first flow → plan `plan:campaign-starter` mints region, home
settlement, tavern, NPCs, faction, and quest webs; user keeps it.

Records after: the Vessia fixture is a hand-scale version of this output —
quest `e_questbarrowd01` with role-minted villain/faction/lair/prize, all
cross-mentioned.

**SF-2:** roles must mention each other's entities *before* anything is
materialized — so ghost ids must exist pre-materialization. → Ghost id =
`e_ + h64(seedPath)`, stable and derivable (CONTRACTS §2).
**SF-3:** keeping a web must be atomic — materializing the quest but not its
villain leaves dead mentions. → Story-web mint is one batch write
(CONTRACTS §6).
Verdict: **works,** given SF-2/SF-3.

## S3 — Bottomless browse: world → region → settlement ghosts

Steps: open region page → 2 ghost settlements offered (slots from the kind's
`childSuggestions`, order frozen) → drill into ghost settlement → its ghost
tavern → its ghost keeper — three ghost levels deep, nothing stored → close
browser → return: same ghosts.

**SF-4:** determinism across sessions requires the slot *order* in
`childSuggestions` to be part of the frozen contract — reordering the
registry list would re-seed every ghost. → Recorded in the registry schema
(`childSuggestions` description) and CONTRACTS §6.
Verdict: **works;** nothing is written until touched.

## S4 — Keep the keeper, but lock her name

Steps: materialize ghost keeper (ancestor path materializes too — Q12) →
rename her (override `name`) → "Regenerate" → everything rerolls except name.

**SF-5:** overrides referencing body content by array index break on
reorder. → Everdeep bodies require stable block `id`s; overrides are
`name | field:<key> | block:<blockId>` (CONTRACTS §7). The fixture's Maren
(`e_1xwb45d0l9i7re`) carries exactly this: `overrides: ["name"]`.
Verdict: **works.**

## S5 — Map curation: paint, name, layer an image

Steps: rename hex `region:12,-4` to "Thornwald Edge", paint a neighbor
`hills`, dismiss one suggested ghost settlement, upload a hand-drawn map,
calibrate its span.

Records after (fixture `p_surface`): two sparse hex records, one image
layer. Ghost terrain elsewhere untouched — zero storage.

**SF-6:** hex paint must *override* the ghost biome, never fork a second
truth — the hex record is a sparse overlay, single source at render time.
Biome ids are therefore contract-frozen (13 ids, CONTRACTS §5).
Verdict: **works.**

## S6 — The quest's dungeon, later moved

Steps: quest web places Barrowdeep 2–6 hexes from the threatened town
(placement rule) → months later the GM drags its anchor to a better spot.

**SF-7:** placement rules must run **once at mint** and never again —
re-running would fight the GM's drag. → Anchors carry `placedBy` as pure
provenance (`plan:quest-web#lair` in the fixture); placement is not a
constraint, it's an initializer. Verdict: **works.**

## S7 — Session prep: search, pin, print

Steps: search "innkeeper" → finds Maren via field text → pin her entity to
tonight's sheet (live reference block) → print a gazetteer of Bram's Hollow
subtree.

**SF-8:** search must index `name`, `aliases`, tags, field values, and body
text — aliases matter ("The Hollow" finds Bram's Hollow). Player-view
search must exclude secret entities *and* secret blocks' text.
Verdict: **works;** search index is derivable, nothing stored.

## S8 — Secrets at the table

Steps: mark Maren's `b_maren2` block secret → toggle Player View → project:
the block, and the tombstoned draft NPC, and secret entities disappear from
pages, search, and exports.

**SF-9:** per-block secrecy belongs on the entity (`secretBlocks:
[blockId]`), not on the shared Block schema — sheets and print reuse blocks
and must stay secrecy-agnostic. (CONTRACTS §7.)
Verdict: **works.**

## S9 — Two devices, one world

Steps: edit Maren's motivation on the phone; rename her on the desktop;
Drive sync runs on both.

**SF-10:** `updated` timestamps alone can't detect concurrent edits (clock
skew). → Every entity carries a monotonic `rev`; conflict = both sides
advanced past the common ancestor; resolution = LWW by `updated` with the
losing copy in the world's `conflicts` inbox (fixture has one such entry) —
never silent loss. Deletions are tombstones so a delete beats a stale edit.
(CONTRACTS §8.)
Verdict: **works,** honestly (conflicts surface; no magic merge claimed).

## S10 — Leave with everything: Obsidian export, JSON round-trip

Steps: export world JSON → re-import into a fresh browser → ids, mentions,
map, sites intact. Export Markdown vault → open in Obsidian → wikilinks
resolve.

**SF-11:** Markdown filenames from names alone collide (two "Old Mill"s) →
filenames are `Name (e_xxxxxx).md` with the id suffix; `{@e id|label}`
becomes `[[Name (e_xxxxxx)|label]]`. Round-trip fidelity is why ids are
opaque and stable (Q10). Verdict: **works.**

---

## Findings the validator caught mechanically (SF-12)

Running `scripts/validate.mjs` against the fixture found two taxonomy gaps
the paper walks missed:

- **`biome` couldn't contain `settlement`** — but "a village in the
  Deepmire" is natural. Fixed: biome childKinds now include settlement,
  place, person.
- **`region` couldn't contain `person`** — but the quest web parents its
  at-large villain (Sceolan) to the region, not to any settlement. Fixed:
  region childKinds now include person.

Lesson recorded: **role-minted entities stress the containment taxonomy in
ways hand-authoring doesn't** — every new story-web plan should be run
against the validator's parent/child check before shipping.

## Phase 0 status

- [x] Entity, world, kind-registry, story-web-plan schemas (v1 drafts)
- [x] Kind registry v1 (6 day-one + 13 on-demand/reference kinds)
- [x] Frozen contracts: seed paths, hash + pinned vectors, ghost identity,
      drift policy, RNG streams, biome/tier enums, sync primitives
- [x] Ten scenario walks + mechanical validation (all green)
- [x] Hex-zoom prototype (`v2/public/labs/hex-zoom.html`, served at `/labs/hex-zoom.html`)
- [ ] Owner review of this package → **freeze**, then Phase A begins
      (IndexedDB store + entity pages against these schemas)
