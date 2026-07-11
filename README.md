# Storyteller Toolbox

A storytelling hub for game masters, solo players, and writers, live at
**[storytellertoolbox.com](https://storytellertoolbox.com)**. Roll on hundreds of
tables, combine the results into a printable prep sheet, and refine them at the
table: the site's loop is *generate → combine → refine → print*.

Three pillars, one engine, one design system:

- **GM Prep** — taverns, loot, NPCs, magic systems, governments, adventures,
  villains, encounters (real 5e XP math), treasure hoards, and more
- **Solo Play** — a generic yes/no oracle and Colostle companion tools
- **Writing** — prompts, timed challenges, and unblockers

Everything can be pinned to the **Sheet Builder**: a TTRPG-style page you compose
à la carte from any generator's output, edit inline, reorder, and print or export
to Markdown. Sheets persist in your browser — no account, no backend.

## Structure

| Path | What |
|---|---|
| [`v2/`](v2/) | The current site — an Astro + TypeScript app; **80,000+ table entries** as schema-validated JSON. See [`v2/README.md`](v2/README.md). |
| [`v1/`](v1/) | The original jQuery site, archived for history. Not maintained. |
| [`OVERHAUL.md`](OVERHAUL.md) | The rebuild plan, architecture, and phase-by-phase status. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to add tables and generators — data-only contributions are easy. |

## Develop

```sh
cd v2
npm install
npm run dev      # local dev server
npm run build    # static build to dist/
```

Deployed to GitHub Pages by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)
on every push to `main` that touches `v2/`.

## Credits

The vast majority of GM content comes from the D&D community — r/d100,
r/BehindTheTables, r/DnDBehindTheScreen, and DnDSpeak. Credit for the creativity
goes to them; this project makes their tables live and composable. Character names
originate from fantasynamegenerator.com. Colostle is © Nich Angell — its companion
tools here hold community/original tables only and require the rulebook to play.

Have an idea? Message [u/seriousd6](https://www.reddit.com/user/seriousd6/) on Reddit.
