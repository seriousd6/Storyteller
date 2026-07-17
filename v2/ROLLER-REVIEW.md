# Adversarial review — the random rollers (2026-07-16)

## Progress (batches 144–159, this session)

Shipped to `main`:
- **Content** — 144 (deduped 9 tables/236 dupes, 2 malformed tokens, altar/host-role/magic typos), 152 (villain/premade editorial: 95→88, placeholders/pop-culture/crude removed).
- **SEO** — 145 (OG/Twitter/JSON-LD, hand-rolled sitemap, robots.txt, dropped the "being rebuilt" banner, World flagship card). *Follow-up: raster og-image.png for Twitter/FB.*
- **New generators** — 146 Mystery, 156 Faction, 157 Weather & Travel, 158 Trinket, 159 Solo Scene oracle.
- **Product dials** — 147 NPC race/gender, 149 monster creature-type tags (all 697) + encounter theme filter.
- **Correctness / UX** — 151 corrupt-store guard, 155 markdown table escaping, 153 copy-to-clipboard, 154 one aria-live status region.
- **Tests** — 150 first roller e2e spec (now ~12 tests: hydrate, roll-all, fragment reroll, copy, pin→sheet, dials, theme, corrupt-store).
- **Done by the concurrent session** — {var} reroll desync, settlement/landmark lockOpts, countWords>99 + empty-table guards, sheetStore quota + cross-tab sync, dup-id, db retry.

Deferred / not done (needs owner steer or overlaps the live engine work):
- **Name tables** — decompose gm/npc/names/* from morphemes (owner directive; see CONTENT.md). wood-elf==high-elf and name-pool dups wait for that pass. A standalone Name generator waits with it.
- **Bigger UX** — `?seed=` share URLs, roll history/undo, batch-generate (touch the seed/reroll engine).
- **Remaining a11y** — nested role=button, focus-on-reroll, touch tap-targets, color-only depth, portrait float-in-grid/aria (all in the fragment-reroll code the live session owns).
- **Sheet** — Drive per-sheet merge, JSON export/import, save-to-world-with-no-worlds.
- **More generators available** — Trap, Deity, NPC-reaction, Ship, Cult.
- **World** — ctxFor-on-reroll and the map→roller→sheet loop are the live session's domain.

---


Scope: the roller UX, the roll/composite engine, sheet-builder integration, the
467 data tables, and site-level product/SEO. Five parallel investigations, then
the highest-impact factual claims were re-verified against the tree (marked
**[verified]**). File:line anchors throughout.

The through-line: the engine's headline promise — *seeded reproducibility +
per-fragment reroll* — is both its best feature and the root of the top
correctness bugs, because the reroll → pin → reproduce plumbing was never
finished. Fragment-level reroll bypasses the seed/opts bookkeeping everywhere.
And the content risk is inverted from intuition: the **original** solo/writing
tables are excellent (and small); the **imported** gm dumps are large and dirty.
So the highest-ROI moves are *cleaning and surfacing what already exists*, not
authoring more.

---

## Tier 1 — Correctness bugs that reach the shipped site

1. **`{var:n}` desync on fragment reroll.** [verified] Rerolling only the
   defining fragment of a `{var:n=table:…}` changes it while its `{var:n}`
   references keep the old value. Live in the flagship reroll UX: Tavern →
   Notice Board renders the WANTED poster
   [notice-built.json:17](src/data/gm/tavern/notice-built.json) —
   "…the {var:m} … Do not approach the {var:m}. Do not feed the {var:m}." Reroll
   the first monster and the poster contradicts itself. Same in
   [rumor.json:36](src/data/gm/tavern/rumor.json). Root cause
   [roll.ts:199-201](src/engine/roll.ts) + [roll.ts:229-235](src/engine/roll.ts).
   Fix: a var-defining fragment's reroll must re-resolve its owning line (or be
   non-individually-rerollable).

2. **Settlement field-reroll produces self-contradictory settlements.**
   [verified] [settlement.ts](src/composites/settlement.ts) exports no
   `lockOpts` (contrast [shop-page.ts:69](src/composites/shop-page.ts) which
   does), so per-field reroll in a saved world re-derives the settlement *type*
   from a fresh seed — Economy can describe a fishing village under a
   "Market town" header. Already noted in `docs/everdeep/PLAN.md:1415`.
   Fix: add `lockOpts` that resolves `type`/`size` from the base seed.

3. **World rerolls drop the generation context.** `runComposite` merges only
   locked opts over meta defaults; it never re-supplies `ctxFor` (biome, realm
   government/law, known population). A town's Government reroll can contradict
   its realm; Regenerate re-rolls population free of the map's value.
   [world.astro:1328-1339](src/pages/world.astro) vs
   [world.astro:1418-1437](src/pages/world.astro). Fix: recompute `ctxFor` and
   merge under locked opts on the reroll/regen paths.

4. **Two malformed tokens render broken text.** [verified]
   [wild-surge.json:519](src/data/gm/magic/wild-surge.json) `{5e|Polymorph}}`
   (bad prefix + doubled brace) and
   [hometown-secret.json:127](src/data/gm/npc/hometown-secret.json)
   `false hydra*}}` (stray `*` + doubled brace). Only two in 467 files — cheap
   wins. Fix: `{pick:…}` / `{table:…}` and drop the stray chars.

5. **`wood-elf` names are byte-identical to `high-elf`.** [verified] 1200/1200
   entries identical; only the `id`/`title` header differs
   ([wood-elf.json](src/data/gm/npc/names/wood-elf.json)). Pick Wood Elf, get
   High Elf names. **Revised fix (owner, 2026-07-17):** do NOT hand-author a
   replacement pool — all 29 `gm/npc/names/*` tables are flat exports from
   fantasynamegenerators and are slated to be **decomposed into morpheme tables +
   templates** (see CONTENT.md "Name tables — rebuild from morphemes"). `wood-elf`
   is the exemplar / first target of that pass; the duplication is known/deferred
   until then. This also subsumes the name-pool dedup items in Tier 5 (tiefling
   319 dups, shifter/genasi/etc.) — those pools get rebuilt, not deduped.

## Tier 2 — The missing "roller UX" layer (biggest product gap)

The engine seeds everything but exposes almost none of the UX users expect.

- **No share / permalink / reopen-by-seed.** Seeds are stored on every node but
  there is no `?seed=` URL or seed input anywhere ([rng.ts:1-2](src/engine/rng.ts)
  even promises "shareable roll URLs"). Cheapest growth lever on a site whose
  audience posts to Reddit/Discord.
- **Seeded provenance is dead data.** `block.source` is written
  ([Generator.astro:168](src/components/Generator.astro),
  [Composite.astro:168](src/components/Composite.astro)) and read nowhere; there
  is no "re-roll this block." Worse, it *can't* work as stored: composite pins
  drop `opts` (not on `BlockSource`, [types.ts:44-47](src/engine/types.ts)), and
  slot `dataset.seed` goes stale after a fragment reroll
  ([Generator.astro:75-79](src/components/Generator.astro) never updates it), so
  a hand-tuned line pins with a seed that regenerates *different* text.
- **No copy-to-clipboard anywhere.** The only way out is Pin → open Sheet. The
  "give me a tavern name to paste in Discord" case needs a per-result copy.
- **No history / undo / back.** One misclick permanently destroys a result you
  liked (`rerollNode` mints a throwaway `randomSeed()`). Ironically the
  Inspiration Deck *has* a history strip — the pattern exists, unused by the
  actual rollers.
- **No batch generate.** Every tool yields exactly one result; "10 NPCs" = 10
  clicks.
- **Slot pins flatten fragment structure.** Pinning saves `textContent`
  ([Generator.astro:161-170](src/components/Generator.astro)); the per-fragment
  rerollability — the whole selling point — is discarded on the sheet.

## Tier 3 — Accessibility & the interaction model

- **Nested `role="button"` inside `role="button"`.** [High] Every roll node is a
  button that contains child buttons
  ([Generator.astro:66-70](src/components/Generator.astro)) — invalid ARIA;
  wrecks the screen-reader tree.
- **Fragment reroll drops keyboard focus to `<body>`.**
  [Generator.astro:78](src/components/Generator.astro) replaces the focused span
  and never refocuses. Fix: refocus the replacement; add an aria-live "X → Y".
- **Touch model is broken.** Discoverability is `:hover` + `title` only
  ([Generator.astro:293-304](src/components/Generator.astro)); on touch there's
  no hover, tap targets are 2–4-char inline runs, and trying to select/scroll
  fires a reroll and mutates the result.
- **22 simultaneous `aria-live` announcements** on "Roll everything" and on load
  (each slot is its own live region,
  [Generator.astro:29](src/components/Generator.astro)). Make slots non-live; add
  one summary status region.
- **Color-only signaling** for nesting depth (underline hue,
  [Generator.astro:275-289](src/components/Generator.astro)) and lock state
  (border color, [:220-222](src/components/Generator.astro)) — WCAG 1.4.1. Add
  style/thickness variation + a non-color lock cue.
- **Nothing signals what changed** after a roll (no highlight/flash; no
  `prefers-reduced-motion` handling anywhere).
- **Portrait feature:** injected via `innerHTML` with no `aria-hidden`/label;
  `float:right` is applied to a CSS **grid** item
  ([Generator.astro:120/131/312](src/components/Generator.astro); parent `.slots`
  is `display:grid` [:204](src/components/Generator.astro)) so the intended
  right-float layout can't work — the portrait and its "new face" button detach
  from the character (needs a visual check, but float is ignored on grid items
  by spec). The face reroll uses `Math.random()` and the portrait is never
  pinned, so the face a user picks is lost.

## Tier 4 — Sheet-builder integration

- **A corrupt/oversized `stb:sheets:v1` silently discards ALL sheets.**
  [loadStore, sheetStore.ts:33-43](src/engine/sheetStore.ts) treats any parse
  failure as "empty" and overwrites with a fresh sheet — no warning, no backup.
  A foreign backup with sheets lacking `blocks` passes every guard then crashes
  `renderBlocks`. Fix: distinguish absent vs malformed, stash the raw string,
  normalize `blocks ??= []`.
- **Drive "Load" replaces every local sheet** ([sheet.astro:436-438](src/pages/sheet.astro))
  — worlds get a rev-aware merge, sheets don't; device-only sheets are destroyed.
- **No local JSON export/import, no share link.** Export is markdown-only and
  lossy — table cells don't escape `|`/newlines
  ([sheetStore.ts:135-140](src/engine/sheetStore.ts)), so a rolled value with a
  pipe corrupts the table. Backup/sharing is effectively gated on Google Drive.
- **"Save to world" with no worlds navigates away and loses the result.**
  [Composite.astro:202-205](src/components/Composite.astro). Fix: mint a world
  inline, or stash and restore the pending result.
- **Two unlabeled destinations.** Composites offer 📌 (localStorage sheet) *and*
  🌍 (IndexedDB world) with no explanation; slot generators offer only 📌 and can
  never reach a world. Identical-looking results have different homes.
- **Cross-tab lost-write:** the sheet page re-serializes the whole store on every
  keystroke from stale memory; a pin from another tab can be clobbered
  ([sheet.astro:63-72](src/pages/sheet.astro),
  [sheetStore.ts:98-102](src/engine/sheetStore.ts)).

## Tier 5 — Table quality (the weakest ~20%, verified)

Corpus is structurally healthy: **0 dead refs, 0 tag-misses, 2 malformed tokens**
in 467 files. The dirt is concentrated in imported community dumps.

1. **`gm/villain/premade.json`** — the single weakest flagship table. Unfilled
   placeholders shipped as content ("a level [suitable number here] wizard",
   "Champion of (insert evil deity here)"), villains split across 3–4 orphaned
   rows (82; 87/88/89), pop-culture names (James Spader, Hobbes, Lelouch), heavy
   typos, and crude content the owner already wants a moderation pass on.
2. **`gm/adventure/point-of-interest.json`** — 99 exact dups [verified], two
   incompatible formats (titled landmark vs untitled region), recurring
   `alter`→`altar`. Split into two tables + dedupe.
3. **`gm/loot/weapon-history.json`** — three voices (ellipsis-completion vs
   standalone sentence vs first-person), mixed `...`/`…`, 4th-wall jokes.
4. **`gm/npc/host-role.json`** — 12-entry block duplicated verbatim [verified] +
   wrong baked-in articles ("a alchemist", "a innkeeper", "an adventure").
5. **NPC name pools** heavily self-duplicated: tiefling 319 dups [verified],
   shifter ~64% dup, warforged/genasi/kenku/drow similar. Dedupe + top up.
6. **`gm/magic/*` mega-tables** — misspelled tag slugs (`monsterous`,
   `doppleganger`, `assasination`), an `artisan:421` tag outlier (20× every
   other school), repeated `dependant`/`heaviliy` typo, and "roll on this table"
   instructions in wild-surge (59/358/657) — a CONTENT.md rule violation.
7. **Curated tone clashes:** `gm/tavern/bards.json` (Billy/Jimmy name bug,
   electric-guitar anachronisms), `gm/npc/host-intro.json` (YouTube gags, dated
   "Oriental-looking man" — sensitivity fix).
8. Smaller dup cleanups: `toasts`, `war-cause`, `chest-trap/lock`, `racial`,
   `villain/motive|title`.

For contrast, do **not** touch: `gm/settlement/*`, all `solo/*`, all `writing/*`
— original, single-voice, pick-decomposed, the model CONTENT.md prescribes.

## Tier 6 — Missing rollers, options, and shallow tools

New rollers whose vocabulary **already exists and is buried**:

1. **Mystery / whodunit composite** — highest value/effort. Eleven
   `gm/adventure/crime-*` tables are surfaced today as a single slot; assemble
   crime + true perpetrator/motive + `drawN` clues + red-herring suspect
   (`gm/npc/race` + `gm/villain/motive`) + time/weather.
2. **Standalone Name generator** — biggest SEO magnet, near-zero effort. 30 race
   name files + `gm/tavern/name-*` are locked inside NPC/Tavern. "fantasy name
   generator" is the highest-traffic TTRPG search term.
3. **Faction generator** — `gm/government/*` + `gm/villain/*` + `npc/race`.
4. **Weather & Travel roller** — `gm/world/weather-*`, `wind`, `phenomenon`,
   `catastrophe` (buried in the World grab-bag) + `point-of-interest`; natural
   map bridge.
5. **Solo scene-framing oracle** — the Mythic-style "test the scene →
   expected/altered/interrupt" loop the solo pillar is missing. Highest-leverage
   fix for the thinnest pillar.
6. **Trinket, Trap, Deity** generators — mostly existing vocabulary.

Thin option dials on tools that sit on rich data:

- **Quick NPC has zero options** — can't ask for "female dwarf"; race is
  hard-weighted to Human ([race.json:29](src/data/gm/npc/race.json), weight 40).
- **Encounter** exposes only size/level/difficulty because the 697-creature
  monster DB carries only CR + size tags — no creature-type. A "no dragons" or
  "undead lair" encounter is impossible. Add type tags + a theme filter.
- **Mission `low` and `standard` stakes are identical** — one dead dial
  ([mission.ts:10-14](src/composites/mission.ts)).
- **Composites are all-or-nothing** on the tool page — no per-piece reroll/lock
  (only exists after saving to a world, the path broken by Tier-1 #2/#3).

## Tier 7 — Site-level

- **SEO is the #1 site gap** (static content is maximally SEO-able; almost none
  is done): [verified] no OG/Twitter/JSON-LD in
  [Base.astro](src/layouts/Base.astro), no `@astrojs/sitemap`, no `robots.txt`.
  Per-tool titles aren't targeted at real queries. **Kill the "🚧 being rebuilt"
  banner** [index.astro:34](src/pages/index.astro#L34) — it undersells a finished
  33-page product to users and crawlers.
- **e2e covers the map, not the rollers.** No spec loads a tool page, rolls,
  rerolls a fragment, and pins — exactly the hydration-only surface CLAUDE.md
  says smoke can't see. One parametrized Playwright spec across all tool routes.
- **No global tool search / onboarding.** 40+ tools, no cross-tool finder; pillar
  landings show cards but no live sample roll.

---

## Recommended sequence

**Quick wins (hours, ship-visible):** malformed tokens (#4), wood-elf pool (#5),
SEO baseline (OG + sitemap + robots + drop the banner), point-of-interest/
host-role dedupe.

**Correctness (small, high-trust):** `{var}` reroll desync (#1), settlement
`lockOpts` (#2), world `ctxFor` on reroll (#3), corrupt-store guard.

**Product leverage (medium):** `?seed=` share URLs + copy button, surface the
buried Mystery and Name generators, NPC race/gender dial + monster type tags.

**Bigger rocks:** finish the map → context-seeded roller → sheet loop; a
parametrized roller e2e spec; the villain/premade editorial pass.
