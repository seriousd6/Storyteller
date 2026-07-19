# Generators as self-filling one-pagers

*Companion to `docs/sheets/PLAN.md` (Sheet Builder 2.0). Owner decision
2026-07-17: merge the roll-table and the one-pager — **every generator becomes a
one-pager**, built **through Sheet Builder 2.0**, with **no two landing pages
for the same information**. This doc is the architecture for that decision; it
extends PLAN.md §6 (rollTable), §9 (templates / fill-on-instantiate), and §18
(phasing) rather than inventing a parallel mechanism.*

## 1. The problem: one topic, two pages

Today a topic like a tavern ships **twice**:

- `/gm/tavern/` — the **roll table** (`Generator.astro`): a flat list of slots
  (Name, First Impression, Drink, Bard, Notice Board…), each fragment
  individually rerollable, pin a row to a sheet.
- `/gm/tavern-page/` — the **one-pager** (`composites/tavern-page.ts`): the same
  tables composed into a single printable statblock; regenerate rolls the whole
  thing; add the block to a sheet.

Same tables, same information, two routes, two mental models. The shop pair
(`/gm/shop/` + `/gm/shop-page/`), the NPC pair (`/gm/npc/` + `/gm/npc-block/`),
and the dungeon pair (`/gm/dungeon-dressing/` + `/gm/dungeon/`) repeat it. The
owner's instruction: collapse each to **one seamless page** where you add or
remove sections and reroll piece by piece.

> **Status (Batch 189):** Sheet Builder Phase 1 has landed the machinery this
> relies on — the `rollTable` block (`engine/blocks/rollTable.ts`), the dice
> stage (`engine/dice.ts`), and the template gallery in `sheet.astro`
> (`instantiate()` fills every `{table:}` token with one seed and stamps
> `{template, seed}` provenance). It ships **three** hand-authored templates
> (`src/sheets/templates/*.json`). This doc + `generatorTemplate.ts` are the
> "every generator" scaling of that same system.

## 2. The insight: a roll-table *is* a template; a one-pager *is* it, filled

PLAN.md §9 describes the mechanism we need, now shipped for its hand-authored
templates:

> Instantiating rolls every `{table:}` token through the engine with one seed;
> each filled fragment stores `source:{template, seed}` … so the whole page
> arrives pre-written *and every fragment is individually rerollable* — the
> `.frag` mechanism from `Generator.astro` running inside the editor.

That **is** the one-pager, and a slot generator **is** a template whose sections
are its slots. So we do not author 8 templates and leave 40 generators as
roll-tables — **we derive the template from every generator config**. One
definition (the generator's slots + tokens), one landing page, both behaviours:

- the composed **one-pager** = the template, filled on open;
- the **roll-table's** granular control = per-section reroll (`.frag` / §6
  `rollTable`) + add/remove section, in the same editor.

No new roll logic, no duplicated tables: the tokens are the generator's own.

## 3. Mechanism

### 3.1 Slot generator → template (built now)

`v2/src/engine/generatorTemplate.ts` — `generatorTemplate(config)` returns a
**drop-in** for `sheet.astro`'s `SheetTemplate` (same `{id, title, kind?,
description?, blocks}` shape its `instantiate()` already fills):

- one `statblock` block; the `name` slot (if any) becomes the **title token**
  (rolled → the tavern's name, the NPC's name), every other slot becomes a
  labelled `paragraph` **section whose text is the unrolled `{table:…}` token**;
- no per-block `source`/`id` — `instantiate()` stamps `{template, seed}` at fill
  time, exactly as it does for the hand-authored templates;
- a separate `sectionPalette(config)` export listing every section so the
  editor's **"add section"** menu can re-add one that was removed — the piece the
  current add-a-blank-`＋ note` control (`blocks/statblock.ts`) is missing.

Pure and dependency-free, so it is **tested today** by
`scripts/smoke-templates.mjs`: every generator derives a template that fills with
zero unresolved tokens and is deterministic per seed (the guarantee that lets the
two pages collapse to one). It runs in `npm run smoke`.

### 3.2 Composite → template

Composites already emit a one-pager (a `statblock`), but they run **logic**
(encounter XP budgets, hoard tiers, shop draw-without-replacement, party sizing)
and expose **options**. They stay code, but adopt the same descriptor:

- `meta.options` → the template's **parameters** (the dials survive — this is why
  we do not flatten composites into slot generators);
- `build()`'s output blocks are the template's blocks; each section carries a
  **section seed** derived from the base seed + section index, so the editor can
  reroll one section by re-running that slice — the per-section analogue of the
  slot `.frag` reroll. (Composite `build()` gains an optional
  `sections()`-style export in Phase 1; until then a composite one-pager rerolls
  whole, as today.)

### 3.3 Fill, reroll, add/remove — all from SB2.0, not reinvented

- **Fill on open**: PLAN.md §9 fill-on-instantiate rolls the template's tokens
  once with a seed. Share/permalink via `?generator=<id>&seed=…` (same shape as
  the composite share links, §11).
- **Reroll a section**: the `.frag` mechanism (§9) for slot-derived sections; the
  `rollTable` block (§6) for sections a GM wants left live/rollable on the page;
  every reroll goes through the §3 undo bus, so it is non-destructive.
- **Add / remove a section**: remove is already in `blocks/statblock.ts`; add
  gains the template's `sectionPalette` (§3.1) so you re-add *Overheard* or *A
  Toast Is Raised*, not just a blank note.
- **Edit / print / pin**: the block is a sheet block — everything the Sheet
  Builder already does (reorder, edit text, print, export, save-to-world).

## 4. One landing page per topic

The dual routes collapse. `/gm/<topic>/` opens the topic's template as a
self-filling one-pager (the sheet surface, or an embedded sheet editor on the
tool page — a Phase-1 decision). The `-page` composite and its slot twin become
**one** entry in the catalog (`ToolCatalog.astro`), so the GM index stops listing
a topic twice.

Retire, per topic:

| Topic | Was (two pages) | Becomes (one) |
|---|---|---|
| Tavern | `/gm/tavern/` + `/gm/tavern-page/` | `/gm/tavern/` |
| Shop | `/gm/shop/` + `/gm/shop-page/` | `/gm/shop/` |
| NPC | `/gm/npc/` + `/gm/npc-block/` | `/gm/npc/` |
| Dungeon | `/gm/dungeon-dressing/` + `/gm/dungeon/` | `/gm/dungeon/` |

For the ~13 slot generators with **no** composite twin (loot, magic, villain,
world, realm, wagon, adventure, scavenge, government, hooks, quest, character,
prompt), the template derivation (§3.1) is what turns them from a flat slot list
into an add/remove + reroll one-pager — the "every generator becomes a one-pager"
half of the decision, no new content required.

**Update (Batch 260):** the slot-roller pages themselves now RENDER as one-page
sheets — `Generator.astro` lays the slots out as a designed page (serif lead,
statblock rule, small-caps sections, run-in "Label. Value" entries, hover-quiet
per-field controls) instead of rows of roller tables. Layout comes from an
optional `page` block in the generator config (`lead`/`sub`/`sections`,
presentation-only — the slot LIST stays the §3.2 seed contract); un-hinted
configs fall back to a single adaptive-column band, with a slot named `name`
auto-promoted to the lead. The NPC page additionally rolls a humanoid stat
block (`gm/npc/statblock`, SRD NPC archetypes as one-line entries) rendered as
a stat card. The §4 route retirement (collapsing `-page`/slot twins) remains
open.

## 5. Phasing (extends PLAN.md §18)

- **Done (Batch 189):** the self-filling editor — `rollTable`, dice, template
  gallery, `instantiate()`, play mode — with three hand-authored templates.
- **Now (this batch, foundation):** `generatorTemplate.ts` + `smoke-templates`.
  Every generator provably derives a deterministic, self-filling template in the
  exact shape `instantiate()` fills. No UI change; nothing shared is touched, so
  it lands without a merge fight against the live Phase 1 work.
- **Next (gallery wiring — one open integration point):** `sheet.astro`'s
  `TEMPLATES` array (currently `import.meta.glob('../sheets/templates/*.json')`,
  line ~87) also maps `import.meta.glob('../generators/*.json')` through
  `generatorTemplate()`, so **all generators auto-register**, not just the three
  curated ones. Where a hand-authored template exists for a topic (e.g.
  `npc-one-pager`), it wins; the rest come from the generators for free.
- **After wiring (routing consolidation):** `/gm/<topic>/` serves the template as
  a self-filling one-pager (embed the sheet editor, or link
  `/sheet/?template=<id>&seed=…`); retire each `-page` twin and its slot twin per
  §4; `ToolCatalog` lists each topic once. This is the "no two landing pages"
  deliverable.

## 6. Coordination

Sheet Builder 2.0 is being built by a parallel session; this doc and
`generatorTemplate.ts` are the **tool-page half** of the same effort, kept in
one repo so the two converge instead of drifting (the Earth-2026 lesson,
CLAUDE.md; PLAN.md §2.2). The foundation added now is additive and self-contained
— it changes no shared surface — so Phase 1 can adopt it without a merge fight.
The one open dependency it introduces for Phase 1 is intentional: the template
gallery should iterate `import.meta.glob('../generators/*.json')` through
`generatorTemplate()` rather than hand-listing templates.

## 7. Open work / queue (assessment after Batch 260)

Batch 260 shipped the *mechanism* — `Generator.astro` renders any slot page as a
designed one-page sheet, driven by an optional `page` block — but only wired one
generator (`gm/npc`) up to it. **Batch 264 closed most of the queue** (P1, P2,
P4, P5, and a new owner-requested villain thread). Status below; **P3 remains the
one open item**, and it needs an owner decision.

### P1 — Author `page` layout for the remaining generators ✅ DONE (B264)
Every generator now has a `page` block (17/17). Grouped small-caps sections,
run-in "Label. Value" entries, columns for short facts.

**Design law learned the hard way (measured, don't guess):** a `lead` renders in
big maroon serif, so it is ONLY for a genuinely short *name* — measured max
length must be well under ~60 chars. Most generator slots roll descriptive
*prose*, not names (`gm/government/government` maxes 2662 chars, `gm/villain` 801,
`gm/shop` premise 3104). Leading with those produced a serif *wall*. So only
`gm/tavern` and `solo/character` (real `name` slots) keep a lead; `gm/npc` keeps
its name-bearing race line (shipped B260). Every other generator opens with an
**untitled lede section** — the primary slot as a normal body entry — then its
titled sections. When adding a lead to a future generator, roll the slot 40× and
check the max length first (there's a throwaway measure script pattern in the
B264 session notes).

### P2 — Extend the stat-block treatment past the NPC ✅ DONE (B264)
`gm/villain` now rolls `gm/villain/statblock` (10 SRD antagonist archetypes:
bandit captain → archmage) via a `render:'statblock'` slot, drawn as the same
stat card. Any future bestiary page reuses the hook.

### P2.5 — Monster-in-human-skin villain thread ✅ DONE (B264, owner ask)
A human villain who runs a *monster's* whole stat block, every supernatural
ability reskinned as an augmentation / device / spell (an ancient dragon as a
fallen archmage: breath → a wand it never sets down, claws → enchanted dagger
swipes). Three tables — `gm/villain/reskin-monster` (20 monsters, each with its
signature abilities pre-translated so mechanics stay coherent),
`gm/villain/reskin-guise` (the human face), `gm/villain/reskin-source` (why a
person has monster powers — often the exploitable weakness) — surfaced as the
villain page's **"In Monster's Clothing"** section. *Possible graduation:* this
could become its own composite tool later (pair guise + `srdLine()` statline +
translations, like `encounter`/`lair`), if it earns a dedicated landing.

### P4 — Consistency & smaller polish ✅ DONE (B264, in part)
- **One stat-block visual language.** `Generator.astro`'s stat card now renders
  its ability boxes with the Block Kit's shared `.b-statGrid` classes (global
  CSS), so the roller card and a `statGrid` block (character sheet, composites)
  are pixel-identical. The bespoke `.generator .stat-box*` CSS is gone.
- **Secondary hubs — deliberately left.** `/library/` (`.lib-card`) and
  `/spaces/` (`.sp-card`) keep their own already-compact card styles; they're
  content hubs, not top-level nav. Fold in only if the owner asks.

### P5 — Guard the `page` contract ✅ DONE (B264)
`scripts/smoke-templates.mjs` now fails if any `page` references an unknown slot
id or places a slot in two sections (the silent-"More"-drop is a red gate now).
`tests/rollers.spec.ts` pins the render: the NPC page's section heads + humanoid
stat card (6 ability boxes, reroll rebuilds it), and the villain page's stat card
+ "In Monster's Clothing" reskin thread.

### P3 — §4 "one landing per topic" ✅ DONE (owner-approved, next batch)
Resolved after mapping *what depends on each route*. The load-bearing finding:
the composite **modules are world-generation infrastructure**, not just tool-page
twins — `webs.ts`/`earth2026.ts` call `npc-block`/`tavern-page`/`shop-page` to
populate every world, and `adapters.ts` registers `gm/dungeon` as a map adapter
(they resolve via `import.meta.glob('../composites/*.ts')` by `meta.id`,
independent of the tool routes). So a module can never be deleted; only the
tool-page *listing* was ever in question — which is exactly §4's literal
deliverable ("**one entry in the catalog**").

Done, per the owner-approved per-pair calls:
- **NPC** — race/gender **dials ported to the slot page** (config `dials`, see
  §3.4), so the NPC sheet fully subsumes Quick NPC; `npc-block` de-listed.
- **Tavern** — the slot sheet is the landing; `tavern-page` de-listed (its
  composed one-pager is one click away via "📄 Full page →").
- **Shop** — `shop-page` (dials + stocked shelves) is the landing; the thin
  3-field `gm/shop` slot generator de-listed.
- **Dungeon** — **kept both**: `dungeon-dressing` (4 flavor slots) and
  `gm/dungeon` (a full delve + map) are different tools, not twins.

"De-listed" = dropped from `gm/index.astro`'s catalog (a `DELISTED` set), **not
deleted**: the routes still resolve (bookmarks, `/sheet/?template=` deep-links),
the modules stay (world-gen), and it's a one-line revert. A hard 404 was
rejected on purpose — it would break bookmarks and delete the shared
`Composite`-component test coverage that rides on `tavern-page`'s rich sections,
for zero user benefit.

### 3.4 addendum — constraint dials on a slot page
`GeneratorConfig.dials?: { id, label, slot, choices }[]` renders a dropdown row
above the sheet. A dial's value is an **AND-tag filter** over the entries of its
target slot's single root `{table:}`; multiple dials on one slot combine (race
AND gender), which the engine's one-`#tag` grammar can't express, so
`Generator.astro` filters the pool in JS and renders a seeded pick — exactly what
`npc-block` does, now on the slot page. Empty combos fall back to the weighted
roll (never a blank). Dials ride the hash (`d=`) so a shared link reproduces the
dialed result. (Caveat: "📄 Full page →" opens the derived template un-dialed —
the generator→template bridge doesn't carry dial filters yet.)
