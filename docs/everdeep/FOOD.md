# Feeding the World — the foodshed investigation (batch 38)

> Owner directive: "add to the plan the need to investigate farmland to support
> people, and do the investigation to determine how many farm towns would be
> required to support large cities, add natural game calculations for different
> biomes, fishing opportunities, etc. all these should be considered when
> planning city placement… towns should be incredibly scarce in areas that are
> not habitable or farmable without excess in other areas to ship food."

This document is the investigation; the constants at the bottom are what the
generator actually uses. Everything is calibrated against pre-industrial
history because Everdeep's default tech level is a horse-and-sail world with
magic at the margins (portals, driven hulls) rather than in the fields.

## 1. How many people does farming feed?

In every pre-industrial society, the overwhelming majority of people grow
food. Medieval Europe ran at roughly **4–8 farming households per non-farming
household**; the great irrigated river valleys (Nile, Yangtze) got closer to
3:1. Inverted: **a city person stands on the backs of ~5–8 rural people**, and
the land itself supports (total, rural + urban):

| Land use | persons / sq mi (sustained) |
|---|---|
| Hunting & gathering, temperate forest | 0.05 – 0.3 |
| Hunting, rich game country (savanna edge) | 0.3 – 1 |
| Pastoral herding (steppe, tundra edge) | 1 – 5 |
| Rain-fed mixed farming (temperate) | 60 – 120 |
| Irrigated floodplain | 200+ |
| Fishing coast | a village every few miles of shore |

A world hex is 60 mi across ≈ **3,100 sq mi**. Calibration point: France in
1300 sustained ~80 persons/sq mi over its WHOLE territory (16M on 200k sq mi),
waste and woodland included — so settled grain country supports ~70/sq mi
hex-wide, and the table scales down from there:

| Biome | sustainable people / world hex | why |
|---|---|---|
| grass | ~220,000 | the bread basket (≈ 70/sq mi, France-1300 grade) |
| savanna | ~120,000 | dry-farmed grain + herds |
| beach | ~90,000 | strand farming + inshore fishing |
| forest | ~80,000 | field-and-wood mosaic, pannage, game |
| hills | ~45,000 | terraces and valley floors |
| jungle | ~20,000 | garden plots; the canopy resists the plough |
| taiga | ~12,000 | hunting, herding, hard barley |
| mountain | ~5,000 | high valleys only |
| desert / tundra | ~2,500 | oasis and moss-edge herding |
| snow | ~0 | nothing grows |

**Modifiers** (multiplicative / additive on the hex):

- **River** ×2.5 — irrigation, floodplain silt, AND the barge that carries the
  surplus away. The Nile fed Rome; a great river is worth more than its water.
- **Coast** +25,000 — fishing is a protein subsidy that never exhausts the
  soil. Every coastal hex supports fishing hamlets even where farming fails.
- **Game** is folded into the forest/taiga/savanna base numbers: hunting alone
  supports a few hundred people per hex (0.1/sq mi), which is why pure
  wilderness stays empty — game is a garnish, never a granary.

## 2. How far can food travel?

The brutal pre-industrial fact: **an ox eats its own cargo**. Hauling grain
overland doubles its cost every ~100 miles; past 3–4 days' cart (≈ 1 world
hex) it stops being food and becomes a luxury. Water changes everything —
Diocletian's price edict prices sea freight at ~1/60th of land freight per
ton-mile. Hence:

- A city's **cart-shed** is its own hex + neighbors (weight 1.0).
- A city on a river or coast adds a **barge-shed**: every hex reachable along
  the connected waterway (river system + coastline, up to ~40 hexes ≈ 2,400
  mi — Rome's grain fleet sailed 1,300 mi from Alexandria) contributes at
  weight 0.5 (half is lost to cost, spoilage, and the people who live along
  the way).
- A landlocked city is capped by its cart-shed. This is why every historical
  metropolis sits on navigable water, and why Everdeep's do too.

**Urban share:** of everything a foodshed can sustain, at most **~15%** can
live in town (the 5.5:1 farmer ratio). So:

> **city population cap = 0.15 × (cart-shed + 0.5 × barge-shed) capacity**

Worked example — a metropolis of 1,000,000 needs a foodshed sustaining ~6.7M:
impossible from ~7 cart hexes (max ~7 × 550k river-grass ≈ 3.9M even on
perfect land), so a million-soul city REQUIRES a navigable river system
draining a grain belt plus coastal shipping — dozens of contributing hexes.
That is exactly the geography Rome, Chang'an, and Constantinople occupied,
and the generator now PLACES capitals by hunting the richest foodshed in the
kingdom rather than dropping them anywhere pleasant.

## 3. How many farm towns per city?

The surplus doesn't walk to the city by itself. A **market town** of 1–4,000
serves a ~10-mile ring of villages (≈ 300 sq mi), aggregating their grain onto
barges; its ring's surplus feeds roughly **5–10,000 city dwellers**. So a city
of 100k rests on **10–20 market towns** and several hundred villages/hamlets;
a metropolis of 1M on well over a hundred market towns.

Everdeep bakes a **representative sample** — 1 explicit "granary town" per
~250,000 city population (min 1, max 5 per capital), placed on the best food
hexes of the capital's shed and tagged `farm-town` — and leaves the rest to
the ghost-density field, which already crowds the riverbanks and coasts where
those towns would really be. The arithmetic (how many the sample REPRESENTS)
is written into each granary town's page.

## 3b. How close can two big cities stand?

> Owner: "the greatest concentration of food capability should likely have the
> biggest city in a region; if there are ties, multiple big cities can be
> nearby but not closer than 100 miles — if you have sociological data to
> counter that we will follow that!"

The data AGREES with the 100-mile rule for a cart-and-barge economy:

- **Central place theory** (Christaller, 1933): settlements form a nested
  market hierarchy, each tier spaced by the travel range of its hinterland —
  villages a market-day's walk apart (~5–10 mi), market towns ~20–30 mi,
  regional cities ~80–150 mi. Two first-rank centers closer than that split
  one hinterland and one of them starves.
- **Zipf's rank-size law**: within a region the 2nd city runs ~½ the largest,
  the 3rd ~⅓ — big cities are FEW, and the biggest sits on the best resource
  concentration (here: the richest foodshed).
- **The urban shadow effect**: a metropolis suppresses large neighbors;
  history's twin-city exceptions (Buda/Pest, Minneapolis/St Paul) sit
  ADJACENT on a shared river resource, not 50 miles apart — genuine ties in
  food concentration produce paired centers, which the 100-mile rule still
  permits at hex scale.

As implemented: the capital claims the kingdom's richest foodshed
(cart-score → full-shed ranking); any later roll that would clear 50,000
inside 100 miles of an existing 50k+ city is held down to 45,000 — a proud
market town in a great city's shadow. Ties beyond 100 miles stand as rolled.

## 4. Scarcity where nothing grows

Deserts, tundra, snowfields, and high mountains support ~1/90th of what
grassland does. The rules the generator now enforces:

- Baked towns/villages in non-farmable biomes require a waterway (river or
  coast) — food must be able to arrive by barge — and kingdoms whose land is
  mostly barren plant **fewer** settlements overall (want scales with mean
  hex yield).
- Ghost settlements in barren biomes only appear near water, and cap at
  village size — fishing and oasis communities, never inland market towns.
- City population caps are enforced at bake time: if a rolled population
  exceeds the foodshed, it is cut to the cap (and the audit log says so).

## 5. Queued (owner, batch 38) — resources & living generation

- **Strategic & luxury resources** — ✅ SHIPPED (batch 48). `resources.ts` is a
  deterministic per-WORLD-hex field, like the density ghosts: the land carries
  ore, timber, furs, salt, spice, gems, horses, cattle, pearls, dyes, ivory,
  amber… keyed to biome (mountains → iron/gems, grass → horses/cattle, jungle →
  spice/timber/dyes, desert → salt, coast → pearls). ~8.5% of land hexes carry
  one; strategic goods (iron, timber, horses, salt, stone) vs luxuries. Shown
  under a "⛏ resources" legend toggle and in the hex tap-info. STILL QUEUED:
  building/settlement bonuses for proximity, and luxury access feeding
  settlement wealth/size.
- **User-defined & random resource tables** (owner, batch 49): "I will
  eventually like a random resource table or have the ability for users to
  add their own custom resources, and similar to travel, identify whether it
  is a luxury or strategic resource (or both)." The `ResourceDef` shape already
  carries `strategic`/`luxury` booleans (a good may be BOTH — coin metals,
  salt, war-horses), so a custom-resource editor and a roll-your-own table
  slot straight onto the existing field: a user adds `{kind, glyph, label,
  strategic, luxury, aff}` (and optionally an `industry`), and `resourceAt`
  picks it up with no engine change. The classification UI should mirror the
  travel-mode editor (a strategic/luxury/both chooser). Queued, unscheduled.
- **Random generation spawns map changes**: new luxury finds, feeder towns
  sprouting along a new road, items — the world keeps generating after
  creation.
- **Industrial support towns** — ✅ SHIPPED (batch 49). Mining camps under
  mountains, lumber camps in deep forest, quarry towns in the crags, stock
  towns on the grass, salt works on the strand — the non-food analog of farm
  towns, keyed to resources instead of soil. Each kingdom scans its world
  hexes for resources that carry an `industry` (resources.ts), plants up to 3
  small camps (300–3,000 souls) one per industry kind, strategic goods first,
  on the resource hex's OWN terrain (a mine sits in the mountains, not by a
  river). Tagged `industry`/`industry-<kind>`, each page names its trade and
  the resource's class, and the map draws the camp with its trade's tool (⛏ 🪓
  🪨 🐎 🧂). STILL QUEUED: smelter towns where ore meets a navigable river.
- General verisimilitude: seasonal yield swings tied to the calendar, famine
  events when a shed is cut (war painting a border across a river!).

## 5b. Full continental load — Victorian sociology, America-sized continent

> Owner: "a road travelling 1000 miles between two large settlements is not
> realistic, there would need to be more logical stops. what would a full
> continental load at victorian sociology look like on an america-sized
> continent?"

Take the contiguous United States as the yardstick: ~3,000 mi east–west,
~1,500 mi north–south, ~3.1M sq mi. At a mid-Victorian agrarian settlement
density (the ~40–80 persons/sq mi of long-settled farm country, averaged
down to ~40 continent-wide once you fold in mountain, desert, and waste),
a fully-settled continent that size carries **~120 million people** — close
to the real US figure around 1900, which was still filling in.

Christaller's central-place hierarchy then predicts the settlement counts,
each tier spaced by the travel range of the tier below it:

| Tier | Population | Spacing | Count on an America-sized continent |
|---|---|---|---|
| Metropolis | 500k – 1M+ | ~1 per 500k sq mi | **~6** |
| Large city | 50 – 250k | ~1 per 60k sq mi | **~40–60** |
| Market town | 2 – 15k | ~1 per 400 sq mi (a cart-day's hinterland) | **~7,000** |
| Village / hamlet | 100 – 2k | ~1 per 30 sq mi | **~100,000** |

**The road-stop rule is the actionable part.** A traveller on foot or by cart
covers ~20–25 mi/day, so a working trunk road has an inn or waystation every
~15–20 mi and a market town every ~30 mi — there is *never* a 1,000-mile gap
between stops. A 1,000-mile highway threads through **40–60 waystations and
villages**. Everdeep cannot bake 100,000 entities (perf, and the tree would
drown), so the load is split:

- **Baked, explicit**: the ~6 metropolises, ~40 cities, the granary towns, and
  now **waystation hamlets strung along every long road** (batch 43) — one
  roughly every 45 mi where no real settlement already sits, so no trunk road
  runs a day without a place to stop.
- **Ghost density** fills the rest: unwritten hamlets and villages crowd the
  region-zoom map (riverbanks and coasts first), materialising into real pages
  only when the GM touches them. The two together read as a fully-loaded
  continent without a hundred-thousand-row world file.

## 6. The constants (as implemented)

```
FOOD_YIELD (people/world hex): grass 220k · savanna 120k · beach 90k · forest 80k
  hills 45k · jungle 20k · taiga 12k · mountain 5k · desert/tundra 2.5k · snow 0
RIVER_MULT      ×2.5     COAST_BONUS     +25k
CART_RADIUS     1 hex    BARGE_REACH     40 hexes along the connected waterway
BARGE_WEIGHT    0.5      URBAN_SHARE     0.15
GRANARY_PER     250k city pop per baked farm town (1..5 per capital)
CAPITAL SITING  candidate hexes ranked by cart-score, top 25 by full foodshed
```
