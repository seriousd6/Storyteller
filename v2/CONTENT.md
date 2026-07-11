# Content authoring guide

How table content gets written, decomposed, and enriched. Applied to Tavern +
Loot in the first content pass (2026-07-11); apply to every generator migrated
in Phase 3.

## The three questions (ask of every hardcoded string)

1. **Can it be decomposed into tables?** Does a set of entries share a
   syntactic frame ("You notice a ___ playing a ___ game…")? If so, the frame
   becomes a template and the variable parts become tables or picks.
2. **Can templates reach *more* tables?** Existing tables are a vocabulary —
   `name-person`, `name-place`, `name-monster`, `name-adjective` power the
   constructed notices and drink names, not just tavern names. Before writing
   a new list, check whether one already exists.
3. **Is there missing logic or randomization?** Quantities ({num}/{count}),
   optional suffixes (weighted wrapper entries), conditional flavor, and
   whole sub-generators the legacy site had but never surfaced.

## Template tokens

| Token | Meaning | Use for |
|---|---|---|
| `{table:<id>}` | Roll another table recursively | Anything reused, long, or worth curating |
| `{table:<id>#<tag>}` | Roll restricted to entries carrying `<tag>` | Categorical templating: contrast names ("The {#good} and the {#evil}"), themed rolls |
| `{pick:a\|b\|c}` | Inline uniform choice | ≤ ~8 short, single-use variations — don't create a table file for "card\|hand" |
| `{num:a-b}` | Random integer as digits | Money, measurements, DCs |
| `{count:a-b}` | Random integer in words | Prose and names ("The Seven Wolves") |
| `{var:n=table:<id>}` | Roll AND remember under `n` | First mention of a repeated entity |
| `{var:n}` | Repeat remembered text | Internal consistency — a rumor naming the same person twice, a WANTED poster repeating its monster |

Every token except `{var:n}` references is an individually rerollable fragment
in the UI — decomposition isn't just cleanliness, it's what makes à-la-carte
rerolling possible. `{var:n}` references re-resolve only when the whole line
rerolls; rerolling just the binding fragment leaves references stale by design.

## Standing rules

- **Never instruct the reader to roll.** "Roll on the Wild Magic Surge table"
  must BE a roll: `{table:gm/magic/wild-surge}`. The validator warns on any
  "roll on … table" phrasing; the extractor rewrites known legacy phrases.
- **Tags are the path to dynamic tables.** Entries may be objects with `tags`
  (e.g. monsters tagged good/evil/big/small; persons noble/lowly/holy/shady).
  Filtered rolls fall back to the whole table if a tag matches nothing, but the
  validator errors on tags no entry carries.
- **Consistency patterns**: shared descriptors via vars ("The {var:adj=…}
  Duke and the {var:adj} Dragon"), repeated entities in rumors/notices, and
  contrast pairs via opposing tags.

## Decision criteria

- **Decompose** when entries share a frame. (Ported this way: song builder,
  gambling games, tavern names, insults, rumors.)
- **Keep curated** when the value *is* the authored specificity — named bards,
  complete rumors, drink lore, weapon histories. Decomposing these produces
  mush. Instead:
- **Wrap**: the slot's table becomes `curated (weight N) | constructed
  (weight M)` so curated gems still appear but the constructed variant adds
  endless variety. (Done for: first impression, drinks, notices.)
- **Articles**: never leave `a` in a template directly before a token whose
  options vary between vowel/consonant. Put the article inside the pick
  (`{pick:A polished|An uncut}`), use invariant phrasing ("A certain…",
  "One…"), or rely on the extractor's `a(n)` resolver for legacy text.
- **Punctuation**: if pick options carry end punctuation, the template must not
  repeat it.
- **Plurals**: keep quantity and noun agreement inside one token's options
  ("two Xs" style templates force the plural on every option).

## Pass 1 record (Tavern + Loot)

**Ported logic the pilot originally skipped**: song builder (subject ×2,
popularity, occasion, performance, melody, tempo + curated classics),
gambling-game builder (card/dice/board rules, named best/worst hands, stakes,
renown, origin — now 15% of tavern events).

**Enriched with constructed variants**: first impressions (crowd/smell/sound),
drinks (name/base/serving/minor effect — names reuse `name-adjective` +
`name-monster`), notice board (8 templates reusing name-part tables), gem cuts,
coin purses (`{num}` ranges), weapon appearance quirks.

**Kept curated deliberately**: bards (named NPCs with backstories), tavern
flavor lines, complete rumors, food specials, weapon histories, enchantment
lists (already templated on type/damage/ability tables).

**Known gaps for later passes**: rival adventuring party generator (needs
race/class data — now available), tavern premise list unused, weapon histories
mix two voices ("…was forged" vs "This weapon…").

## Phase 3 record (bulk migration, 2026-07-11)

Migrated: adventure, villain, plot hooks, wagon, world, government (24 types,
type-tagged), magic (146 schools, school-tagged, `${buildClass()}` →
`{table:gm/magic/practitioner}`), NPC (character pools, body features, races +
~2k names tagged by race/sex, prophecy/omen/host chains, the tavern cat), shop
(28 merchant inventories, type-tagged), treasure maps/chests, monster DB
(CR/size-tagged, feeds Phase 4 encounters).

**Deferred** (extract when needed): settingBuilder.js + SettingBuilder2.0.js
(town/faction/guild/cult generators — heavy local-name reuse needs line-keyed
extraction), NPC reaction Tables.js composed reaction/motivation/area system
(deeply cross-referential `${fn()}` chains), adventure.js dungeon builder +
subplane builder (index-paired lookup tables), loot.js art-object story
templates, character.js duplicate food/song lists (tavern already has them).

**Polish queue — cleared 2026-07-11:**
- `gm/npc/communicate` gerund/comma fragments (plus typos "declarring",
  "sharring") that read wrong as "they {communicate}:" were replaced with a
  curated finite-verb override in `extract-phase3-npc.mjs` ("they whisper
  conspiratorially:").
- `gm/npc/marking-type` "…tattood" / "A awakened shrub" warts are rephrased by
  the extractor (parenthetical quality, no article before a table ref).
- The stray `gm/shop/inventory` header row ("Quality Items Price Quantity")
  is now filtered out at extraction. Shopkeeper stock arithmetic is otherwise
  `{num:}`-tokenized (526 tokens); no further static-count warts found.

## Phase 4 record (composite builders, 2026-07-11)

Composites live in `src/composites/*.ts` — TypeScript, not JSON, because they
run logic templates can't express (XP budget solving, tiered hoard dice,
parsing structured wrapper text back into fields). Conventions:

- **Structured wrappers can be parsed back apart.** `gm/npc/race` renders
  "Race: X. Name: N. Racial note: R" — the Quick NPC regex-parses that into a
  statblock header. Same for shop premises ("Name - description"). Always keep
  a fallback for entries that don't match.
- **Fold self-labels into field keys.** Motivation entries lead with
  "Goal:"/"Fear:" — the composite turns that into the key (Wants/Fears)
  instead of printing "Wants: Goal: …".
- **Keep cards tight.** The encounter card dropped its Weather row — the
  seasonal weather entries carry paragraph-length rules text that drowned the
  card. Long-form flavor belongs on the slot generators, not one-pagers.
- **New original tables**: `gm/encounter/tactics` (24), `gm/encounter/twist`
  (24) — written for the encounter card, generic across monster types.
- Registry closures for composites are scanned straight from the TS source
  (quoted `gm/...` ids + `{table:` prefixes), so interpolated tags like
  `{table:gm/shop/inventory#${slug}}` still resolve; the smoke test builds
  every composite against its own registry chunk to catch closure gaps.

## Phase 5 note (Colostle direction, 2026-07-11)

Colostle was **concept-mined, not ported as a companion** (see OVERHAUL.md
Phase 5 for the owner decision and `extract-solo.mjs` for the extraction). The
system-neutral character-depth and quest content became the Character and Quest
oracles; game-specific vocabulary was filtered out and stays parked in `v1/`.

One engine primitive survives from the parallel Colostle-companion experiment
and is kept for general reuse:

- **`drawN(tableId, n)`** on the composer draws N distinct rows
  (draw-without-replacement, each rendered through the engine) — useful anywhere
  a tool needs "several different rows at once" keyed to a dial (the legacy
  `shuffleSlice` idiom).

## Phase 6 record (Writing pillar, 2026-07-11)

All content is **original**, authored fresh — the legacy `wisdom.js` quote list
is a scraped, partly-misattributed listicle, so it was not ported. New optional
composite affordances: `meta.timer` (a countdown keyed to an option's minutes,
for the Writing Challenge) and `meta.note` (a caption under any tool). Both live
in `Composite.astro` so every pillar can use them.

## LIGHT adaptation note (2026-07-11)

The `v1/Light/*.js` files are the published LIGHT rulebook transcribed into
comments (copyrighted prose, no code). Nothing was ported. Instead its
*system architecture* was **absorbed** into two original system-neutral solo
composites — the same "learn the structure, author fresh content" approach:

- **Mission Oracle** (`solo/mission`) borrows the composable-mission pattern —
  small tables that feed each other, including a roll-two-and-combine recursion
  ("two forces already at war") and a stakes dial that stacks complications.
- **Action Oracle** (`solo/outcome`) borrows the wide-middle d6 ladder (most
  rolls are success-with-a-cost) and a keep-the-better/worse-of-2d6 odds dial.

When adapting a commercial game: reword the mechanics in the abstract, author
100%-original table content, and keep proper nouns / setting terms / rules prose
out. Genre-neutral phrasing (no specific tech or setting) makes the tables reusable.

## Inspiration Deck note (2026-07-11)

The `v1/StoryTelling/*.png` card images are a **commercial deck (© Oddfish
Games)**, not owner-made — so neither the images nor their word lists can ship.
The `/writing/inspiration/` tool absorbs only the *format* (draw a card = a word
+ a few associations) with 100%-original decks (`src/data/writing/inspiration/*`).
These deck tables are loaded directly by the `InspirationDeck.astro` island via
`import.meta.glob` (not through a generator/composite), so they carry no
`{table:}` refs and never enter a registry closure — the validator still checks
them like any table. Card entry format: `HEADWORD — assoc, assoc, assoc`.
