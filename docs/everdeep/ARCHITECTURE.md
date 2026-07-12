# Everdeep Architecture Plan

*Drafted 2026-07-12. Companion to [SURVEY.md](SURVEY.md) (the competitive
evidence). This is a planning document — no code ships from it directly.
Sections marked **⚠️ SLOW** are features that benefit from extremely slow
consideration and extended design time; do not rush them, and do not let a
fast phase create facts-on-the-ground that constrain them.*

---

## 1. Vision

One sentence: **every generator on the site becomes a way to add a permanent,
linked, editable page to your world — and every page in your world offers
generators for whatever could live inside it.**

The user story at full depth:

> I create a world. It has a seed. I generate (or write) its cosmology,
> continents, and pantheon. I open a region — its biome, settlements, and
> ruins are offered as generated suggestions I can accept, reroll, edit, or
> discard. I accept a city; it arrives with a government, districts, and
> notable NPCs as *ghost entries* — visible, consistent, but not yet "real."
> I click into a district, then a tavern in it; the tavern materializes with
> its keeper, menu, patrons, and rumors (the existing Tavern One-Pager,
> reborn as wiki content). The keeper's page backlinks to the tavern, the
> tavern to the district, the district to the city, the city to the region's
> map pin. Months later I search "innkeeper" and find her again, edit her
> secret, and pin her to tonight's session sheet.

Design pillars, each traceable to survey evidence:

1. **Generate, then curate** (Azgaar) — generation always produces editable
   records, never dead text (anti-donjon).
2. **Lazy depth via seeds** (Azgaar→Watabou generalized) — the world is
   *potentially* infinite because children are derived from seeds on demand,
   not stored in advance. Materialize on touch (copy-on-write).
3. **Prose-first, structure-available** (anti-Kanka, anti-World-Anvil) — a
   page is a document you write in, with typed fields when useful, never a
   form you must fill.
4. **Progressive disclosure** (anti-World-Anvil) — five entity kinds visible
   on day one; the rest appear when the world calls for them.
5. **Free, local-first, exportable** (Obsidian/our own DNA) — no accounts
   required, data lives in the browser + user-owned backup, and everything
   exports to open formats.
6. **Clean licensing** — SRD CC-BY + credited community tables only. Never
   replicate 5etools' content position.

---

## 2. What we build on (existing assets)

| Existing asset | Role in Everdeep |
|---|---|
| `engine/roll.ts` + `rng.ts` — seeded, deterministic, tree-resolving, fragment lock/reroll | The generation kernel. Already beats donjon (lock-and-reroll) and matches Watabou (determinism from seed). |
| `Block` schema (`schemas/block.schema.json`, six typed blocks, one renderer) | The *content* unit of every entity page body. Already 5etools' "one typed tree, one renderer" architecture. |
| `Block.source {generator, seed}` provenance | Already anticipates entity provenance — extend, don't replace. |
| 20+ generators / composites (tavern, NPC, shop, government, world, magic, encounter, hoard…) | The initial **generation bindings** — each maps to an entity kind (see §5.3). |
| 461 tables / 82k entries, tag-filtered rolls (`{table:id#tag}`) | The content substrate for context-aware generation (§5.5). |
| `sheetStore.ts` (localStorage sheets of blocks) | The session-prep surface stays; sheets gain the ability to *reference* entities. |
| Drive backup — versioned envelope explicitly designed for new document types | Sync/backup path: envelope v2 adds `worlds` beside `sheets`. |
| Static Astro site, per-tool lazy registries, validate/smoke pipeline | Deployment model unchanged. Everdeep is a client-side island; no backend introduced in core phases. |

**The one hard constraint:** no server — **permanently** (owner, 2026-07-12,
Q28: local-first, GitHub Pages, free; no plan for anything bigger).
Everything must work as a static site. Features that genuinely require a
backend (realtime collaboration, accounts, server-hosted sharing) are out of
scope for good; sharing happens through files, exports, and URL/file import.

---

## 3. Core data model

### 3.1 Entity ⚠️ SLOW — get this right before writing any code

The single most migration-hostile decision in the whole plan. Every future
feature (links, maps, timelines, secrets, export, generation bindings) hangs
off this shape. Recommend a full design pass with written scenarios *and* a
throwaway prototype before freezing v1 of the schema.

Draft shape (to be challenged, not implemented as-is):

```jsonc
{
  "id": "e_x7Kf9q",            // short unique id, stable forever
  "worldId": "w_abc123",
  "kind": "settlement",         // from the kind registry (§3.2)
  "name": "Bram's Hollow",
  "aliases": ["The Hollow"],
  "status": "materialized",     // "ghost" | "materialized" (§4)

  // The containment tree — one parent, any number of children.
  "parentId": "e_region42",

  // Typed non-containment relations (Kanka-style, directional).
  "relations": [
    { "type": "ruledBy", "target": "e_npc17" },
    { "type": "memberOf", "target": "e_faction3" }
  ],

  // Structured fields — kind-suggested, never kind-required. Prompt-style
  // labels teach worldbuilding (World Anvil's best-loved pattern).
  "fields": { "population": "800", "government": "Hereditary reeve" },

  // The page body: existing Block[] — prose-first, one renderer.
  "body": [ /* Block[] with entity mentions in text (§6) */ ],

  // Generation provenance (§4). Absent on hand-made entities.
  "gen": {
    "generator": "composite:tavern-page",
    "seed": "w_abc123/e_region42/settlement:3",
    "overrides": ["name", "body.2"]   // user-edited parts, never regenerated
  },

  "tags": ["coastal"],
  "secret": false,                     // Phase E expands this (§9)
  "created": "2026-07-12T…", "updated": "…"
}
```

Design questions to resolve slowly (each has a wrong-looking-right answer):

- **One parent or many?** A tavern is in a district; is its keeper "in" the
  tavern or "in" the city? Recommendation: containment is strictly one
  parent (a tree, which maps and breadcrumbs need); everything else is a
  relation. But test this against real prep workflows first.
- **Are fields typed or strings?** RESOLVED (owner, 2026-07-12 — Q7):
  **default typings ship** — each kind's registry entry declares its field
  types (number, text, date, entity-ref), so queries and exports behave.
  Users define their own typings post-launch (v2.5), and v2.5 also lets
  them bind their own random tables to those typings.
- **Soft delete / tombstones** — needed the moment sync exists (§8).
- **Id scheme** — must survive export/import and merge; no array indexes
  anywhere.

### 3.2 Kind registry — depth comes from data, not code

Do **not** hardcode a hierarchy (world > region > city > district…). Instead
a registry file (schema-validated JSON, same discipline as tables) declares
kinds; depth is unbounded because kinds declare what they can contain:

```jsonc
{
  "id": "settlement",
  "label": "Settlement",
  "icon": "🏘",
  "childKinds": ["district", "building", "person", "landmark", "item", "event"],
  "suggestedFields": [
    { "key": "population", "label": "Who lives here, and how many?" },
    { "key": "defenses",   "label": "What protects this place?" }
  ],
  "generators": [                       // §5 — the generation bindings
    { "id": "composite:settlement", "label": "Generate this settlement" }
  ],
  "childSuggestions": [                 // what "+ Add" offers (§5.2)
    { "kind": "building", "generator": "composite:tavern-page", "label": "Tavern" },
    { "kind": "person",   "generator": "composite:npc-block",  "label": "Resident" }
  ]
}
```

Initial kinds (progressive disclosure — this is the *day-one five* plus the
rest, revealed on demand):

- **Day one (Q8, resolved):** `world`, `place` (generic), `settlement`,
  `person`, `faction`, `note` — six kinds.
- **Revealed as used:** `region`, `biome`, `landmark`, `district`,
  `building` (business/temple/keep…), `item`, `creature`,
  `event`, `deity`, `culture`, `language`, `quest`, `session`.
- The full drill-down chain the vision requires is expressible:
  world → region → biome/landmark → settlement → district → building
  (business) → person (worker) → item — every hop is just
  `childKinds`, so "near infinite depth" is a data statement, not a code
  change. A `person` can contain `item`s; an `item` can contain a `note`;
  nothing bottoms out.

**⚠️ SLOW element:** the kind taxonomy itself. Renaming/merging kinds after
users have worlds is painful. Ship few kinds, add slowly; never remove.
**User-defined kinds are planned** (owner, Q9 — v2.5, eventually with
custom randomization), which raises the bar further: the registry format is
itself a public contract users will author against.

### 3.3 World

```jsonc
{
  "id": "w_abc123",
  "name": "Vessia",
  "seed": "vessia-prime",        // root of the whole deterministic lineage
  "entities": { /* id → Entity */ },
  "maps": [ /* §7 */ ],
  "calendar": null,               // Phase D
  "kindOverrides": {},            // user tweaks to the registry, per world
  "version": 1
}
```

---

## 4. The generation model: seeds, ghosts, copy-on-write ⚠️ SLOW

This is the signature feature — the generalization of the Azgaar→Watabou
handoff into a persistence-aware system, and the thing no competitor has.
It is also subtle: the *seed lineage contract* is nearly impossible to change
once worlds exist, because changing it silently regenerates everyone's
un-materialized content. Design it slowly, document it as a frozen contract,
and version it explicitly.

### 4.1 Seed lineage

Every entity's seed is derived, never random:

```
childSeed = H(parentSeed, childKind, slotIndex)     // H = stable hash
```

- The world seed is the root. A region's 3rd suggested settlement always has
  seed `H(regionSeed, "settlement", 3)` — the same tavern keeper greets you
  every time you look, **even though she was never saved anywhere** (Watabou's
  trick, made recursive).
- The existing engine is already seed-deterministic (`smoke` tests assert it),
  so a seed + generator id + options fully reproduces any output.
- **Frozen-contract requirements:** the hash function, the slot-index scheme,
  and each generator's *table-consumption order* become compatibility
  surfaces. Table edits (adding entries) will change outputs for
  un-materialized ghosts — acceptable and inevitable — but the *structure*
  (how many children, their kinds, their seeds) must stay stable. Consider a
  `genVersion` stamped per generator so old ghosts can pin old behavior.

### 4.2 Ghost entities

When viewing any entity page, its plausible children are *presented* without
being *persisted*:

- A settlement page shows "Notable places" — N ghost buildings with names and
  one-line descriptions, generated on the fly from derived seeds.
- Ghosts render visibly distinct (dotted border / "unwritten" styling — the
  UI metaphor: *the world exists in potential; writing makes it real*).
- Interacting with a ghost offers: **Keep** (materialize as-is), **Reroll**
  (bump a reroll counter mixed into the seed, persisted on the parent),
  **Edit** (materialize + open editor), **Dismiss** (persist a tombstone so
  it never reappears), or just **drill in** (view the ghost's own page, whose
  children are ghosts too — this is the infinite-depth browse).
- **Only materialized entities and dismissals are stored.** A world where the
  user wrote 50 pages stores 50 entities plus small per-parent ghost state —
  while browsing feels bottomless.

### 4.3 Copy-on-write materialization

Materializing copies the generated output into a real Entity with
`gen.{generator, seed}` provenance and begins tracking `overrides`. From then
on, "Regenerate" affordances operate *around* overrides — the existing
fragment-level lock/reroll engine already implements exactly this semantics
at the text level; this extends it to the entity level.

### 4.4 Consistency propagation ⚠️ SLOW (design now, build late)

The survey's gap #3: regenerating an NPC should respect their culture's
name-bases, their faction, the local calendar. This requires generators to
accept a **context object** (ancestor chain: culture, biome, settlement size,
active tags) and tables to be tag-filterable by it — the `{table:id#tag}`
mechanism is the seam. Full constraint-solving is a research project; the
Phase-B version is just: pass ancestor tags into rolls. Do not promise more
than tag-plumbing early; genuine coherence (e.g., demographically consistent
populations, donjon's demographics chain) is a slow, separate track.

---

## 5. Generation bindings — "everything in the frontend becomes optional generation"

### 5.1 The adapter layer

Composites already emit `Block[]`; slot generators emit paragraph blocks. A
thin **entity adapter** per binding maps generator output to an Entity:
name extraction, field extraction (e.g., Quick NPC's race/vocation → fields),
body blocks, and child ghost declarations (a generated tavern declares a
ghost `person` for its keeper). Adapters live beside composites
(`src/composites/*.entity.ts` or a declarative `bindings/*.json` where
extraction is simple).

### 5.2 The universal "+ Add" affordance

On every entity page, one consistent control (this replaces "browse to the
right generator page" as the primary generation UX):

```
+ Add to Bram's Hollow ▾
   Blank page…          (pick any allowed kind)
   ── Suggested ──
   🍺 Tavern            (generated — composite:tavern-page)
   🏪 Shop              (generated — composite:shop-page)
   👤 Resident          (generated — composite:npc-block)
   ⚔️ Encounter here    (generated — composite:encounter, biome-filtered)
   🎲 Roll on a table…  (any of the 461 tables → a note/field)
```

Existing generator pages stay (they serve drop-in users) and gain a
**"Save to world…"** button beside the existing "pin to sheet" — the same
adapter, invoked from the other direction.

### 5.3 Initial binding map (all from existing code)

| Existing tool | Entity kind produced | Notes |
|---|---|---|
| World generator (10 slots) | `world` fields + body | Origin, deities, magic, peoples → world page sections |
| Government | `settlement`/`region` fields | Government, economy, foreign policy |
| Magic | `world`/`culture` sections | |
| Tavern / Tavern One-Pager | `building` (+ ghost `person` keeper, ghost `event` rumors) | The showcase binding — donjon-density into the wiki |
| Shop One-Pager | `building` (+ ghost keeper, inventory `item`s) | |
| NPC / Quick NPC / Character Oracle | `person` | |
| Villain | `person` (antagonist tag) | |
| Adventure / Plot Hooks / Quest Oracle | `quest` | |
| Encounter Builder | `event` (encounter) with creature links | Biome/CR filtered by ancestor context |
| Treasure Hoard / Loot | `item` set or an inventory field | |
| Dungeon Dressing / Scavenge | `note`s on a `landmark`/`building` | |
| Monsters DB (697 creatures) | `creature` reference kind | Read-only reference entities, linkable |
| **Gap to build:** settlement/region/biome/landmark/district generators | — | v1 mined the legacy settingBuilder/LOCATION builders (deferred in CONTENT.md) — this is the priority extraction work |

### 5.4 No external deep-links or imports (owner decision, 2026-07-12)

Earlier drafts proposed Watabou/Azgaar deep-links and `.map` import as
stopgaps. **Rejected:** we mold our own generation process on their ideas
rather than linking out or importing. Native hex-tier maps ([MAPS.md](MAPS.md))
are the plan of record; the only interim map feature is image upload
(§7.2).

### 5.5 World-aware tables (survey gap #4, nearly unoccupied)

Once entities exist, a new token — e.g. `{world:person#faction=X}` — lets
tables roll against *the user's own world* ("a rumor mentions {world:person}").
This is the Obsidian-DIY feature nobody ships turnkey. Medium effort, huge
payoff, builds entirely on the existing token grammar. Phase C/D.

### 5.6 Story webs — connected generation ⚠️ SLOW (owner requirement Q14, 2026-07-12)

The owner's core generation requirement, verbatim in spirit: *quests,
people, dungeons, and regions must have interconnections; generation must
store variables that actually represent someone, somewhere, or something;
those references must appear on the map; referenced dungeons must exist
there with the quest's item or enemy inside, theming matched.*

The engine already has the seed of this: `{var:n=table:id}` binds a rolled
*string* for reuse within one generation. Story webs promote that mechanism
one level: **role bindings** that resolve to *entity references*.

- **A generation plan declares roles.** A quest plan might declare:
  `villain (person)`, `patron (person)`, `lair (landmark|site)`,
  `prize (item)`, `threatened (settlement)`. Each role carries kind,
  tag/theme filters, and a **placement rule** (e.g., lair: a region hex
  within N hexes of `threatened`, biome-compatible, off-road).
- **Roles mint ghost entities** (Phase B, v1): resolving a role creates a
  ghost with a derived seed, cross-mentioned in every other role's body
  ("hired by {@e patron} to recover {@e prize} from {@e lair}"). Keep the
  quest → the whole web materializes as linked pages.
- **Roles place themselves on the map** (Phase C, v2): the lair becomes a
  map anchor per its placement rule; its ghost site (Phase E, with M3)
  generates themed by the web's tags — undead theme flows to dungeon motif,
  monster selection (`#tag` filters over the 697-creature DB), and loot;
  the `prize` is seeded into a room.
- **Roles reuse existing entities** (Phase E, v3): a role may resolve to a
  *materialized* entity matching its filters instead of minting — the new
  quest recruits your existing blacksmith as its patron, weaving generated
  content into curated lore. Reuse needs care (consent affordance: "use my
  existing NPC? [yes/mint new]") — hence last.
- **The campaign starter** (Phase C launch flow): "generate me a world" runs
  an orchestrated plan — region, home settlement with tavern, a handful of
  NPCs and factions, and 3–5 quest webs whose roles cross-reference each
  other and the map — **enough content for the first few sessions of a
  campaign** out of one click.

**Why ⚠️ SLOW:** the role/plan format is a new declarative layer over the
engine (effectively a small constraint language: kinds, filters, placement,
cross-references), and no surveyed tool has prior art. Design in Phase 0
alongside the seed contract (roles must derive seeds the same frozen way);
build in thin slices (mint-only → placed → reused). The quest/worldbuilding
generation content itself (plans, themes, better quest tables) is expected
to need **heavy iterative improvement** — treat plan authoring as content
work that continues indefinitely, like tables.

**Owner directives (2026-07-12, batch 2 — see PLAN.md §3.5):**

- **Quest chains (true side quests):** a plan may declare `chains` — the
  quest mints `leadsTo` follow-up quests. Small local chains (2–4 quests
  sharing a small cast and area, roles resolved by REUSE against the
  chain's own mints) are the common case; long regional chains are rare.
  Chain scope is a weighting, not a wall.
- **Life webs (non-quest texture):** a second plan family mints
  interconnected content with no quest attached — shops with rival
  keepers, a family spread across two towns, a tavern circuit, a trade
  feud, people of interest. Their purpose is inhabitedness; quest webs
  preferentially recruit life-web entities as patrons, victims, and
  locations, which is what makes the world read as one fabric rather
  than quest scaffolding.
- **Density bar:** the campaign starter's acceptance test rises to one
  kingdom holding ~20 quest webs (mostly local chains), the settlements
  and cast to support them, plus life-web texture beyond any quest. The
  Vessia fixture grows into a small demonstration of all of the above
  and doubles as the regression fixture for interconnection.

---

## 6. Linking, mentions, backlinks (table stakes — build early)

- **Mention token:** extend the Block text grammar (5etools-style) with
  `{@e e_x7Kf9q|display text}`. One renderer change lights up links in every
  surface (wiki pages, sheets, print).
- **Editor affordance:** `@` autocomplete against world entities (name +
  aliases). Insert as mention token.
- **Backlinks:** computed index (targetId → mentioning entities) rebuilt
  incrementally on save — no stored duplication. Every page gets a
  "Referenced by" panel (LegendKeeper's linked-references).
- **Hover tooltips:** name, kind, breadcrumb, first body line — free from the
  entity record. (World Anvil charges for this; we don't.)
- **Autolinker** (Scabard/WA pattern — plain-text name occurrences become
  links): ship as a *suggestion* pass, never auto-rewrite silently ("Bram's
  Hollow" is also a phrase). Phase C polish.
- Sheets learn the same token: pinning an entity to a sheet embeds a live
  reference block, closing the prep loop (wiki → session sheet → print).

---

## 7. Maps

**Superseded in detail by [MAPS.md](MAPS.md)** (drafted 2026-07-12 after the
owner's direction: native four-tier hex maps — world / region / locale /
ground — with Google-Maps-style continuous zoom; no external links or
imports). Summary of what MAPS.md establishes:

### 7.1 Native hex-tier map (the plan of record)

- One continuous coordinate plane per world; each tier is an independent hex
  grid over it (a view/spatial index, not a container) — hexes don't nest
  geometrically, and this model sidesteps that cleanly (MAPS.md §2).
- Tier scales: 60-mile world hexes, 6-mile region hexes, 500-ft locale
  hexes; ground tier is **site patches** (bounded battle-scale maps anchored
  at points), not a global grid (MAPS.md §3).
- **Hexes are seed slots** — `hexSeed = H(worldSeed, tier, q, r)` gives
  deterministic ghost terrain/features everywhere with zero storage; only
  touched hexes are stored (copy-on-write space, unified with §4's ghost
  entity system).
- Landmarks are entity anchors with a home tier, visible at their grain and
  finer, aggregated into badges at coarser tiers; click a hex → side panel
  with contents + "+ Add here" (§5.2 made spatial).
- Generation staged G1–G6 (world terrain → region features → rivers/roads →
  locale wilderness → settlement morphology → ground sites); settlement
  morphology (G5) is **⚠️ SLOW — the slowest item in the platform plan**;
  hex-resolution terrain (G1) is fast and ships first.

### 7.2 Image upload — the only stopgap (and a keeper)

An uploaded map image pins to the plane as a background layer with a scale
calibration step ("this image spans N miles"), coexisting under the hex data
layer. This is the sole interim map feature per owner decision, and it
remains useful permanently (hand-drawn art under live data).

---

## 8. Storage, sync, export

### 8.1 Local persistence

- **IndexedDB, not localStorage.** Worlds with map images and hundreds of
  entities will blow the ~5MB localStorage budget. Thin promise wrapper, one
  object store per world + an index store; `sheetStore` stays in
  localStorage (migrating it is optional later).
- In-memory working set with debounced writes; entities are small JSON, maps
  are blobs.

### 8.2 Sync & backup ⚠️ SLOW (the merge problem)

- Drive envelope v2: `{sheets, worlds}` — the envelope was designed for this.
  Whole-file backup/restore ships early (Phase A) because it's already-solved
  code.
- The slow part is **merge**: the moment a user edits on two devices,
  last-write-wins destroys work. Options (decide before advertising
  multi-device): per-entity `updated` timestamps with field-level three-way
  merge; or CRDT (heavyweight dependency, against codebase culture); or
  honest single-device-at-a-time locking with a "which copy wins?" prompt.
  RESOLVED (Q23): per-entity LWW with a conflict inbox (never silent loss).
  CRDTs are permanently out along with collaboration (Q28).
- Tombstones (§3.1) are required for any merge scheme — bake into schema v1.

### 8.3 Export (no-lock-in is table stakes)

- **World file**: one JSON export/import (Azgaar `.map` precedent) — trivial,
  Phase A.
- **Markdown vault**: one folder-per-branch, one `.md` per entity, YAML
  frontmatter from fields, wikilinks from mentions — *directly usable as an
  Obsidian vault*. This is the credibility feature for the "files you own"
  crowd. Phase C.
- **Print**: entity pages through the existing print stylesheet; a "gazetteer"
  print of a subtree (city + children) is a distinctive cheap win.
- **Foundry compendium module** (survey: every wiki eventually builds one):
  journals from entities, preserving links as `@UUID`. Phase E, after the
  model stabilizes.

---

## 9. Secrets & player sharing ⚠️ SLOW (design early, ship late)

World Anvil's killer feature; also a permission model, and permission models
are never simple. Without a backend, "player accounts" don't exist, so phase
it honestly:

- **Phase C (cheap, real):** per-entity and per-block `secret` flag + a
  global "Player view" toggle that renders the world without secrets. Export
  respects it (player handout export). This covers the solo-GM-projecting-at-
  the-table case and the printed-handout case with zero backend.
- **Phase E:** shareable read-only snapshot — export a static player-safe
  bundle (single HTML file or Drive-hosted JSON the site can load read-only
  via link). Still no backend.
- **Out of scope permanently (Q28):** true subscriber groups / per-player
  visibility à la World Anvil require accounts and hosting — the project is
  local-first for good. The snapshot export is the ceiling of the sharing
  model. (The `secret` data shape still allows `visibility: [groupId]`
  growth at zero cost, so per-*export* audiences — separate player-safe
  bundles per group — remain possible without any backend.)

---

## 10. Later-horizon features (all ⚠️ SLOW — flagged for extended consideration)

| Feature | Why it's slow | Cheap precursor to ship instead |
|---|---|---|
| ~~Realtime collaboration~~ | RESOLVED OUT (Q28): requires a backend; local-first permanently | World-file share + merge inbox (§8.2) is the ceiling |
| **Community world/table sharing** (Perchance's moat) | No central repo ever (Q28); "import from URL/file" (the 5etools brew-manager pattern) is the whole mechanism | Ships with v2.5 custom tables |
| **Calendars & timelines** (Phase D) | Custom-calendar math is a deep well (Kanka/Fantasy Calendar depth); date fields must be calendar-aware from schema day one | Simple era+event timeline entity kind first; donjon-calendar import |
| **Time-versioned world state** (survey gap #7 — "who rules in 1023 vs 1305") | Genuinely novel = genuinely unproven; touches every entity's schema | Date-stamped relations ("ruledBy, 990–1023") render as history sections |
| **Query views** (Dataview-style: "every NPC where faction=X") | Depends on field typing decisions (§3.1) | Kind + tag + relation filter lists, URL-serialized (5etools filter DNA) |
| **Data-derived visualizations** (family trees, diplomacy webs) | Cheap only *after* relations are richly used; premature = empty graphs | Relation lists on pages; graphs when data density earns them |
| **Settlement morphology (G5)** (MAPS.md §6) | Watabou-grade street/building rendering is a multi-year polish project | District blobs + named building anchors on locale hexes (stage a) |
| **Full consistency propagation** (§4.4) | Constraint solving across generators | Ancestor-tag plumbing into `{table:#tag}` rolls |
| **Multi-genre worlds** (sci-fi drill-down: sector→system→planet→city) | Content, not architecture — the tag system supports it; the tables don't exist yet | Keep kind registry genre-neutral from day one (it costs nothing now) |

---

## 11. Phasing summary

Each phase is shippable and independently valuable; ⚠️ SLOW items have their
*design* pulled early and *implementation* pushed late.

- **Phase 0 — design freeze (slow on purpose):** entity schema, kind
  registry, seed-lineage contract, id/tombstone scheme, and the map
  decisions in MAPS.md §11 (plane model, orientation, tier scales, site
  grids). Written scenarios + throwaway prototypes (the hex-zoom prototype
  exists). Nothing ships; everything downstream depends on it.
- **Phase A — the wiki exists:** IndexedDB world store; entity pages
  (prose-first, Block body, suggested fields); create/edit/move/delete;
  breadcrumb + tree navigation; world JSON export/import; Drive envelope v2.
- **Phase B — generation lands in the wiki:** adapter layer; "+ Add"
  suggestions on every page; "Save to world" on every existing generator;
  ghost children + materialize/reroll/dismiss; seed lineage live;
  **story webs v1** (role bindings minting linked ghost entities — §5.6);
  extraction of the deferred settlement/region/biome builders from v1 (the
  missing kinds' generators).
- **Phase C — it feels alive:** mentions + backlinks + hover tooltips;
  autolink suggestions; **hex map M1–M2** (viewer, ghost terrain, paint,
  anchors, side panel, multiple planes — MAPS.md §10) with image-layer
  upload; **story webs v2 + the connected campaign starter** (§5.6);
  secret-flag + player view; Markdown/Obsidian vault export; world-aware
  table tokens; gazetteer print.
- **Phase D — time:** calendar entity (donjon import), era/event timelines,
  calendar-aware date fields.
- **Phase E — reach:** read-only share snapshots; Foundry journal export;
  **hex map M3** (ground-tier sites + story-web-themed dungeon generation);
  story webs v3 (reuse mode); query/filter views.
- **v2.5 — "yours all the way down" (Q7/Q9/Q29):** user-defined kinds and
  field typings; user-authored tables bound to them; custom generator
  composition; table-pack import from URL/file.
- ~~Phase F~~ **RESOLVED (Q28):** there is no backend phase. Local-first,
  GitHub Pages, free — permanently.

## 12. Risks

1. **Schema churn** — the reason Phase 0 exists. Mitigation: versioned world
   files + migration functions from v1, forever (the Drive envelope already
   models this discipline).
2. **Seed-contract drift** breaking ghost stability — treat §4.1 as a frozen,
   versioned contract; smoke-test it like the engine already is.
3. **Scope gravity** — every surveyed tool is 5–10 years of work; the wedge
   is the *integration* (generation↔persistence), not feature parity.
   Anything not serving the drill-down loop defaults to "later."
4. **Static-site ceiling** — the whole plan honestly fits it; be explicit
   (to users too) that there is no realtime collaboration and links are
   local until snapshot sharing, rather than half-shipping either.
5. **Content licensing** — new generators for settlements/regions must keep
   the existing credits discipline; import features must not ingest
   copyrighted compendium content (5etools' fate is the cautionary tale).
