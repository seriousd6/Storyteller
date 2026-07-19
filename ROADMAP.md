# Roadmap â€” where the project is and what's next

*The single source of truth for status and priorities. Update it in the same
commit as the work it describes. History lives in `git log --oneline`
(batch-numbered) and the epic docs linked below; the original v1â†’v2 rebuild
plan is [OVERHAUL.md](OVERHAUL.md) (historical). Doc map:
[docs/INDEX.md](docs/INDEX.md).*

## Now

1. **Launch** â€” work [docs/LAUNCH.md](docs/LAUNCH.md) top to bottom. The
   product loop (generate â†’ combine â†’ refine â†’ print) is built and gated; the
   fastest path to the site's goals is putting it in front of real users
   before starting another epic.
2. **Owner decision queue** â€” [DECISIONS.md](DECISIONS.md); several entries
   are 15-minute unblocks.

## Next (owner curates the order)

- **Worldcraft epic** (owner, 2026-07-19): landform realism fed into
  worldgen (rift valleys, canyons, fjords, plateausâ€¦ â€” Lane L), sculpting
  tools (elevation painting; river/road add/remove/modify â€” Lane S), and
  the full art pass (cities, burrows, terrain ink â€” Lane K). Plan:
  [docs/everdeep/WORLDCRAFT.md](docs/everdeep/WORLDCRAFT.md). Note: Lane
  K-1 IS the remaining draw-only visual-audit rows (V31/V32/V34/V37) â€”
  one piece of work, two boards; close them together.
- **Layered-spaces epic** (owner, 2026-07-19): city âŠƒ district âŠƒ building
  âŠƒ floor âŠƒ room as nested-scale site stacks with a continuous zoom feel â€”
  a city represented at its true miles-across footprint. Plan:
  [docs/everdeep/LAYERED-SPACES.md](docs/everdeep/LAYERED-SPACES.md)
  (supersedes the PLAN.md Â§5 nested-spaces "next steps").
- **Visual audit round 3 fix lane** (owner, 2026-07-19): board V26â€“V37 under
  item #39 in [docs/everdeep/PLAN.md](docs/everdeep/PLAN.md);
  `docs/everdeep/scripts/audit-probe-*.mjs` are the regression test for every
  fix batch (metric v2 fixed two lying counts â€” see V28/V30 rows). Landed:
  b291 endpoint discipline (near-trunk cuts 917â†’199, dangling 1,251â†’522,
  stop-short 72â†’41), b293 river mouth clip + lasso self-close (rivers past
  the drawn coast 149â†’0 by the honest metric, 138 courses trimmed; open
  lassos â†’ 43). **Still open, each with its fix sketched in its board row**:
  V31/V32 biome-raster + river-ribbon draw quantization (draw-only, no
  rebake), V33 mid-Europe net patchiness (diagnose first), V34 borders
  strolling offshore (draw-only), V37 lake badge/trees (draw-only), V35
  estuary too-short half, V27/V28 residuals (522 dangling incl. coarse-shore
  cuts; 43 guard-refused lasso closes) â€” then re-run `visual-audit-r3.spec.ts`
  against the fixed world and re-stamp the board from the shots.
- **Campaign Codex Phase C â€” unified cross-world search**
  ([docs/CAMPAIGN-CODEX.md](docs/CAMPAIGN-CODEX.md)): the last open codex
  phase. Touches `world.astro`, a historically contended file â€” claim it for
  a session, don't share it across concurrent sessions.
- **Genre expansion** â€” horror / sci-fi / western as tag filters over the one
  dataset. The architecture shipped for this on day one (genre = tags, never
  folders); the work is content tagging/authoring, near-zero engine risk.
- **Everdeep deferred follow-ups** â€” deep-band tripwire in map-perf, and the
  mapView instrumentation hooks that unlock the deferred TEST-AUDIT
  assertions (legend label counts, re-raster counts). Chunked settle render
  shipped as B277.
- **Â§4 route retirement** â€” blocked on [DECISIONS.md](DECISIONS.md) #5.

## Later / idea shelf

- Community table submission ("paste a d100 list, get a generator")
- AI-assisted expansion of rolled skeletons into prose
- PDF export beyond print-to-PDF
- Colostle companion (parked 2026-07-11; concept-mined into the solo oracles)

## Recently closed (details in each doc + git log)

- **Test-suite audit** â€” closed B274; the still-live deferred list is at the
  end of [docs/TEST-AUDIT.md](docs/TEST-AUDIT.md)
- **Rollers as designed one-pagers** â€” B260â€“B267
  ([docs/sheets/GENERATORS-AS-ONEPAGERS.md](docs/sheets/GENERATORS-AS-ONEPAGERS.md))
- **Sheet Builder 2.0, phases 0â€“5** â€” B185â€“B257
  ([docs/sheets/PLAN.md](docs/sheets/PLAN.md))
- **Campaign Codex phases A/B/D + 5e builder** â€” B229â€“B258
  ([docs/CAMPAIGN-CODEX.md](docs/CAMPAIGN-CODEX.md))
- **World perf audit** â€” B266 (political buffer), B271 (deep-zoom freeze),
  B277 (chunked settle)
- **GM/Solo audit lane Aâ€“F** â€” B242â€“B262
- **Spaces epic** â€” B183â€“B209 (+ audit round B221â€“B226)
