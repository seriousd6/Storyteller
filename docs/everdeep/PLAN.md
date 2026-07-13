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
| **Hex map M3**: ground-tier sites — **square grids (Q16), variable dimensions (a tavern 20×20, a city map 200×200), nested sub-sites (city site containing building sites) (Q17)**; z-stack floors; G6 dungeon/interior generation **themed by story-web roles**; locale→site zoom transition | "…and I keep zooming, into the dungeon itself — and the quest's prize is in room 12" | XL |
| Query/filter views (kind+tag+relation+typed fields, URL-serialized) | "Every NPC in this faction" | M |
| Relation-derived visualizations (family tree, faction web) | "The dynasty draws itself" | L |
| Story webs v3: **reuse mode** — roles resolve to *existing* world entities matching filters, weaving generated content into curated lore | "The new quest recruited my existing blacksmith as its patron" | L ⚠️ SLOW |

### v2.5 — Yours all the way down (post-launch theme, Q7/Q9/Q29)

| Feature | UX driver | Effort |
|---|---|---|
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
| Portrait art pack | **"Notebook-style pencil drawings"** as the initial pack, generated by Claude (SVG sketch-line bust parts: race base heads, hair, eyes, brows, facial hair, headwear, clothing, accessories — one consistent hand-sketched style; owner may commission more later). Claude has the ball. |
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
