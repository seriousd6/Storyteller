# Storyteller Overhaul Plan

*Drafted 2026-07-11. Living document — update as decisions change.*

## Status — resume here (updated 2026-07-11, post-merge)

**Where things stand:** Phases 0–4 complete. Phase 5 (Solo pillar) substantially
built — three tools live, Colostle parked-and-mined. Phase 6 (Writing pillar)
**now built** — three tools live. Phase 7 finalize mostly done (docs + deploy
config); only the owner-gated Pages toggle remains. One open decision: LIGHT
(owner wants to absorb its systems/ideas into an original tool — build in
progress). Everything below is committed to `main`.

**What's live in `v2/` right now (33 pages, 461 tables / 82,229 entries):**

| Area | Tools |
|---|---|
| GM Prep — slot generators | Tavern, Loot, Adventure, Villain, Plot Hooks, Wagon, World, Government, Magic, NPC, Shop (11; per-fragment reroll/lock/pin) |
| GM Prep — one-click builders | Encounter (XP-budget math), Treasure Hoard, Quick NPC, Tavern One-Pager, Shop One-Pager |
| GM Prep — more generators | Scavenge (15 location loot tables), Dungeon Dressing (graffiti/riddle/hazard/room) |
| Solo Play | Solo Oracle (yes/no + likelihood + events), Character Oracle (16 slots), Quest Oracle (6 slots), Mission Oracle, Action Oracle (LIGHT-inspired) |
| Writing | Writing Prompt (6 slots), Writing Challenge (constraints + countdown timer), Unblocker, Inspiration Deck (draw-a-word cards) |
| Everywhere | Sheet Builder (`/sheet/`, all six block types editable inline, drag-reorder, print/Markdown) + collapsible sheet tray on every page |

**To work on it (in `v2/`, Node ≥ 20 — built on 24):**

```
npm install && npm approve-scripts --all   # once per clone (npm 11 blocks postinstall)
npm run dev        # local server
npm run extract    # regenerate ALL tables from v1/ legacy JS (4 scripts) + registries
npm run validate   # schema + dead-ref + token checks (expect 1 known warning)
npm run smoke      # engine determinism, 200 rolls/slot, 100 builds/composite
npm run check      # astro TS check
npm run build      # prebuild regenerates registries automatically
```

**Map of the code:** engine in `v2/src/engine/` (roll.ts tree resolver,
composite.ts, sheetStore.ts, dragList.ts, blockRender.ts); slot-generator
configs `v2/src/generators/*.json`; one-click builders `v2/src/composites/*.ts`;
all table data `v2/src/data/<pillar>/...` (regenerable — fix extraction
scripts, not data files, except hand-authored tables listed in
`v2/CONTENT.md`); extraction scripts + shared pipeline in `v2/scripts/`;
authoring rules and per-pass records in `v2/CONTENT.md`.

**Open decisions / manual steps (owner):**
1. **Deploy switch:** repo Settings → Pages → Source = "GitHub Actions"
   (workflow is ready; also confirm DNS still points at GitHub Pages).
2. **LIGHT rights call** — see Phase 5 (rulebook transcription; ship nothing
   verbatim without a decision).
3. Exit-criteria judgments on Phases 1–2 (are the tools better than v1?
   print a real prep sheet).

**Next up (in order of intent):** the verify-before-migrating remnants from the
Unfinished Development triage (SuperBuilder builders, queue LOCATION builders,
Omens dedupe, Loot Queue "My Additions" quirks) — each needs a per-entry source
check; then the deferred remnants list in CONTENT.md. Optional history slimming
(73MB of committed binaries — needs explicit sign-off) is the only Phase 7 tail.

## Vision

One coherent product: **Storyteller Toolbox (storytellertoolbox.com) — a storytelling hub
for game masters, solo players, and writers.**
Three equal pillars under one brand, one engine, one design system:

1. **GM Prep** — the D&D generator collection (taverns, loot, magic, governments, adventures, NPCs, monsters…)
2. **Solo Play** — the solo oracles set (yes/no oracle, character & quest oracles); Colostle parked, LIGHT pending a rights decision
3. **Writing** — prompts, writing challenges, unblockers, detail/shine card decks

## The flagship: the Sheet Builder

A first-class **printable custom output tool**. Every generator on the site can send its
results to a working sheet — a TTRPG-style statblock/information page you compose à la
carte:

- **Add** — any rolled result (or any piece of one) drops onto the sheet as a typed block:
  statblock, trait list, table, paragraph, title, key/value fields
- **Edit** — every block is editable inline; rolled text is a starting point, not a verdict
- **Remove / reorder / duplicate** — full control of the page composition
- **Move between rollers** — build up one sheet while hopping across tavern, NPC, loot,
  encounter generators; the sheet persists (localStorage, multiple named sheets)
- **Print & export** — a print stylesheet that outputs a clean, module-quality page
  (5e-statblock aesthetic, page-break aware); Markdown export as well

Rolls become prep. The site's identity is *generate → combine → refine → print*.

### Composite auto-generators (feeds the Sheet Builder)

One-click generators that emit fully-formed sheet blocks, not just strings:

- **Encounter** — monsters filtered by CR/biome (AdventureMonolith data) + terrain + tactics
- **Loot bundle** — treasure by CR/hoard type
- **NPC** — name, race, traits, voice, motivation as one statblock
- **Shop / Tavern one-pager** — inventory or full tavern block ready to print

## Core architectural decisions

Every tool on the current site is the same pattern: *roll on tables, compose results.*
The rebuild replaces ~125 bespoke JS files with:

- **One generator engine** (TypeScript, seeded RNG so results are reproducible)
- **Structured output** — generators return typed blocks (title, fields, lists, paragraphs),
  not innerHTML strings. This is what makes the Sheet Builder possible: blocks render the
  same on a generator page, on the sheet, and in print
- **Tables as data** — JSON validated against a schema, with a template syntax for
  composition (e.g. `"The {adjective} {creature}"` referencing other tables)
- **Genre as metadata, not folders** — entries carry `tags: ["fantasy", "horror", ...]`;
  Horror/Sci-Fi/Western become *filters* over one dataset instead of the old 4x
  duplicated directory trees. This is how those genres finally ship.

## Stack

| Concern | Choice |
|---|---|
| Framework | Astro (static output); Sheet Builder is an interactive island |
| Language | TypeScript for engine; JSON (schema-validated) for all table data |
| Styling | One design system — CSS custom properties, light/dark, mobile-first, **print-first for sheets** |
| Hosting | GitHub Pages at **storytellertoolbox.com** (CNAME at repo root), deployed by GitHub Actions |
| Persistence | localStorage for sheets (no accounts, no backend) |
| Strategy | Old site archived in `v1/` (done — site is not in use); `v2/` built in the open and deployed as it grows so progress is watchable |

## Phases

### Phase 0 — Foundation (small) — **done 2026-07-11**
- [x] Move legacy site into `v1/` (2026-07-11; `CNAME` stays at root)
- [x] Scaffold Astro project in `v2/` (Astro 5, TypeScript strict, builds clean on Node 24)
- [x] GitHub Actions workflow `.github/workflows/deploy.yml` builds `v2/` → Pages on every
      push to main. **Requires one manual step: repo Settings → Pages → Source = "GitHub Actions".**
- [x] `schemas/table.schema.json` (id, title, pillar, tags, credits, weighted entries,
      `{table:<id>}` template refs) and `schemas/block.schema.json` (typed sheet blocks:
      title, paragraph, keyValue, list, table, statblock)
- [x] Design tokens (`v2/src/styles/tokens.css`): parchment/ink palette, light + dark +
      print themes, statblock maroon reserved for sheet rendering
- [x] Site shell: three-pillar nav, theme toggle, responsive layout, credits footer,
      pillar landing pages

### Phase 1 — Engine + pilot generators (proves everything) — **built 2026-07-11**
- [x] Engine (`v2/src/engine/`): seeded RNG, weighted picks, recursive `{table:id}` +
      `{count:a-b}` template composition, typed-block output. Resolution is a **tree**,
      not a string — every random fragment keeps its table id + seed.
- [x] **Fragment-level reroll**: every random piece of a result is hoverable (shows its
      source table) and individually rerollable in place; nested fragments reroll
      independently of their parents.
- [x] Extraction pipeline (`npm run extract`): 88 tables / 6,179 entries ported from
      legacy tavern.js + loot.js (incl. spell lists, DMG magic item tables A–I, weapon
      and armor enchantments, gems). 1 corrupt legacy entry dropped.
- [x] Guardrails: `npm run validate` (ajv schema + dead-reference + token syntax checks),
      `npm run smoke` (determinism + 200-roll coverage per slot), `npm run check` (TS).
- [x] **Content pass 1 (2026-07-11)** over Tavern + Loot per `v2/CONTENT.md` criteria:
      new `{pick:a|b|c}` and `{num:a-b}` tokens; ported the legacy song builder and
      gambling-game builder the pilot had skipped; constructed variants (drinks,
      notices, first impressions, gem cuts, coins, weapon quirks) that reuse the
      name-part tables; extractor now auto-converts inline choices to picks and
      resolves legacy `a(n)` articles. 127 tables / 6,630 entries.
- [x] **Content pass 2 (2026-07-11)** — generative-grammar upgrade:
      `{table:id#tag}` filtered rolls over tagged entries (monsters: good/evil/big/small,
      persons: noble/lowly/holy/shady) powering contrast name templates ("The Couatl and
      the Mind Flayer"); `{var:n=table:id}`/`{var:n}` bindings for internal consistency
      ("The Moonlit Chandler and the Moonlit Empyrean", self-consistent WANTED posters);
      every "roll on X table" instruction now rolls inline (new original
      `gm/magic/wild-surge` table, 33 entries); thin tables expanded (rumor parts,
      event hooks). Validator: tag-existence errors + roll-on-instruction warnings.
      128 tables / 6,708 entries.
- [x] Pilots live at `/gm/tavern/` (12 slots) and `/gm/loot/` (6 slots) with
      roll-all / per-slot reroll / lock / pin-for-sheet (localStorage `stb:pins:v1`)
- [ ] Exit criteria: user judges pilots *better* than the originals on desktop and phone

### Phase 2 — Sheet Builder (the flagship) — **built 2026-07-11 (MVP)**
- [x] Sheet workspace at `/sheet/`: pinned blocks from any generator land in the active
      sheet; inline edit (title + paragraph blocks), remove, reorder, duplicate; add
      free-form headings and notes
- [x] Multiple named sheets in localStorage (`stb:sheets:v1`) with create/rename/delete
      and one-time migration of pre-existing pins
- [x] Print stylesheet: statblock styling (maroon headings, tapered rule), chrome and
      controls hidden, page-break-aware blocks
- [x] Markdown export (downloads `<sheet-name>.md`; all six block types serialize)
- [x] **Sheet tray (2026-07-11)**: the active worksheet is visible on every page as a
      collapsible fixed panel — drag-to-reorder, remove, live-syncs with pins and the
      full editor via store events; `/sheet/` remains the dedicated editing screen
- [x] **Drag-to-reorder blocks** on the Sheet Builder via a grab handle (⠿), so
      contenteditable text selection still works; ↑/↓ buttons kept for accessibility
- [ ] Inline editing for structured blocks (list/keyValue/table/statblock) — deferred
      until Phase 4 composite generators start emitting them
- [ ] Exit criteria: prep a real session start-to-finish and print a sheet you'd actually use at the table

### Phase 3 — Bulk migration of D&D content — **core migration done 2026-07-11**
- [x] Structural maps of all legacy files produced by parallel exploration agents;
      extraction driven by manifests (`extract-phase3.mjs`, `extract-phase3-npc.mjs`,
      shared pipeline in `scripts/lib.mjs` with object-literal walking, comment-aware
      bracket matching, tolerant eval, and dice-expression → `{num:}` rewriting)
- [x] **396 tables / 74,709 entries** now live. New generators: **Adventure, Villain,
      Plot Hooks, Wagon, World, Government (24 tagged types), Magic (146 tagged
      schools × 5 pillars), NPC (races/names/features/prophecies), Shop (28 merchant
      types)** — plus Treasure Map & Chest slots on Loot and the monster database
      (`gm/monsters/all`, 697 entries tagged by CR + size) ready for Phase 4
- [x] Categorical tags throughout (government types, magic schools, merchant types,
      hook classes/biomes/city scenes, monster CR/size); genre tags default to
      `fantasy` — horror/sci-fi/western tagging happens when that content is authored
- [x] Credits preserved (community credit block on every migrated table)
- [x] **Per-generator registries**: each tool lazy-loads only its transitive table
      closure as its own chunk (`scripts/gen-registries.mjs`, runs on prebuild) —
      no shared multi-MB bundle
- [x] **Triaged `v1/Unfinished Development/` (2026-07-11).** A survey mapped the
      ~8k lines; `extract-unfinished.mjs` migrated the provenance-safe, net-new,
      non-duplicate community lists (8 tables / ~2,190 entries): **Scavenge**
      generator (`/gm/scavenge/`, 15 location loot tables, 1,491 entries),
      **Dungeon Dressing** generator (`/gm/dungeon/`, graffiti/riddle/hazard/room),
      plus Herb, Reagent, and Catastrophe slots folded into Loot and World.
      **Excluded for provenance** (published-book text): the AD&D/5e DMG
      "Dungeon Dressing" + "Random Dungeons" tables and DMG magic-item quirks
      #1–12, and the SRD spell dump in `LONG term archive/`. **Deferred, needs
      per-entry source verification:** SuperBuilder's Bard/Thief `d12/d20`
      builders, the `queue` LOCATION/biome builders, the fantasy book-title list
      (Tolkien homages), the `queue` Omens (dedupe vs npc/prophecy first), and the
      `Loot Queue` "My Additions" quirks (mixed with DMG text + needs a content
      pass). CharacterDepth.js was a duplicate of the shipped `solo/character`.
- [ ] Deferred remnants (documented in v2/CONTENT.md): settingBuilder(2.0) town/faction
      generators, NPC reaction/motivation composed system, dungeon & subplane builders,
      rival-party generator, art-object story templates

### Phase 4 — Composite auto-generators — **built 2026-07-11**
- [x] Composite engine (`src/engine/composite.ts`): TypeScript builder modules
      (`src/composites/*.ts`) that run real logic over the table data and emit
      typed statblock blocks; seeded + deterministic like everything else.
      One `Composite.astro` UI (option dropdowns, sheet-styled preview,
      add-to-sheet); same `/gm/<tool>/` routes and lazy per-tool registries
      (composite table closures scanned straight from the TS source).
- [x] **Encounter builder** — real 5e XP-budget math (party size × level ×
      difficulty thresholds, adjusted-XP multipliers) over the 697-monster
      CR-tagged database; five composition styles (solo/pair/pack/horde/
      boss+minions); tactics + twist from two new original tables
      (`gm/encounter/tactics`, `gm/encounter/twist`)
- [x] **Treasure hoard** — DMG-style tiers (CR 0–4 / 5–10 / 11–16 / 17+):
      coins by tier dice, gems from matching value tiers, minor/major magic
      items, the trapped chest, and a 20% treasure map
- [x] **Quick NPC** — race/name parsed from the race wrapper; vocation,
      appearance, demeanor, motivation (Goal/Fear folded into the field key),
      flaw, quirk, faith, keepsake, backstory as one statblock
- [x] **Tavern one-pager** and **Shop one-pager** (28 merchant types with
      tag-filtered shelves, keeper personality/ideal/bond/flaw)
- [x] Each emits ready-made blocks straight onto the active sheet
- [x] **Structured blocks are now editable inline** on the Sheet Builder:
      keyValue fields, list items, table cells/rows, statblock name/meta and
      nested sections — with add/remove controls that only show on hover
- [x] Sheet tray: starts collapsed on small screens and stays compact so it
      never covers generator controls; smoke test now builds every composite
      100× against its own registry chunk (catches closure gaps)

### Phase 5 — Solo Play pillar — **started 2026-07-11**

Legacy exploration (parallel agents, 2026-07-11) changed this phase's shape:

- [x] **Generic solo oracle shipped** (`/solo/oracle/`): yes/no with a
      five-step likelihood ladder and and/but shadings, an interpretation
      prompt on every answer (descriptor + action + theme), and random events
      on d100 multiples of 11 (focus table incl. story twists). Five new
      **fully original** tables (~290 entries) — pin answers to a sheet and
      the Sheet Builder is the adventure journal.
- [x] SOLORPG evaluated → **dropped**. `solorpgcollections.js` is 100%
      commented-out prose, zero code, and its wordlists/premise tables appear
      transcribed from a commercial solo engine with no attribution — the
      oracle above replaces it with original content.
- [x] **Colostle: PARKED as a companion; concept-mined instead (2026-07-11).**
      Owner decision: don't port the game-specific companion. Everything
      concept-based and system-neutral was extracted into the solo oracle set
      (`scripts/extract-solo.mjs`, 28 tables / ~4,300 entries) with a
      Colostle-vocabulary filter (rook*/colostle/crackway/ashta/tundr(a)room…)
      keeping game-flavored rows parked with the game:
      - **Character Oracle** (`/solo/character/`, 16 slots): names, looks,
        traits, natures, flaws with roots, goals, motives, intentions,
        secrets + why they're kept, struggles, strengths/weaknesses, turning
        points, tagged emotional landscapes (8 moods, 830 entries), the
        little things, strangers
      - **Quest Oracle** (`/solo/quest/`, 6 slots): quest seeds
        (action — subject — twist), complications, enemy intentions, found
        items, strange machinery, place names; thin post-filter tables
        (subjects, complications) topped up with original authored entries
      - Skipped as junk: the "favorites" fill-in-the-blank category (modern
        references); the Colostle-flavored biome/exploration/combat tables
        stay in `v1/` should a licensed companion ever be wanted.
      If a real Colostle companion is revisited someday, the structural map
      lives in this section's git history (mechanics: pick-one, draw-N by
      Exploration Score, visual 52-card dealer; provenance split documented).
      A parallel branch (`claude/repo-overhaul-context-fd9vrg`, commit 40198fc)
      also extracted the combat/enemy descriptor tables (991 "colossus" detail
      rows, weapons, rooklings) and a Colostle-branded UI — dropped in favor of
      this concept-mined direction, but recoverable if a system-neutral
      "colossus/monster description" oracle is ever wanted.
- [x] **LIGHT — ABSORBED into original tools (2026-07-11).** The nine
      `v1/Light/*.js` files are the published LIGHT rulebook (Spencer Campbell /
      Gila RPGs, proto-LUMEN) transcribed into comments — no code. Rather than
      republish, its *systems and generation paths* were adapted into two
      original, system-neutral solo tools with 100%-fresh content (7 tables /
      174 entries; zero rulebook prose):
      - **Mission Oracle** (`/solo/mission/`) — LIGHT's composable mission
        builder: `{opposition} × {objective} × {complication(s)} × {advantage}
        × {opening}`, with the "two forces already at war" recursion and a
        stakes dial that stacks complications. Genre-neutral.
      - **Action Oracle** (`/solo/outcome/`) — LIGHT's wide-middle d6 ladder
        (setback / success-at-a-cost / clean success) so every roll yields
        momentum plus a complication; a favored/unfavored dial rolls 2d6 and
        keeps the better/worse die. Reuses the existing oracle interpretation
        tables for "read it as."
      Mechanics deliberately left on the table (documented for later): the Shade
      push-your-luck corruption die, the reaction-economy combat, and the
      Stability-map campaign layer — richer than a one-shot generator needs.

### Phase 6 — Writing pillar — **built 2026-07-11**
- [x] Three real tools, all sheet-pinnable, all backed by **original** content
      (12 tables / ~420 entries authored fresh — no scraped listicles, sidestepping
      the `v1` wisdom.js provenance issue):
      **Writing Prompt** (`/writing/prompt/`, slot generator: protagonist,
      situation, complication, setting, opening line, theme),
      **Writing Challenge** (`/writing/challenge/`, composite: word target,
      constraint, forbidden word, required element, prompt + a built-in countdown
      timer driven by the chosen limit), and **Unblocker** (`/writing/unblocker/`,
      composite: an action to try, a question to interrogate the draft, a reframe).
- [x] `writing/index.astro` now auto-lists the pillar's tools like the others;
      new `src/pages/writing/[tool].astro` route.
- [x] **Inspiration Deck — built original (2026-07-11).** The ~622
      `v1/StoryTelling` card images turned out to be a **commercial product
      (© 2023 Oddfish Games)**, not owner-made — so neither porting the images
      nor transcribing their words is safe (both republish the deck). Instead the
      *concept* was absorbed into an original draw-a-word-card tool
      (`/writing/inspiration/`): a card-deck island (draw-without-replacement,
      per-deck reshuffle, pin-to-sheet) over three original decks — Character,
      Mood, Detail (135 fresh word cards). Zero Oddfish content; the 64MB of
      images stays parked in `v1/`.

### Phase 7 — Finalize
- [x] v2 is the deployed build: the Actions workflow uploads only `v2/dist`, so
      `v1/` is already excluded from deploy while kept in history; `v2/public/CNAME`
      propagates to `dist/CNAME`, so the custom domain survives the Actions deploy.
- [x] README rewritten around the three-pillar product; added root `CONTRIBUTING.md`
      (data-first: adding a table needs no framework knowledge).
- [ ] Still owner-gated: flip repo **Settings → Pages → Source → "GitHub Actions"**
      (one manual click) so the workflow actually serves.
- [ ] Optional: repo slimming — 73MB of git history from committed binaries; decide
      whether to `git-filter-repo` (destructive, needs deliberate sign-off) or live with it

## Deliberately deferred (revisit after Phase 2)

- Shareable seeded roll/sheet URLs (engine supports seeds from day one, so cheap later)
- Community/custom table submission ("paste a d100 list, get a generator")
- AI-assisted expansion of rolled skeletons into prose
- PDF export beyond print-to-PDF

## Resolved / open questions

- ~~Name & domain~~ — **Resolved**: repo already serves **storytellertoolbox.com** via
  GitHub Pages (CNAME at root). v2 deploys there; no redirect pressure since the site is
  not currently in use.
- Open: flip repo **Settings → Pages → Source to "GitHub Actions"** so the deploy
  workflow takes over from branch-based serving; confirm the domain's DNS still points
  at GitHub Pages.

## Current-state reference (2026-07-11 audit, now under `v1/`)

- ~238k lines of D&D JS, but the four genre folders are byte-identical → ~59k unique
- Colostle ~8k lines (working); LIGHT ~2k lines (no UI); StoryTelling ~900 lines + ~700 card images
- ~11k lines of unprocessed lists in `Unfinished Development/`
- No build/lint/tests; Bootstrap 4 + jQuery via CDN; 104MB repo (73MB `.git`)
- Known dead ends: `Quest.js` (empty), `Tavern2.0.js`, `writingchallenge.js`,
  `unblocker.js` (stubs), `SOLORPG/solorpg.js` (empty)
