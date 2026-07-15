# Roll-table & generator review — every table, every implementation (task 34)

> Owner: "every single roll table needs to be reviewed. every implementation
> scrutinized. the implementation of randomness should be additive, in many
> cases it is completely derailing. people details are sometimes jarringly
> strange, and the fields that every place has such as who is in control and
> what do they want ... has no defaults (relevant world connections) or random
> for new inspiration."

This is a **review**, not a change. Nothing below is implemented yet. It maps
the whole generation system against the owner's five complaints — additive vs
derailing randomness, biome-specific and signature detail tables, coverage gaps
(dungeons/lairs/encounter & quest variety), jarring people details, and the
control/motivation fields that have no world-connected defaults or per-field
rolls — and proposes a prioritized fix roadmap.

Findings come from a full read of the engine (`composite.ts`, `roll.ts`,
`rng.ts`), all 12 composites, the 28 compiled registry bundles, the world-gen
wiring in `world.astro`, `webs.ts`, `density.ts`, and `adapters.ts`.

---

## 0. TL;DR — the one root cause and the five symptoms

**Root cause: the generators concatenate independent blind rolls instead of
decorating a coherent core.** Almost every world composite builds an empty
statblock shell and fills each slot with a separate `c.text('{table:...}')`
call, with no cross-field reconciliation and (mostly) no use of the context the
world already knows. The `encounter` composite is the lone exception and the
template we should copy: it computes a real XP budget, picks a monster
composition that fits it, and *only then* rolls flavor on top — randomness
decorates the core, it never overrides it (`encounter.ts:159, 92-121, 213-215`).

The owner's five complaints are all downstream of that:

| # | Complaint | Root symptom | Worst offender |
|---|---|---|---|
| 1 | Randomness "derailing" | fields rolled independently, contradict each other | `settlement.ts:67-83`, `npc-block.ts:49-62` |
| 2 | Not biome-specific | settlement ignores biome entirely; landmark uses it only cosmetically | `settlement.ts` (no `opts.biome`), `landmark.ts:22-48` |
| 3 | No "detail" rollers; dungeons/lairs empty | no signature-detail table; dungeon/lair/ruin/cave all = generic landmark | `world.astro:1732, 1767-1769` |
| 4 | People "jarringly strange" | role never reaches the NPC builder; safe & wild content weighted 50/50 | `npc-block.ts:21` (`_opts` unused) |
| 5 | Control/goal fields have no default or roll | context feeds prose, never `fields`; no per-field die | `adapters.ts:76-87`, `world.astro:453-484` |

---

## 1. How the system fits together (so the rest reads clearly)

Three artifact sets, not two:

1. **Composites** — `src/composites/*.ts` (12). Hand-written TS that assembles
   tables into a page of typed `Block[]`. The composite *is* the join logic;
   there is no declarative multi-table join.
2. **Standalone generators** — `src/generators/*.json` (16). Declarative
   single-tool "slot" generators (e.g. "Dungeon Dressing").
3. **Compiled registry bundles** — `src/generators/registries/*.json` (28 =
   12 composites + 16 generators). **Not authored data** — `gen-registries.mjs`
   computes each tool's transitive table closure into one bundle. So a bundle
   `X.json` is backed by either a composite `X.ts` *or* a standalone
   `generators/X.json`.

**The engine** (`roll.ts`) is a recursive template expander. `{table:id}` rolls
another table (recursing into that entry's own template), `{table:id#tag}`
filters by tag, `{count/num:a-b}`, `{pick:a|b}`, and `{var:n=table:id}` /
`{var:n}` for intra-line consistency. Every rolled token becomes a `RenderNode`
with its own seed so the UI can reroll one fragment in place. `makeRng` is a
seeded mulberry32 (`rng.ts:19-28`) → a build is fully deterministic per seed
(this is what makes preview == keep, and pinned blocks reproducible). **Keep
this property; every recommendation below preserves determinism.**

**One engine footgun:** tag filtering *silently falls back to the whole table*
when no entry carries the tag (`roll.ts:72-77`). A `{table:x#peaceful}` on a
table with no `peaceful` tags quietly draws from everything — including
"haunted by demons." Any tag-gating we add must fail loud in dev or fall back to
a safe default, not to the full pool.

---

## 2. Complaint 1 — randomness is derailing, not additive

**The additive reference — `encounter.ts`.** Computes 5e thresholds ×
party size (`:159`), enumerates in-budget monster compositions (`:92-121`),
weight-picks a fighting style, and only then rolls tactics + twist as decoration
(`:213-215`). Randomness never touches the CR math. This is the shape to
generalize.

**The derailing majority — settlement / landmark / npc.** Each builds a shell
and fills every slot with an independent blind roll, with no coherence pass:

- `settlement.ts:67-83` — Government, Morale, Economy, Trade, Cuisine, and
  "Trouble Brewing" are six independent `c.text()` calls. Nothing stops
  "Economy: prosperous mining boom" beside "Trade: nothing worth the road here,"
  or a "Trouble Brewing: besieged by a dragon" line on a page whose Morale rolled
  "content and sleepy."
- `npc-block.ts:49-62` — Appearance, Demeanor, Mood, Motivation, Flaw, Quirk,
  Faith, Keepsake, Backstory: nine independent rolls, no consistency pass.
  "Faith: devout temple acolyte" can sit beside "Flaw: blasphemes constantly."

**Rich context computed, then discarded.** `generateSettlements` derives a
semantically rich `SettleNode.type` ("fishing village", "royal seat") and a
geography-driven economy `reason` ("strand farms and inshore fishing",
`settlements.ts:99-122`). **Only `cls` (village/town/city) and `pop` survive
into the composite** (`world.astro:1730`). The composite then rolls
Economy/Trade/Cuisine blind — so a node the map *calls a coastal fishing
village* can render "Economy: caravan crossroads of the deep desert."

**Abandoned state bolted on after the fact.** For an abandoned ghost the
composite still rolls a living, bustling town; abandonment is prepended as a
prose block and population zeroed *afterward* (`world.astro:1741-1748`), leaving
the rolled body ("thriving market") contradicting the "empty, doors swinging"
intro.

**Fix shape (the core-then-decorate pattern):**
1. Compute a deterministic **core record** before any flavor roll — for a
   settlement `{type, population, government, economy, primaryResource,
   prosperity, danger, abandoned}` — from the passed context, exactly as
   `encounter` computes its `Config`.
2. Thread the *full* geographic context (`SettleNode.type`, `reason`,
   `abandoned`, `ECON[biome]`) into the composite instead of two scalars.
3. Draw flavor from **core-consistent pools**: roll one prosperity axis and one
   danger axis up front, then draw Morale/Economy/Trade/Trouble from bands
   consistent with them, so a content village can't roll civil war.
4. Handle abandoned/special states *inside* the generator (an `abandoned` opt),
   so it produces genuinely empty-town prose instead of a contradiction.

---

## 3. Complaint 2 — biome-specificity

**Settlement: none.** `settlement.ts` never reads `opts.biome`; its only option
is `size`. A swamp settlement and an alpine hold roll from the identical pool,
and the name suffixes (`holt|ford|mere|stead|wick|bury|dale`) are biome-blind.

**Landmark: cosmetic only.** `landmark.ts:22-48` maps 17 biomes → 7 groups
(`dry/cold/wood/open/high/shore/wet`) but biome does just two things: adds one
hardcoded `{pick:...}` "Setting" line, and runs an EXCLUDE regex that rerolls the
site up to 4× if it contradicts the biome. There is **no biome-specific entry
table** — every site still comes from the single 805-entry
`gm/adventure/point-of-interest` pool. Two holes:
- The EXCLUDE map only covers `dry/cold/open/high/wood`; **`shore` and `wet`
  have no exclusion**, so a desert oddity can still land in a swamp.
- Exclusion applies only to the top-level *site* line. The "Within" room,
  "Hazard", "Graffiti", and "The Truth of It" twist are **never** biome-checked
  (`landmark.ts:62-72`) — a desert ruin can contain "a flooded, ice-rimmed
  cistern."

**Fix shape:**
- Add `gm/settlement/biome-flavor` on the same 7-group scheme (stilt-houses over
  marsh in `wet`; wind-carved sandstone + cistern-hoarding in `dry`; terraced
  stone holds in `high`) and wire it into `settlement.ts`.
- Tag `trade-resource`/economy entries by biome (desert → salt/glass; coast →
  fish/amber) so both stop rolling "Mithril Ore."
- Complete the landmark EXCLUDE map (`shore`, `wet`) and apply biome exclusion to
  **all** sub-rolls (room, hazard, graffiti, twist), not just the site line.

---

## 4. Complaint 3 — "detail" rollers, and the dungeon/lair void

### 4a. No place-level signature-detail roller (the clearest single gap)

NPCs always get a quirk; **places get nothing that individuates them.** There is
no "the one memorable thing about this place" table for settlements or
landmarks. `complication` (trouble) and `intrigue` (secret) are *situations*,
not a physical/cultural signature. The NPC side already proves the pattern works
(`keepsake-oddity` 351, `quirk-personality` 99, `quirk-physical` 85) — places
have no equivalent.

**Fix:** add `gm/settlement/signature` (a landmark building, a local custom, a
peculiar law, a smell, a recurring festival) rolled **once, unconditionally**,
the way NPCs always get a quirk — the single highest-impact addition for making
places feel individuated. Add `gm/landmark/oddity` (a one-line "the strange
thing about this site", separate from the 50% twist).

### 4b. City vs village is a number, not a place

`size` changes exactly two things: the population band and the meta line. Every
rolled *section is identical* regardless of size — a hamlet and a metropolis get
the same single atmosphere line, one government, one complication. The `POP` map
even defines a `hamlet` tier (25-180) the UI never exposes, and caps `city` at
30k with no `metropolis`.

**Fix:** make `size` gate *content*. Cities roll extra sections (a district/ward
list, 2-3 notable features, a second complication); hamlets suppress
`intrigue`/`government` and lean on a single defining trait. Expose `hamlet`, add
`metropolis`.

### 4c. Dungeons / lairs / ruins / caves are all the same generic landmark

The density field rolls four feature kinds — `dungeon | lair | ruin | cave`
(`density.ts:73-96`) — renders them as distinct tappable map icons, and even
makes dungeons/lairs cast danger shadows that abandon nearby settlements
(`density.ts:118-160`). **But all four materialize through the single generic
`landmark` composite** (`world.astro:1732, 1767-1769`); the only thing
distinguishing them is the icon and a tag string. The generated *content is
identical*.

The `dungeon` bundle has real material — `room` (100), `hazard` (58),
`graffiti` (100), `riddle` (100) — but the composite pulls only one room + one
hazard + one graffiti as flavor lines inside a generic landmark
(`landmark.ts:62-67`); **`gm/dungeon/riddle` (100 rows) is used by nothing** on
the map. There is no multi-room dungeon: no room graph, no per-room monsters, no
loot integration, no boss, no depth/entrance.

**Fix (P1/P2 below):** a real `dungeon.ts` (size → sequence rooms → riddle gate
→ hazards → per-room `encounter` calls → end on a `hoard`; the `hoard` composite
already exists) and a `lair.ts` (resident villain via `npc-block` + territory +
guardians via `encounter` + treasure), routed from `onMaterializeGhost` by
feature kind. Give `ruin`/`cave` at least a keyed slant even if they stay
landmark variants.

---

## 5. Complaint — encounters & quests don't have to be monsters

**Every "event" is a fight.** The `event` kind maps to `composite:encounter`,
and `encounter.ts` is a pure 5e XP-budget combat builder — every output is a
monster statblock. `gm/monsters/all` is 697 rows; there is **no non-combat
branch**. Social/environmental beats exist only as garnish inside the 24-row
`twist` table ("They aren't hostile yet…", "There is a noncombatant in the
middle of it"). Missing entirely as first-class outputs: social encounters,
skill challenges, discoveries, travel/environmental events, mysteries.

**In-world quests are hardcoded and always end at the villain's lair.**
`webs.ts buildQuestChain` (`:321-388`) reads **none** of the quest/adventure/
hooks tables. Chain flavor comes from a **hardcoded 6-entry `TROUBLES` array**
(`webs.ts:299-306`): smuggling ring, disappearances, "the beast on the road,"
extortion, poisoned wells, grave-robbing. Meanwhile these rich bundles are
**never wired into the world**:
- `quest.json` — `action` (84), `subject` (36), `twist` (136),
  `enemy-goal` (217), `complication` (29), `item` (77), `machine` (79).
- `adventure.json` — **30 tables**: `premise` (118), `point-of-interest` (805), a
  full crime kit (perpetrator/motive/clue/scene), `war-*`, `moral`,
  `story-structure`.
- `hooks.json` — `location` (908), `class` (637), `misc` (469), `city` (369).

The `quest` kind's registered generators aren't runnable as composites
(`toolForKind` returns null), so there is **no "🎲 generate quest" inside a world
page** at all.

**Fix:** broaden `event` beyond combat (a type-selector in `encounter.ts` or a
separate `event` composite drawing on `hooks/location` + adventure beats; remap
the `event` kind off `composite:encounter`). Give `quest` a runnable `quest.ts`,
and have `buildQuestChain` draw from the quest/adventure tables instead of the
6-entry array — turning 6 templates into hundreds of combinations.

---

## 6. Complaint 4 — people details are jarringly strange

**Role never reaches the builder — the structural root.** `npc-block.build()`
takes `_opts` and **never reads it** (`npc-block.ts:21`). Every caller passes
only a seed; the role string ("Boss", "Villain", "Keeper", "Father") only
diversifies the RNG and sets an external label. Consequences:
- A **Villain** (`webs.ts:334`) is a fully generic npc-block with `tags:
  ['antagonist']` bolted on. The purpose-built `gm/villain/*` tables
  (motive/objective/method/trait, ~1,400 entries) are **never invoked.**
- A shop **Keeper** and a campaign **Villain** draw from the *identical*
  distribution. There is no "Ruler" branch constraining by government/place;
  rulers are just labeled npc-blocks.

**Wild content is weighted like safe content, so ~half of every NPC derails:**
- **50% of all NPCs are charlatans with a specific past crime** —
  `gm/npc/backstory` weights charlatan:1 / normal:1. Dropped on a shopkeeper:
  *"Hid the body of a dead man in a well, contaminating the only clean water
  within 5 miles of a small town."* Even `backstory-normal` skews epic
  (*"Was exiled by their brother the king"*).
- **60% weird/oddity keepsakes**, and `keepsake-oddity` (351) holds multi-
  sentence cursed artifacts — *"A puppet… over 30 days it attempts to switch the
  owner's mind into the doll…"* handed to a random baker — plus fourth-wall/meme
  entries ("Who Dat Moose?", a "lambda", a Daft Punk lyric).
- `quirk-personality` (99) outliers: bodily-function, prophetic-death,
  anachronistic ("You're a vegan and make sure everyone knows").
- `fear` (216) fires 50% of the time and includes active hooks that redefine the
  character ("currently a fugitive", "being hunted by weretigers").
- `prejudice` (32) is 25% of the Flaw slot and drops real-world bigotry
  categories verbatim ("Racist: specifically toward elves").

**No coherence pass.** Demeanor rolls `calm` and `stressed` independently; a
cheerful `mood` coexists with a blasphemer `flaw` and a corpse-in-the-well
backstory. The only post-processing is cosmetic prefix-folding.

**Fix shape:**
- **Wire role/context into `build()`** (the param already exists). Branch on
  role: a Villain draws from `gm/villain/*`; a Ruler/Keeper suppresses the
  charlatan backstory and cursed-item keepsakes by default; settlement race
  weights `gm/npc/race` (a dwarven hold currently still rolls ~80% Human).
- **Tier the tables** — Tier 1 always-safe flavor (appearance, mannerism, mood,
  faith, real `flaw`, sentimental keepsake); Tier 2 opt-in wild
  (`keepsake-oddity`, most `keepsake-weird`, `backstory-charlatan`, situational
  `fear`, `prejudice`, outlier quirks) rolled only when a "spicy" flag is set.
- **Fix weights even before tiering** (charlatan 1:9, sentimental keepsake
  dominant, mundane goal over active fear).
- **Curate out** the worst entries (multi-paragraph cursed artifacts, meme/
  fourth-wall, scatological/self-harm quirks, the bigotry list).
- **Add coherence gating**: derive demeanor/mood from a single temperament roll.

---

## 7. Complaint 5 — control & motivation fields have no default or roll

**The fields exist but are essentially always empty on generation.** The only
path that lifts output into structured `fields` is `blocksToEntity`
(`adapters.ts:45-88`), which lifts **only** `population` + size tag (and
`race`/`gender` for persons). Everything else stays body prose.

| Kind | Control/motivation field | Status after generation |
|---|---|---|
| settlement | `government` | **empty** — computed but written to a body keyValue pair, not `fields` (`settlement.ts:64-77`) |
| settlement | `ruler` (→person) | **empty** — never set by any generator |
| settlement | `defenses`, `trade` (field) | **empty** — not generated / prose only |
| faction | `government`, `goal`, `methods`, `leader`, `seat` | **empty** — faction has `"generators": []`; "Add faction" only offers *Create blank* |
| person | `motivation`, `flaw`, `home` | **empty** — wants live in prose, not the field |

So the owner is exactly right: the information often exists, but as
**un-queryable body text**, so downstream logic and inheritance can't consume it.

**The world-connection plumbing already exists — it just feeds prose and throws
the best data away.**
- `politicalParentAt(x,y)` (`world.astro:1542-1563`) resolves a hex → the
  claiming **crown** entity, then finds its region. `lawOfTheLand`
  (`:1018-1027`) walks ancestors for the first `fields.government`. `ctxFor`
  injects it, and the composite renders "…the realm's law runs here."
- **Gap 1:** that context flows only into prose; the settlement's own
  `fields.government` stays empty, so a child's `lawOfTheLand` reads nothing —
  **inheritance never compounds.**
- **Gap 2:** `politicalParentAt` *knows the claiming crown* (`:1557`) — the
  perfect source for a `ruler`/"controlled by" default — but uses it only to
  locate the region and then **discards it.** The crown's `fields.leader` is
  never propagated.
- **Gap 3:** there is **no `controlledBy`/controlling-faction field** to default
  into. Only `ruler` (a person) and free-text `government` exist.

**No per-field inspiration roll.** `fieldRow` (`world.astro:453-484`) renders
each registry field as a bare input/select/textarea with **no dice button**. Dice
exist only for whole body blocks (`data-rblock`) and per-pair statblock rerolls
(`renderStatblockRerollable`, `:1439-1455`) — both operate on *body content, not
fields*. So a user wanting a fresh idea for `ruler`, `goal`, `motivation`, or
`government` has no roll affordance. (Bug worth noting: the per-pair reroll's
`freshStatblock` calls `runComposite(tool, seed)` with **no context**
(`:1408-1417`), so rerolling a settlement's "Government" pair drops the realm-law
context and contradicts the world.)

**Fix shape:**
- Lift the already-computed realm-law string into `fields.government` in
  materialization (today only `population` is lifted).
- Capture the crown `politicalParentAt` already resolves; default settlement
  `ruler` to the crown's `fields.leader`, and add a `controlledBy`
  (entityRef→faction) field defaulted to the claim owner.
- Give faction a real generator (or at least per-field rolls from the `webs.ts`
  `CONFLICTS`/goal tables), since it has none today.
- Add a 🎲 to `fieldRow` for the fields that matter (`government`, `ruler`,
  `goal`, `methods`, `motivation`, `vocation`, `flaw`), reusing the per-pair die
  as a template — and fix it to pass `ctxFor` context so a rerolled government
  still respects the realm.

---

## 8. Content-quality notes (voice, scale, typos)

- **Civics-textbook register.** `atmosphere`, `morale`, `government`,
  `intrigue`, `economy-type` read like a modern politics textbook —
  *"Polarized Atmosphere: deep ideological divisions…"*, *"Free Market
  Economy… supply and demand with limited government intervention"* — clashing
  with the fey/fantasy voice of `cuisine`/`trade-resource` ("Phoenix Ash",
  "Mithril Ore"). Rewrite in-register or route the realm-scale ones only to the
  realm/government composite.
- **Scale mismatch.** `atmosphere`/`morale`/`intrigue`/`government` are written
  about "the nation"/"the country" ("foreign espionage", "the nation's future")
  and read oddly on a 200-person village. Fork settlement-scale variants.
- **Typos** in older tables: `twist` has "prohibited form killing",
  "exteraneous", "compelete", "goas".

---

## 9. Unused richness — ~5,000 authored entries the world never sees

Already-authored tables sitting idle behind the world builder:

| Table(s) | Entries | Where they should go |
|---|---|---|
| `gm/government/leader` / `citizen-goal` / `goal` / `method` | ~2,200 | settlement's named authority + civic goal (§7) |
| `gm/villain/*` (motive/objective/method/trait) | ~1,400 | the Villain branch of npc-block (§6) |
| `gm/dungeon/riddle` | 100 | the dungeon composite (§4c) |
| `quest.*` + `adventure.*` (30 tables) + `hooks.*` | ~4,000 | quest chains & the `event`/quest composites (§5) |

---

## 10. Recommendation roadmap (prioritized)

**P0 — the additive core (fixes complaint 1, unblocks the rest).**
Introduce the "compute a deterministic core record, then decorate" pattern
(model: `encounter.ts`). Thread the full `SettleNode` context into
`settlement.ts`; roll prosperity + danger axes up front and draw consistent
flavor. Handle `abandoned` inside the composite.

**P0 — promote meaning to `fields` (fixes complaint 5's data half).**
Have materialization/`adapters.ts` write `government` (and, once generated,
`ruler`/`economy`) into `fields`, and default `government`/`ruler`/a new
`controlledBy` from the crown that `politicalParentAt` already resolves. This one
change makes inheritance compound and unblocks downstream context.

**P1 — signature-detail rollers + biome flavor (complaints 2 & 3a).**
`gm/settlement/signature` (unconditional) and `gm/landmark/oddity`;
`gm/settlement/biome-flavor` wired into settlement; complete the landmark EXCLUDE
map and apply it to all sub-rolls.

**P1 — NPC role/context + tiering (complaint 4).**
Wire role into `npc-block.build()`; Villain→`villain.json`, Ruler/Keeper suppress
wild content; split tables into safe/wild tiers; fix the charlatan/keepsake/fear
weights; curate the worst entries; single-temperament coherence.

**P1 — dungeon & lair composites (complaint 3c).**
`dungeon.ts` (multi-room, riddle gate, per-room encounters, hoard) and `lair.ts`
(resident villain + guardians + treasure); route feature kinds in
`onMaterializeGhost`.

**P2 — encounter/quest variety (the "not always monsters" ask).**
Non-combat `event` branch; runnable `quest.ts`; `buildQuestChain` reads the
quest/adventure tables instead of the hardcoded `TROUBLES` array.

**P2 — per-field inspiration die + content voice pass.**
🎲 on `fieldRow` fields (context-aware); rewrite civics-textbook entries in
register; fork settlement-scale variants; fix typos.

**Engine guardrail (do first, it's small):** make the `{table:x#tag}` empty-tag
fallback (`roll.ts:76`) fail loud in dev / pick a safe default rather than
silently drawing the whole table — otherwise every tag-gate we add can leak.

---

## 11. Key file references

- Engine: `src/engine/roll.ts` (tag fallback `:72-77`), `composite.ts`
  (composer `:52-98`), `rng.ts`.
- Additive reference: `src/composites/encounter.ts:92-121, 159, 213-215`.
- Derailing composites: `src/composites/settlement.ts:44-92`,
  `landmark.ts:22-72`, `npc-block.ts:21, 42-64`.
- Context assembly / discard: `src/pages/world.astro:1000-1056` (`ctxFor`),
  `:1542-1563` (`politicalParentAt`), `:1722-1780` (ghost materialization,
  `:1730` the two-scalar bottleneck, `:1732/1767-1769` feature fallback),
  `src/everdeep/settlements.ts:99-122` (rich context that gets dropped).
- Fields: `src/everdeep/adapters.ts:45-88`, `world.astro:453-484` (`fieldRow`,
  no die), `:1408-1455` (per-pair reroll, context-dropping bug).
- Quests: `src/everdeep/webs.ts:299-306` (hardcoded `TROUBLES`), `:321-388`.
- Feature ghosts: `src/everdeep/density.ts:73-96, 118-160`.
