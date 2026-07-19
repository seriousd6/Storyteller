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
generator (`gm/npc`) up to it. The owner's ask was "design **each** roller table
as a well-designed one-page sheet," so the bulk of the content work is still
ahead. Prioritized:

### P1 — Author `page` layout for the remaining 16 generators
Only `gm/npc` has a `page` block. Every other generator falls back to the
default, and the fallback is uneven:
- **2 get a passable page** (`gm/tavern`, `solo/character`): they own a `name`
  slot, so it auto-promotes to a serif lead + rule, then one adaptive-column
  band.
- **14 render as one flat, unheaded band** — no lead, no sections, no hierarchy
  (`gm/loot`, `gm/magic`, `gm/villain`, `gm/world`, `gm/realm`, `gm/wagon`,
  `gm/adventure`, `gm/scavenge`, `gm/government`, `gm/hooks`,
  `gm/dungeon-dressing`, `gm/shop`, `solo/quest`, `writing/prompt`). Better than
  rows, but not "designed."

The work per generator is a `page: { lead?, sub?, sections: [{title, columns?,
slots}] }` block grouping its slots into meaningful bands, exactly as
`npc.json` does. Presentation-only — the slot list stays the §3.2 seed contract,
so this never touches determinism, and `smoke-templates` already proves each
still fills clean. Estimate: ~1 focused batch, or split GM / solo+writing.
Pages with a natural headline but no `name` slot (a realm's name, a world's
name, a villain's alias) may want a small `name`-style lead slot first.

### P2 — Extend the stat-block treatment past the NPC
The owner asked specifically for "a basic humanoid stat block with some variety."
`gm/npc` has it (`gm/npc/statblock` + `render:'statblock'`). The obvious next
candidate is **`gm/villain`** — an antagonist wants a statline too (reuse the
same `render:'statblock'` slot mechanism; author a villain/boss statline table or
point at the SRD monster lines already in `gm/monsters/srd`). Any future
bestiary-flavored roller page inherits the same hook.

### P3 — §4 route retirement (still fully open)
Each topic with a composite twin still lists **twice** in the catalog and ships
two routes: `gm/npc` + `gm/npc-block`, `gm/tavern` + `gm/tavern-page`, `gm/shop`
+ `gm/shop-page`, `gm/dungeon-dressing` + `gm/dungeon`. Decide, per topic, which
single landing survives now that the slot page is itself a sheet (the slot page
carries the full roll-and-reroll surface; the `-page` composite carries curated
prose + dials). Collapse to one `ToolCatalog` entry. This is the "no two landing
pages" deliverable and the last item of the original decision.

### P4 — Consistency & smaller polish
- **Two stat-block visual languages.** `Generator.astro`'s new stat card and
  `Composite.astro`'s `.preview` statblock render the same concept differently.
  Extract a shared statblock renderer (or align the CSS) so a stat block reads
  identically whichever surface produced it.
- **Secondary hubs untouched by the nav compaction.** Batch 260 compacted the
  home page and the three pillar `ToolCatalog` indexes. `/library/` (`.lib-card`)
  and `/spaces/` (`.sp-card`) keep their own card styles; they're already
  fairly tight and are content hubs rather than top-level nav, so this is a
  judgement call — fold in only if the owner wants those compacted too.

### P5 — Guard the new `page` contract
`page.lead` / `page.sub` / `page.sections[].slots[]` are **unvalidated**. A
typo'd slot id is silently dropped into the trailing "More" catch-all — the slot
still appears, just in the wrong band, and nothing fails. Add a page-integrity
check to `scripts/smoke-templates.mjs` (it already loads every generator config):
every id referenced by a `page` block must exist in `slots`, and no slot should
be claimed by two sections. Cheap, and it turns a silent layout bug into a red
gate. A roller e2e assertion that a `page`-hinted generator renders its
`.sec-head`s and (for NPC) its `.stat-card` would pin the render itself.
