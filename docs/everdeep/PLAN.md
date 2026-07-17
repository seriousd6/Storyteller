# Everdeep — The True v2: End-to-End Plan

*Drafted 2026-07-12; decisions resolved 2026-07-12 (owner answered all 31
register questions — see §6). The master planning document. [SURVEY.md](SURVEY.md)
is the competitive evidence, [ARCHITECTURE.md](ARCHITECTURE.md) the system
design, [MAPS.md](MAPS.md) the hex-map design; this document is the complete
plan: every planned feature with the user experience driving it, everything
decided against, everything not yet planned, the architecture review, and the
resolved decision register. When this plan is complete, the result is
considered **the true v2** of Storyteller Toolbox.*

**Codename note:** "Everdeep" is the internal codename (never user-facing —
the product is Storyteller Toolbox). The earlier codename "Worldsmith" was
dropped because worldsmith.io is an active commercial TTRPG worldbuilding
platform (a direct competitor), and "WorldLoom" is an existing OSS tool.

---

## 1. What "true v2" means

**Launch definition (Q5: confirmed):** Phases 0 + A + B + C complete —
the wiki exists, generation lands in it, the world feels alive (links,
maps M1–M2, secrets v1, exports, and the connected campaign starter).
Phases D (time) and E (reach) are fast-follows. There is no backend phase:
**local-first, GitHub Pages, free is the permanent identity (Q28).**

**The product sentence:** every generator on the site becomes a way to add a
permanent, linked, editable page to your world — and every page in your
world offers generators for whatever could live inside it, from the world
map down to a dungeon room, navigated by one continuous zoom — and what it
generates is *connected*: quests reference real villains, who lead real
factions, whose lairs appear on the map with the quest's prize inside.

**What happens to the existing site (Q1/Q2):** all part of the Storyteller
Toolbox product. The Solo and Writing pillars get their own overhaul
separately; all random tables survive as accessible sections. Everdeep is
the full integration layer, and becomes the front door at launch. Existing
localStorage sheets and Drive backups remain valid.

---

## 2. Architecture review — findings (2026-07-12 self-review)

Preserved for the record; resolutions folded into §3 and the docs. In brief:

- **F1** Drive envelope couldn't hold image blobs → restructured to index
  file + one file per world + blob files. **Everything syncs, including
  images, in v1 (Q22).**
- **F2** "Pin old generator behavior" overpromised → honest two-tier
  contract: **structure guaranteed, ghost content may drift** as tables
  improve; materialized content never drifts (Q11: accepted).
- **F3** Two seed systems (entity lineage vs hex address) → an entity's
  `gen.seed` is recorded at materialization whatever its source; one
  frozen-contract policy.
- **F4** No search planned → added (Phase C: index + command palette).
- **F5** No undo/revisions → resolved by owner (Q24): full revision history
  is **deferred — tied to collaboration, which is not planned**. Autosave,
  soft-delete trash, and in-session undo remain in Phase A/C.
- **F6** Entity URLs are local-only until share snapshots → honest UX copy;
  wiki ships as one island at `/world/` with hash routing.
- **F7** Ghost-of-ghost state undefined → touching a ghost materializes its
  ancestor path (Q12: confirmed).
- **F8** Sheet↔world bridge underspecified → feature status; sheets are
  **both** global and world-bindable (Q3).
- **F9** Map print/export missing → viewport PNG in M1, print-quality later.
- **F10** Mobile/touch unstated → responsive wiki from Phase A, pinch-zoom
  in M1.

---

## 3. Feature register — everything planned, with its driving UX

Effort: S (days), M (week-ish), L (weeks), XL (months, staged).

### Phase 0 — Design freeze *(nothing ships; everything depends on it)*

| Feature / decision | UX driver | Effort |
|---|---|---|
| Entity schema + id/tombstone scheme frozen (opaque ids, aliases — Q10) | Rename-safe, merge-safe forever | M |
| Kind registry v1: world, place, settlement, person, faction, note (Q8) | Day-one six; the taxonomy unfolds as the world grows | S |
| Default field typings per kind (Q7) — user-defined typings reserved for v2.5 | "Population is a number; queries and exports behave" | S |
| Seed-lineage + hex-seed contract, drift policy (F2/F3, Q11) | "The unwritten world I browsed yesterday is still there today" | M |
| **Connected-generation model: roles, placement, theming (Q14)** — the design pass for §3's story-web features | Quests/people/dungeons/regions must interconnect from day one of Phase B; retrofitting roles onto the adapters would mean redoing them | M |
| Map decisions M0 (recorded in MAPS.md §11: pointy-top, square variable-size nested sites, scales confirmed, multiple planes) | The zoom feel — validated in the prototype | S |
| Written scenarios: 10 real prep workflows walked through the schema on paper | Catches wrong-looking-right modeling before code | M |

### Phase A — The wiki exists

| Feature | UX driver | Effort |
|---|---|---|
| World create/switch/rename/delete | "A home for my campaign world" | S |
| IndexedDB world store, debounced autosave | "I never lose an evening of writing" | M |
| Entity pages: prose-first Block body + typed suggested fields with prompt-style labels | "Let me write, don't make me fill a form"; "the field label taught me what to consider" | L |
| Containment tree, breadcrumbs, sidebar tree nav | "Where am I in my world; what's inside this place?" | M |
| Tree collapsing + drag-to-reparent (owner request, 2026-07-12) | "Fold what I'm not working on; file a page by dragging it under its home" — also the fix for Save-to-world landing pages at root | S |
| TODO: Save-to-world parent picker (choose where the page files at save time) | "Save this tavern straight into Bram's Hollow" | S |
| Create blank entity of any allowed kind; move/reparent; soft delete + trash | Basic authorship | M |
| Progressive kind disclosure | New user sees six kinds; more appear on demand | S |
| World JSON export/import (one file) | "My world is mine — I can leave anytime" | S |
| Drive sync v2: index + per-world files + blobs — **everything syncs (Q22)** | "My whole world, images included, survives my browser" | L |
| Responsive wiki layout | "I prep on my phone on the bus" | M |

### Phase B — Generation lands in the wiki *(the differentiating phase)*

| Feature | UX driver | Effort |
|---|---|---|
| Entity adapter layer (generator output → Entity) | The bridge between the 20 existing generators and the wiki | M |
| "Save to world" on every existing generator page | "I rolled a tavern I love — keep it forever" | M |
| Universal "+ Add" affordance on every entity page (blank / suggested-generated / roll-a-table) | "What could live here? Show me." | L |
| Ghost children: view, drill-in, Keep, Reroll, Dismiss, Edit; ancestor-path materialization (Q12) | "Browse a bottomless world; keep what sings; writing makes it real" | XL |
| Seed lineage live + smoke-tested like the engine | Ghost stability across sessions | M |
| Entity-level regenerate-around-overrides | "Reroll everything about her except the name I chose" | M |
| New generators: region, biome, settlement, district, landmark (mine v1's deferred settingBuilder/LOCATION builders) | The drill-down chain needs generators at every rung | L |
| Ancestor-context tag plumbing into `{table:#tag}` rolls | "Encounters in this hex fit this biome" | M |
| **Story webs v1 (Q14): role bindings in generation** — quests/composites declare roles (villain, patron, lair, prize) that mint ghost *entities* with cross-mentions, not strings | "The quest's villain is a real person page; the reward is a real item page; everything links" | XL |

### Phase C — It feels alive *(launch completes here)*

| Feature | UX driver | Effort |
|---|---|---|
| `{@e id|text}` mentions + `@` autocomplete | "I type @ and my world connects itself" | M |
| Backlinks panel on every page | "Who references this NPC?" | S |
| Hover tooltips on every entity link | The wiki feels alive on hover — free, where WA charges | S |
| Autolink *suggestions* (never silent rewrite) | "It noticed I mentioned Bram's Hollow and offered the link" | M |
| World search + command palette | "Where was that innkeeper?" in 2 keystrokes | M |
| In-session undo + trash recovery (revision history deferred per Q24) | "Ctrl-Z works; deleted isn't gone" | S |
| **Hex map M1**: canvas viewer, pan/zoom/crossfade tiers, G1 ghost terrain, hex select → side panel, biome paint + hex naming, anchors with tier visibility + badges, URL-hash viewport, image layer w/ scale calibration, viewport PNG export, touch/pinch, **metric display toggle (Q21)** | "I start at my world map and zoom toward my tavern's front door, and everything I've saved is where I left it" | XL |
| **Hex map M2**: G2 region ghost features materializing through adapters; "+ Add here" (spatial); claims overlay; **multiple named planes (Q18/Q20 — surface, underdark, other continents/planes, coordinate-linked for descend-here markers)** | "The map suggests a ruin; one click makes it a wiki page pinned right there — and the underdark is a layer of the same world" | XL |
| **Story webs v2 + campaign starter (Q14):** role placement on the map (referenced lairs/dungeons appear as anchors with themed ghost contents — the quest's enemy and prize inside); "generate me a world" produces a region, home settlement, tavern, NPCs, factions, and 3–5 interlinked quest webs — **enough for the first few sessions of a campaign** | The new-world flow (Q14): a playable, interconnected starting sandbox in one click | XL ⚠️ SLOW |
| Secrets v1: per-entity + per-block flag, global Player View toggle, secret-aware export (Q26) | "I project the wiki at the table without spoiling my players" | M |
| Markdown/Obsidian vault export (frontmatter + wikilinks) | "Files I own forever" | M |
| World-aware table tokens (`{world:person#tag}`) | "A rumor table that names MY npcs" | M |
| Sheet ↔ world bridges: pin entity to sheet as live block; send sheet block into world; sheets optionally world-bound (Q3) | Prep loop closes: wiki → session sheet → print | M |
| Gazetteer print (entity subtree through print stylesheet) | Generate→combine→refine→print, at world scale | S |
| First-run: **generate-first** flow (Q14) with a blank-world option | First five minutes decide adoption | M |

### §3.5 Living-world density directives (owner, 2026-07-12 — batch 2)

These expand the story-web track (ARCHITECTURE §5.6) and the map plan; each
lands in the phase noted:

| Directive | Design consequence | Lands in |
|---|---|---|
| **True side quests: quest chains** — small chains (2–4 linked quests) referencing a small cast and a small area are COMMON; long chains spanning a region are RARE | Plan schema gains `chains`: quests mint `leadsTo` relations to follow-up quests whose roles REUSE the chain's existing cast/places (scope: 'local' weights heavily toward nearby, already-minted entities) | Story webs v2/v3 |
| **Extreme layering & interconnection** | Cross-web reuse becomes a first-class dial: every new web must attempt role reuse against existing entities before minting (reuse quota per web); relations accumulate across webs so the graph thickens over time | Story webs v3 (priority raised) |
| **Kingdom density target: 20 quests per kingdom** | The campaign starter scales up: one kingdom = 1 city + several towns/villages, ~20 quest webs (mostly local chains), and the cast/places they need — this is the measurable bar for "enough content for a campaign," not a few sessions | Campaign starter (Phase C exit criteria updated) |
| **Non-quest life: cities, POIs, people of interest, shops, taverns with NO quest attached** | New plan family: **life webs** — generation plans that mint interconnected texture (rival shops, a family across two towns, a tavern circuit, a trade feud) purely so the world feels inhabited; quest webs then preferentially reuse life-web entities as patrons/victims/locations | Story webs v2 (new plan family) |
| **Example world expansion** | The Vessia fixture grows to showcase the above: a second settlement, a 3-quest side chain sharing cast, non-quest shops/people, and a kingdom claim on the map — the fixture doubles as the acceptance test for layering | Fixture task, with story webs v2 |
| **Map legend + kingdom outlines** | The map gains a legend panel (biome/icon key + toggleable marker groups) and renders entity `claims` as tinted kingdom outlines with legend entries | MAPS.md M1/M2 (noted there) |
| **Epic campaign generator** (owner, 2026-07-12 batch 3) | A third web family above quest chains: variable-skeleton campaign arcs — archetype + act count rolled per run so no two campaigns share bones; each act claims a region (finale sometimes another plane), and mints a **boss at a level checkpoint** (e.g. 4/8/12/16/20), a stronghold, **foreshadowing hints planted in earlier acts**, factions, and a multi-step quest chain threading act to act. First implementation ships as a code-defined web (webs.ts); graduates to the declarative plan format with story webs v2 | Story webs v1 (ships now, evolves with chains/life webs) |
| **Character portrait generation — additive bust builder** (owner, 2026-07-12 batch 7) | Every person gets a unique portrait composited from simple layered art parts (a "bust builder"): race-specific base head → skin/palette → hair → eyes/brows → facial hair → headwear → clothing → accessory, with part pools filtered by the person's race so portraits pertain to it. The portrait is a tiny stored *recipe* ({partIds, palette}) seeded from the person's seed path — deterministic like everything else, and each layer individually rerollable exactly like fields. Rendered via canvas/SVG compositing; surfaces on person pages, hover tooltips, map anchors, and (later) relationship webs/family trees, where faces make the graph readable. Prior art in the genre: RPG Maker's generator-parts bust builder, Picrew/Charat-style layered avatar makers, paper-doll systems. **The engine is small; the ART is the long pole** — parts must be commissioned or sourced from clearly-licensed packs (CC0/CC-BY, e.g. OpenGameArt/itch.io layered portrait packs) under the site's credits discipline, with one consistent style across races | v2.x feature; art sourcing starts earlier as content work | | Bounded worlds gain a full-world zoom stop; zooming past it morphs into a spinning orthographic globe (smooth slide back to flat); the flat map becomes an equirectangular projection — poles compress, and E–W panning wraps seamlessly. ⚠️ Requires x-periodic terrain noise — must be decided before genVersion 1 freezes at M1 (MAPS.md §3.2) | Map M1 decision + M2/M4 build |
| **World extent: Earth-size default, endless optional** (owner, 2026-07-12 batch 5) | New worlds default to a bounded, Earth-equivalent plane (~25,000 mi across; Vessia example adopts it); creation-time size presets (island/kingdom/continent/Earth). "Endless" is an opt-in setting (ghost terrain already supports it — it's a removed clamp), and a further noted option auto-materializes explored areas of endless worlds (needs a storage budget/pruning story first). Details in MAPS.md §3.2 | Map M1 (bounded default + presets); endless fill is later-horizon |
| **Campaign skeletons × conflict library** (owner, 2026-07-12 batch 4) | Campaign STRUCTURE separates from campaign FLAVOR. Skeletons: *single nemesis* (one threat, escalating); *succession of threats* (a faction beaten in the first quarter → a second enemy owning ~levels 5–15 → a small, high-powered questline at 15–20, with overlap hints bleeding each threat into the previous one's acts); *two fronts* (two enemies pursued in alternating acts, converging in the finale). Conflict library grows toward "so many options": rising darkness, usurper, planar breach, great hunt, **demon invasion, civil war, world war, party vs nature (avatar bosses, no classic villain), the death of magic, extraplanar war fought through our world** — each with its own factions, goals, boss epithets, and prose. More skeletons and conflicts are standing content work, like tables | Story webs v1.1 (ships now) |

### Phase D — Time

| Feature | UX driver | Effort |
|---|---|---|
| Custom calendar engine (months/weekdays/moons; donjon-calendar import as a format) | "My world's year is 364 days with two moons" | L |
| Timeline entity kind: eras + events linking entities | "The war, the coronation, and her birth, in order" | M |
| Calendar-aware date fields | Birthdates legal in-world | M |
| Weather per biome/season (Q31: confirmed) | "What's the weather on the road today?" | M |

### Phase E — Reach

| Feature | UX driver | Effort |
|---|---|---|
| Read-only share snapshot (static player-safe bundle / Drive-hosted, loadable by link) (Q27: stays in E) | "Here's the campaign wiki, players" — without a backend | L |
| Foundry journal-compendium export (`@UUID` links preserved) | "My worldbuilding flows into my VTT" | L |
| **The SPACES epic** (formerly hex map M3 — owner, 2026-07-14: "defer dungeons until they can be singular focus; cities, dungeons, etc. are spaces with spaces inside and those will need to be handled as a logical set, at least their architecture"): ground-tier sites — **square grids (Q16), variable dimensions (a tavern 20×20, a city map 200×200), nested sub-sites (city site containing building sites) (Q17)**; z-stack floors; G6 dungeon/interior generation **themed by story-web roles**; locale→site zoom transition. ⚠️ DEFERRED as a singular-focus epic: the recursive space-within-space architecture (city ⊃ district ⊃ building ⊃ floor ⊃ room, dungeon ⊃ level ⊃ chamber) gets designed once, as one logical set, before any of it ships piecemeal | "…and I keep zooming, into the dungeon itself — and the quest's prize is in room 12" | XL |
| Query/filter views (kind+tag+relation+typed fields, URL-serialized) | "Every NPC in this faction" | M |
| Relation-derived visualizations (family tree, faction web) | "The dynasty draws itself" | L |
| Story webs v3: **reuse mode** — roles resolve to *existing* world entities matching filters, weaving generated content into curated lore | "The new quest recruited my existing blacksmith as its patron" | L ⚠️ SLOW |

### v2.5 — Yours all the way down (post-launch theme, Q7/Q9/Q29)

| Feature | UX driver | Effort |
|---|---|---|
| **The WORLD PAINTER** (owner, 2026-07-14): a brush the user *designs* — kingdom name, race composition, population density, danger level, biome — then paints onto the map, and the generator fills cities, people, lairs, and everything at every tier BELOW the brush inside the painted area. The generative inverse of the terrain-paint brush: paint intent, get a populated region. Builds on M2 claim-paint + M1 biome-paint + the density-ghost field + the foodshed model. | "I paint 'orc horde, high danger, sparse' across the badlands and it fills itself in" | XL ⚠️ SLOW |
| Revisit the random generators feeding worldgen for **higher variability** (owner, 2026-07-14): the composite tables (settlement, npc, landmark) repeat flavor across a continent; widen the tables and vary by biome/culture/era so 100 towns don't rhyme. | "Every place feels distinct" | M |
| User-defined kinds ("typings") with custom fields & field types | "My world has Skyships; now the wiki does too" | L |
| User-authored random tables bound to kinds | "My Skyship kind rolls on MY tables" | L |
| Custom generator composition (roles/slots over user tables) — custom randomization end to end | The Perchance/Chartopia moat, with world context — nobody has this | XL ⚠️ SLOW |
| Import table packs from URL/file (5etools brew-manager pattern, no central repo) | Community sharing without a backend | M |

### Continuous map track M4 (⚠️ SLOW, parallel, unhurried)

| Feature | UX driver | Effort |
|---|---|---|
| G3 rivers & roads: freeform polylines, realistic feel, inter-hex continuity (Q19) | Maps read as *places*, not colored cells | L |
| G5a settlement district blobs + named building anchors | "Zoom into the city and see its districts and landmarks" | L |
| G5b road/wall skeletons; G5c building-footprint morphology | Watabou-grade beauty — the slowest item; never a gate | XL+ |
| Label decluttering, print-quality map output | Gorgeous shareable maps | M |
| **Hex texture logic (owner TODO, 2026-07-12):** village/city footprint rendering on settlement hexes, road textures, unique dungeon-entrance glyph variants (barrow door, cave mouth, ruined gate, sinkhole…) | "I can tell what kind of place a hex holds before I click it" | L |
| **Clickable tier iterations (owner, 2026-07-14):** the interactive hex ladder jumps 0.1 mi (locale) → 6 mi (region) → 60 mi (world) and stops — 60× gaps and nothing above 60 mi. Add intermediate CLICKABLE tiers (e.g. ~0.5, 2, 20 mi, and a super-region ~300 mi) so selecting a hex, and the density/ghost grain, steps smoothly instead of leaping. Touches the tier registry (plane.tiers), the seed-path addressing, and every tier-indexed renderer — a real architecture change, hence M4. | "Zooming feels continuous, not three fixed shelves" | L |
| **Hex-art improvement pass across the board (owner, 2026-07-14):** revisit every terrain glyph (forest, mountain, hills, desert, grass, tundra, farmland, city, ruin) plus coastlines and river ribbons for a coherent, hand-drawn atlas look at every zoom — consistency of line weight, density, palette. A dedicated art batch, not piecemeal. | "The whole map reads as one drawn artifact" | L |

---

## 4. Features decided against

| Decision | Reason | Decided |
|---|---|---|
| External deep-links to Watabou/Azgaar; any import of their files | Mold our own process; no out-links; image upload is the only interim map feature | Owner, 2026-07-12 |
| **Backend of any kind — accounts, hosting, realtime collaboration, server sharing** | **Q28: local-first, GitHub Pages, free is the permanent identity.** Collaboration-dependent features (full revision history, subscriber secrets, live co-editing) are out with it | Owner, 2026-07-12 |
| Full per-entity revision history | Q24: tied to collaboration, which is not planned; autosave + trash + session undo suffice | Owner, 2026-07-12 |
| World Anvil / Kanka importers | Q30: no, not yet | Owner, 2026-07-12 |
| "Worldsmith" as codename | Name collision with a direct commercial competitor (worldsmith.io) | 2026-07-12 |
| Global ground-tier grid | ~10¹³ cells; dungeons are discrete places → variable-size nested **sites** | MAPS.md §3.1 + Q17 |
| Hex grids inside sites | Q16: square | Owner, 2026-07-12 |
| Geometrically nested hexes (Gosper/H3) or clipped child grids | Fractal boundaries / seams; continuous plane wins | MAPS.md §2 |
| Community sharing *marketplace* | No backend, ever; URL/file import covers the mechanics | Q28 |
| Copyrighted compendium content (the 5etools model) | Legally radioactive (WotC DMCA precedent); SRD CC-BY + credited community tables only | SURVEY.md |
| CRDT sync engine | Heavyweight vs codebase culture; per-entity LWW + conflict inbox (Q23) | ARCHITECTURE.md §8.2 |
| localStorage for worlds | 5 MB ceiling; IndexedDB | ARCHITECTURE.md §8.1 |
| BBCode/dual-mode editor; paywalled reading; paywalled anything; ads | World Anvil's documented wounds; everything here is free | SURVEY.md §3.4 |
| Silent autolink rewriting | "Bram's Hollow" is also a phrase; suggestions only | ARCHITECTURE.md §6 |
| Readable-slug entity URLs | Q10: hidden ids behind all items; rename must be safe | Owner, 2026-07-12 |
| Fixed hardcoded tier hierarchy | Kind registry + childKinds gives unbounded depth as data | ARCHITECTURE.md §3.2 |

## 5. Not yet in the plan (known gaps, honestly listed)

### Owner travel/geography feedback queue (2026-07-14, batches 55+)

- **Travel-method toggles + readable banner** — ✅ SHIPPED (batch 56). The
  banner is now laid out to read: a title line (≈ miles · stops · ＋stop · ⚙
  custom · ✕), a row of method-toggle chips (🥾 walk · 🐎 ride · ⛵ boat · ⚡
  portal · ✨ custom), then one clean result line (on foot Xd · mounted Yd ·
  road%/fords/afloat with go-buttons). The chips tick on/off and the A* re-plans
  on exactly that subset — "only walking and boarding" or "horseback and
  portals" now just work, and the choice persists with the world. Portal edges
  already connect only AT portal hexes in `travel.ts` (batch 37), so paths route
  through the portals when ⚡ is on. (Still could add: a live path-difference
  hint as you toggle.)
- **Victorian road reach + water-magnetism + free bridge** — ✅ SHIPPED (batch
  57). No settlement is left roadless: an "isolated" town now falls back to a
  rough dirt trail to its nearest neighbour however far, every town of 1,000+
  always earns at least a track, and a dirt track blocked by a great river is
  upgraded to a proper (bridgeable) road rather than abandoned. Result: the 44
  isolated towns → **0 isolated**, and roadless-within-8-mi towns fell to 7
  inland edge cases (likely lake-enclosed) out of 105, none coastal. Towns also
  gained **water-magnetism** — `siteSpots` now prefers the water-adjacent
  sub-hex of a site, so towns centre on the bank/shore — and any town sitting
  on a great river gets a **free wagon bridge** at its feet (13 baked). The
  fuller connectivity cascaded into more roads/bridges/river-towns (Vessia 431
  → 534 entities), reading as a properly-settled continent. Still worth doing:
  the ~7 stubborn inland cases, and a dirt spur from a near-water town to the
  actual waterline.
- **Hydrology pass** — ✅ SHIPPED (batch 59). The drainage model gained a full
  tier ladder and two new features. A **GRAND river** class (4) now runs where
  the continent's biggest drain accumulates (>2,500 rain-units of ~6,000 max) —
  one on Vessia (The Sundering Run), rendered near a mile-and-a-half wide,
  named and flagged as grand with its own page note. Great/grand rivers now
  **braid into a delta** at the sea — 2 distributaries for a great river, 3 for
  a grand, fanning across the coast (22 deltas baked). And the stream threshold
  dropped (RIVER_MIN 30 → 22) so **more headwater tributaries** surface and
  join downward through the tiers (river hexes 3,577 → 4,386). Width thresholds
  were decoupled into absolute constants (stream / 60 river / 150 great / 2,500
  grand). The renderer handles class 4 (width, atlas line, water-hex fill, flow
  markers). Still could add: alluvial-fan art on the delta plain, and braided
  mid-river islands.

### Generator / roll-table realism queue (2026-07-15, batch 76+)

Full audit in `docs/everdeep/GENERATORS-REVIEW.md` (owner: "every single roll
table needs to be reviewed… randomness should be additive, in many cases it is
completely derailing"). Root cause: composites concatenate independent blind
rolls instead of decorating a coherent core (`encounter.ts` is the lone additive
model). The review's prioritized roadmap (P0 additive core + promote meaning to
fields → P1 signature/biome tables, NPC role+tiering, dungeon/lair composites →
P2 encounter/quest variety, per-field dice) is the working backlog; batches ship
against it from 76 on.

**Down-the-road goals (owner, 2026-07-15) — the realism must backfill the
standalone randomizers too, not just world-gen:**

- **Node-type locking in the randomizers** — ✅ SHIPPED (batch 76, "additive
  settlement core + node-type locking"; the reroll-invariance half landed in
  batch 93's `lockOpts()`). The geographic realism the map has
  (a `SettleNode.type` like "fishing village", a food/water-derived economy
  `reason`) should also drive the *standalone* Settlement tool: rolling a
  community first rolls a **node type** (fishing village, mining camp, river
  crossing, royal seat…), and that type then **locks** the downstream tables
  (economy, trade, cuisine, defenses) so even a blind randomizer stays
  self-consistent. The same core-then-decorate pattern the world uses, exposed
  on the tool page so a GM rolling in isolation gets a coherent place, not six
  contradictory rolls. Generalizes to landmarks (site type locks the sub-rolls)
  and NPCs (role locks the wild tiers).
- **Rollable kingdom → saved into the active world with its web** — ✅ SHIPPED
  (batch 98: `buildKingdom` in `webs.ts:456`, reached by **🏰 Generate a
  kingdom** on the world root). The faction-generator gap called out below is
  still open — the crown is minted by the web, not by a `faction.json`
  generator. Rolling a
  kingdom/realm should be **savable to the open world** — and when saved it
  mints its **supporting web** the way the campaign webs do (`webs.ts`): its
  seat settlement, its ruler (a person), its subordinate holdings, and its
  goal/method — each **rolled and picked from the standalone tables** (the
  ~2,200 unused `gm/government/leader|citizen-goal|goal|method` entries, the
  villain/faction tables) rather than hardcoded. So a GM can roll a power on the
  tool page, tweak it, and drop the whole political structure onto the map as
  linked entities. Depends on the P0 field-promotion work (a rolled realm has to
  land in structured `fields` to hang a web off of) and the faction generator
  gap (faction currently has no generator at all).

- **⭐ Ultra-high-fidelity Earth (owner, 2026-07-15)** — "earth creation still
  mangles Florida and other detailed places. I want an ultra-high fidelity
  recreation of earth. this needs to be first fix after the random table updates
  are finished." **Mostly SHIPPED in batch 85 — the remainder is much smaller
  than this entry used to imply** (status corrected 2026-07-15; the directive's
  four-step build order in `FLAGSHIP-EARTH.md` was written before batch 85 landed
  and read as fully pending). "Mangles Florida" was a **land/sea-mask** problem,
  not an elevation one, and batch 85 fixed it: a 10800×5400 (~3.7 km/cell) 1-bit
  land mask rasterized from the public-domain Natural Earth 10 m land polygons,
  bit-packed + gzipped to a **190 KB lazy chunk** (`earthCoast.ts`), made
  authoritative for land-vs-sea in `terrain.ts` with the elevation grid still
  supplying relief. Because `earthCoastLand` is sampled in **world-space** from
  `earthLandSea` (not per-tier), the crisp coast already carries into the region
  and locale tiers. Florida, the Keys, capes and small isles are crisp. **What
  actually remains:** (1) the coast-distance/bathymetry field is still
  **720×360** (~35 mi/cell — `terrain.ts:388`), so shelves and small bays still
  step; (2) `smoke-terrain` asserts Earth's **land fraction** (≈29%) but has **no
  named-feature assertions** — the directive's step 4 (Florida, the Keys, the
  Great Lakes shoreline, the British Isles, Indonesia) is unwritten; (3) the
  elevation grid is still 2048×1024, a **relief-only** upgrade that needs a
  GitHub-mirrored DEM (the NOAA/GEBCO/naturalearthdata hosts are proxy-blocked;
  `raw.githubusercontent.com` is reachable — that's how batch 85 got its source).

- **Time-versioned world state** ("who rules here in 1023 vs 1305") —
  precursor (date-stamped relations) noted, unscheduled.
- **Session mode / play surface**: initiative, encounter running, session
  journal auto-linking touched entities. Sheets cover part; unplanned.
- **System-agnostic statblocks** beyond the current 5e-flavored blocks.
- **Multi-genre content** (Q4: fantasy launch; architecture stays
  genre-neutral — sci-fi drill-down is a content project later).
- **PWA installability / offline preload** of the app itself — cheap,
  unscheduled.
- **Image management** beyond map layers: portraits/galleries, compression,
  storage budgeting UI (soft warning ~50 MB/world — Q25).
- **Accessibility pass** (keyboard-only nav, screen readers, color-blind-safe
  biome palette — palette choice should happen in M1 while colors are young)
  and **i18n**.
- **Co-authoring without a backend** (world-file handoff between two GMs) —
  LWW + conflict inbox gives the substrate; workflow undesigned.
- **Seasonal community challenges** (WA's retention engine) — a community
  program, not code; post-launch.
- **Relations editor UX** richer than "add relation."
- **Solo/Writing pillar integration** (oracle results → world journals) —
  Q2: pillars get their own overhaul; bridge later.

### Earth-2026 flagship feedback (owner, 2026-07-15) — items #1–#9

⚠️ **Reconstructed 2026-07-15 from commit trailers — this list was never written
down.** The owner gave a numbered list of flagship feedback; batches 87–95 cite
it as "(item #N)" and the numbers appear nowhere else in the repo. Recording it
here so the numbering survives. Each item below is described by *what shipped
against it*, not by the owner's original wording, which is lost.

| # | Shipped as | Status |
|---|---|---|
| #1 | Named geography for all worlds (batch 89) | ✅ |
| #2 | Route planning on Earth — the fixture had no party, so travel had no origin (batch 88) | ✅ |
| **#3** | **— nothing cites item #3 —** | ⚠️ **UNACCOUNTED FOR** |
| #4 | Great rivers authored on their real courses (batch 90) | ✅ |
| #5 | No farms in water + biome-specific farming (batch 91) | ✅ |
| #6 | Rulers are fantasyfied real 2026 leaders (batch 92) | ✅ |
| #7 | Lock generator options across rerolls (batch 93) | ✅ |
| #8 | Party composition sizes encounters & loot (batch 94) | ✅ |
| #9 | City footprint by population + feeder hamlets (batch 95) | ✅ |

**Open question for the owner:** what was item #3? Batch 87 (Himalayas-as-water
+ desert-snow) is the only batch in that run without an item number and may be
it, but the batches are not in item order, so that is a guess — not recorded as
fact. If #3 is still outstanding it is the oldest unshipped owner request.

### Earth-clone feedback (owner, 2026-07-15, batch 17) — items #1–#12

**The working queue.** Recorded verbatim-ish the day it was given (the item #3
lesson above: write the list down *first*). Owner's framing: "a few requests for
the earth clone". Screenshot evidence noted where it pins a symptom.

**Status after batches 99–102:**

| Item | State |
|---|---|
| #4 performance | ✅ **Shipped** (b100) — tree render 2,763 ms → **1.1 ms** (2,505×), identical output. Map-layer culling (PERF #4) still open |
| #8 sprawl in water | ✅ **Shipped** (b100) — city seat hex + ruins were unguarded. *Legend key for the marks still to add* |
| #9 duplicate rivers | ✅ **Shipped** (b100, in the demo since the b102 rebake) — 21 shared channels → **0** |
| #12 unbridged rivers | ✅ **Shipped** (b102) — unbridged **40 → 6**; median nearest bridge 662 mi → 26 mi. The last 6 are drawn-road-meanders-off-its-cell-path (the case b52 noted for dirt) |
| #7 rivers end short | 🟡 **Partly** — authored mouths: **18/23 snapped to water** (b102). Cause (a) improved by b114's confluence cut: rivers ending on dry land **76.3% → 63.4%**, and 45 now end *on a bigger river*. **302 still dead-end on land**: only 23 authored trunks exist for 476 rivers, so most tributaries have nothing to join. ⚠️ Restoring the 26 dropped traced trunks looks free and **is not** — 9 of them drain the same basin as an authored river (four into the Ob's delta). See the #24–#25 queue above |
| #10 roads don't join | ✅ **Mostly** (b101/b102) — route-snap restored: crossings 13 → 9, dirt 115 → 140. Route-id collisions fixed (933/933 unique, was 908/539) |
| #11 no roads between near towns | ✅ **Closed** (b126) — roadless towns 7 → 5 (b101) → 3 (b118) → **0 stranded**. Chasing the last 3 found they were never one bug: **two (Ithoth, Olaara) were placed IN THE SEA** — a sub-hex the region octave (6 mi) calls grass but the world octave (60 mi, which the road pass uses) calls open ocean, so every road off them was severed at the doorstep; `siteAt` now rejects an octW-water sub-hex. **One (Koreia) is correctly trackless** (689 mi from anything, past the 600 mi reach). Smoke now asserts **0 stranded** (a clean assertion, not a ratchet) and **0 settlements in octW water**. Cross-border roads stopped being impossible in b120 (the flagship makes ONE global `generateRoads` call, no per-country bucketing) |
| #1 smoothing (b108) · #2 naming (b103/104) · #5 tree (b105) · #6 shore (b110) · #13 river wrap (b109) · #15 bridges (b109) · #14 road rank (b107) · #16 tree pane · #17 map cards (b111) | ✅ **Shipped** |
| #3 realms | ✅ **Shipped (batch 112)** — realms now hold ground: **245 crowns, 23,503 world hexes**. *Subrealms (#3b) still open* — see below |

| # | Owner's request | Evidence / first read | Cluster |
|---|---|---|---|
| #1 | "coastlines and biomes, and other features are very square-like at the lower grains. if that is an artifact of the world generation, then i would like to add **smoothing** to make transitions feel more natural" | Locale shot: the land/sea edge is a hard straight diagonal; region shot: coast reads as blocky hex steps | Terrain fidelity |
| #2 | "**Naming** leaves a lot to be desired. the fantasyfied names need another pass to be 'better', and the vast number of feeder towns has shown the limitation of the town naming generator, time to improve it with more options and templates" | **"Old Deepmeadow 2"** — a numeric suffix, i.e. the pool is exhausted and it's counting. Fantasyfication reads mechanical: `Lock`/`Fort`/`Saint`/`Grand` + real name, `-reach` suffix (Grand Bujumburareach, Fort Halwanreach, Lock Uvira, Saint Ananindeua) | Content |
| #3 | "**realms** should exist in the earth example, the regions should span the real earth's borders and the realm's name should be the improved fantasyfied name of the country, countries with logical subrealms (like america with the states) should have **subrealms**" | Depends on #2's improved names; needs a real border dataset + the `claims` overlay | Era layer |
| #4 | "**performance** needs another look - panning is choppy, zooming is choppy, opening a data pane is slow - as much performance improvements as possible, especially as we add more data" | Fixture is now 4,103 entities (was 1,996) | Perf |
| #5 | "time for a **tree improvement** - so much information has locked it up, some improvements there to leave things auto-collapsed, clicking something opens just that spot in the tree, allowing for the 'hiding' of some regions of the tree to just lock them closed and move them to the 'hidden' bottom of the tree until an item in that region is clicked or the region is manually unlocked" | 2,012 feeder hamlets (batch 95) flooded the tree | UX |
| #6 | "revisit making **hexes under rivers water**, and hexes that **touch water, shore**" | Partially done in batch 51 for great rivers at the finest tier — the ask is to generalize | Terrain fidelity |
| #7 | "investigate **rivers ending before a water source**" | — | Hydrology bug |
| #8 | "we should probably add **hex overlay types to the legend** so they are easier to interpret, we are still having **sprawl out into water tiles**" | Region shot: farm/settlement marks over water. Note batch 91 already fixed farm-on-water at own-tier — so this is either a *different* overlay (settlement sprawl) or a regression | Legend + bug |
| #9 | "this **river generation** seems like it may be incorrect" | region:2352,12 — two near-parallel channels converging at a point *upstream*; looks like distributaries drawn the wrong way, or a braid | Hydrology bug |
| #10 | "this **road generation is illogical** - we have even less road joining than we had before" | Fort Bukavu — parallel roads that never merge. ⚠️ Suspected **regression**: batches 52/58 explicitly bought road-sharing (crossings 15→13, "5 of 12 bridges carry 2+ roads") | Roads (regression?) |
| #11 | "**no roads between near settlements** is also illogical" | Lock Uvira ↔ Grand Bujumburareach, close together, no road. ⚠️ Batch 57 claimed **0 isolated towns** | Roads (regression?) |
| #12 | "more strange road generation, as well as **missing bridges for roads crossing water**" | region:2644,-402 — roads cross a great river unbridged. ⚠️ Batches 51/52/53 all asserted **"0 unbridged crossings"** | Roads (regression?) |

| #14 | **Road rank from traffic** (owner, 2026-07-15): "similarly to rivers, if many roads join, the main thoroughfare should probably be upgraded in road rank" + "population density between two points should translate into traffic, more traffic = bigger road" | ✅ **Shipped (batch 107).** The river ladder applied to roads: each road carries a **gravity weight** √(popA×popB), accumulated per cell, and every road is drawn **split at each rank change** (the trick `hydrology.ts` uses at a band change) so a highway narrows to a country road as it leaves the trunk. Earth: highway-miles 24,239 → 32,068, 440 plans → 549 segments (109 real rank changes). ⚠️ Thresholds must be **percentile**, not absolute — rain is uniform so rivers can use constants, but population spans 150-soul hamlets to 37M cities; absolute thresholds made **all 440 Earth roads highways** | Shipped | — | M |
| #10b | ✅ **Shipped (batch 118) — 11.8% → 5.2%.** (owner, 2026-07-15, "more road artifacts" — region 2230,357 / 2231,351 = **Johannesburg**, lat -26.7 lon 28.1) | ⚠️ **Open, cause identified.** Measured: **9.2% of road-miles run 0.4–3 mi from another road** (302 pairs parallel for 8+ mi). **It is NOT the cost surface.** A world hex is **60 mi**; the parallel lines are **1–3 mi** apart — *below hex resolution*. Two roads that share every cell still draw as separate lines because each starts at its own settlement and the smoothing blends that endpoint along the line. Proof: adding a strong "follow existing road" discount to the A* changed the artifact **not at all** (9.19% → 9.71%) — reverted, unshipped. **The fix is draw-time topology, not routing**: a spur must physically END at a junction on the existing road rather than run its own full-length line to the hub. The route-snap (batch 101) does this only when `snap.d < td × 0.8`, which rarely fires for a town near its hub | Open | Junction-merge at draw time | M |
| #13 | "we have some **artifacts at higher zoom** that I would like fixed as well, they **move and shift with panning**" (owner, 2026-07-15) | Screenshots at the 500 mi / 1000 mi scale bars show faint **horizontal bands** ruled across ocean and land alike. "Moves/shifts with panning" is the tell: a seam pinned to **screen** space rather than world space — so a *drawing* artifact, not terrain data. Prime suspects: fractional-device-pixel hex edges (adjacent fills not meeting exactly, letting the background show as a hairline), the tier **crossfade** compositing two tiers at slightly different offsets, or a band-vs-tile seam in the relief/terrain-art layer. NOT yet investigated | Queued | — | — |

| #16 | **Tree pane spacing** (owner, 2026-07-15): "tree is better. However the **padlock and long names make for poor spacing**, perhaps add a horizontal scroll, or expand to the screen width and allow the tree to be **minimized**" | ✅ **Shipped (batch 111).** Two causes, both in `world.astro`. (a) The row was ONE ellipsised box with the lock **`float:right` inside it** — a float is out of flow, so `text-overflow` never accounted for it and a long name ran *underneath* the padlock. Now the row is a flex line `[twisty][.nm flex:1 min-width:0][lock flex:none]`: the lock owns a column and the name is clipped by its own box. The lock still reserves its column when invisible — hover must not re-flow the row. (b) The pane was **frozen at 250px**. Now: drag the rule (150–720px), **double-click it to fit the longest name on show**, or fold the tree to a 16px rail. Both settings persist (`stb:everdeep:nav`). ⚠️ Folding does **not** widen the page — `.wd-page` is capped `max-width:760px` for reading measure, on purpose; the **map** is what gains the space (849 → 1,083px). Proved by 6 e2e specs in `tests/tree-pane.spec.ts` | Shipped | — | S |
| #17 | **Map cards** (owner, 2026-07-15): "make the map **open cards** for things clicked on with what it is and a **brief intro**, clicking '**more**' opens the full edit pane and wiki cross links" | ✅ **Shipped (batch 111).** The real friction: tapping a pin called `onSelectEntity` → `navigate()`, which **opens with `if (mapMode) setMapMode(false)`** — so every glance at a city **closed the map** and threw away your pan and zoom. `mv-card` now answers *what is this* in place: glyph, name, kind, parent crumb, up to 3 hard facts from `fields` (a village reads "Population 312 · Settlement Type village"), and the first non-secret paragraph, mention syntax flattened. **"More →" is the old jump**, kept deliberately — the full pane already renders relations + backlinks + editor, so the card must not duplicate it. The card is pinned to the entity's **world** point, not the tap, so it rides its subject through pan/zoom (`draw()` calls `positionCard()`) and lets go at the frame edge. Proved by 4 e2e specs in `tests/map-card.spec.ts` | Shipped | — | S |

### Items #26–#29 (owner, 2026-07-15) — ✅ all shipped, batch 115

| # | Ask | Outcome |
|---|---|---|
| #28 | "**more entity fixing to do**" — realm page shows `leader` / `seat` as **`[object Object]`** | ✅ **A field with no registry def silently degrades to a text input showing `String(v)`** — and `String({ref:'e_…'})` is the literal `[object Object]`. `region` defined only `climate`/`peril`/`government` while **233 realms** carried `leader`+`seat` as entityRefs. Underneath was **three names for one idea**: the bake wrote `region.leader`, `webs.ts:491` writes `region.ruler`, and `faction`(leader) / `settlement`(ruler) disagree as well. Settled on **`ruler`** — a region is a *place*, and `leader` is the faction word. Added defs for `region.ruler/seat`, `settlement.settlementType` (**2,920** entities!), `person.race`/`gender`. **Bonus bug found:** `refKind` was a single string compared with `===`, so `faction.seat` (refKind `place`) could never list the **settlement** `webs.ts` actually assigns — the select just read "—". `refKind` now takes a list; schema + validator updated. Guarded in `smoke-everdeep.mjs`: every field on all 4,110 entities has a def, all 466 refs resolve, and none render as `[object Object]`. |
| #26 | "improve the **contrast of political power names**" | ✅ Labels had a 1px dark **offset shadow**, which does nothing for a name drawn in its own territory's pale gold on savanna. Now a proper **halo** (`strokeText`, round join) — the same treatment the selected-hex caption already had and labels never got. |
| #27 | "**pins and political powers should be separate options**" | ✅ `drawAnchors` opened with `if (!showPins.checked) return`, and realm names + named geography are drawn from that same loop — so the whole political layer was hostage to the pin toggle. The check moved onto the pins themselves; new **👑 realms** layer toggle takes wash, borders and names together. Measured: pins ≈41% of the canvas, realms ≈71% **with pins already off** — genuinely independent. |
| #29 | "**limit realms to only those in view**" | ✅ The legend showed all 182 crowns wherever you looked. Now only those whose ground is on screen, with a `72/182`-style count in the header. Debounced 220 ms off `draw()` — it walks hexes and pokes the DOM, neither of which belongs in a pan. |

⚠️ **The bug my own change introduced, and what it says.** The new realms checkbox did nothing at first: layer toggles were wired to `repaint` through a **hand-listed array** of the eight that existed at the time. The flag flipped, no repaint was scheduled, the canvas just sat there — and it looked exactly like a broken feature. Replaced with `.mv-layers input[type="checkbox"]`, so **a new layer is now wired by existing**. The e2e caught it (0.0% of pixels changed); a human clicking once might well have shrugged.

Also worth keeping: **the map does not open fit-to-world.** `view.ppf` starts at `2e-5` over the first anchor (`fitPending = !firstAnchor`), which is about a **third** of Earth — so "72 of 182 realms in view" at the default camera is correct, not an under-count. Fit-to-screen only happens for an anchorless world.

### Queue — items #24–#25 (owner, 2026-07-15, measured against the shipped fixture)

| # | Ask | Diagnosis | State |
|---|---|---|---|
| #24 | "**Still having crazy road generation**" (region:2155,-86 — two roads from coastal towns running out into open sea and converging on a point in the water) | ✅ **Shipped (batch 116) — 102 swimmers → 0, 1,882 road-miles of open water → 1.3.** See below: my first diagnosis was **wrong**. | ✅ Shipped |
| #25 | "**tributaries should never be able to cross bigger rivers and then escape back out**" (2608,-308 / 3393,-424 / 3619,-490) | ✅ **Shipped (batch 114) — 44 crossing pairs → 0.** All 44 were `rt_bigriv*` × `rt_genriv*`; **ZERO same-band**. Every crossing was a *traced* band-2 tributary passing through an *authored* trunk, because the bake keeps traced band≤2 and replaces the traced band≥3 trunks with great rivers on their real courses — and those tributaries were traced against the ORIGINAL drainage, so they still flow to where the old trunk was. New `joinTributaries()` in `hydrology.ts` cuts each at its first crossing with a **wider** river: that crossing *is* the confluence. **250 cut, 1 dropped as a stub**, median river length 308 mi, no stubs. Guarded by `smoke-riverfield.mjs` (all 9,096 segments checked pairwise). | ✅ Shipped |

**#24: the diagnosis above was wrong, and wrong in a useful way.** I wrote that "the road cost surface does not forbid water — A\* across a bay takes the straight line and swims". It does forbid it: `roadPath` has always had `if (!land.has(nk) …) continue`, and it has always been obeyed. The planner was never the problem, which is exactly why the bug survived so long — the generator reads correctly, and *is* correct, at its own resolution. Re-measured, the blame splits almost exactly in half between **two scale bugs that both look like a working planner**:

- **52% — the grid's "land" is a lie at the coast.** `hydrology.ts` builds `land` from **one sample per 60-mile hex — the centre**. A hex that is 90% bay reads as solid ground, so the planner's land-only path was never on land. **3.7% of Earth's 32,764 land hexes are majority water** at 2-mile resolution.
- **48% — the drawn line left the planned cells entirely.** The corner-jitter and two Chaikin passes that give a road its hand-drawn wander cut straight across the coast those cells were hugging.

Neither is fixable at 60 miles: the planner cannot know *where inside a hex* the road runs, so the **drawing** step has to place it. New `landRoute.ts` re-draws a planned line against water the planner cannot see — an A\* on a 4-mile lattice **laid along the crossing** (so both endpoints are exact lattice nodes, dry by construction, with no stitch to get wrong), pulled taut afterwards. Roads clear of water (82% of them) come back as **the same array, untouched**. Where the water genuinely cannot be walked around the road **splits** rather than swims: two stubs facing each other across a strait is what a real map looks like where a ferry runs, and `travel.ts` already sails that leg (`BOAT_SEA`, ports, `EMBARK_DAYS`).

| | before | after |
|---|---|---|
| roads crossing open water | **102 / 550** | **0** (1 road clips 1.3 mi) |
| road-miles over water | **1,882** | **1.3** |
| crossings over 15 mi | **41** | **0** |
| worst single crossing | **70.1 mi** | **1.3 mi** |
| network total | 73,051 mi | **73,484 mi** (+0.6%, the real detours) |
| bake | 10.9 s | **10.6 s** |

Three things worth keeping:

- **The residual 1.3 mi is raster noise, not a road in the sea**, and the smoke says so rather than asserting zero. Both this walk and `hugLand`'s own check sample *points* along a line, so they agree only up to sampling phase, and both are finer than the **2.3 mi/px** coast raster underneath. The test pins what is real: no **crossing** over 3 mi.
- **It is free because the search is bounded by the answer's own budget.** My first cut widened the box (40 → 140 → 320 mi) until something turned up, which cost **+16 s** and was also *worse*: a wider box is a **superset**, so it can only find a **shorter** path — escalating and taking the first hit returns the worst detour it was offered, having paid for every box below it. One search bounded by `max(maxDetour × span, 60 mi)`, pruned on `g + h > budget`, is both cheaper and better. **27 s → 10.6 s.**
- **(b) the ferry kind was not needed, and (c) was a phantom.** Per-country bucketing never forced roads between islands — `roadPath` cannot cross water, so those roads were never planned; the *drawn* line invented them. Splitting at the gap says the same thing as a ferry kind without a new route type to render, legend and all.

### Queue — item #30 (owner, 2026-07-15)

> "it may be time to create road type hexes, and force roads to obey hex logic, rather than painting them. most roads will be less than 100FT, so it really is just a few sizes of hex, dirt (10ft), road (40) and highway (100) perhaps. create junction types. force pathing to go through the smallest hex, or perhaps snap roads to hexes and then paint, like rivers. then perhaps it will be easier to detect where roads are?"

| # | Ask | State |
|---|---|---|
| #30 | Roads get a real width and a way to detect them | ✅ **Shipped (batch 117)** — `roadField.ts` |
| #30b | Junction types | ✅ **Shipped (batch 118)** — with #10b, below |
| #30c | Plan roads at a finer grain than 60 mi | ✅ **Shipped (batch 134)** — terrain-following draw |

**#10b / #30b (batch 118): roads drawn twice — 11.8% → 5.2%** on the shipped Earth (3.3% on a world that isn't bucketed per country), **579 → 490 routes**, **4,249 road-miles** of duplicate line removed, and **roadless towns 5 → 3** as a side effect.

The old diagnosis was right and my two attempts to "correct" it were both wrong — worth recording, because the metric nearly lost the fix:

| metric | reads | why it lies |
|---|---|---|
| by route id | 6.2% | a road is SPLIT into a route per rank change, so it counts a road against **itself** — the worst "pair" was one road either side of a bend (`a.end → b.start = 0.0mi`) |
| chain routes sharing an endpoint into "logical roads" | **1.0%** | a spur and its trunk share the hub, so it **excludes the exact pair being measured**. Small enough to talk yourself out of the fix |
| …same, after the fix | **2.5%** | a junction stub lands mid-segment, shares no vertex, doesn't chain — so it reads as a parallel road. **The metric moved the wrong way across a change that halved the real artifact** |
| **close AND same heading** | **11.8% → 5.2%** | what the owner actually sees is two lines *running together*. Heading is the discriminator, and with it no grouping hack is needed at all: a spur meeting a trunk at 90° is a junction whoever's id it carries |

**The fix is the one this file already prescribed** — "a spur must physically END at a junction on the existing road rather than run its own full-length line to the hub" — and it is two halves, because the first half alone is a trap:

1. **An edge belongs to the NETWORK, not to a road.** Draw it for whoever reaches it first (highest rank first, so a shared trunk is drawn as the highway it is); later plans skip it and stop where they meet it. Traffic is untouched and still counts every plan, so the trunk still earns its rank.
2. **…but the spur still has to REACH its town.** "Shares a cell" is **not** "is on the road" when a cell is 60 MILES across — the same resolution trap as #24 in a different hat. The trunk can run thirty miles from the town whose spur just stood down. Half 1 alone took roadless towns **5 → 20**, and `smoke-settle` caught it. So every settlement a road was planned for now gets a link from its own doorstep to the nearest **drawn** road: short, lands on the trunk, and *is* the junction. That link is what fixed two of the five long-standing #11 cases.

⚠️ **The remaining 5.2% is per-country bucketing**, not routing: `bake-earth-2026` calls `generateRoads` once per country (O(n²) A* over 1,500 global nodes "would never finish"), and each call keeps its own drawn-edge set — so Nigeria cannot see that Cameroon already built the road it is about to build alongside (`rt_gensr0002cm` ‖ `rt_gensr0007ng`, 66 mi). Same root cause as **#11**'s missing cross-border roads; fix them together. *(Since batch 120 the flagship bake makes ONE global `generateRoads` call, so on the shipped Earth this is now 3.3%, not 5.2% — the note stands for any caller that still buckets.)*

### Batch 134 — roads follow the land, not the dice (#30c)

The owner reframed #30c as the right question — *verisimilitude*: where did people actually put roads? The record is clear. **Not always the lowest ground** — the oldest long routes are RIDGEWAYS along high, dry, self-draining crests, because the valleys below were wooded, boggy and forced a ford at every stream; valleys only won out later, with bridges and drainage. And they **meandered**, for two reasons archaeology measures: *gradient* (route-modelling runs on Tobler's hiking function, which costs SLOPE, not height — so a real path traverses a slope at an angle to hold the grade), and *nodes* (bending to the best ford, the low pass, the next town). Owner's rule: *"if the time to make the world is not worse, i say it is worth it."*

Measured two ways on the **whole planet**, not three hand-picked roads:

- **Full 6-mile A\* re-route inside the coarse corridor** (the "proper" fine routing) moves the drawn line ~13mi on average but finds a *lower* pass only half the time — **176 better / 174 worse**, avg Δ ≈ 0 — because the 60-mile route is *already* elevation-aware, so there is little left to win. Cost: **~8s**. Rejected: costly and neutral.
- **Bias the wobble the line already had.** `emit` nudged every interior vertex sideways by a *random* perpendicular offset, purely so roads weren't ruler-straight. Now the SIGN follows the land: sample region (6-mile) relief a few miles to each side and lean toward the lower one, with a **sea guard** (below the shoreline reads as high, so a coast road never sags into the water — the naive version fed `hugLand` 16 extra splits; the guard cut that to 2). Roads sag off ridges into valleys — the meander — at O(vertices), **no search**.

Result: **27.6s → 28.2s** (within noise — free), roads pulled off **~4% of their >0.70-elevation mileage** (18,082 → 17,340 mi), **+2 routes**. Honest scope: a *principled polish*, not a leap — the coarse routes were already good, so no post-hoc geometry produces a dramatic change on this world; what it buys is road curves that correlate with terrain instead of RNG, for nothing. Fixture rebaked — **1257 roads, 62 bridges** (a shifted crossing, since bridges land where the *drawn* road meets the *drawn* river) — and `smoke-reproducible` confirms it still rebuilds byte-for-byte. Deterministic throughout (seeded relief + `h32`); no `rid()`/`Date.now()`.

### Batch 133 — winds & currents on the map (#31 "mapped"; overlay)

The owner answered the §9 fork — *"winds and currents should be an overlay"* — so the fields (b129/b131) now show. A **🌬 winds** layer toggle (off by default, like ⛰ relief) draws a sparse arrow field over the map: **wind** arrows on the base grid everywhere (pale), **ocean current** arrows on an interleaved grid over the sea (blue), so the two sit beside each other rather than on top — at a glance, the trade belts and westerlies across the land and the gyres turning on the water. Both are sampled analytically per frame (a couple hundred cheap lookups) and drawn *above* the cached terrain buffer (b128), never baked into it — proved by `tests/wind-overlay.spec.ts`: toggling on changes ~7,600 px, toggling off restores the plain map. e2e 31/31.

Also settled by the owner, for the travel wiring (#31c/#31d, still to build): **unpowered by default, a "powered" toggle**, and a fantasy world's magic hulls count as powered. `CURRENT_STRENGTH` and the mi/day scaling stay as `sailing.ts` has them until the wiring lands.

### Batch 132 — how a boat answers the wind (#31c/#31d model)

The winds (b129) and currents (b131) say which way air and water move; `sailing.ts` says what a hull does about it, closing the *model* half of #31. It is a **polar** — through-water speed by the angle to the wind: fastest on a broad reach, a little slower dead downwind, and inside the no-go zone a nonzero **tack** (a sail beats to windward, slowly, never against a wall) — plus the **current advecting the whole hull**. Out of that shape the owner's two rules fall directly: **becalmed, an unpowered boat cannot beat a current — it drifts with it** ("required to follow"); a **powered hull holds its pace and always makes way**, even straight into wind *and* an opposing current, the current only nudging it ("use, not bound"). `smoke-sailing.mjs` pins the polar's shape and both rules.

Speeds are relative (1 ≈ still-water hull speed); the travel layer will scale them to miles/day and tune the constants — which is a gameplay-feel fork, **logged in §9** along with the map-viz style. So all four field/model bricks of #31 are now built and tested (winds, currents, sailing) with **nothing wired to the live app**: what remains — drawing them, and the travel A* cost — turns on your eye and your feel, not on more physics. Pure additions throughout; fixture byte-identical.

### Batch 131 — the sea has currents (#31b open-ocean field)

The wind's half of #31 (b129) now drives the sea's. `currentField.ts` takes the local wind, turns it by Coriolis toward the gyre's heart (right in the north, left in the south — the Ekman deflection) and slows it to about half the wind's pace: the trades push the equatorial water west, the westerlies push the mid-latitude water east, so the **subtropical gyres close their loops clockwise in the north and counter-clockwise in the south**. Analytic and deterministic like the wind it rides, and **sea-only** — `currentAt` returns `null` on land (masked by the same world octave the roads and settlements judge the sea by), with an unmasked `currentVectorAt` underneath for callers that want the circulation regardless.

`smoke-currentfield.mjs` pins the gyre rotation in both hemispheres, that a current follows its wind (shares its heading, never outruns it), that the field is defined *exactly* on the sea across a full-planet sweep, and determinism. **Still open on #31b:** the coastal **boundary currents** — a current bending to run up a western shore (the Gulf Stream) — which is what truly closes a gyre against a coast; this slice is the open-ocean circulation only. Nothing imports it yet; the map layer and the sailing cost come next. Pure addition; fixture byte-identical.

### Batch 129 — every world has winds (#31a field)

First brick of #31. `windField.ts` gives any world its prevailing winds from the three-cell model Earth runs: easterly **trades** in the tropics, prevailing **westerlies** at mid-latitudes, **polar easterlies** above 60°, each turned by Coriolis (right in the north, left in the south) so they mirror across the equator. It is analytic, not a grid: `windAt(cfg, x, y)` is a closed form of latitude — zonal `u = −sin(φ·π/30°)`, meridional `v = 0.35·sign(lat)·u` (the Coriolis deflection falls straight out of u's sign) — plus a small **seeded** waviness so the belts meander. Deterministic, calm at the doldrums / horse latitudes / polar front (0/30/60/90°), strong at each belt's core. Latitude comes from world Y the same way terrain lays it, so this holds for procedural worlds too, not just Earth.

Returned as geographic `[east, north]` (north = −y in world space). `smoke-windfield.mjs` pins the belt directions in both hemispheres, the calm boundaries, determinism, and a full-planet finiteness sweep. Nothing imports it yet — it's the model, correct and tested, before the two halves that use it: **drawing it on the map** (the "mapped" half of #31a) and **currents** (#31b, which derive from this field). Pure addition; the fixture is byte-identical.

### Batch 128 — the map pans smoothly (a cached terrain buffer)

The continental view panned at ~90-110 ms/frame (≈10 fps), and the map-perf spec measured why: **terrain dominates** (terrain 50 ms, pins 24, art 19, realms 11) — the map redrew every one of thousands of filled hexagons on every pan frame. The noise behind each hex was already memoized (`hexInfoAt`); what cost the frame was the canvas fills themselves.

But at a fixed zoom the terrain is invariant up to a screen *translation*: pan a few pixels and every hex is the same colour in the same world place, just shifted. So render it **once** into an offscreen canvas a margin (224 px) wider than the viewport, and while panning within that margin, **blit the buffer at the shifted offset** instead of redrawing. A pan frame becomes a single `drawImage`.

The buffer re-renders only when it can no longer answer the question — a signature folds in zoom (ppf), the paint epoch, the layer toggles, the canvas size and the art-mark anchor count, and the pan is checked against the margin — so nothing invalidates by hand. Zoom is deliberately not accelerated (ppf changes every frame → every frame is a miss, same cost as before); **panning** is the case that got fast. `drawTier` needed no changes: the terrain is drawn by briefly pointing the shared `ctx`/`W`/`H` at the buffer, centred, and restoring them in the same tick.

**Continental pan: ~90-110 ms → 16.8 ms median (vsync-bound).** Every zoom level now medians ~16-17 ms. The occasional re-render (a drag crossing the margin) is the p95 (~50 ms), so the spec guards the MEDIAN — robust to those spikes, and it springs back to ~90 ms the moment the buffer stops working. The world is untouched (a pure render change; fixture byte-identical), e2e 30/30 including the map-card taps, the realms hues and the roads-by-difference probe that all read terrain.

### Batch 127 — you can't tap a pin that isn't there (map hit-test)

The map's tap handler selected any anchor within 14 px of the tap, checking only that its entity still existed — while the DRAW skips anchors the pins layer has switched off and small pins the zoom has decluttered away. So the two disagreed: switch the pins layer off and tapping where a pin used to sit still opened its card, and a town pin too small to be drawn at the current zoom was still tappable. The same draw-vs-check drift this repo has now paid for several times.

One predicate, `anchorVisible(a, ent)`, now answers "is this anchor on the map right now?" — deleted, zoom-declutter, and every layer toggle (labels / realms / pins / hidden claim) — and BOTH `drawAnchors` (draw) and `select` (pick) call it, so they cannot drift again. Proved by a new `map-card` e2e: hide the pins layer, tap the pin's exact spot → no card; show it → the same tap opens it. Gate: check 0, smoke green, **e2e 30/30**.

**Also chased, and correctly left alone:** "the roads toggle also hides sea routes." `seaRoute` is a route KIND the renderer and the paint-guard handle, but **nothing generates one yet** (0 in the fixture; the only code references are two defensive filters). Sea lanes become real when sailing lands, so which layer toggle owns them is part of **#31** (winds/currents/sailing), not a fix to make against zero sea routes today.

### Batch 126 — the last roadless towns were in the sea (#11 closed)

The roadless-town ratchet had sat at 3 since batch 118, and the standing note said all remaining cases "have their nearest neighbour on the same landmass — a real open bug, cause not yet isolated." Isolated at last, the cause was two causes wearing one number:

- **Two were placed in the ocean.** `siteAt` picks a settlement's sub-hex at the **region octave** (6 mi) and prefers a water-adjacent one for coastal character. But the road pass judges wet/dry at the **world octave** (60 mi — its `shore`, and `hugLand`). The two octaves disagree about exactly where a coast runs, and Ithoth and Olaara landed on sub-hexes the region octave called good grass and the world octave called **open sea** — no dry land within ten miles by the measure the roads use. So every road off them started in water and `hugLand` severed it at the doorstep. They weren't roadless; they were *offshore*. `siteAt` now rejects any sub-hex that is water at octW, so placement and roads agree on where the land is. (Flagship Earth is untouched — it places real cities with its own snap; `generateSettlements` is procedural-only, so the fixture rebuilt byte-identically.)
- **One was never a bug.** Koreia's nearest neighbour is 689 mi off — past the 600 mi reach beyond which the town pass deliberately builds no road. The old count simply couldn't tell "correctly remote" from "stranded beside a neighbour."

So the smoke stopped ratcheting and started asserting: **0 settlements in octW water**, and **0 towns stranded** (roadless with a neighbour inside 600 mi). A town beyond that reach is allowed to be trackless and reported separately. This is strictly stronger than "≤ 3" — it now fails on a single town stranded beside a neighbour, the actual bug, while no longer miscounting the genuinely remote as broken.

### Queue — item #31: winds, currents & sailing (owner, 2026-07-16)

> "put a note for boating across the ocean — I would like you to add to the queue currents. Every world should have wind patterns and their currents considered and mapped, and unpowered boats are required to follow ocean and wind currents, and powered boats can use them but are not bound by them (or however sailing works)."

**Why:** the sea is currently a uniform sheet the ⛵ boat A* crosses at one flat cost (travel-method toggles shipped batch 56; boat edges in `travel.ts`). But real ocean travel is *directional* — the trades and the gyres made some crossings a fortnight and the reverse a season, and that asymmetry is exactly the kind of world-fact a GM's travel planner should surface. This is the ocean's answer to what rivers and roads already have: a **field** the map draws and the pathfinder consults.

| # | Ask | State |
|---|---|---|
| #31a | **Wind field** — every world models prevailing winds and MAPS them (arrows/streamlines on the sea). Earth-like default: trade-wind belts + westerlies banded by latitude, deflected by Coriolis and blocked/funnelled by coastlines | 🟡 **Field shipped (b129)** — `windField.ts`: analytic three-cell model (`windAt(cfg,x,y) → [east,north]`), belts calm at 0/30/60/90°, mirrored across the equator, seeded waviness, deterministic. Guarded by `smoke-windfield.mjs`. **Mapped (b133)**: a toggleable 🌬 overlay draws wind arrows everywhere and current arrows on the sea. |
| #31b | **Ocean-current field** — currents derived from the winds (surface currents largely follow prevailing wind + Coriolis, closing into **gyres** — clockwise N, counter-clockwise S — and hugging coasts). Mapped as a flow field, same as rivers | 🟡 **Open-ocean field shipped (b131)** — `currentField.ts`: the local wind turned by Coriolis toward the gyre centre and slowed to ~½ its pace, sea-masked. Subtropical gyres turn clockwise N / counter-clockwise S (verified), currents follow the wind, defined only on sea. Guarded by `smoke-currentfield.mjs`. **Mapped (b133)** on the 🌬 overlay. *Still to do: coastal boundary currents (a current bending to hug a shore — the Gulf Stream).* |
| #31c | **Unpowered craft follow the flow** — a raft/sail with no engine pays a **direction-dependent** cost: cheap downwind/down-current, dear against it. The honest model (owner's "or however sailing works") is a *sailing polar* — speed as a function of the angle to the wind — plus current advection, NOT a hard "cannot move against it": a sail beats upwind by **tacking**, just slowly; a bare raft genuinely drifts with the current. So this is anisotropic edge cost in the travel A*, not a wall | 🟡 **Model shipped (b132)** — `sailing.ts`: a normalised polar (broad reach fastest, run slower, upwind a nonzero tack) + current advection. **Becalmed, an unpowered hull cannot beat the current** — it drifts with it (verified). Guarded by `smoke-sailing.mjs`. *Still to do: wire it into the travel A* — a gameplay-tuning fork, logged in §9.* |
| #31d | **Powered craft may use but aren't bound by it** — an engine (or a portal-tier magic hull) pays near-symmetric cost; riding a favourable current is a bonus, fighting one is a modest penalty, never a blocker | 🟡 **Model shipped (b132)** — same `sailing.ts`: a powered hull holds its pace through the water and **always makes way**, even straight into wind AND an opposing current at once (verified); the current only nudges it. Travel-A* wiring pending (§9). |

**Shape it will likely take** (to be designed, not committed): a `windField` / `currentField` built in the browser like `riverField`/`roadField` — a coarse vector per sea cell, banded by latitude then perturbed by coasts and the seed. The travel A* already re-plans per method (batch 56); boat edges gain a cost that reads the current/wind vector against the edge's heading. The map gets a toggleable current/wind layer (streamlines or animated arrows). **Determinism:** the field must derive from the seed + geography only (no clock/random), so it rebakes byte-identically like everything else. Connects to **#7a** (the coastline model the mouths already snap to) and the existing travel-method plumbing.

**→ Resolved (batch 128, §6.9 D2): the FULL honest model** — a sailing polar
(speed vs angle-to-wind) + current advection as anisotropic cost in the travel
A*, not a hard wall. #31a–#31d move from `⬜ Open` to *decided, unbuilt*.

### Queue — items #32–#37 (owner, 2026-07-16)

**Queued, not built.** Recorded the day given (the item-#3 lesson). The owner
paused hands-on fixing mid-session to bank these for the agent loop; the root
causes below were found live *before* the pivot, so each is a short job with the
diagnosis already done. They land against §6.9's ordered backlog — #32/#33/#34
fold into **Track 3 (map fidelity)**, #35/#36 into **Track 1 (generators)**.
File:line pointers were accurate at capture; re-confirm before editing.

| # | Ask (owner) | Why / end result | Diagnosis + where it lands |
|---|---|---|---|
| #32 | On a **region** page, "Who holds power here?" (ruler) and "Where is the seat of power?" (seat) dropdowns should **only offer settlements within that political area, and only people who live in those settlements** — not any entity anywhere. | A realm's seat is one of its own cities; its ruler lives there. Today both selects list every person / every place in the world, so you can seat a realm in another continent's city. | `world.astro` `fieldRow` entityRef branch (~L630) lists `Object.values(E())` filtered by `refKind` only. Fix: when `e.kind` is `region` and the key is `seat` or `ruler`, walk the region's subtree (a `descendantsOf` helper) for its settlements — **seat** = those settlements, **ruler** = persons whose `parentId` or `fields.home.ref` is one of them. Always keep the current pick even if now out of scope. "Political area" = the containment subtree (matches the field's own "settlements inside inherit this law"). |
| #33 | The **legend realm list should show only realms in view** — currently only the count (e.g. `1/182`) changes; the list still shows every realm. | The legend is a control panel; on Earth (182 realms) an unfiltered list is a phone book, not a legend. #29 (batch 115) filtered the count but the rows never hid. | **CSS specificity bug** in `world.astro`: `.mv-key[hidden]{display:none}` (~L210, specificity 0,3,0) is TIED by `.mv-claims .mv-key{display:flex}` (~L243, 0,3,0) and **loses on source order**, so hidden rows stay `flex`. The JS (`mapView.refreshClaimLegend`, ~L1350) already sets `el.hidden` right. Fix: add `.mv-claims .mv-key[hidden]{display:none}` (0,4,0). One line. |
| #34 | The **globe should obey the legend layer toggles** (pins, labels, rivers…). Toggling layers off does nothing on the globe. | The globe is the decluttered overview; turning pins/labels off is exactly when you'd want it, and it's ignored — the sphere stays smothered in city names. | `mapView.ts`: `buildGlobeTexture` (~L2215) bakes great rivers unconditionally → gate on `showRivers.checked`, and **null `tex` when the rivers toggle flips** (layer listener ~L2871) so it re-bakes (`drawGlobe` should rebuild when `tex` is null). `drawGlobe` (~L2282) draws each capital **dot** and **name** unconditionally → gate dot on `showPins`, name on `showLabels`. NB: the globe does **not** render realms/roads at all today — making those *appear* on the globe is a **separate enhancement** (project claim washes / road polylines onto the equirect), not part of this item. |
| #35 | The **entry (body prose) of political powers should be rollable** — a region/realm page opens "Nothing written yet"; give it a roll. | Every table on the site is standalone-rollable (§5 directive); a realm is the one political entity with no way to generate its own description. | New "🎲 Roll entry" affordance on `region` pages in `world.astro` that fills the body from a **deterministic** composite seeded off the entity's seed path (no `Math.random`). Reuse the `gm/government` law writeup (`rollRealmGov`, `webs.ts`) plus a new region-flavor table (climate / peril / culture / current tensions), authored fresh and standalone-rollable on its own tool page. |
| #36 | Make the **"Local Life" roll scale by population**: per **200K** pop add **≥1 inn, 2 shops, 8 connected people, 2 side quests, and 1 connection to another city/lair/abandoned town/etc.** 200K is the breakpoint — ≤200,000 = ×1; 200,001–400,000 = ×2; 400,001–600,000 = ×3; i.e. **×⌈pop/200000⌉**. A quick life creator. | The living-world density directive (§3.5 life webs + true side quests): one click should make a big city feel inhabited — inns, shops, a connected cast, a couple of side quests, and a thread out into the wider world. | `webs.ts buildLifeWeb` (L390) today mints a FIXED 2 shops + 2 keepers + 2 kin + 1 feud — no inns, quests, or external link. Extend to `m = Math.max(1, Math.ceil(pop / 200000))` (pop from `settlement.fields.population`): mint `1·m` inns, `2·m` shops, `8·m` interlinked people (keepers + kin + patrons, cross-related), `2·m` side quests (quest webs reusing the local cast — §3.5 chains), and `1·m` external connection (a relation to an existing city / lair / abandoned town, minting one nearby if none exists). ⚠️ Also make it **deterministic**: L391 `stamp = Math.random()` violates CONTRACTS §1/§3 — derive the stamp from the settlement's seed path so re-rolls are stable and the fixture stays reproducible. |
| #37 | A settlement's **DETAILS fields arrive blank** even when the place is fully known — Dun Halifax (pop ~403,131 on Earth) shows empty "Who lives here / how many", "Who rules, and by what right", "What protects this place", "What does it make, sell, or need", "Who holds power here", "What kind of settlement" while the body already reads "…Population ~403,131." **Fill these in via generation**, and **lock the web-related fields** to the web's context — "who rules" inherits the realm's law, "who holds power" ties to the political web's ruler, and node type locks economy / defenses / settlement-type — so they can't drift into contradictions on reroll. | The fields are the machine-readable core the wiki, map, and future webs read (item #28, P0 field-promotion); a fantasyfied real city already knows its population, law, and economy, so the page should *show* them, consistent with its realm — not empty boxes a GM must hand-fill. This is the "additive core + node-type locking" pattern (#76) promoted into structured `fields`, plus the §6.7 rule that a town inside a kingdom inherits the crown's government. | `placeProfile.ts` / `adapters.ts` already derive node type + local government + economy and (#76) promote node type + bare government into `fields`. Extend the promotion to cover **population, ruler, defenses, settlementType, economy**, filled at generation/materialization; mark the web-derived ones **locked** via the `lockOpts` / `gen.overrides` machinery (batch 93) so a reroll keeps them consistent with the realm web. On Earth the population is already in the "On Earth" body — promote it to the `population` field too. Track 1 (generators); ties to #32 (ruler scope) and #36 (life web). |

### Batch 121 — Earth is built in the browser; the bake is a cache

> "why are we still using bake" / "everything should be in browser so the end user experience is what we build on" / "sure point it at the workers, no more drift" — owner, 2026-07-16

**A user picking 🌎 Real Earth now gets the flagship world.** Measured, in a real browser, through the real dialog: **3,512 settlements, 251 regions, 182 realms holding land, 1,255 roads, 476 rivers** — "Aber Tokyobourne", "Fair Applehurst", "Broommoor". Real cities on real coordinates, great rivers on real courses, fantasy names. **None of that was reachable before**: picking Real Earth got you the right coastlines and *invented* cities; the real thing existed only inside a 5 MB fixture that a script on my machine produced. ~45s in the worker with a progress line.

`v2/src/everdeep/earth2026.ts` owns the build. `bake-earth-2026.mjs` went **413 lines → 80**, and what's left is a cache-filler: it calls the same module and writes the snapshot so "Load example" stays instant. The **entire** remaining difference between the two is `EarthIO` — where bytes come from and how a composite module loads — about fifteen lines each side, neither of which decides anything about the world.

**The refactor is verified behaviour-preserving, not assumed.** Byte-identity isn't available (below), so the check compares what the ids are *attached* to: every entity's kind/name/tags/parent, every anchor's x/y/tier/icon, every route's kind/band/length/ends, every claim's owner and hex count, every field value with refs resolved to names, every body paragraph, the party, the world's name/seed. All identical. **Same world; only the random ids differ.**

**The data has one home**: `v2/public/data/` — the same bytes the browser fetches and the bake reads. **66 KB gzipped**, against **1.0 MB** for the baked fixture: generating Earth in the browser is *15× less to download* than shipping the bake's output. (It was under `docs/everdeep/data/`; a copy in both places would have been the very drift being removed.)

⚠️ **The fixture was not reproducible** — ✅ **fixed in batch 122, below.**

### Batch 123 — one composite seed is one city

Batch 122's hash caught that `earth/CN/Fuyang` names two different real cities; it also left a quieter version of the same bug unfixed. A city's **entity id** was made unique (its path carries coordinates), but the **composite seed** it rolls its page from was still `earth/<iso2>/<city>` — no coordinates. So where a duplicated name had **two members big enough (≥1M) to earn a generated page** — **8 of the 23 pairs**, all in China's romanized names — both cities rolled the *same page* off the shared seed: the same statblock name (both Shaoyangs read **"Citydale"**), the same trade goods and walls, differing only where the population option happened to move a line.

It never tripped a check, and the obvious check misses it too: the statblocks are **not** byte-identical (population is an *option*, not part of the seed, so one section differs), so "are all statblocks unique?" reads 908/908 and says all-clear. The true invariant is one level up — **a composite seed identifies a roll, so it must identify one city.** The fix folds the coordinates into the seed for exactly the shared names (`earth/CN/Shaoyang/27.24,111.47`), the same disambiguator the entity path already uses, so seed and identity now agree on what makes a city one city. Unique names keep their prose byte-for-byte; **27 pages** (the composite members of the 23 shared names) reroll — the two Shaoyangs are now "Manordale" and "Homedale".

Guarded in **`smoke-settle.mjs`**: no two entities share a `gen.seed` (1141 seeds over 1141 generated pages). The fixture was rebaked with the change, so `smoke-reproducible.mjs` holds the new bytes.

Nobody had seen the demo yet — the owner's call was that rerolling those pages now, while the world is still private, beats carrying the bug into what ships.

### Batch 122 — the same seed now builds the same world, byte for byte

The seed contract exists so a seed draws the same world every time, and `smoke-everdeep.mjs` has always said a failure there means "user worlds would silently redraw". But **the two things that identified a generated entity were both random**, so the same seed built the same world under a different name on every run:

| source of churn | |
|---|---|
| `newEntity` → `rid()` | `crypto.getRandomValues` — **4,151 ids** rewritten per bake |
| `newEntity` → `now()` | the wall clock — **262 distinct timestamps** in the fixture |
| `blocksToEntity` → `blockId()` | `crypto.getRandomValues` per block |

5 MB of diff for a one-line change, and no way to answer *"did that refactor move the world?"* — asked while moving 400 lines of orchestration out of the bake. CONTRACTS §1/§3 already defined the answer (`id = "e_" + h64(seedPath)`, vectors pinned in `validate.mjs`); it simply wasn't used. Now: entity ids come from a seed path, stamps from `opts.stamp`, block ids from the roll's own seed. **Two bakes are byte-identical**, and the world is unchanged (same structural comparison as batch 121: every entity, anchor, route, claim, field and paragraph).

Two things fell out of it that are worth more than the diff:

- **`gen.overrides` were being orphaned by the very reroll they exist to survive.** An override addresses a hand-edited block as `block:b_…`; `blocksToEntity` minted *fresh random ids* for the same blocks on a reroll, so every override pointed at a block that no longer existed. Same seed → same block ids now.
- **A hash is unforgiving about path uniqueness, and that caught a real bug.** `earth/CN/Fuyang` names **two different real cities** — 23 such pairs — so a name-keyed path would have hashed two cities to one id and *silently deleted one*. A city's path carries its coordinates (unique 1500/1500), and `add()` throws on a collision rather than letting an entity vanish. It also surfaced a *second*, quieter bug — the identical composite seed — **fixed in batch 123, below**.

Guarded by **`smoke-reproducible.mjs`** (~45s, in `npm run smoke`): it rebuilds Earth from the same module the worker calls and demands the bytes match what is committed. It fails if generation stops being deterministic, **and** if a generation pass changes without the fixture being rebaked — the committed Earth and the code that claims to produce it can no longer silently disagree. It also checks `/labs/earth.example.json` is the current fixture, because that auto-publish has silently failed before (a checkout path with a space in it).

### Batch 119 — the browser was re-forging roads for a world that doesn't exist

Chasing the bucketing above turned up **two live bugs on the flagship**, both in the road rebuild a user triggers by nudging a single settlement (`world.astro:2049` → `scheduleRoadRebuild`). Neither has ever failed anything, because both produce a perfectly valid road network — of nowhere.

**1. It took 13 minutes.** The bake buckets per country; `world.astro` does **not** — it hands every settlement anchor to one `generateRoads`. Measured: **790 s** on the shipped Earth, essentially all of it in the capital MST, which priced **30,876 capital pairs at 25.6 ms each**. So "O(n²) A* over 1,500 global nodes would never finish" was true, and the browser was doing it anyway. Almost every one of those pairs is absurd on its face — a full A* from Lisbon to Vladivostok, priced so Prim's can throw it away. Prim's now considers each capital's **6 nearest by straight line** (symmetric, with a nearest-outside fallback so a split neighbour-graph still connects, and a `dead` set for the genuinely unreachable). A geometric MST only ever uses short edges. Straight line is not road cost, so this is a heuristic, not the exact MST — but "capitals link to their neighbours" is what a real network does, and the exact answer is not worth thirteen minutes. **The bake is byte-identical** (490 roads, 19 bridges, 11.2 s): per country there are too few capitals for K=6 to bind.

**2. It re-forged them for the wrong world.** `generateRoads` is shared, but its INPUT was derived **twice**. The bake set each settlement's tier from a local `cls`; `world.astro` re-derived it from tags as *capital → capital, town → town, everything else → village*. The bake tags by **class** (`'city'` ≥500k, `'town'` ≥60k, `'village'` below), so **every city-tagged settlement came back a village** — as did a two-million-soul city that isn't a national capital.

| the browser read the shipped Earth as | capitals | towns | villages |
|---|---|---|---|
| before | 249 | **3** | 3,260 |
| after (`settleTier`) | 596 | **904** | 2,012 |

596 + 904 = **1,500 cities**, 2,012 villages — the bake's own printed census, exactly. Before, a user who moved one town got dirt tracks between megacities and the isolation rule cutting most of them off. Now one exported `settleTier(tags, pop)`, used by the bake, the browser and the smoke.

**With both fixed: 790 s → 67.5 s**, forging the right network. Still slow for an interactive rebuild (it wants a progress indicator, or the same bucketing the bake uses — by geography, not politics, which would fix #11 at the same time), but it is honest now and 11.7× faster.

**The owner's premise was half right, and the half that was wrong is the useful half.** "Snap roads to hexes and then paint, like rivers" — but **rivers are not painted into hexes**, and never have been. A river is a polyline plus a **real width** (`RIVER_REAL_FT`: 900 / 5,000 / 8,500 ft), indexed by SEGMENT into 6-mile buckets; `widthAt(x,y)` answers per point and the hexes **ask it**. A river's hex-ness is derived at draw time and never stored. So the target was right and already existed — just not where it looked like it was.

**What was actually missing: a road had no width.** Not a wrong width — *none*. `mapView` drew one with `ctx.lineWidth = 2.6`, and that is a SCREEN PIXEL: a highway was 2.6px looking at a third of Earth (≈21 miles wide) and still 2.6px standing in a 500-foot hex. There was no road in the world to detect, only a line on the glass — which is exactly why detecting one was hard, and why the hex inspector could tell you the biome, the altitude, the hex's span and what the land yields, and **nothing at all** about the highway through it.

**Why hexes are the wrong unit for a road** (the arithmetic that decided it):

| | hexes | polyline + width |
|---|---|---|
| Earth's 73,484 mi of road | 9.7M @40ft · 3.9M @100ft · 776k @500ft | **10,984 vertices** |
| in the world file | ~70–175 MB | **~350 KB** (file is 4.7 MB) |

And the finest hex the app has — **locale, 500 ft** — is already **5× wider than a highway and 50× wider than a dirt track**, so painting one "road" makes a 40-ft road 500 ft wide. The rule underneath: **a hex grid is the right shape for a FIELD** — something with a value everywhere (elevation, biome, ownership). **A road is a curve.** Rivers are curves too; that is why they are stored as curves.

Shipped: `ROAD_REAL_FT = { highway: 100, road: 40, dirt: 10, path: 4 }` (the owner's numbers), `buildRoadField` → `widthAt(x,y,tol)` / `kindAt(x,y,tol)`, roads drawn on the same ladder rivers use (`max(atlasW, realFt × ppf)` — 2.6px at world view, **12px in a 500-ft hex**), dirt's dashes retire once the track is drawn at true width, and the hex inspector now reports `🛣 road (40 ft wide)`. `travel.ts` and the field now share ROAD_REAL_FT as the single answer to "what is a road" (it was "not a river and not a seaRoute", a second definition and the exact class of bug we keep hitting).

**Tolerance is the load-bearing part.** A road is 10–100 ft wide, so a strict query hits only within 20 ft of the centreline — true, and useless for "does a road cross this hex?" when a world hex is 60 MILES. Both are real questions, so the caller says how forgiving to be: `widthAt(x,y)` is *am I standing on it*, `widthAt(x,y, hexFt/2)` is *does one run through this hex*. The sweep radius is derived from the tolerance (a 30-mile question reaches five 6-mile buckets); hard-code it the way riverField can afford to — its widest river being 0.8 mi — and the field answers "no road" while the road runs through the next bucket.

⚠️ **Two live things this turned up, neither fixed:**
- **The `roads` layer toggle also hides `seaRoute`** (`kind === 'river' ? !showRivers : !showRoads`). Harmless on the shipped fixture, which has no sea routes — but it is the same "everything else" definition again.
- **Pin hit-testing ignores the pins toggle**: the click handler walks `plane.anchors` regardless, so a hidden pin still swallows a tap and opens its card. Turning pins off does not let you tap the ground under them.

**#25 and #7a: one cut, one and a half fixes.** I claimed one fix would serve both. It **half did**, and the honest numbers are worth keeping:

- **#25: 44 → 0.** Fully fixed.
- **#7a: 76.3% → 63.4%** of rivers ending on dry land. **302 still do.** The cut only helps a tributary that actually *reaches* a trunk — and there are **23 authored trunks for 476 rivers**, so most have nothing to join. 45 rivers (9.5%) now end **on a bigger river**, which is what a confluence should look like.

⚠️ **The cheap fix for the remaining 302 is a trap, and I nearly took it.** The bake drops all **26** traced band≥3 trunks (13,129 trunk-miles) in favour of the 23 authored ones. Measuring "does a dropped trunk run within 30 mi of an authored course?" said **0 of 26 duplicate anything — deleted for nothing**, which reads as a free restore. **That test is backwards.** The reason trunks were dropped at all is that the traced Nile *wanders the Sahara westward and misses its delta* — so the tracer's version of a famous river is **expected to be far from the authored course**. The right question is whether it drains the same **basin**: **9/26 dropped trunks have their mouth within 300 mi of an authored river's mouth** — *four* of them within ~108 mi of the **Ob's** delta, one 45 mi from the **Niger's**. They ARE the famous rivers, traced badly. Restoring them gives the world two Obs.

So #7a's tail needs either basin-aware merging (drop only a traced trunk whose basin an authored river already covers) or extending each dead-end downstream to water along the drainage grid. **Open, and not small.**

### Owner feedback on batch 112 — items #18–#23 (2026-07-15, batch 113)

| # | Ask | Outcome |
|---|---|---|
| #19 | "**zooming to the smallest grain is extremely choppy**" | ✅ **9,634 ms → 20.2 ms a frame (477×).** Not choppy — *frozen*. `drawFlowMarkers` walked each river segment in **62-PIXEL** steps, and a segment's pixel length grows with zoom: at the 50 ft grain one 7.67-mile segment runs **81,000 px**, so it drew **1,306** wave-arrows for it — **13 million a frame** across Earth's 10,247 segments, essentially all off-screen. Now Liang–Barsky-clipped to the viewport, jumping straight to the first visible mark. **Anything that walks SCREEN space needs clipping**: world-space work is self-limiting (a hex is a hex), a screen-space step count has no bound. Guarded by `tests/map-perf.spec.ts`. |
| #23 | "**water is appearing at checkpoints for rivers, but not all along its path**" | ✅ `buildRiverGrid` indexed route **VERTICES** and treated each as a disc of the river's own width. Median vertex gap **7.67 mi**; a great river is **1.61 mi** wide — **0 of 10,247** segments were short enough for consecutive discs to touch, so the water was a string of beads and batch 110 ringed each lone bead with its own beach. Now segment-indexed with point-to-segment distance: **102,470 mid-segment probes, 0 dry** (was **100.0% dry**). **Same bug batch 109 found in the bridge probe** — vertices are not a line. |
| #18 | "the floating rivers are gone but now it's just their **wave arrows** floating around" | ✅ Batch 109 fixed the river's *line* via `screenRuns` and left its *arrows* behind on the old `\|bx-ax\| > circumFt/2` raw-world-dx test — **the exact test that cannot see the #13 wrap**, as the comment three lines above it says. The current kept marching over open ocean without the line. Now on `screenRuns` like the ribbon. |
| #22 | "realms should **prefer to end over water rather than exclude land**" | ✅ The land gate tested the hex **centre** only, so a crown stopped short of its own coast wherever the centre fell in the sea. Now ANY of the 7 poll points counts: **23,503 → 25,534** hexes, landless realms **76 → 63** (Puerto Rico, Trinidad, Luxembourg recovered). Raster-first ordering makes the sweep no slower. |
| #21 | "realms should have **labels** for what they are" | ✅ The label renderer has taken a claim owner's colour since batch 13 — it was only ever missing an anchor. **182 realm labels**, placed at the hex nearest the territory's middle. The mean of x is **circular**: Russia spans the date line, and a plain average drops its label in the wrong ocean. |
| #20 | "realms list is huge, that portion of legend should be **scrollable**" | ✅ `.mv-claims` capped at 26vh with its own scrollbar. |

**Perf, measured (continental view, p95 while panning, cumulative layer-off):**
terrain **50 ms** · pins/labels **24** · terrain art **19** · realms **11** · rivers **6** → 107 ms total.
⚠️ **An idle rAF loop measures VSYNC, not the map** — mapView repaints on demand, so timing frames while nothing moves reports a flat 16.6 ms at every zoom and proves nothing. The map must be panning.

**Owner's suggestion (2026-07-15):** *"never resizing in one grain level — one size per hex; resizing between grains is a good idea for visual benefit."* Right instinct, and the measurement says it targets **pins (24 ms) + art (19 ms) = 43 of 107 ms**: fixed size per tier makes a glyph a cacheable sprite, and `drawImage` beats `fillText` for emoji by a wide margin. It does **not** touch the 50 ms terrain floor (hex fills must scale continuously or they stop tiling) — that wants tile caching, a bigger job. Neither was this batch's bug: the 477× came from unbounded iteration, not from resizing. **Open.**

#### Item #3 — realms with territory (batch 112)

**The realms half already worked; the TERRITORY half never existed.** The bake
had minted one fantasy-named `region` per country since batch 17. What nothing
in the repo ever did was *populate `plane.claims`* — the only writer, anywhere,
was the hand-paint brush. So 245 crowns owned nought and the political map drew
nothing, **for months, silently**: a world with empty claims is valid and
renders perfectly. Nothing failed. It was just blank. (`smoke-realms.mjs` now
fails loudly if territory ever goes back to zero.)

| Piece | What shipped |
|---|---|
| **The raster** | `bake-earth-admin.mjs` → `earthAdmin.ts`: NE 10m admin-0 rasterised to **2160×1080** (~18.5 km/cell), one byte per cell indexing 239 ISO codes, **39 KB gzipped / 66 KB source** — against earthCoast's 252 KB. Lazy chunk; only an `earth` world pulls it. 2160 because claims are sampled by **60-mile** hexes: already 5× finer than anything reads it, and 4320 (98 KB) buys nothing visible. The script takes a width if #3b ever needs it. |
| **The sweep** | `earthRealms.ts` — `generateEarthRealms()` walks every world hex, **245 realms / 23,503 hexes / ~850 ms**, 30 land hexes disputed. |
| **Browser, not bake** | 🌐 The dialog's `🌎 Real Earth` is a **first-class user choice**, so this had to be shared code, not a bake trick. It runs in `worldgen.worker.ts` (new `Drawing borders…` stage) and the bake calls the *same module*; the bake's old naming loop and its `REGION_LABEL` are deleted in favour of it. ⚖️ |
| **The lattice** | `hexgrid.ts` (new) — hex math lived **only inside `mountMap` as closures**. A claim address is meaningless unless writer and renderer agree on which hex it names, so the lattice is now shared and mapView reads it like everyone else. |
| **The palette** | Was `CLAIM_COLORS[i % 6]`. The instinct is "245 realms need 245 colours" — **wrong twice over**: 245 hues are unreadable, and a political map is a *planar graph*, so four provably suffice and greedy never needs more than six. The palette was always big enough; only the **assignment** was naive. Welsh–Powell fixed it: **46/311 → 0/311** touching realms sharing a colour, using **5 of 6**. |
| **Perf (#4)** | Adding 23.5k hexes to every frame was a real risk — at world zoom `hexW≈2.4px` clears both skip thresholds, so the full cost lands at exactly the zoom you want the map. Border edges are a property of the *claim*, not the camera, but were re-derived per frame (**141k set-lookups/frame**); now precomputed at rebuild and stroked in **one** path. Plus a vertical cull (latitude doesn't wrap, so it's exact). |

**Decisions worth keeping:**
- **World tier, not region.** Claims are address strings in the doc: Earth is ~23.5k hexes ≈ **371 KB** at world tier (60 mi) but ~**2.5 M** at region tier (6 mi) — tens of MB, impossible. The cost is that borders step in 60-mile jumps.
- **Poll the hex, don't prick it.** A country polygon stops at its coastline, so a single centre sample reads the *water beside the city*: Anchorage and Nome came back as **nobody** while inland Fairbanks/Juneau read US fine. A 7-point straw poll fixed it (12/12 cities) and cut unclaimed land **353 → 30**.
- **76 realms hold nothing, correctly.** Monaco, Singapore, Puerto Rico… are sub-hex. The map paints a hex from its *centre* too, so those islands aren't drawn at world tier at all — a wash of colour over open sea would be a lie. They still exist as pages and still parent their cities.
- **Antarctica is not a crown.** It would have been the *largest realm on the map* (9,328 hexes, a third of the claim file) purely because NE has a polygon for it.
- **Land per the WORLD, not the raster.** The sea-level slider floods this Earth without touching a border, so `biomeAt` gates every claim — a drowned coast stops being claimable.
- **`earthUV()` exported from terrain.ts.** A seeded Earth drifts its continents 1–4%; a border raster read without that same warp would put France in the Atlantic.
- **Measured, not assumed:** the fixture's `plane.terrain` carries no `climateModel` while the bake computes with `'earthlike'` — which looked like a live bug. **0/20000 sample divergence**: `landform:'earth'` already forces that path. Left alone.

**Still open — #3b subrealms.** "countries with logical subrealms (like america with
the states)". Admin-1 is fetched and understood (4,596 units, 41 MB). ⚠️ **The
obvious heuristic is wrong**: the most-subdivided countries are **GB:232,
SI:193, LV:119** — districts and municipalities, not states. Needs a *curated*
federal list (US, CA, AU, BR, IN, MX, DE, RU, CN, AR ≈ 320 subrealms), and a
decision on whether subrealms claim at world tier (washes stack with the parent)
or get their own tier.

**→ Resolved (batch 128, §6.9 D4): subrealms claim at their OWN region (6 mi)
tier** (crisp internal borders, accepting the larger data + perf cost), built
from a *curated* federal list — not the naive most-subdivided heuristic.

#### Diagnosis (2026-07-15, parallel investigation — measured against the real fixture)

The road hypothesis was **half right**. #12 is exactly the predicted batch-90
regression; #10/#11 are **not regressions at all** — Earth never had those
behaviours, and the "before" the owner remembers is **Vessia**, whose bake
(`continent-vessia.mjs`) is genuinely richer than the shared browser module
(`settlements.ts`) that Earth uses. Root causes, all with file:line evidence:

| # | Root cause | Verdict | Fix | Effort |
|---|---|---|---|---|
| #1 | **Two** nearest-neighbour raster lookups, not one. `earthCoastLand` samples the coast mask with `Math.round` (`terrain.ts:297,300`) at ~2.3 mi/cell — at locale tier (500 ft hexes) **~576 hexes share one sample** → hard diagonals. Worse: `landCoverAt` (`terrain.ts:218-227`) is NN over a **1024×512** grid = **~24 mi/cell**, 10× coarser — *the dominant biome-blockiness cause*. `earthLumAt` (`terrain.ts:253-279`) already bilinear-interpolates the same style of grid — **the fix pattern exists in the file, just unapplied**. The existing `detailAt` bias can't help: it nudges elevation thresholds *after* the hard boolean land/sea call | Confirmed | Bilinear-interpolate both + seed-keyed domain warp near the boundary (deterministic, `fbm3` idiom already used by `earthDrift`) | M |
| #2 | `uniq()` (`bake-earth-2026.mjs:186-187`) papers over an exhausted pool by appending a visible integer. Pool: `FEED_ROOT`(20) × `FEED_END`(12) = **240 stems** for **2,012 feeders** → **973/2,012 (48%) carry a numeric suffix**; **1,021/4,103 (25%) of ALL entities** do. Worst base name repeats to "… 10". `fantasyCity` = 9 prefixes × 18 suffixes × 3 modes for 1,500 cities. **`settlements.ts:126-127` already has the right pattern** — salted reseed on collision, never a visible counter | Confirmed | Widen pools ~4×, add structural variety, replace the counter with the salted-reseed pattern | M |
| #3 | `surface.claims` is initialized `{}` at `bake-earth-2026.mjs:101` and **never populated** — the Realms legend is empty and no borders render. `countries.json` has centroids only, **no polygons**. The claims model + renderer **already support nested multi-tier claims** — this is a bake/dataset problem, not a rendering one | Confirmed | Rasterize NE `admin_0` + `admin_1` (same GitHub mirror batch 85 used) → claims; subrealm entities; per-owner hashed hue (`CLAIM_COLORS` cycles only **6** colors for 150+ countries) | L |
| #4 | **Not what it looked like.** Pan/zoom already coalesce via rAF — that part is solid. The real cost is O(n²): `childrenOf` (`world.astro:286-287`) does a full 4,103-entity `Object.values().filter()` **per tree node**, and `renderTree` runs it for every node on **every** `navigate()`/`rerender()` → **measured 2.85 s blocking per pane open**. Plus `descendantAnchors`/`hasMapPresence` (`world.astro:1678-1693`, called at `:885`) → **994 ms** on a large realm. A big realm page can cost **~4 s** | Confirmed, measured | One shared `parentId→children` index + one `entityId→anchor` index. Both O(n) | **S** ⭐ |
| #5 | Tree defaults **fully expanded** (`loadCollapsed` only restores manual toggles, `world.astro:318-332`) → all 4,103 nodes built into the DOM. No `scrollIntoView` anywhere in the file; nothing walks `parentId` to reveal a selected node. No "locked region" state exists | Confirmed | (a) invert default to collapsed, (b) reveal-path on navigate + scroll, (c) locked "🔒 Hidden" section | S–M / M / L |
| #6 | River-fill is gated to `hexFt <= 5280` (`mapView.ts:385`) — **mile/locale tiers only**, so region tier (the owner's screenshot) never fills. Note: at region tier the 0.85 rule would demand a **26,928 ft-wide** river vs a max table width of 8,500 — so removing the gate alone changes nothing without retuning. **Shore/beach adjacency does not exist**: `beach` is an elevation-only band (`terrain.ts:601-602`), no neighbour check anywhere | Confirmed | Retune per-tier fill + add a neighbour-check shore ring in `hexInfoAt` (hot path — needs care) | S/M + M |
| #7 | **Two independent causes.** (a) `bake-earth-2026.mjs:115` drops generated band-≥3 rivers, but `hydrology.ts:329-338` *splits* a stem at each band change — so the surviving band-≤2 half now dead-ends where its (deleted) continuation began: **374/490 (76.3%) of generated rivers end on land**. (b) Authored trunks push raw lat/lon with **no snap-to-water** (`bake-earth-2026.mjs:173-175`): **20/23 (87%) end on land** — the Nile's real mouth lands on `grass`, the Amazon's on `jungle` 24 mi short | Confirmed, measured | (a) stitch kept segments to the authored trunk (M) or truncate cleanly (S); (b) ring-search snap mirroring the existing city `snap()` (S) | S–M |
| #8 | Legend has **no key at all** for hex overlay marks or resource rings (`mapView.ts:105-138`). Sprawl: batch 91 guarded farms and batch 95 guarded the city **sprawl ring** — but the city **seat hex itself** (`mapView.ts:567`) has **no biome check**, and `ruin` (`mapView.ts:478,483-491`) is unguarded entirely. At ~6 mi region hexes a coastal seat's hex center reads water | Confirmed | Widen the guard at `mapView.ts:496` to all marks; add a "Marks" legend section | **S** ⭐ |
| #9 | **Verified duplicate**: `rt_genriv00d` and `rt_genriv02r` trace the *identical hex sequence* with matching `acc` values from hex `235,10` down — drawn twice with independent meander jitter = "two parallel channels". Cause: the "extend to water's edge" loop (`hydrology.ts:254-269`) uses a **local** `seen` Set and never consults/updates the global `visited`, so accumulation flicker near `RIVER_MIN` spawns a second false "mouth" that retraces the same course. **In shared `hydrology.ts` — affects every world, not just Earth**. Delta direction was a red herring | Confirmed (duplicate); cause strongly inferred | Make the extension loop respect `visited` like the rest of the file | **S** ⭐ |
| #10 | **Not a batch-90 regression.** (a) Vessia's bake snaps a new road onto the **nearest point of an existing route** (`continent-vessia.mjs:1403-1428`); the shared `settlements.ts:283-298` only connects to the nearest **node**, so roads run parallel and never merge — lost at the batch-69 port, so the owner's "before" (Vessia) really was better. (b) Route-id counter is **per-call** (`settlements.ts:246`) and the bake calls it once per country → **908 routes, only 539 unique ids**; `rt_gensr0000` is reused by **69** routes | Confirmed | (a) port the route-snap; (b) namespace ids per country | M + **S** |
| #11 | **Not a regression** — present since Earth's first bake (batch 86). `bake-earth-2026.mjs:290-303` buckets nodes by `iso2` and calls `generateRoads` **per country**, so a cross-border road is structurally impossible. Lock Uvira ↔ Grand Bujumburareach are **15.1 mi** apart; Uvira *does* road to Fort Bukavu **65.5 mi** away inside DRC — so the pathfinder is fine, the bucketing isn't. (Bucketing exists for a reason: O(n²) A* over 1,500 global nodes "would never finish".) Also `settlements.ts:288,295` has **hard distance caps with no fallback**, unlike Vessia's unconditional nearest-node fallback | Confirmed | Cross-border pass for different-country nodes within ~25 mi, after the per-country loop | S/M |
| #12 | **CONFIRMED batch-90 regression** (`git blame` → `b918d0a`). `generateRoads` detects a great river **only** via `hydro.grid.riverOn`/`bandOf` (`settlements.ts:54,179,190-228`) — the *generated* drainage. Batch 90 drew **authored** rivers into `surface.routes` and **never fed them back into the grid** (`bake-earth-2026.mjs:113-117,159-183,295`), so roads are routed against an **invisible** river network and bridged against phantom crossings. **Measured: 42 road×authored-river crossings, 0 bridged** — nearest bridge 995–3,461 mi away. All 13 bridges sit on the invisible generated river | Confirmed regression | Rasterize authored polylines into an overlay `HydroGrid` (`worldKeyAt` already exported) before calling `generateRoads` | M |

**Structural finding — why none of this was caught:** the "0 unbridged / 0 isolated"
invariants from batches 51/52/53/57 were only ever **console logs inside Vessia's
bake**, never codified as tests. `smoke-settle.mjs` calls `generateRoads` on a
*synthetic* earth-landform world — it never runs the real `bake-earth-2026.mjs`
pipeline, so it cannot see the per-country bucketing, the real city nodes, or the
authored-river substitution. Its only bridge assertion is `bridges.length >= 1`.
**Codifying these invariants as a real audit over the shipped fixture is the fix
that stops #12-class regressions recurring** — worth more than any single item here.

#### 🎲 DIRECTIVE — every table stays standalone-rollable (owner, 2026-07-15)

> Owner: "the premise of this site is roll tables. **any roll table we are
> creating needs to be accessible to a standalone rolling generator** for a user
> to have and use separately from the world process. so settlement generator
> should benefit from the new generation steps you are working through now."

**The third leg.** Together with the two directives below, the shape is now:

1. **One implementation** — no bake reimplementing what a module does.
2. **Browser-based** — a user's own world gets everything the demo has.
3. **Standalone-rollable** — and everything the *world* generates must also be
   rollable on its own tool page, without a world.

Worldgen is not allowed to become a private walled garden of good content. If
world generation learns something (node types, a name pool, a coherence rule),
the standalone roller learns it in the same batch — because rolling tables IS
the product, and the world is one consumer of them.

**Live consequence:** this is the same ask already recorded in §5's "Node-type
locking in the randomizers" — a standalone Settlement roll should first roll a
**node type** (fishing village, mining camp, river crossing, royal seat…) and
let that type LOCK the downstream tables (economy, trade, cuisine, defenses), the
way the map's `SettleNode.type` already does. Batch 76 shipped the world half;
the **standalone half is still owed**, and item #2's widened name pools should
reach the settlement/NPC/landmark tools the same way.

**Audit owed:** walk what worldgen currently knows that no tool page can roll —
`settlements.ts` node types + `reason`, `fantasyEarth.ts` naming, the feeder/
foodshed model — and expose each as a table or generator option. Until that
audit exists, assume the gap is wide.

#### 🌐 DIRECTIVE — everything browser-based; the bake is not a feature (owner, 2026-07-15)

> Owner: "the problem with bake is that the end user doesn't get to benefit from
> it when they create their worlds. **everything needs to be browser based**."

**This supersedes the "thin driver" rule below by going further.** That rule said
a bake may call shared modules. This says the *user* must get everything the bake
produces — so any generation that exists only in a bake is a **feature the
product doesn't actually have**. The Earth demo looked finished while a user
creating their own world got a fraction of it.

**The gap, concretely.** `worldgen.worker.ts` (what a user's world creation runs)
calls `ensureEarthGrid` → `generateHydrology` → `generateGeography` →
`generateSettlements` → `generateRoads`. Everything else in the flagship is
**bake-only**, i.e. invisible to users:

| Bake-only today | Batch | User gets it? |
|---|---|---|
| Real cities placed at real lat/lon, snapped to shore | 86 | ❌ |
| Fantasyfied names (cities, realms, features) | 86/89 | ❌ |
| Realms — one per country, with government | 86 | ❌ |
| Rulers = fantasyfied real leaders | 92 | ❌ |
| Feeder hamlets around every city ≥700k | 95 | ❌ |
| Authored great rivers on real courses | 90 | ❌ |
| Per-country road bucketing | 86 | ❌ |
| City footprint by population | 95 | ✅ (render-side) |

**The good news — this is very achievable.** The Earth data is **213 KB raw**
(`worldcities.csv` 158 KB, `countries.json` 38 KB, `earth-features.json` 8.6 KB,
`leaders.json` 4.4 KB, `earth-rivers.json` 3.2 KB). That is *smaller than
`earthCoast.ts`*, which **already ships to the browser** as a 190 KB gzipped lazy
chunk loaded only for `earth` worlds. The exact pattern is proven
(`earthBiome.ts` 14 KB, `earthCoast.ts` 190 KB, both lazy).

**Target shape:**

1. A shared `v2/src/everdeep/earthWorld.ts` holds the whole Earth pass (cities,
   realms, rulers, feeders, authored rivers), with the data as **lazy chunks**
   baked by a script the way `earthCoast.ts` already is.
2. `worldgen.worker.ts` calls it when `landform === 'earth'` — so **a user who
   creates an Earth world gets the flagship**, not a subset.
3. Naming (`fantasy-earth.mjs`) moves into shared TS, since the browser needs it.
4. The bake stops being a generator and becomes **a headless run of the same
   browser path**, kept only to publish a pre-built example so "Load example" is
   instant. If it ever produces something the browser can't, that is the bug.

**Step 1 shipped in batch 103:** `fantasy-earth.mjs` → `v2/src/everdeep/fantasyEarth.ts`
(shared TS), which is also where item #2's widened name pools now live — so the
naming work benefits users' worlds, not just the demo. The remaining steps
(city/realm/ruler/feeder passes + data chunks + worker wiring) are the epic.

#### ⚖️ ARCHITECTURE RULE — one implementation, bakes are thin drivers (owner, 2026-07-15)

> Owner: "it sounds like the 'bake' vs shared typescript modules is a recurring
> problem. If we can remove the dual development that would be ideal."

**Correct, and it was the root cause behind #10, #11 and #12 alike.** What the
audit found (batch 101):

- `continent-vessia.mjs` was **1,762 lines** — the largest script in the repo —
  importing **only Node builtins**. It reimplemented terrain, hydrology,
  settlement and road generation *from scratch*, and **nothing referenced it**.
  The fixture it baked was deleted in batch 96.
- Worse than dead: it was the **better** implementation. The shared
  `settlements.ts` was a **lossy port** of it (batch 69) that silently dropped
  route-snapping and the isolated-town fallback — so the owner's "we had more
  road joining before" was literally true, and unfixable by reading the shipped
  module alone.
- `bake-earth-2026.mjs` (321 lines) is the **right** pattern already: it imports
  `terrain.ts` / `hydrology.ts` / `settlements.ts` / `adapters.ts` and only adds
  Earth-specific data.

**The rule, from here on:**

1. **`v2/src/everdeep/*.ts` is the single source of truth** for all generation.
   The browser and every bake run the same code.
2. **A bake script may only** load data, call the shared modules, and assemble
   entities. If a bake needs different *behaviour*, that behaviour goes into the
   shared module behind an option — it never gets reimplemented in the script.
3. **No invariant lives in a bake's console log.** It goes in
   `v2/scripts/smoke-*.mjs` or it does not exist. #12 shipped precisely because
   "0 unbridged" was a `console.log` in a file nobody ran.
4. When a bake diverges from the shared model (batch 90's authored rivers are the
   live example — drawn into `routes` but never fed back into the grid the road
   pass reads), that divergence **is** the bug. Feed it back.

Batch 101 deleted `continent-vessia.mjs` + `expand-vessia.mjs` (2,653 → 813 lines
of bake script) after harvesting the richness the port had lost.

### Nested-spaces epic — dungeons & cities (owner, 2026-07-15)

> Owner clarification: "space is not space as in outer space, but nested spaces
> like dungeons and cities." The levels *below* a map pin — descend from the
> world map into a city (its districts, streets, buildings) or a dungeon/lair
> (its rooms as a battle-mappable interior). Today a city or dungeon is a wiki
> *page*; the epic makes it a *space you enter*.

**What already exists (reserved, mostly unused).** The schema
(`world.schema.json`) already carries the machinery: `plane.sites` — square-grid
battle maps (floors, cells typed `floor|wall|door|stairs|water|hazard`, per-cell
`entityId`, and a `gen{generator,seed}` for procedural fill), `parentSiteId`
(a city site containing building sites), and `plane.links` (descend/ascend
between planes: `toPlane/toX/toY`). The `district` and `building` kinds exist and
route into the 🌍 Geography tree group. Dungeon content tables exist:
`gm/dungeon/{room,riddle,hazard,graffiti}`. **None of `sites`/`links` is rendered
anywhere** — there is no interior/battle-map view, no descend navigation, and
settlements don't generate their interior.

**Slice 1 — DONE (batch 103): dungeon & lair composites.** The content layer.
- `v2/src/composites/dungeon.ts` (`gm/dungeon`): warded riddle-gate → 3–8 rooms
  (each a `gm/dungeon/room`, some with a `hazard`) → graffiti → inner sanctum
  with a party-sized boss (`gm/monsters/all#cr-{level+2}`) guarding a hoard
  (coins/gems/magic-item/chest from the DMG tier). Options: `size`, `level`.
- `v2/src/composites/lair.ts` (`gm/lair`): one resident (beast or named villain)
  + guardians + approach + tell + den hazard + treasure. Options: `kind`, `level`.
- Both auto-surface as GM Prep builders (glob in `gm/index.astro`), save into a
  world as `landmark` entities (`adapters.ts` KIND_BY_TOOL maps `gm/dungeon` and
  `gm/lair` → `landmark`), and their registry bundles carry the full monster/
  loot/spell closure (`npm run registries`). This fixes review complaint 3c
  (dungeons/lairs/ruins/caves were all one generic landmark).

**Next steps (unbuilt), smallest-risk first:**
1. **Bridge (cheap): route feature kinds to the composites.** Wire
   `dungeon`/`lair`/`ruin`/`cave` landmark features so descending into / adding
   one auto-fills via `gm/dungeon` or `gm/lair` in the ghost/materialize flow
   (`onMaterializeGhost` / the ghost-slot machinery in `world.astro`). Connects
   slice 1 to the world's drill-down without any new rendering.
2. **Slice 2 — city interiors.** Descending into a settlement rolls its
   `district`s (market/temple/docks/gate quarter…) and notable `building`s as a
   navigable sub-space (tree/pages first, using the existing kinds + ghost
   slots). No new composite renderer required for the first pass.
3. **Slice 3 — the interior map renderer (the big one).** A square-grid site
   view for `plane.sites` (rooms/streets as cells) + descend/ascend from a map
   pin via `plane.links`. New canvas renderer + a plane/navigation model; this
   is what makes dungeons and buildings *actual maps*. Reuse `mapView.ts`
   patterns where possible but sites are square-grid, not hex.

Guardrails to honour (from §5 directives above): every new table stays
standalone-rollable; the interior generators are browser-side composites, not
bake-only; any invariant goes in a `smoke-*.mjs`, not a console.log.

## 6. Decision register — RESOLVED (owner, 2026-07-12)

| # | Question | Decision |
|---|---|---|
| Q1 | Naming | Part of Storyteller Toolbox; internal codename only. "Worldsmith" taken → **Everdeep** (renameable on request). |
| Q2 | Solo/Writing pillars | Own overhaul later; all random tables survive as accessible sections; Everdeep is full integration. |
| Q3 | Sheets | **Both** — global sheets remain; sheets can bind to a world. |
| Q4 | Genre | Fantasy launch; genre-neutral architecture. |
| Q5 | Launch = 0+A+B+C | **Yes.** |
| Q6 | One-parent containment tree | **Yes.** |
| Q7 | Field typing | **Default typings ship**; users build their own typings later (v2.5), with their own random tables for them. |
| Q8 | Day-one kinds | Yes, **plus faction** — six kinds. |
| Q9 | Custom kinds | **Yes, planned** (v2.5), eventually with custom randomization. |
| Q10 | Ids | Hidden ids behind all items; rename always safe; names don't matter to identity. |
| Q11 | Ghost drift policy | **Accepted** — structure guaranteed, ghost content may drift. |
| Q12 | Ghost touch materializes ancestor path | **Yes.** |
| Q13 | Ghost density 3–5 default | Fine start. |
| Q14 | New-world flow | **Generate-first, and it must be a connected campaign starter**: enough for the first few sessions. Quests, people, dungeons, regions interconnect — generation stores variables that reference real entities (someone/somewhere/something); referenced dungeons appear on the map with the item/enemy inside and theming matched. → Story webs (§3, Phases B/C/E) + connected-generation design in Phase 0. |
| Q15 | Hex orientation | **Pointy-top.** |
| Q16 | Site grids | **Square.** |
| Q17 | Scales & sites | Global tier scales stand; ground = battle maps sized to the space shown (tavern 20×20, city 200×200), with **nested sub-maps** (city site → building sites). |
| Q18 | Planes | **Multiple planes.** |
| Q19 | Rivers/roads | Whatever keeps a realistic feel **and inter-hex continuity** → freeform polylines, realism-first rendering. |
| Q20 | Verticality | **Both** — planes for global depth (underdark), floors within sites. |
| Q21 | Units | Metric display toggle — planned (cheap). |
| Q22 | Sync scope | **Everything syncs**, images included, v1. |
| Q23 | Merge = LWW + conflict inbox | **Yes.** |
| Q24 | Revision history | **Deferred** — only with collaboration, which is not planned. (Autosave + trash + session undo remain.) |
| Q25 | Soft limits | Yes (warn ~50 MB/world). |
| Q26 | Secrets v1 scope | **Yes**, sufficient for launch. |
| Q27 | Share snapshots | **Keep in E.** |
| Q28 | Backend | **Local-first, permanently.** GitHub Pages, free. No plan for anything bigger. |
| Q29 | Custom table/generator authoring | **Yes** (v2.5). |
| Q30 | WA/Kanka importers | **No, not yet.** |
| Q31 | Weather in D | **Yes.** |

### §6.1 Decisions — batch 8 (owner, 2026-07-13)

| Decision | Resolution |
|---|---|
| Periodic terrain (globe/wrap) | **YES** — G1 noise becomes x-periodic (cylinder sampling) before genVersion 1 freezes at M1. |
| Terrain look at Earth scale | Superseded by a bigger directive: **world generation is user-led, Civilization-style** — at creation the user picks landform (single continent / several continents + how many / archipelago / pangea…), water %, climate; the generator honors it. Landform becomes a G1 input (continent-mask term over the noise), chosen alongside size preset and seed. |
| Next stretch | **Map M1** (agreed). |
| `/world/` in main nav | **YES** — shipped. |
| New-world default scale | Lighter starter default; full 20-quest kingdom as explicit option (agreed). |
| Word-level fragment rerolls | Fast-follow after launch (agreed). |
| Portrait art pack | **"Notebook-style pencil drawings"** as the initial pack, generated by Claude — **SHIPPED 2026-07-13** (`portraits.ts`): 5 race base heads (human/elf/dwarf/orc/halfling — pointed ears, tusks, breadth), 4 eyes, 4 brows, 4 noses, 4 mouths, 6 hair, 5 facial (race-weighted: dwarves bearded, elves rarely), 5 headwear, 4 garbs, drawn as seeded wobble-stroke pencil (double-pass, hatching). Every person page renders one on a paper card; per-layer reroll chips (GM view) persist a compact recipe string in `fields.portrait`; unset portraits derive deterministically from the entity's seed. Owner may commission pro art later. |
| **Tree ↔ map merge** (new directive) | The world tree gets a **jump-to-map button**; the end state is ONE surface: tree visible while navigating the map, selecting on the map shows entity details, and items can be CREATED from the map ("+ Add here"). M1 ships the map panel inside /world/ beside the tree (not a separate page); the side-panel details + spatial add land with M1/M2. |

### §6.2 Directives — batch 9 (owner, 2026-07-13)

| Directive | Resolution |
|---|---|
| Continent shapes | **Not all circles.** Landform blobs became rotated stretched ellipses + continental-scale domain warp of the mask field (shipped in G1 pre-freeze; MAPS §3.1c). |
| Settlements on water | Taverns/villages/cities **default to land**; building on open water is an intentional, confirmed choice — entity tagged `waterborne`, anchor `icon: "waterborne"`, unique hex art (interim teal-wave pin now; stilts/rafts/piers art with the glyph pack). |
| Settlement footprints | **City 2–3 mi across (2–3 mile hexes); town ~½ mi; village ~¼ mi.** Feeds G5a footprint rendering, M3 site extents, and smart placement (MAPS §3.1c table). |
| Watabou-style settlement gen | Eventually: in-house city/town/village **plan generation** (districts, streets, walls, footprints) with **smart location placement** (harbors, river crossings, crossroads, defensible hills). G5 slow lane; footprints first. |

### §6.3 Directives — batch 10 (owner, 2026-07-13)

| Directive | Resolution |
|---|---|
| Deeper collapsible tree + geographic/political toggles | **Shipped**: top-level Geography / Politics / People & Story group toggles; regions nest under regions (continent → kingdom lands → …). |
| Ocean/continent/range/lake/region naming generators | **Shipped**: `geoNames.ts` (12 feature kinds, seeded); continental bake detects features (flood-fill over the world grid) and writes named label anchors onto the map. Same generators serve lower tiers as features materialize. |
| Kingdom color wash at world level | **Shipped**: claims render a very faint per-owner fill + boundary strokes at every tier. |
| Sub-powers within kingdoms | Multi-tier claims already render (sects claim region/locale hexes inside world-hex kingdoms); claim-painting UI lands with M2. |
| GM-adjustable borders (war campaigns) | Claims are hex-address arrays — M2 claim editor = paint/unpaint hexes as fronts move. Recorded in MAPS §3.1d. |
| Intelligent roads (avoid oceans, bridges near cities, avoid peaks) + civil-engineering placement | Recorded as the G3 cost-surface spec (MAPS §6 G3): water near-infinite except short city-adjacent spans, peaks impassable → passes, slope-weighted A*, trunk consolidation; settlement scoring by water/arable/defense/trade. |
| Terrain variance / real geography patterns | **Shipped** (pre-freeze): orogeny belts replace mask-center mountains; plains/basins/deserts emerge. Island arcs, rifts, rain shadows noted as future patterns. |
| More unique map icons | **Shipped**: 16 anchor icons incl. ruin, lair, cave, natural formation, tower, temple; landmark bakes pick varied icons. |

### §6.4 Directives — batch 11 (owner, 2026-07-13)

| Directive | Resolution |
|---|---|
| Borders follow natural features | **Shipped**: kingdom territories grow from their seats across a terrain-COST surface (plains cheap, mountains/deserts dear) — expansion stalls at ranges, so borders settle along natural features instead of straight Voronoi cuts. Rivers join the cost surface when G3 rivers land. |
| Settlement visibility ladder | **Shipped**: 1M+ souls and capitals visible at world scale; 250k+ at the next band; 50k+ next; 1k+ by the mile band; everything by street level. Vessia rebaked with the ladder (Westbridge ≈ 1.08M metropolis; capitals 140k–900k; towns 8k–140k; villages 300–4.5k). |
| Road classes reveal by zoom | **Shipped**: highways appear at the third zoom band, roads next, dirt tracks last; rendered from plane.routes with per-class style (solid/width/dash). |
| Road existence by population | **Shipped in the bake**: every 50k+ settlement gets a road (highways link capitals as a spanning tree over the cost surface — water not crossed, mountains routed around); 10k+ gets at least a dirt track; sub-1k usually roadless (6 settlements left roadless in Vessia). Bridges near cities = G3 refinement. |

### §6.5 Directives — batch 12 (owner, 2026-07-13)

| Directive | Resolution |
|---|---|
| Real-life continental rendering (Victorian benchmark) | Recorded as MAPS §9b: historical densities (England 1851 ≈ 310/sq mi, Zipf rank–size, market town every 7–10 mi, village every 1–3 mi, keeps on frontiers) → a habitability/density field D(x,y) driving **ghost settlement generation per hex** (heartland/settled/frontier/wilds bands); only the Zipf head is baked/visible at world zoom. Deliverable lands with Phase C/M2 ghost hexes. |
| Zoom-tier geography consistency | **Fixed at the root**: fbm now normalizes by the infinite-series amplitude, so finer tiers only ADD ±small detail and can never re-scale the field — a world-tier water hex stays water when zoomed (inlets stay inlets; no phantom archipelagos). Per-hex classification bias halved. New smoke check pins it: land/water flips between oct-6 and oct-11 allowed only within ±0.035 of sea level. |
| Zoom smoothness | **Fixed**: macro tier ladder densified to 2× steps and the crossfade re-timed (fade 4→8px, base switch exactly where fade completes) — no more mid-fade pops. |
| Globe view | **High feasibility** — terrain is already cylinder-periodic, so a globe is a projection change. Plan in MAPS §9c: orthographic render at min zoom + spin, capital pins, flat↔globe morph as polish. |

### §6.6 Directives — batch 13 (owner, 2026-07-13)

| Directive | Resolution |
|---|---|
| Road isolation rule | **Shipped in the bake**: a settlement under 5,000 souls more than 20 miles from its nearest neighbor gets NO road — unless an existing highway/road passes within 20 miles, in which case it snaps a dirt spur to it ("between places"). Vessia: 3 snapped spurs, 30 isolated settlements left roadless. The density-field ghost layer (§6.5) inherits the same rule. |
| Political owners named on the map | **Shipped**: every claim owner gets a cartographic label at its territory's centroid, drawn in the territory's claim color (same label system as landforms/oceans). |
| Victorian settlement spread (interim) | **Shipped in the bake** ahead of the full density field: heartland clustered around each capital (4 towns incl. one 30–140k market town + 8 villages within the near quarter of the territory) thinning to a frontier (2 small towns 1.5–12k, 4 hamlets 120–900) — Zipf-ish populations; 242-page fixture. |

### §6.7 Notes — batch 14 (owner, 2026-07-13): generation coherence rules

Noted for the Phase B/C generation passes (extends "ancestor-context tag
plumbing"): generated content must respect WORLD RULES, BIOME, and TIER —
- **Government lives at the polity level.** A town inside a kingdom
  inherits the crown's government style (a mayor/reeve under it, not its
  own monarchy); only under anarchy/frontier rules does each settlement
  roll its own. Generally: composites must know their POLITICAL ancestors
  and suppress/inherit fields accordingly.
- **Biome-aware feature content.** No "waterfall grotto" landmark baked
  into open plains; landmark/settlement flavor tables filter by the hex's
  actual biome (and coast/river adjacency once G3 lands). The map is the
  truth; text must agree with it.
- **Tier awareness.** What generates inside a world hex (provinces,
  ranges) differs from a region hex (towns, lairs) and a locale hex
  (buildings, encounter spots); suggestion slots and ghost tables key off
  tier, not just kind.
- **Danger radii (owner, 2026-07-13).** Lairs and dungeons project a
  danger zone: settlements don't spawn inside it (or spawn ABANDONED —
  a ruin with a story), and roads crossing it are marked unsafe (ambush
  tables, warning flavor, caravans reroute when an alternative exists).
  Radius scales with the lair's threat tier; clearing the dungeon (quest
  completion) lifts the zone — the living-world payoff.
Mechanism: the runComposite context object grows ancestors (polity,
biome, tier, adjacency tags) that {table:#tag} rolls filter on — already
planned as Phase B "ancestor-context tag plumbing"; these rules make it
concrete. Danger radii join the placement pass (settlement spawn checks
distance-to-hostile-landmarks; road cost surface adds danger cost). Slots
into the composite/adapters work, pre-launch.

### §6.8 Directives — batch 15 (owner, 2026-07-13)

*(Running batch log — newest first. Batches 87–98 were reconstructed into this
table on 2026-07-15 from their commit bodies, which had been the only record.)*

| Directive | Resolution |
|---|---|
| 🛡️ Tag-miss guardrail: `{table:id#tag}` fails loud (batch 99) | **Shipped** — the `GENERATORS-REVIEW.md` "engine guardrail (do first, it's small)". `pickEntry` (`roll.ts`) silently fell back to the WHOLE table when a tag matched nothing, so every tag gate could leak a plausible-but-wrong answer that nothing downstream could detect. The static validator already catches `{table:x#tag}` misses in authored templates, but the real exposure is **runtime-built filters** — `encounter.ts:176/183/189` (`{table:${MONSTERS}#${cr.tag}}`) and `shop-page.ts:85` (`{table:gm/shop/inventory#${slug}}`) — where a miss meant drawing from all 697 monsters (a tarrasque in a level-1 fight) or the whole inventory. Now a miss throws `TagMissError` in **strict mode** (on in `smoke-engine.mjs`) and otherwise warns + renders a visible gap (`⟨no cr-99 in Monsters by Challenge Rating⟩`) rather than laundering the miss. Verified with a probe in all three modes (lenient → gap, strict → throw, valid tag → rolls normally); **strict smoke found zero misses in the current content**, so the gate holds today and catches every future tag gate. check 0 errors, validate + full smoke green. |
| 🏰 Savable rolled kingdom + its supporting web (batch 98) | **Shipped** (owner: "rolling a kingdom should be savable, with the web behind it rolled from the standalone tables"). A **🏰 Generate a kingdom** action on the world root rolls a whole realm and saves it into the active world as linked entities: `buildKingdom` (`webs.ts:456`) mints a realm region + the crown (a faction) + a ruler on the throne + the capital that names it (rolled as a royal seat, so its economy/trade lock to a capital) + 2–4 towns and 3–5 villages inheriting the realm's law + a couple of landmarks — all cross-linked (realm↔faction↔ruler↔capital), with the realm/faction carrying the law writeup. `rollRealmGov` rolls the realm-scale constitution from the `gm/government` bundle so a crown gets the full law, not a town-scale office; `RunTool` now passes composite options so the web can size each place. Verified end-to-end: one click yields e.g. "The Temple Rest Reach" (Gerontocracy) — capital, 2 towns, 5 villages, crown, ruler, 2 landmarks, no console errors. **Closes the §5 "rollable kingdom → saved into the active world with its web" goal.** |
| 🔄 Load example always pulls the fresh fixture (batch 97) | **Shipped** — the example saves into IndexedDB on first load, and a refresh re-opens that saved copy without ever re-downloading, so a rebaked demo looked stale forever. Clicking **Load example** is an explicit "give me the current example": it now fetches with `cache: 'reload'` (so it can't be served a stale HTTP-cached file) and overwrites the stored world. |
| 🌍 The shipped example IS Earth — 2026 (batch 96) | **Shipped** — "Load example" was fetching `public/labs/vessia.example.json`, a stale pre-batch-90 copy (1,996 entities) that the rebakes never touched, so the demo lagged every flagship batch (no authored rivers, no fantasy geography, no real rulers, no feeders). The served fixture and the embedded world-viewer now regenerate from the current `examples/world.example.json` (**4,103 entities**), renamed off the misleading `vessia` filename to `earth.example.json`, and `bake-earth-2026.mjs` auto-runs `build-labs.mjs` so a rebake can never drift out of sync again. Viewer retitles from the world's own name; empty-state and New-world copy no longer say "Vessia"; the stale fixture is deleted. |
| 🏙️ City footprint by population + feeder hamlets (batch 95 — item #9) | **Shipped**. Two realism passes for the flagship. (1) **Urban footprint sprawls with real population** (`mapView`): a metropolis of millions is no longer a single rooftop hex but a spread of them — inner rings read as built-up rooftops (10M+ → 3 rings, 3M+ → 2, 700k+ → 1), cleared farmland beyond, and rooftops never spill onto water. (2) **Feeder hamlets** (bake): a city can't feed itself, so every city ≥700k gets a ring of farming villages scaled to its population (classic names — Greenford, Fenmill, Wheatbarrow), placed at region tier so they surface on zoom instead of cluttering the world view. **2,012 feeders** across the demo. |
| ⚔️ Party composition sizes encounters & loot (batch 94 — item #8) | **Shipped**. A per-world party composition (level + headcount) so fights and their loot fit the table: a **⚔ Lv/×** control in the world toolbar (GM-only, hidden in Player View) writes `settings.party` (schema + type added); in-world composite runs size to it via `ctxFor` (encounters take the party's size/level, hoards take the challenge tier mapped from party level); and the GM Prep **Encounter** and **Hoard** tools default their level/size/tier from the active world's party (still overridable), so a roll already fits. Verified end-to-end: setting L9 ×6 persists and the encounter tool opens pre-sized to it. |
| 🔒 Lock generator options across rerolls (batch 93 — item #7) | **Shipped**. Rerolling a shop's inventory reset its merchant type — every reroll re-ran the composite with default opts, so `random` picked a fresh type and a weaponsmith became a florist. Composites can now expose a **`lockOpts()`** that resolves reroll-invariant dimensions from the base seed; the app recovers those locked options (persisted onto `gen.opts`, back-derived for existing shops) and passes them into every reroll path — block reroll, whole-page regen, and deep section/field rerolls. `shop-page.lockOpts` resolves the merchant type, so rerolling the shelves keeps the shop's type (verified: unlocked reroll drifts type, locked stays). A general mechanism any composite can opt into. |
| 👑 Rulers are fantasyfied real 2026 leaders (batch 92 — item #6) | **Shipped**. Each power's ruler is now the fantasyfied version of its real 2026 head of state/government — a recognizable surname (Fort-Tampania style) and a regnal title matching the realm's fantasy style (Khan of Cathay → Xi Jinping, First Citizen of Azteca → Sheinbaum, Sultan of Nipponia → Takaichi), over a generated statblock, with the real name/office noted in the body. **47 major powers** covered from a curated leaders dataset; unknown powers keep a fully generated ruler. |
| 🌾 No farms in water + biome-specific farming (batch 91 — item #5) | **Shipped**. (1) **No ploughing the surf**: at finer-than-region zoom every child hex inherited its parent region hex's farm mark, so coastal region hexes painted their water children with a golden wheat wash. A farm mark is now suppressed on any hex that resolves to water/deep **at its own tier** — no wheat on the surf or over a river channel — and `beach` is no longer farmable. (2) **Farming varies like real country**: RICE paddies (flooded terraces) in the wet tropics and warm river/lake valleys (the Ganges/Mekong look), hill TERRACES where hills don't border grass, cattle PASTURE on the open plains, SHEEP on the hill-grass margin, wheat CROPLAND elsewhere. |
| 🏞️ Great rivers authored on their real courses (batch 90 — item #4) | **Shipped**. The coarse world-hex drainage can't resolve a sub-grid incised trunk like the Nile: on the flat Sahara elevation it wandered west and hit the Libyan coast ~500 km short of the delta, leaving fantasy-Cairo waterless. For the flagship Earth, the generated small rivers/streams (band ≤2) stay for texture, and the world's **23 great trunks** are authored on their real source→mouth courses — Nile, Amazon, Mississippi, Yangtze, Congo, Yenisei, Ob, Paraná as *grand*; Lena, Mekong, Niger, Volga, Danube, Ganges, Indus, Amur, Colorado, Rhine, Mackenzie, Zambezi, Murray, Yellow, St Lawrence as *great* — densified in lat/lon and linked to their named-geography feature. The Nile now runs through the delta past Cairo. Generated band-≥3 rivers are dropped so there's no double-draw. |
| 🗺️ Named geography for all worlds (batch 89 — item #1) | **Shipped**. Every major geographic feature — oceans, seas, mountain ranges, great forests, deserts, lakes, great rivers — is auto-generated and named for **every** world, surfaced as editable `biome`-kind entities in the Geography tree group. New `src/everdeep/geography.ts`: `generateGeography()` finds features as connected components of the drainage grid and names them via `geoNames`, wired into the worldgen worker + the inline fallback and materialized as label anchors at world creation (~20+ named features per procedural world). For Earth-2026, a curated real-feature dataset (**90** ranges/seas/rivers/deserts/forests/lakes at real coords) runs through a new `fantasyFeature()` transform — The Himalayor Spine, The Nileris Water, The Saharar Barrens — so the map reads as a fantasy Earth with the real name preserved in each entry's body. `scripts/smoke-geo.mjs` added to `npm run smoke`. |
| 🧭 A party for the Earth demo, so routes have a start (batch 88 — item #2) | **Shipped**. Diagnosed item #2 ("route planning broken on Earth"): the core `planTravel` was fine for land routes (Paris→Berlin 900 mi, Paris→Beijing 8,220 mi verified) — the Earth fixture simply had **no party position**, and travel starts from the party, so the trip tool had no origin. Party set at Vaduzoria (central Europe); labs rebuilt. (Intercontinental trips still need the ⛵ boat toggle — expected.) |
| 🏔️ Fix Himalayas-as-water and desert-snow on Earth (batch 87) | **Shipped** — two Earth biome bugs the flagship surfaced. (1) **High terrain rendered as WATER** (Tibet, the Andes, K2): the inland-lake heuristic (Blue-Marble class-0 + far-from-coast) flooded high plateaus the Blue Marble leaves unclassified — now gated to low elevation (`e < 0.66`) so only genuine low basins become lakes. (2) **The Sahara/Arabia speckled with SNOW** (~18% of cells): the Blue Marble scatters ice-misclassified pixels through hot deserts and `if (lc===1) snow` trusted them — now the ice class is trusted only where it's actually cold (`t < 0.3`). Result: Tibet/K2 → mountain, Cairo → desert, Sahara snow **83/468 → 0/468**. Terrain/hydro/settle smoke green (land 28.6%, poles cold, equator warm, rivers 16/16, endorheic lakes). |
| 🌍 Earth — 2026: the flagship demo (batch 86) | **Shipped** (owner: "make the demo fixture vessia be on a modern day earth — 2026… every regional power in its place, every major and minor city in its place… fantasyfied plays on the real names, Fort Tampania for Tampa… the full power of this tool"). The demo world is now **canonical real Earth** populated from real public-domain data (Natural Earth countries + SimpleMaps world cities, via the GitHub mirror): **1,500 cities placed at their real coordinates**, grouped into **245 fantasyfied realms**, with **233 rulers**, **512 real rivers**, and **393 roads** — 1,996 entities, 3.2 MB. New **fantasy-name transformer** (`fantasy-earth.mjs`, deterministic, root stays legible): cities → *Tokyospire, Beijinggard, Cairogard, Port Bangkokcrest, Angelescrest*; powers → *The Khanate of Cathay* (China), *The Crownlands of Albion* (UK), *The Imperium of Gallia* (France), *The Reach of Plataria* (Argentina). New bake `bake-earth-2026.mjs` uses the batch-85 coordinate mapping (`x=(lon+180)/360·circ`, `y=−(lat/90)·h/2`), snaps coastal cities to shore, gives each power's seat a full generated settlement page + a ruler and smaller cities light pages, and forges roads per-country (global road-forging is O(n²) A* — infeasible). Also added the `earth` landform to `world.schema.json` (batch 66 added it to code but not the schema). validate green; verified in-app — East Asia renders recognizably with fantasy-named cities, rivers, roads, and realms in the tree. Third and largest flagship ask. (Follow-ups: inter-capital highways, curate the small-territory realms, richer per-city pages on demand.) |
| 🌎 Ultra-high-fidelity Earth coastline (batch 85) | **Shipped** (owner: "earth creation still mangles Florida… I want an ultra-high fidelity recreation of earth"). "Mangles Florida" was a **coastline** problem, not elevation — the 2048×1024 grid (~19 km/cell) dissolves narrow features. New high-res **land/sea mask** baked from **Natural Earth 10 m** land polygons (public domain, fetched via the reachable GitHub mirror) — scanline-rasterized to **10800×5400 (~3.7 km/cell)**, bit-packed + gzipped to a **190 KB** lazy chunk (`earthCoast.ts`, `bake-earth-coast.mjs`). `terrain.ts` loads it in `ensureEarthGrid` and makes it **authoritative for the land/sea boundary** (`earthCoastLand`), with the elevation grid still supplying relief underneath. Florida, the Keys, capes, and small isles are now crisp. Debugged an alignment trap: the elevation grid is stored south-up, so the mask samples with `row=(1+latFrac)/2` — verified at **97.3 %** agreement with the elevation land (the 2.7 % delta is the crisp-coastline gain). check 0 errors; terrain smoke green (land 28.3 %, sea-level dial, drift), hydrology 15/16 real rivers + endorheic lakes, settle green; full-world native render shows every continent correctly placed. First of the three flagship asks. |
| 🔁 Rebake Vessia after the voice/quality passes (batch 84) | **Shipped** — the deferred single rebake now that settlements (b81), landmarks (b82), and NPCs (b83) all landed. Regenerated from the pristine base (461 entities); every baked settlement now shows the town-scale arrival impression, local government, town mood, locked economy, signature, and town-scale trouble together, and NPCs draw from the tamed pools. validate green; labs republished. |
| 🧑 Tame jarring NPC content (batch 83) | **Shipped** (owner: "then NPCs"; addresses "people details are sometimes jarringly strange"). The wrapper tables made the strange stuff a coin-flip; reweighted toward safe, mundane defaults: **backstory** charlatan-with-a-crime 50% → **15%**, **motivation** active-fear 50% → **26%** (most NPCs now have a goal), **keepsake** sentimental → **70%** (weird 20 / oddity 10), **flaw** slot prejudice 25% → **8%**. The **prejudice** table was reframed out of clinical real-world language into in-genre flavor — the sex/age -isms and the anachronistic "drug-users" dropped, and "Racist: toward orcs" / "A Profession: toward fishers" became "**Bears an old grudge against orcs**" / "**Distrusts fishers**". Curated the review's named offenders: the meme/pop-culture keepsakes (the Half-Life λ crowbar, the Daft Punk helmet, the "Moose" cup) and the scatological / own-death / anachronistic-vegan quirks. Verified by distribution over 400 rolls (odds above) and 100-build smoke. (Follow-ups still open from the review: wiring **role/context** into `npc-block.build()` so a Villain draws from the unused `villain.json` and a Ruler suppresses wild tiers, and a single-temperament coherence pass.) |
| 🗺️ Landmark biome coherence + twist typos (batch 82) | **Shipped** (owner: "then landmarks"). Closed the review's landmark-coherence gap: the biome EXCLUDE map covered only 5 of 7 groups and filtered **only the top-level site**, so a desert ruin still held a "flooded, ice-rimmed cistern." Now `shore` and `wet` have exclusions, `dry` is broadened to catch coastal/rain words (reef, coral, tide, raining, mangrove…), and the exclusion is applied to the **interior rolls too** (the "Within" room and the Hazard reroll up to 4× if they contradict the ground). Verified: **0/120** desert landmarks leak water/ice/coastal terms into site+interior (was frequent). Also fixed five **typos** in `gm/adventure/twist` ("prohibited form killing"→"from", "recieved…exteraneous"→"received…extraneous", "gol"→"goal", "goas…compelete"→"goals…complete"). check 0 errors; validate + smoke green (landmark 100 builds × all options). |
| 🗣️ Settlement voice pass — town-scale, not nation-scale (batch 81) | **Shipped** (owner: "let's continue with the realm scale language in settlements"). The settlement page was still rolling four **realm-scale** tables that read like a national politics briefing on a village of 200 — `gm/government/atmosphere` ("Nationalistic Atmosphere… the nation's future"), `morale` ("The country experiences internal divisions"), `complication` ("covert operations to influence other nations"), `intrigue`. All four are replaced with authored, **templatified town-scale** tables — `gm/settlement/first-glance` (a traveller's arrival impression), `mood` (the town's temper), `trouble` (town-scale hooks: a feud, a bad harvest, a corrupt reeve, a beast on the road), and `undercurrent` (town-scale secrets: the mayor on the take, a smuggling ring in the cellars) — each fanning out to hundreds–thousands of combinations, article/coherence-checked. The realm tables stay in the **government** bundle for the future kingdom generator, where nation-scale is correct. Settlement page now reads as one coherent place, top to bottom; bundle shrank 116 KB → **27 KB**. check 0 errors, validate + smoke green (100 builds × all options). (A demo rebake is deferred until the landmark + NPC voice passes land, to rebake once.) |
| 🏛️ City-level landmarks — inside & nearby, pickable on the edit screen (batch 80) | **Shipped** (owner: "places should also have city level landmarks, both inside and nearby as details types to add, these should be options to pick from in the edit screen"). Every settlement page now has a **landmark picker**: two buttons — **🏛 Landmark in town** and **🌄 Landmark nearby** — each roll **four options as chips** ("The bell tower · The poor quarter · The green · The gallows square · 🎲 more"); picking one files it as a `landmark` child of the settlement (tagged `in-town`/`nearby`) and, when the settlement has a map pin, drops the new landmark **beside it** (in-town on the spot, nearby 15–45 mi out). The landmark composite gained a **`setting` option** (`urban`/`wild`): `wild` is the existing country-site generator (reused for "nearby"), `urban` reads a new authored, templatified table **`gm/settlement/feature`** (36 rows → cathedrals, guildhalls, citadels, markets, arenas, libraries, baths, gallows squares, slums, catacombs… fanning out to thousands of named town features), half the time carrying a "Right Now" notice for a live scene. check 0 errors; validate + smoke green (landmark composite 100 builds × the new option); verified end-to-end in-app — rolled four in-town options on a settlement and the picked "The bell tower" became a landmark page filed under it. |
| 🔁 Rebake Vessia on the new generators + biome/type threading (batch 79) | **Shipped** (owner: "rebake vessia"). The demo continent is regenerated through the batch-76/77 composites, so every baked settlement now carries the coherent core: a **node-type-locked economy/trade**, a **concise local government** ("A lord-mayor and aldermen, keeping the law of Authoritarian" instead of a page-long constitution), and a **signature** line. The bake now threads **biome + node type** into each settlement composite call (capital/town/village/granary/industrial/river-town/waystation) so the composite's locking matches the placeReason "Why here" fact, and its realm-government roll was repointed from the settlement bundle (which dropped those tables in b77) to the **government** bundle. A rebake wrinkle was fixed: the bake appends to whatever fixture it reads, so it must start from the **pristine 25-entity Thornwald base** (restored from the pre-continental-bake commit) — run against the frozen full fixture it doubled to 910; from the base it produces a correct **473 entities**. Also tightened a river-port economy phrasing ("a river wharf where the harvest of the uplands is barged down"). `validate` green; fixture reloaded clean in the labs viewer (no page errors); fixture stays minified (1.97 MB). |
| 🎲 Templatify the signature table (batch 78) | **Shipped** (owner: "the signature stack needs more randomness, take note from my random generators — templatify and that 49 can be many many more"). The 49 flat "What Sets It Apart" lines are rewritten as `{pick:…}`-templated rows (the roll engine's own templating), fanning out to **~1,000 distinct signatures** and growing — e.g. "The whole place is built around one enormous old {oak\|yew\|chestnut\|elm\|fig\|banyan}, its {roots\|shade\|limbs} {buckling\|cracking\|swallowing} the {market square\|main road\|well\|green}." Fixed article agreement and referential coherence so no combination misfires (no "half slate and half slate", no "a old law"). validate + smoke green. |
| 🏛️ Settlement-scale government + signature detail (batch 77) | **Shipped** (next off the `GENERATORS-REVIEW.md` roadmap; owner: "go ahead"). Two fixes for the two problems the batch-76 screenshot made glaring. **(1) Local government, not a national constitution.** A settlement's Government was rolling `gm/government/government` — a 24-entry table of **page-long civics essays** ("Militocracy — …", with real-world country citations and realm-scale leader/goals/methods sub-rolls) that read absurdly on a village of 200 and dominated the page. Settlements now generate a **concise, scale-appropriate local authority** (`localGovernment` in `placeProfile.ts`): a reeve/mayor/council/guild keeping the realm's law when there is one ("An appointed governor, keeping the law of the Duchy of Sarn"), self-rule under anarchy ("No crown's writ reaches here — a compact of the merchant houses keeps order"), or a plausible local office with no known realm. The 1,000-character essay tables are left for the future **kingdom** generator, where they belong. Side benefit: the settlement registry bundle dropped **467 KB → 114 KB** (it no longer pulls in the giant leader/goal/method/citizen-goal tables). **(2) A signature-detail roller.** The review's clearest single gap — NPCs always get a quirk, places had nothing that individuated them. New authored table `gm/settlement/signature` (49 grounded, additive one-liners — "The whole place is built around one enormous old tree, its roots buckling the market square"; "A single lamp is kept burning in the tallest window, for a ship long overdue") is rolled **once, unconditionally** as a "What Sets It Apart" line, the way an NPC always gets a quirk. Verified: `check` 0 errors, `build` + `smoke` green (settlement composite 100 builds × all options), `validate` green (new table passes the table schema), and in-app the `/gm/settlement` page now reads compact and coherent with a local government and a signature line. (Still realm-scale/off-voice and next in line: the Morale, Complication, and Intrigue tables — "the nation", "the autocrat" — the deeper content-voice rewrite.) |
| 🧱 Additive settlement core + node-type locking (batch 76) | **Shipped** (owner: "the realism should be additive, in many cases it is completely derailing… a random community could get a random node type (fishing village) adding more locking… for more consistency even in the randomizers"). First batch off the `GENERATORS-REVIEW.md` roadmap, applying the encounter builder's "coherent core, then decorate" pattern to settlements. New pure `placeProfile.ts` lifts the map's geographic realism (the bake's `SettleType` + `ECON` logic) out of the grid: a **node type** is fixed first (from an explicit pick, a baked node, or derived from size + biome the way the map derives it) and then **LOCKS** the Economy, Trade, and a new "Why It Stands Here" line so they can't contradict each other or the land — a desert market town now trades "salt, glass, and dates" instead of blind-rolling "Mithril Ore," a mountain river port barges "ore, stone, and worked metal," a fishing village lives off the water. The composite gained a **"Kind of place"** option (auto/7 types) so the standalone randomizer gets the same locking a GM rolling in isolation asked for; **abandoned** places are now generated empty from the start (a clean "What Remains" ruin) instead of a thriving town with a contradiction pinned on top. Context threading widened: `ctxFor`/ghost-materialization pass **biome** (and abandoned) into the composite, and `adapters.ts` now **promotes the node type and the bare government into structured `fields`** (was population/race/gender only) so the realm-law chain compounds and a future kingdom-web can read a holding's kind/law without re-parsing prose. Verified: `check` 0 errors, `build` green, `smoke` green (settlement composite 100 builds × all options), and in-app the `/gm/settlement` tool renders the new control with a coherent Fishing Village roll. (Next off the roadmap, both very visible here: the civics-textbook Government essay that cites real countries — the P2 voice/scale pass — and a place-level "signature detail" roller.) |
| ✂️ Trim the demo fixture + fix stale schema (batch 75, D) | **Shipped** (owner: "D go ahead and trim"). The Vessia example fixture was pretty-printed at **5.05 MB**; JSON.parse doesn't need the whitespace, so it's now **minified to 2.08 MB** (−59%, lossless — 471 entities / 732 routes / 2 planes all intact), which halves load-example parse time. The bake (`continent-vessia.mjs`) and the labs publisher (`build-labs.mjs`) now write/emit minified, so it stays trim; the embedded world-viewer HTML dropped from ~5 MB to 2.12 MB. Running `npm run validate` (which the smoke loop hadn't been exercising) surfaced two **pre-existing** schema failures — fixed here: the body-id pattern rejected the bake's underscore ids (`b_why_cap0`) and my batch-73 `b_why`/`b_bridge` ids (loosened `^b_[a-z0-9]{6,}$` → `^b_[a-z0-9_]{3,}$`), and the route width cap was 3 while grand rivers (batch 59) use width **4** (raised to 4). `npm run validate` now passes; check/build/smoke green. |
| 🏞️ Real inland lakes + zoom-fidelity check (batch 74, B unblocked) | **Shipped** (owner: "all of unblocked B"). **Real lakes:** where the Blue Marble shows water but the elevation grid says land, `biomeAt` for `earth` now returns a lake — checked before the mountain band (so high lakes count) and gated on sitting well inland (so a coast-grid seam isn't flooded). Captures the Great Lakes, the Caspian, Baikal, Victoria, Great Bear, and the endorheic seas — 6/8 sampled majors plus all the endorheic ones, up from ~0 rift lakes (the depression-fill missed them). Tanganyika and Titicaca stay missed — they're narrower than the 1024 land-cover grid resolves. Land fraction 28.3% (lakes now count as water). **Zoom fidelity (B2):** investigated and found **already satisfied** by the native 2048 elevation grid (batch 70) — a deep-zoom render of the UK & Ireland shows recognizable, smoothly-woven real coastlines down to the grid's ~19 km/cell, sampled by bilinear so the tiers weave without seams; finer-than-19 km fractal coastline detail is a future option, not a gap. **Real ocean bathymetry stays blocked** (GEBCO is on proxy-unreachable hosts). check/build/smoke green. |
| 🛤️ Regenerate roads when settlements are edited (batch 73, A part 1) | **Shipped** (owner: "let's work on A" — regenerate roads when users add settlements). The road-forging pass was split out of `generateSettlements` into a reusable **`generateRoads(cfg, grid, nodes)`** (behaviour-preserving — smoke identical at 309 roads). The worldgen worker gained an **`op:'roads'`** message that recomputes the drainage grid and re-forges the network for a given node set. `world.astro` reconstructs the terrain cfg + settlement nodes from the plane and, when the user **adds or materialises a settlement**, schedules a **debounced, off-thread road rebuild** (`scheduleRoadRebuild` → worker → swap the road routes, keep the rivers, regenerate the bridge anchors, re-render), replacing the old crude straight-line hack. Verified in Node: adding a town on a populated continent gives **Δ+1 road, the new town connected ✓**; removing a town drops the count; regeneration is deterministic; a settlement on a tiny uninhabited island stays roadless (isolation rule). **Part 2 (batch 73b):** `generateHydrology` gained an optional **`forcedWater`** (world-hex keys the user painted as water → excluded from land, added to the lake set); the worker gained an `op:'rivers'`; `world.astro` watches the terrain paint (`onClaimsEdited`) and, when the world-water paint set changes, debounces an off-thread **river re-trace** that swaps the river routes, merges fresh auto-lakes with the user's paint, and re-renders (baseline signature set on mount so only real edits fire; border paints don't). Verified: forcing a desert hex to water re-traces rivers (483→487) that now drain to it. Completes directive A. check/build/smoke green. |
| 🎨 Real Earth biomes from the Blue Marble (batch 72) | **Shipped** (owner: the flagship Earth "still looks a bit different to what I'd expect from an earth clone"). The culprit was that biomes came from our temperature × moisture *model*, so desert/forest boundaries only approximated Earth's. Now they're **real**: NASA's Blue Marble (three-globe's `earth-day.jpg`, public domain) is classified by colour into land-cover classes (ocean/ice/desert/grass/forest) and baked to `earthBiome.ts` — 1024×512, gzip-compressed to **14 KB** (4 classes compress hugely), lazy-loaded with the elevation grid and inflated via `DecompressionStream`. `biomeAt` for the `earth` landform reads the real cover and lets **temperature set only the band** (cold forest → taiga, hot forest → jungle, hot grass → savanna); elevation still owns water/beach/hills/mountain and the ice caps, and class 0 (ocean/coastal-mismatch) falls back to the climate model. Result: the Sahara/Arabian/Gobi/Australian/Kalahari deserts, the Amazon/Congo jungle, boreal taiga across Canada/Siberia, temperate forests, the Sahel/pampa/steppe grass, and Greenland/Himalaya ice all land exactly where Earth's are — a genuine Earth-clone look, verified in full-world renders and the in-app sketch. F-1 of the flagship plan. Land fraction still 29.0%; check/build/smoke green. |
| ⚙️ World generation in a Web Worker + flagship-Earth plan (batch 71) | **Shipped** (owner: "go ahead with the web worker" + laid out the flagship vision: era-based fantasy re-skins of Earth). New `worldgen.worker.ts` runs rivers + settlements + roads OFF the main thread; `world.astro`'s creation flow posts the cfg to it and mints entities/anchors from the serialisable result (routes, lake paint, settlement nodes, bridges), with an **inline fallback** if a module worker can't start. Vite configured for ES-module workers (`worker.format:'es'`) so the worker can code-split its lazy Earth-grid import. Verified in-app on a **full Earth-size** world: the main thread held **~60 fps (241 frames / 4 s, max frame gap 17 ms)** through generation instead of freezing 6–8 s, the world created cleanly (429 entities), no fallback, no errors. Also captured the owner's flagship direction in `docs/everdeep/FLAGSHIP-EARTH.md` — the coordinate contract (any point ↔ real lat/lon) that the era layer hangs on, the two "looks like Earth" gaps (modelled biomes → bake a real land-cover raster; world-tier coarseness), and a build order for era skins (real biomes → region lookup → era schema + one era → generated kingdom profiles → optional drift-follow), with the open decisions (base-seed-only vs drift-follow, which eras, fantasy tone, licensing) flagged. check/build/smoke green. |
| 🔬 Earth at native 2048×1024 grain — fix eroded coastlines (batch 70) | **Shipped** (owner: "for earth generation I want you to plan land, elevation, etc at the lowest possible grain… doing it at the high altitude created strange landmasses and a fractured earth — for example most of Florida is missing"). The Real-Earth grid was baked at **512×256** (~78 km/cell), and downsampling averaged thin features into the sea — **Florida, the Caribbean, small islands, and narrow peninsulas eroded away**. Re-baked at the source's **native 2048×1024** (~19 km/cell, 16× the cells): Florida returns (a 17×17-cell window went from ~2 to 38 land cells), and Cuba/Hispaniola/the Antilles arc, the Mediterranean, the Red Sea, Madagascar, Japan, Indonesia, the Great Lakes and inland seas all resolve crisply — the "fractured earth" is gone, area-weighted land fraction is a near-perfect **29.0%**. The 2 MB grid is stored **gzip-compressed** (~370 KB) in `earthData.ts` and inflated with `DecompressionStream` (browser + Node ≥18), so `ensureEarthGrid` is now async but the chunk stays lazy (~500 KB, Earth-only). Also **doubled the coast-distance field to 720×360** so the bathymetry shelf no longer reads in blocky steps, **eroded tiny island specks** (coast-field land components < 4 cells) so the deep ocean stays clean, and added subtle sea-floor mottling. Verified: full-Earth render shows accurate crisp coastlines; in-app a created Earth (half-size) shows 223 named settlements + roads on a detailed Africa/Mediterranean with no errors; generation timing held (~2 s rivers + ~6 s roads). check/build/smoke green (land-fraction assertion now 29.0%). |
| 🏙️ Populate worlds — settlements + roads in the browser (batch 69) | **Shipped** (owner picked "Populate: settlements + roads" from the next-steps menu). New module `settlements.ts` ports the bake's geographic civilisation pass to the browser: given a world's terrain + drainage (the `HydroGrid` now exposed from `hydrology.ts`), it places **capitals/towns/villages where the food and water are** (foodshed cart-score, coast/river magnetism, farthest-point-spread capitals per continent) and **forges a road network** between them — a highway MST over each continent's capitals, roads spurring towns to the network, dirt tracks to villages (with the isolation rule), and **bridges where a road crosses a great river**. Roads use the bake's cost model (hug water, seek low ground, share bridges, forge a hard pass when the low road costs 4× more), but reworked into a goal-directed **A\*** (admissible straight-line heuristic) so it runs in-browser; the highway MST precomputes pairwise paths (was O(n³)). Settlements persist as lightweight named entities (type + founding reason + population, materialisable later) with city/town/bridge anchors; `world.astro` runs it at creation behind a "Building roads…" label and merges the road routes with the rivers. **No one settles the ice:** a temperature gate (`temperatureNorm`, exported) keeps towns off Antarctica/Arctic beaches (which classify as GOOD land before the climate check). Verified: an Earth-size world gets ~380 named settlements (36 capitals, 155 towns, 191 villages) and ~310 roads (highways/roads/dirt) + bridges in ~6 s, on all inhabited continents' coasts and rivers with the ice left wild; in-app a created Earth shows 235 entities (half-size) with pins + roads and no errors; procedural worlds populate too. New `smoke-settle.mjs` locks the invariants (populated, roaded, bridged, none-on-ice, procedural-too) into `npm run smoke`. Groundwork for the queued "regenerate roads when the user adds a settlement." check/build/smoke green. |
| 🧭 Earth orientation + endorheic sinks + moisture runoff + bathymetry (batch 68) | **Shipped** (owner: "yes to both the sink pass, moisture, and ocean bathymetry" + "why is earth upside down and flipped?"). **Orientation:** the map paints larger world-y lower on screen, and the Earth sampler had +y=north, so Earth rendered north-at-the-bottom (a pure vertical flip; longitude was already standard). Fixed by mapping +y to the grid's south — the Arctic is now at the top, Antarctica at the bottom, verified in the preview and the live map. **Moisture-driven runoff:** river runoff for earthlike/real-Earth worlds now reads the actual precipitation field (`runoffAt` — Hadley bands, rain shadows, coast asymmetry, frozen→0) instead of a per-biome bucket, so discharge tracks real rainfall — the **Congo and Amazon join the Ob as grand rivers** (only the Ob qualified before) and the major-river hit rate rose to 11/20. Noise worlds keep the biome table. **Endorheic sink pass:** arid closed basins no longer overflow to the sea — a dry filled depression is marked terminal so rivers **end at the lake** (the Volga dies in the Caspian) rather than cutting an impossible channel across the desert; wet basins still spill (Great Lakes → St Lawrence). Terminal lakes pond in the Caspian/Aral/Chad/Balkhash interiors. **Ocean bathymetry:** the flat sea floor gains a modelled shelf→slope→abyssal depth profile (with ridge undulation) from distance-to-coast, so lowering the sea dial exposes the shelf as land bridges and the deep ocean reads as deep (30→62% land at the low extreme now). `smoke-hydro.mjs` gained an endorheic assertion; check/build/smoke green; `HYDRO.md`/`GEOGRAPHY.md` updated. |
| 🌊 Hydrology reality-check vs real Earth (batch 67) | **Shipped** (owner: "a real check of our hydrology rules will be to determine if our river generation overlaps realistically with Earth's real rivers and lakes, and if not how can we make the rules more realistic?"). Used the batch-66 Real Earth map to score generated rivers/lakes against Earth's actual ones (project each mouth/lake to lat/lon, compare to ~20 major rivers + ~10 major lakes; full write-up in `docs/everdeep/HYDRO.md`). **Finding: routing was already excellent (19–20/20 real rivers had a generated counterpart) but grading and weighting were wrong** — the Amazon graded as a mid-size river, NO river reached "grand," and the "grand" rivers came out in **Antarctica** (near-flat runoff let big cold continents out-accumulate the tropics on area alone). **Four rule fixes in `hydrology.ts`:** (1) **percentile width tiers** — rank river hexes by accumulation and cut by percentile instead of fixed absolute cutoffs, so the largest drainage on any world is always grand (resolution-independent; fixes "0 grand rivers"); (2) **area-weighted runoff** — multiply each hex's rain by cos(latitude) to undo the equirectangular grid's polar area inflation so the tropics compete fairly; (3) **steep latitude-realistic rain with frozen≈0** — wet tropics dominate (jungle 3.0) and frozen ground / deserts contribute ~nothing (snow 0.02, tundra 0.08, desert 0.04), so ice caps stop spawning rivers; (4) lower stream threshold for healthy density under weighted runoff. **After:** 20/20 real rivers routed, top-3 drainages are the **Amazon/Ob/Congo** (the real discharge kings), **3 grand rivers** (was 0), **zero rivers on the Antarctic ice**, **7/10 major lakes** matched from pure depression-filling. New `smoke-hydro.mjs` locks these invariants into `npm run smoke`. Logged limitations (grid resolution caps exact discharge ranking; no true endorheic basins — Volga reaches the sea instead of the Caspian; rift lakes under-captured) as future work in HYDRO.md. Vessia (baked separately) is unchanged; the live generator that every new world uses got the fixes. |
| 🌎 Real Earth world type + sea-level/drift shifts (batch 66) | **Shipped** (owner: "I would love an actual earth recreation, where if that map is chosen it stays earth unless a seed value is provided, and see values shift earth by slight margins like continental drift or sea level rise or lowering"). New **"Real Earth" landform** that samples a baked ~512×256 equirectangular Earth elevation grid (ocean 0, land ramps by real height; public-domain NASA/NOAA topography via three-globe, credited on the About page) instead of the procedural blobs — so the map IS Earth: recognizable continents, the real Andes/Himalaya/Rockies, actual coastlines. The grid is a **lazy ~170KB chunk** (`earthData.ts`, its own build chunk) loaded via `ensureEarthGrid()` only when an earth world renders; `terrain.ts` samples it (bilinear, longitude-periodic) in `elevationAt`/`landMask` when `landform==='earth'`, and earth implies the earthlike climate model so the real elevations drive real rain shadows / dry interiors / latitude bands (polar ice caps read as snow, not mountain; shelves from the batch-65 coast field). **Canonical unless seeded:** a blank seed is the real Earth untouched; any seed applies *slight* shifts — **continental drift** (a 1–4% low-frequency warp bending coastlines) and a small **sea-level** jitter. The water slider becomes a **sea-level dial** (50 = today): raise it and coasts flood into archipelagos, drop it and the continental shelf surfaces as new land (ice-age land bridges). New-world UI relabels accordingly (🌎 option, "Sea level"/"today", model row hidden, "blank = the real Earth" seed hint) and snaps the dial to today on selecting Earth. Verified end-to-end: canonical land fraction 30% (Earth ≈29%); sea dial 75→14%/30→43% land; a seed flips ~11% of coastal hexes; renders in-app as the hex map with rivers on the real coastline; terrain smoke green (3 new earth assertions); genVersion-1 field untouched. |
| ⛰️ Distance-to-coast field + plate-edge orogeny — G-3 (batch 65) | **Shipped** (owner: "continue with distance to coast"). Builds the primitive the GEOGRAPHY.md plan was blocked on since batch 60 and uses it to finish the last Earth-worldgen stage. New `coastDistAt(cfg,x,y)` in `terrain.ts` — a cached multi-source **BFS flood from the shoreline** over a coarse (360×180, ~69mi cells) world grid — returns any point's signed distance to the sea (positive inland, negative offshore) in O(1) after a **~230 ms one-time build** (0.57 µs/lookup after). The coastline is taken from the landmass elevation WITHOUT the orogeny term, breaking the circularity (orogeny consumes the field; a range rising at a margin doesn't move the coast). Earthlike orogeny then **tilts the mountain belt toward continental margins**: strongly lift the coastal band so an active margin's belt crosses into a **cordillera** (the Andes/Cascades sitting ~100–300mi behind the shore) and gently relax the deep interior (collision ranges — Himalaya, Rockies — still belong). It only nudges belts already near their threshold, so coasts where the belt is low stay flat — active margins, not a mountain ring. Verified across 6 seeds: with the tilt on, the 100–300mi coastal band rises from **~0% to 2–4% mountains** while overall cover holds (a redistribution, not an inflation); a before/after biome render shows new coastal ranges dotting the north/west/south shores with the interior range preserved. Gated on `climateModel === 'earthlike'` behind a `__setG3` test seam; the frozen genVersion-1 field never reads the field (terrain smoke green — a new plate-edge assertion averages over 3 worlds; latitude bands + coast asymmetry intact). The distance-to-coast field is reusable and **also unblocks** the queued "near-water town gets a dirt road to the waterline." This completes the whole GEOGRAPHY.md staged plan (G-1…G-4). |
| 🧭 Earth-like coast asymmetry — G-4 (batch 64) | **Shipped** — the fourth and last GEOGRAPHY.md climate stage. An ONSHORE prevailing wind carries marine moisture inland, so a windward coast drinks the ocean's air and the leeward coast stays dry: westerly temperate belts soak their WEST coasts (Pacific NW, western Europe), the trade-wind tropics their EAST coasts. Reuses the rain-shadow's first upwind sample — sea just upwind ⇒ a marine-moisture bonus. Verified: in the temperate belt the windward (west) coast reads **96% wet forest vs 15%** on the leeward (east), with the latitude bands (rainforest equator, 20–30° desert belt, 60–70° boreal taiga) otherwise intact. Gated on earthlike; terrain smoke green; noise worlds untouched. That leaves only **G-3 (plate-edge orogeny)** outstanding in the Earth-worldgen plan, blocked on a real distance-to-coast field (batch 60 note). |
| 📊 Performance review #1 (batch 62) | **Shipped** (owner: "it is time for our first performance review"). Full measured review in `docs/everdeep/PERF.md`. **Headline: the app is in good shape.** Initial `/world/` load is **70 KB gzip / ~500 ms**; the 11 MB of generator registries are **code-split and lazy** (loading the example + map pulls nothing more — baked entities carry their own statblocks); the interactive map pans at a steady **60 fps** with no jank; heap is a modest **22 MB**. The real costs are all one-time: load-example ~1.1 s (4.9 MB fixture), map first-open ~1 s (layer building), and the new-world hydrology trace ~2.5 s on an Earth-size map (guarded by the "Tracing rivers…" label). Identified hotspot: **earthlike `biomeAt` was 2.7× the noise cost** (rain-shadow re-sampled elevation and land-mask). Applied the top fix — `biomeAt` now computes elevation and `landMask` once and threads them into the climate functions, cutting earthlike biome cost **~19%** (12.3→9.9 µs) and hydrology gen ~6%, terrain smoke still green, noise path untouched. Recommendations logged for later: prefetch common registries on idle, defer non-critical map layers off first-paint, hydrology in a Web Worker, trim the demo fixture, and a CI perf budget. |
| 🏞️ Rivers on every new world (batch 61) | **Shipped** (owner: "on new world generation rivers are never created — please ensure that is part of world generation"). The rivers, lakes, roads, and towns in the shipped Vessia example are all baked by the Node script (`continent-vessia.mjs`), so a world created in-app had only biomes — no watercourses. New pure module `hydrology.ts` ports the river tracing to the browser: priority-flood drainage over the world-hex grid, rain accumulation, the stream→river→great→GRAND width ladder, meandered polylines, deltas at the sea, and filled-depression lakes — the same algorithm and constants as the bake (batch 59). `world.astro` now runs it at creation and pins the result into the new plane's `routes` + `biomePaint`. Verified: a fresh Earth-size world traces **567 rivers (incl. a grand river) and 359 lake hexes in ~2.5 s**, a quarter-size one in ~170 ms; the map shows them immediately. Because the trace blocks the thread a couple of seconds on a big map, the Create button flips to "Tracing rivers…" and yields a frame first, so it never looks hung. (Roads and settlements remain bake-only for now — a much larger port; rivers were the ask.) `astro check`/build green. |
| 🌎 Earth-like landmass spread — G-2 (batch 60) | **Shipped** — the second GEOGRAPHY.md stage, continuing the owner's "earth-style (landmass design and spread) worldgen." For an `earthlike` world the continents now **cluster into one hemisphere** (a ~55% longitude band) with a great open ocean opposite — a land hemisphere and a water hemisphere, the way Earth divides — and **taper toward the poles** into the temperate/tropical mid-latitudes rather than spacing evenly around the cylinder. Coasts gained a **continental shelf**: submerged land near a coast reads as shallow shelf water before the deep-ocean drop, a lighter ring around every continent. All gated on `climateModel === 'earthlike'` (blob-cache key now carries the model), so the frozen genVersion-1 noise field is byte-identical — the terrain smoke stayed green (poles cold, tropics warm, tiers agree). Verified in the new-world sketch: clustered land, an ocean hemisphere, shelf-ringed coasts, the batch-54 climate bands intact. Still ahead: G-3 plate-edge orogeny, G-4 coast asymmetry. |
| 🌊 Hydrology — grand rivers, deltas, more tributaries (batch 59) | **Shipped** (owner: "with the river updates I would like to re-investigate hydrological features such as deltas, many small tributaries joining together before the next tier of river, and great rivers, perhaps Nile/Amazon-level grand rivers if enough add together"). The drainage model gained a fourth **GRAND** width tier (class 4) that runs only where the continent's largest system accumulates (>2,500 of ~6,000 max rain-units) — Vessia has exactly one, **The Sundering Run**, drawn ~1½ miles bank-to-bank, named and page-flagged as a grand river (a Nile/Amazon). Great and grand rivers now **braid into a delta** where they meet the open sea — the trunk splits into a fan of narrower distributaries (2 for a great river, 3 for a grand), **22 deltas** across the coasts. The stream threshold dropped (RIVER_MIN 30 → 22) so **more headwater tributaries** appear and gather down through the tiers (river hexes 3,577 → 4,386; polylines 491 → 635). Width classes were decoupled into absolute accumulation constants (60 river / 150 great / 2,500 grand), and the map renderer, water-hex fill, atlas line, and flow-markers all handle class 4. Verified: the grand river reads broad with a visible confluence and downstream chevrons; distributaries fan at the coast. Vessia 471 entities; `astro check`/build green. |
| 🌉 Brook Reach's three bridges + inland-town networks (batch 58) | **Shipped** (owner: "Brook Reach and its three bridges are an abomination of civil engineering — why three bridges in such a small space? At most two… but why out then in then out. Inland towns should only be possible through networks of small towns and their roads, or their connection to a small town or bigger on a waterway"). (1) **Fewer, shared crossings**: near a river town, roads now strongly converge onto ONE crossing — sharing an existing bridge is nearly free (0.3) while a fresh crossing is dear (6 bridgeable / 13 wild, up from 1.5/3.5/10), and the "share radius" widened to 45 mi; recrossing the same river is all but forbidden over 85 mi (+80). The river **meander was also calmed** (±0.26/0.3 → ±0.20/0.22) so the drawn channel stops weaving back and forth across a road. Brook Reach fell from **3 bridges to 2**, the river reads as a clean diagonal, and the audit still shows **0 unbridged crossings** continent-wide (48 crossings, 50 bridges). (2) **Inland towns join a network**: an isolated town now runs its track to the nearest existing ROAD (the web of small towns and their roads) rather than a lone node in the wilderness — it exists as part of the network, or via the network to a waterway town. Still 0 isolated; Vessia 528 entities. The deeper channel geometry — clean perpendicular crossings, and the hydrology below — is the rivers pass, still queued. `astro check`/build green. |
| 🛖 Victorian road reach · water-magnetism · free wagon bridges (batch 57) | **Shipped** (owner: "how far were people willing to walk and make roads for? Towns in the middle of nowhere with no road even to the nearest town doesn't make sense; if a town is near water it should have a dirt road to that water; towns should have greater magnetism to be centred on the water; towns centred on water have a free wagon-capable bridge"). Three connected bake fixes. (1) **No roadless town**: an isolated small town falls back to a rough dirt trail to its nearest neighbour however far (a cart-day apart was the Victorian norm, but even a frontier hamlet had a trail); every settlement of 1,000+ always earns a track; and a dirt track blocked by a great river (dirt never bridges, batch 46) is **upgraded to a bridgeable road** instead of abandoned. The 44 isolated towns → **0 isolated**; roadless-within-8-mi fell to 7 inland edge cases out of 105 (0 coastal). (2) **Water-magnetism**: `siteSpots` gathers all valid sub-hexes of a site and prefers a **water-adjacent** one, so towns centre on the bank or shore rather than drifting inland. (3) **Free wagon bridge**: a town sitting on a great river gets a wide wagon-capable bridge at its feet for nothing — 13 baked — half the reason the town is there. Fuller connectivity cascaded into more roads/bridges/river-towns (431 → 534 entities), reading as a properly-settled continent; the region map stays legible. `astro check`/build green. |
| 🧭 Travel-method toggles + a readable banner (batch 56) | **Shipped** (owner: "the travel banner is still unreadable and the manual enabling/disabling of travel methods is not available — I want to see what a path looks like if only walking and boarding is allowed, or horseback and portals, etc."). The old banner crammed the base march, every additive mode, road%, fords, and five buttons onto ONE line. It's now three tiers: a **title** line (🧭 ≈ miles · N stops · ＋ stop · ⚙ custom · ✕), a row of **method-toggle chips** (🥾 walk · 🐎 ride · ⛵ boat · ⚡ portal · ✨ custom — cyan when on, dim when off, portal auto-dimmed when the network is dark), and one clean **result** line (🥾 on foot Xd · 🐎 mounted Yd · road%/fords/afloat, with go-buttons that charge the days and move the party). Ticking a chip re-plans on exactly that subset and persists with the world — verified: turning off ⛵ boat re-routed a 2,700 mi water trip to the 2,160 mi road route reading "100% on roads", proving both the toggle and the batch-55 road-speed bonus. Portal jumps already only connect AT portal hexes (batch 37), so ⚡ routes through the portals. `astro check` clean; full build green. |
| 🚦 Roads faster & safer · river flow markers · upstream cost (batch 55) | **Shipped** — the first slice of the owner's travel/river feedback. (1) **Roads are a real advantage** (owner: "roads need a significant speed bonus, and perhaps a safety bonus… the route takes the river then straight through the plains; ideally it would follow the road"): overland paces rebalanced so a made road roughly TRIPLES cross-country pace (highway 24→42, road 20→34, dirt 16→22 mi/day) while the wild slowed a touch (grass 16→14, forest 12→10, mountain 6→5) — the speed IS the safety margin, and a traveller now cleaves to the road instead of bushwhacking the plains. (2) **River flow markers** (owner: "rivers need visible direction markers that look like nice wave designs but are subtle arrows"): soft pale chevron-waves run down every navigable river pointing the way the current flows (polyline order is source→mouth, so downstream is forward), sparse and low-contrast — a hint, drawn only when the river is comfortably on screen. (3) **Upstream costs** (owner: "going upstream is an extra cost, unless near a major city"): an ordinary hull can now be poled/towed against the current at 10 mi/day — slower than walking the bank, so upstream is a genuine cost — while a 50k+ city's magically-driven boat still makes 48 mi/day, so the fast way up a river is to start from a great city. `astro check` clean; full build green. STILL QUEUED from this feedback (below): travel-method toggles + a readable banner + portal-hex path forcing; Victorian road reach (no roadless towns, near-water towns get a dirt road to the water); town water-magnetism + free wagon bridge; and a hydrology pass (deltas, tributary tiers, grand rivers). |
| 🌍 Earth-like climate — G-1 (batch 54) | **Shipped** (owner: "a pass to make sure our biome and geography building is representative of earth… I want the world to feel natural"). The first stage of the GEOGRAPHY.md plan, and the biggest payoff: an `earthlike` world drives moisture and temperature from real geography instead of pure noise. Moisture = **Hadley-cell latitude bands** (wet equator, dry ~30°, wet temperate ~60°, dry poles) − **rain shadow** (a range upwind wrings out the rain, drying its lee) − **continentality** (deep interiors are dry) + a little texture noise; temperature drops a touch faster with latitude and cools in continental interiors. A latitude sweep confirms the Earth profile: rainforest at the equator (64% jungle at 0°), the great **desert belt at 20–30°** (78–81% desert — the Sahara/Arabia/outback latitude), temperate grass+forest at 40–50°, **boreal taiga at 60–70°**, tundra/snow at the caps — where the old noise model scattered deserts at every latitude. Exposed as an opt-in world-creation toggle ("🌍 Earth-like climate", default on for new worlds); the frozen genVersion-1 field is untouched (`climateModel` absent/`noise`), so Vessia and every existing world are byte-identical. The new-world sketch shows the banding live. `astro check` clean; full build green. Still ahead in GEOGRAPHY.md: G-2 landmass spread (clustered land hemisphere, continental shelves), G-3 plate-edge orogeny, G-4 coast asymmetry. |
| 🏔️ Forge roads through passes · river towns at bridges · Earth-style worldgen plan (batch 53) | **Shipped** (owner: "roads should be planned along low routes first, but if a hard road through rough terrain saves more than 4× the time, a road through rough terrain will be forged — cities on opposite sides of mountain ranges"; "add river towns anywhere roads converge before a bridge, and near bridges, for maintenance and the farming nearby"; "a pass to make sure biome and geography building is representative of earth… ensure an earth-style (landmass design and spread) worldgen is in the plan"). Three parts. (1) **Forge roads** — a road takes the LOW route first (batch 52), but `bestRoad` now also computes a FORGED route that drops the elevation-avoidance terms (it pays only real terrain time) and, when going the low way round takes **more than 4× the forged time**, cuts the hard pass straight through the range. Dirt tracks never forge (they stay low and cheap). On Vessia's seed no capital pair needed a pass (highest road elevation 0.691, roads stay in the lowlands — the low-ground preference holds and forging doesn't over-fire); the capability is there for a range that splits two cities. (2) **River towns at bridges** — a small river town (150–1,800 souls, tagged `river-town`/`bridge-town`) grows at every bridge with no settlement within 12 mi: bridge wardens, a ferry house and inn, and the bottom-land farms the crossing waters, its page noting when the roads converge there. 7 baked on Vessia (Waste Gate, Reposestead, Householt…). (3) **Earth-style worldgen** — recorded as `docs/everdeep/GEOGRAPHY.md`: an investigation of where the current field departs from Earth (moisture is pure noise → no Hadley-cell deserts at ±30°, no rain shadows, no continentality; evenly-spaced blobs rather than a clustered land hemisphere with continental shelves; free-floating mountain belts rather than plate margins) and a staged delivery plan behind a NEW `genVersion` "Earthlike" world type (G-1 climate rewrite, G-2 landmass spread, G-3 plate-edge orogeny, G-4 coast asymmetry) so existing worlds never move. `astro check` clean; full e2e green; crossings 13, **0 unbridged**; Vessia re-baked to 424 entities. |
| 🛣️ Smarter road design — low ground, follow water, share bridges (batch 52) | **Shipped** (owner clarifying batch 51's #2: "that change was meant to make the design of roads more intelligent — reshape them to follow waterways, lower ground usually, reduce the number of times crossing rivers, and perhaps increase road junctions right before a bridge due to how expensive they are"). The road A* cost surface (`roadPath`) reworked on four axes. (1) **Low ground** — a hex's cost now rises with its elevation above sea, and CLIMBING costs extra on top, so a route follows the valleys and contours instead of going over the shoulders of the hills. (2) **Follow water** — the bank discount deepened (a hex beside a river/lake/coast travels at 0.8× vs 0.85×), so roads court the old waterway corridors more strongly. (3) **Fewer crossings** — a fresh wild great-river crossing costs 10 (was 7) and a bridgeable one 3.5 (was 2.5), so a road commits to one bank far more before it pays to cross. (4) **Junctions before a bridge** — every committed road registers the great-river crossings it spent, and a later road that must cross is pulled toward an existing crossing (1.5 vs full price within 28 mi), so roads MEET just short of a bridge and share it — the way real networks knot up at a river town. Result on Vessia: distinct crossings 15 → 13, **0 unbridged**, and **5 of 12 bridges now carry 2+ roads** (shared junctions). Also fixed a latent gap the audit surfaced — a dirt track could slip a great-river crossing past the hex-level A* (the drawn river meanders into a neighbour hex); such a track is now detected on the drawn line and dropped, since dirt never bridges (batch 46). Vessia re-baked to 422 entities; full e2e green. |
| 🌾 River hexes, farm variants, place reasons, every crossing bridged (batch 51) | **Shipped** (owner: "rivers are still disappearing at lowest zoom; roads are still crossing without using a bridge; river hex types may be necessary; one of the recent updates killed all the farm tiles, bring those back and add variants — cattle farms in plains, sheep farms in hilly areas that border grass and hills; a lot of the logical reasons for a place to exist are not recorded in the places file — ensure the details are added on why the place exists, what its generated type is; the random rolling will be modified later to add details, not to change types"). Four fixes. (1) **River hex types** — a hex the river actually FILLS now classifies as `water` (batch 44 did this for great rivers at the finest tier; now any navigable river whose real width ≥ the hex span, checked to the mile tier). So a river reads as a continuous chain of blue water hexes as you zoom in and **never disappears between the drawn ribbon's coarse (~8-mile) points** — the deep-zoom vanish is gone, and the river is terrain, not just a line. (2) **Every navigable-river crossing is bridged** — the bridge de-dup used to collapse crossings of *different* rivers that fell within 15 mi of each other, leaving the second unbridged; now it only merges repeat hits on the *same* river within 6 mi (a meander's curve artifact). Audit: 15 crossings, **0 without a bridge** (was several); 11 → 14 bridges. (3) **Farmland restored + variants** — the tilled-field wash was near-invisible (16% alpha); it's now a strong golden cropland with clear furrows, PLUS two new kinds keyed to the land: **cattle pasture** (a green wash, a rail fence, grazing beasts) on the open grass/savanna plains, and **sheep walks** (pale wash, cream fleeces) where hills border the grass — the settled country reads as a patchwork, not one texture. (4) **Why a place exists** — every baked settlement now records its generated TYPE (`fields.settlementType`: royal seat · regional city · river port · coastal town · market town · frontier town/holding · farming/fishing village · granary town · mining/lumber/quarry/stock/salt camp · coaching stop) and opens with a "Why here" paragraph naming the logical reason it grew — a great-river crossing, a coast, a river to barge food, the crown's heartland, the frontier edge, and the biome economy. 201 of 232 settlements carry the paragraph (the granary/industry/waystation towns already carried their own reason), 230 carry the type field. The founding reason is a FACT the later random roll only ADDS detail to — it never changes the type. `astro check` clean; full e2e green; Vessia re-baked to 418 entities. |
| 💰 Luxury access feeds settlement wealth (batch 50) | **Shipped** — the wealth half of the resource arc (FOOD.md §5, the batch-48/49 "next"). A settlement sitting ON or BESIDE a luxury resource (gems, spice, furs, the coin metals — the `luxury` flag from batch 49) trades that surplus for coin, and coin buys imported food; so its urban food cap **relaxes ×1.25** — a luxury market grows past its own foodshed (Venice on spice, Bruges on cloth). Such a settlement is tagged `prosperous`, carries a `prosperity` field naming the good, gets a "Prosperity" page paragraph ("the spice of these lands passes through its warehouses… wealth that lets the town outgrow its own foodshed"), and on the map wears a richer gold ring + a small gold ✦ beside its pin (both footprint and glyph forms). Applies to capitals too (a rich seat grows larger). 8 prosperous seats baked in Vessia — the two horse-country capitals (Brook Reach, Clearing Landing), spice towns (Shackhaven, Oldcliff), a fur market (Oldwell). `astro check` clean; full e2e green; Vessia re-baked to 416 entities. STILL QUEUED in the arc: explicit building/structure bonuses for resource proximity; smelter towns where ore meets a navigable river; the world keeps generating after creation (new finds, feeder towns sprouting along new roads). |
| ⛏ Industrial support towns + luxury/strategic/both classes (batch 49) | **Shipped** (owner: "continue, however, please note that I will eventually like a random resource table or have the ability for users to add their own custom resources, and similar to travel, identify whether it is a luxury or strategic resource (or both)"). Two parts. (1) **Resource classification** — `ResourceDef` now carries BOTH `strategic` and `luxury` booleans (a good may be either or both): coin metals (copper/silver/gold), salt, furs, and war-horses read as "strategic & luxury", iron/timber/stone/cattle stay purely strategic, gems/spice/pearls/dyes/ivory/amber purely luxury. The hex tap-info and the badge ring already read the class (green strategic · violet luxury · amber both); a new `resourceClass()` helper names it. (2) **Industrial support towns** — the non-food analog of the granary towns (FOOD.md §5). Each kingdom scans its world hexes for resources that carry an `industry` (mine ⛏, quarry 🪨, lumber camp 🪓, stock town 🐎, salt works 🧂), and plants up to 3 small camps (300–3,000 souls), one per industry kind, **strategic goods first**, on the resource hex's OWN terrain — a mine in the mountains, a lumber camp in the forest, a salt works on the desert strand, a stock town on the grass (verified: Oldbridge salt works sits in the Sea of Dust, Northwell/Springsford stock & lumber on grass/forest). Tagged `industry`/`industry-<kind>`, each page names its trade and the resource's class and bends its trade toward the capital; the map draws the camp with its trade's tool. 15 baked across Vessia (3 per kingdom). Recorded to the plan + FOOD.md §5: a **user-defined / random resource table** slots straight onto the existing `ResourceDef` shape (add `{kind, glyph, label, strategic, luxury, aff}` and `resourceAt` picks it up), with a strategic/luxury/both chooser mirroring the travel-mode editor — queued, unscheduled. `astro check` clean (0 errors); full e2e green; Vessia re-baked to 411 entities. |
| ⛏ Strategic & luxury resources (batch 48) | **Shipped** — the resource arc the owner queued (FOOD.md §5). New pure `resources.ts`: a deterministic per-WORLD-hex field (like the density ghosts, stored nowhere) where the land carries iron, copper, silver, gold, gems, quarried stone, timber, furs, salt, spice, horses, cattle, pearls, dyes, ivory, amber — each keyed to biome (mountains/hills → ore & gems, grass/savanna → horses/cattle, jungle → spice/timber/dyes/gems, desert → salt/copper/spice, coast → pearls/dyes/amber, taiga/tundra → furs/ivory). ~8.5% of land hexes carry one; strategic goods (iron, timber, horses, salt, stone) that arm and build a realm are ringed green, luxuries violet. Rendered as small badges under a "⛏ resources" legend toggle (revealed past the continental view) and named in the hex tap-info ("🐎 Horses", "💎 Gems (luxury)"). Verified: 8.4% coverage, biome-appropriate distribution, render and tap-info consistent. Next in the arc: industrial support towns keyed to resources (mining camps, lumber towns, smelters), and building/settlement bonuses for proximity. |
| 🧭 Multi-point trips, relief overlay, feet, legend width (batch 47) | **Shipped** (owner batch, 2026-07-14). (1) **Multi-point trip planning**: the travel banner gains a "＋ stop" button — tap another place and the route re-plans leg by leg (`planLegs`/`combinePlans` sum every mode across all legs), the banner shows "(N stops)" and the running totals, and each waypoint draws a numbered amber dot. Marching advances by the whole trip. (2) **Elevation overlay**: a "⛰ relief" layer toggle tints the whole map hypsometrically (deep blue → green → tan → brown → snow), reading elevation directly — ocean, lowland, the Belovwyn Mountains in brown. (3) **Feet under a mile**: the scale bar (and hex labels) count in feet/metres below one mile instead of "0.1 mi" — "1000 ft" at deep zoom. (4) **Legend never overflows**: long realm names ("The Verdant Throne of Reef Crossing") truncate with an ellipsis inside the panel width, full name on hover. Found and fixed a latent init crash — the claim legend used `escT` before its declaration (TDZ), collapsing the whole map; `escT` hoisted. Full e2e battery green. |
| 🛤️ Dirt tracks don't bridge, rivers everywhere, roads chain (batch 46) | **Shipped** (owner batch, 2026-07-14). The "extremely bridge-offensive" road at Clearing Landing was a DIRT track weaving across a great river 5 times. Fixes: (1) **Dirt tracks never cross a great river** — they keep to their own bank (roadPath `{dirt}` mode treats great-river hexes as impassable), so a dirt connection that would need a bridge simply isn't built; and **dirt roads never earn a bridge** (bridge placement now only intersects highways + roads). Great-river crossings fell 54 → 16, dirt crossings to ~0. (2) **Recrossing the same river within 50 mi is all but forbidden** (+40 on the second entry, tracked per-path) — no road dances back and forth; the worst road now crosses 4 *different* rivers over its span, never one twice. (3) **Bridge ownership by distance** (owner): a bridge belongs to a town only within 20 mi (100 mi for a million-soul metropolis); a lonely crossing takes a plain "River …" name (7 of 11 bridges). (4) **Roads chain through towns** — each town joins the network at its nearest existing road when that beats the run to the capital, and the biggest towns wire up first, so roads connect many places instead of spoking radially. (5) **Roads meander** a touch to follow the lie of the land. (6) **Water on every landmass** (owner: "why does only the main continent have water?") — rivers and lakes now form on all continents, not just the settled one (270 → 491 river polylines, 56 → 75 lakes). (7) **Rivers obey elevation** — a meander that would push the channel uphill is pulled back toward the low ground. Full e2e battery green; Vessia re-baked to 399 entities. |
| 🌉 Roads court the water, cross it seldom (batch 45) | **Shipped** (owner: "roads that repeatedly cross water shouldn't happen unless terrain forces it… reward travelling near water… reduce the number of water crossings… nearer to cities that can afford bridges, or if the water width is very small… roads that cross water to end up on the same side in less than 5 miles should be punished"). `roadPath` reworked: (a) a hex BESIDE water (river, lake, or coast) travels at 0.85× cost — roads now court the banks, the old travel corridors; (b) crossing a great river costs 7 in the wilds but only 2.5 where a 10k+ city can bridge it (precomputed `bridgeableGR` set), so the few crossings concentrate near towns; (c) a small stream is forded at 0.7 — the little bridges small communities manage. Bridges fell 27 → 23 (fewer, better-sited crossings), and a wilds crossing (Clearing Landing Old Bridge) renders as a single clean perpendicular crossing. The river MEANDER was also calmed (±0.42/0.5 → ±0.26/0.3): the old swing wove a river back and forth across a straight road, reading as many crossings; the geometric double-back count that remains is a curve-vs-curve intersection artifact the 15-mi bridge dedup already collapses to one bridge each. Full e2e battery green; Vessia re-baked to 422 entities. |
| 🗺️ Hex size labels, elevation key, great-river ribbons (batch 44) | **Shipped** (owner batch, 2026-07-14). (1) **A selected hex names its own size**: the span (e.g. "500 ft", "6 mi", metric-aware) is drawn beneath the selected hex in the same gold as its border. (2) **Elevation in the tap-info**: clicking a hex now reports a rough altitude from the terrain field (0.5 = sea level → "≈ 2,817 ft", or "shallows"/"deep water") alongside the hex span (⬡ 500 ft). (3) **Elevation key in the legend**: a hypsometric gradient strip (sea · lowland · highland · peak) explains that terrain brightness reads elevation. (4) **Great-river ribbons** (owner: "great rivers should have a minimum width, stop shrinking after zooming far enough, their real width… natural variation… hexes under rivers should be water if water covers the whole hex"): once a river's real width (great ≈ 1 mile, river ≈ 900 ft, stream ≈ 260 ft) clearly beats the atlas line, it draws as a FILLED ribbon with a soft bank edge and gentle seeded width variation down its course — never a hairline up close, never vanishing when zoomed out (a visible floor). And at the finest tier, any hex a great river fully covers now classifies as WATER (tap-verified: a mid-river hex reads "water · shallows"), checked against a cheap spatial grid of river points. Recorded to the plan: more clickable tier iterations (0.1→6→60 mi is too few shelves) and a full hex-art improvement pass. Full e2e battery green. |
| 🛣️ Roads, bridges, river mouths, waystations (batch 43) | **Shipped** (owner batch, 2026-07-14). Three bake fixes. (1) **Bridges never orphaned**: batch 41's hex-cell collection stranded 28 of 33 bridges off the smoothed roads (the world-hex A* cells diverge from the drawn polyline). Now bridges are placed by intersecting the DRAWN road polylines with the DRAWN great-river polylines — a bridge sits exactly on a visible crossing. Audit: 27 bridges, 0 more than 1 mi from a road segment, and all 48 road×great-river crossings have a bridge within 16 mi (the batch-41 +4 great-river occupancy penalty keeps roads off the channel so the intersection is clean — owner: "two roads cross rivers, but only one has a bridge"). (2) **Rivers reach the water's edge** (owner: "rivers stop a few hexes away from bodies of water… some rivers continue for multiple hexes into the ocean"): a river now descends from its mouth to the FIRST true water hex (elevation below the shoreline, following the drainage or the lowest neighbour toward a strait/island) and stops; and every meandered course is clipped at the point-level waterline so the midpoint-displacement tail no longer fans out to sea. Overshoot: 32 → 0; short mouths: down to 8 legitimate inland/endorheic termini. (3) **Waystations** (owner: "a road travelling 1000 miles between two large settlements is not realistic… more logical stops"): 120 coaching-inn hamlets strung along the highways and roads, roughly one every ~120 mi where no real settlement stands, each a generated hamlet tagged `waystation` and sitting on the road (Solacedale on the highway). Longest empty road stretch fell from 1,000+ to 334 mi (a wilderness crossing), with the density-ghost field filling the smaller hamlets between — the Victorian load without a 100k-row world (FOOD.md §5b). e2e battery green; Vessia re-baked to 432 entities. |
| 🔎 Map readability + tier consistency (batch 42) | **Shipped** (owner batch, 2026-07-14). (1) **Ghost names higher contrast**: every unwritten/abandoned label now draws a dark rounded halo (3px stroke) under a bright face, so "unwritten hamlet" reads cleanly over grass, forest, or desert — was 55%-opacity cream, near-invisible. (2) **Minimize the legend**: a –/+ button on the legend title collapses the whole panel to a corner tab, unblocking the map. (3) **Hide all ghosts**: a "ghosts" checkbox in the legend Layers toggles the entire density-ghost layer off. (4) **Grain feeder towns surfaced**: the 14 baked `farm-town` granary towns rendered with the generic town pin and were invisible as feeders — they now wear a 🌾 wheat sheaf so the country that FEEDS a city reads at a glance (owner: "I do not see the large city feeder towns for food, and grain cities"). (5) **Cross-tier water consistency** (owner: "a hex that is completely water at one tier is basically an archipelago at lower levels… looking for consistency between tiers"): measured the cause — deep water was already island-free (0 land children), but 27% of shallow-water world hexes sprouted land at region tier. Fix in `hexInfoAt`: inside a water parent, land is held to an ADAPTIVE shoreline (the deeper the parent, the higher the bar), and any island that survives but sits ALONE in open water (all six neighbours water) is dissolved — real connected coastline stays, scattered specks do not. Render-only; the frozen terrain field is untouched. Recorded to the plan: the WORLD PAINTER feature, generator-variability revisit, and the full Victorian continental-load model (FOOD.md §5b — ~6 metros / ~40 cities / ~7,000 market towns / ~100k villages on an America-sized continent; a road-stop every ~15–45 mi). |
| 💧 Water logic passes — lakes, rivers, bridges (batch 41) | **Shipped** (owner: "ghost towns and ruins shouldn't be placed in lakes; rivers shouldn't run through lakes; if a road crosses water it needs a bridge, otherwise it stays on one side of the water until it gets to a bridge"). Four consistency fixes. (1) **Ghosts/features off lakes** (runtime, mapView): `densityGhostAt`/`densityFeatureAt` now read the painted biome via `hexInfoAt` and return null on a water hex — the terrain noise may say grass, but a painted lake (from the bake's filled depressions, or a GM's brush) is the truth. The ghost caches clear when terrain is painted, so a freshly brushed lake empties immediately and erasing one lets the ghosts return. (2) **No baked site on a lake** (bake): `siteSpots` rejects any candidate whose world hex is a painted lake (new `onLake`/`worldKeyAt` helpers) — every settlement, granary, landmark, and bridge now avoids the water; audit shows 0 anchors in lakes. (3) **Rivers stop at the shore** (bake): `emit` breaks a river polyline at any lake hex — the river vanishes INTO the lake and RESUMES at the outflow, never drawn across the surface (0 of 15,774 river points fall in a lake). (4) **Roads bridge water, or stay on one bank** (bake): lakes are impassable to `roadPath` (routes around); a great (navigable) river's channel hexes are dear to occupy (+4), so a road keeps to the bank and only steps onto the water to CROSS — and every such crossing becomes a bridge, collected as the roads are laid (`bridgeCells`). Small streams still ford cheaply. Vessia re-baked: 33 uniquely-named bridges (up from 8), the Brook Reach highway crosses the great river exactly at its bridge while a second road follows the far bank. e2e: 6 invariant checks; full battery green. |
| 🚜 Settled-country hex art + portal sparks (batch 40) | **Shipped** (owner: "if more hex art types (such as farmland, city, ruin) are not in the plan, please add those"). The land now remembers its people. New art-mark layer keyed by REGION hex, rebuilt when anchors change: (1) FARMLAND — every settlement of 300+ clears the farmable country around it (radius by population: metro 3 hexes, city 2, village 1 — the batch-38 foodshed made visible), drawn as a wheat wash under short parallel furrows, each patch ploughed on its own bearing; forest near towns reads as cleared fields, exactly as history had it. (2) CITY — 25k+ city hexes read as a huddle of gabled rooftops instead of grass. (3) RUIN — ruin-icon landmarks draw ONE broken wall with a fallen corner and rubble at region size regardless of drawing tier (fields and roofs tile; a ruin is a single structure — the first cut tiled 36 tiny walls per hex and read as nothing). Fields/roofs tile down through mile and locale tiers so the farmland belt persists as you dive. (4) ⚡ portal sparks: 500k+ metropolis pins (disc or footprint form) wear a small violet spark while the network is lit; it douses with the legend toggle. All under the existing "terrain art" layer checkbox. Deferred with the owner's directive: dungeons/interiors → the SPACES epic (Phase E), designed as one logical set. Verified: Brook Reach heartland reads as a farmed patchwork, Beach Gate granary sits in tilled country, Courtyard Keep shows its broken wall; full regression battery green. |
| ➕ Additive travel modes + rivers at depth (batch 39) | **Shipped** (owner: "unsure how to mix and match travel modes, but perhaps there is an additive method… foot is the fastest road path, foot and portal fastest road path to the portal city, add boat add that as calculation"). Exactly that: the travel banner now plans each mode SUBSET on its own A* — the base line is the honest overland march ("on foot 88 days · mounted ~48.4"), then "+⛵ 34.2d" (boats allowed), "+⚡ 0.1d" (portals allowed), "+⛵⚡ Nd" (both, only when it beats either alone) — each option shown only when it actually improves the previous tier, plus the custom method's own line. March buttons follow: 🥾 march / 🐎 ride charge the overland cost, "⛵⚡ swift" charges the all-modes mounted cost, ✨ charges the custom plan. BUG FIX (owner: "if you go to the smallest level, rivers are not visible anymore"): the seam-wrap guard in drawRoutes compared SCREEN distance, so at deep zoom every river/road segment looked like a seam crossing and was skipped — the test now runs in world feet (travel overlay fixed the same way), and rivers gained real WIDTH up close (great river ~3,600 ft, stream ~250 ft, scaled by zoom, floored at the atlas line) — a great river is now a proper blue ribbon at the 1-mile scale. e2e: b36/b37 updated to the additive banner, full battery green. **Noted for the art queue** (owner): more hex art types — FARMLAND (tilled-field strokes around settlements and granary towns), CITY (rooftop clusters at city hexes), RUIN (broken-wall marks at ruins/abandoned ghosts) — joining the existing forest/mountain/hill/desert/grass/tundra glyphs. |
| 🌾 Foodsheds — farmland, game, fishing drive city placement (batch 38) | **Shipped** (owner: "investigate farmland to support people… how many farm towns would be required to support large cities, natural game calculations for different biomes, fishing opportunities… all considered when planning city placement… towns incredibly scarce in areas not habitable or farmable without excess shipped in" + follow-up: "the greatest concentration of food capability should have the biggest city; ties allow multiple big cities but not closer than 100 miles"). The INVESTIGATION is docs/everdeep/FOOD.md — real numbers (5–8 farmers per city dweller; France-1300 ~80 persons/sq mi; an ox eats its cargo past ~60 mi; water freight 60× cheaper; a 100k city rests on 10–20 market towns and hundreds of villages; Christaller central-place spacing + Zipf rank-size + urban shadow SUPPORT the owner's 100-mile rule). The MODEL in the bake: per-hex food yield (grass 220k … snow 0, ×2.5 on rivers, +25k fishing on coasts), foodshed = cart-shed (hex+ring) + half-weight barge-shed along 12 hexes of connected waterway, city cap = 15% of shed. Consequences, all live in Vessia: capitals are SITED by hunting the kingdom's richest foodshed (all five now sit on river/coast junctions — Brook Reach, Wharf Landing…), the metro roll goes to the kingdom with the best shed, oversized rolls are cut to capacity (the audit log says so), town pops clamp to their local shed, 50k+ cities keep 100 mi apart (closest pair: 130 mi), barren kingdoms plant fewer settlements (want scales with mean yield) and barren-biome sites require a waterway to barge food in. Ghost density: barren biomes halve their chance and cap at village size — fishing/oasis communities only. GRANARY TOWNS: 1 baked per 250k of capital pop (14 in Vessia), tagged farm-town, planted on the shed's best hexes, each page stating how many real market towns it represents. Also: world-wide unique settlement names (retry bands on reserved seed indices; was three Highgates). e2e: full battery green. |
| ⚡ Portals + per-terrain custom methods (batch 37) | **Shipped** (owner: "add an optional magical portal between towns with greater than 500000 people" + "for custom entries, add modifiers on whether the mode can travel over certain land types, road only, water only, air and at what speed for any type it is possible to travel over, so time calculations and route calculations can work"). (1) Every settlement of 500k+ keeps a standing portal (Vessia: Highshore ↔ Hauntstead): the travel A* gains jump edges at 0.1 days between any two lit portals, the heuristic stays admissible by also bounding through the nearest portal (without that fix A* would cut corners and miss jumps), portal legs draw as violet dots and count zero ground miles, and the banner reports "⚡ N portal(s)". OPTIONAL as asked: an "⚡ portals" toggle in the legend Layers persists `settings.portalNetwork` and re-plans any measured route live — dousing the network turned the 0.1-day jump back into an honest 172.6-day march in the e2e. (2) Custom methods grew real terrain modifiers: `settings.customTravel` now carries per-class speeds (road / land / water / air, mi/day; unlisted classes are impassable; legacy bare "Griffon 96" = land+road), and `planCustom` routes them on their OWN A* — a Roc (air 120) flies straight over ocean and mountain (38d where foot takes 172.6), a Barge (water 40) hugs rivers and sea and answers "no route" between inland metros, a road-only wagon is confined to the network; ground-bound methods still ford, flyers and swimmers don't; custom methods step through portals like anyone. The custom route draws beneath the main plan in pale violet, and the ✨ march uses the custom plan's real days. ⚙ prompt syntax: "Roc air 120", "Barge water 40 road 12". e2e: 13 checks. Someday: portal glyphs on the map pins themselves. |
| ⛵ Boats + custom travel methods (batch 36) | **Shipped** (owner: "increase the likelihood of coastal and river cities offering boat travel if large enough upstream (50k+) or if downstream 10k+. upstream offering some sort of magical propulsion other than rowing. (both faster than horse)" + "add custom travel speed entry, so magical beasts and magical wagons and any other custom methods can be afforded also"). (1) Ports are inferred, not authored: any anchored settlement of 10k+ sitting on a river hex or beside open water offers downstream/sea passage; 50k+ cities also run the magically-driven upstream service. (2) `travel.ts` A* now searches (hex, mode) states — walk / boat / magic boat: boarding or beaching costs 0.2 days, downstream rides the current at 60 mi/day, upstream is 48 mi/day and only reachable from a 50k+ port, open water sails at 60 — all faster than a horse's ~44 land-only mi/day on a highway, as ordered. River flow direction comes from the baked polylines' stamp order. Boats can beach onto ANY walkable shore (you don't need a port to get off, just to get on). (3) The banner grows "⛵ Nd afloat", mounted time now = land legs × 0.55 + boat legs unchanged (a horse rides the ferry like anyone), and boat legs draw BLUE in the route overlay vs amber land legs. (4) Custom methods: ⚙ on the banner prompts "name mi/day" (e.g. "Griffon 96") → persists as `settings.customTravel`, shows "Griffon ~Nd" (land at custom pace + the same boat legs) with its own ✨ march button that pays the clock. e2e: 9 checks — Newshore→Port Rest goes 16.4 of 17.9 days afloat, beats mounted 17.2, and the griffon (16.8) beats the horse. Queued: flying methods that ignore terrain (straight-line A*) someday. |
| 🚩 The party tracker + rough roads (batch 35) | **Shipped** (owner: "add a 'party is here' tracker, the user can move this at their will for teleportation and other instant travel, and the walking/riding system is still in use also; adding hills and mountains to terrain cost would be awesome"). (1) `plane.party = {x, y}` (schema'd): a red pennant with a ground ring drawn above everything on the map. The 🚩 tool moves it ANYWHERE with one tap — teleportation, gates, and ships answer to the GM, so even open water is a legal stand. (2) The walking/riding system integrates: when the flag is planted, 🥾 travel starts FROM the party's camp automatically ("from the party 🚩: tap the DESTINATION"), and accepting a march/ride moves the flag to the destination while the clock pays the days — teleport is free, walking costs, exactly the split asked for. Persists through reload. (3) Terrain cost: hills (12 mi/day) and mountains (6 mi/day) were already in the wild-country model since batch 33 — the real gap was that ROADS ignored the country they cross; now a mountain road runs at 60% pace and a hill road at 85% (passes crawl, hill roads wind). e2e: 8 checks. |
| Phase D slice 3 — timeline, stamps, and marches that cost days (batch 34) | **Shipped.** (1) 📅 stamp: every date-type field gets a "📅 today" button that writes the formatted world date AND a machine-readable `<key>Day` for sorting. (2) 🕰 timeline: a modal beside the date chip lists every stamped event sorted by day, split by a "— today —" NOW line (future events italic), undated events counted with a nudge to stamp them; rows navigate. (3) The march: the 🥾 travel banner gains "🥾 march +Nd" and "🐎 ride +Nd" buttons — accepting the journey advances the world clock by its real cost (new onAdvanceDays callback), closing the loop between roads, rivers, fords, and the calendar. e2e: 7 checks (stamp writes 14 Harvestmoon Y3; timeline shows and divides; a 27-day ride lands on 11 Mistfall). |
| Phase D slice 2 — travel time (batch 33) | **Shipped.** New pure module `travel.ts`: A* over world-tier hexes with classic overland paces (highway 24 mi/day, road 20, dirt 16; wild country by biome — grass 16 down to mountain 6; open water impassable), FORDS cost half a day unless a bridge anchor stands near (the batch-21/22 leftovers land: rivers finally cost something to cross, bridges finally pay for themselves), all seam-wrap-aware. The map injects live lookups, so painted terrain and edited routes are respected. UI: 🥾 in the map tools — tap a start, tap a destination, get "≈ 2,980 mi · on foot 158.5 days · mounted ~87.2 (55% on roads, 2 fords)" with the route drawn as a dashed overlay; ✕ clears; water start/destination answers "no overland route". Debugged en route: mile totals crossing the wrap seam counted a world-circumference step (fixed wrap-aware); heuristic wraps too. e2e: 8 checks incl. pixel-scanned water refusal. Next Phase D slices: timeline view over event `when` fields, session-log day stamping, travel that ADVANCES the clock ("march there: +7 days"). |
| Add-here dialog + place-on-map (batch 32) | **Shipped** (owner: "writing in a new item does not save it to the map; the add here should open a window of options including custom and icon picker, if a type can still pick icons and random generate from that type's tables"). Investigation: add-here itself anchored fine at every tier — the real gap was pages born OFF the map (tree adds, generator saves) having no way onto it. Both directions fixed. (1) "+ Add here" now opens a dialog: kind picker (Settlement/Landmark/Building/Region/Person/Custom, tier-appropriate default), icon picker per type (10 landmark glyphs, settlement classes, full set for Custom), name field with 🎲 that random-generates from that type's own tables WITH full ancestor context (realm law, biome, size) — the rolled statblock becomes the page body; open-water hexes warn in the dialog and auto-mark waterborne (replacing the old confirm+prompt pair). Regions 🎲 name themselves through geoNames. (2) Every unpinned page now shows 📍 in its title bar: click → the map opens in one-shot placement mode ("tap a hex") → the tap anchors the page there (waterborne-aware). Also fixed two type errors that had slipped into earlier batches unnoticed (astro check output misread). e2e: 9 checks on the dialog + placement; map/water suites updated to drive the dialog. |
| Phase D opens — the world clock (batch 31) | **Shipped**, first Phase D slice. `world.calendar = { day }` (absolute day counter, schema formalized): twelve 30-day months, 360-day year, month names Deepwinter → Longnight, seasons derived (winter/spring/summer/autumn with a glyph). Toolbar date chip: ‹ › » step −1/+1/+10 days, clicking the date opens a set-date prompt ("day month year"), everything persists with the world and survives reload. Event pages already carry a `when` date field that can now reference real world dates. Next Phase D slices queued: travel time along the road network (fords as obstacles — the batch-21 leftover), a timeline view over event `when` fields, session-log day stamping, and seasonal map dressing (snow line creep) someday. |
| M1 leftovers — viewport hash + metric toggle (batch 30) | **Shipped**, closing the M1 checklist. (1) URL-hash viewport: the map camera writes `#map=x,y,ppf` (debounced, replaceState — no history spam while panning); reloading or sharing the link restores the exact camera AND auto-opens the map view. Entity deep-links (`#e_…`) coexist untouched. (2) Metric toggle: the scale-bar unit is clickable — mi ↔ km flips `settings.unitsDisplay` (Q21: display-only, storage stays feet), persists with the world, and survives reload. Both verified by a 6-check e2e. M1 is now fully closed: tree↔map merge, add-here, focus, terrain dials, ghost density, biome paint, viewport hash, metric toggle. |
| M1 — biome paint + lakes made visible (batch 29) | **Shipped.** `plane.biomePaint` is the sparse terrain-override store: 'tier:q,r' → biome, resolved inside `hexInfoAt` with finest-paint-wins (a painted world hex re-biomes everything inside it; region/locale paints carve detail back out) — so fills, terrain glyphs, coastline strokes, hex-tap info, and the add-here water check all follow automatically. UI: a 🖌 beside the Terrain legend header enters terrain-paint mode — the biome swatches become the brush palette (click to switch), zoom picks the hex size (world/region/locale), erase restores nature, every stroke persists. And the payoff for batch 22: the bake re-derives fill levels from the drainage tree and PAINTS the filled depressions as water — 56 lake hexes now render as visible lakes with coastlines instead of living only in the flow math. Vessia re-baked; schema gains plane.biomePaint. Noted: the older unwired `plane.hexes.biome` slot should merge into biomePaint someday; runtime ghost density still reads noise, not paint. |
| M4 — label decluttering (batch 28) | **Shipped.** Every map name (political labels, geographic labels, footprint names, pin labels) now routes through ONE placement queue per frame: higher-priority labels place first, and anything that would overlap an already-placed name stays silent that frame — the pin still draws, and the name returns as soon as zoom gives it room. Priority: political owners 90 > world-tier geography 80 > metropolises 75 > promoted pins 70 > 250k cities 65 > region geography 60 > 50k towns 55 > 1k villages 45 > the rest. Found-and-fixed in review: `promoted` used to short-circuit the population ladder, so the hand-promoted Bram's Hollow was silencing the 1.48M capital sharing its hex — priorities now take the max of both rules and Highshore wins its name. The Asylum-Hollow-style capital collisions and stacked river names are gone. |
| M2 — painting the borders (batch 27) | **Shipped** (owner, batch 10: "border should be adjustable in the case of a war campaign and the GM is moving borders as the party succeeds or fails"). Every realm row in the legend has a ✏️: click it and the map enters paint mode for that crown — dragging claims hexes at the realm's own tier (kingdoms paint world hexes, compacts/sects paint region hexes — the batch-10 "sub-powers at lower tiers" for free), an erase toggle cedes them back, and one-crown-per-hex annexation strips painted hexes from whoever held them. The wash and borders redraw live under the stroke; ✓ done (or the ✏️ again) exits; every stroke persists through a new onClaimsEdited callback → save(). Paint strokes never pan the map or select pins; pinch-zoom still works mid-session. e2e: painted The Dusk Veil 1→18 region hexes, ceded 5, survived reload. Not yet: painting for factions with no existing claims (needs a "claim territory" entry point on the faction page — queued), undo beyond erase. |
| Tier-aware slots — pages agree with the map (batch 26) | **Shipped** — the last of the batch-15 ancestor-context trio. The audit found 60 of 95 baked settlements contradicting themselves (the 1.48M capital's own statblock said "Town · pop. 1271"): every generation path defaulted the settlement composite to size 'town' and rolled a fresh population, ignoring what the world already knew. Now scale is a fact of the roll: the composite accepts size (incl. hamlet) + population overrides; the BAKE passes city/town/village with the real Zipf populations computed first; MAP GHOST materialization passes the density ghost's own cls + pop (the page that appears is the place the ghost promised); TREE ghost suggestions draw a seeded Zipf size spread (5 village / 4 town / 1 city) from the slot path so preview === keep; and blocksToEntity extracts size tag + population from the statblock at birth (like race/gender for persons), so map icons and LOD tiers always match the page. Re-baked Vessia: 0 size mismatches, 0 population mismatches across 95 settlements. |
| Globe fidelity + pole controls (batch 25) | **Shipped.** (1) Fidelity: equirect texture 512×256 → 1024×512 at a finer octave, BILINEAR sampling in the orthographic projector (the limb stops pixelating), and the w≥2 rivers are composited onto the texture so the great rivers read from orbit. (2) Auto-spin is optional: it stops the moment you grab the globe ("your globe now"), and a ⏸/▶ spin button in the tools toggles it; both it and (3) appear only in globe mode. (3) Poles: vertical drag tilts the view ray around the screen axis (clamped ±83°), so you can roll either pole into view; the rotation axis draws as dashed stubs with N/S markers that brighten when their pole faces you, and a "⊙ equator" button re-snaps the tilt to level. City anchors ride the tilted sphere correctly. Known cosmetic: equirect sampling pinches at the exact pole (meridian convergence) — noted for a possible polar-cap blend later. |
| Space-view art + calmer legend (batch 24) | **Shipped.** (1) "I'd love the art to continue to the top level… seeing a dense forest from the space view is very enticing" — the glyph gate dropped from 12px to 6px hexes, and tiny hexes draw ONE mark each (one pine, one peak, one arc) at the floored glyph size, so a forest reads as a dense mass of tiny pines from the continental fit view and the whole map reads hand-drawn from orbit. (2) Legend reorganized into collapsible sections — Terrain (folded by default; the biome swatches were the bulk of the noise), Realms (each kingdom row still click-to-hide, dimming when hidden), and Layers (pins/roads/rivers/labels/terrain-art checkboxes). Section headers toggle with ▸/▾. |
| Hex art from the alpha + interactive legend (batch 23) | **Shipped, same day as noted.** Note 1 (owner): "the beautiful hex art in the original hex map alpha tour — forests and hills and mountain icons were extremely nice to see." It was prototyped in the alpha but never ported to the shipped renderer — now it is: per-hex terrain glyphs (pine triangles for forest/jungle/taiga, snow-capped peaks for mountains, rolling arcs for hills, dune curls for desert, grass tufts, tundra stones), seeded per hex, drawn from ~13px hexes up with a size floor so small base hexes still read as dense texture (the alpha's 3-tier ladder never shrank below that; the 8-tier ladder does). Gated behind a legend toggle. Note 2 (owner): interactive legend — every claim-owner row is now clickable (hides that realm's wash, border, AND map label; row dims), plus layer checkboxes for pins / roads / rivers / labels / terrain art. Verified: rivers toggle drains ~6k river pixels from the canvas, claim rows dim and hide, all regressions green. |
| Rivers, second half (batch 22) | **Shipped.** (1) Priority-flood drainage: every depression fills to its spill point and the drainage tree comes from the fill order — pits become lakes that overflow, and every river reaches the sea instead of dying in a hollow. The network quadrupled honestly: 2,073 river hexes → 144 watercourses → 265 polylines with a real width pyramid (134 streams / 99 rivers / 32 great rivers) and 2 funded bridges (Highshore Great Bridge, Harborstead Stone Bridge). (2) Recursive midpoint-displacement meanders (3 levels, amplitude halving) — gently curved at world zoom, properly sinuous at region zoom. (3) River-aware ghost density: mapView stamps region hexes within ring 1 of any baked river polyline once per mount, and `ghostSettlementAt` takes a riverBoost (+0.18 hab) so unwritten hamlets crowd the banks the way the coast already did. Verified on the map: kingdom borders now visibly trace river courses (the batch-10 ask), and the continental fit view reads as a hydrographic atlas. Vessia regenerated; kingdoms re-rolled names since capitals now sit on rivers (Highshore, Newshore, Keep Gate, Westmarket, Hauntstead). Still queued from G3: fords as travel obstacles (needs Phase D time), lake PAINT (needs the M1 biome-paint store). |
| Rivers (G3 first half) + climate sanity notes (batch 21) | **Shipped.** Note 1 (owner): biomes must stay sensible per worldgen — colder climates toward the poles. Verified and now GUARDED: smoke check 5b proves the tropical belt has 0.0% frozen biomes (alongside the existing poles-are-cold check); deeper climate audit (rain shadows, altitude cooling, ocean-moderated coasts) queued. Note 2 (owner): rivers — shipped now. Downhill flow tracing over the world-hex grid (each land hex drains to its lowest neighbor, biome-weighted rain accumulates down the flow tree); where flow ≥ threshold a river runs. 488 river hexes → 72 watercourses → 98 seeded-meander polylines (kind 'river', width classes w1 stream / w2 river / w3 great river; stems trace mouth→source along the biggest inflow, tributaries join at junctions, courses reach the sea). Map: w≥2 rivers visible at every zoom (thin atlas lines when far), streams reveal at road zoom. Three great rivers NAMED (The Sundering Run, The Starlit Run, The Umbareth) with mid-course labels + tree pages. Rivers shape the world: territory growth pays a ford toll so borders settle along rivers; roads pay a bridge toll; capitals and towns prefer riverbanks (siteSpots preference); dirt-track spurs can no longer snap onto rivers. Bridges where roads cross rivers near paying towns (≤40mi of 5k+, ≤80mi of 50k+): Brewerydale Great Bridge, a landmark page + 🌉 pin. Schema: routes gained optional `w`. Remaining G3 half queued: region-tier river detail (meander refinement between tiers), lakes from endorheic pits, river-aware runtime ghost density, fords as travel obstacles. |
| Ancestor context — realm law + ground truth (batch 20) | **Shipped** (owner: "each town having their own government, unlikely… the kingdom will have a government style, unless it is anarchy"; "water landmarks ending up in the plains"). Generation now knows where it is: `ctxFor` in the wiki resolves context from the parent chain and passes it into every composite run (tree ghosts, Keep, ad-hoc generate-child, map ghost materialization). (1) Realm law: `lawOfTheLand` walks ancestors for the first `fields.government`; settlements inside render "X — the realm's law runs here" instead of rolling their own (anarchic realms excepted — there every town rolls its own, marked "the realm holds no writ here"). Kingdoms in the bake roll a government once (short style name in `fields.government` on crown + kingdom-lands region, full resolved writeup as "The Law" paragraph on the crown page; kingdom log prints the law column). Faction/region kinds gained a suggested `government` field so GM-made realms feed the same inheritance. (2) Ground truth: `biomeOfEntity`/`biomeAtXY` feed the landmark composite a `biome` opt — biome groups (dry/cold/wood/open/high/shore/wet) each add a Setting line, biome-impossible site picks (waterfalls in the desert) reroll away, and the statblock meta names the biome ("Landmark · desert"). Vessia regenerated (267 pages): 95 settlements inherit their crown's law; laws this bake: Authoritarian, Communalism, Republic, Theocracy, Feudalism. Tier-aware slots remain queued. |
| Pencil art, "finished study" engine (batch 19) | **Shipped** after a 3-round style lab (owner reviewed proof sheets each round; picked D "soft charcoal" → asked for more line art → picked E "refined line art" → asked for more variants → picked F "finished study"). portraits.ts rebuilt on the F engine: strokes are filled tapered ribbons over a Catmull-Rom spine with seeded wobble, displaced through an feTurbulence filter; heavy silhouette / thin interior plane lines; individual brow hairs; eyes with tear ducts, lash flicks, double-lid creases, iris spokes + upper shadow arc + catchlight; nose as planes with nostril curls; lips with corner darks and a philtrum; dark combed hair mass (strand lanes with shine bands) over soft charcoal form shading, jaw cast shadow, corner vignette. All 18 race arts rebuilt (pointed/fin/cat ears, tusks 2 sizes, horns, halo rays, kalashtar gem, goliath markings, shifter fangs+sideburns, simic gills, dragonborn ridges+scales+slit pupils, birdfolk beak+feathers, catfolk muzzle+whiskers, warforged faceplate+rivets+ring pupils, bald skull silhouette, redesigned riveted helm). Same recipe format (v1+v2 parse), same layer counts/weights/aliases, same API — locks and reroll-all untouched. Verified: 36-portrait proof sheet, all three locations e2e, map/water/newworld regressions. Queued (owner): three-quarter-turn poses (lab variant H) once true feature-level perspective is worked out. |
| Race + gender locks, reroll-all, pencil tier (batch 18) | **Shipped**: every generated person now carries race AND gender as facts — `blocksToEntity` extracts them from the statblock meta into `fields.race`/`fields.gender` at save time, so wiki person pages lock the portrait to them (race and sex chips hidden when known, same as the earlier gender lock). "Reroll all with the locks" in all three locations: 🎲 look chip on wiki person pages (`rerollLook` — rerolls every cosmetic layer + morphs, race/sex held), 🎲 new-face button on the Quick NPC portrait and on the Full NPC statblock card (fresh face salt; race/sex re-read from the roll itself so they cannot drift). Style tier 4 — pencil pressure: every non-sharp stroke now renders in tapered segments (fine entry, weighted middle, lifted exit, like a real pencil), pupils are filled marks instead of outlines, and a tonal pass lays 5 broad faint side-shading strokes (cheek shadow, chin, neck, shoulders) under the linework. Verified with a 36-portrait proof sheet + live e2e in all three locations. |
| Portraits everywhere + full race table (batch 17) | **Shipped**: 18 distinct race arts covering ALL 29 races in the NPC race table (birdfolk for aarakocra/kenku, catfolk for tabaxi, warforged plate-and-grille, dragonborn family for lizardfolk/kobold/tortle/yuan-ti, orc family for bugbear/hobgoblin, aliases for changeling/genasi/drow/high-elf/wood-elf). Signature features per race: horns, beaks, whiskers, fins, gills, radiance, stone-markings, tusks, plate seams. The Quick NPC and Full NPC statblock pages now sketch the rolled person automatically — seeded by the roll, updating on rerolls, sex from the roll's own (male/female) marker (seeded when the race is sexless). Style tier 3: seeded life details — age lines (~26%), old scars (12%), earrings (18%), freckles (12%), crown hair shading, page vignette. |
| Portrait variety expansion (batch 16) | **Shipped**: sex types (male/female forms — softer jaw, lashes, fuller lip, thinner brows, no beard; heavier ridges/tusks for males) LOCKED to the person's gender field when set (sex chip hidden); four body builds (slim/average/broad/stout, race-weighted) that re-drape every garb; three new hairstyles (ponytail, crown braid, shoulder waves) + a gown; parametric face morphs (eye spacing, nose length, mouth width) seeded per person. ~2.3M discrete combinations per race before morphs; v1 recipes still parse. |
| Better portrait art | **Shipped (v2 pack)**: strokes now flow through Catmull–Rom smoothing instead of jointing; rebuilt anatomy (lids/iris/pupil eyes, tapered brows, nostril noses, philtrum mouths), volumetric hair silhouettes with flow lines, form shading (cheek/jaw hatching), draped garb with real shoulders. Same recipe format — stored portraits stay valid. Owner may still commission pro art later. |
| Kin webs | **Shipped** (`buildKinWeb`): every person can grow 1–2 generations UP (parents, often a grandparent — some already gone), siblings, 1–2 friends, and an enemy — REUSING the available cast preferentially (an existing local becomes the sibling/friend/enemy). Bidirectional relations + a "kith and kin" note page with everyone linked. 👪 button on person pages; baked for all five rulers and Maren Vosk (2–3 reused people per web). |

### §6.9 Decision register — batch 128 (owner, 2026-07-16): the loop's marching orders

*Purpose: the owner cleared the outstanding open questions in one sitting so a
**loop of agents** can run the remaining true-v2 work unattended. These decisions
**supersede the `⬜ Open` / "Still open" markers in §5** for the items named. The
operating rules and the ordered backlog follow the table — that backlog IS what
the loop reads each iteration.*

| # | Question (was open) | Decision | Lands in |
|---|---|---|---|
| D1 | Loop's opening focus | **Generator realism** — the `GENERATORS-REVIEW.md` P0→P2 roadmap **+** the standalone-rollable audit. Highest user-visible payoff, well-specified, lowest autonomous risk. | §5 generators queue |
| D2 | #31 sailing model fidelity | **The full honest model** — a sailing polar (speed vs angle-to-wind) + current advection → *anisotropic* cost in the travel A*; sails tack upwind slowly, bare rafts drift, powered craft near-symmetric. **Not a hard wall.** Wind + current are deterministic seed-derived fields, mapped as a toggleable layer, byte-identical on rebake. | §5 #31 |
| D3 | Nested-spaces (SPACES) epic | **Design now, build light.** Write the one-logical-set architecture first (city ⊃ district ⊃ building ⊃ floor ⊃ room; dungeon ⊃ level ⊃ chamber), then ship slices 1→2 (route dungeon/lair/ruin/cave feature kinds to the composites; city interior as tree/pages over existing kinds + ghost slots) **before** the square-grid interior renderer (slice 3). | §5 nested-spaces |
| D4 | #3b Earth subrealms | **Own region (6 mi) tier** — crisp internal borders, accepting the larger data + perf cost. From a *curated* federal list (US/CA/AU/BR/IN/MX/DE/RU/CN/AR…), never the naive most-subdivided heuristic (the GB:232-districts trap). | §5 #3b |
| D5 | Endless-world persistence | **Pure-ghost for now.** Endless stays browse-only (ghosts don't persist); the Earth-size bounded world stays the default. The auto-materialize + storage-budget/pruning epic is deferred. | §5 world-extent |
| D6 | #7a rivers ending on land | **Both fixes.** Basin-aware restore of the famous traced trunks (drop only a trunk whose basin an authored river already covers — avoids "two Obs") **and** downstream-extend the remaining dead-end tributaries along the drainage grid to water / a bigger river. | §5 #7a |
| D7 | Lost flagship item #3 | **Closed / unknown.** Unrecoverable; stop tracking a numbered gap that may not exist (batch 87's Himalayas/desert-snow fix shipped regardless). | §5 item #3 |
| D8 | Portrait art | **Conditional upgrade.** If a genuinely-better **free/open-source** layered-portrait pack exists (CC0 / CC-BY — OpenGameArt/itch, one consistent style across races, under the site's credits discipline), adopt it. Otherwise keep the notebook-pencil bust-builder and **expand it further** (more races, hair, features, headwear) so faces stop repeating across a continent. Agents evaluate first, then choose. | v2.x portraits |
| D9 | Loop git autonomy | **Commit + push each green batch.** Per CLAUDE.md: `git fetch`; run `check` + `validate` + `smoke` (+ `e2e` for `world.astro`/`mapView.ts` changes); rebake Earth byte-identically when a change moves the world (commit the fixture WITH the change); then commit & push to `main` with the next free batch number. Renumber on collision and re-run the gate on the combined tree. | operating rule |
| D10 | v2.5 scope | **Park until launch.** Finish Phase B/C launch work (generators, sailing, map fidelity, SPACES-light) before touching World Painter / custom kinds / user tables. | §3 v2.5 |
| D11 | Track checkpoints | **Auto-advance.** On finishing a track, roll into the next priority without waiting; stop only on a red gate or a genuine blocker (ambiguous design fork, missing owner input, external dependency). | operating rule |

**The ordered backlog the loop follows** (auto-advance per D11; a track exits only
when its smoke/e2e invariants are green and, where relevant, Earth is rebaked):

1. **Track 1 — Generator realism (D1).** Work `GENERATORS-REVIEW.md` P0→P2 in
   order: additive core + promote meaning to fields → signature/biome tables,
   NPC role+tiering, dungeon/lair composites → encounter/quest variety +
   per-field dice. In the **same** batches, close the **standalone-rollable
   audit** (§5): everything worldgen knows (node-type locking, widened name
   pools, foodshed) must also be rollable on its own tool page. *Exit:* the
   audit is empty and the P0/P1 items ship with smoke coverage.
2. **Track 2 — Sailing #31 (D2).** `windField` / `currentField` built
   browser-side like `riverField`/`roadField` (deterministic, byte-identical
   rebake); latitude-banded Earth-like default deflected by coasts; travel A*
   boat edges gain the polar+current anisotropic cost; map gains a toggleable
   wind/current layer. *Exit:* a `smoke-*` asserts field determinism + asymmetric
   crossing cost; an e2e shows the layer and a re-planned boat route.
3. **Track 3 — Map fidelity.** #7a river tails (D6, both fixes), #3b subrealms
   (D4, own-tier + curated list), #13 zoom-band artifacts (investigate first),
   tier-fixed hex sprites (perf), #30c finer road grain. **Each gets a
   smoke/e2e invariant** so it can't regress silently — the structural lesson of
   §5's road saga.
4. **Track 4 — SPACES-light (D3).** The one-set design doc first (new
   `docs/everdeep/SPACES.md`), then slices 1→2. The renderer (slice 3) only after
   the design is written and reviewed.

**Standing rules for every batch** (CLAUDE.md + this repo's scar tissue):
- **One implementation** — `v2/src/everdeep/*.ts` is the single source of truth; a
  bake only loads data + calls shared modules; the browser gets everything the
  bake does.
- **Every new table stays standalone-rollable**; **every invariant goes in a
  `smoke-*.mjs`**, never a `console.log`; **draw and hit-test share one
  predicate** so they can't drift (`anchorVisible`, batch 127).
- **No `rid()` / `Date.now()` in a generation path** — ids from the seed path,
  stamps from `opts.stamp` (CONTRACTS §1/§3). If a change moves the world,
  **rebake and commit the fixture with it**.
- **Write the owner's request down verbatim when given** (the item-#3 lesson).
- **Open questions don't block the loop.** When a batch hits a fork that needs
  the owner, append it to **Open questions** (bottom of this file) — dated, with
  context — and move on to the rest of the queue (D11 auto-advance).

## 7. End-to-end sequence with exit criteria

```
Phase 0  Design freeze              ██        exit: schemas + seed & role contracts
         (+ connected-gen design)             written, 10 scenarios walked, prototyped
Phase A  Wiki core                  ████      exit: build a 30-entity world by hand,
                                              export/import round-trips, full Drive sync
Phase B  Generation + story webs v1 ███████   exit: tavern→keeper→district→city chain
                                              from ghosts in <2 min; a generated quest's
                                              villain/prize are linked entity pages;
                                              seeds stable across reloads (smoke-tested)
Phase C  Alive + Map M1–M2          █████████ exit: LAUNCH — "generate me a world"
         + campaign starter                   yields a mapped, interlinked starting
                                              sandbox playable for several sessions
Phase D  Time                       ███       fast-follow
Phase E  Reach + Map M3 (sites)     █████     fast-follow — world→dungeon zoom complete,
         + story-web reuse                    quest prizes physically inside dungeons
v2.5     Custom kinds/tables/gens   █████     "yours all the way down"
M4       Rivers/roads, morphology   ····continuous, never gating····
```

Working rules: each phase ships behind nothing (the existing site never
degrades); the seed contract gets smoke tests the day it exists; every
schema carries a version + migration from day one; ⚠️ SLOW items (story-web
role DSL, settlement morphology, reuse resolution, custom generator
authoring) get design time in the *preceding* phase.

## 8. Risks

Schema churn (hence Phase 0), seed-contract drift (smoke tests + Q11's
policy), scope gravity (the wedge is generation↔persistence↔interconnection;
feature parity with decade-old tools is not the goal), static-site ceiling
(honest copy about local-only links until snapshots), licensing discipline
(SRD + credited community tables only), Phase C overload (pre-planned split:
C1 links/search, C2 map + campaign starter + exports, launch after C2), and
one new: **story webs are the highest-novelty item** — no surveyed tool does
role-based entity-referencing generation, which means no prior art to lean
on; the Phase 0 design pass and the Phase B v1 (mint-only, no reuse) exist
to de-risk it in slices.

## 9. Open questions — for the owner's next visit

*One place for questions the loop can't answer itself, so they don't scatter
through the file. **Convention** (owner, 2026-07-16): when a batch hits a fork
that needs the owner — a design choice, a scope call, a missing fact — an agent
appends it here, **newest first, dated, with enough context to answer cold**, and
continues with the rest of the queue rather than blocking (§6.9 D11). The owner
answers on return; an answered item moves into the decision register (§6) and
drops off this list.*

- **(2026-07-16) Subrealms — the curated federal list (#3b / §6.9 D4).**
  Own-tier subrealms are decided; *which countries* get them is not. Proposed
  starting set: US, CA, AU, BR, IN, MX, DE, RU, CN, AR (≈320 admin-1 units).
  Add or drop any? (Reminder: the naïve "most-subdivided" heuristic is wrong —
  GB/SI/LV top it with districts, not states.)
- **(2026-07-16) Globe layers (#34).** The globe will *hide* pins/labels/rivers
  on toggle once #34 lands, but it does not *render* realms (claim washes) or
  roads at all. Should those be projected onto the sphere too, or does the globe
  stay a clean terrain overview? (A real feature, not just "obey the toggle.")
- **(2026-07-16) Realm entry tone (#35).** When a political power's entry becomes
  rollable, what should the prose cover and sound like — founding + current
  tensions + culture; terse gazetteer or evocative? Any existing page to match?
