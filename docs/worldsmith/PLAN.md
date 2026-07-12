# Worldsmith — The True v2: End-to-End Plan

*Drafted 2026-07-12. The master planning document. [SURVEY.md](SURVEY.md) is
the competitive evidence, [ARCHITECTURE.md](ARCHITECTURE.md) the system
design, [MAPS.md](MAPS.md) the hex-map design; this document is the complete
plan: every planned feature with the user experience driving it, everything
decided against, everything not yet planned, an honest review of the
architecture's weak points, and the full register of open decisions.
When this plan is complete, the result is considered **the true v2** of
Storyteller Toolbox.*

---

## 1. What "true v2" means

**Launch definition (recommended, Q5):** Phases 0 + A + B + C complete —
the wiki exists, generation lands in it, the world feels alive (links,
maps M1–M2, secrets v1, exports). Phases D (time) and E (reach) are
fast-follows; Phase F (backend fork) is a separate strategic decision, not
part of v2.

**The product sentence:** every generator on the site becomes a way to add a
permanent, linked, editable page to your world — and every page in your
world offers generators for whatever could live inside it, from the world
map down to a dungeon room, navigated by one continuous zoom.

**What happens to the existing site:** nothing existing is removed. The
three pillars (GM Prep, Solo, Writing) and the Sheet Builder keep working
throughout; Worldsmith grows beside them and becomes the center of gravity
at launch. Existing localStorage sheets and Drive backups remain valid
(the envelope is versioned for exactly this).

---

## 2. Architecture review — findings (2026-07-12 self-review)

An honest pass over ARCHITECTURE.md + MAPS.md before committing to the
end-to-end plan. Each finding carries its resolution; several become open
questions in §6.

**F1 — The Drive sync design breaks on images.** The plan said "envelope v2
adds `worlds` beside `sheets`" — but the envelope is a single JSON file, and
worlds will carry map-image blobs (base64-in-JSON bloats 33% and re-uploads
the entire world on every save). *Resolution:* restructure Drive layout to
one small index/envelope file + **one file per world** + separate blob
files, all in the app's `drive.file` scope. Whole-file per-world upload is
still simple; only touched worlds re-upload. (Q22 decides whether images
sync in v1 at all.)

**F2 — "Pin old generator behavior" was overpromised.** §4.1 suggested
`genVersion` could let old worlds keep old ghost output. Keeping every
generator version alive forever is not realistic. *Resolution:* the honest
contract is two-tier — **structure is guaranteed** (seed lineage, child
counts/kinds, hex addressing never change within a major world version);
**content may drift** for unmaterialized ghosts as tables improve. Anything
the user has materialized never drifts. `genVersion` remains for the rare
breaking change, triggering an explicit "your world's ghost terrain will
redraw" migration notice. (Q11 confirms the policy.)

**F3 — Two seed systems, unreconciled.** Entity lineage uses
`H(parentSeed, kind, slot)`; hexes use `H(worldSeed, tier, q, r)`.
Which seed does a settlement generated from a region hex get?
*Resolution:* an entity's `gen.seed` is simply **recorded at
materialization**, whatever its source (page-slot lineage, hex address, or
manual roll). Both derivations live under one frozen-contract policy; the
provenance record is uniform. Documented, no schema change.

**F4 — No search was planned.** A wiki without search fails at ~50 entities;
mention-autocomplete alone doesn't cover "where was that innkeeper?"
*Resolution:* added to Phase C — in-memory index (name/aliases/kind/tags/
body text) with a command palette (Ctrl-K). Small; the whole world is
already client-side.

**F5 — No undo or revision history.** World Anvil's data-loss reports are
its deepest trust wound; an editor that can eat an evening of worldbuilding
is disqualifying. *Resolution:* added to Phase C — per-entity revision ring
buffer (last N versions, IndexedDB) + soft-delete trash. Cheap, high trust
value. (Q24.)

**F6 — Entity URLs are local-only, and the plan didn't say so.** The site is
static; a world lives in one browser. `/world/#e_x7Kf9q` means nothing on
another machine until share snapshots (Phase E) exist. *Resolution:* honest
UX copy ("links work within your browser; share via export/snapshot"), and
the wiki ships as a single Astro island at `/world/` with hash routing —
no per-entity static routes.

**F7 — Ghost-of-ghost state is undefined.** Drilling three ghost levels deep
and rerolling one — where does the reroll counter live if no ancestor is
materialized? *Resolution (recommended):* interacting with a ghost
(reroll/dismiss/edit) **materializes its ancestor path** — "writing makes it
real" applies transitively; pure *viewing* stays free. Simpler than sparse
ghost-state records, and the materialized path is exactly the breadcrumb the
user just walked. (Q12 confirms.)

**F8 — Sheet Builder ↔ world integration was hand-waved.** One sentence in
§6 of ARCHITECTURE.md. It deserves feature status: the sheet is the *session
surface* and the wiki is the *world surface*; pinning an entity to a sheet
(live reference block) and sending a sheet block into a world are the two
bridges. (Q3 decides whether sheets also live inside worlds.)

**F9 — Map print/export missing.** The site's identity is
generate→combine→refine→**print**, and the map plan had no print/PNG-export
story. *Resolution:* added — viewport PNG export in M1, print-quality
region/gazetteer output later (M4).

**F10 — Mobile/touch commitment unstated.** Canvas pinch-zoom is in M1;
the wiki UI must be responsive from Phase A (it's cheaper than retrofitting,
and WA's "clunky mobile" is a standing complaint).

Verdict otherwise: the core stack (continuous plane, hexes as seed slots,
ghost/copy-on-write, kind registry, adapter layer over existing generators)
survived review intact and is the right shape for the constraints.

---

## 3. Feature register — everything planned, with its driving UX

Effort: S (days), M (week-ish), L (weeks), XL (months, staged).
"UX driver" is the user moment the feature exists to serve.

### Phase 0 — Design freeze *(nothing ships; everything depends on it)*

| Feature / decision | UX driver | Effort |
|---|---|---|
| Entity schema + id/tombstone scheme frozen | Every later feature; migrations are user pain | M |
| Kind registry v1 (day-one five + reveal list) | "I'm not confronted with 28 templates on day one" (anti-WA) | S |
| Seed-lineage + hex-seed contract, drift policy (F2/F3) | "The unwritten world I browsed yesterday is still there today" | M |
| Map decisions M0 (plane, orientation, scales, site grids) | The zoom feel — validated by hand with the prototype | S |
| Written scenarios: 10 real prep workflows walked through the schema on paper | Catches wrong-looking-right modeling before code | M |

### Phase A — The wiki exists

| Feature | UX driver | Effort |
|---|---|---|
| World create/switch/rename/delete | "A home for my campaign world" | S |
| IndexedDB world store, debounced autosave | "I never lose an evening of writing" (WA's trust wound) | M |
| Entity pages: prose-first Block body + suggested fields with prompt-style labels | "Let me write, don't make me fill a form" (anti-Kanka); "the field label taught me what to consider" (WA's best-loved pattern) | L |
| Containment tree, breadcrumbs, sidebar tree nav | "Where am I in my world; what's inside this place?" | M |
| Create blank entity of any allowed kind; move/reparent; soft delete + trash | Basic authorship | M |
| Progressive kind disclosure | New user sees 5 kinds; the taxonomy unfolds as the world grows | S |
| World JSON export/import (one file) | "My world is mine — I can leave anytime" (survey table stake #6) | S |
| Drive sync v2: index + per-world files (F1) | "My world survives my browser" | M |
| Responsive wiki layout (F10) | "I prep on my phone on the bus" | M |

### Phase B — Generation lands in the wiki *(the differentiating phase)*

| Feature | UX driver | Effort |
|---|---|---|
| Entity adapter layer (generator output → Entity) | The bridge between the 20 existing generators and the wiki | M |
| "Save to world" on every existing generator page | "I rolled a tavern I love — keep it forever" (kills donjon's evaporation) | M |
| Universal "+ Add" affordance on every entity page (blank / suggested-generated / roll-a-table) | "What could live here? Show me." — generation *in context*, the survey's gap #1 | L |
| Ghost children: view, drill-in, Keep, Reroll, Dismiss, Edit | "Browse a bottomless world; keep what sings" — the signature mechanic | XL |
| Ancestor-path materialization on ghost touch (F7) | "Writing makes it real" — transitively | (in above) |
| Seed lineage live + smoke-tested like the engine | Ghost stability across sessions | M |
| Entity-level regenerate-around-overrides | "Reroll everything about her except the name I chose" — fragment lock/reroll promoted to entity scale | M |
| New generators: region, biome, settlement, district, landmark (mine v1's deferred settingBuilder/LOCATION builders per CONTENT.md) | The drill-down chain needs generators at every rung; today we have tavern/NPC/shop but no settlement/region | L |
| Ancestor-context tag plumbing into `{table:#tag}` rolls | "Encounters in this hex fit this biome" — consistency propagation v0 | M |

### Phase C — It feels alive *(launch completes here)*

| Feature | UX driver | Effort |
|---|---|---|
| `{@e id|text}` mentions + `@` autocomplete | "I type @ and my world connects itself" | M |
| Backlinks panel on every page | "Who references this NPC?" (LegendKeeper's linked references) | S |
| Hover tooltips on every entity link | The wiki feels alive on hover — free, where WA charges | S |
| Autolink *suggestions* (never silent rewrite) | "It noticed I mentioned Bram's Hollow and offered the link" | M |
| World search + command palette (F4) | "Where was that innkeeper?" in 2 keystrokes | M |
| Per-entity revision history + trash (F5) | "Restore how this read last week" | M |
| **Hex map M1**: canvas viewer, pan/zoom/crossfade tiers, G1 ghost terrain, hex select → side panel, biome paint + hex naming, anchors with tier visibility + badges, URL-hash viewport, image layer w/ scale calibration, viewport PNG export (F9), touch/pinch | "I start at my world map and zoom to my tavern's front door, and everything I've saved is where I left it" — the requirement, made real | XL |
| **Hex map M2**: G2 region ghost features materializing through adapters; "+ Add here" (spatial); claims overlay | "The map suggests a ruin; one click makes it a wiki page pinned right there" | L |
| Secrets v1: per-entity + per-block flag, global Player View toggle, secret-aware export | "I project the wiki at the table without spoiling my players" | M |
| Markdown/Obsidian vault export (frontmatter + wikilinks) | "Files I own forever" — credibility with the Obsidian crowd | M |
| World-aware table tokens (`{world:person#tag}`) | "A rumor table that names MY npcs" — survey gap #4, nearly unoccupied | M |
| Sheet ↔ world bridges (F8): pin entity to sheet as live block; send sheet block into world | Prep loop closes: wiki → session sheet → print | M |
| Gazetteer print (entity subtree through print stylesheet) | The generate→combine→refine→print identity, at world scale | S |
| First-run experience: seeded example world + "generate me a world" flow | First five minutes decide adoption (anti-WA overwhelm) (Q14) | M |

### Phase D — Time

| Feature | UX driver | Effort |
|---|---|---|
| Custom calendar engine (months/weekdays/moons; donjon-calendar import as a format) | "My world's year is 364 days with two moons, and the app respects that" | L |
| Timeline entity kind: eras + events linking entities | "The war, the coronation, and her birth, in order" | M |
| Calendar-aware date fields on entities | Birthdates that are legal in-world | M |
| (Q31) Weather per biome/season | "What's the weather on the road today?" | M |

### Phase E — Reach

| Feature | UX driver | Effort |
|---|---|---|
| Read-only share snapshot (static player-safe bundle / Drive-hosted, loadable by link) | "Here's the campaign wiki, players" — without a backend | L |
| Foundry journal-compendium export (`@UUID` links preserved) | "My worldbuilding flows into my VTT" — the integration every wiki eventually builds | L |
| **Hex map M3**: ground-tier sites (anchor, patch viewer/editor, z-stack floors), G6 dungeon/interior generation, locale→site zoom transition | "…and I keep zooming, into the dungeon itself" — the last rung of the requirement | XL |
| Query/filter views (kind+tag+relation, URL-serialized) | "Every NPC in this faction" (5etools filter DNA over your own world) | M |
| Relation-derived visualizations (family tree, faction web) when data density earns them | "The dynasty draws itself" (WA's pattern, from our relations) | L |

### Continuous map track M4 (⚠️ SLOW, parallel, unhurried)

| Feature | UX driver | Effort |
|---|---|---|
| G3 rivers & roads (flow tracing; A* roads; polylines) | Maps read as *places*, not colored cells | L |
| G5a settlement district blobs + named building anchors | "Zoom into the city and see its districts and landmarks" | L |
| G5b road/wall skeletons; G5c building-footprint morphology | Watabou-grade beauty — **the slowest item in the plan; never a gate** | XL+ |
| Label decluttering, print-quality map output | Gorgeous shareable maps | M |

---

## 4. Features decided against

| Decision | Reason | Decided |
|---|---|---|
| External deep-links to Watabou/Azgaar | Owner: mold our own process on their ideas; no out-links | Owner, 2026-07-12 |
| Azgaar `.map` / Watabou JSON import | Same decision — native process only | Owner, 2026-07-12 |
| Any interim map feature beyond image upload | Owner: no stopgap except image upload | Owner, 2026-07-12 |
| Global ground-tier grid | ~10¹³ cells; authorially false — dungeons are discrete places → **sites** | MAPS.md §3.1 |
| Geometrically nested hexes (Gosper/H3) or clipped child grids | Fractal boundaries / seams; continuous plane wins | MAPS.md §2 |
| Backend, accounts, server DB in v2 | Static, free, local-first is the identity; Phase F is a separate strategic fork | ARCHITECTURE.md |
| Realtime collaboration in v2 | Requires the backend fork | Phase F |
| Per-player subscriber secrets in v2 | Requires accounts; v1 secrecy = flags + Player View + snapshot export | Phase F |
| Community sharing marketplace in v2 | Moderation/hosting/licensing burden; "import from URL/file" covers the mechanics | Phase F |
| Copyrighted compendium content (the 5etools model) | Legally radioactive (WotC DMCA precedent); SRD CC-BY + credited community tables only | SURVEY.md |
| CRDT sync engine | Heavyweight dependency vs codebase culture; per-entity LWW + conflict inbox instead (revisit only if Phase F happens) | ARCHITECTURE.md §8.2 |
| localStorage for worlds | 5 MB ceiling; IndexedDB | ARCHITECTURE.md §8.1 |
| BBCode/dual-mode editor; paywalled reading; paywalled API; ads | World Anvil's documented wounds; also: everything here is free | SURVEY.md §3.4 |
| Silent autolink rewriting | "Bram's Hollow" is also a phrase; suggestions only | ARCHITECTURE.md §6 |
| Custom user-defined entity kinds in v2 | Migration risk before the taxonomy proves itself; per-world *tweaks* (suggestions, labels) allowed (Q9 can overturn) | Provisional |
| Fixed hardcoded tier hierarchy | Kind registry + childKinds gives unbounded depth as data | ARCHITECTURE.md §3.2 |

## 5. Not yet in the plan (known gaps, honestly listed)

Candidates acknowledged but unscheduled — each needs an owner decision or a
trigger before joining a phase:

- **In-app custom table & generator authoring** (the Perchance/Chartopia
  angle): users writing their own tables that feed world-aware generation.
  Large; transformative; probably v2.x. (Q29)
- **Import from World Anvil / Kanka exports** — a switcher magnet;
  no legal issues (user's own data); unplanned. (Q30)
- **Time-versioned world state** ("who rules here in 1023 vs 1305") —
  survey gap #7; precursor (date-stamped relations) noted, unscheduled.
- **Session mode / play surface**: initiative, encounter running, session
  journal auto-linking touched entities (the prep↔play handoff, survey gap
  #6). The Sheet Builder covers part; a true session surface is unplanned.
- **System-agnostic statblocks** beyond the current 5e-flavored blocks
  (WA supports 100+ systems; we support prose + 5e-ish). Unplanned.
- **Multi-genre content** (sci-fi drill-down: sector→system→planet):
  architecture is genre-neutral (tags, kinds); the *tables* don't exist.
  Content project, not code. (Q4)
- **Z-layers on global map tiers** (underdark as a parallel plane vs sites-
  only verticality). (Q20/Q18)
- **Weather simulation** tied to calendar+biome. (Q31)
- **PWA installability / offline preload** of the app itself (5etools-style
  "take it to the basement game room"): the site is already static; making
  it an installable PWA is unscheduled but cheap.
- **Image management** beyond map layers: entity portraits/galleries,
  compression, storage budgeting UI.
- **Accessibility pass** (keyboard-only wiki nav, screen-reader entity
  pages, color-blind-safe biome palette) and **i18n**. Palette choice at
  least should happen in M1 while colors are young.
- **Co-authoring without a backend** (world-file handoff / merge tooling
  between two GMs). LWW+inbox gives the substrate; the workflow is undesigned.
- **Seasonal community challenges** (WA's Summer Camp retention engine) —
  a community/program feature, not code; noted for post-launch.
- **Relations editor UX** richer than "add relation" (drag-to-relate,
  inline suggestions during generation).
- **Trash/export automation** — scheduled auto-export ("email me my world
  monthly" has no backend; a Drive-revision cadence note may suffice).

## 6. Decision register — every open question

Grouped; each with recommendation. **Bold = blocks Phase 0/A** (needed
first); the rest can trail to their phase.

### A. Product identity
- **Q1. Naming/front door:** does the world tool become the site's front
  page at launch, and is "Worldsmith" a product name or an internal
  codename under the Storyteller Toolbox brand? *(Rec: codename; the site
  stays Storyteller Toolbox; the world tool becomes the front door at
  launch.)*
- **Q2. Solo & Writing pillars in true v2:** unchanged satellites, or tools
  that can also write into a world (solo oracle results as journal
  entities)? *(Rec: unchanged at launch; "oracle → world journal" is a
  cheap v2.x bridge.)*
- **Q3. Sheets and worlds:** do sheets stay global (current), become
  world-scoped, or both? *(Rec: both — sheets gain an optional world
  binding; unbound sheets keep working.)*
- **Q4. Genre scope at launch:** fantasy content with genre-neutral
  architecture, or wait for multi-genre tables? *(Rec: fantasy launch;
  registry stays genre-neutral.)*
- **Q5. Launch definition:** confirm true v2 = Phases 0+A+B+C, with D/E
  fast-follow. *(Rec: yes.)*

### B. Entity model (Phase 0)
- **Q6. Containment:** strictly one parent (tree); everything else is a
  typed relation. Confirm. *(Rec: yes — maps/breadcrumbs need the tree.)*
- **Q7. Field values:** strings now, optional per-kind types later (enables
  query views + clean exports). Confirm. *(Rec: yes.)*
- **Q8. Day-one kinds:** world, place, settlement, person, note — right
  five? *(Rec: yes, with `faction` as the sixth if any.)*
- **Q9. User-defined custom kinds in v2:** allowed, or per-world tweaks
  only? *(Rec: tweaks only; revisit post-launch.)*
- **Q10. Id/URL scheme:** opaque short ids + aliases vs readable slugs.
  *(Rec: opaque ids — rename-safe, merge-safe; slugs are display-only.)*

### C. Generation & seeds
- **Q11. Ghost drift policy (F2):** guarantee structure, accept content
  drift for unmaterialized ghosts as tables improve. Acceptable? *(Rec:
  yes — the alternative, freezing all generator versions forever, isn't
  real.)*
- **Q12. Ghost touch semantics (F7):** rerolling/dismissing a ghost
  materializes its ancestor path. Confirm. *(Rec: yes.)*
- Q13. Default ghost suggestion density per page. *(Rec: 3–5, tunable.)*
- Q14. New-world default flow: "generate me a world" vs blank canvas
  first. *(Rec: generate-first with a prominent blank option; the empty
  page is the enemy.)*

### D. Maps (M0)
- **Q15. Hex orientation:** pointy-top (as prototyped) or flat-top?
  *(Rec: pointy — decide by feel in the prototype.)*
- **Q16. Ground-site grids:** square, hex, or per-site choice? *(Rec:
  per-site, square default for interiors/dungeons.)*
- **Q17. Tier scales:** 60 mi / 6 mi / 500 ft / 5 ft — confirm or adjust;
  configurable per world at creation only. *(Rec: confirm; allow creation-
  time override.)*
- **Q18. Planes:** one map plane per world, or multiple named planes
  (continents/underdark/outer planes)? *(Rec: schema supports multiple
  now; UI ships one.)*
- Q19. Rivers/roads: freeform polylines vs hex-edge-locked. *(Rec:
  polylines — continuous across tiers; edge-lock is a render style, not a
  data model.)*
- Q20. Underdark/vertical layers on global tiers: v2 scope or sites-only
  verticality (+ Q18's planes)? *(Rec: sites-only in v2; a second plane
  covers underdark later.)*
- Q21. Units: imperial only, or metric display toggle? *(Rec: imperial
  native, metric display later.)*

### E. Storage & sync
- **Q22. Drive layout (F1):** per-world files + blob files; do images sync
  in v1 or export-only? *(Rec: per-world files in v1; image sync v1.1.)*
- **Q23. Merge policy:** per-entity last-write-wins + conflict inbox
  (never silent loss). Confirm. *(Rec: yes.)*
- Q24. Revision history depth (F5): last N versions per entity — N?
  *(Rec: 20, size-capped.)*
- Q25. Guidance limits: max image size / world size soft warnings.
  *(Rec: warn at 50 MB/world, no hard cap.)*

### F. Secrets & sharing
- Q26. Secrets v1 = per-entity + per-block flag + global Player View.
  Sufficient for launch? *(Rec: yes.)*
- Q27. Share snapshots: Phase E as planned, or pull into C? *(Rec: keep
  E — C is already the heaviest phase.)*

### G. Long horizon
- Q28. **The Phase F question:** is a backend (accounts, hosting costs,
  realtime collab, community sharing) ever acceptable, or is local-first
  the permanent identity? Determines whether F-features are "later" or
  "never." *(No recommendation — this is the owner's philosophical call;
  nothing before Phase F depends on it.)*
- Q29. In-app custom table/generator authoring: v2.x ambition or out of
  scope? *(Rec: v2.x — it's the Perchance moat combined with our world
  context.)*
- Q30. Importers for World Anvil/Kanka exports (switcher magnet):
  plan or skip? *(Rec: plan for E/v2.x.)*
- Q31. Weather: Phase D with calendars. Confirm. *(Rec: yes.)*

## 7. End-to-end sequence with exit criteria

```
Phase 0  Design freeze            ██        exit: schemas + contracts written,
         (Q1–Q23 bold answered)             10 scenarios walked, prototype-validated
Phase A  Wiki core                ████      exit: build a 30-entity world by hand,
                                            export/import round-trips, Drive-synced
Phase B  Generation integration   ██████    exit: tavern→keeper→district→city chain
                                            created from ghosts in <2 min; seeds
                                            stable across reloads (smoke-tested)
Phase C  Alive + Map M1–M2        ████████  exit: LAUNCH — the §1 product sentence
                                            is true end-to-end (except ground tier)
Phase D  Time                     ███       fast-follow
Phase E  Reach + Map M3 (sites)   █████     fast-follow — world→dungeon zoom complete
M4       Rivers/roads, morphology ····continuous, never gating····
Phase F  The fork (Q28)           — separate decision, separate plan —
```

Working rules: each phase ships behind nothing (the existing site never
degrades); the seed contract gets smoke tests the day it exists (the engine
already models this); every schema carries a version + migration from day
one; ⚠️ SLOW items get design time in the *preceding* phase so they're
never designed under deadline.

## 8. Risks (unchanged from ARCHITECTURE.md §12, plus)

Schema churn (hence Phase 0), seed-contract drift (hence smoke tests +
Q11's honest policy), scope gravity (the wedge is generation↔persistence
integration — feature parity with 10-year-old tools is explicitly not the
goal), static-site ceiling (honest copy about local-only links until
snapshots), licensing discipline (SRD + credited community tables only),
and one new: **Phase C is overloaded** — if it drags, split C into C1
(links/search/revisions) and C2 (map M1–M2 + secrets + exports) and launch
after C2.
