# Storyteller Overhaul Plan

*Drafted 2026-07-11. Living document — update as decisions change.*

## Vision

One coherent product: **Storyteller Toolbox (storytellertoolbox.com) — a storytelling hub
for game masters, solo players, and writers.**
Three equal pillars under one brand, one engine, one design system:

1. **GM Prep** — the D&D generator collection (taverns, loot, magic, governments, adventures, NPCs, monsters…)
2. **Solo Play** — Colostle companion, LIGHT companion, generic solo-RPG oracle
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
- [ ] Triage `v1/Unfinished Development/` queues: migrate the usable lists, drop the rest
- [ ] Deferred remnants (documented in v2/CONTENT.md): settingBuilder(2.0) town/faction
      generators, NPC reaction/motivation composed system, dungeon & subplane builders,
      rival-party generator, art-object story templates

### Phase 4 — Composite auto-generators
- [ ] Encounter builder (needs migrated monster data: CR/biome/size)
- [ ] Loot bundles by CR/hoard type
- [ ] One-block NPC, shop inventory, tavern one-pager
- [ ] Each emits ready-made blocks straight onto the active sheet

### Phase 5 — Solo Play pillar
- [ ] Port Colostle (character, exploration, combat — ~8k lines, already working)
- [ ] **LIGHT gets its first-ever UI** — the ~2k lines of data exist with no pages today
- [ ] Evaluate SOLORPG remnants: fold into a generic oracle tool or drop

### Phase 6 — Writing pillar
- [ ] Finish the stubs for real: writing challenge (constraints + prompt + timer),
      unblocker, wisdom quotes
- [ ] Details/shine card decks: optimize/lazy-load the ~700 card images, deck-draw UI
- [ ] Writing prompts get sheets too (a story bible is just a sheet)

### Phase 7 — Finalize
- [ ] v2 becomes the site root build; `v1/` excluded from deploy but kept in history
- [ ] Update README, add CONTRIBUTING (data-only contributions are now easy)
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
