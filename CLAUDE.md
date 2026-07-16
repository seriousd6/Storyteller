# Working notes for Claude

## Git: commit to `main`

Owner preference (2026-07-15): **always commit and push to `main`.** `main` is
the deployed branch — storytellertoolbox.com builds from it — so work only shows
up on the live site once it lands on `main`. Do not park work on a long-lived
feature branch waiting for a merge; land it on `main`.

- Branch first only if a change is genuinely risky and wants isolation, then
  fast-forward it back into `main` the same session.
- Still: run `npm run check`, `npm run validate`, and `npm run smoke` (in `v2/`)
  before pushing, and keep `main` green.
- More than one session may be working this repo at once. `git fetch` before
  pushing; if a batch number collides, renumber yours and re-run the gate on
  the *combined* tree before pushing.

## Testing: `npm run e2e` drives the real app

`check`/`validate`/`smoke` only see data and pure modules — they never load the
app. Anything that only exists once the island hydrates (the world tree, the map
canvas, IndexedDB) needs **`npm run e2e`** (Playwright + Chromium, added
2026-07-15 at the owner's request; specs in `v2/tests/`).

It builds and previews the real static output, so a failure means the *shipped*
site is broken, not a dev-only quirk. Run it for any change to `world.astro` or
`mapView.ts`. First run on a fresh clone needs `npx playwright install chromium`.

It earns its keep: writing the first spec immediately surfaced a real bug
(clicking a search hit re-rendered the flat hit list instead of revealing the
page in the tree, because `searchQuery` was never cleared on navigate).

## Earth — 2026 is built in the BROWSER, not by the bake

Owner (2026-07-16): *"why are we still using bake"* / *"everything should be in
browser so the end user experience is what we build on"* / *"point it at the
workers, no more drift"*.

**`v2/src/everdeep/earth2026.ts` builds Earth.** The worker calls it (`op:
'earth2026'`) when a user picks 🌎 Real Earth with a blank seed, so they get the
flagship world — real cities on real coordinates, fantasy names, great rivers on
real courses. ~45s, in a worker, with a progress line.

`bake-earth-2026.mjs` is now a **cache-filler**: it calls the same module and
writes `examples/world.example.json` so "Load example" is instant instead of
45s. It is *not* a second implementation and must never become one. The only
thing it owns is Node's half of `EarthIO` (~15 lines: `readFileSync` +
`import()`); the browser's half lives in `worldgen.worker.ts` (`fetch` +
`import.meta.glob`). **Neither half decides anything about the world.**

Why this matters, from three days of evidence: the orchestration was duplicated
and drifted three ways, all silent, all shipped — China/India/USA had no roads
for months (the bake skipped countries over 40 settlements as "too slow"), the
browser read 1,500 cities as 3 towns, and the bake's road pass couldn't see the
2,012 villages the bake itself created. Nothing ever failed, because a wrong
world is still a valid world.

- **The Earth data lives in `v2/public/data/`** — one home, the same bytes the
  browser fetches and the bake reads. 66 KB gzipped, vs 1.0 MB for the fixture.
  Do not copy it under `docs/`.
- The bake still auto-runs `build-labs.mjs`, which publishes
  `v2/public/labs/earth.example.json` (what "Load example" fetches) and the
  embedded `world-viewer.html`.
- Loading the example saves it into IndexedDB; a refresh re-opens that saved
  copy and never re-downloads, so testing a rebaked fixture means clicking
  **Load example** again (it overwrites), not just refreshing.
- ⚠️ **The fixture is not reproducible.** `newEntity` mints ids with
  `crypto.getRandomValues`, so every bake rewrites all 4,151 ids and the 5 MB
  file churns wholesale. Two bakes cannot be diffed. To check a change didn't
  move the world, compare *structure* — see the batch 121 notes in PLAN.md.
