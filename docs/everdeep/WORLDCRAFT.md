# Worldcraft — landform realism, sculpting tools, and the ink pass

> Owner directive (2026-07-19): *"Earth has unique and real geological
> features, elevation changes, dips and valleys, etc. Survey geological
> features, categorize them, and feed them to random world generation so that
> generated worlds feel more realistic. I want improved painting and authoring
> tools — specifically elevation painting, river and road addition, removal,
> or modification. And hex art improvements: cities should look better, the
> surrounding burrows need to look better; a complete art pass is probably
> due."*

*Drafted 2026-07-19 from a full code survey. Living. Successor in spirit to
[GEOGRAPHY.md](GEOGRAPHY.md) (climate realism G-1…G-4, shipped batches 54–65):
that pass made the CLIMATE read like Earth; this epic makes the RELIEF read
like Earth, makes the relief and routes AUTHORABLE, and pays the art debt.
Companions: [MAPS.md](MAPS.md) (rendering plan), [CONTRACTS.md](CONTRACTS.md)
(binding — seeds, genVersion, drift), the V26–V37 audit board in
[PLAN.md](PLAN.md) item #39 (its draw-only rows fold into Lane K here).*

Three lanes, one epic. They interlock — the sculpting tools ride the same
elevation-modifier stack the landforms introduce, and every landform ships
with its ink or it is invisible:

- **Lane L — Landforms**: real geological features fed into generation.
- **Lane S — Sculpt**: elevation painting; river/road add/remove/modify.
- **Lane K — inK**: the art pass — terrain, cities, and their surroundings.

---

## 0. Ground truth (what the survey found, 2026-07-19)

- Elevation is a **pure function**, never stored: `elevationAt(cfg,x,y,oct)`
  (`terrain.ts:601`) = domain-warped fBm × 0.30 + continental land mask ×
  0.30 + **orogeny** (ridged noise gated by a belt field) × 0.26 − sea level.
  0.5 = coastline; beach < 0.506, hills > 0.71, mountain > 0.76. The orogeny
  term is the ONLY landform mechanism in the engine.
- Rivers: priority-flood drainage on the 60-mi world-hex grid → traced stems
  → meander → deltas → mouth clip; stored as **polylines** in `plane.routes`
  (`hydrology.ts:78-408`). Roads: cost-surface A* + MST + traffic ranking,
  also polylines (`settlements.ts:256`). Both re-runnable **individually** via
  worker ops `op:'rivers'` / `op:'roads'` (`world.astro:870/919`).
- Named features are label points only — `GeoFeature {kind,name,x,y,big}`;
  the generator emits ocean/sea/lake/range/forest/desert/river. `valley`,
  `island`, `swamp` have naming templates in `geoNames.ts` but are **never
  produced**. No extents, no landform types beyond "range".
- Editing today: **biome paint** (`plane.biomePaint` sparse overrides +
  `terrainEpoch` invalidation, `mapView.ts:1514`), claim paint, and nothing
  else — no elevation store to edit, no direct river/road manipulation.
  `withAuthoredRivers()` (`hydrology.ts:423`) already overlays hand-authored
  river polylines onto the drainage grid — built for Earth-2026, never
  called from UI. Undo exists twice (sheet `CommandBus`, siteView
  before/after-Map strokes); neither is wired to the map.
- Art is 100% procedural in `mapView.ts` (~3,800 lines): biome fills +
  shade/jitter, V13 edge dither, coast ink, `drawGlyphs` terrain marks,
  `drawFootprint` settlement sketches (houses/walls/keep), `artMarksNow`
  farmland/urban rings. No sprite/asset layer exists. Perf scaffolding
  (terrain buffer, claims buffer, 8ms warm slices, map-perf medians < 45ms)
  is mature and non-negotiable.

**The compatibility law** (CONTRACTS §5/§6): any new term in `elevationAt`
redraws every unwritten hex of every existing world. Everything in Lane L
therefore gates behind an opt-in the way `climateModel:'earthlike'` did.
Real-Earth worlds (`landform:'earth'`) read a real raster and skip the blob
field entirely — Lane L's [E] terms never touch Earth; anything that DOES
move Earth (a carve on its traced rivers) re-bakes the fixture in the same
commit or `smoke-reproducible` fails, by design.

---

## 1. Lane L — Landforms

### 1.1 The survey, categorized

Three implementation classes decide everything (cost, risk, gating):

- **[E] Elevation-field term** — a new term in the `elevationAt` stack (like
  orogeny). Changes biomes, rivers, everything downstream. Gated.
- **[H] Hydrology-coupled** — emerges from, or carves along, the traced
  water network; needs the drainage grid or the route polylines.
- **[D] Detection/label** — the relief already makes the shape; a detector
  names it, gives it an extent, and mints the feature entity. Zero field
  risk; extends `geography.ts`.

| Feature (Earth exemplar) | Class | Mechanism |
|---|---|---|
| **River valleys / canyons / gorges** (Grand Canyon) | [H] | carve elevation along traced courses ∝ accumulation × local relief — the single biggest "dips and valleys" win, because today rivers ride the raw field with no valley around them |
| **Floodplains / alluvial plains** (Nile) | [H] | flatten + moisten a band around wide lower courses → farm-biome bias where civilization already wants to be |
| **Waterfalls** (Iguazu) | [D] | detect a sharp elevation step along a course → landmark entity; adventure-site gold |
| **Rift valleys** (East African Rift) | [E] | inverted orogeny: linear trough along a belt line + raised shoulders; priority-flood fills the floor → rift-lake chains for free |
| **Plateaus / tablelands + escarpments** (Colorado, Deccan) | [E] | terrace function over the land mask (damp fBm detail on top, steep margin = the scarp) |
| **Basins / depressions** (Tarim, Great Basin) | [E] | broad interior bowls; the existing endorheic-sink pass already finds closed lows — give it real ones to find |
| **Mesas / buttes** (Monument Valley) | [E] | terrace remnants at arid plateau margins |
| **Island arcs** (Japan, Aleutians) | [E] | arc-shaped orogeny belts offshore of margins (noted as future work in MAPS §3.1d since batch 10) |
| **Hotspot chains** (Hawaii) | [E] | cone line, amplitude decaying along one direction |
| **Volcanoes / calderas** (Fuji, Crater Lake) | [E]+[D] | seeded point cones; caldera = rim with carved center, lake if wet; named + glyphed |
| **Fjords** (Norway, Patagonia) | [H] | cold-latitude coastal carve: deepen + straighten coastal drainage below sea level → drowned trough inlets; huge map-face payoff |
| **Glacial lake chains** (Finger Lakes) | [H] | over-deepen valley floors in formerly-glaciated bands; flood fill does the rest |
| **Cirques / horns** (Matterhorn) | [E] | sharpen ridge noise above the snowline band; subtle, cheap, last |
| **Rias / estuaries** (Chesapeake) | [H] | widen the drowned lower course — the honest completion of audit row V35 |
| **Atolls / reefs** (tropics) | [E] | ring islets gated by warm shallow shelf (shelf field exists) |
| **Dune seas / ergs** (Empty Quarter) | [E]+K | short-wavelength ridged texture inside desert basins + dune art; named "the X Sands" |
| **Salt flats / playas** (Uyuni) | [H]+[D] | where the endorheic sink fires but moisture can't fill a lake — the sink pass already knows the exact spot |
| **Oases** | [H] | desert-basin drainage concentration → water + green + settlement-placement bonus |
| **Karst country** (Guilin) | [E]+[D] | regional mask of pocked/tower noise; tagged "cave country" → biases cave/dungeon ghost features |
| **Marsh/swamp** (Pripyat, Everglades) | [D] | flat + wet + warm near water → paint marsh; finally emits the `swamp` naming template. New biome id = additive, non-breaking (CONTRACTS §5) |
| **Impact crater** (the Godfall Crater) | [E] | rare seeded ring — cheap, memorable, fantasy-first |

### 1.2 Architecture decisions

**A. The elevation-modifier stack.** Refactor `elevationAt` into an explicit
ordered stack: `base fBm + land mask + orogeny + [new landform terms] +
[river carve] + [user sculpt deltas] − sea level`. Same math today, but each
term becomes a named, seeded, individually-gated contributor. Lane S's
elevation painting is just the topmost term — one mechanism, two lanes.

**B. Gating: `reliefModel: 'classic' | 'sculpted'` on `TerrainCfg`,**
mirroring `climateModel`. Absent/`classic` = today's field, byte-identical
(smoke-pinned). New worlds default `sculpted`. No genVersion bump — the
`earthlike` precedent (opt-in flag, frozen worlds untouched) is the
established pattern. Earth ignores [E] terms entirely.

**C. The carve circularity** — rivers are traced FROM the field, but valleys
must be carved INTO the field ALONG rivers. Same shape as the G-3 problem
(orogeny needed distance-to-coast; coast defined without orogeny), same
answer: **two-phase sampling**. Hydrology traces on the *uncarved* field
(explicit flag). The traced stems then build a cached **carve field** (a
route-distance query — `riverField.ts` is literally this structure already),
and `elevationAt` applies the carve term for every LATER consumer:
settlements, roads (which then follow valleys — realism for free), biomes,
rendering, travel. Deterministic because routes are deterministic from cfg.
Recursion guard: the hydrology entry point samples with `carve: false`.

**D. Features get extents.** `GeoFeature` grows optional `hexes: string[]`
(world-tier hex keys) so a landform is a clickable region, not a label
point. One new **landform detector pass** (`landforms.ts`), running after
hydrology and before naming, emits every typed feature above with extent +
label anchor + `geoNames` name — and finally uses the `valley` / `island` /
`swamp` templates. New `GeoKind` values are additive.

**E. Determinism.** Every new term draws from `seedNum(cfg, NEW_SALT)`;
new salts documented in-code beside the existing ones; no `Date.now()`, no
`rid()` (CLAUDE.md Earth rules). Each stage lands with a probe script in
`docs/everdeep/scripts/` (the audit-probe pattern) counting its features
across N seeds — and per the r3 lesson, **verify each probe metric on one
concrete case before trusting it** (2 of 6 r3 metrics were artifacts).

### 1.3 Stages (each independently shippable, gated, probed)

| Stage | Ships | Notes |
|---|---|---|
| **L-1 Foundations** | modifier-stack refactor (no behavior change — smoke byte-identical for classic AND earth), `reliefModel` plumbed through creation UI, carve-field infra + recursion guard | pure refactor + dials; the gate for everything after |
| **L-2 Fluvial** | valley carve, floodplains, waterfall detection | the "dips and valleys" headline; biggest single payoff |
| **L-3 Tectonic** | rifts (+lake chains), plateaus/escarpments, basins, mesas, island arcs, hotspots, volcanoes/calderas | the [E] family; each term small, all behind `sculpted` |
| **L-4 Ice & coast** | fjords, glacial lakes, cirque sharpening, rias/estuaries (V35 done honestly), atolls | latitude/temperature-gated |
| **L-5 Arid & names** | ergs, salt flats, oases, karst, marsh biome, the full landform detector + extents | closes the loop: everything named, clickable, on the map key |

Each L stage ships its Lane-K art in the same batch (a fjord without cliff
ink is a weird bay). Random-world only; a follow-up owner call can extend
[H]/[D] to Earth (with a fixture rebake in the same commit).

---

## 2. Lane S — Sculpt (authoring tools)

The copy-on-write philosophy, extended from hexes to relief and routes:
**generated is ghost; touching materializes; sparse deltas persist.**

### 2.1 Elevation painting

- **Store:** `plane.elevPaint` — sparse map `"tier:q,r" → delta` (float,
  clamped ±0.35), mirroring `biomePaint`. **Deltas, not absolutes**: they
  compose with the base field, survive `reliefModel` changes, and make
  raise/lower brushes natural. Reads as the topmost modifier-stack term.
- **Brush:** extend the existing paint mode (`enterTerrainPaint` pattern,
  `mapView.ts:1514`): tools **raise / lower / smooth / flatten / erase**,
  strength × brush radius (in hexes of the active paint tier — world paints
  continents, region paints valleys, locale paints a hill). Live preview via
  per-hex draw during the stroke (the claims brush already steps around the
  buffer this way).
- **Consequences cascade, visibly:** stroke end → bump `terrainEpoch`,
  clear ghost/feature/resource caches (existing plumbing, `mapView.ts:1546`)
  → biomes re-derive instantly (they read elevation). A painted mountain
  gets snow; a dug trench below 0.5 becomes sea. Water-crossing edits ride
  the **existing** debounced `scheduleRiverRebuild` / `scheduleRoadRebuild`
  (`world.astro:869/918`) so rivers re-trace around the new relief — the
  reactive half of river editing comes free.
- **Undo:** adopt the sheet `CommandBus` (`engine/commands.ts`) for ALL map
  authoring; one stroke = one command holding the before/after sparse-map
  diff (the `siteView.ts` stroke model). Ctrl+Z/Ctrl+Shift+Z wired on the
  map island. This retrofits claims + biome paint too — three brushes, one
  undo stack.

### 2.2 River & road editing

Route records grow `authored?: true`. Generated routes stay ghosts —
re-runs replace them; authored routes are **materialized** and survive.

- **Add:** a ✏️ route tool — click to lay vertices (the 🥾 travel-measure
  interaction is the model), double-click ends. Rivers: pick width band 1–4;
  the polyline is fed through `withAuthoredRivers()` — the hook exists,
  UI-wire it — so the drainage grid, bridges, and road costs all SEE it.
  Roads: pick class dirt/road/highway; a matching `withAuthoredRoads()`
  feeds fixed edges into `generateRoads` so the network respects and
  connects to hand-laid trunks instead of duplicating them.
- **Modify:** click near a route (the `riverField`/`roadField` point-query
  answers "which route is here") → select → drag vertices, insert/delete
  vertices (siteView select/drag idioms). Editing a GENERATED route
  copy-on-writes it to `authored` first — the ghost materializes, exactly
  like everywhere else in the product.
- **Remove:** authored → delete the record. Generated → a suppression
  record keyed by the route's **mouth/terminus world-hex** (stable across
  re-runs even when re-tracing shifts the course; route ids are not stable
  under regeneration, hex anchors are). Suppressed courses are skipped at
  trace-out. v1 caveat, documented in-UI: a big elevation repaint that
  moves a river's mouth off the suppressed hex resurrects it.
- **Re-run semantics:** after authored edits, `op:'rivers'` / `op:'roads'`
  re-runs keep authored routes verbatim, regenerate the ghost remainder
  around them, and re-derive bridges. Cache invalidation: rebuild
  `riverFieldCache`/`roadFieldCache`, bump epoch, clear ghost caches — the
  biome-paint invalidation template, extended.

### 2.3 Verification

New `v2/tests/map-edit.spec.ts` (hydrated surface → e2e is mandatory):
paint a mountain → biome flips + undo restores; dig a channel → river
re-trace crosses it; draw an authored river → roads bridge it; delete a
generated road → stays gone after `op:'roads'`; Ctrl+Z depth. Plus a
`smoke-` guard that `elevPaint`/authored routes round-trip the store and
that `withAuthoredRivers` output is deterministic.

---

## 3. Lane K — the inK pass

**Direction (recommended, and the lane starts this way regardless): stay
procedural.** The ink identity is hand-rolled strokes; a sprite/asset
subsystem is a genuinely new liability (pipeline, loading, licensing,
determinism) that the zero-dependency culture has avoided everywhere else —
the portrait pack precedent ("notebook pencil, generated, pro art maybe
later") applies. Filed as [DECISIONS.md](../DECISIONS.md) #9 so the owner
can overrule before K-2.

| Stage | Ships |
|---|---|
| **K-1 Terrain de-boxing** | the four open draw-only audit rows, folded in from PLAN #39: **V31** region-tier land-class dither + jittered earth land-cover reads + beach from `coastDistAt`; **V32** Chaikin the river-ribbon OUTLINE at >8px width; **V34** clip realm borders to land+1; **V37** lake-badge size cap + art-mark water gating. Re-run `visual-audit-r3.spec.ts`, re-stamp the board |
| **K-2 Settlements & burrows** | city footprint rebuilt: ward blocks inside the walls (seeded subdivision — `genCityWards` logic reused at draw scale), gate towers, keep quarter, harbor piers where coastal, bridge art where a river crosses; town/village variants (green, shrine, mill-by-water); and the **burrows** — satellite hamlet clusters, orchard/field wedges, and inn-spots strung along the approach roads (`roadField` gives the approach directions), replacing today's uniform frayed ring so a city trails civilization outward the way real ones do |
| **K-3 Landform ink** | co-ships with Lane L per stage: canyon hatching along carved courses, fjord cliff strokes, volcano cones + caldera lakes, dune curls in ergs, salt-flat stipple, waterfall tick + name label, crater rings, marsh reeds |
| **K-4 Relief depiction** | cheap hillshading (directional derivative of `elevationAt`, computed inside the terrain-buffer render so pan/zoom never pays it) as a subtle default; contour lines at deep zoom; the ⛰ toggle becomes shaded-relief proper |

**Perf guardrails (non-negotiable):** all new art renders inside the terrain
buffer or within `drawGlyphs`' per-hex budget; `map-perf.spec.ts` medians
(< 45ms) and the 500ms catastrophe guard stay green; art stays behind the
existing art toggle; screen-space work clips (`clipToView` — remember the
13M-offscreen-arrows lesson). Verification is the visual-audit pattern:
screenshot rounds per K batch, board rows with fix sketches, probe metrics
only where a count is honest.

---

## 4. Sequencing & session discipline

```
L-1 ──► L-2 ──► L-3 ──► L-4 ──► L-5
  │       │ (carve)         (each with its K-3 ink)
  │       ▼
  └──► S-1 elevation paint ──► S-2 route editing ──► S-3 polish+undo depth
K-1 (independent, can start immediately) ──► K-2 ──► K-4
```

- **K-1 has no dependencies** — it's the queued audit fix lane and can ship
  first/parallel.
- **L-1 unblocks both** L-2+ and S-1 (the stack is the shared mechanism).
- **S-2 wants L-2** only softly (carved valleys make authored courses feel
  grounded); it can land before if sessions allow.
- `mapView.ts` and `world.astro` are the contended files — Lane S and Lane K
  both live there. **One lane per session per worktree** (CLAUDE.md rules);
  an optional K-0/S-0 refactor batch may extract `drawFootprint`/`drawGlyphs`
  /paint tools into modules first if collisions start costing batches.
- Every L stage that could plausibly touch Earth output must prove it didn't
  (smoke byte-identical) or rebake the fixture in the same commit.
