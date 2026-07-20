# Roadmap — where the project is and what's next

*The single source of truth for status and priorities. Update it in the same
commit as the work it describes. History lives in `git log --oneline`
(batch-numbered) and the epic docs linked below; the original v1→v2 rebuild
plan is [OVERHAUL.md](OVERHAUL.md) (historical). Doc map:
[docs/INDEX.md](docs/INDEX.md).*

## Now

1. **Launch** — work [docs/LAUNCH.md](docs/LAUNCH.md) top to bottom. The
   product loop (generate → combine → refine → print) is built and gated; the
   fastest path to the site's goals is putting it in front of real users
   before starting another epic.
2. **Owner decision queue** — [DECISIONS.md](DECISIONS.md); several entries
   are 15-minute unblocks.

## Next (owner curates the order)

- **Worldcraft epic** (owner, 2026-07-19): landform realism fed into
  worldgen (rift valleys, canyons, fjords, plateaus… — Lane L), sculpting
  tools (elevation painting; river/road add/remove/modify — Lane S), and
  the full art pass (cities, burrows, terrain ink — Lane K). Plan:
  [docs/everdeep/WORLDCRAFT.md](docs/everdeep/WORLDCRAFT.md). Note: Lane
  K-1 IS the remaining draw-only visual-audit rows (V31/V32/V34/V37) —
  one piece of work, two boards; close them together (V31a/V32 closed by
  the jitter batch; V31b/V34/V37 remain for K-1). **L-1 foundations
  LANDED** (elevation-modifier stack `sculpt.ts`, raw/uncarved/full split
  with the hydrology recursion guard, `reliefModel` dial plumbed inert,
  80-pin byte-identity smoke) — L-2 fluvial is next in the lane.
- **Layered-spaces epic** (owner, 2026-07-19): city ⊃ district ⊃ building
  ⊃ floor ⊃ room as nested-scale site stacks with a continuous zoom feel —
  a city represented at its true miles-across footprint. Plan:
  [docs/everdeep/LAYERED-SPACES.md](docs/everdeep/LAYERED-SPACES.md)
  (supersedes the PLAN.md §5 nested-spaces "next steps"). **N-1 LANDED**
  (city:v3 true-footprint overview @50 ft/cell with walled core + burrows,
  footprint-sized district/building drill-downs, breadcrumb trail).
  **N-2 LANDED** (the SiteContext contract: `site:district:v1` lays streets
  exactly where the overview's crossed the ward border, walls/water on the
  right sides, building doors face their street, and children follow
  overview edits — silently when unedited, by panel offer when hand-edited).
  **N-3 LANDED** (seamless navigation: zoom-past-ceiling descend charge,
  child-map preview blit over drilled areas, deep links `?site=`/`/s:/fl:`
  read+written, scale bar + miles-across readout). Next: N-4 world-map
  marriage (descend lands in the overview; footprint outline joint with
  WORLDCRAFT K-2), N-5 plane.links.
- **Visual audit round 3 fix lane** (owner, 2026-07-19): board V26–V37 under
  item #39 in [docs/everdeep/PLAN.md](docs/everdeep/PLAN.md);
  `docs/everdeep/scripts/audit-probe-*.mjs` are the regression test for every
  fix batch (metric v2 fixed two lying counts — see V28/V30 rows). Landed:
  b291 endpoint discipline (near-trunk cuts 917→199, dangling 1,251→522,
  stop-short 72→41), b293 river mouth clip + lasso self-close (rivers past
  the drawn coast 149→0 by the honest metric, 138 courses trimmed; open
  lassos → 43), V31/V32 boxy-biome + river-staircase kill (cell-index jitter
  on the land-cover pick + threshold jitter on the coast mask's bilinear cut —
  warping provably couldn't bend raster edges, see PITFALLS; Po/Ganges/Rhine
  re-shots read organic; claims pin 491→494). **Still open, each with its fix
  sketched in its board row**: V31(b) region-tier water/beach hex tiling —
  fold into V34's draw batch (borders strolling offshore) with V37 lake
  badge/trees; V33 mid-Europe net patchiness (diagnose first); V35 estuary
  too-short half; V27/V28 residuals (522 dangling incl. coarse-shore cuts;
  43 guard-refused lasso closes) — then a final `visual-audit-r3.spec.ts`
  re-shoot to re-stamp the board.
- **Campaign Codex Phase C — unified cross-world search**
  ([docs/CAMPAIGN-CODEX.md](docs/CAMPAIGN-CODEX.md)): the last open codex
  phase. Touches `world.astro`, a historically contended file — claim it for
  a session, don't share it across concurrent sessions.
- **Genre expansion** — horror / sci-fi / western as tag filters over the one
  dataset. The architecture shipped for this on day one (genre = tags, never
  folders); the work is content tagging/authoring, near-zero engine risk.
- **Everdeep deferred follow-ups** — deep-band tripwire in map-perf, and the
  mapView instrumentation hooks that unlock the deferred TEST-AUDIT
  assertions (legend label counts, re-raster counts). Chunked settle render
  shipped as B277.
- **§4 route retirement** — blocked on [DECISIONS.md](DECISIONS.md) #5.

## Later / idea shelf

- Community table submission ("paste a d100 list, get a generator")
- AI-assisted expansion of rolled skeletons into prose
- PDF export beyond print-to-PDF
- Colostle companion (parked 2026-07-11; concept-mined into the solo oracles)

## Recently closed (details in each doc + git log)

- **Test-suite audit** — closed B274; the still-live deferred list is at the
  end of [docs/TEST-AUDIT.md](docs/TEST-AUDIT.md)
- **Rollers as designed one-pagers** — B260–B267
  ([docs/sheets/GENERATORS-AS-ONEPAGERS.md](docs/sheets/GENERATORS-AS-ONEPAGERS.md))
- **Sheet Builder 2.0, phases 0–5** — B185–B257
  ([docs/sheets/PLAN.md](docs/sheets/PLAN.md))
- **Campaign Codex phases A/B/D + 5e builder** — B229–B258
  ([docs/CAMPAIGN-CODEX.md](docs/CAMPAIGN-CODEX.md))
- **World perf audit** — B266 (political buffer), B271 (deep-zoom freeze),
  B277 (chunked settle)
- **GM/Solo audit lane A–F** — B242–B262
- **Spaces epic** — B183–B209 (+ audit round B221–B226)
