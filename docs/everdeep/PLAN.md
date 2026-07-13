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

| Directive | Resolution |
|---|---|
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
