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

## The example fixture

The shipped "Load example" world is **Earth — 2026** (`examples/world.example.json`).
Rebuild it with `node docs/everdeep/scripts/bake-earth-2026.mjs` — the bake now
auto-runs `build-labs.mjs`, which publishes `v2/public/labs/earth.example.json`
(what the app fetches) and the embedded `world-viewer.html`. Loading the example
saves it into the browser's IndexedDB; a page refresh re-opens that saved copy
and never re-downloads, so testing a rebaked fixture means clicking **Load
example** again (it overwrites), not just refreshing.
