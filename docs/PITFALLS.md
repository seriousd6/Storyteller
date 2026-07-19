# Pitfalls — recurring bug classes and hard-won rules

Each entry earned its place by burning a real session at least once. Check
this before debugging anything weird, and add a new class here the *second*
time it bites (one-time bugs stay in commit messages; this file is for
classes).

## Process / multi-session

- **Foreign spec failures under load: suspect the machine first.** When
  another session is gating concurrently, e2e specs you never touched can
  fail from load alone. Stash-bisect (stash your change, re-run the failing
  spec on pristine base) BEFORE debugging "your" regression. Established
  2026-07-18; map-perf precedent.
- **Zombie preview server + Playwright's `reuseExistingServer` = stale-build
  failures.** Playwright reuses whatever server holds the port, so a leftover
  preview from an earlier run silently serves the OLD build — the failure
  reads as "my new button doesn't exist". Use a unique `STB_E2E_PORT` per
  session; if a spec can't see code you just wrote, hunt for a zombie server
  on the port before anything else. Third port-class incident 2026-07-18.
- **Astro preview hops busy ports silently.** It binds :4322 when :4321 is
  taken and keeps serving — verify the *bound* port before trusting
  screenshots or curl checks against "your" build.
- **Worktree junction removal order.** `cmd /c rmdir <wt>/v2/node_modules`
  FIRST, `Test-Path` that it's gone, THEN `git worktree remove`. A recursive
  delete (including `worktree remove --force`) walks THROUGH a live junction
  and deletes the real `node_modules`. `scripts/agent-worktree.ps1 -Remove`
  does it in the safe order.
- **Backticks in commit messages expand under double quotes/heredocs.** Use a
  single-quoted here-string (PowerShell `@'…'@`) or `git commit -F <file>`.
- **`.ps1` files must be pure ASCII (or UTF-8 *with* BOM).** Windows
  PowerShell 5.1 reads BOM-less UTF-8 scripts as ANSI: an em-dash becomes
  `â€”` inside a string and the whole file fails to parse, with errors
  pointing at unrelated braces. Caught live writing
  `scripts/agent-worktree.ps1` (B278).
- **Never rewrite a UTF-8 doc through PowerShell 5.1 string ops.**
  `(Get-Content -Raw) -replace ... | Set-Content` (or WriteAllText) decodes
  BOM-less UTF-8 as ANSI and re-saves it double-encoded — every em-dash in
  the file becomes `â€”`, silently, and the damage COMMITS. A B293 renumber
  one-liner mangled ROADMAP.md and all 1,500 lines of PLAN.md on main
  (repaired in the V31 batch by reversing the CP1252 round-trip). Use the
  Edit tool or a node script for file rewrites; if PowerShell is unavoidable,
  `-Encoding utf8` on BOTH the read and the write.

## Web / CSS

- **`[hidden]` loses to any authored `display:`.** A rule that sets
  `display: flex` (or grid, block…) on the element overrides the `hidden`
  attribute and it stays visible. Four separate incidents. Toggle a class
  that owns `display`, or put `[hidden] { display: none !important }` next to
  the display rule.
- **Hover-revealed controls must fade with `opacity` ONLY.**
  `pointer-events: none` (or `visibility`/`display`) on the resting state
  breaks Playwright's pre-hover actionability probe — specs fail "element not
  clickable" even though a human can click it (B260).
- **`lead` (big serif) is only for a short NAME.** The serif display style
  fits <60 characters — MEASURE the string. Prose-rolling slots open with an
  untitled lede section instead; a serif wall is the tell (B264).

## Engine / world

- **Determinism is load-bearing: never `rid()`, `Date.now()`, or
  `Math.random()` in a generation path.** Entity ids come from the seed path
  (docs/everdeep/CONTRACTS.md §1/§3), stamps from `opts.stamp`.
  `smoke-reproducible` fails the batch otherwise.
- **Changed how the world generates? Rebake the fixture in the same commit.**
  `smoke-reproducible` fails if the committed Earth and the code that claims
  to produce it disagree — by design. See CLAUDE.md's Earth section.
- **A wrong world is still a valid world.** Generation bugs don't throw —
  they ship silently (China had no roads for months). When touching
  orchestration, assert *counts and coverage* (cities per country, roads per
  region), not just "it ran".
- **Verify a metric on ONE concrete case before filing or fixing it.** Two of
  the six audit-round-3 probe metrics were artifacts: "the Congo runs 44 mi
  into the ocean" summed a whole 44-mi authored segment from one wet mouth
  vertex (sampled, 95% of it is jungle), and the self-loop count re-flagged
  every properly CLOSED ring forever. A day of fixing chased numbers the map
  never drew. Pick the worst-ranked case, walk the actual data by hand, then
  trust the count (B293).
- **A domain warp cannot bend an edge finer than its own feature size.** Its
  excursion must stay under its wavelength or classes scatter, so a
  cell-sized warp shifts a straight raster edge WHOLE and it stays straight
  (the V31 checkerboard survived two warp passes). To dissolve raster-grain
  boundaries, jitter the *decision* instead — the cell-index pick (land
  cover) or the bilinear threshold (coast mask) — with fine coherent noise;
  the class never leaves its own cell, so V10-style displacement bias can't
  return (audit-r3 fix lane, 2026-07-19).

## e2e

- **Pay per round-trip, not per element.** Spec cost scales with world
  content: a loop of N Playwright clicks is N round-trips (realms.spec went
  78s → timeout as crowns grew 182 → 491). One real UI interaction proves the
  wiring; bulk-drive the rest inside a single `page.evaluate` (B262).
- **Presence is not behavior.** The 2026-07-18 audit's recurring weakness:
  asserting an element exists instead of what it does, and tautology guards
  that re-derive the expected value from the source under test. Assert
  against an independent source of truth (docs/TEST-AUDIT.md).
