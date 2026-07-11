# Storyteller Toolbox v2

The rebuild of [storytellertoolbox.com](https://storytellertoolbox.com). See
[`../OVERHAUL.md`](../OVERHAUL.md) for the full plan and phase status.

## Develop

```sh
npm install
npm run dev      # local dev server
npm run build    # static build to dist/
npm run check    # type-check .astro files
```

Requires Node 20.3+ (developed on Node 24 LTS).

## Layout

| Path | Purpose |
|---|---|
| `src/pages/` | One route per page; pillar landing pages live in `gm/`, `solo/`, `writing/` |
| `src/layouts/Base.astro` | Site shell: header, nav, theme toggle, footer |
| `src/styles/tokens.css` | Design tokens — all colors/type/spacing come from here |
| `src/engine/` | (Phase 1) the generator engine: seeded rolls, weights, template composition |
| `src/data/` | (Phase 3+) schema-validated JSON tables migrated from `../v1` |
| `schemas/` | JSON Schemas for tables and sheet blocks |

## Rules of the road

- Generators emit **typed blocks** (see `schemas/block.schema.json`), never HTML strings.
- Table data is JSON validated against `schemas/table.schema.json`; genre is a **tag**, not a folder.
- Preserve community credits on every migrated table.
