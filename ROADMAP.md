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

- **Visual audit round 3 fix lane** (owner, 2026-07-19): roads that stop a
  mile short of the road/city they should join (917 endpoints, 32%), 71
  self-looping roads, 149 rivers overshooting the coast, boxy biome
  quantization. Board V26–V37 with probe counts, screenshots, and a suggested
  batch order is under item #39 in
  [docs/everdeep/PLAN.md](docs/everdeep/PLAN.md); probes in
  `docs/everdeep/scripts/audit-probe-*.mjs` are the regression test for every
  fix batch.
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
