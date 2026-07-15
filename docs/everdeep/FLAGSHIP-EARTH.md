# The flagship: Real Earth as an era-skinnable fantasy world

> Owner vision (batch 71): "This is going to be our flagship map. We will be
> using it to do era-based replacements of kingdoms and powers in a fantasy
> world — Earth 1850, Earth 100 AD, etc. We create fantasy kingdom profiles
> based on the regional powers at that time, fantasyfied versions of their major
> cities. On the base seed they go where they belong; with a seed, attempt to
> follow the drift — the correct region to the correct power, their cities at the
> closest point they would have been. We may restrict era replacements to the
> base seed only."

The Real-Earth landform (batches 66–70) is the substrate. This doc is the plan
for turning it into the flagship: a real Earth you can re-skin to any historical
era as a fantasy world.

## Where we are (the substrate — shipped)

- **Real geography**: elevation at 2048×1024 (~19 km/cell) for relief (batch 70),
  with the land/sea boundary decided by a far finer **10800×5400 (~3.7 km/cell)
  Natural Earth coastline mask** (batch 85) — actual continents, crisp
  coastlines, mountains, small islands, the Keys.
- **Real biomes** from NASA's Blue Marble land cover (batch 72), with high-plateau
  and hot-desert misclassification fixed (batch 87).
- **Named geography** — oceans, seas, ranges, forests, deserts, lakes and great
  rivers, fantasyfied from a 90-feature real dataset (batch 89) — and the world's
  **23 great river trunks authored on their real courses** (batch 90).
- **The era layer has begun**: Earth — 2026 is the shipped example world (batches
  86/96), with real regional powers, fantasyfied cities, and rulers who are
  fantasyfied real 2026 heads of state (batch 92). It is effectively the first
  era pack, built ad hoc — F-3's job is to generalize its shape into a reusable
  format so 100 AD and 1850 don't start from scratch.
- **Real climate & hydrology**: latitude rain bands, rain shadows, real rivers
  (Amazon/Nile/…), endorheic seas, ocean bathymetry (batches 66–68).
- **Populated**: procedurally-placed capitals/towns/villages + roads (batch 69),
  now generated off-thread in a worker (batch 71).
- **Coordinate contract**: any point maps to real (lat, lon) — `lon = -180 +
  (x/circumFt)·360`, `lat = -(y/(heightFt/2))·90` (north-up). This is the hook
  the era layer hangs on: real-world places have known lat/lon, so a fantasy
  kingdom can be dropped at the real coordinates of the power it re-skins.

## The gap the owner is pointing at

"It still looks a bit different to what I'd expect from an Earth clone." Two
causes, both addressable:

1. **Biomes are modelled, not real.** Colours come from our temperature ×
   moisture climate model over real elevation. It's close, but the exact desert/
   forest/steppe boundaries differ from the real Sahara/Amazon/steppe. **Fix:**
   bake a real land-cover / biome raster (like the elevation grid) and read it
   directly for `earth`, so the greens and tans land exactly where Earth's do.
2. **World-tier coarseness.** The zoomed-out map samples 60-mi hexes, so a
   coastline reads chunky even though the data is fine. The data IS there when
   you zoom to the region tier; the flagship may want a finer world tier and/or
   real coastline detail carried into the region tier instead of procedural
   wiggle. (Costs generation time — hence the worker.)

## ⭐ PRIORITY DIRECTIVE — ultra-high-fidelity Earth (owner, 2026-07-15)

> "earth creation still mangles Florida and other detailed places. I want an
> ultra-high fidelity recreation of earth. this needs to be first fix after the
> random table updates are finished."

### ✅ STATUS: mostly SHIPPED in batch 85 (corrected 2026-07-15)

**Read this before scoping the section below.** Everything from here to the end
of the build order was written *before* batch 85 and describes the problem as
pending. It isn't. Batch 85 shipped the fix; steps 1–3 below are done:

- **Step 1 (finer source raster) — done.** A 1-bit land/sea mask rasterized from
  the public-domain Natural Earth 10 m land polygons at **10800×5400**
  (~3.7 km/cell), baked by `scripts/bake-earth-coast.mjs` → `earthCoast.ts`.
- **Step 2 (lazy + compressed) — done.** Bit-packed, gzip+base64, a **190 KB**
  chunk imported only when an `earth` world renders.
- **Step 3 (carry into the region tier) — done, structurally.** `terrain.ts`
  makes the mask authoritative for land-vs-sea (`earthCoastLand`, called from
  `earthLandSea`) and samples it in **world-space**, not per-tier — so every
  tier, world through locale, reads the same crisp coast. The elevation grid
  still supplies the *height* of the land the mask marks. Alignment: the
  elevation grid is stored south-up, so the mask samples with
  `row = (1 + latFrac) / 2`; **97.3% agreement** with elevation-land, the 2.7%
  delta being the crisp-coastline gain.

Florida, the Keys, capes and small isles are crisp. **What actually remains:**

1. **Step 4 (re-validate) — partly done.** `smoke-terrain` asserts Earth's land
   fraction (≈29%) but has **no named-feature assertions**; the directive's
   Florida / Keys / Great Lakes / British Isles / Indonesia assertion set is
   still unwritten. This is the cheapest remaining piece and the one that would
   keep the win from regressing.
2. **The coast-distance / bathymetry field is still 720×360** (~35 mi/cell —
   `terrain.ts:388`), so shelves and small bays still step. This is the last
   *visible* coarseness on an Earth coast.
3. **The elevation grid is still 2048×1024** — a **relief-only** upgrade now, no
   longer a coastline one. Needs a GitHub-mirrored DEM (see the sourcing note
   below: `raw.githubusercontent.com` is reachable; the NOAA/GEBCO/Natural Earth
   hosts are proxy-blocked). Lowest priority of the three.

<details>
<summary>Original analysis, as written before batch 85 (kept for the record)</summary>

Where the fidelity is lost today, concretely:

- The baked elevation grid is **2048×1024** (~19 km/cell, batch 70). That fixed
  the worst erosion (Florida went from ~2 to 38 land cells in a test window),
  but **19 km is still too coarse for narrow features**: the Florida peninsula
  (~150 km wide → ~8 cells), the Keys, Cape Cod, the Chesapeake, the Baltic
  isles, the Aegean, river deltas, and thin capes all read blocky or partly
  dissolve. The land/sea mask, not the biome raster, is the limiter.
- The coast-distance / bathymetry field is coarser still (720×360), so shelves
  and small bays step.

What "ultra-high fidelity" needs (build order to scope when we pick it up):

1. **A finer source raster.** Move to a higher-resolution public-domain source.
   **Sourcing probe (2026-07-15) — the path is now known:**
   - ❌ `naturalearthdata.com`, `ncei.noaa.gov` (ETOPO), and GEBCO hosts are
     **proxy-blocked** (403 CONNECT tunnel failed) — same wall as batch 74.
   - ✅ **`raw.githubusercontent.com` is reachable** (partial-content 206). The
     **`nvkelso/natural-earth-vector`** repo mirrors the **public-domain Natural
     Earth 10 m** coastline/land/ocean/lake **vectors** — crisp, authoritative
     coastlines, the exact data every mapping tool uses for Florida/the Keys/
     islands.
   **Key insight:** "mangles Florida" is a **land/sea-mask** problem, not an
   elevation one — the current 2048 elevation renders mountains fine; it's the
   *coastline* that dissolves. So the fix is a **high-res land mask** rasterized
   from the NE 10 m land polygons (a 1-bit mask at ~10800×5400 gzips tiny since
   coastlines are sparse), used to decide land-vs-sea, with the existing
   elevation grid bilinear-sampled underneath for relief. No DEM download needed
   for the coastline win; a finer DEM (if a GitHub mirror surfaces) is a later
   relief upgrade.
2. **Keep it lazy + compressed.** A 10800×5400 int grid is ~58 M cells; store it
   gzip-tiled (the current `DecompressionStream` path scales) and load only the
   viewed region's tiles, or a coarse whole-world tier + fine tiles on zoom.
3. **Carry real coastline into the region tier.** Sample the fine mask at the
   region/locale tiers so a zoomed coast is the real coast, not procedural
   wiggle — the worker already keeps generation off the main thread.
4. **Re-validate** against the hydrology/coast checks (Florida, the Keys, the
   Great Lakes shoreline, the British Isles, Indonesia) with a land-fraction and
   named-feature assertion set, like `smoke-terrain`/`smoke-hydro` do now.

Sits ahead of F-2…F-5 (the era layer): the era re-skins hang off an accurate
coastline, so fidelity comes first.

</details>

**Consequence for sequencing:** the era layer (F-2…F-5) was gated behind "get an
accurate coastline first". That gate is now effectively open — the coastline is
accurate. The three leftovers above are polish and can run alongside the era
work rather than blocking it.

## The era layer (the flagship feature)

An **era skin** is a data pack: a historical snapshot of the world's powers.
Each entry is roughly:

```
{ era: "100 AD",
  powers: [
    { name: "Rome", fantasyName: "The Ashen Imperium",
      seat: {lat, lon},           // real capital (Rome 41.9, 12.5)
      region: <polygon or bbox>,  // the territory it held
      cities: [ {name, fantasyName, lat, lon, rank} ],
      flavor: {...} },
    ... ]}
```

Applying an era to an Earth world:

1. **Base seed (canonical Earth) — exact placement.** Each power's seat and
   cities drop at their real (lat, lon) → world hex via the coordinate contract.
   The kingdom's territory paints from its region polygon. Fantasy names and
   profiles replace the procedural settlements. This is the clean case and the
   owner's suggestion to **restrict era replacements to the base seed** keeps it
   simple and correct.
2. **Seeded (drifted) Earth — best-effort follow.** A seed warps the coastlines
   (continental drift, batch 66). To place a power "at the closest point it would
   have been," snap each real (lat, lon) to the nearest *habitable* land on the
   drifted map (nearest warmEnough land hex, preferring coast/river to match the
   original site's character), and re-flow territory from the drifted geography.
   Lower fidelity by nature — reasonable to defer or gate off, per the owner.

### Build order (proposed)

- **F-1 Real biomes** — ✅ SHIPPED (batch 72). NASA's Blue Marble (three-globe's
  `earth-day.jpg`) is classified into land-cover classes (ice/desert/grass/forest)
  and baked to `earthBiome.ts` (14 KB gzipped, lazy); `biomeAt` for `earth` reads
  the real cover and lets temperature set only the band (cold forest → taiga, hot
  forest → jungle, hot grass → savanna). The Sahara/Gobi/Australian deserts, the
  Amazon/Congo jungle, boreal taiga, temperate forests, and the ice caps now land
  exactly where Earth's do — the biggest "looks like Earth" win.
- **F-2 Region lookup** — a reverse geocode from (lat, lon) → real region name
  (continent/subcontinent at least), so the map can label real places and the
  era layer can target regions. A coarse baked region raster suffices.
- **F-3 Era schema + one era** — define the era-pack format, author one era
  (e.g. 100 AD or 1850) as SRD-safe fantasy re-skins, and an "apply era" pass
  that places powers/cities on the base-seed Earth (case 1 above).
- **F-4 Generated era profiles** — use the existing settlement/faction/NPC
  composites to flesh each power into a full kingdom profile + fantasified
  capital, seeded from its era entry.
- **F-5 (optional) Drift-follow** for seeded Earths (case 2).

### Open decisions for the owner

- **Era replacement on seeded worlds:** support the drift-follow (F-5) or
  restrict to base seed only? (Owner leaning: base seed only — simplest.)
- **How many eras, and which first?** (100 AD, 1850, others?)
- **Fantasy tone:** how far to fantasify — renamed-but-recognisable ("The Ashen
  Imperium" for Rome) vs fully invented cultures on the real map?
- **Licensing:** era data must be our own fantasy re-skins over public-domain
  geography — no copyrighted setting material.
