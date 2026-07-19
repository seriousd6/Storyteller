# Test-suite audit & fix plan (2026-07-18)

A full survey of every automated test — 44 Playwright e2e specs (~190 cases,
`v2/tests/*.spec.ts`) and 25 Node smoke/validate scripts (`v2/scripts/*.mjs`) —
asking of each: *does it test the intended thing in the best way?* The hunt was
for the failure mode that shipped in **Batch 258**: a control renders, but the
data flow behind it is dead, and the test stays green (`collectVars` stopped
descending into `columns`, killing every 5e-sheet `$var`; the layout spec proved
presence, never rolled, so it never caught it — fixed in B261).

**Verdict:** strong in aggregate (real round-trips, good negative paths, a
byte-identical Earth reproducibility anchor). The weakness is *patterned* and
clusters in the highest-value places: the character sheet, the map layers, and
the HP/geography numbers.

## Status (loop pass complete, 2026-07-19)
**Shipped (8 batches, 264–273):** sheet behavior gaps (the B258 class — a real
roll now guards the columns var-scope) · exact HP + dice `kl/dh` + SRD attribution
· solo-cast full-compare + terrain G-3 · slotSeeds contract + geo centroid-on-
terrain · map-artifacts river-floor + person-disposition persistence · rollers +
brews passes-if-broken · the **road-field tautology** (one source of truth in
`roadField.ts`) · map-perf frame-budget de-flake.

**Recorded for you (need a decision) — see § Blockers:** dice `minOf/maxOf` swap ·
`table` block never renders its label · fragment-reroll maybe-not-isolated (a
possible real bug) · two reload-race de-flakes need content polls.

**Deferred (known fix, reason given) — see § Deferred:** hydro downhill (needs the
filled surface) · settle connectivity (needs the road graph) · legend name/border
(needs a mapView hook, during its churn) · settlement-fields re-derive (needs a
diagnostic) · visual-audit assertions (AUDIT-gated, unverifiable) · optional
de-brittle. Each was skipped to avoid a fragile test, a risky edit during the
concurrent mapView churn, or an unverifiable change — never for lack of a plan.

## Tags
`PRESENCE` render-not-behavior · `TAUTOLOGY` tests a copy of the code ·
`PASSES-IF-BROKEN` loose assertion · `WEAK-BOUND` shape not value ·
`FLAKY` wall-clock/race · `MISSING` no test · `BRITTLE` churns without catching ·
`FIXTURE-BYPASS` skips the real path.

## The 7 systemic patterns
1. **Presence, not behavior** (the B258 class) — `character-sheet-5e:21`,
   `live-sheet:226`, `homebrew-import:28`, `choice-block:11/49`,
   `character-sheet:133`. Fix: assert the *outcome* of the interaction.
2. **Tautology / tests-a-copy** — `road-field:137` (re-implements the width
   ladder), `person-disposition:56` (`selectOption`→`toHaveValue`),
   `settlement-fields:9` (persistence masquerading as determinism),
   `smoke-templates` (slotSeeds contract deferred to e2e).
3. **Passes-if-broken** — `legend:28/56` (pixel-diff dominated by the wash),
   `map-artifacts:47` (passes if rivers vanish), `rollers:98/50`,
   `smoke-srd-statblocks:118` (attribution greens vacuously), `brews:32/73`.
4. **Weak-bound smokes** — HP (`smoke-dnd5e:81/192`, least-tested number in the
   engine), `smoke-hydro` (no downhill/sink invariant), `smoke-geo` (features vs
   terrain), `smoke-terrain:124` (G-3), `smoke-settle` (highway connectivity).
5. **Flaky by construction** — `map-perf:52/84` (p95<100ms), reload-without-
   durability-wait (`live-sheet:41`, `sheet-editor:11`, `rollers:69`),
   `dice-skins` (2.4s stage auto-dismiss).
6. **Missing coverage** — tracker/actions never ticked/rolled on a real inserted
   block; dice `kl/dh`; foreign-world hash rejection + hash-write on pan;
   secret-field/photo durability; `visual-audit` never `expect()`s consoleErrors
   or longtask ms.
7. **Brittle** — exact statGrid counts, exact-rgb dice skins, exact-monster
   `gm-prep:55`, exact Earth census `earth-browser` (never asserts the
   fantasy-name-on-real-coords claim it exists for).

## Solid — do not churn
entity-mentions, share-link (incl. secrets-stay-home), solo-play + oracle cast,
realm-entry, map-card, tree/tree-pane, page-view, the field smokes
(river/road/wind/current/sailing), smoke-realms, smoke-merge, **smoke-reproducible**
(the anchor). `smoke-srd-statblocks`' full-output-minus-cast compare is the model
for "content never steers dice" — copy it to `smoke-solo-cast`.

## Fix batches

### Batch 1 — sheet behavior gaps (the B258 class)  ← IN PROGRESS
- [ ] `character-sheet-5e.spec.ts` — NEW test: composite, play mode, roll a
      columns-nested ability box + a Saving Throw chip; assert the resolved
      `(str.mod)`/`(prof)` reaches the dice stage (guards the B258 var-scope at
      the e2e layer, complementing `char-play:22` and `smoke-dnd5e:253`).
- [ ] `live-sheet.spec.ts:226` — click an ability button, assert the stage rolls
      with the modifier (presence → behavior; static-template surface).
- [ ] `choice-block.spec.ts:11` — change the composite subclass dropdown, reload,
      assert it stuck (the composite-emitted choice is on the commit sink).
- [ ] `choice-block.spec.ts:49` — assert metamagic's pool holds real options and
      a pick persists across reload.
- [ ] `homebrew-import.spec.ts:28` — positively assert the h4 became the table's
      LABEL ("Random Encounters" inside `.b-table`), not just "not a heading".

### Batch 2 — kill the tautologies
- [ ] `road-field.spec.ts:137` — assert the *real* road width (expose a pure
      `roadLineWidth(kind,ppf)` from mapView and import it, or assert rendered
      thickness grows between two zooms) instead of a re-implemented ladder.
- [ ] `person-disposition.spec.ts:56` — reload + re-open, assert the disposition
      edit persisted (prove the field-commit handler ran).
- [ ] `settlement-fields.spec.ts:9` — clear the four fields / open a second fresh
      city to test *re-derivation*, and tighten one field to a world-consistent
      value.
- [ ] `smoke-templates.mjs` — add a pure assertion that `slotSeeds(config,'s')`
      aligns with the `templateTextFields` walk order (the share-link contract).

### Batch 3 — tighten passes-if-broken
- [ ] `legend.spec.ts:28/56` — assert realm/ocean *names* survive pins-off and
      that borders+names vanish with realms (a name/border proxy, not aggregate).
- [ ] `map-artifacts.spec.ts:47` — add a river-present lower bound.
- [ ] `rollers.spec.ts:98` — assert an undead monster in Forces; `:50` — assert
      the rerolled fragment changed and a sibling held.
- [ ] `smoke-srd-statblocks.mjs:118` — fail if the sample has no statblock section
      to attribute (don't green vacuously).
- [ ] `brews.spec.ts:32/73` — assert the test-roll output ∈ the table's entries.

### Batch 4 — smoke correctness
- [ ] `smoke-dnd5e.mjs` — pin one hand-computed exact `hpAverage`; tighten rolled
      HP to `[min,max]`.
- [ ] `smoke-hydro.mjs` — add the downhill/sink invariant (elevation non-increasing
      along each route, mouths on water/lake, `acc` monotonic).
- [ ] `smoke-geo.mjs` — assert each feature's centroid kind matches its biome.
- [ ] `smoke-terrain.mjs:124` — tighten G-3 to a relative gain (coastOn ≥ ~1.3×
      coastOff) and assert the interior didn't inflate.
- [ ] `smoke-settle.mjs` — assert highway-network connectivity (one component per
      continent), not just proximity-to-any-road.
- [ ] `smoke-dice.mjs` — add `2d20kl1` (disadvantage), a `dh` case, a negative term.
- [ ] `smoke-solo-cast.mjs:70` — full-output-minus-cast-slot compare (like SRD).

### Batch 5 — de-flake
- [ ] `map-perf.spec.ts:52/84` — gate on `median<45`; replace the p95 ms budget
      with a terrain-re-rasterization *count* proxy.
- [ ] `live-sheet:41`, `sheet-editor:11`, `rollers:69` — durability wait before
      reload/navigate.
- [ ] `visual-audit.spec.ts` — `expect(consoleErrors).toEqual([])` in afterAll +
      a pan-longtask budget assertion.
- [ ] `dice-skins.spec.ts` — guard against the 2.4s stage auto-dismiss.

### Batch 6 — de-brittle (optional)
- [ ] Compute, don't hardcode: statGrid counts, dice rgb, `gm-prep:55` monster,
      Earth census; assert the fantasy-name-on-real-coords claim in `earth-browser`.

## Missing coverage to add opportunistically
tracker tick + action roll on a *real inserted* block (insert-menu); foreign-world
`#map=…,@id` hash rejection + hash-write on pan/zoom; legend per-realm hide /
labels-off / section-collapse; secret-field & photo survive-reload / land-in-backup.

## Blockers / questions for the owner (recorded during the loop)
These didn't block a batch — I pinned the current behavior and moved on — but each
is a product/correctness call for you:

1. **Dice `minOf`/`maxOf` swap on a subtracted dice term** (`engine/dice.ts`
   `bound()`, ~L183). `minOf('10-2d6')` returns **8** and `maxOf` returns **-2** —
   the per-die floor/ceiling is applied uniformly regardless of a term's sign, so
   any formula with a *subtracted* dice term reports min > max. dice.ts documents
   this ("callers pair accordingly"); the smoke now pins the contract. But a UI
   showing such a formula's range would show it backwards. **Decide:** make
   `minOf`/`maxOf` sign-aware (true min/max) — small, but the grammar is declared
   "frozen" — or keep the contract. (All real formulas use positive dice, so this
   is latent, not live.)

3. **`smoke-hydro` downhill/sink invariant needs internal state** — I attempted
   the auditor's #1 (rivers descend to a sink; mouths on water) but backed it out:
   hydrology uses priority-flood **depression filling**, so rivers legitimately
   run *uphill in raw elevation* across filled basins (~11% of stems, incl. some
   great rivers). Asserting true monotonic descent needs the *filled* drainage
   surface or the `flowTo` graph, and `generateHydrology` exposes neither (only
   `routes` + `lakePaint`). A raw-elevation check false-fails on correct behavior.
   **Decide:** expose the filled elevation (or `flowTo`/`acc`) from the module so
   the invariant can be asserted, or accept that hydro stays covered by its
   geographic-realism checks (real-river proximity, endorheic sinks, no ice
   rivers) only. **Update:** `smoke-geo` WAS addressable without internal state —
   added an aggregate centroid-on-terrain check (water features on water, land
   features off the open sea, with margin for island/valley centroids, ~90%).
   `smoke-settle` highway connectivity is **deferred** as a follow-up: asserting
   "one connected trunk network per continent" needs the road graph reconstructed
   into components plus per-continent labels — neither is on the public return
   (only `nodes` + `routes`), so it's a real effort, not a one-liner.

4. **Slot-generator fragment reroll may not be isolated** (`/gm/tavern/`, the
   `.frag` reroll). While tightening `rollers.spec.ts:50` I found that rerolling
   the FIRST `.frag` also changed a sibling `.frag` ("The Knight and the Shepherd"
   → "The Unusual Display"). Either per-fragment reroll re-rolls the whole slot/
   line (contradicting the test's own title "rerolls just that piece"), or the two
   `.frag`s belong to different slots and clicking one re-rolls both. The tightened
   test now asserts the fragment DOES change (the real gap); isolation is left
   unasserted pending a look at the reroll handler. **Decide:** is fragment reroll
   meant to be isolated? If so, this is a real bug the old test hid.

6. **Two reload-race de-flakes need a content-specific wait, not `pinIsDurable`.**
   The auditor suggested `pinIsDurable` for `live-sheet.spec:41` (a kept roll
   result) and `sheet-editor.spec:19` (edited text "Dragon Lair") — but
   `pinIsDurable` only waits for *a block to exist* in the store, and in both
   cases the block already exists; the value that races is the block's CONTENT.
   So `pinIsDurable` would be a no-op there. `rollers.spec:69` (a pin that ADDS a
   block) IS a block-presence race, so it got the wait. The other two need a
   content-specific IDB poll (as `person-disposition` now does). Deferred: the
   flake is unobserved (both pass today), and the proper fix is per-spot work —
   not a one-liner. **Decide:** worth hardening pre-emptively, or leave until one
   actually flakes?

7. **The `table` block never renders its `label`** (`engine/blocks/table.ts`).
   The label survives only in the model + markdown export; the Homebrewery
   importer maps an `h4` above a table to that label, but nothing shows on screen.
   **Decide:** render it (a few lines mirroring `list`/`keyValue`), or is hiding
   it intentional (avoid a duplicate heading)? The homebrew e2e now proves the
   imported table is *editable* rather than asserting a rendered label.

## Deferred (known fix, not done this pass — reason given)
The fix is understood for each; each was skipped to avoid a fragile test, a risky
edit during the concurrent session's mapView churn, or an unverifiable change:

- **`map-perf` (partial done):** the flaky `p95<100ms` budget was RAISED to 500ms
  and re-framed as a *catastrophe* guard (it exists to catch a 9.6-second
  regression, per its own comment — 500ms clears load spikes yet fails on a
  seconds-scale regression). The robust `median<45` gates stay. A *fully*
  load-immune version would replace the ms budget with a terrain-re-rasterization
  **count** proxy — that needs a mapView instrumentation hook, deferred while
  mapView is in active churn (271 rewrote 67 lines of it).
- **`legend.spec:28/56` (passes-if-broken):** the pins/realms pixel-diff never
  checks the actual regression — that realm/ocean **names** survive pins-off and
  that borders+names toggle *with* realms. A real assertion needs either canvas
  label-pixel sampling (fragile) or a mapView debug count of drawn labels/borders
  (a source hook). Deferred: needs a mapView hook during its active churn.
- **`settlement-fields.spec:9` (persistence-not-determinism):** tests persistence,
  not the re-derivation it claims (the fields are saved on first open and skipped
  on reload). Fix: clear the four fields in IDB (or open a second fresh city) to
  force re-derivation, and tighten one field to a world-consistent value. Needs a
  diagnostic run first to read the derived vocabulary; slow (full-Earth e2e).
- **`visual-audit.spec` (documentation harness, AUDIT-gated):** records
  `consoleErrors` and pan-longtask ms but never `expect()`s them, so a page that
  throws on load or a multi-second stall can't fail it. Fix: `expect(errors-only)
  .toEqual([])` in `afterAll` + a longtask budget. Deferred: the whole file is
  `AUDIT=1`-gated (skipped in the normal gate), so the assertions can't be
  verified without a slow manual AUDIT run to calibrate the threshold and confirm
  no benign console errors.
- **Batch 6 de-brittle (optional):** compute-don't-hardcode for exact statGrid
  counts, dice-skin rgb, `gm-prep` monster, the Earth census; assert the
  fantasy-name-on-real-coords claim in `earth-browser`. Low value — these are
  green today and churn without catching bugs; not worth the risk of touching them
  now.
