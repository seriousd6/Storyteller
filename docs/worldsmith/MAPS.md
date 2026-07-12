# Hex Map Architecture — Four Tiers, One World

*Drafted 2026-07-12. Companion to [ARCHITECTURE.md](ARCHITECTURE.md) §7.
Owner decisions recorded here: **no external links or imports** (no Watabou,
no Azgaar) — we mold our own generation process on their ideas; the only
stopgap while native maps are built is plain image upload. The map is
hex-based with four tiers — **world, region, locale, ground** — navigated by
Google-Maps-style zoom, so a user can start at the world map and zoom all the
way into a dungeon, seeing saved landmarks at every grain.*

*A throwaway interactive prototype of the zoom/tier mechanics lives at
[`prototypes/hex-zoom.html`](prototypes/hex-zoom.html) — open it in a browser.*

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

**Decision to freeze in Phase 0:** Option C, plus hex orientation (pointy-top
vs flat-top — purely aesthetic, but every formula and every rendered map
depends on it; the prototype uses pointy-top) and the base unit (recommend
**feet**, the native unit of the 5-ft grid, stored as float64 — a
3,000-mile world is ~1.6×10⁷ ft, comfortably inside float precision).

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

Open question for Phase 0, flagged deliberately: **hex or square grids
inside sites?** The unified-hex vision says hex at 5 ft. Genre convention
and VTT interop (battlemaps, dungeon exports) say square. Recommendation:
per-site setting, defaulting to square for interiors/dungeons and hex for
outdoor site patches — but this deserves the owner's call, not a default
taken silently.

Multi-level sites (dungeon level 2, tower floors) are a z-stack within one
site — cheap to model now (`floors[]`), painful to retrofit; include in v1
schema even if the UI ships single-floor.

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
| **G3 — Rivers & roads** | Downhill flow tracing on the world/region noise field for rivers; A* between materialized settlements for roads; both stored as polylines in plane coordinates (continuous across tiers — Option C's payoff). | ⚠️ SLOW-ish. Algorithmically fiddly (sinks, lakes, braiding, road aesthetics). Ship terrain + features first; add flow later. |
| **G4 — Locale wilderness** | Locale-tier detail inside a region hex: terrain micro-features, clearings, camp spots, cave mouths; encounter suggestions biome-filtered from the monster DB. | Medium. |
| **G5 — Locale settlements** | The Watabou-shaped problem: streets, walls, districts, building footprints. **⚠️ SLOW — the slowest item in the entire platform plan.** Stage it: (a) district blobs + named building anchors on locale hexes (weeks, immediately useful — the wiki cares about *what and where*, not façades); (b) road/wall skeletons; (c) building-footprint morphology (the multi-year polish tier — do not gate anything on it). | ⚠️ SLOW |
| **G6 — Ground sites** | Dungeon generation is a well-trodden field (room-and-corridor, cellular caves — donjon has run one since 1999); building interiors from templates per building type. Seeded per site. | Medium; the *generator* is easier than the site editor around it. |

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
// world.map
{
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

- **M0 (in Phase 0):** freeze Option C, orientation, unit, tier scales, the
  seed/noise contract, site grid question. The prototype exists to make
  these decisions with hands, not arguments.
- **M1 (with Phase B/C):** canvas viewer — pan/zoom/crossfade over G1 ghost
  terrain; hex select + side panel; biome paint + name (the sparse store);
  anchors with tier visibility + badges; URL-hash viewport; image-layer
  upload.
- **M2:** G2 region features as ghosts, materializing through the entity
  adapters; "+ Add here"; claims overlay.
- **M3:** sites — anchor, ground-tier patch viewer/editor, G6 dungeon
  generation, the locale→site zoom transition.
- **M4 (⚠️ SLOW, parallel, unhurried):** G3 rivers/roads; G5 settlement
  morphology stage (a), then (b); label decluttering polish; z-stack floors
  UI.

## 11. Open questions for the owner (Phase 0 agenda)

1. Pointy-top or flat-top hexes? (Aesthetic; prototype is pointy.)
2. Ground sites: square grids, hex grids, or per-site choice? (§3.1)
3. Tier scales: keep 60 mi / 6 mi / 500 ft / 5 ft, or adjust? (E.g., 24-mile
   world hexes for smaller worlds; 250-ft locale hexes for denser cities.)
   Per-world configurability is cheap at creation time and impossible after.
4. One plane per world, or multiple named planes (continents/planes of
   existence) each with their own map instance? (Schema supports the latter
   easily if decided now.)
5. Does weather/climate (donjon calendar-weather, Fantasy Calendar's
   climate model) belong on the hex (per-biome) from day one, or Phase D
   with calendars? (Recommend D.)
