# Hex Map Architecture — Four Tiers, One World

*Drafted 2026-07-12. Companion to [ARCHITECTURE.md](ARCHITECTURE.md) §7.
Owner decisions recorded here: **no external links or imports** (no Watabou,
no Azgaar) — we mold our own generation process on their ideas; the only
stopgap while native maps are built is plain image upload. The map is
hex-based with four tiers — **world, region, locale, ground** — navigated by
Google-Maps-style zoom, so a user can start at the world map and zoom all the
way into a dungeon, seeing saved landmarks at every grain.*

*A throwaway interactive prototype of the zoom/tier mechanics lives at
[`/labs/hex-zoom.html`](../../v2/public/labs/hex-zoom.html) — open it in a browser.*

---

## 1. Requirements

1. Four hex tiers: **world → region → locale → ground**, each at a larger
   scale (finer grain) than the last.
2. Continuous zoom between tiers, Google Maps style — not page navigation.
3. Saved landmarks (entities) visible at every grain appropriate to them;
   zooming from continent to dungeon passes through them naturally.
4. Terrain/content at every tier can be **generated** (our own process,
   modeled on Azgaar's simulate-then-curate and Watabou's seed-determinism),
   **edited** (paint, name, annotate), or both.
5. Fits the platform constraints: static site, no backend, IndexedDB
   storage, seeded determinism, ghost/materialize philosophy.

## 2. The geometric truth first: hexagons do not nest ⚠️ SLOW (decide once, live with it forever)

A hexagon cannot be subdivided into smaller hexagons. Any "hexes within
hexes" design must pick one of three strategies, and the choice shapes
coordinates, storage, rendering, and generation for the life of the product:

**Option A — approximate nesting (Gosper / aperture-7).** Seven hexes in a
flower approximate one larger hex; recurse for 7^k tiers (this is how Uber's
H3 geospatial index works). Elegant on paper. Costs: parent "hexes" have
fractal boundaries, child cells straddle parent edges, the ×√7 ≈ 2.65 linear
step per level means reaching dungeon scale from world scale needs ~10+
levels, not 4, and every coordinate operation inherits the approximation.

**Option B — clipped child grids.** Each world hex, when opened, contains its
own self-contained region grid clipped to the parent's boundary (the classic
hexcrawl "atlas page" model, e.g. Welsh Piper templates). Costs: seams — a
river or road crossing a parent-hex edge must be stitched across two
independent child grids; panning at region tier crosses page boundaries; the
"one continuous world" feel dies at every edge.

**Option C — one continuous plane, independent tier grids (RECOMMENDED).**
The world is a single continuous coordinate plane. Each tier is simply a hex
grid of its own cell size laid over that plane — a *view and spatial index*,
not a container. This is exactly the Google Maps model (zoom tiles are
independent rasterizations of one continuous space; tile boundaries at one
zoom don't nest into the next):

- Landmarks are **points** on the plane. "Which hex holds this landmark at
  region tier?" is arithmetic, not stored structure.
- Panning never hits a seam; rivers and roads are continuous polylines.
- Tier cell sizes are **free to be chosen for gameplay meaning** — no
  divisibility constraint between tiers at all (the ratios below are 10, 63,
  and 100, and nothing breaks).
- A hex at any tier has a canonical address `(tier, q, r)` (axial coords),
  computable from any point — which makes the hex address usable as a **seed
  slot** (§5), unifying maps with the ghost-entity system.
- The one thing lost: a region hex does not "belong" to exactly one world
  hex (it can straddle a boundary). In practice nothing needs that
  relationship — logical containment lives in the entity tree, not the grid.

**FROZEN (owner, 2026-07-12):** Option C; **pointy-top** hexes (Q15); base
unit **feet**, stored as float64 (a 3,000-mile world is ~1.6×10⁷ ft, inside
float precision), with a **metric display toggle** (Q21) — display-layer
only, the stored unit never changes. A world has **multiple named planes**
(Q18), each its own continuous coordinate plane with its own hex grids and
seed lineage (`H(worldSeed, planeId, tier, q, r)`).

## 3. The four tiers: scales and meaning

Scales chosen for *gameplay semantics*, not divisibility (Option C frees us):

| Tier | Hex size (flat-to-flat) | One hex means | What lives at this grain |
|---|---|---|---|
| **World** | **60 miles** | a kingdom province; 2–3 days' hard ride | seas, mountain ranges, kingdoms, biomes, capitals, world-wonders |
| **Region** | **6 miles** | the classic hexcrawl hex — a day's cautious overland travel through one hex, the horizon seen from a low hill | towns, villages, ruins, lairs, bridges, roads, river courses, forests-with-shape |
| **Locale** | **500 feet** | a city district / a farmstead / a clearing | districts, individual buildings & businesses, gates, docks, cave mouths, encounter spots |
| **Ground** | **5 feet** | one combatant | dungeon rooms, furniture, doors, traps — the battlemap |
| | | | |

Reference points: a big city is ~10–25 locale hexes across; a village is
1–4; one region hex contains ~63×63 locale hexes; a 40×30 world-hex map is
a 2,400×1,800-mile continent.

### 3.1 The ground-tier exception: sites, not a global grid ⚠️ SLOW (the most important structural decision in this doc)

Tiers 1–3 are global: every point on the plane has a world, region, and
locale hex. Ground tier must **not** be global — a continent at 5-ft
resolution is ~10¹³ cells; no storage scheme, and no *authorial* reality,
supports it (nobody maps the whole world at battle scale — dungeons are
discrete places).

So ground tier = **site patches**: bounded ground-scale maps (a dungeon
level, a tavern interior, a castle courtyard) anchored at a point on the
plane, each with its own local grid and dimensions. Zooming in at locale
tier toward a site marker crosses into the site's map (a focus transition —
the Google Maps analog is zooming into a building with an indoor map). The
experience the requirement asks for — world → dungeon in one continuous
gesture — is preserved; the implementation is honest about what exists.

RESOLVED (owner, 2026-07-12): **square grids** (Q16). Sites are **battle
maps sized to the space shown** — a tavern interior might be 20×20 cells, a
city map 200×200 — and sites **nest**: a city site can contain building
sub-sites, mirroring the entity containment tree (Q17). The smallest area
is always a usable battle map.

Multi-level sites (dungeon level 2, tower floors) are a z-stack within one
site (`floors[]`) — in the v1 schema even if the UI ships single-floor.
Verticality is **both** (Q20): floors inside sites, and **multiple planes**
(Q18) for global depth — an underdark plane is a full hex world coordinate-
aligned with the surface plane, so "descend here" markers link the same
(x, y) across planes. Other continents and planes of existence are further
plane instances of the same world.

### 3.1b Resolved at batch 8 (owner, 2026-07-13)

- **Periodic terrain: YES.** G1 samples noise on a cylinder (x-periodic) so
  east–west wrap is seamless; frozen into genVersion 1 at M1.
- **User-led worldgen (Civ-style):** creation offers landform presets —
  single continent, N continents, archipelago, pangea, scattered isles —
  plus water % and climate; implemented as a continent-mask term shaping
  the G1 field. Landform + size + seed are the creation trio.
- **Tree ↔ map merge:** the map is NOT a separate page. M1 renders the map
  panel inside /world/ beside the tree (jump-to-map button from the tree
  first; then persistent side-by-side): map selection opens entity details
  in the panel, and "+ Add here" creates entities from the map. One
  surface, two projections of the same world.

### 3.1c Settlement placement & footprints (owner, 2026-07-13 — batch 9)

- **No circular landmasses.** Landform blobs are rotated stretched
  ellipses and the whole mask field is domain-warped at continental scale
  (implemented in G1 pre-freeze); silhouettes and coasts must meander.
- **Settlements sit on land by default.** Taverns, villages, towns, and
  cities belong on land hexes; every placement path (map "+ Add here",
  future story-web placement, future smart placement) checks the hex's
  biome. Building on open water is allowed only as an INTENTIONAL choice:
  the map confirms first, tags the entity `waterborne`, marks the anchor
  `icon: "waterborne"`, and the hex gets its own art — stilts, rafts,
  harbor piles (interim: teal pin with waves; full art with the glyph
  pack).
- **Footprint sizes** (drives footprint rendering, site-map extents, and
  smart placement):
  | Settlement | Footprint across | On the grid |
  |---|---|---|
  | City | 2–3 mi | 2–3 mile-tier hexes (5,280 ft each) |
  | Town | ~½ mi | a half-mile cluster inside one mile hex |
  | Village | ~¼ mi | a quarter-mile cluster, several locale hexes |
  Cities visibly occupy multiple mile hexes; a village never swallows a
  whole mile hex. The G5a footprint renderer and the M3 site-map extents
  both read from this table.
- **Watabou-style settlement generation (own process)** — G5's target,
  restated: generated city/town/village PLANS (districts, streets, walls,
  building footprints) in the spirit of Watabou's generators but built
  in-house, plus **smart location placement**: settlements prefer
  harbors, river crossings, crossroads, defensible hills; ports face the
  water they serve. ⚠️ SLOW lane (G5 stages a→c); footprints (G5a) come
  first, morphology later.

### 3.2 World extent (owner directive, 2026-07-12 — batch 5)

- **Default: Earth-equivalent, bounded.** A new world's surface plane
  defaults to ~**25,000 miles across** (Earth-scale, ≈1.32×10⁸ ft — well
  inside float64 precision), not endless. The Vessia example world adopts
  this extent. Bounded worlds get a defined edge (ocean ring or map border)
  and the viewer clamps panning to it. Size presets at creation (island /
  kingdom / continent / Earth-equivalent) — immutable after, like tier
  scales (Q17).
- **Option: Endless.** An opt-in world setting removes the bound. Ghost
  terrain already makes an endless plane free (hexes derive from seeds —
  nothing is stored until touched), so endless is a clamp removed, not a
  feature built.
- **Globe view + edge wrap (owner, 2026-07-12 — batch 6).** For bounded
  Earth-size worlds, a "full world" zoom stop shows the whole map — and,
  if feasible, past it: zooming all the way out morphs the flat map into a
  **spinning orthographic globe**, sliding smoothly back into the flat map
  on zoom-in. The flat map is then formally the **equirectangular
  projection of a sphere**, which implies: (a) **polar compression** —
  far-out flat rendering compresses toward north/south as the projection
  dictates; (b) **east–west wrap** — panning off either edge feeds cleanly
  in from the opposite side (x wraps modulo circumference). Feasibility
  notes: the globe render is tractable (per-pixel orthographic inversion
  over the terrain field — the donjon fractal-globe lineage proves it, and
  our G1 field is already a pure function of position); the morph can be a
  projection blend. ⚠️ The load-bearing consequence is that seamless wrap
  requires the terrain noise to be **periodic in x** (3D noise on a
  cylinder or seamless tiling) — that changes the G1 field definition, so
  this decision must land **before genVersion 1 freezes at M1**, not
  retrofitted after worlds exist. Poles also pinch hex grids; tiers 1–3
  render in projection (hexes are plane-views, so they compress with the
  projection), with honest distortion accepted at extreme latitudes.
- **Option: procedural filling of an endless world.** For endless worlds, a
  noted future option lets exploration *materialize* as it goes — regions/
  settlements the user lingers on get committed (auto-Keep at a chosen
  radius or on visit), so an endless world gradually becomes a persistent
  one along the paths actually traveled. Sparse-store sizing must be
  watched here; auto-materialization needs a budget/pruning story before it
  ships.

## 4. Coordinates, addressing, zoom bands

- **Plane:** origin at map center, +x east, +y south, unit = feet.
- **Hex address:** axial `(q, r)` per tier, from the standard point→axial
  rounding for the chosen orientation. Canonical string `region:12,-4`.
- **Point → hex** and **hex → polygon** are pure functions of tier size; no
  stored grid exists anywhere.
- **Zoom bands:** the active tier is a function of pixels-per-foot. Each
  tier renders while its hex is between ~16 px and ~200 px on screen; bands
  overlap, and in the overlap the finer grid fades in over the coarser
  (cross-fade, no popping). Terrain color is always painted from the finest
  faded-in tier, so zooming *refines* rather than *replaces* — the same
  noise field sampled at finer hex centers (§6) makes a world hex's forest
  resolve into region hexes of forest, clearing, and hill, which is exactly
  the "zoom reveals detail" feel the requirement describes.
- **Viewport in the URL hash** (`#x,y,zoom`) — any view is a shareable
  permalink (the 5etools filter-state pattern applied to space).

## 5. Hexes as seed slots: space is copy-on-write

The unification that makes the whole design click:

```
hexSeed = H(worldSeed, tier, q, r)
```

- Every hex at every tier has a deterministic seed **without storing
  anything**. Ghost terrain (biome, features, names) renders from it on
  demand, identically forever — the Watabou permalink trick, applied to
  every cell of space.
- **Materialization = the sparse hex store.** Only hexes the user touches
  (paints a biome, names, annotates, dismisses a ghost feature, accepts a
  generated settlement) get a record, keyed by address. A hand-painted
  region overrides the generated ghost underneath; everything else stays
  ghost. A heavily-played world stores hundreds of hex records, not
  millions.
- Ghost **features** (a suggested ruin in a region hex, a suggested shop in
  a locale hex) come from the same seed via the existing composite
  generators, and materialize into *entities* through the §5 adapter layer
  of ARCHITECTURE.md — the map and the wiki share one ghost system, one
  provenance model, one reroll semantics (reroll counter mixed into the hex
  seed, stored sparsely on the hex record).
- **⚠️ SLOW — the seed contract doubles down.** With hexes as seed slots,
  the hash, the tier ids, and the noise-field parameters (§6) all join the
  frozen compatibility surface: changing any of them silently redraws every
  un-materialized hex in every user's world. Version the terrain generator
  (`genVersion` on the world) from day one so old worlds can pin old
  terrain.

## 6. Generation — our own process, molded on theirs

What we take from Azgaar is the *pipeline philosophy* (layered simulation,
everything editable afterward); from Watabou, *determinism and single-purpose
polish*; from donjon, *rule-table density* (demographics → settlement counts
→ businesses → tradesmen is literally our drill-down, in table form). What we
do NOT take is their implementation or their vector complexity — hex
resolution makes every stage tractable in a way Azgaar's Voronoi-polygon
world never was.

Stages, in build order (each independently shippable; later ones ⚠️ SLOW):

| Stage | What it does | Tractability |
|---|---|---|
| **G1 — World terrain** | One continuous seeded noise field over the plane (elevation + moisture octaves, latitude temperature gradient, sea-level threshold from a "water %" setting). Biome per hex from an (elevation, moisture, temperature) lookup table. Sampled at world-hex centers for tier 1, region-hex centers for tier 2 — refinement is free (§4). | **Fast.** Weeks. This is the prototype's core and it already looks like a world. |
| **G2 — Region features** | Per region hex: settlement/ruin/lair placement driven by the medieval-demographics tables (kingdom density → counts) filtered by biome; ghost features with derived seeds; names from the name tables filtered by culture tag. | Medium. Mostly table plumbing we already have. |
| **G3 — Rivers & roads** | Downhill flow tracing on the world/region noise field for rivers; A* between materialized settlements for roads; both stored as polylines in plane coordinates (continuous across tiers — Option C's payoff). RESOLVED (Q19): freeform polylines, judged by **realistic feel + inter-hex continuity** — never hex-edge-locked data. | ⚠️ SLOW-ish. Algorithmically fiddly (sinks, lakes, braiding, road aesthetics). Ship terrain + features first; add flow later. |
| **G4 — Locale wilderness** | Locale-tier detail inside a region hex: terrain micro-features, clearings, camp spots, cave mouths; encounter suggestions biome-filtered from the monster DB. | Medium. |
| **G5 — Locale settlements** | The Watabou-shaped problem: streets, walls, districts, building footprints. **⚠️ SLOW — the slowest item in the entire platform plan.** Stage it: (a) district blobs + named building anchors on locale hexes (weeks, immediately useful — the wiki cares about *what and where*, not façades); (b) road/wall skeletons; (c) building-footprint morphology (the multi-year polish tier — do not gate anything on it). | ⚠️ SLOW |
| **G6 — Ground sites** | Dungeon generation is a well-trodden field (room-and-corridor, cellular caves — donjon has run one since 1999); building interiors from templates per building type. Seeded per site, **themed by story-web roles** (ARCHITECTURE.md §5.6): a quest-referenced dungeon generates with its theme's motif, tag-filtered monsters, and the quest's prize placed inside. | Medium; the *generator* is easier than the site editor around it. |

Every stage obeys the law from ARCHITECTURE.md §4: generation always lands as
editable records (hex records, entities, site cells) — never dead pixels.

## 7. Landmarks at every grain

The requirement: saved landmarks visible from the world map down to the
dungeon.

- **Anchor record:** `{ entityId, x, y, tier }` — the entity's position on
  the plane plus its *home tier* (the grain where it natively belongs: a
  kingdom → world, a town → region, a tavern → locale, a trap → a site
  cell). An entity's page and its anchor cross-link both ways; placing an
  entity on the map is one drag from its page (or automatic on
  materializing a generated ghost feature).
- **Visibility rule:** an anchor renders at its home tier and every finer
  tier (the tavern is visible at locale and inside its site's context;
  the town at region, locale…). At *coarser* tiers it aggregates: a world
  hex shows a small badge — "12 places" — summing everything anchored
  beneath it, so a zoomed-out map still telegraphs where the saved world is
  dense. Optionally an entity can be **promoted** one tier (a capital city
  visible on the world map) — an explicit flag, not a heuristic.
- **Click anywhere:** selecting a hex opens the side panel (World Anvil's
  best map decision: the article opens *beside* the map, never navigating
  away) listing: the hex's terrain/name, materialized entities anchored in
  it, ghost suggestions, and "+ Add here" (the universal affordance from
  ARCHITECTURE.md §5.2, now spatial).
- **Logical vs spatial containment stay separate:** the entity tree says the
  keeper is *in* the tavern; the map says the tavern is *at* (x, y). People
  and items normally inherit their container's anchor rather than owning
  one. Do not conflate the tree with the grid — a duchy's *border* (region
  hexes it claims, rendered as tinted overlay) is a later feature
  (`claims: [hexAddr]` on the entity), distinct from both.

## 8. Rendering & interaction plan

- **Canvas 2D, no dependencies** (matches the codebase's zero-runtime-dep
  culture; SVG DOM dies at tens of thousands of hex cells, canvas doesn't).
  One `<canvas>` island, devicePixelRatio-aware.
- **Viewport culling:** compute the axial range covering the screen for each
  active tier and draw only those hexes — the sparse store means lookups are
  `O(visible)`, and ghost hexes are computed, not fetched.
- **Layer order:** terrain fill → water/rivers → hex grid lines (fade by
  zoom) → claims/borders → routes → site footprints → anchors/markers →
  labels → selection. Labels declutter by tier (world-tier names render
  large and sparse; region names appear as their band fades in).
- **Interaction:** drag pan, wheel/pinch zoom centered on cursor, click to
  select, double-click to zoom a band, breadcrumb scale bar ("60-mile hexes"
  → "5-ft squares"), and a tier indicator that doubles as a jump control.
  Keyboard: +/- zoom, arrows pan.
- **Performance budget:** 60 fps pan at ≤ ~4k hexes on screen; noise
  sampling memoized per (tier, q, r) with an LRU; redraw on RAF, dirty-rect
  optimization only if profiling demands it.
- **Image-upload stopgap/companion:** an uploaded image can be pinned to the
  plane as a background layer (with a scale calibration step: "this image
  spans N miles"), so hand-drawn maps and the hex system coexist — this is
  the *only* interim map feature, per owner decision, and it survives
  long-term as a feature (imported art under the data layer) rather than
  being throwaway.

## 9. Storage schema (draft — Phase 0 challenges this)

```jsonc
// world.planes[] — one instance per named plane (Q18: surface, underdark,
// other continents/planes of existence). Hex seeds mix in the planeId.
{
  "id": "p_surface", "name": "The Surface",
  "genVersion": 1,
  "seed": "vessia-prime",
  "unit": "ft",
  "orientation": "pointy",
  "tiers": [
    { "id": "world",  "hexFt": 316800 },   // 60 mi
    { "id": "region", "hexFt": 31680  },   // 6 mi
    { "id": "locale", "hexFt": 500    }
  ],
  "settings": { "waterPct": 60, "axialTilt": "temperate" },

  "hexes": {                                // sparse — touched hexes only
    "region:12,-4": {
      "biome": "forest",                    // override of the ghost value
      "name": "Thornwald Edge",
      "notes": "e_note31",
      "reroll": 2,                          // mixed into hexSeed
      "dismissed": ["feature:1"]            // ghost tombstones
    }
  },

  "anchors": [
    { "entityId": "e_city9", "x": 812400.0, "y": -220800.0,
      "tier": "region", "promoted": true, "icon": "city" }
  ],

  "claims":  { "e_duchy2": ["region:11,-4", "region:12,-4"] },

  "routes":  [ { "id": "rt_1", "kind": "road", "pts": [[x,y], …],
                 "entityId": "e_road5" } ],

  "images":  [ { "blobId": "img_2", "x": 0, "y": 0, "spanFt": 5280000,
                 "opacity": 0.8, "belowGrid": true } ],

  "sites": [
    { "id": "s_1", "entityId": "e_dungeon4",
      "x": 813100.0, "y": -220100.0,
      "grid": "square", "cellFt": 5,
      "floors": [ { "label": "Level 1", "w": 60, "h": 40,
                    "cells": { "12,7": { "t": "floor" } },   // sparse
                    "gen": { "generator": "dungeon", "seed": "…" } } ] }
  ]
}
```

Sizing sanity check: hex records ~100 bytes; a deeply-played world with 2,000
touched hexes, 500 anchors, 20 sites ≈ a few hundred KB of JSON + image
blobs. IndexedDB and the Drive envelope handle it without ceremony.

## 10. Phasing (maps track — slots into ARCHITECTURE.md §11)

- **M0 (in Phase 0):** decisions frozen (§11) — remaining M0 work is the
  seed/noise contract spec and the plane-instance schema.
- **M1 (with Phase B/C):** canvas viewer — pan/zoom/crossfade over G1 ghost
  terrain; hex select + side panel; biome paint + name (the sparse store);
  anchors with tier visibility + badges; URL-hash viewport; image-layer
  upload; viewport PNG export; metric display toggle; touch/pinch;
  **legend panel** (owner, 2026-07-12): biome/icon key + toggleable marker
  groups (settlements, landmarks, quest sites, shops/taverns…).
  - *Shipped 2026-07-13:* G1 terrain frozen (x-periodic, landform presets);
    mountMap widget inside /world/ (tree↔map merge) — pan/zoom/crossfade,
    coastlines, kingdom-claim outlines + legend, anchor pins with road-atlas
    declutter, hex select + "+ Add here" (mints an anchored page), tree→map
    pan, page→map 🗺 button, fit-world zoom stop with macro LOD tiers;
    Civ-style New World form (landform/water/climate/size + live sketch,
    dials pinned into the doc). *Still open in M1:* biome paint + hex
    naming (sparse store), URL-hash viewport, image-layer upload, viewport
    PNG export, metric toggle, per-group marker toggles.
- **M2:** G2 region features as ghosts, materializing through the entity
  adapters; "+ Add here"; claims overlay rendered as **kingdom outlines**
  (tinted borders per claiming entity, listed in the legend — owner,
  2026-07-12); multiple named planes with cross-plane "descend/ascend"
  markers.
- **M3:** sites — anchor, ground-tier patch viewer/editor (variable-size
  square grids, nested sub-sites, floors), G6 dungeon generation themed by
  story-web roles, the locale→site zoom transition.
- **M4 (⚠️ SLOW, parallel, unhurried):** G3 rivers/roads; G5 settlement
  morphology stage (a), then (b); label decluttering polish; print-quality
  map output.
- **TODO (owner, 2026-07-12):** richer hex-map texture generation —
  special **village/city footprint rendering** on settlement hexes (huts,
  walls, sprawl scaled by population), **road textures** along routes, and
  **unique dungeon-entrance variants** per landmark flavor (barrow door,
  cave mouth, ruined gate, sinkhole, standing stones…). Slots into G2
  (feature glyphs), G3 (roads), and G5a (settlement footprints); the glyph
  system in the prototype is the seam to grow these from.

## 11. Phase 0 map decisions — RESOLVED (owner, 2026-07-12)

1. Hex orientation: **pointy-top** (Q15).
2. Ground sites: **square grids**, sized to the space shown (tavern 20×20,
   city 200×200), **nested sub-sites** allowed (Q16/Q17).
3. Tier scales: **60 mi / 6 mi / 500 ft stand**; ground is per-site;
   creation-time per-world override remains cheap and allowed (Q17).
4. **Multiple named planes** per world (continents, underdark, planes of
   existence), coordinate-aligned for cross-plane markers (Q18/Q20).
5. Weather/climate: **Phase D**, with calendars (Q31).
6. Rivers/roads: **freeform polylines**, realism + inter-hex continuity
   (Q19).
7. Units: feet native, **metric display toggle** planned (Q21).
