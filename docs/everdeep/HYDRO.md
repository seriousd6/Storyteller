# Hydrology reality-check — validating rivers & lakes against real Earth (batch 67)

> Owner: "a real check of our hydrology rules will be to determine if our river
> generation overlaps realistically with Earth's real rivers and lakes, and if
> not how can we make the rules more realistic?"

The batch-66 "Real Earth" landform makes this measurable: run `generateHydrology`
on canonical Earth, project every generated river mouth and lake to lat/lon, and
score them against Earth's actual major rivers and lakes.

## 1. Method

`scripts/smoke-hydro.mjs` (and the throwaway probes behind this write-up) generate
hydrology on the real-Earth `cfg`, then map world (x, y) → (lat, lon) via the
same equirectangular convention the terrain uses (x = longitude from the
mid-Pacific antimeridian, y = latitude, +y north). Rivers are compared to a
reference list of ~20 of Earth's largest rivers (by mouth position) and lakes to
~10 of the largest lakes. Because a world hex is 60 mi and the baked elevation
grid is ~0.7°, a positional tolerance of ~900 km is used for rivers (a few hexes)
— we're testing *drainage structure*, not surveyed coordinates.

## 2. What the first run exposed

Routing was already excellent, but grading and weighting were wrong:

- **Routing: 19–20 / 20.** Almost every real river had a generated river within a
  few hundred km — the priority-flood drainage over real elevation finds the real
  basins. This part was already right.
- **Grading: broken.** The Amazon came out as a mid-size (band-2) river and
  **nothing on Earth reached "grand."** The width tiers were fixed absolute
  accumulation cutoffs (`GRAND_ACC = 2500`, …) tuned on Vessia's small procedural
  continent; on the Earth-size grid the accumulation never reached them.
- **The "grand" rivers were in Antarctica.** With near-flat runoff weights, the
  huge *cold* continents (Antarctica, Siberia) out-accumulated the tropics purely
  on area — so the biggest "rivers" ran across the ice, while the Amazon/Congo/
  Mississippi were graded minor. Ice caps hold glaciers, not rivers.
- **Equirectangular area bias.** The world grid is equirectangular, so a hex near
  the poles covers far less real ground than one at the equator yet counts the
  same — inflating high-latitude basins on top of everything else.

## 3. The rule changes

Four changes, all in `hydrology.ts`, each addressing one of the above:

1. **Percentile width tiers.** Instead of fixed accumulation cutoffs, rank the
   river hexes by accumulation and cut by percentile (with small absolute floors),
   so the largest drainage on *any* world — Earth or a quarter-size sketch — is
   always "grand." Fixes "no grand rivers" and is resolution-independent.
2. **Area-weighted runoff.** Each hex's rain is multiplied by `cos(latitude)`, its
   real area on the equirectangular grid, so a polar hex no longer counts as much
   ground as an equatorial one. This lets the tropics compete fairly.
3. **Steep, latitude-realistic rain with frozen ≈ 0.** The per-biome runoff table
   was flattened-out; now the wet tropics dominate (jungle 3.0, swamp 2.4) and
   **frozen ground and deserts contribute almost nothing** (snow 0.02, tundra
   0.08, desert 0.04). Polar caps stop generating rivers; the Amazon/Congo rise to
   the top.
4. **Lower stream threshold** to keep river density healthy now that runoff is
   area-weighted (fewer raw units per hex).

## 4. After: the numbers

On canonical Earth (`npm run smoke` asserts these):

- **River routing: 20 / 20** real rivers have a generated river within 900 km.
- **Top-3 drainages are the Amazon, the Ob, and the Congo** — the actual discharge
  kings — and **3 grand rivers** exist (was 0).
- **Zero rivers on the Antarctic ice cap** (was: the grandest rivers were there).
- **Lakes: 7 / 10** of the great lakes have a generated lake nearby (Caspian, Great
  Lakes, Baikal, Great Slave/Bear, Aral, Chad, + one more), from pure
  depression-filling — no lake data is baked.
- ~410 rivers on an Earth-size world; procedural worlds still generate sanely.

## 5. Second pass — moisture runoff + endorheic sinks (batch 68)

Two of the limitations below were then closed:

- **Precipitation-driven runoff.** Runoff is no longer a per-biome bucket for
  earthlike/real-Earth worlds — it reads the **actual moisture field** (Hadley
  bands, rain shadows, coast asymmetry) via `runoffAt`, with frozen ground zeroed.
  River discharge now tracks where rain really falls, which pushed the **Congo and
  the Amazon up to grand rivers** alongside the Ob (before, only the Ob qualified).
  Noise worlds keep the biome table. Major-river hit rate rose from ~5 to **11/20**
  graded band ≥ 3 within coarse-grid tolerance.
- **Endorheic sink pass.** Arid closed basins no longer overflow to the sea. A
  filled depression whose surroundings are dry is marked **endorheic**: inflow
  accumulates but does not spill onward, so rivers **end at the lake** (the Volga
  dies in the Caspian) instead of cutting an impossible channel across the desert
  to the ocean. Wet basins still overflow normally (the Great Lakes → the St
  Lawrence). Verified: terminal lakes pond in the Caspian / Aral / Chad / Balkhash
  interiors (smoke asserts it).

## 6. Remaining limitations & future work

The *rules* are now physically sound; what remains is mostly **grid resolution**:

- **Exact discharge ranking is coarse.** At 60-mi hexes over a ~0.7° elevation
  grid, some real major rivers (Yangtze, Mekong, Murray) still come out as band-2
  rivers rather than "great," because their basins are under-resolved and their
  mouths land a few hundred km off. Routing is right; the importance grade is
  approximate. A finer elevation grid would sharpen this.
- **Rift/tectonic lakes are under-captured** (Victoria, Tanganyika, Titicaca) —
  they need either a finer grid or explicit rift modelling; depression-filling on
  the coarse grid misses the narrow deep ones.
- **Endorheic detection is aridity-only.** It marks dry closed basins terminal,
  which catches the big salt seas; a fully physical version would balance basin
  inflow against an evaporation budget per latitude.

Net: our hydrology overlaps Earth's real rivers and lakes well at the structural
level — right basins, right biggest rivers (Amazon/Congo/Ob), rivers only where
water actually flows, arid interiors ponding into terminal salt seas — with the
remaining gaps being grid resolution and narrow rift lakes.
