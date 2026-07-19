# Owner decision queue

Calls only the owner can make, each with enough context to decide in minutes.
When decided: act on it (or file the work in [ROADMAP.md](ROADMAP.md)), record
the outcome in the linked doc, and DELETE the entry. Agents: don't re-ask
these mid-session — point the owner here.

## Infrastructure

1. **Confirm the Pages deploy source.** [OVERHAUL.md](OVERHAUL.md) lists
   "Settings → Pages → Source = GitHub Actions" as never flipped, but Actions
   deploys appear to serve the live site. Confirm in repo settings, then
   delete this entry.
2. **Publish the Google OAuth app** (take the consent screen out of Testing
   mode) so Drive backup has no 100-user cap and no unverified-app warning.
   Exact click-path: OVERHAUL.md "Open decisions" #4. ~15 min; no Google
   review needed (`drive.file` is non-sensitive).
3. **Pick analytics**: GoatCounter (free, no cookies) vs Plausible (~$9/mo,
   nicer dashboards) vs none-for-now. Unblocks
   [docs/LAUNCH.md](docs/LAUNCH.md) §3; an agent wires it same-day once
   picked (and updates `/privacy/` in the same change).
4. **Pick the feedback channel**: GitHub Issues (public, zero setup) vs a
   dedicated email vs a form. Unblocks the footer link in LAUNCH §3 —
   today the only path to you is a Reddit DM line in the README.

## Product

5. **§4 route retirement** — for generators that exist both as a slot page
   and a `-page` composite: retire one, or bless both as different tools
   (your earlier lean: they ARE different tools). Detail:
   [docs/sheets/GENERATORS-AS-ONEPAGERS.md](docs/sheets/GENERATORS-AS-ONEPAGERS.md) §4/§7.
6. **`table` block label** — the label renders nowhere on screen (it survives
   in the model and Markdown export). Render it (a few lines, mirroring
   `list`/`keyValue`) or declare the hiding intentional. Detail: end of
   [docs/TEST-AUDIT.md](docs/TEST-AUDIT.md), open question 7.
7. **When does Earth-2026 go public?** Only you have seen it. While it stays
   private, content-moving fixes can land freely; once it's shared or
   announced (LAUNCH §5), world changes need more care. Say when.
8. **OVERHAUL Phase 1–2 exit criteria were never formally judged**: are the
   v2 tools better than v1 on desktop and phone? Print one real prep sheet
   and use it at a table (LAUNCH §4 carries this as the dress rehearsal).
9. **Map art direction for the Worldcraft ink pass**: stay procedural
   (hand-rolled ink strokes — matches the site's identity, zero assets,
   deterministic; recommended and assumed by the plan) vs introduce a
   sprite/asset layer (richer look possible, but a whole new subsystem:
   pipeline, loading, licensing). Only gates Lane K-2+ (city/burrow art);
   K-1 terrain fixes proceed either way. Detail:
   [docs/everdeep/WORLDCRAFT.md](docs/everdeep/WORLDCRAFT.md) §3.
