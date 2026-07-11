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

**Polish queue**: some `gm/npc/communicate` entries carry gerund/comma phrasing
into prophecy/omen templates; shopkeeper stock counts partially resolved to
static numbers where dice arithmetic didn't match the `{num:}` rewriter.
