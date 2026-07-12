# TTRPG Tool Survey & Feature Classification

*Compiled 2026-07-12. Companion to [ARCHITECTURE.md](ARCHITECTURE.md) — the plan for
Storyteller's evolution into a world-wiki + generation platform ("Worldsmith",
per OVERHAUL.md §5). This document is the evidence; the architecture doc is the
conclusions.*

**Scope:** deep dives on the three named standouts (World Anvil, 5etools, donjon),
plus the surrounding field: LegendKeeper, Kanka, Azgaar's Fantasy Map Generator,
Watabou's Procgen Arcana, Obsidian + TTRPG plugins, Foundry VTT, Chartopia,
Perchance, Campfire, Scabard, Fantasy Calendar, Inkarnate, Dungeon Alchemist,
and others.

---

## 1. The three standouts

### 1.1 World Anvil — the structured-wiki benchmark

**What it is:** the market-leading worldbuilding wiki. Freemium subscription
(Freeman free tier → Master ~$58/yr → Grandmaster ~$105/yr → Sage ~$300/yr).

**Feature inventory:**

| Area | What they have |
|---|---|
| Articles | **28 built-in templates** (Character, Settlement, Building, Organization, Species, Ethnicity, Geography, Item, Material, Condition, Document, Language, Law, Military Conflict, Myth, Plot, Profession, Prose, Rank/Title, Session Report, Spell, Technology, Tradition, Vehicle, Generic…), each a structured form of prompt-like fields plus free-text body. Custom templates are Grandmaster+. |
| Linking | `@mention` autocomplete generating typed links; an **Autolinker** that converts plain-text name occurrences into links (free tier!); extended mentions embed maps/timelines/statblocks; "articleblocks" embed card previews of one article in another. |
| Tooltips | Excerpt hovers (paid) and rich full-preview hovers ("Tooltipster", Master+), auto-populated from article title/cover, overridable per article. |
| Organization | Nestable category tree that **doubles as the public table of contents**; drag-and-drop manager; tags; WIP/Done workflow flags; draft vs published × private vs public as orthogonal toggles. |
| Maps | Upload-an-image model. Layers (political/topo/floors), pins/labels/journey-lines, marker groups toggleable by readers and **visibility-scoped per subscriber group**, custom/radial/polygon markers (paid), **nested maps** (marker opens another map — galaxy→planet→city→building), click pin → article opens in a **sidebar** without leaving the map. No ad-hoc distance ruler. |
| Time | Timelines with eras, 11 parallel lanes, events linking to articles; parallel sub-timelines per nation/character; **Chronicles** (Master+): map × time hybrid — scrub time, watch events move on a map; integrated custom calendars (Fantasy Calendar acquisition). |
| GM tools | Campaign manager (45+ systems), statblocks for 100+ systems + custom statblock designer, interactive character sheets, dice roller, GM screen, quest tracker with states, Session Report template, handouts. |
| Secrets | The signature feature: inline **secret blocks** whose visibility is controlled by **subscriber groups** (per-party, per-player) — different players see different versions of the same article. |
| Visualizations | Family trees, diplomacy webs, org charts — all **derived from structured article fields**, not drawn by hand; embeddable. Whiteboards (infinite canvas embedding WA objects). |
| Generators | Community-built random generators exist but are a **bolted-on paid feature** (creation is Grandmaster+), not integrated with articles. |
| Community | Follows, comments, likes, browse-by-genre discovery, and the retention engine: **Summer Camp / WorldEmber** seasonal prompt challenges. |
| API | v2 "Boromir" (OpenAPI), but building against it requires a Grandmaster application key — the API itself is paywalled. |

**Documented pain points** (Trustpilot ~3.1/5, reviews, forums):
1. **Overwhelming UI** — the #1 complaint. All 28 templates and every panel on first login; "a complicated word processor with the capabilities of an old-school MySpace page."
2. **Paywall resentment** — everything distinctive (secrets, trees, CSS, custom templates, generator authoring, API) is paid; free tier caps at 42 articles, effectively public-only.
3. **Billing** — silent auto-renewals and refund refusals are their worst reputational damage.
4. **BBCode editor** — dated, dual-mode switching mangles formatting, data-loss reports.
5. **Performance, no offline mode, weak mobile.**
6. Reader-side gating (visitors to paid worlds can't see some content types).

**Adopt:** secrets model (eventually), data-derived visualizations, nested maps
with article sidebar, mention + autolinker + hover-tooltip trio, category tree
as public ToC, templates-as-prompts ("What defends this settlement?" teaches
worldbuilding), seasonal challenges as community machinery.
**Avoid:** front-loading complexity, BBCode/dual editors, paywalled reading,
paywalled API, neglecting offline (we're already static/offline-friendly).

### 1.2 5etools — the data-architecture benchmark

**What it is:** a fully static, client-side reference suite — the most complete
structured database of 5e content in existence. Not a generator site; its
gravity is completeness + cross-linking.

**Feature inventory:**

| Area | What they have |
|---|---|
| Sections | Bestiary, Spells, Items, Classes, Species, Backgrounds, Feats, Optional Features, Psionics, Decks, Bastions, Quick Reference, Variant Rules, Tables, full Books & Adventures text readers, Languages, Recipes, Maps gallery, Vehicles, Objects, Traps & Hazards, Cults & Boons, Deities, Actions, Conditions, Rewards. |
| Search | Precompiled omnisearch index, instant-as-you-type across all categories; per-page list search with field syntax. |
| Filters | **Tri-state pill filters** (neutral/include/exclude) with dozens of facets per page, AND/OR modes, CR range sliders; **filter state serialized into the URL hash** — every filtered view is a shareable permalink; saved filter state; content blocklist; hotkeys (F, G, J/K). |
| DM tools | Encounter builder (XP-budget math, party groups, random-by-CR/environment, send to initiative tracker), CR calculator (full DMG method), loot generator (every item a live link), **DM Screen** (tiled panel grid: any statblock/rule/table embeds, initiative tracker, dice, timers, notes), initiative tracker with sanitized player view, stat generator, life/background generator, card exporter, **text→JSON converter** for homebrew onboarding. |
| Data model | **Static JSON, no backend** — deployable from a thumb drive. Typed `entries[]` tree (entries/table/list/inset/quote/image/statblock) rendered by ONE recursive renderer everywhere. **Inline tags** `{@creature goblin|MM}`, `{@spell fireball}`, `{@dice 2d6}`, `{@filter …}` — every reference is machine-readable, hoverable, linkable, and resolves across sources including homebrew. |
| Homebrew | Community repo of thousands of JSON files with `_meta` source declarations; in-site Brew Manager loads and **merges brew at runtime into every list, filter, search index, and tag resolution**; JSON Schemas + VS Code validation; GUI brew builder. |
| Offline | Full PWA since 2023; "preload offline data" caches the entire dataset. All state in localStorage; **no accounts anywhere**. |
| Ecosystem | Plutonium imports everything into Foundry (adventures become linked journals); Rivet browser extension; self-hosted mirrors everywhere. |
| Legal | Hosts verbatim WotC text far beyond the SRD; **WotC DMCA'd the GitHub mirrors (Aug 2024)**; survives by cycling mirror orgs. **Its content model is unreplicable for a legitimate product.** The safe substrate is SRD 5.1/5.2 (CC-BY-4.0) + user content. |

**Adopt:** the entire data architecture philosophy — typed entry trees, one
renderer many surfaces (Storyteller's Block schema is already this), inline tag
cross-references with hover popups, URL-serialized filter state, homebrew as
mergeable schema-validated JSON, PWA offline preload.
**Avoid:** the content-licensing model; reference-without-creation (no world
model); JSON-first authoring without GUI ramps.

### 1.3 donjon — the generator-density benchmark

**What it is:** one developer, running since ~1999. Server-generated pages
organized by system (Fantasy / SciFi / 5e / 5.5 / Pathfinder / d20 / AD&D 1e /
Weird Fiction). The most complete free generator collection anywhere.

**Generator inventory (the ones that matter for us):**

| Generator | Notable inputs → outputs |
|---|---|
| **Fractal World** | Seed, projection (incl. spinning globe), % water/ice, palettes → PNG planet maps, deterministic from seed. |
| **Fantasy World** | Size, water, hex grid → hexcrawl continent PNG with named features. |
| **Fantasy Calendar** | Days/week, months (Markov names), multiple moons, festivals → interactive calendar; save via copy-paste blob (fantasy-calendar.com can import it). |
| **Medieval Demographics** | Kingdom area, density preset, age → population, city/town/village counts, **businesses and tradesmen counts per settlement** (S. John Ross method). |
| **Town** | Size, racial mix, environment (incl. Subterranean), culture → overview + notable shops each with proprietor NPCs. |
| **Inn/Tavern** | Quality, patron type → name, building, innkeeper **with a hidden twist**, priced menu, patrons, rumors/hooks. Beloved for one-click density: a complete usable scene. |
| **Adventure** | Theme/goal/villain/climax dropdowns → structured outline (TSR Design Kit tables). |
| **Names** | Quasi-historical by region/period, dozens of sets; **Markov generator accepting your own corpus**. |
| **Dungeon** (crown jewel) | One engine, five system skins. Level 1–20, motif, layout shapes, size, corridor style, a dozen map skins → map PNG + **room-by-room key with system-legal encounters (XP), traps, treasure** + TSV grid export (became a de-facto interchange format). Settings encoded in URL = shareable regeneration. |
| **System toolkits** | Per-system encounter generators/calculators, treasure per actual DMG/UE tables, magic shops, monster/spell/item filter lists. |
| **SciFi** | Star system, Traveller UWP profiles, SWd6, fractal planets. |

**Pain points:** UI frozen in ~2005; **no persistence** (most output evaporates
on refresh); **zero linking between outputs** (the town's tavern is not the inn
generator's tavern; the innkeeper can't be opened or dropped into dungeon room
12); all-or-nothing regeneration (no lock-and-reroll — *Storyteller already
beats this*); no structured export.

**Adopt:** one-click density (a full usable scene per click), rule-table
mechanical legality, system skinning of shared engines, seeds-in-URLs,
demographics→businesses→tradesmen chain (it's a proto-drill-down!).
**Avoid:** islands of dead text; nothing being "yours."

---

## 2. The surrounding field (what each one proves)

| Tool | Proves | Key pain point |
|---|---|---|
| **LegendKeeper** ($9/mo, no free tier) | Map-first navigation works: nested atlas (continents→crypts), pins = wiki pages, auto-linking as you type, backlink panels, inline secrets, realtime collaboration, whiteboards. The "feel" benchmark — "World Anvil without the homework." | Single-dev pace; **no free tier** is its most-cited flaw; weak export/lock-in anxiety; generation promised for years, never shipped. |
| **Kanka** (free core, ~$5–25/mo premium) | Typed entities beat freeform for campaign data: ~20 fixed types (Characters, nestable Locations, Families, Organisations with ranks, Races, Quests, Journals, Timelines, Maps, **deep custom Calendars**, Abilities, Items…) that *interact* (a Character has a race, family, org, location). Typed directional relations; **per-entity permissions**, the most granular in the field; full REST API; self-hostable. | The recurring complaint: clunky form-heavy UI — "a database, not a document." Fixed types frustrate; prose writing feels bad. |
| **Azgaar's FMG** (free, OSS) | A **simulated world model**: heightmap → climate → rivers → biomes → cultures (with per-culture name-bases) → religions → states/provinces (expansion, diplomacy, wars) → **burgs with generated populations** → routes → military → heraldry (Armoria). Everything editable — *generate, then curate*. Exports GeoJSON/SVG/PNG and a single self-contained `.map` world file. | Overwhelming UI; performance; and the big one: **all that generated lore is trapped in the map file** — no wiki layer, no accounts. |
| **Watabou Procgen Arcana** (free) | Beautiful single-purpose generators (Medieval Fantasy City with wards/walls, Village, Neighbourhood, One Page Dungeon, Mansion) — all **seed-driven with shareable permalinks** and SVG/JSON export. **The Azgaar→Watabou handoff:** click a burg in Azgaar → opens Watabou's city generator with a seed *derived from map seed + burg id* plus URL params (size, coast, port, river, name). Same seed = same city forever, **with zero storage**. Deterministic drill-down across two independent tools — the proof-of-concept for our whole thesis. | Stops at two levels; persists nothing. |
| **Obsidian + TTRPG plugins** (free) | Local-first files-you-own wins serious GMs: wikilinks/backlinks/graph, Dataview queries over YAML frontmatter ("every NPC where faction = X"), Fantasy Statblocks, Initiative Tracker, Leaflet maps in notes, Dice Roller that can **roll on markdown tables in your own notes**, Calendarium. | Hours of assembly required; plugin fragility; collaboration/sharing is the big hole. |
| **Foundry VTT** ($50 once) | Content-as-compendium distribution; `@UUID` linking makes an in-VTT wiki; journal pins on maps; per-document player permissions. Every wiki tool eventually builds a Foundry importer — **an export path to Foundry journals is a high-value integration**. | Nobody wants to *worldbuild* in a VTT. |
| **Chartopia / Perchance** (free) | Community random tables with recursive calls, dice expressions, weighted lists, variables, fork-and-edit culture; Perchance's long tail is tens of thousands of generators. | No curation; **no persistence — roll it, copy it, lose it**; output disconnected from any world. |
| **Campfire** | À-la-carte module pricing (pay per feature used). | Fiddly billing; writer-first. |
| **Scabard** | Proper-noun auto-linking with zero learning curve. | Dated, shallow. |
| **Fantasy Calendar** (fantasy-calendar.com) | Deepest calendar engine: custom leap rules, multi-moon, seasons, **procedural weather by climate/latitude**, minute-level events. | A silo — not connected to any wiki. |
| **Dungeon Alchemist** ($45) | Generation that exports **game semantics** (Foundry walls/doors/lights), not just pixels. | Battlemap scale only. |

---

## 3. Classification

### 3.1 Table stakes — every successful wiki-side tool has these

1. **Interlinking with backlinks** — mentions/wikilinks creating bidirectional
   references. Non-negotiable; every tool has a version of it.
2. **Maps with pins that open lore pages**; nesting is the premium version.
3. **Typed templates** for the recurring nouns: person, place, faction, item,
   quest, session.
4. **A real free tier or one-time price** — the market is hobbyist and
   subscription-averse. Kanka's free tier and Foundry's $50-once are cited as
   *reasons to choose them*; LegendKeeper's trial-only model is its most-cited
   flaw. *(Storyteller is already 100% free — a structural advantage.)*
5. **Player sharing via plain URL** — read-only views without accounts.
6. **Export / no-lock-in story** — markdown (Obsidian), `.map` (Azgaar),
   self-host (Kanka), compendiums (Foundry). Users increasingly refuse tools
   they can't leave.
7. **Calendar/timeline support** — now expected everywhere.
8. **GM/player secrecy model** — per-entity or per-block visibility + reveal.

### 3.2 Differentiators — one tool owns each (and we can compose them)

| Differentiator | Owner | Relevance to us |
|---|---|---|
| Seeded simulation world-model, everything editable | Azgaar | The generation philosophy: *generate, then curate* |
| Deterministic seed-passing drill-down | Azgaar→Watabou | The core mechanic of our infinite-depth design |
| Typed entities + relations + permissions + API | Kanka | The entity model to emulate (with fewer, leaner types) |
| Map-first nested atlas + editor polish | LegendKeeper | The navigation/UX bar |
| Tag cross-references + one-renderer data architecture | 5etools | We already share this DNA (Block schema, token grammar) |
| One-click scene density, rule-legal outputs | donjon | We already share this DNA (composites) |
| Secrets per subscriber group | World Anvil | Later phase; their #1 paid hook, could be free here |
| Data-derived visualizations (trees/webs from fields) | World Anvil | Cheap once relations exist |
| Local files you own | Obsidian | Matches our no-backend philosophy; export to Obsidian vault |
| Community tables, fork culture | Perchance/Chartopia | Long-term: user tables feeding world-aware generation |
| Rollable tables reading *your own data* | Obsidian (DIY) | "Roll an encounter for THIS region" — nearly unoccupied |

### 3.3 The gaps nobody fills — the openings

1. **Generation integrated with wiki persistence.** THE gap. Azgaar generates
   thousands of named burgs, rulers, religions — they die inside a `.map` file.
   Kanka/LK persist everything and generate nothing (LK has had generation on
   its roadmap for years). donjon/Perchance emit text you copy-paste by hand.
   *Nobody* offers: click "generate city" → real, editable, linked wiki
   entities (city page, NPCs, factions, shops) with provenance.
2. **Infinite-depth deterministic drill-down.** The Azgaar→Watabou handoff
   proves world→city with zero storage, but stops at two levels and persists
   nothing. World → region → city → district → building → NPC → pocket
   contents, generated lazily from seeds, materialized only when touched —
   **does not exist anywhere.**
3. **Consistency propagation.** No tool keeps generated content coherent with
   curated lore (culture-appropriate names, faction membership, calendar-legal
   birthdates). A world model shared between generator and wiki would.
4. **Random tables bound to world context.** "Roll an encounter for this
   region, drawing from this region's factions/creatures" exists nowhere
   outside heavy Obsidian DIY.
5. **Free + collaborative + owned simultaneously.** Today you pick two.
6. **Session-time surface.** The prep↔play handoff (reveal secret, advance
   calendar, log what the party touched) is manual everywhere.
7. **Time as a dimension of world state.** Calendars exist; queryable world
   history ("who rules this city in year 1023 vs 1305") does not.

### 3.4 Anti-patterns (documented, repeated, avoidable)

- Front-loading all templates/panels at first login (World Anvil's #1 complaint).
  → Progressive disclosure: start with ~5 entity kinds, reveal on demand.
- Form-heavy "database not document" editing (Kanka's #1 complaint).
  → Prose-first pages with structured fields available, not demanded.
- Paywalling reader-side viewing, or the API (World Anvil).
- Generation promised but never integrated (LegendKeeper's roadmap ghost).
- Output that isn't yours (donjon/Perchance evaporation).
- Lock-in / weak export (LegendKeeper anxiety, WA Manuscripts).
- Copyright-encumbered content (5etools' DMCA situation). SRD 5.1/5.2
  (CC-BY-4.0) + community/original tables only — Storyteller's existing
  credits discipline already follows this.

---

## 4. Positioning conclusion

The defensible wedge is exactly the intersection the field leaves open:

> **Azgaar/Watabou-grade seeded generation feeding Kanka-grade typed persistent
> entities through a LegendKeeper-grade reading/editing experience, with
> donjon-grade one-click density, Perchance-grade community tables that can
> read the world's own data, and Obsidian-grade export — free.**

Storyteller is unusually well-positioned to build it: the roll engine is
already seeded/deterministic with fragment-level lock-and-reroll (ahead of
donjon), the Block schema is already the "one typed tree, one renderer"
architecture (5etools' best idea), the content is already schema-validated
JSON with clean licensing, and the site is already static, offline-friendly,
and free. What's missing is precisely one layer: **the entity/world model and
the wiki UI around it** — which is what [ARCHITECTURE.md](ARCHITECTURE.md)
designs.
