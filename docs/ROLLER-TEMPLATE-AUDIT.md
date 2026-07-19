# Roller template & content audit (2026-07-19)

Triggered by the owner's five-point ask after seeing the **Government** and
**Tavern** roller pages ship as walls of prose:

1. **Break up monoliths** that already contain distinct sections (Government's
   Leadership / State Goals / Methods / Citizenry / Complication all crammed
   under one "Government." heading).
2. **Templatify further** — any table that is just baked string-selection gets
   evaluated for a template + sub-tables, so results are *logical* random
   selections, not one of N frozen sentences.
3. **Subsection reroll highlighting** on every roll section, once (1) and (2)
   land — every distinct piece is its own rerollable fragment.
4. **Remove memes & harsh topics** — suicide / rape / self-harm / slurs, plus
   pop-culture / real-person / anachronism immersion-breaks.
5. **Fixed string starts** ("You notice", "It is loved by", "The rules are
   simple", "The villain…") get `{pick:}` variants so repeats don't align.

This document is the diagnostic + batch plan. Three fan-out surveys fed it
(monolith structure, fixed-string/templatify, content-moderation). File:line
anchors are as of `origin/main` @ `e9dd13b` (Batch 278).

---

## The architecture (what's actually possible, and how)

There are **two render surfaces** and the fix for a monolith depends on which a
tool uses:

- **Slot generators** (`src/generators/*.json`) — declarative. `Generator.astro`
  resolves each slot's template into a **node tree**, so every `{table:}` /
  `{pick:}` / `{num:}` token is already an **individually rerollable fragment**
  with hover highlighting. **But a slot cannot flow a rolled value to a sibling
  slot** — tags in `{table:id#tag}` are *static literals* (`roll.ts` regex
  `[a-z0-9/#-]+`; no `#{var}`). So a group whose sub-rolls depend on a rolled
  *type* must live in ONE roll.

- **Composites** (`src/composites/*.ts`) — TypeScript `build(tables, seed, opts)
  → Block[]`. `Composite.astro` **already** mounts a 🎲 reroll + 🔒 lock on the
  statblock name and **every section**, and a per-item 🎲 inside every list
  (`mountControls` / `addItemButtons`, Composite.astro:354-402). **The old
  ROLLER-REVIEW "composites are all-or-nothing" note is OUTDATED.** A composite
  can roll a *type* once and emit each type-gated sub-roll as its own labelled,
  individually-rerollable section.

**Consequence:** a **type-gated** monolith (sub-rolls chosen by a rolled type's
tag) can only be broken up by a **composite**. A **non-type-gated** monolith
(sub-rolls are plain `{table:id}`) can be split **declaratively** into separate
slots/sections in the JSON — no composite needed.

### The model to copy: `shop-page.ts`

`shop-page.ts` is the reference for tag-gated conversion:

```
resolveType(c, opts)  → explicit dial choice wins, else a seeded pick
lockOpts(...)         → returns { type: slug }, resolved ONCE from the base seed
build(...)            → rolls type-tagged sub-tables into separate blocks:
                        paragraph + list (drawN type-tagged) + keyValue
```

`mystery.ts` is the model for splitting a **prose-blob** slot into labelled
sections (its own header says it replaces "the single mashed-together 'Crime
Scene' slot"). `faction.ts` shows reusing the government vocabulary as clean
blocks with a `head()` helper that strips a baked-in "Label: …" prefix.

### Known nuance — coherence on reroll under "Surprise me"

`Composite.astro`'s per-section reroll salts the **whole** seed
(`${seed}#rr:${key}:${n}`) and re-runs `build`, extracting just that section. If
the type is `random` (Surprise me), a salted rebuild re-rolls the *type* too, so
a rerolled sub-section can drift to another type's pool. `lockOpts` freezes the
type only for **save-to-world**, not for tool-page reroll. Options:

- **(carry shop-page's tradeoff)** accept it — picking a type from the dial
  pins it; "Surprise me" reroll may re-roll the spine (consistent with the
  `{var}` reroll semantics in CONTENT.md). *Recommended for parity, lowest risk.*
- **(engine improvement, optional)** have `Composite.astro` apply `lockOpts`
  when re-running `build` for a reroll, so the spine survives even under
  "Surprise me". One change, benefits every type-gated composite. Flagged as an
  optional enhancement, not a blocker.

---

## Part A — Monolith catalog (Goals 1 & 3)

"Monolith" = one slot/entry cramming multiple labelled sub-sections into one
prose blob under one heading.

### A1. Type-gated → **composite required**

| Tool | Table | Entries / nested refs | Buried sections | Action |
|---|---|---|---|---|
| **Government** (`government.json` `government` slot) | `gm/government/government` | 24 / ~168 | Leadership · State Goals ×2 · Methods ×2 · Citizenry · Complication | **Convert to composite** (`government.ts`), shop-page pattern, `type` dial (24 govs). *Flagship exemplar.* |
| **Magic system** (`magic.json` `system` slot) | `gm/magic/system` | **146 / ~730** | Source · Cost · Potency · Accessibility · Mastery | **Convert to composite** — the *largest* monolith, exact government parallel; `school` dial. |
| **Villain** (`villain.json` `villain` slot) | `gm/villain/villain` | 2 (weighted) | Objective · Methods ×2 · Weakness | **Convert to composite** — gated by intelligence class (`#intelligent`/`#mindless`). |
| **Realm** (`realm.json` `government` slot) | *reuses* `gm/government/government` | — | (same as Government) | After Government lands, render realm's government via the shared helper / composite section (see `settlement.ts localGovernment()`). |
| Shop (`shop.json` `shop` slot) | `gm/shop/shop` | 28 | Inventory ×3 | **Already solved** by `shop-page.ts`. Retire/redirect the raw slot (see §4 route retirement). |

### A2. Non-type-gated → **split declaratively** (no composite)

| Tool | Table | Buried sections | Action |
|---|---|---|---|
| Government `economy` slot | `gm/government/economy` | economy-type · Wealth · Taxes · Treasury | Split into separate slots/sections in `government.json` (or fold into the new composite). |
| Government `trade` slot | `gm/government/trade` | trade-type · Export · Luxury | Same. |
| Shop `keeper` slot | `gm/shop/keeper` | Personality · Ideal · Bond · Flaw | Split (shop-page already renders these as a keyValue block). |
| World `species` slot | `gm/world/species` | count · archetype ×2 · Relations | Split into sections. |

### A3. Prose-blob (fragments already reroll, but crammed under one heading)

| Tool | Table | Action |
|---|---|---|
| Adventure `crime-scene` | `gm/adventure/crime-scene` | **Already solved** by `mystery.ts` — retire the raw slot (§4). |
| Loot `treasure-chest` | `gm/loot/treasure-chest` | Split labelled sub-rolls (style/material/trim/mark/trap/lock/key) into a keyValue section — low risk, no type-gating. |
| NPC `host` | `gm/npc/host` | Split host-intro/assistance/role/location/relationship/attitude into a section group. |
| NPC `cat` | `gm/npc/cat` | Optional — narrative by design; low priority. |
| Adventure `war-background` | `gm/adventure/war-background` | Optional — one woven sentence; low priority. |

---

## Part B — Templatify & fixed-string catalog (Goals 2 & 5), ranked

| # | File | Type | The repeated frame | ~N | Strategy |
|---|---|---|---|---|---|
| 1 | `gm/villain/method.json` | fixed-start + templatify | **574/574** open "**The villain** …"; each carries a redundant "Category — " label duplicating its own `tag`. Rolled **twice per villain**. | 574 | Derive "Category" from the tag; drop the "The villain" stem (card already prints "Methods:"). |
| 2 | `gm/villain/objective.json` | fixed-start + templatify | **268/294** contain "The villain …"; 7 verbatim category labels. | 294 | Same: category from tag, strip "The villain" (card prints "Objective:"). |
| 3 | `gm/magic/method.json` | templatify (Cartesian baked flat) | ~14 "Label: definition" prefixes each repeated **15–24×** verbatim. | 335 | Split → `magic/method-category` (14) + `magic/submethod#category` (~230); template `{table:cat}: {table:submethod#cat}`. |
| 4 | `gm/tavern/game.json` + `game-{cards,dice,board}-rules.json` | fixed-start (the screenshot case) | 7 stacked invariant connectives: "You notice a…", "In this game…, and it is known for…", "It is most loved by…", "It was devised…", "The rules are simple, on each turn the player…", "To win, they must… is called…, and the worst is called…". | 3 + 23 | Wrap **every** connective in `{pick:}` — the variable clauses already live in sub-tables. |
| 5 | `gm/adventure/conflict.json` | fixed-start | **49/49** start "**Players vs. **…". | 49 | `"Players vs. {table:gm/adventure/conflict-force}"` (+ optional stem `{pick}`). Cleanest win. |
| 6 | `gm/world/species-archetype.json` | templatify (light) | **41/41** "{Name} — known for {traits}." | 41 | Vary the connective `{pick: — known for\| — renowned for\| — marked by}`; keep name↔trait coupled. |
| 7 | `gm/villain/effect.json` | fixed-start | **60/101** repeat "…non-intelligent creatures…". | 101 | `{pick:The beast\|The creatures\|This menace}` for the mindless branch. |
| 8 | `gm/world/deities.json` | fixed-start | **13/23** start "The deities of the world are …". | 23 | `{pick:The deities of this world are\|Here the gods are\|This realm's gods are}`. |
| 9 | `gm/tavern/braggart.json` | fixed-start | **89/100** start "Most Likely To …". | 100 | `{pick:Most Likely To\|Voted Most Likely To\|Destined To\|Sworn To}`. |
| 10 | `gm/villain/weakness.json` (`#mindless`) | fixed-start | 27 mindless entries nearly all "Non-intelligent villains/creatures …". | 57 | Vary the mindless subject as in #7. |
| 11 | `gm/government/government.json` | fixed-start | "The archetype of a … government is a form of government where…" repeats. Label chain (Leadership:/…) is structural — becomes section labels once split. | 24 | Encyclopedia paragraph is curated-by-design; vary the "archetype of a…" frame only. |

**Curated — do NOT decompose** (authored specificity; would turn to mush per
CONTENT.md): `tavern/first-impression`, `second-glance`, `event-*`,
`notice-board` (already wrapped by `notice-built`), `npc/childhood-story`,
`npc/backstory-normal`, `villain/premade`, `shop/premise`, `hooks/city`,
`adventure/story-intro`, `dungeon/room`, `world/phenomenon`, all `solo/*`,
`writing/*`. Good already-templated exemplars: `notice-built`,
`impression-built`, `drink`/`drink-name`, `npc/prophecy`, `npc/host`,
`npc/motivation`, `loot/treasure-map`, `world/species`, `adventure/war-background`.

---

## Part C — Content moderation (Goal 4)

### C1. HARSH / SLUR — must remove or reword

| File:line | Category | Text (trimmed) | Action |
|---|---|---|---|
| `gm/villain/motive.json:244` | harsh | "…anger, hatred, rage, **rape**, murder, terrorism, zealotry, and nationalism." | drop rape/terrorism/nationalism |
| `gm/villain/motive.json:245` | harsh | "**abused as children or adults - physically, sexually** … **walking the streets with a rifle**." | reword (real CSA + mass-shooting) |
| `gm/npc/backstory-charlatan.json:87` | harsh | "…leading to their **suicide**." | reword |
| `gm/hooks/class.json:2776` | harsh | "…perhaps **self-harm/death** if your table doesn't mind…" | drop aside |
| `gm/hooks/city.json:1912` | harsh | "…entire town **committing suicide**…" | reword |
| `gm/hooks/misc.json:1942` | harsh | "…they **committed suicide together**." | reword |
| `gm/villain/method.json:1282` | harsh | "Execution — **Ritualistic Suicide**…" | remove/soften |
| `gm/villain/method.json:1936` | harsh | "Murder — **Forced Suicide**…" | remove/soften |
| `gm/villain/method.json:3022` | harsh | "Torture — **Forced Self-Harm**…" | remove/soften |
| `gm/villain/method.json:2986,2992,1216` | graphic torture | Flaying · Disembowelment · Drawing-and-Quartering | soften |
| `gm/npc/childhood-story.json:55` | graphic | "…**bagpipe made from human skin**…" (a *childhood* memory) | soften |
| `gm/adventure/twist.json:95` | domestic abuse | "…escape abuse … **violent, alcoholic father**…" | reword |
| `gm/npc/host-intro.json:99` | dated | "A calm **Oriental-looking man**…" | drop "Oriental-looking" |
| `gm/adventure/boss-mechanic.json:95` | slur | "The **Midget Cultists** of Oun-Bashon…" | "Diminutive Cultists" |
| `gm/wagon/model.json:49` | slur | "The Mystic **Gypsy** Vardo…" | "Wanderer's Vardo" |
| `gm/hooks/misc.json:808` · `tavern/notice-board.json:486` · `tavern/song-subject.json:31` · `villain/premade.json:40` | slur | "**gypsies**" / "**Gypsy family**" / "**a gypsy woman**" | "traveling folk / wandering seer" |
| `gm/npc/prejudice.json:48` | slur | "…grudge against **half-breeds**" | "mixed heritage" |

Lower-confidence (real-world-trauma phrasing — review as a batch):
`solo/character/flaw-story.json:16,18,48,55`, `solo/character/emotion.json:1143,1161,4779`,
`npc/backstory-charlatan.json:90`, `adventure/point-of-interest.json:385`.
**Not swept** (out of the named categories — flag if wanted): slavery/slave-trade
(`shop/premise.json:159`, `npc/backstory-normal.json:91`), generic drug content.

### C2. MEME / POP-CULTURE / REAL-PERSON / 4th-WALL

| File:line | Text (trimmed) | Action |
|---|---|---|
| `gm/villain/motive.json:241` | "…(**like MCU thanos in infinity war**)" | drop |
| `gm/villain/motive.json:267` | "The '**Elliot Kalan's Sauron**'…" | reword |
| `gm/adventure/point-of-interest.json:363` | "(**Im aware of the Witcher 3 reference**)" | remove parenthetical |
| `gm/npc/feature-speaking.json:116,35` | "**Snape from Harry Potter**" · "**Yoda speak they do**" | generic reword |
| `gm/hooks/location.json:4990,5056` | "**Zelda-esque** … **rupees**" · "**Fantasy Avengers**" | reword |
| `gm/hooks/city.json:616` | "friendly drunken **hobbits**…tobacco.**qq**" | "halflings"; fix "qq" |
| `gm/world/titan.json:67-68` | "**Eater of Worlds** … **Brain of Cthulhu** … **Crimson**" (Terraria) | rename |
| `gm/tavern/rumor-source.json:125` · `npc/host-intro.json:69,70,46,37,78` | "**gary gygax**", "**Greyhawk**", Tolkien ring, "**Discworld** golems", Steve-Irwin pastiche, real song titles | reword/remove |
| `gm/adventure/seat-of-power.json:51` | "**Monolith from 2001: A Space Odyssey**" | reword |
| `gm/tavern/instruments.json:38` | "**electric guitar** … FOR THOSE ABOUT TO **ROCK**" (AC/DC) | reword |
| `gm/dungeon/graffiti.json:75` | verbatim Lovecraft "**Ph'nglui … Cthulhu … fhtagn**" | optional |

### C3. ANACHRONISM (lower severity — soften unless intentional theme)

`gm/tavern/bards.json:49` (electric guitar), `npc/host-intro.json:84,79`
(YouTube/metalhead), `adventure/flavor.json:45` (smartphones — Technomagic theme,
keep?), `magic/source.json:70` (computers/digital magic — keep?),
`government/goal.json:3106,628` (Internet, AI Governance),
`solo/character/goal-minor.json:41` (blog/YouTube),
`adventure/boss-mechanic.json:79` (punch cards), `hooks/city.json:160`
(nightclub), `tavern/promo-flyers.json:121` (photographs — keep?).

---

## Part D — Reroll-highlighting coverage (Goal 3)

- **Slot generators** — every `{table:}`/`{pick:}` fragment already reroll-
  highlights (node tree). Coverage is complete *except* inside monolith slots,
  where the fragments reroll but aren't broken into labelled sections. Fixing
  Part A fixes this.
- **Composites** — `Composite.astro` reroll-highlights the name + every section
  + list items today. Any new composite (government, magic, villain) inherits
  this for free. **After the conversions, audit every tool once** to confirm no
  section renders as flat text with no 🎲.

---

## Batch plan (proposed order)

Small, gate-per-batch, reversible. Ordered safest/highest-value first.

1. **Moderation — harsh + slurs (C1).** No architecture; pure content. Gate:
   `smoke` + `check`. *Ship first — safety.*
2. **Moderation — memes/pop-culture (C2) + anachronism (C3).** Same.
3. **Government → composite (A1 flagship).** `government.ts`, shop-page pattern,
   `type` dial, sections = Leadership / State Goals / Methods / Citizenry /
   Complication + the existing simple slots (alignment/morale/economy/…). New
   e2e spec asserts the sections render + reroll. Gate: `check` + `e2e` + `smoke`.
4. **Magic system → composite (A1).** Same pattern; largest table.
5. **Villain → composite (A1).** Intelligence-gated.
6. **Realm government section (A1).** Reuse Government's helper.
7. **Declarative mini-splits (A2/A3).** economy/trade/keeper/species; retire the
   crime-scene + shop raw slots (§4 route retirement — owner call).
8. **Templatify B1-B4** — villain method/objective (category-from-tag, strip
   "The villain"); magic/method decompose; tavern game connectives; conflict.
9. **Fixed-string {pick} passes B5-B10** — the connective-variety sweep.
10. **Reroll-highlighting sweep (D)** — verify every tool post-conversion.

Each generation-moving change that touches Earth-baked tables re-runs the bake
per CLAUDE.md; most of these tables are gm-tool-only and don't feed Earth
(verify per batch with a ref grep).

## Open decisions for the owner (forks)

- **Reroll coherence under "Surprise me"** — carry shop-page's tradeoff (dial
  pins the type) vs. the optional `Composite.astro` `lockOpts`-on-reroll
  enhancement. *Leaning: carry the tradeoff now, enhancement later.*
- **§4 route retirement** — retire the raw `shop`/`crime-scene`/`system`/
  `government`/`villain` slot pages once composites cover them, or keep both
  (slot page = "just the fragments", composite = the one-pager)? Prior audits
  left this open as an owner call.
- **Anachronism themes** — smartphones/computers/photographs read as intentional
  "technomagic" flavor in a few tables. Keep as flavor or scrub for period purity?
- **Out-of-scope sweeps** — slavery/drug content not in the named categories;
  sweep too, or leave?

---

## Progress (shipping the plan, 2026-07-19)

Owner said "proceed through it all"; working it batch-by-batch on `main`.

- **281** — this audit + the moderation pass (goal 4): harsh/slur/meme across 23
  tables; Earth re-baked.
- **283** — moderation follow-up ("sweep both"): technomagic anachronisms +
  sensitive solo-table phrasing.
- **284** — **Government → composite** (goals 1, 3): the type essay + Leadership /
  Goals / Methods / Citizenry / Complication broken into labelled, rerollable
  sections; new `gm/government/archetype` table; the "(Compare: real countries)"
  list dropped. Plus the Composite.astro **lockOpts-on-reroll** fix — freezes the
  spine on every per-part reroll (so an autocracy keeps an autocracy's leader;
  also closes the latent gap for shop/settlement/landmark). Slot generator
  retired; `tests/government.spec.ts`.
- **286** — **Magic → composite** (goals 1, 3): the 146-school Source/Cost/Potency/
  Accessibility/Mastery monolith broken into sections; school read from the table
  (no 146-item dial); `tests/magic.spec.ts`.
- **287** — **villain method (574) + objective (294)** (goals 2, 5): dropped the
  redundant category prefix and the "The villain" stem so each entry starts with
  its distinct Title; copula/possessive cases kept.
- **288** — **fixed-string variety** (goal 5): the gambling-game connectives (the
  screenshot case), braggart, world species-archetypes, world deities.
- **289** — villain `effect` subject variety + conflict anachronism cleanup
  (Lovecraftian/AI/tech).
- **290** — economy/trade mini-splits on the Government page (Economy / National
  Wealth / Taxation / Treasury / Trade / Chief Export / Luxury Trade / Cuisine
  each their own rerollable facet) + **realm government** now shows a terse
  `gm/government/brief` line ("Autocracy — <one-line>") instead of the full
  monolith wall (realm is "almanac-style"; its page bundle also shed the whole
  government closure).

### Done / not pursued (rationale)
- **Reroll-highlighting (goal 3): DONE — architecturally.** Slot-generator tokens
  are each rerollable fragments (node tree); composite sections/list-items each get
  🎲 via Composite.astro. Covered by government/magic/rollers reroll specs. No tool
  renders a section as dead flat text.
- **Magic `method` decompose: not pursued.** It's a data-hygiene refactor (store
  the shared definition once, not ~20×) but the *rendered output is identical* —
  submethods are category-tagged, so no new combinations and nothing the user sees
  changes. Low value against the output-focused goals; skip unless the repetition
  bothers the owner in the data.
- **Villain-blob → composite: DEFERRED.** The whole villain generator would drag
  in its SRD statblock render, reskin thread, and premade for a 2-entry blob. The
  blob's own monotony was already killed by 287 (method/objective). Owner's call.
- **shop `keeper`: already fine** (`shop-page.ts` renders it as a keyValue block,
  not a slot-generator blob). **world `species`: minor** single-entry blob in the
  world generator; low value, left.
- **Left intentionally**: conflict's "Players vs. X" frame — a categorised list,
  not repeated prose; the prefix is structural.
