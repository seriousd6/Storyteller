# Documentation index

One line per doc: what it owns, and whether it's **living** (kept current) or
**historical** (accurate when written; superseded by
[ROADMAP.md](../ROADMAP.md) and `git log`). Add new docs here in the same
commit that creates them.

## Root

| Doc | Status | What it owns |
|---|---|---|
| [README.md](../README.md) | living | Public face: what the site is, how to develop |
| [ROADMAP.md](../ROADMAP.md) | living | **Start here** — current state, Now / Next / Later |
| [DECISIONS.md](../DECISIONS.md) | living | Pending owner calls, with context to decide fast |
| [CLAUDE.md](../CLAUDE.md) | living | Agent working agreements: worktrees, the gate, Earth rules |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | living | How outsiders add tables/generators (data-first) |
| [OVERHAUL.md](../OVERHAUL.md) | historical | The 2026-07-11 v1→v2 rebuild plan (Phases 0–7, complete); still the reference for the OAuth/Pages owner steps |
| LICENSE-SRD.md | living | SRD 5.1 license text (CC-BY-4.0 attribution) |

## docs/

| Doc | Status | What it owns |
|---|---|---|
| [LAUNCH.md](LAUNCH.md) | living | The go-public checklist |
| [PITFALLS.md](PITFALLS.md) | living | Recurring bug classes + hard-won rules |
| [TEST-AUDIT.md](TEST-AUDIT.md) | historical | 2026-07-18 full-suite audit (closed B274); the deferred-fix list at the end is still live |
| [CAMPAIGN-CODEX.md](CAMPAIGN-CODEX.md) | living | World-wiki + 5e-sheet + spellbook epic; Phase C (unified search) still open |

## docs/sheets/

| Doc | Status | What it owns |
|---|---|---|
| [PLAN.md](sheets/PLAN.md) | living | Sheet Builder 2.0 contract (phases 0–5 complete) |
| [GENERATORS-AS-ONEPAGERS.md](sheets/GENERATORS-AS-ONEPAGERS.md) | living | Roller pages as one-page sheets; §4 route retirement pending ([DECISIONS.md](../DECISIONS.md) #5) |

## docs/everdeep/ — the world/map subsystem

| Doc | Status | What it owns |
|---|---|---|
| [PLAN.md](everdeep/PLAN.md) | living | Master end-to-end plan for the "true v2" world tool |
| [CONTRACTS.md](everdeep/CONTRACTS.md) | **binding** | Frozen compatibility contracts: ids from seed paths, determinism |
| [ARCHITECTURE.md](everdeep/ARCHITECTURE.md) | living | System design for the world tool |
| [MAPS.md](everdeep/MAPS.md) | living | Hex-map four-tier design |
| [FLAGSHIP-EARTH.md](everdeep/FLAGSHIP-EARTH.md) | living | The Real-Earth flagship world design |
| [GEOGRAPHY.md](everdeep/GEOGRAPHY.md) | historical | Biome/geography realism investigation (batch 53) |
| [HYDRO.md](everdeep/HYDRO.md) | historical | River/lake validation vs real Earth (batch 67) |
| [FOOD.md](everdeep/FOOD.md) | historical | Foodshed investigation (batch 38) |
| [PERF.md](everdeep/PERF.md) | historical | Performance review #1 (2026-07-14); later perf work landed in B266/B271 |
| [GENERATORS-REVIEW.md](everdeep/GENERATORS-REVIEW.md) | historical | Full roll-table review (task 34) |
| [SCENARIOS.md](everdeep/SCENARIOS.md) | historical | Ten prep-workflow scenario walks (Phase 0) |
| [SURVEY.md](everdeep/SURVEY.md) | historical | Competitive TTRPG-tool survey |

## v2/

| Doc | Status | What it owns |
|---|---|---|
| [README.md](../v2/README.md) | living | Dev quickstart for the app |
| [CONTENT.md](../v2/CONTENT.md) | living | Content authoring rules, template syntax, per-pass records |
| [ROLLER-REVIEW.md](../v2/ROLLER-REVIEW.md) | historical | Adversarial roller review (2026-07-16) |
