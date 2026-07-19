# Layered Spaces — city ⊃ district ⊃ building ⊃ floor ⊃ room

> Owner directive (2026-07-19): *"Layered spaces — a general city map,
> zooming into districts, zooming into buildings and floors of cities,
> districts, and rooms. If the size of spaces can't be expanded, we need a
> way to nest spaces and make the scale be more appropriate. Some cities are
> miles across; the space should be able to represent that as it is being
> explored."*

*Drafted 2026-07-19 from a full code survey. Living. Extends the Spaces epic
(B183–B209 + audit B221–B226) and supersedes the "Next steps" list of the
nested-spaces section in [PLAN.md](PLAN.md) §5 (slice 3 shipped as the epic;
this doc is what comes after). Companions: [MAPS.md](MAPS.md) §3.1
(sites-not-global-grid — still the law), the sites storage contract in
`sites.ts:50-61`.*

## 0. Ground truth (what the survey found, 2026-07-19)

The answer to the owner's "if the size of spaces can't be expanded" is:
**it can't, and shouldn't — but the nesting machinery is already half-built.**

- A site floor's practical ceiling is ~220×220 cells (schema cap 1000; the
  renderer cache and the regenerate-base-on-open contract both assume a
  floor's full base is cheap — a 220×220 city thumb already costs ~150ms).
  A city 3 miles across at 5 ft/cell would be 3,168 cells square = 10M
  cells. MAPS.md §3.1 rejected exactly this for the world (10¹³ cells) and
  the reasoning holds at city scale. **Scale must come from stacking, not
  bigger grids.**
- The stacking seams already exist:
  - `SiteRec.parentSiteId` + `makeSubSite()` (`siteOps.ts:137`) — a city
    plan's building area mints a child interior site; "Create interior →" /
    "Open interior →" are live in the editor; a badge on the anchor cell
    opens the child; zooming out 3 notches past min **ascends** to the
    parent (`siteView.ts:914`).
  - `cellFt` is **per-site** (`sites.ts:73`) — heterogeneous scale works
    today: city plans are 10 ft/cell, interiors 5 ft (`siteOps.ts:159`).
  - The hex map already has a **descend gesture** (overzoom a pin charges
    into its interior, `mapView.ts:3338`).
  - The storage contract (gen + sparse hand-edit overrides, re-derive on
    open) makes deep stacks CHEAP — an untouched child site is ~a seed.
  - Merge already unions sites by id with per-site LWW — deep stacks sync.
- What does NOT exist: any layer between "walled city core" and "building"
  (no district sites); a generator that fills a district honoring its
  parent's geometry; more than one nesting hop in practice; a continuous
  *feel* across the seam (children open as fresh mounts, no transition); a
  route/URL to any site or floor; `plane.links` (portal/stairs-to-elsewhere)
  is schema-only, zero references in code; no scale bar or "miles across"
  presentation; the city generator draws a stylized walled **core**, not
  the true 2–3 mi footprint the batch-9 table promised.

## 1. The architecture: a scale ladder of nested sites

One city = a **stack of sites**, each a normal site at its own `cellFt`,
chained by `parentSiteId`, each layer generated *from the layer above's
geometry*:

| Layer | cellFt | Typical dims | One cell is | Generator |
|---|---|---|---|---|
| **Overview** (the whole city, walls to burrows) | 50 ft | 160–320 (2–3 mi true footprint) | a building-cluster / street segment | `site:city:v3` — evolved `genCityWards`: walls ring the CORE, wards inside, roads, river/harbor, farmland + satellite hamlets beyond the walls (the same "burrows" story as WORLDCRAFT K-2, seen from inside) |
| **District** (one ward) | 10 ft | 60–160 | a room-scale chunk of street/yard | `site:district:v1` — NEW: streets + building footprints filling one ward, honoring the context contract (§2) |
| **Building** | 5 ft | 20–60 | one combatant | existing `genBuilding` (BSP) |
| **Floor** | — | — | — | existing `floors[]` z-stack |
| **Room** | — | — | — | existing keyed `areas` |

Dungeons get the same ladder where useful (fortress ⊃ level ⊃ chamber);
villages/towns may skip layers (a village IS its overview at 10 ft). The
ladder is a **convention over the existing schema** — `cellFt` is already
free, `parentSiteId` already chains, `maxDepth` is a UI concern, not a
model one. No schema change for the core epic.

**Rule: a layer never renders another layer's cells as its own data.** The
overview shows a ward as painted blocks + an area rect; the ward's true
streets live in the district site. What bridges the visual gap is the
preview blit (§3), not shared cell data.

## 2. Generation coherence: the context contract

Today `makeSubSite` scales dims from the area footprint and forgets
everything else. Deep stacks need the child to *agree* with the parent —
a street that hits the ward boundary must continue in the district map.

`makeSubSite`/`ensureGeneratedSite` grow a **`SiteContext`** passed into the
child's generator (and hashed into nothing — the child's seed stays the
deterministic `sitePath(worldSeed, entityId, 'site')` chain; context shapes
LAYOUT, seeds stay CONTRACTS-clean):

```ts
interface SiteContext {
  boundary: { w: number; h: number };        // child dims (exists today)
  entries: Array<{ side: 'n'|'e'|'s'|'w'; at: number; kind: 'street'|'gate'|'door'|'water' }>,
  edges:   Array<{ side; kind: 'wall'|'water'|'open' }>,  // coast/wall-backed sides
  theme?: string;                             // THEME_SPACE passthrough (exists)
  bound?: Array<{ entityId; label }>;         // cast to seat (marryCityToWeb, exists)
}
```

- The parent computes `entries` from its own geometry: where its streets/
  gates/river cross the area rect's border, projected to child edge
  coordinates. The child generator opens street stubs/gates/water at
  exactly those points and grows inward. Same trick down a layer:
  district → building doors face the street the district drew.
- Deterministic and stable: context derives from the parent's EFFECTIVE
  floor (gen + overrides), so hand-edits flow down — carve a new gate in
  the overview, the district regenerates with a street meeting it.
  (Regen-on-context-change is offered, never forced — hand-edited children
  warn first, per the overrides philosophy.)
- `marryCityToWeb` keeps working unchanged one layer down: cast members
  seat into district buildings instead of (only) the city core's.

## 3. Navigation: making the stack feel like one map

The goal is Google-Maps continuity over discrete mounts (the same illusion
the hex map's tier crossfade already sells):

1. **Descend** — zoom-in past max over a sub-site area/badge charges into
   the child (mirror of `siteView`'s existing ascend and `mapView`'s
   existing descend-into-pin; one new gesture, two existing precedents).
   Click "Open interior →" stays as the explicit path.
2. **Preview blit** — when zoomed toward an area whose child site exists
   (or is cheap to ghost-generate), draw the child's cached floor canvas
   scaled into the area rect, replacing the flat ward wash. The per-floor
   cache canvas already exists (`siteView.ts:1029`); this is a `drawImage`
   with opacity ramp during the charge. This single trick makes the seam
   read continuous without a true multi-scale renderer.
3. **Ascend** — existing 3-notch zoom-out, kept; plus a **breadcrumb bar**
   (`Everspire ▸ Docks Ward ▸ The Gilded Eel ▸ Floor 2`) — each crumb a
   jump; doubles as the "where am I" answer deep stacks otherwise lose.
4. **Deep links** — extend the existing hash routing: `/world/#e_<id>/map`
   grows `/s:<siteId>/fl:<n>`; `/spaces/` gets `?site=`. Unblocks sharing,
   e2e addressing, and "open where I left off".
5. **Scale honesty** — a scale bar in the site editor (the hex map has
   one; sites, which CLAIM feet per cell, don't) + "≈ 2.4 mi across" in
   the floors panel at overview scale.
6. **World-map marriage** — the descend gesture over a city pin lands in
   the city's OVERVIEW site (true 2–3 mi footprint), so hex map → city →
   ward → taproom → cellar is one continuous zoom, which is the M-plan's
   original promise (MAPS §1.3) finally kept. Later/optional: render the
   overview's wall-and-ward outline as the city's footprint art on the hex
   map itself (one source of truth for both pictures).

## 4. Perf & storage budget

- Every layer stays within the proven envelope (≤ ~220–320 per side; the
  320-side overview is ~100k cells — above the 48k design center, within
  the schema cap; budget it explicitly in `siteView`'s cache sizing and
  verify with a perf spec before blessing 320. Fallback: overview at 66
  ft/cell keeps 2–3 mi under 240 cells/side).
- Only the mounted site renders; children exist as caches (preview blit)
  or seeds (untouched). A fully-explored city stack is ~5–20 sites of
  sparse overrides — hundreds of KB, not the 10M-cell monolith.
- Ghost children: a district site that's never been opened can render its
  preview from a **thumbnail-resolution base regen** (the ~150ms city-thumb
  precedent, done once, cached, off the interaction path).
- Merge/sync: untouched — per-site union LWW already handles any depth.

## 5. Slices (each independently shippable)

| Slice | Ships | Verifies |
|---|---|---|
| **N-1 Ladder & depth** | scale map by kind (overview/district/building), `site:city:v3` true-footprint overview (walls, wards, roads, burrows, farmland), district areas minting district sites, arbitrary-depth `makeSubSite` chains, breadcrumb bar | `smoke-sites`: deterministic 3-deep chain city→district→building; ids stable; old `site:city:v2` saves untouched (generator strings are versioned — existing cities keep their map) |
| **N-2 Context contract** | `SiteContext` (entries/edges/theme/bound), `genDistrict` honoring it, building doors facing district streets, overview hand-edits flowing down with regen-offer | smoke: entry projection is exact (street at parent edge = stub at child edge); e2e: carve a gate, see the street |
| **N-3 Seamless navigation** | descend charge on areas, preview blit with opacity ramp, deep-link routes (`/s:<id>/fl:<n>`, `?site=`), scale bar + "miles across" readout | `spaces.spec`: gesture descends, breadcrumb jumps, deep link opens the right floor; perf spec: preview blit ≤ one frame budget |
| **N-4 World-map marriage** | hex-map descend lands in the overview; overview outline as the city's hex-map footprint art (joint with WORLDCRAFT K-2) | e2e: continuous world→cellar walk; visual round |
| **N-5 Links** | wire `plane.links` (schema-only today): stairs-to-underdark, portals room↔room, cave-mouth ↔ wilderness; cross-plane descend markers | smoke: link round-trip; e2e: portal hop |

N-1→N-3 are the epic's heart and deliver the owner's sentence verbatim.
N-4 needs WORLDCRAFT's K-2 city art only for its second half. N-5 is
severable.

## 6. Decisions taken here (challenge in review, not mid-build)

- **No giant grids.** Reaffirmed from MAPS §3.1; stacking is the mechanism.
- **Square grids stay** (Q16); the ladder is a convention over `cellFt` +
  `parentSiteId`, not new schema.
- **Old cities never migrate.** `site:city:v2` saves render forever
  (generator version strings); v3 is for new mints — the genVersion
  philosophy applied to sites.
- **Context shapes layout, never identity.** Seeds/ids stay on the
  CONTRACTS §1 path; `SiteContext` is an input to the layout pass only, so
  a context change re-lays streets but never re-mints entities.
