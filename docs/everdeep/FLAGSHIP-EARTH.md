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

- **Real geography** at 2048×1024 (~19 km/cell): actual continents, coastlines,
  mountains, small islands (batch 70).
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

- **F-1 Real biomes** — bake a land-cover raster; `earth` reads real biomes.
  Biggest "looks like Earth" win, independent of the era layer.
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
