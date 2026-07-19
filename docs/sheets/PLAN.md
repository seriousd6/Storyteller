# Sheet Builder 2.0 — live sheets, play mode, library, auto-sync, genre themes

*Drafted 2026-07-17; extended same day with the library, Drive auto-sync,
document types, image fades, genre theming; hardened by an adversarial pass
(§21); then Play mode + animated dice promoted to core scope (§16–17).
Status: architecture, not yet started.*

The Sheet Builder (`/sheet/`) is already the flagship: every generator pins
typed blocks into a sheet you edit, reorder, print, and export
(OVERHAUL.md §"The flagship"). This plan takes it from "a document you
assemble" to "a workspace of documents that play" — for **two audiences**:
the GM prepping a session, and the **player building and running a
character sheet at the table**.

## 1. Competitive position

| | Homebrewery | 5e.tools | Sheet Builder 2.0 |
|---|---|---|---|
| Authoring | markdown + custom syntax | raw JSON (+ tiny GUI for 2 types) | block editor, no syntax to learn |
| Output look | PHB-authentic print pages | database lists | themed print pages (already have print tokens) |
| Interactivity | none — dead paper | clickable `{@dice}`, hover links | clickable dice, **live roll-table widgets**, trackers |
| At the table | print it | reference tabs | **Play mode: tap a stat, animated dice roll the check** |
| Dice | none | text-result roller | **animated, seeded, skinnable — ours or the player's own design** |
| Roll tables | rendered as static markdown | rollable, but flat | **the site's whole table forest embedded + rerollable + user tables** |
| Boilerplate | snippet menu (markdown pastes) | none | template gallery that **pre-fills itself by rolling** |
| Your documents | account on their server | manual JSON files | **local-first library, auto-synced to your own Drive** |
| Look & feel | 5e only (theme = fork the CSS) | 5e only | **genre packs: fantasy / sci-fi / horror** |
| Data model | none (text) | schema-validated JSON | schema-validated blocks (already shipped) |

Homebrewery's strength is the page; 5etools' strength is the data. We already
have both halves (print theme in `tokens.css`, Block union in
`engine/types.ts`). The unique third thing neither can copy: ~hundreds of
in-house tables behind a deterministic engine (`engine/roll.ts`), so a sheet
can *contain* generators, not just their output.

## 2. Design principles

1. **One block, many surfaces** (OVERHAUL.md:134). Every new block type
   renders on generator pages, `/sheet/`, world pages, print, and markdown.
2. **One implementation, no drift.** The Earth-2026 lesson (CLAUDE.md):
   duplicated orchestration fails silently. Same rule here — one renderer
   registry, one table-token linter, one sync engine shared by every store.
3. **Deterministic everywhere.** Every roll is `(template|ref, seed)`.
   Results are re-derivable; share links stay tiny; smoke tests stay
   possible. Animation is presentation: **the engine rolls first, the dice
   land on its answer** (§17).
4. **Local-first; the user's Drive is the cloud.** Every action lands
   locally and never blocks on the network. Sync is a background courier,
   not a gate. We keep the `drive.file` scope — the site can only ever see
   files it created.
5. **Players are users too.** A character sheet that is built once and then
   *played* — tapped, rolled, tracked on a phone at the table — is as much
   the product as the GM's printed prep page.
6. **System-agnostic.** No hardcoded 5e assumptions (no AC/HP fields baked
   in). Mechanical blocks are generic (stat grids, trackers, actions); 5e
   is just a template.
7. **Original trade dress.** Book-like themes, not PHB clones.

## 3. Phase 0 — the Block Kit (refactor that pays for everything else)

Today a new block type must be taught to **four** places: `blockRender.ts`
(static), `sheet.astro renderEditable()`, `world.astro`'s variants, and
`sheetStore.ts blockToMarkdown()`. That's the drift trap.

Build `v2/src/engine/blockKit.ts`:

```ts
interface BlockDef<B extends Block> {
  type: B['type'];
  renderStatic(b: B, ctx: RenderCtx): HTMLElement;
  renderEditable(b: B, ctx: EditCtx): HTMLElement;   // ctx.mode: 'edit' | 'play' (§16)
  toMarkdown(b: B): string;
  hydrate?(el: HTMLElement, b: B, ctx: RenderCtx): void; // activate dice/roll buttons on static surfaces
}
export const blockKit: Record<Block['type'], BlockDef<any>>;
```

- Move the six existing types (title, paragraph, keyValue, list, table,
  statblock) into one file each under `v2/src/engine/blocks/`.
- `blockRender.ts`, `sheet.astro`, `sheetStore.ts` become thin consumers of
  the registry. Behavior-identical; guarded by e2e.
- `RenderCtx` carries the cross-cutting services: the **inline text
  renderer** (§4), the **table loader** (§5), the **asset resolver** (§14),
  and the **dice stage** (§17).
- `EditCtx` carries two things every block edit goes through, and both are
  architecture, not polish:
  - **a store-agnostic commit sink** — `commit(block)` writes to
    `sheetStore` on `/sheet/` and to `worldStore` on world pages. Without
    this, interactive blocks (trackers, rollTable results) only work on
    sheets and world entities fork a fourth rendering path — the exact
    drift §2.2 forbids. A siege tracker on a world entity must Just Work.
  - **the undo bus** — every mutation is a command `{apply, revert}` pushed
    through `execute()`. Per-sheet bounded stack, ctrl+Z / ctrl+shift+Z;
    reroll becomes non-destructive by construction. Bolting a command
    layer onto direct-mutation code later means touching every block type
    twice — it goes in first.
  - `mode: 'edit' | 'play'` — the §16 rule: *edit* exposes structure +
    values, *play* exposes values only, with live tokens.

**Scope honesty**: Phase 0 migrates `blockRender.ts`, `sheet.astro`, and
`blockToMarkdown`. `world.astro` (2,849 lines, with its own GM-only
rerollable-statblock mode) adopts the kit in a **later, separate phase**
behind its own e2e — otherwise Phase 0 balloons into a world-page rewrite.

Exit: sheet + static surfaces render from the kit; `npm run e2e` green;
adding a block type = one new file + schema entry; every edit is a command.

## 4. Inline markup — clickable additions inside text

A tiny inline grammar for paragraph/list/keyValue/statblock text, rendered by
one shared `renderInline(text, ctx)` (extends the `@`-link rendering already
in `world.astro`):

- `[[2d6+3]]` → clickable dice chip: rolls through the dice stage (§17),
  shows result, click again to reroll; tooltip shows the breakdown.
  (5etools' `{@dice}`, but ours is seeded, animated, and pinnable.)
- `[[table:gm/loot/gems]]` → inline roll chip: rolls that table via the real
  engine (nested refs and all), swaps in the result text, 🎲 to reroll,
  📌 to pin the result as provenance-stamped block.
- `@Entity` links (existing world convention) work on sheets too when a
  world is active — hover shows the entity card, click navigates.

Editing rule (keeps contenteditable sane): in **edit** mode tokens display as
literal `[[…]]` text with a subtle chip tint; they are live in play mode and
on static/preview/print-preview surfaces. No WYSIWYG-inside-token editing.

Dice math is a new pure module `v2/src/engine/dice.ts` — the engine's
`roll.ts` stays table-focused; composites' ad-hoc dice helpers migrate onto
it later. **The grammar is specced and frozen before Phase 1 ships**,
because tokens live inside user text forever and a grammar change is a
data migration:

- terms: `NdM`, integers, `+`/`-`, e.g. `2d6+1d4-1`
- keep/drop: `kh`/`kl`/`dh`/`dl` with count — `4d6dl1` (stat rolling),
  `2d20kh1` (advantage), `2d20kl1` (disadvantage)
- variables: `$name` resolved from the sheet's var scope (§6 — statGrid and
  tracker blocks expose their values), e.g. `[[1d20+$str.mod]]`. Numbers
  only, flat namespace, no formula-references-formula. This line is what
  turns a character *page* into a character *sheet*: raise STR once and
  every attack chip on the page updates. It is also a scope-creep magnet —
  the bound (flat, numeric, one level) is deliberate and non-negotiable.
- API: `parse` (validate + AST), `roll(seed, vars)` (result + per-die
  breakdown for the tooltip, the dice stage, and the roll log §16), and
  `min/max/mean`.

## 5. Dynamic table loading — `engine/tableLoader.ts`

Generators ship precomputed per-tool registry closures
(`gen-registries.mjs`), but a sheet's tables are chosen at runtime, so it
needs lazy loading:

```ts
const chunks = import.meta.glob('../data/**/*.json');       // NOT eager — Vite splits per table
async function loadClosure(ids: string[], overlay?: Map<string, TableData>): Promise<Map<string, TableData>>
```

Iteratively: load table → scan its entries with the compiled token regex from
`roll.ts` → enqueue unresolved refs → repeat. `overlay` (user brews, §7) is
consulted first and never fetched. Each table is a ~1 KB chunk; a sheet
downloads only what its widgets reference. `resolveTemplate` stays sync —
callers await the closure once, then roll synchronously (same contract
generators use today).

## 6. New block types

Each is one `blocks/*.ts` file + `block.schema.json` entry + markdown rule.

**`rollTable`** — the flagship integration.
```ts
{ type:'rollTable', id, title?,
  ref?: string,                 // 'gm/tavern/rumor-*' site id, or 'user/<brew>/<slug>'
  inline?: TableData,           // embedded one-off table, same schema as site tables
  display: 'button'|'full',     // compact roll button vs rendered listing w/ clickable rows
  keep?: number }               // retain last N results in the block
```
Rolls through `resolveTemplate` with a fresh `randomSeed()`; every result
carries `{ref, seed}` so 📌 pins a re-derivable paragraph. `display:'full'`
renders the entries as a proper d100-style listing (Homebrewery look) where
each *row* is clickable to force that result.

**`tracker`** — `{ label, current, max?, style:'boxes'|'bar'|'number' }`.
Click/±. Edits write through the `EditCtx` commit sink (they're state, not
chrome), so HP survives refresh, syncs to the tray, and works on world
entities too. Print renders empty boxes. Exposes `$<slug>` / `$<slug>.max`
to the sheet's var scope (§4).

**`statGrid`** — `{ stats:[{label, value, sub?}], computeMods?: boolean,
rollable?: boolean }`. Generic attribute row; `computeMods` fills `sub`
with the d20 `(v-10)/2` convention when values are numeric. Renders as the
classic six-box strip. Exposes `$<slug>` and `$<slug>.mod` to the var scope.
With `rollable`, each box is a button in play mode: **tap STR → the dice
stage rolls `1d20+$str.mod` as a "Strength check"** — checks and saves with
zero per-sheet configuration.

**`actions`** — the attacks/spells/abilities row, built for play mode:
```ts
{ type:'actions', id, title?,
  items: [{ label,                       // "Longsword", "Fire Bolt"
            rolls: [{ name, formula }],  // e.g. to-hit: '1d20+$str.mod', damage: '1d8+$str.mod'
            note? }] }
```
Each item renders as a row with one button per roll (or "roll all" for
to-hit + damage together). System-agnostic: `rolls` is just named formulas;
"check / save / attack" are template vocabulary, not engine concepts.

**`image`** — `{ assetId?, portrait?: PortraitRecipe, caption?, layout,
fade?, blend? }`. Either an uploaded asset (§14) or a deterministic SVG
portrait recipe (`everdeep/portraits.ts` already generates these). **Gated
on the IndexedDB migration (§8)** and specified fully in §14.

**`columns`** — `{ columns: Block[][] }` (nesting precedent: statblock
sections). Two-column book layout on screen and print.

**`pageBreak`** — `{}`. Renders a dashed rule on screen, `break-after: page`
in print. With `columns`, this is Homebrewery's `\page`/`\column` pair.

## 7. Homebrew tables ("brews")

Users author their own roll tables and use them anywhere a site table works —
the 5etools merge-at-runtime model SURVEY.md already endorses (§68-77), minus
the raw-JSON authoring.

- **Store**: `v2/src/engine/brewStore.ts`, IndexedDB DB `stb:brews`, store
  `brews`: `{ id, name, tables: TableData[], rev, updatedAt }`. Table ids
  are namespaced `user/<brewSlug>/<tableSlug>` — can never shadow site ids.
- **Editor**: a "My Tables" panel on `/sheet/` — title, entries (text /
  weight / tags), live token linting, test-roll button. No JSON shown.
  User tables may reference site tables *and each other* via `{table:}`.
- **Lint once, run everywhere**: extract the token checks from
  `scripts/validate-data.mjs` (ref resolution, tag-filter hits, range/pick
  sanity) into `v2/src/engine/tableLint.ts`. The Node validator imports it;
  the brew editor imports it. One linter, no drift.
- **Resolution**: brews load as the `overlay` map in `loadClosure` (§5).
- **Sharing**: export/import a brew as schema-validated JSON
  (`schemas/brew.schema.json`); import validates + relints, collisions
  re-slug.

## 8. Persistence migration — sheets to IndexedDB

Trigger: image blocks + roll history will exceed the ~5 MB localStorage
budget (quota alert already exists in `sheetStore.ts:87-103`), and the sync
engine (§13) wants every store on the same async substrate.

- New DB `stb:sheets`, store `sheets` keyed by id; same defensive-load
  posture as `worldStore.ts`. One-time migration reads `stb:sheets:v1`
  (precedent: the legacy `stb:pins:v1` migration in `loadStore`).
- Public API of `sheetStore.ts` goes async-under-the-hood but keeps a
  synchronous in-memory mirror + `SHEET_EVENT` contract so `SheetTray`,
  `Generator`, and `Composite` don't change call-shape.
- Every sheet gains metadata the library needs:
  `{ kind?: SheetKind, genre?: GenreId, updatedAt, rev, schemaVersion }`
  — `schemaVersion` plus a small migrations module is what lets the block
  schema evolve after user documents exist (imports of old exported JSON
  included).
- **Request `navigator.storage.persist()`** on first meaningful save.
  Without it the browser may evict IndexedDB under storage pressure —
  Safari evicts after 7 days of non-use — which would make "local-first"
  a data-loss trap for exactly the users who skip Drive sync. Surface the
  granted/denied state in the library footer.
- The migration leaves a `stb:sheets:v1:migrated` marker in localStorage so
  a stale-deploy tab still running old code can detect it and stop writing
  (deploy-skew guard).
- Ordered **before** the image block ships.

## 9. Boilerplate pages — the template gallery

`v2/src/sheets/templates/*.json`:

```ts
{ id, title, description, tags, kind,     // kind → the sheet's library type, §12
  blocks: Block[] }                        // text may contain {table:...} / [[dice]] tokens
```

"New from template" gallery reached from the library (§12) and `/sheet/`,
with print-styled thumbnails. The trick that beats Homebrewery's
paste-snippets: **templates can fill themselves.** Instantiating rolls every
`{table:}` token through the engine with one seed; each filled fragment
stores `source:{template, seed}` (the provenance pattern pins already use),
so the whole page arrives pre-written *and every fragment is individually
rerollable* — the `.frag` mechanism from `Generator.astro:63-102` running
inside the editor.

Initial set (each is also a QA target for the block types):
1. **Character sheet** — the player flagship: statGrid (`rollable`),
   actions, trackers, inventory list, notes. Built in Edit, lived-in via
   Play mode (§16). System-agnostic base + a d20-flavored variant.
2. **NPC one-pager** — portrait, prose statblock, "what are they doing now" rollTable.
3. **Session prep** — hooks, encounter/rumor/weather/loot rollTable widgets. *(This is the "prep a real session start-to-finish" exit criterion from OVERHAUL.md phase 2 — kept from the plan of record.)*
4. **Settlement page** / **Shop catalog** (price table + restock rollTable).
5. **Dungeon room key** — numbered rooms, trap/treasure widgets.
6. **Item card** — image, keyValue stats, history/quirk rollTables from `gm/loot/*`.
7. **Handout** — image with fade + a prose block; page-view by default, genre-pinned (§15).
8. **Cover page** — image with fade, title typography (Homebrewery's most-used snippet).

Templates are validated by the block schema in `validate-data.mjs` (new
walk), and a smoke asserts instantiation determinism: same template + seed →
byte-identical sheet.

## 10. Page view and print

- **Page view toggle** on `/sheet/`: paginated preview (`@page` letter/A4),
  pageBreak honored, columns rendered. Edit view stays the linear editor.
- Pagination must **measure**: fixed-size page containers with overflow
  detection and a visible "content spills page N" warning — a CSS-only
  preview lies at the printer. (Homebrewery fakes pages the same way; we
  inherit the technique and add the warning.)
- Interactive chrome (roll buttons, chips) already prints clean via the
  `.no-print` convention; rollTable prints its *listing*, trackers print
  empty boxes.
- Visual theming (parchment vs sci-fi vs horror, and "plain ink" printer
  mode) is the genre axis, specified in §15.

## 11. Sharing sheets

- **Export/import**: sheet as schema-validated JSON file.
- **Template links**: `/sheet/?template=session-prep&seed=…` re-derives a
  filled page from nothing but the URL (determinism, again). Same shape as
  the composite share links (`Composite.astro:124-142`).
- Full-sheet URL sharing (compressed hash) is possible later for small
  sheets; not in scope until asked for.

## 12. The Library — one home for every document

A new `/library/` page: the user's shelf. Everything the site can save —
sheets, worlds, brews, dice skins, and whatever comes next — in one
searchable grid. Today multi-sheet management is a `<select>` in
`sheet.astro:296-344` and worlds live only inside `/world/`; the library
replaces both as the front door (nav gains **Library**; the tray's
"Edit ↗" keeps deep-linking).

**Document registry** — `v2/src/engine/docRegistry.ts`:

```ts
interface DocMeta { id; type: DocTypeId; name; kind?; genre?; updatedAt; rev;
                    sync?: 'synced'|'pending'|'conflict'|'local' }
interface DocTypeDef {
  type: DocTypeId;                    // 'sheet' | 'world' | 'brew' | 'diceskin' | …
  label; icon;
  list(): Promise<DocMeta[]>;        // backed by that type's store
  openUrl(id): string;               // '/sheet/?doc=…', '/world/?world=…'
  duplicate(id); remove(id); exportJson(id);
  thumbnail?(id): Promise<HTMLElement>;  // first blocks via blockKit.renderStatic, scaled
}
```

Each store (`sheetStore`, `worldStore`, `brewStore`, later `assetStore` and
`skinStore`) registers a `DocTypeDef`; the library and the sync engine
(§13) both consume the registry — **new document types plug in here once
and appear everywhere** (library grid, sync manifest, Drive backup,
export). Dice skins (§17) are deliberately documents: they get library
cards, Drive sync, and file-based sharing for free.

**Document *kinds*** answer "different document types" without store sprawl:
a sheet carries `kind: 'character'|'npc'|'session'|'handout'|'dungeon'|
'item'|'cover'|'custom'` (set by its template, editable later). Kind drives
the library's icon, filters, and the "New" flow — a first-class *store* is
only warranted when the data shape truly differs (worlds earned that;
an encounter tracker is just a tracker-heavy sheet kind).

**UI**: grid/list toggle, search by name, filter by type/kind/genre, sort by
updated, per-card sync badge, actions (open, rename, duplicate, export,
**trash** — soft delete, 30-day retention, restorable), and **New →** type
chooser → template gallery (§9). Empty state teaches the
pin-from-generators loop.

## 13. Drive auto-sync — save everything, at every creation point

Today (`engine/drive.ts`, `engine/backup.ts`): a manual Save/Load pair
pushing one monolithic `storyteller-toolbox-data.json`, with a GIS token
that lives ~1 h and is only requested from a click. Solid transport
(`authFetch` with 401-retry, newest-file dedupe, world merge-on-restore) —
wrong cadence. Auto-sync is a **local-first background courier** built on
that transport:

**`v2/src/engine/sync.ts`**

- **Dirty tracking at the store layer, not the UI.** `saveStore`,
  `putWorld`, brew/skin/asset puts each call `markDirty(type, id)` — so
  *every* creation point (pin, tray edit, template instantiation,
  save-to-world, brew save, tracker tick) is covered by construction, and
  no button ever needs remembering. The dirty set persists in IndexedDB so
  a closed tab never loses queued work.
- **Debounced push**: 3 s of quiet or 15 s max-lag, whichever first; one
  tab holds the courier role via the Web Locks API
  (`navigator.locks.request('stb:sync-leader', …)`) so multi-tab sessions
  don't double-push (SHEET_EVENT already crosses tabs for UI).
- **Per-document files**, replacing the monolith: a visible Drive folder
  `Storyteller Toolbox/` containing `sheet-<id>.json`, `world-<id>.json`,
  `brew-<id>.json`, `asset-<hash>` (§14), plus a small `manifest.json`
  (doc index with revs). Files carry `appProperties: {stbId, stbType, rev}`
  — dedupe by property, *not* by name (the `findFile` duplicate-race lesson,
  `drive.ts:166-171`). Scope stays `drive.file`.
- **Pull & merge**: on connect, on window focus, and before any push whose
  manifest rev diverges. Worlds reconcile with the existing `mergeWorlds`
  (entity union, per-entity LWW, conflict inbox — `backup.ts:70-95`);
  sheets/brews are whole-doc LWW **on `rev` counters, `updatedAt` only as
  tiebreak** (device clocks lie), with the loser kept as
  "*Name* (conflicted copy)" in the library rather than discarded.
- **Deletions propagate via tombstones.** Deleting a doc on device A writes
  a manifest tombstone `{id, deletedAt}` (retained ~60 days) instead of
  just removing the file; device B honors it by moving its copy to the
  trash (§12), not hard-deleting. Without this, every sync resurrects
  deleted documents — the classic first bug of file-per-doc sync.
- **Files are the truth; the manifest is a cache.** Every per-doc file
  carries its own `appProperties` (id/type/rev), so a crash between
  doc-push and manifest-push self-heals: the manifest can always be rebuilt
  by listing the folder. No two-phase-commit theater.
- **Token reality**: GIS access tokens expire hourly and *may* refresh
  silently after prior consent, but Google can demand a gesture. The
  courier therefore has an honest **paused** state: silent refresh fails →
  a quiet "sync paused — reconnect" pill (per-doc badges go `pending`), and
  the next user click resumes. Never a surprise popup; never data loss —
  everything is local-first and queued.
- **Opt-in once**: first Drive link asks "keep everything backed up
  automatically?" A single toggle in the library thereafter.
- The old monolith stays as **manual export / legacy restore** (`backup.ts`
  envelope, bumped to v3 `{sheets, worlds, brews}`); first auto-sync
  migrates a found legacy file into per-doc files.

## 14. Images — upload, and the 5e-style fades

**Asset store** — `v2/src/engine/assetStore.ts`, IndexedDB `stb:assets`:
`{ id: contentHash, blob, mime, w, h, createdAt }`. Uploads are downscaled
client-side (≤1600 px long edge, re-encoded WebP/JPEG ~85) before storing —
keeps IndexedDB, Drive, and print all sane. Blocks reference `assetId`;
render via object URLs through the kit's asset resolver. Assets sync to
Drive once per content hash (§13); docs stay tiny JSON. Orphan GC is
**conservative and manifest-wide**: an asset is only collected when no doc
in the *synced manifest* references it AND it has been orphaned for
30+ days — a same-day sweep on device A would delete an asset that a
not-yet-synced doc on device B still needs.

**Fades** — the Homebrewery watercolor look, done as data + CSS, not baked
pixels. A fade is a grayscale mask applied with `mask-image`
(+ `-webkit-mask-image`), shipped in `v2/public/masks/` per genre:

- *fantasy*: watercolor splotch, torn-parchment edge, soft vignette
- *sci-fi*: hex-grid dissolve, scanline edge, hard chamfer
- *horror*: grunge decay, smoke curl, hard vignette

Image block spec (completing §6):

```ts
{ type:'image', id, assetId?, portrait?, caption?,
  layout: 'block'|'float-left'|'float-right'|'full-bleed',   // float = text wraps, Homebrewery-style
  fade?: { mask: MaskId, strength: 0..1, flip?: boolean },
  blend?: 'normal'|'multiply' }                               // multiply melts art into parchment
```

Editor UX: upload → the picker suggests the active genre's masks with live
preview; drag repositions (`object-position`). The source image is *never*
edited — mask/layout are just block props, so fades are reversible and
re-themable. Print: masks render in Chromium (primary target); other engines
fall back to a plain rectangle + CSS vignette — noted as a risk, not fought.

## 15. Genre themes — fantasy / sci-fi / horror

A second theming axis, orthogonal to light/dark/print. `tokens.css` already
proves the pattern (three variants of one custom-property contract,
`[data-theme]` override, pre-paint inline script `Base.astro:78-84`) —
genre is the same move on a new attribute:

- **`[data-genre]` on `<html>`**, default `fantasy` (the current tokens,
  untouched). Packs at `v2/src/styles/genres/{scifi,horror}.css`, each
  overriding a *declared contract* and nothing else: palette (light **and**
  dark variants), `--font-display/--font-body`, `--color-statblock`
  (maroon → console teal → dried blood), `--radius`, plus three new tokens
  the sheet surfaces consume: `--rule-ornament` (section-rule flourish),
  `--mask-set` (which fade family the image picker suggests, §14), and
  `--dice-skin` (the default dice design, §17).
- **Fonts self-hosted** (OFL-licensed woff2 in `public/fonts/`), loaded only
  by the pack that uses them — no CDN, no layout-shift on the default.
- **Site-wide picker** in the header next to light/dark; persisted
  (`stb:genre`) and applied pre-paint like `theme` is today.
- **Per-document pin**: a sheet may set `genre`, which wins inside the sheet
  surface and in print — the site can stay parchment while a horror one-shot
  handout prints horror. The library shows each doc's genre chip.
- "Plain ink" printer-friendly mode remains part of the print theme, not a
  genre.
- **What a pack is *not***: markup, snippets, or JS. Homebrewery's
  tightly-coupled theme schema is the documented failure mode
  (their themes bundle with the codebase and can't be maintained apart);
  our packs are pure token contracts, enforceable by a smoke that diffs
  each pack's declared properties against the contract list.
- **Content hook (later, cheap)**: tables already carry `tags:["fantasy"]`
  (`table.schema.json`). Once sci-fi/horror table content exists, the active
  genre can pre-filter table pickers and template suggestions by tag —
  the visual axis and the content axis meet in data we already have.

## 16. Play mode — the sheet a player actually runs

The at-the-table surface, and the player-facing half of the product. A
player builds a character sheet once (Edit mode), then lives in Play mode
on a phone or tablet: tap to roll, tap to track, edit a value when the
story demands it — without ever fat-fingering the page structure apart.

**The rule: play edits *values*, edit mode edits *structure*.**

- In Play mode: tracker ±, keyValue values, list items, and paragraph text
  are editable **via explicit tap-to-edit** (pencil affordance → focused
  input → done); adding/removing/reordering blocks, changing labels and
  formulas, and template operations are Edit-mode only. "Edit text when
  needed" without contenteditable landmines.
- All play edits go through the same command bus — undo works at the table
  too (mis-tapped HP is one ctrl+Z / shake-to-undo away).
- Tokens are **live** in Play mode (the §4 edit-mode-literal rule inverts):
  dice chips roll, rollTable widgets roll, `rollable` stat boxes roll
  checks/saves, `actions` rows roll attacks — all through the dice stage
  (§17).
- **Mode is remembered per sheet**; `kind:'character'` sheets open in Play
  mode by default, prep sheets open in Edit.
- **Roll log**: session-scoped log (last ~50 rolls: source label, formula,
  per-die breakdown, total), hosted in the tray. Pairs with undo: a reroll
  pushes the old result into history rather than destroying it. "What did
  I just roll?" is never unanswerable.
- **Touch + a11y as mandates, not wishes**: targets ≥44 px, hover
  affordances (entity cards, dice breakdowns) doubled as tap, every chip a
  real button, roll results announced via `aria-live`, keyboard path for
  everything (the existing `.frag` click/Enter handling is the precedent).
- Play mode is also what the PWA shell (§21.7) exists for: the character
  sheet on a phone at a table with no wifi.

## 17. The dice stage — animated, seeded, skinnable

**`v2/src/engine/diceStage.ts`** — a lazy-loaded overlay that gives every
roll on the site a physical moment: dice tumble across the sheet and land
on the result.

- **Determinism is non-negotiable (§2.3): the engine rolls first, the
  animation lands on its answer.** `dice.ts` produces the result + per-die
  faces; the stage is pure presentation. Same seed, same roll, same
  landing — smoke-testable, share-linkable, never a second RNG. (This is
  also how the serious VTT dice rollers work.)
- **v1 renderer: SVG dice + CSS 3D transforms** — layered face sprites per
  die shape (d4/d6/d8/d10/d12/d20/d100) that tumble through a short
  randomized-looking spin (varied per die by index, not by `Math.random`)
  and settle on the final face. No WebGL, no physics engine: a three.js +
  physics stack is ~600 KB and a battery tax on the exact tablets Play
  mode targets. The renderer sits behind a small interface
  (`show(rollResult, skin, anchor)`) so a fancier backend can slot in
  later without touching call sites.
- **Lazy by construction**: `import()`d on first roll; costs nothing on
  page load, nothing to users who never roll.
- **`prefers-reduced-motion`** (and a settings toggle): instant result with
  a soft highlight, no tumble. The roll log (§16) is identical either way.
- **Where it appears**: dice chips (§4), `rollable` statGrid boxes,
  `actions` rows, and — with a subtler treatment — rollTable widgets
  (d100 tumble, then the result line).

**Dice skins.** A skin is data, not code:

```ts
// schemas/diceskin.schema.json
{ id, name, genre?,
  body:    { color, texture?: assetId },   // face background
  numerals:{ color, font?: FontId },        // pips/digits
  edge:    { color },
  material:'matte'|'gloss'|'stone'|'metal' }  // preset highlight/shading recipe
```

- **We provide sets**: each genre pack ships skins (`--dice-skin` default,
  §15) — ivory-and-ink parchment dice for fantasy, neon-edge console dice
  for sci-fi, bone-and-rust for horror — plus a few extras in a picker.
- **Players upload their own**: a texture image (≤512 px, through the §14
  asset store) + colors + material, in a live-preview skin editor. Skins
  are **documents** (`diceskin` doc type in the registry, §12): they appear
  in the library, auto-sync to Drive, and share as small JSON files like
  brews. Uploading textures and colors is the scope — not 3D models or
  meshes.
- **Selection**: a user-level active skin (`stb:dice-skin`), with an
  optional per-sheet pin (a character's *own* dice travel with their
  sheet — same pattern as the genre pin).

## 18. Phasing

**Phase 0 — Block Kit** (§3). Pure refactor, e2e-guarded. Includes the
command/undo bus, the store-agnostic commit sink, and the edit/play mode
flag; excludes `world.astro` (adopts the kit later, own phase).

**Phase 1 — Live sheets.** `dice.ts` with the frozen grammar (§4), inline
markup, `tableLoader` (§5), `rollTable` + `pageBreak` blocks, undo/redo +
roll log in the editor, **Play mode** (§16), **dice stage v1 with the
default fantasy skins** (§17), template gallery with 3 templates (session
prep, NPC one-pager, item card), fill-on-instantiate.
*Exit: open the session-prep template, roll it full, tweak, print — no
other tool can do this page. Rerolling never loses a result you liked, and
every roll tumbles.*

**Phase 2 — Homebrew + mechanics.** `tableLint.ts` extraction, brew store +
editor + overlay resolution (§7), sheets→IndexedDB migration +
`storage.persist()` (§8), `tracker`, `statGrid` (`rollable`), `actions`,
the `$var` scope wired into dice chips (§4), library trash, character-sheet
template.
*Exit: a player builds a character, taps STR, and watches the dice tumble
to a check using their modifier; raises STR and every attack row updates;
authors a custom crit-fail table and embeds it on the same page.*

**Phase 3 — The Library.** Doc registry, `/library/` page, sheet kinds +
metadata, thumbnails, full-text search across docs, save-sheet-as-template
(§21.5), remaining templates, nav rewire (§12).
*Exit: every document on the site on one screen; three clicks from empty to
a filled, printable page.*

**Phase 4 — Drive auto-sync.** Sync engine, per-doc Drive layout, manifest
+ tombstones, conflict handling, status pills, legacy-monolith migration
(§13).
*Exit: prep on two devices and watch them converge — including a deletion —
without touching a backup button; kill the network mid-session and lose
nothing.*

**Phase 5 — Media + genre + book polish.** Asset store, image block +
fades (§14), genre packs sci-fi + horror + picker with their dice skins
(§15, §17), **custom dice-skin editor + uploads** (§17), `columns`, page
view with overflow warnings (§10), sheet JSON export/import, template share
links, `@`-entity links on sheets (§11), Homebrewery markdown import
(§21.5), PWA shell (§21.7).
*Exit: paste a Homebrewery brew in, get blocks out; a horror handout with a
faded image prints two-column and passes for published material; a player's
uploaded dice design rolls their attacks.*

Phases 3–5 are deliberately separable; 4 depends on 2 (all stores on
IndexedDB) and is better after 3 (the registry is the sync engine's doc
index).

## 19. Test & validation additions

- `validate-data.mjs`: walk `src/sheets/templates/` (block schema + token
  lint via the shared `tableLint`), new `schemas/brew.schema.json` +
  `schemas/diceskin.schema.json`; genre packs diffed against the token
  contract list.
- Smoke: template-instantiation determinism; dice parser property checks
  (grammar edge cases: `4d6dl1`, `2d20kh1`, `$var` resolution, missing-var
  error); **stage determinism** — the face sequence shown is derived from
  the engine result, never a second RNG; `smoke-sync.mjs` driving `sync.ts`
  against a mock Drive fetch (dirty → debounce → push order, 401 re-auth,
  LWW + conflict-copy, tombstone → trash, world-merge path, manifest
  divergence → pull-first).
- e2e (things only real hydration shows): roll a rollTable block on
  `/sheet/`; tracker click survives reload; `?template=…&seed=…` reproduces
  the same page; a brew table rolls inside a sheet; library lists all doc
  types and duplicate/trash/restore work; sync pill reaches "paused" when
  the network is blocked (Playwright route-abort) and drains after restore;
  genre picker flips tokens with no flash-of-default (pre-paint script);
  undo restores a deleted block and a rerolled fragment; **Play mode: text
  edit requires the explicit affordance, a stat box tap rolls and the roll
  log records it; reduced-motion skips the tumble but logs identically**.
- **Print screenshot tests**: Playwright `emulateMedia({media:'print'})` +
  visual snapshots of one template per genre — the print page *is* the
  product; today nothing would catch a regression that only shows on paper.
- Every new block type lands with all four kit methods — the kit's type
  makes forgetting one a compile error, which is the point of Phase 0.

## 20. Risks

- **Renderer drift** across sheet/world/print — mitigated by doing Phase 0
  first; do not add block types before the kit exists.
- **localStorage quota** — image block is hard-gated behind §8.
- **contenteditable × live tokens** — solved by policy (§4/§16): tokens are
  literal in Edit, live in Play; play text edits go through explicit
  tap-to-edit. Do not attempt inline WYSIWYG chips.
- **Bundle growth** — lazy per-table chunks (§5); dice stage lazy-loaded on
  first roll (§17); genre fonts load per-pack only. WebGL dice explicitly
  rejected for v1 (size + tablet battery).
- **Browser evicts IndexedDB** (Safari: 7 days unused) — `storage.persist()`
  on first save + auto-sync as belt-and-braces; the risk is loudest for
  users who decline Drive, so the library shows a "not backed up" nudge.
- **GIS tokens can't be silently refreshed on demand** — designed-in
  "paused" state; local-first queue means pause is cosmetic, never lossy.
- **`$var` scope creep** — users will ask for computed formulas, cross-sheet
  refs, conditionals. The bound is flat + numeric + one level (§4); anything
  more is a different product (a spreadsheet) and gets declined by design.
- **Dice-skin scope creep** — texture + colors + material preset only;
  custom 3D models/meshes/sounds are declined by design.
- **Drive duplicate races** (two devices' first sync) — dedupe by
  `appProperties.stbId`, manifest is the authority; never trust name-search
  order (existing `findFile` lesson).
- **Asset bloat** — content-hash dedupe, ≤1600 px downscale (512 px for
  dice textures), orphan GC in both IndexedDB and the Drive folder.
- **Mask printing off-Chromium** — accept rectangle fallback; do not build
  a canvas pre-compositor unless users actually ask.
- **Font licensing** — OFL/self-hosted only, per genre pack.
- **Trade dress** — themes evoke "book" / "console" / "dread", never clone
  the PHB (Homebrewery lives in a gray zone we don't need to).

## 21. Adversarial pass (round 1) — findings record

Round 1 attacked the first draft. Adopted findings are now integrated
above: **undo/redo command bus** (§3), **roll log** (§16), **trash +
tombstones** (§12/§13), **Play mode** (§16, since promoted to core scope
with the dice stage §17), **frozen dice grammar + `$var` scope** (§4),
**`storage.persist()` + schema versioning** (§8), **store-agnostic commit
sink** (§3), **Phase 0 world.astro deferral** (§3), **print pagination
measurement** (§10), **print screenshot tests** (§19). Still standing:

### 21.5 Adoption levers

- **Homebrewery markdown import** (Phase 5): headings→title, markdown
  tables→table, bold-lead paragraphs→keyValue, statblock heuristics→
  statblock. Even 80% fidelity converts a user's years of brews into
  living documents; SURVEY.md already flagged text→structured import as
  the proven onboarding move. 5etools JSON import (creatures/items subset)
  is a later, separate effort.
- **Save sheet as template** (Phase 3): a library flag, the user's own
  boilerplate appearing in the New flow next to ours. Near-free once kinds
  exist.

### 21.7 Offline shell (PWA)

The plan says "local-first" but the app shell itself comes from the
network. A minimal service worker (cache shell + visited tools' table
chunks) + web manifest makes airplane-mode prep and dead-wifi game nights
actually work, and makes the site installable on the tablet/phone that
Play mode targets. Scoped small; no background-sync cleverness — the §13
courier already handles reconnection.

*Shipped (post-audit batches): `public/sw.js` (cache-first for hashed
`/_astro/` assets, network-first + cache fallback for pages/data,
pass-through for cross-origin/non-GET so Drive sync and mocks stay
honest), `public/manifest.webmanifest`, prod-only registration in
`Base.astro`, offline-reload e2e in `tests/pwa.spec.ts`.*

### 21.8 Backlog (real, not yet scheduled)

- **Full-text search across documents** beyond names (Phase 3 has names;
  content search wants a tiny inverted index, build when sheets number
  in the dozens).
- **Per-block re-render**: the kit enables rendering one block on change
  instead of the whole sheet (`SheetTray` full-reparse is already a known
  sore spot); adopt when long docs appear.
- **World-page kit adoption** (the deferred fourth renderer, §3).
- **Genre-tagged content curation** (§15 hook) once non-fantasy tables exist.
- **Portraits are fantasy-coded** (`everdeep/portraits.ts` races) — sci-fi/
  horror sheets get uploads/no portrait until a recipe set exists.
- **Sheet-frame/background uploads** — the skin machinery (§17) could later
  cover page backgrounds and frame art; not scoped.
- **Dice roll sounds** — optional, off by default, ships with reduced-motion
  style toggle if ever.
- **Genre pack webfonts** — packs shipped (Phase 5) with system font stacks;
  the §15 self-hosted OFL woff2 slot is real but wants owner-picked faces.
  Dropping files in `public/fonts/` + a `@font-face` per pack is the whole
  job; the token contract already isolates it.
- **Roller pages as one-page sheets — finish the fleet.** Batch 260 shipped the
  render mechanism (`Generator.astro` + a `page` block) but wired only `gm/npc`.
  The full prioritized queue (P1 author `page` layout for the other 16
  generators, P2 extend the stat block to villain, P3 §4 route retirement, P4
  consistency, P5 validate the `page` contract) lives in
  `GENERATORS-AS-ONEPAGERS.md §7`.

### 21.9 Explicitly rejected (so nobody re-litigates silently)

- Realtime co-editing / CRDTs — two-device LWW + merge is the ceiling;
  this is a prep tool, not Google Docs.
- Server-side anything (community gallery, share hosting) — static site +
  user's own Drive is the identity. Sharing stays file/URL-based.
- WebGL/physics dice engines and 3D model uploads (§17, §20).
- Canvas pre-compositing for mask printing off-Chromium (§20).
- Spreadsheet-grade formulas (§20, `$var` bound).

### 21.10 RESOLVED (owner, 2026-07-18) — sheets and entities share one copy

The owner's call went further than the recommendation: sheets and world
entities **reference the same data, two-way** — world-side edits change
the sheet and sheet-side edits change the world. Shipped as the
`entityRef` block: the sheet renders the entity's own body through the
Block Kit with a world-backed commit sink (`putWorld`), and re-renders
on `WORLD_EVENT`. Two-way without sync machinery, because there is
exactly ONE copy — the world store's. "🌍 Save to world" promotes a
sheet into an entity and re-points the sheet at it (undo detaches).
The §21.9 rejection of realtime/CRDT stands: it applied to cross-device
merging, which per-doc LWW still owns; this is same-store referencing.
`world.astro` keeps its own renderer — both surfaces read and write the
same stored entity, which is what makes them agree.
