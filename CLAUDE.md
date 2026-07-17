# Working notes for Claude

## Concurrent sessions: do your work in your OWN worktree

Owner rule (2026-07-17): more than one agent works this repo at once — if you
see staged or modified files you didn't touch, that is another session
mid-batch. Working directly in the shared checkout risks committing their
half-done work, gating against their broken intermediate state, or having
your base yanked out from under you (all three happened on 2026-07-17:
Batch 182 shipped importing files that weren't committed until 183, and two
sessions collided on the number 183).

- **Feature work happens in a private worktree**:
  `git worktree add <scratchpad>/<name> origin/main`. Junction the shared
  `v2/node_modules` in (`cmd /c mklink /J <wt>/v2/node_modules <repo>/v2/node_modules`)
  instead of npm-installing.
- **Before pushing**: `git fetch`; rebuild/rebase onto the CURRENT
  `origin/main`; take the next free batch number; re-run the full gate on
  that combined tree. Push `HEAD:main` straight from the worktree.
- **Never touch another session's uncommitted files** in the shared
  checkout — not to fix them, not to stash them, not "temporarily". If their
  in-flight state breaks your gate, gate in your worktree instead (that is
  half the point of it).
- In the shared checkout, only commit with explicit pathspecs
  (`git commit -- <your files>`), never a bare `git commit`/`git add -A` —
  the index may hold someone else's staged batch.
- When removing a worktree, `cmd /c rmdir` the node_modules junction FIRST,
  then `git worktree remove` — a recursive delete through the junction
  nukes the real node_modules.

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
- **The fixture rebuilds byte-identically**, and `smoke-reproducible.mjs`
  enforces it (~45s, in `npm run smoke`). So it fails if generation stops being
  deterministic, AND if you change a generation pass without rebaking — the
  committed Earth and the code that claims to produce it cannot silently
  disagree. **If a change was meant to move the world, re-run the bake and
  commit the fixture WITH the change**, so the diff shows what moved. Entity ids
  come from the seed path (CONTRACTS §1/§3) and stamps from `opts.stamp`; never
  reintroduce `rid()`/`Date.now()` into a generation path.
