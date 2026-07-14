# Performance review #1 (2026-07-14)

> Owner: "I think it is time for our first performance review."

Measured on the built app (`npm run build` → `astro preview`) with the Vessia
example (471 entities, 4.9 MB world file) and freshly-generated worlds. Numbers
are from Chromium via Playwright + Node micro-benchmarks. **Headline: the app is
in good shape.** The costs that exist are one-time (load, first map open, world
generation), not steady-state, and the interactive map holds 60 fps.

## 1. What's measured — the numbers

| Metric | Value | Verdict |
|---|---|---|
| `/world/` initial load (JS, gzip) | **70 KB** / 7 files, 191 KB decoded | ✅ lean |
| `/world/` DOMContentLoaded | **~500 ms** | ✅ |
| JS after loading example + opening map | **still 70 KB** | ✅ generators stay unloaded |
| Load example (parse 4.9 MB + IndexedDB + tree) | **~1.1 s** | ⚠️ one-time |
| Map first open + first paint | **~1.0 s** | ⚠️ one-time |
| **Map pan frame time** | **median 16.6 ms, p99 17.2 ms** (60 fps, vsync-capped) | ✅ smooth, no jank |
| Forced full repaint | **≤ 16.7 ms** (fits one frame) | ✅ |
| JS heap (example loaded, map open) | **22 MB used / 54 MB total** | ✅ modest |
| New-world hydrology trace — quarter / half / earth | **170 ms / 550 ms / 2.5 s** | ⚠️ earth one-time |
| `elevationAt` | ~4.1 µs/call | — |
| `biomeAt` (noise) | ~4.5 µs/call | — |
| **`biomeAt` (earthlike)** | **~12.3 µs/call (2.7×)** | ⚠️ hotspot |
| Total built JS on disk | 11 MB / 56 files | ✅ but **code-split & lazy** |

## 2. The big surprise: 11 MB of JS, ~0 in the critical path

The build ships 11 MB of JavaScript, but the **generator registries dominate it**
and are **code-split into on-demand chunks** — magic 1.8 MB, npc 1.5 MB,
npc-block 1.3 MB, hooks 0.66 MB, government 0.65 MB, and so on. The initial
`/world/` page pulls only **70 KB gzipped**, and loading the example + opening
the map pulls **nothing more** — the baked entities carry their own statblocks,
so no registry is needed to *view* a world.

A registry loads only the **first time you GENERATE that content type** in-app
(materialise a ghost, add a settlement, roll an NPC). That first roll pays a
one-time fetch+parse of just that type's chunk. This is the right shape; the
only refinement worth considering is **prefetching the common ones** (settlement,
npc) on idle so the first in-app generation feels instant.

## 3. Where the time actually goes (one-time costs)

None of these are steady-state — they happen once per session or per action —
but they're the slowest moments:

1. **New-world hydrology trace — 2.5 s on an Earth-size map** (batch 61). The
   priority-flood + accumulation + meander runs ~100 k `elevationAt` calls. It's
   guarded by a "Tracing rivers…" label that paints first, so the thread-block
   is visible, not a mystery hang. Quarter/half maps are 170/550 ms.
2. **Map first open — ~1 s.** On first paint the map builds several layers
   eagerly: travel roads/rivers/flow, art marks (farmland/city/ruin), the
   great-river spatial grid, and footprints. Each is cached after, so subsequent
   repaints are free (hence the 60 fps pan).
3. **Load example — ~1.1 s.** Parsing the 4.9 MB `world.example.json` and writing
   it to IndexedDB. Only the demo pays this; a user's own world starts small.
4. **`biomeAt` earthlike is 2.7× the noise cost** — the rain-shadow samples
   elevation 3–4 extra times and `interiorness`/`temperature` call `landMask`.
   It doesn't touch the steady-state map (that reads the `hexInfoAt` cache), but
   it inflates #1 (hydrology) and the new-world sketch preview.
5. **Distance-to-coast field build — ~230 ms, once per earthlike world** (batch
   65). The first `elevationAt`/`biomeAt` on an earthlike world floods a
   360×180 coast grid (BFS from the shoreline) and caches it; every later call
   is a 0.57 µs lookup. It's a one-time cost folded into the same
   "Tracing rivers…" window as the hydrology trace, and never runs for noise
   worlds. Same worker note as #1 would move it off the main thread.

## 4. Recommendations, prioritised

**P1 — worth doing, clear payoff, low risk**

- **Trim `biomeAt` earthlike** — ✅ APPLIED (this review). `biomeAt` now computes
  elevation and `landMask` ONCE and threads them into `moistureAt`/`temperatureAt`
  (which each used to recompute them), so the earthlike biome cost fell
  **12.3 µs → 9.9 µs (~19%)** and Earth-size hydrology 2.20 s → 2.06 s — with the
  terrain smoke still green (values unchanged; the noise path is untouched). The
  bigger hydrology cost is the priority-flood's `elevationAt` calls, addressed by
  the worker note in P2. (A further ~1.2× is available by dropping the rain-shadow
  barrier scan 3→2, but that changes earthlike output, so it's left for a
  deliberate genVersion bump.)
- **Prefetch the common generators on idle** — ✅ APPLIED (this review).
  `openWorld` now warms the settlement, landmark, and npc-block composite modules
  + registry chunks via `requestIdleCallback` once a world is open (verified: the
  chunks load with no generation triggered), so materialising a map ghost or
  adding a place no longer stalls on a 0.5–1.3 MB fetch.

**P2 — one-time-cost polish**

- **Defer non-critical map layers off the first-paint path.** Build travel
  layers and the river grid lazily on first travel/hover instead of at mount;
  art marks and footprints are needed for the first paint, the others aren't.
  Target: map open well under 500 ms.
- **Hydrology in a Web Worker** for zero main-thread freeze on huge worlds.
  Bigger lift (bundle a worker, post cfg, get routes back); the "Tracing rivers…"
  label makes it optional for now.

**P3 — nice to have**

- **Shrink the example fixture** (4.9 MB). It stores full generated statblocks
  for 471 entities; a leaner demo (or storing gen-seeds + rehydrating) would cut
  load-example time. Low urgency — it's an opt-in demo.
- **A perf budget in CI**: assert initial `/world/` JS stays < ~120 KB gzip and
  map pan stays 60 fps, so a future eager import doesn't regress the lean load.

## 5. Bottom line

Nothing here is on fire. Interaction (the thing users feel most) is a smooth
60 fps, the initial load is lean, memory is modest, and the heavy content is
correctly lazy. The actionable win is the **earthlike `biomeAt` trim** (helps
world generation, which the owner is actively expanding), followed by **shaving
the ~1 s map-open** by deferring layers. Everything else is one-time and already
either fast enough or covered by user-visible feedback.
