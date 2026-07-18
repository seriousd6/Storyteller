# The Campaign Codex — wiki, characters, spells

*Owner vision (2026-07-17): a spellbook with hover tooltips; a proper 5e
character sheet; and a world "wiki" — rich notes, intuitive editing of places /
people / connections, wiki cross-linking, GM characterization notes, per-entity
photos, a disposition-toward-the-party dropdown with a "why", and one searchable
notes surface across everything.*

*This doc is the architecture for that vision, grounded in what the codebase
already does. It is a companion to `docs/sheets/PLAN.md` (Sheet Builder) and
`docs/sheets/GENERATORS-AS-ONEPAGERS.md`, and coordinates with the world/map
work in `docs/MAPS.md`. Owner decisions this doc encodes: **build the 5e sheet
first**; **source spells from SRD 5.1 (CC-BY-4.0)**.*

## 0. The headline: ~70% of this already exists

A survey of the tree found most of the vision is already built in alpha form.
The real work is exposing/editing what's stored, adding one dataset (5e spells),
and unifying search — not building from scratch.

| Capability | State today | File |
|---|---|---|
| Entity model: fields, body blocks, tags, aliases, **relations[]** `{type,target,note,start,end}` | built | `engine/worldStore.ts:36` |
| Wiki cross-links: `{@e id\|Name}` tokens, `@`-autocomplete, backlinks, hover cards | built (in-page) | `pages/world.astro:400,1802` |
| Full-text-ish search over name/aliases/tags/fields/body; a `note` kind | built, **single-world, linear, cap 40** | `world.astro:496` |
| IndexedDB + two-device merge + Drive backup/sync of worlds | built | `worldStore.ts`, `backup.ts`, `sync.ts` |
| Image upload → downscale → content-hash store → render; `ImageBlock` | built, **wired to sheets only** | `engine/assetStore.ts`, `blocks/image.ts` |
| Procedural SVG portraits for `person` | built | `everdeep/portraits.ts` |
| Character-sheet spine: `statGrid` (5e mod = `floor((v-10)/2)`) + `rollable`, `tracker`, `actions` w/ `$var` formulas, dice (`4d6dl1`, `2d20kh1`) | built | `engine/vars.ts`, `blocks/*`, `engine/dice.ts` |
| Spell **names** (cantrips…level-9) | built | `data/gm/spells/*.json` |
| Spell **mechanics**, hover-card/popover UI | **absent** | — |

## 1. Epic — 5e character sheet  ✅ Phase A shipped

`character-sheet.json` was already a system-agnostic sheet. The 5e version is a
**content/config specialization**, not engine work:
`src/sheets/templates/dnd-5e-character.json` — six abilities (tap-to-roll checks),
six saves, all 18 skills, a prof/AC/speed number strip exposing `$prof`, HP +
Temp HP + Hit Dice + Death-Save trackers, attacks with `1d20+$str.mod+$prof`,
a Rolls block (initiative, spell attack, death save, 4d6dl1), spellcasting +
1st-level slot tracker, and self-filling spells / personality / backstory from
`{table:gm/spells/*}` and `{table:gm/npc/*}`. **Adding the JSON auto-registers
it** (the gallery globs `sheets/templates/*.json`) — zero edit to the hot
`sheet.astro`. Deep-linkable via the Batch 219/220 bridge
(`/sheet/?template=dnd-5e-character`).

✅ *Character builder shipped (SRD 5.1):* `engine/dnd5e.ts` is a pure, tested
ruleset (12 classes, 9 races, backgrounds, level-scaling proficiency/HP/ASI,
spell slots for full/half/pact casters); `composites/dnd-character.ts` is a
composite with **Class / Race / Background / Level / ability-method dials** whose
`build()` computes a mechanically-correct sheet (racial ASIs applied, saves +
skills as proficiency-aware roll formulas, spellcasting for casters). It opens as
an editable sheet via the bridge (`/sheet/?template=gm/dnd-character&class=…`),
so "pick class/race/level" = the dials and "randomize" = Generate (an
edit-context affordance; play mode hides it). SRD 5.1 is CC-BY-4.0 — see
`LICENSE-SRD.md` and the About page. `smoke-dnd5e.mjs` proves the numbers.

Deferred (character builder): exhaustive per-level feature lists (today: level-1
+ curated signature features), subclasses, class spell lists, the full feat
catalog (SRD's is minimal), multiclassing, point-buy. The *mechanics* (scores,
proficiency, HP, saves, skills, slots) are complete and level-correct.

Deferred niceties (static template): a first-class *skills/saves proficiency
toggle* (today: edit the formula to add `+$prof`); a per-template `genre` field
to pin Fantasy (today: cosmetic default).

## 2. Epic — World wiki: editor, connections, feelings, photos, rich notes, search

The load-bearing model already exists; the work is **UI over stored fields** plus
**a refactor to shared modules** (so this doesn't pile onto the 2,950-line
`world.astro` island, and so the Sheet Builder can reuse cross-linking).

- **2a. Connections / disposition editor.** ✅ *First slice shipped (B1):* a
  new **`enum` field type** and a **`secret` (GM-only) field flag** in
  `fieldRow()`, plus person fields — a **disposition dropdown** (Devoted /
  Friendly / Neutral / Wary / Hostile), a free-text **"why"**, **"where the party
  first met them"**, and **GM notes** — the secret ones hidden in Player View.
  ✅ *B3 shipped:* a full **relation editor** — add / annotate / remove typed
  connections between entities, **surfacing `relation.note`** (rendered with
  `{@e}` mentions and shown next to each link) plus any `start`/`end` the render
  used to drop. A datalist of natural phrases ("ally of", "met the party at", …)
  keeps it intuitive; generators (webs.ts) still write relations too. Shown
  read-only in Player View. So "connections" and "met at ‹place›" are now
  first-class links, not just per-person fields.
- **2b. Photos on entities.** ✅ *Shipped (B2):* any entity gets an "📷 Add
  photo" upload (world.astro renderPage/wirePage) → `assetStore.putAssetFromFile`
  → id in `fields.photo` → mounted async via `getAssetUrl` as an avatar; a real
  photo takes the procedural portrait's place for a person; a null URL (bytes
  never synced to this device) says so. `backup.ts` now walks world entity
  assets (`fields.photo` + body image blocks), so photos ride the Drive backup
  instead of silently staying local.
- **2c. Rich notes.** Body editing is a plain `<textarea>`; `renderText()` only
  escapes + expands mentions. Add markdown (or a light rich editor) at the render
  layer, keeping the `{@e}` mention pass.
- **2d. Unified search / "one searchable notes doc".** Today search is one world,
  linear, capped. Add a cross-world/global search view that aggregates every
  `note` entity + entity body. Cheapest substrate: keep notes as `note`-kind
  entities (already searchable + linkable); a global index is the new part.
- **2e. Refactor (enabler).** Extract the mention token + render + backlinks
  (`world.astro:400-422,1802-1858`) and `matches()` search into engine modules
  (`engine/mentions.ts`, `engine/notesSearch.ts`) so both `world.astro` and
  `sheet.astro` share one linking/search implementation (the Earth-2026 "no
  drift" rule, CLAUDE.md).

## 3. Epic — Spellbook + hover tooltips  (largest; needs the dataset)

- **3a. Data (decided: SRD 5.1, CC-BY-4.0).** New `schemas/spell.schema.json`
  (name, level, school, castingTime, range, components {v,s,m}, duration,
  concentration, ritual, classes, damage, save, description). Store lazy-loaded
  off the main bundle — either `public/data/spells/level-N.json` fetched on
  first tooltip, or a `src/data/spells/*` glob mirroring `tableLoader.ts`.
  **Licensing:** add `LICENSE-SRD.md` / `NOTICE` with the required CC-BY-4.0
  attribution ("includes material from the SRD 5.1 … by Wizards of the Coast …")
  and surface it on `about.astro` — this is the repo's first formal
  rules-content license (today only informal community `credits[]`).
- **3b. Hover-card UI.** The engine's only tooltip today is native `title=`.
  Build the first real popover: positioned, keyboard-focusable, ≥44px touch
  target, dismissible — model on the lazy dice-stage overlay. Reusable by the
  wiki entity cards too.
- **3c. Inline `[[spell:Fireball]]` token.** Extend `engine/inline.ts` alongside
  the dice/table chips (live on static/play/print, literal in edit); autocomplete
  from the spell list. The unused `BlockDef.hydrate` hook is the activation seam.
  The 5e sheet's Spells list becomes hover-enabled once this lands.

## 4. Phasing & coordination

- **A — 5e character sheet.** ✅ Shipped. Additive JSON, no shared-surface edit.
- **B — connections/feelings + photos (2a, 2b) + the refactor (2e).** Highest
  value per risk. Touches `world.astro` (other session's hot file) → land the
  shared-module extraction first, then build on it. *B1 shipped:* enum + secret
  fields → person disposition/why/met/GM-notes. *B2 shipped:* photo upload on any
  entity, backed up. *B3 shipped:* the relation editor (add/annotate/remove typed
  connections, note surfaced). *Next:* the mention/search extraction (2e), which
  Phase C's unified search builds on.
- **C — rich notes + unified search (2c, 2d).**
- **D — spellbook (3a–3c).** Biggest; the licensing + dataset is the gate.

**Coordination:** both target surfaces (`world.astro`, `sheet.astro`) are the
parallel session's active turf. Every phase past A should extract shared engine
modules rather than grow the islands, gate in a private worktree on a unique
`STB_E2E_PORT`, and rebase before push (CLAUDE.md working agreement).
