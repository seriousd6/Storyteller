# Making the world feel like Earth — the worldgen investigation (batch 53)

> Owner directive: "I would like a pass to make sure our biome and geography
> building is representative of earth. I want the world to feel natural. If you
> can ensure that making an earth-style (specifically landmass design and
> spread) worldgen is in the plan, that would be great."

This is the investigation and the roadmap. The terrain field is FROZEN for
existing worlds (`genVersion` 1 — every baked Vessia entity is anchored to it),
so an Earth-style pass ships as a NEW `genVersion` behind a creation-time
choice; old worlds keep their coordinates, new worlds can opt into "Earthlike".

## 1. What the generator does today (`terrain.ts`, genVersion 1)

Already better than plain noise:

- **Landmasses** — a handful of blobs (stretched, rotated ellipses), the whole
  mask field domain-warped at continental scale, so coastlines meander and
  nothing reads as a circle. `continents` picks 2–5; `pangea`/`archipelago`/
  `isles` are the other landforms.
- **Mountains** — an INDEPENDENT orogeny term: ridged noise (sharp crest lines)
  gated by a low-frequency belt field, so ranges are discrete chains, not
  "interiors are always high."
- **Climate** — temperature falls with latitude (`1 − lat·0.85`) and altitude;
  a hot/cold dial shifts the whole band.
- **Biomes** — a Whittaker-style pick from temperature × moisture (snow/tundra/
  taiga/desert/savanna/grass/forest/jungle), plus elevation bands for beach/
  hills/mountain.

## 2. Where it departs from Earth (the gaps to close)

The single biggest one: **moisture is pure noise.** On Earth, where the rain
falls is almost entirely deterministic geography, and fixing it fixes most of
the "unnatural" feel:

1. **No Hadley cells.** Earth's great deserts sit in two bands near ±30°
   latitude (descending dry air) — Sahara, Arabian, Kalahari, Australian,
   Atacama, Sonoran. The wet belts are the equator (~0°) and the temperate
   ~50–60°. Today a desert can appear at any latitude. **Fix:** make base
   moisture a function of latitude (wet at 0°, dry at ±30°, wet at ±55°, dry at
   the poles) before adding noise.
2. **No rain shadows.** A mountain range wrings the rain out of the wind, so
   the windward slope is wet and the LEE side is desert (the Atacama behind the
   Andes, the Great Basin behind the Sierra). Today mountains don't affect
   nearby moisture at all. **Fix:** subtract moisture downwind of high ground
   (sample elevation upwind along the prevailing wind, dry the lee).
3. **No continentality.** Ocean moderates: coasts are mild and moist, deep
   interiors are dry and temperature-extreme (Siberia, the Gobi, the American
   high plains). **Fix:** add a "distance from ocean" term that dries and
   widens the temperature swing inland.
4. **Prevailing winds / coast asymmetry.** Because winds are mostly westerly at
   temperate latitudes and easterly in the tropics, WEST coasts and EAST coasts
   get different weather at the same latitude (wet western Europe vs dry
   Patagonia). A cheap version of #2/#3 with a fixed wind direction per band
   gets most of this.
5. **Landmass spread.** Earth's continents are not evenly spaced — they cluster
   (a land hemisphere and a water hemisphere), taper toward the poles, and
   carry continental shelves (shallow seas ringing the land, not an abrupt
   drop). Today blobs space evenly around the cylinder with a shrink toward the
   poles only via `yFrac`. **Fix:** bias blob placement toward one hemisphere,
   let a couple cluster (collision → a big interior range), and add a shelf
   band (a shallow-water ring) at the land edge.
6. **Mountains at plate edges.** Real ranges run along continental margins
   (subduction: the Andes, the Cascades) or where two masses collide (the
   Himalaya, the Alps). **Fix:** bias the orogeny belt toward blob EDGES and
   toward the seams between two nearby blobs, instead of a free-floating belt.
7. **Rivers already obey elevation** (batch 46) and drain to the sea (batch 22)
   — that part is Earthlike and stays.

## 3. The Whittaker target (what biome goes where)

Keep the temperature × moisture matrix, but drive both axes from the geography
above rather than noise. The intended reading, hot→cold down, wet→dry across:

| | wet | moist | dry |
|---|---|---|---|
| **hot** (equator) | jungle | savanna/grass | desert |
| **warm** (±30°) | forest | grass | **desert** (Hadley) |
| **temperate** (±50°) | forest | grass | steppe/savanna |
| **cold** (subpolar) | taiga | taiga | tundra |
| **polar** | snow | snow | snow/ice |

With Hadley moisture + rain shadow + continentality feeding the axes, deserts
land at ±30° and in rain shadows and interiors; rainforest bands the equator
and the wet west coasts; steppe fills the dry hearts of continents — the
map reads like Earth without anyone painting it.

## 4. Delivery plan (staged, behind a new genVersion)

An opt-in **"Earthlike" world type** (creation dial), genVersion 2:

- **G-1 Climate rewrite** — ✅ SHIPPED (batch 54). Moisture for an `earthlike`
  world is now `latitudeMoisture(y) − rainShadow(x,y) − continentality(x,y) +
  a little noise`, temperature drops a touch faster with latitude and cools in
  continental interiors, and the biome matrix is unchanged. Verified by a
  latitude sweep: rainforest bands the equator (jungle 64% at 0°), the great
  desert belt lands at 20–30° (78–81% desert — Earth's Sahara/Arabia/outback
  latitude), temperate grass+forest at 40–50°, boreal taiga at 60–70°, tundra/
  snow at the caps — versus scattered noise deserts before. Opt-in at world
  creation ("🌍 Earth-like climate", default on for new worlds); the frozen
  genVersion-1 field is byte-identical, so Vessia and every existing world stay
  exactly as baked. STILL AHEAD: G-2 landmass spread, G-3 plate-edge orogeny,
  G-4 coast asymmetry.
- **G-2 Landmass spread** — ✅ SHIPPED (batch 60). For an `earthlike` world the
  continents now CLUSTER into a ~55% longitude band — a land hemisphere with a
  great open ocean opposite (a Pacific) — and taper toward the poles into the
  mid-latitudes instead of spacing evenly around the cylinder. Coasts gained a
  **continental shelf**: the sea floor near land reads as shallow shelf water
  before the deep-ocean drop (a lighter ring around every continent). Gated on
  `climateModel === 'earthlike'`, so the frozen noise field is untouched (smoke
  green). Verified in the new-world sketch: clustered land, an ocean hemisphere,
  shelf-ringed coasts, climate bands intact.
- **G-3 Plate-edge orogeny** — ✅ SHIPPED (batch 65). Mountain ranges now lean
  toward continental MARGINS (subduction cordilleras — the Andes, the Cascades)
  instead of a free-floating belt. The blocker was the missing primitive: a
  batch-60 mask-value proxy for "distance to coast" was too coarse and either
  did nothing or over-mountained the interior. Batch 65 builds the REAL field —
  `coastDistAt`, a cached multi-source BFS flood from the shoreline over a coarse
  (360×180, ~69mi cells) world grid, giving any point its signed distance to the
  sea in O(1) after a ~230ms one-time build. The coastline is taken from the
  LANDMASS elevation WITHOUT the orogeny term, which breaks the circularity
  (orogeny is the field's consumer; a range rising at a margin doesn't move the
  coast). Earthlike orogeny then TILTS the belt threshold: lift it in the coastal
  band (a belt that was almost-a-range becomes one near the sea) and gently relax
  it deep inland (collision ranges — Himalaya, Rockies — still belong there). It
  only nudges the existing belt across its threshold, so coasts where the belt is
  low stay flat: active margins, not a mountain ring. Verified across seeds — the
  100–300mi coastal band (the cordillera zone, just behind the shore) rises from
  ~0% to 2–4% mountains while overall cover holds; the frozen genVersion-1 field
  never reads the tilt (smoke green, latitude bands and coast asymmetry intact).
  The distance-to-coast field is reusable: it also unblocks the queued
  "near-water town gets a dirt road to the waterline" placement work.
- **G-4 Coast asymmetry** — ✅ SHIPPED (batch 64). An ONSHORE prevailing wind
  carries marine moisture inland, so a windward coast is wet and the leeward
  coast dry: the westerly temperate belts soak their WEST coasts (the Pacific
  NW, western Europe), the trade-wind tropics their EAST coasts. Implemented by
  reusing the rain-shadow's first upwind sample — if the ground one step upwind
  is open sea, the coast gets a marine-moisture bonus. Verified: in the
  temperate belt the windward (west) coast is 96% wet forest vs 15% on the
  leeward (east) coast, with the latitude bands otherwise intact. Gated on
  earthlike; smoke green.
- Each stage is a pure change to `terrain.ts` guarded by `genVersion`, verified
  against a climate smoke check (tropics have no ice; ±30° trends dry; interiors
  drier than coasts; poles cold) before the next stage.

Existing worlds never move; a new world ticks "Earthlike" and gets all four.
As of batch 65 the whole staged plan — G-1 climate, G-2 landmass spread, G-3
plate-edge orogeny, G-4 coast asymmetry — is SHIPPED. An earthlike world reads
like Earth: a land hemisphere with a great ocean, continental shelves, Hadley
rain bands, rain shadows, dry interiors, wet windward coasts, and mountain
ranges that run along active margins.

## 5. The "Real Earth" world type (batch 66)

The G-1…G-4 work makes a *procedural* world feel Earth-like. Batch 66 adds the
literal thing: a **"Real Earth" landform** that IS Earth — recognizable
continents, the real Andes/Himalaya/Rockies, the actual coastlines.

- **Data.** A ~512×256 equirectangular elevation grid (ocean = 0, land ramps by
  real height) is baked into `earthData.ts` as base64, sourced from
  three-globe's public-domain NASA/NOAA topography. It's **lazy** — only an
  `earth` world pulls the ~170 KB chunk (`ensureEarthGrid()`), so nothing else
  pays for it. `terrain.ts` samples it (bilinear, longitude-periodic) in
  `elevationAt`/`landMask` when `landform === 'earth'`, bypassing the blob field.
- **Real climate for free.** `earth` implies the earthlike climate model, so the
  real elevations drive real rain shadows (the Atacama behind the real Andes),
  real dry interiors (the Gobi, the Sahara's heart via the real distance-to-coast
  field), and real latitude bands. Polar ice caps (Antarctica, Greenland) read as
  snow rather than as a mountain range. Continental shelves come from the batch-65
  coast field.
- **"Stays Earth unless a seed is provided."** A blank seed is canonical Earth,
  untouched. Any seed applies *slight* shifts — the owner's "shift Earth by slight
  margins":
  - **Continental drift** — a low-frequency domain warp (1–4 % of span) of where
    the grid is read, so coastlines bend and continents shuffle a touch while
    staying recognizably Earth.
  - **Sea level** — the water slider becomes a sea-level dial (50 = today). Raise
    it and the coasts flood into archipelagos; drop it and the continental shelf
    surfaces as new land — the ice-age look, land bridges and all. A seed adds a
    small sea-level jitter on top.
- Verified: canonical land fraction 30 % (Earth ≈ 29 %); sea dial 75→14 % land,
  30→43 %; a seed flips ~11 % of sampled coastal hexes; renders correctly in-app
  as the hex map with rivers traced along the real coastline. Smoke covers all
  three behaviours; the frozen genVersion-1 field is untouched (earth is its own
  landform branch).
