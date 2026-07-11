# Contributing to Storyteller Toolbox

The site is **data-first**: almost every generator is powered by JSON tables, so
the most valuable contribution — adding or improving content — needs no framework
knowledge. All the app code lives in [`v2/`](v2/); the legacy site is archived in
[`v1/`](v1/) and is not accepted for changes.

## Add or improve a table (no build knowledge needed)

Tables live under `v2/src/data/<pillar>/<group>/<name>.json`, where `<pillar>` is
`gm`, `solo`, or `writing`. A table looks like this:

```json
{
  "id": "gm/tavern/name-adjective",
  "title": "Tavern Name Adjective",
  "pillar": "gm",
  "description": "Optional one-line summary.",
  "tags": ["fantasy"],
  "credits": [{ "source": "r/BehindTheTables", "url": "https://…" }],
  "entries": ["Rusty", "Gilded", { "text": "Weeping", "weight": 2, "tags": ["horror"] }]
}
```

Rules of the road:

- **`id` must equal the file path** under `src/data/` (minus `.json`). Lowercase,
  hyphen-separated segments only.
- **Entries** are plain strings, or objects with `text` + optional `weight`
  (relative, default 1) and `tags`.
- **Genre is a tag, never a folder.** Add `"horror"`, `"sci-fi"`, `"western"` to
  entries or the table — don't duplicate a directory tree.
- **Preserve credit.** If content comes from the community (r/d100,
  r/BehindTheTables, DnDSpeak, etc.), keep it in `credits`.
- **Reference other tables** with `{table:<id>}`; see
  [`v2/CONTENT.md`](v2/CONTENT.md) for the full template syntax
  (`{table:id#tag}`, `{pick:a|b}`, `{num:a-b}`, `{count:a-b}`, `{var:n}`).

Then validate:

```sh
cd v2
npm install        # first time only
npm run validate   # schema + reference + token checks
```

Green means your table is wired correctly. Open a PR — data-only changes are the
easiest to review.

## Provenance

Only contribute content that is community-authored, original, or that you have the
right to share. **Do not transcribe published rulebooks.** Companion tools for
commercial games (e.g. Colostle) ship the community/original *roll-table rows*
only and link players to buy the book — rulebook prose stays out.

## Change code or add a generator

- **Slot generators** are pure JSON: add `v2/src/generators/<tool>.json` with a
  list of slots (each an `{table:…}` template). It auto-routes under its pillar.
- **Composite generators** (real logic — XP budgets, tiered hoards, character
  builders) are TypeScript in `v2/src/composites/<tool>.ts`, exporting `meta` and
  a pure, seed-deterministic `build()`.

Before pushing:

```sh
cd v2
npm run validate   # data
npm run smoke      # determinism + per-slot coverage + every composite builds
npm run check      # TypeScript / Astro
npm run build      # full static build
```

See [`OVERHAUL.md`](OVERHAUL.md) for the architecture and roadmap.
