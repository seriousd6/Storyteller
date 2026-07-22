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
  **N-3 LANDED** (seamless navigation). **City realism pass** (owner
  adversarial review 2026-07-20, §5b): forks decided — building drill =
  tactical window on the district, build an in-app combat layer, roads &
  shapes first. **R1 roads→gates + R2 organic-hull shapes LANDED**
  (city v4: gates sit where the world roads approach; the wall is an
  organic ward-hull, a different silhouette every seed, not a rectangle).
  **R3 role colors LANDED** (temple/keep/guild/civic + 2–3 inns tinted per
  city, cosmetic cell role). **R4 de-box LANDED** (v4 only: the
  full-perimeter floor moat is gone — buildings pack into terraced rows and
  fuse into blocks divided by streets, ~1.7–2.1× the old box size; a denser
  core packs to the wall; enclosed pockets become green garden courts; a
  plaza monument + a Town Hall front the square). **R5 tactical window
  LANDED** (drilling a building opens a fixed 200 ft / 40×40 @5 ft block —
  the clicked house detailed in the centre, a garden yard behind, neighbour
  facades + street around it, waterfront/rampart on flagged edges, every
  room reachable off the street — an "in-city fight" battle map; building
  v2/`genBuildingBlock`, v1 interior still dispatches). **R6 interior
  character LANDED** (owner review "buildings look same, no details besides
  walls/floors": each type now carves a distinct plan — nave / common room /
  great hall / shopfront + service rooms — and furnishes per purpose via a
  cosmetic `feature` on cells: temple pews+altar+font, smithy forge+counter,
  tavern bar, keep hall+statue, house hearth+beds). **R7 REFRAMED by the
  owner into a 3-level model** (city = rough ZONES + skeleton + named FLAGS,
  no buildings; district = the fabric + placed flags; street = accessible
  buildings; flags = notables + user-flaggable, drillable through each
  level). **R7α LANDED** (city **v5**: the rough overview — ward zones tinted
  by district + road/wall/water skeleton + notable flag pins, no building
  masses; `genCityWards` `zones` branch, cosmetic `SiteCell.zone` +
  `SiteArea.flag`; v4 fabric frozen). **R7β LANDED** (the correspondence:
  the district PLACES the ward's flags — the same named buildings the
  overview showed, drillable + reachable via a carved lane; `SiteContext.flags`
  + `projectFlags`; an overview flag drills to its ward district; additive,
  no version bump). **R7β-2 LANDED** (district **v2**: terraced the ward
  fabric — R4's de-moat one scale down. `genDistrict` `terrace` branch: party
  walls + back-alleys + garden courts + a ward-square monument, then a
  **reclaim** flood fuses any pinched-off alley/yard back into its block so the
  street net stays fully connected; max fused block ~3–10× v1's moated boxes;
  v1 frozen byte-identical). The district now reads as a true zoom of the
  terraced city. Next **R7γ** (user-flagging) + C in-app combat layer;
  R5b + R2b archetypes deferred. N-4 art half + N-5 plane.links still parked (N-5 wants owner
  scope; N-4 art joint with WORLDCRAFT K-2).
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

- **World-map art pass** (owner, 2026-07-22) — a legend overlay key (a
  symbol/colour key for roads/rivers/ghosts/portals/resources/winds/settlements),
  and settlement footprints that get opaque cleared ground + a dense
  rooftop/street block fabric (no more "huts on grass"), sized to population at
  fantasy-Victorian density (see [docs/everdeep/MAPS.md](docs/everdeep/MAPS.md)
  §3.1c), and density-ghosts that draw as scaling hex ZONES — a ~3-hex danger
  zone (dashed hexagon + red tint + hatching) for abandoned settlements and
  lairs, a smaller dashed hex for safe unwritten hamlets — instead of a fixed
  dot that shrank to a speck in a 500 ft hex (§9b). Perf parity held (map-perf).
  The drill-down half followed: the `genCityOverview` walled core now scales
  with population too (opt-in `pop` opt from the census — a market city keeps a
  compact core in broad farmland, a metropolis packs the core wide; popless
  stays the frozen 0.45, byte-identical). All four owner asks shipped.
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
