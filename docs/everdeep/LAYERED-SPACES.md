# Layered Spaces — city ⊃ district ⊃ building ⊃ floor ⊃ room

> Owner directive (2026-07-19): *"Layered spaces — a general city map,
> zooming into districts, zooming into buildings and floors of cities,
> districts, and rooms. If the size of spaces can't be expanded, we need a
> way to nest spaces and make the scale be more appropriate. Some cities are
> miles across; the space should be able to represent that as it is being
> explored."*

*Drafted 2026-07-19 from a full code survey. Living. Extends the Spaces epic
(B183–B209 + audit B221–B226) and supersedes the "Next steps" list of the
nested-spaces section in [PLAN.md](PLAN.md) §5 (slice 3 shipped as the epic;
this doc is what comes after). Companions: [MAPS.md](MAPS.md) §3.1
(sites-not-global-grid — still the law), the sites storage contract in
`sites.ts:50-61`.*

## 0. Ground truth (what the survey found, 2026-07-19)

The answer to the owner's "if the size of spaces can't be expanded" is:
**it can't, and shouldn't — but the nesting machinery is already half-built.**

- A site floor's practical ceiling is ~220×220 cells (schema cap 1000; the
  renderer cache and the regenerate-base-on-open contract both assume a
  floor's full base is cheap — a 220×220 city thumb already costs ~150ms).
  A city 3 miles across at 5 ft/cell would be 3,168 cells square = 10M
  cells. MAPS.md §3.1 rejected exactly this for the world (10¹³ cells) and
  the reasoning holds at city scale. **Scale must come from stacking, not
  bigger grids.**
- The stacking seams already exist:
  - `SiteRec.parentSiteId` + `makeSubSite()` (`siteOps.ts:137`) — a city
    plan's building area mints a child interior site; "Create interior →" /
    "Open interior →" are live in the editor; a badge on the anchor cell
    opens the child; zooming out 3 notches past min **ascends** to the
    parent (`siteView.ts:914`).
  - `cellFt` is **per-site** (`sites.ts:73`) — heterogeneous scale works
    today: city plans are 10 ft/cell, interiors 5 ft (`siteOps.ts:159`).
  - The hex map already has a **descend gesture** (overzoom a pin charges
    into its interior, `mapView.ts:3338`).
  - The storage contract (gen + sparse hand-edit overrides, re-derive on
    open) makes deep stacks CHEAP — an untouched child site is ~a seed.
  - Merge already unions sites by id with per-site LWW — deep stacks sync.
- What does NOT exist: any layer between "walled city core" and "building"
  (no district sites); a generator that fills a district honoring its
  parent's geometry; more than one nesting hop in practice; a continuous
  *feel* across the seam (children open as fresh mounts, no transition); a
  route/URL to any site or floor; `plane.links` (portal/stairs-to-elsewhere)
  is schema-only, zero references in code; no scale bar or "miles across"
  presentation; the city generator draws a stylized walled **core**, not
  the true 2–3 mi footprint the batch-9 table promised.

## 1. The architecture: a scale ladder of nested sites

One city = a **stack of sites**, each a normal site at its own `cellFt`,
chained by `parentSiteId`, each layer generated *from the layer above's
geometry*:

| Layer | cellFt | Typical dims | One cell is | Generator |
|---|---|---|---|---|
| **Overview** (the whole city, walls to burrows) | 50 ft | 160–320 (2–3 mi true footprint) | a building-cluster / street segment | `site:city:v3` — evolved `genCityWards`: walls ring the CORE, wards inside, roads, river/harbor, farmland + satellite hamlets beyond the walls (the same "burrows" story as WORLDCRAFT K-2, seen from inside) |
| **District** (one ward) | 10 ft | 60–160 | a room-scale chunk of street/yard | `site:district:v1` — NEW: streets + building footprints filling one ward, honoring the context contract (§2) |
| **Building** | 5 ft | 20–60 | one combatant | existing `genBuilding` (BSP) |
| **Floor** | — | — | — | existing `floors[]` z-stack |
| **Room** | — | — | — | existing keyed `areas` |

Dungeons get the same ladder where useful (fortress ⊃ level ⊃ chamber);
villages/towns may skip layers (a village IS its overview at 10 ft). The
ladder is a **convention over the existing schema** — `cellFt` is already
free, `parentSiteId` already chains, `maxDepth` is a UI concern, not a
model one. No schema change for the core epic.

**Rule: a layer never renders another layer's cells as its own data.** The
overview shows a ward as painted blocks + an area rect; the ward's true
streets live in the district site. What bridges the visual gap is the
preview blit (§3), not shared cell data.

## 2. Generation coherence: the context contract

Today `makeSubSite` scales dims from the area footprint and forgets
everything else. Deep stacks need the child to *agree* with the parent —
a street that hits the ward boundary must continue in the district map.

`makeSubSite`/`ensureGeneratedSite` grow a **`SiteContext`** passed into the
child's generator (and hashed into nothing — the child's seed stays the
deterministic `sitePath(worldSeed, entityId, 'site')` chain; context shapes
LAYOUT, seeds stay CONTRACTS-clean):

```ts
interface SiteContext {
  boundary: { w: number; h: number };        // child dims (exists today)
  entries: Array<{ side: 'n'|'e'|'s'|'w'; at: number; kind: 'street'|'gate'|'door'|'water' }>,
  edges:   Array<{ side; kind: 'wall'|'water'|'open' }>,  // coast/wall-backed sides
  theme?: string;                             // THEME_SPACE passthrough (exists)
  bound?: Array<{ entityId; label }>;         // cast to seat (marryCityToWeb, exists)
}
```

- The parent computes `entries` from its own geometry: where its streets/
  gates/river cross the area rect's border, projected to child edge
  coordinates. The child generator opens street stubs/gates/water at
  exactly those points and grows inward. Same trick down a layer:
  district → building doors face the street the district drew.
- Deterministic and stable: context derives from the parent's EFFECTIVE
  floor (gen + overrides), so hand-edits flow down — carve a new gate in
  the overview, the district regenerates with a street meeting it.
  (Regen-on-context-change is offered, never forced — hand-edited children
  warn first, per the overrides philosophy.)
- `marryCityToWeb` keeps working unchanged one layer down: cast members
  seat into district buildings instead of (only) the city core's.

## 3. Navigation: making the stack feel like one map

The goal is Google-Maps continuity over discrete mounts (the same illusion
the hex map's tier crossfade already sells):

1. **Descend** — zoom-in past max over a sub-site area/badge charges into
   the child (mirror of `siteView`'s existing ascend and `mapView`'s
   existing descend-into-pin; one new gesture, two existing precedents).
   Click "Open interior →" stays as the explicit path.
2. **Preview blit** — when zoomed toward an area whose child site exists
   (or is cheap to ghost-generate), draw the child's cached floor canvas
   scaled into the area rect, replacing the flat ward wash. The per-floor
   cache canvas already exists (`siteView.ts:1029`); this is a `drawImage`
   with opacity ramp during the charge. This single trick makes the seam
   read continuous without a true multi-scale renderer.
3. **Ascend** — existing 3-notch zoom-out, kept; plus a **breadcrumb bar**
   (`Everspire ▸ Docks Ward ▸ The Gilded Eel ▸ Floor 2`) — each crumb a
   jump; doubles as the "where am I" answer deep stacks otherwise lose.
4. **Deep links** — extend the existing hash routing: `/world/#e_<id>/map`
   grows `/s:<siteId>/fl:<n>`; `/spaces/` gets `?site=`. Unblocks sharing,
   e2e addressing, and "open where I left off".
5. **Scale honesty** — a scale bar in the site editor (the hex map has
   one; sites, which CLAIM feet per cell, don't) + "≈ 2.4 mi across" in
   the floors panel at overview scale.
6. **World-map marriage** — the descend gesture over a city pin lands in
   the city's OVERVIEW site (true 2–3 mi footprint), so hex map → city →
   ward → taproom → cellar is one continuous zoom, which is the M-plan's
   original promise (MAPS §1.3) finally kept. Later/optional: render the
   overview's wall-and-ward outline as the city's footprint art on the hex
   map itself (one source of truth for both pictures).

## 4. Perf & storage budget

- Every layer stays within the proven envelope (≤ ~220–320 per side; the
  320-side overview is ~100k cells — above the 48k design center, within
  the schema cap; budget it explicitly in `siteView`'s cache sizing and
  verify with a perf spec before blessing 320. Fallback: overview at 66
  ft/cell keeps 2–3 mi under 240 cells/side).
- Only the mounted site renders; children exist as caches (preview blit)
  or seeds (untouched). A fully-explored city stack is ~5–20 sites of
  sparse overrides — hundreds of KB, not the 10M-cell monolith.
- Ghost children: a district site that's never been opened can render its
  preview from a **thumbnail-resolution base regen** (the ~150ms city-thumb
  precedent, done once, cached, off the interaction path).
- Merge/sync: untouched — per-site union LWW already handles any depth.

## 5. Slices (each independently shippable)

| Slice | Ships | Verifies |
|---|---|---|
| **N-1 Ladder & depth** — **SHIPPED** | the scale ladder is live: `defaultSpec` city = 240 cells @ 50 ft (≈2¼ mi); `site:city:v3` overview (full-map water pulled through/beside the core, the genCityWards fabric offset in as the walled CORE via a `preWater` seam, avenues running from every gate to the map edges, keyed BURROW hamlets strung on the approach roads); `makeSubSite` derives child dims from the area footprint (district → 10 ft, clamped 48–220; building → 5 ft) and `notable=1` guarantees every district a landmark so the ladder never dead-ends; breadcrumb trail in the editor bar (parentSiteId chain, crumbs clickable). Farmland stayed open ground — the ink pass draws fields (WORLDCRAFT K-2/N-4) | `smoke-sites` 5c/5d: v3 core strictly interior, avenues reach edges, river border-to-border, burrows keyed, ladder chain 50→10→5 ft with idempotent `makeSubSite`; v2/v1 ids still dispatch their own geometry; `spaces.spec` drills city→ward→building and walks the crumbs back |
| **N-2 Context contract** — **SHIPPED** | `SiteContext {entries, edges}` computed from the parent's EFFECTIVE cells (`computeSiteContext`, sites.ts — run-merged boundary crossings projected to child edge coords; wall/water side flags); stored on `gen.ctx` so the base re-derives identically (schema additive); NEW `site:district:v1` (`genDistrict`) honors it — streets enter exactly where projected, gates punch walled sides, canals enter on water, guaranteed landmark; buildings face their street (`frontageSide` → `door=` opt on `genBuilding`, no-opt path byte-compatible); `refreshChildContext` on open: unedited children follow parent edits silently (seed-stable area ids keep labels + grandchild bindings through the re-lay), hand-edited children get the panel OFFER ("Re-lay to match"). `theme`/`bound` deferred to the marriage pass — v1 context is pure geometry | smoke 5e: exact projection (run mid → child coord), district honors + connects entry→square, wall row + gates, door faces, deterministic under ctx, follow-silently/offer-when-edited with binding survival; ladder chain now asserts `site:district:v1` + ctx present |
| **N-3 Seamless navigation** — **SHIPPED** | descend charge: zoom past the ceiling over a drillable area/badge and 3 notches carry you in (creates the child in GM view, exact mirror of the ascend idiom, with its own "keep zooming to enter X…" cue); **preview blit** — once a drilled area grows past ~140px on screen its child's actual map fades in over the ward wash (per-mount thumb cache, brightens while charging) so the seam reads continuous; **deep links** — `/spaces/?site=<id>&fl=<z>` and `/world/#e_…/map/s:<siteId>/fl:<z>` read AND written (`onNavigate` keeps URLs honest on floor switches; never fights the `#map=` viewport hash; overlay close restores the plain page link); **scale honesty** — canvas scale bar (ft/mi) + "≈ 2.3 mi across" in the floors note | `spaces.spec`: gesture-descend into a ward from the overview, deep link survives a full reload into the right site with crumbs, mi-across note; smoke: the landmark guarantee re-proven under a DENSE ward ctx (the e2e caught fixed-spot placement failing under two dozen radiating streets — now a nearest-first scan with shrink fallback) |
| **N-4 World-map marriage** | hex-map descend lands in the overview; overview outline as the city's hex-map footprint art (joint with WORLDCRAFT K-2) | e2e: continuous world→cellar walk; visual round |
| **N-5 Links** | wire `plane.links` (schema-only today): stairs-to-underdark, portals room↔room, cave-mouth ↔ wilderness; cross-plane descend markers | smoke: link round-trip; e2e: portal hop |

N-1→N-3 are the epic's heart and deliver the owner's sentence verbatim.
N-4 needs WORLDCRAFT's K-2 city art only for its second half. N-5 is
severable.

## 5b. City realism pass (owner adversarial review, 2026-07-20)

Owner: *"The city still feels like a bunch of boxes… ideally a Watabou
beautiful city… going into a building would open that building's map AND the
200 ft block around it so in-city fights can happen… differing city shapes…
detect the roads that go into the city → the roads on the city map."* Two
adversarial critics (cartography + play) ran on the shipped output.

**Diagnosis — why it reads as boxes (four mechanical causes, not the street
algorithm, which is sound):** (1) every building renders one wall color
(`PAL.wall`) — cathedral, hovel, and city wall identical; (2) each building
is a filled rect with a *full-perimeter* floor apron → detached boxes in a
moat of street, never terraced; (3) no civic center — the plaza is bare, the
grand buildings scatter to random wards; (4) the footprint and wall are a
perfect axis-aligned rectangle every seed. **Scale law:** at 50 ft/cell a
building is 2–4 cells, so per-building shape variety is invisible at the
overview (the *block* is the readable unit) — footprint detail pays off only
at the 10 ft district scale and interiors.

**Owner decisions (forks, 2026-07-20):**
- **Building drill = a tactical WINDOW on the district.** Entering a building
  opens a ~200 ft (40–48 cell) 5 ft battle map: the clicked building drawn in
  full, the *real* street + neighbor facades + yard around it (upsampled ×2
  from the district's effective cells), doors leading to street/yard. One
  primitive that also = "drop a battle map anywhere." Must hang off a 10 ft
  **district** (auto-ensure the ward's district if drilled from the 50 ft
  overview — never window a 50 ft parent directly; that's the 400 ft-interior
  artifact's cause). Generalizes the N-2 context contract from an edge strip
  to a windowed upsample.
- **Build an in-app combat layer** (tokens + a `cellFt`-aware ruler + reveal
  on the site editor, layer-agnostic). Its own multi-batch sub-epic; the
  maps aren't runnable in-app without it (UVTT export stays the alternative).
- **Order: roads & shapes first**, then visual, then the window + combat.

**Owner REFRAME (2026-07-22) — the three-level model + flags.** After R1–R6
shipped, the owner recast the whole ladder: *"the top level of the city should
only be ROUGH SHAPES, not recognizable buildings; the zoom-in should be a
district view, then the street view with accessible buildings. Buildings should
be flagged and named at the city level and through each level that has the flag
as a sub-level."* This SUPERSEDES the R7 "upsample the overview's buildings"
plan (there are no overview buildings to upsample now) and partly walks R4's
detailed overview back — the detailed fabric moves DOWN to the district.

- **City (50 ft) = ROUGH.** Ward **zones** (each ward a tinted region) + the
  road / wall / water / coast **skeleton** + named building **FLAGS** (a pin +
  name). No legible individual buildings. *(owner picked "zones + skeleton +
  flags" over "faint fabric" / "keep detail".)*
- **District (10 ft) = the neighborhood.** Streets + the terraced building
  fabric (the R4 look, moved here) + the ward's flagged buildings PLACED
  (named, drillable).
- **Street (5 ft) = accessible buildings.** The R5/R6 tactical window.
- **Flags are the through-line.** A flag = a named building entity (a keyed
  `kind:'building'` area + `flag:true` + role + entityId). Defined once at the
  city level, it is a location in its district and an accessible building at
  street level — the SAME drillable entity at each level. Scope: notables
  auto-flagged **+ the user can flag/name any building** *(owner pick)*.

**Reframed batch sequence:**
- **R7α — the rough overview** *(city v5)* — **SHIPPED (B308)**: `genCityWards`
  gains a `zones` branch (reuses the ward Voronoi + streets + avenues + gates +
  hull; swaps the building-packing + notable/inn tail for zone-fill + flag
  areas). New cosmetic `SiteCell.zone?: number` (per-ward tint) +
  `SiteArea.flag?: boolean` (pin). `siteView` renders zone tints + flag
  pins/labels. v4 dispatchable, frozen.
- **R7β — district correspondence** — **SHIPPED (B309)**: `SiteContext.flags`
  carries the ward's flags projected into child cells (`projectFlags` in
  `makeSubSite` + `refreshChildContext`); `genDistrict` places each as the SAME
  named, drillable building (`flag:true`), with a carved lane to the ward
  square (always reachable) + a street door. So the temple you saw at the city
  level IS there when you zoom in — the layers agree. An overview flag now
  drills to its **ward district** (one building per flag, drilled from inside).
  Placement is ADDITIVE (pure, no rng, no version bump): a flag-less ward's
  district is byte-identical.
- **R7β-2 — terrace the district** *(district v2)* — **SHIPPED (B313)**: R4's
  de-moat, one scale down. `genDistrict` gains a `terrace` branch (dispatched
  for **v2**, the new default mint): houses pack party-walled into blocks
  instead of a full-perimeter moat, one noise-gated back-alley (~75%) cuts the
  interior, and un-planted enclosed pockets become green **garden courts** — a
  market **monument** sits at the ward square. A **reclaim** pass then floods
  the open network from the square and fuses any pinched-off alley/yard back
  into its block, so the street net is fully connected and the only enclosed
  open ground is the courts. Flags/notable/lanes are unchanged (grand buildings
  *should* stand apart). Max fused wall-block ~3–10× v1's moated boxes. v1
  (stored floors) keeps the box-of-boxes, byte-identical (terrace gated, no rng
  leak). Now the district reads as a true zoom of the terraced city.
- **R7γ — user flagging**: flag/name any building at any level.

**Realism lane (R):**

| Item | Ships | Status |
|---|---|---|
| **R1 Roads → gates** | `roadApproachesAt` (world.astro) samples each road route incident on a city pin ~a city-radius out, quantizes its bearing to a compass side, and freezes the set into the `gates` opt at first descend (mirrors `waterFactAt`); `genCityWards` places gates/avenues on exactly those sides when `gates` is present, else the original random 3–4 (byte-identical rng preserved). You enter the city by the road you travelled. | **SHIPPED** — smoke 5c-bis (directional: gates=n→north avenue not south, served, deterministic; ne≠sw) |
| **R2 City shapes** | **SHIPPED (organic hull)** — city **v4**: `genCityWards` gains a shape-gated `organic` path (harmonic-perturbed radial blob mask + one majority-smoothing pass; wards flood/build only inside it; the wall is traced as an 8-adjacent HULL, not four rects; gates pierce the hull exactly where each avenue exits). The core hands the overview its gate cells + outward dirs (`FloorPlan.gates`) so avenues run on without re-detecting a ring. Every seed a different silhouette; v2/v3 untouched (shape absent = original rect path, byte-identical rng). Water carves the blob (coast quay / river bisect). Named archetypes (harbor crescent / hilltop citadel / planned grid / crossroads) are **R2b, deferred** | **SHIPPED** — smoke 5f: v4≠v3, no long straight core wall (maxVertWall <45 & ≥15 shorter than v3's), plaza+districts+burrows, gates pierce the hull (plaza walks out the north gate), deterministic |
| **R3 Building color roles** — **SHIPPED** | cosmetic `role?: BuildRole` on `SiteCell` (NOT a CellType — passability/sealing/export/overrides all read `t`, so it's free: rides generated base cells, `writeCellOverride` never diffs on it); `ROLE_FILL` tint map + the wall render line (and the preview-blit thumb). Generators `stampRole`: the grand notables wear temple/keep/guild/civic/warehouse, and 2–3 near-plaza **inns** are tinted + keyed (owner's example); districts tint their landmark. A few jewel accents (~5–7% of wall mass) against the dark house-fabric. Gated to v4 in `genCityWards` (the inn rolls draw rng shared with the overview — v2/v3 stay byte-identical, untinted) | **SHIPPED** — smoke 5g: v4 tints inns + civic landmarks (keyed), districts tint their landmark, v2/v3 carry no role, deterministic |
| **R4 De-box the fabric** — **SHIPPED** | the full-perimeter floor moat is GONE for v4 (`if (shaped)` in `genCityWards`): a building fronts its street and gets no apron on the street side or the two flanks, so masses along a street pack wall-to-wall into terraced ROWS and fuse into blocks divided only by streets (mean interior wall-block ~1.7–2.1× v3's moated boxes). One noise-gated back alley (~75%) deepens the fabric inward, and the shaped core packs denser to the wall (skirt 6→3) so no big voids. Enclosed un-alleyed pockets (6–44 cells, ~half planted) become green **garden courts** (`garden` role on FLOOR cells → new floor-tier tint in `siteView` main + preview render). A lone civic **monument** (market cross) at the plaza centre, and the near-plaza building nearest the square is promoted to **The Town Hall** (`civic`, keyed) — a civic seat FRONTING the plaza, not a random ward. All noise/geometry-gated so no rng-draw shifts leak; v2/v3 keep the moat, byte-identical | **SHIPPED** — smoke 5h: terraced blocks fuse ≥1.4× v3, garden courts present, town hall keyed + monument ringed by floor, v3 gains neither garden nor hall |
| **R5 Tactical window** — **SHIPPED (window; auto-ensure-district = R5b)** | drilling a building now opens a fixed **40×40 @5 ft (= 200 ft) BLOCK**, not a footprint in a void: new `genBuildingBlock` (building **v2**) draws the clicked footprint detailed in the centre (BSP rooms, a front door onto the street + a back door to the yard), a garden **yard** behind it, **neighbour facades** packed around it on a loose grid (cover, not enterable), a street on the door side, and — where the parent flagged it — the **waterfront quay / city rampart** on an edge. Every interior room stays reachable from the block edge (you walk in off the street). `makeSubSite` sizes the building site to the fixed window and freezes the block facts (`door`/`edge`/`bw`/`bh`) into the generator id (buildings carry **no ctx** → `refreshChildContext` stays clean). v1 (`site:building:v1`, the sealed standalone interior) still dispatches for pre-R5 floors. **R5b deferred:** auto-inserting a 10 ft district when a building is drilled straight from the 50 ft overview (a navigation-smoothness nicety; the window itself is scale-agnostic and already correct from either parent) | **SHIPPED** — smoke 5i: 200 ft block, all rooms reachable off the street, garden yard, neighbour facades, water/wall edges, deterministic, v1 frozen; e2e asserts the drilled building names "200 ft across" |
| **R6 Interior character** — **SHIPPED** | owner review: "buildings look very similar, no unique layouts or details besides walls and floors." Fixed for the v2 window: each type now carves a **distinct plan** — a big PRIMARY room fronting the door (the nave / common room / great hall / shopfront the type is named for, via `PRIMARY_FRAC`) plus a SERVICE band BSP'd into the smaller rooms — and a **per-purpose furnishing** pass (`furnishRoom` + new cosmetic `feature?: BuildFeature` on `SiteCell`, drawn by `drawFeature` in `siteView`). A temple lays a nave of **pews** with an **altar** at the far wall and a **font** by the door; a smithy a **forge** behind its shopfront **counter**; a tavern a long **bar** + **hearth** + tables; a keep a great hall with a long table + **statue**; houses get hearths + **beds**. Features are cosmetic (cell stays `floor`, never blocking — a combat layer may later read them as cover), ride base cells like `role`, and the plan stays reachable from the street. v1 stays bare | **SHIPPED** — smoke 5j: temple nave (pews+altar+font), smithy forge+counter, tavern bar, keep hall; type-distinct (tavern grows no pews), cosmetic (on floor), reachable, deterministic; v1 bare |
| **R7 Layer correspondence** — **SUPERSEDED by the 3-level reframe (above)** | Original idea: the child upsamples the parent's fabric. The owner reframed it: the overview should have NO buildings to upsample — instead the layers agree via **flags** (named building entities defined at the city level, placed in their district, accessible at street level). See the REFRAME block above; R7α/β/γ replace this row. The upsample-in-ctx machinery is shelved (the flag through-line is simpler and matches the owner's model) | **reframed → R7α/β/γ** |
| **C Combat layer** | tokens + `cellFt` ruler + reveal on `siteView`, layer-agnostic; overview chases, district brawls, building fights | queued sub-epic |

### Abandoned settlements descend into a RUIN (owner, 2026-07-22) — SHIPPED

An abandoned settlement (a danger-zone ghost materialized with the `abandoned`
tag, MAPS §9) opens the SAME town footprint fallen in, not a living town.
`ensureGeneratedSite` reads the `abandoned` tag and forces the town generator
with `ruined=1`; a **gated ruin pass** at the end of `genSettlement` then, on
the fully-built plan: collapses ~60% of the tracked building masses (perimeter
walls crack into floor gaps, interiors cave to `hazard` rubble, heavy ones open
to the sky), **breaches** the town wall in 2–3 spans, scatters rubble over ~7%
of the streets, and stagnates the **well** in the square into a small pool.
The key reads the ruin: plaza → *The Silent Square*, wards → *"… (in ruins)"*,
notable buildings → wreck names. It reuses existing cell types (hazard/water/
floor) so `siteView` needs no change, and every decision is position-hashed or
a late rng draw so the base re-derives identically (the overrides storage
contract holds). **The living town/city paths never enter the block** (opt is
absent → byte-identical rng, no version bump). smoke-sites **5i** (rubble +
breach + well + labels, one coherent walkable network ≥75%, deterministic,
regen-hook match, living town untouched) and **8e** (abandoned entity → ruined
town wiring; living settlement never ruined). *Deferred:* a ruined building
drilled at street scale still opens a clean interior — propagate `ruined`
through `makeSubSite`/`genBuildingBlock` as a follow-up.

**Lairs & dungeons need their generators wired too** (owner, 2026-07-22 —
tracked in ROADMAP "Next"). The interior-marriage machinery here
(`bodyRooms`, `themeOfEntity`/`THEME_SPACE`, `placePrize` on the `heldBy`
holder) is built to consume the rich `dungeon.ts`/`lair.ts` composite bodies
(numbered rooms, a themed boss, a hoard, a resident) — but map-materialized
landmarks all run the generic `landmark` composite (`world.astro`
`onMaterializeGhost` → `runComposite('landmark', …)`), which emits none of
that, so a map dungeon/lair opens a bare, unmarried, unthemed floor with no
boss in the sanctum. Fix = route the ghost/materialize path by landmark kind
(`dungeon`/`ruin` → dungeon composite, `lair`/`cave` → lair composite) so the
body carries what this marriage already knows how to bind. The floor
generators (`genDungeon`/`genCave`) are already correct — only the CONTENT
feed is missing.

## 6. Decisions taken here (challenge in review, not mid-build)

- **No giant grids.** Reaffirmed from MAPS §3.1; stacking is the mechanism.
- **Square grids stay** (Q16); the ladder is a convention over `cellFt` +
  `parentSiteId`, not new schema.
- **Old cities never migrate.** `site:city:v2` saves render forever
  (generator version strings); v3 is for new mints — the genVersion
  philosophy applied to sites.
- **Context shapes layout, never identity.** Seeds/ids stay on the
  CONTRACTS §1 path; `SiteContext` is an input to the layout pass only, so
  a context change re-lays streets but never re-mints entities.
