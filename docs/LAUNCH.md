# Launch checklist — from polished-and-private to public-and-findable

The product loop is strong and the demo is still effectively private. This
list is the gap between "built" and "reaching the site's goals": people using
it. Work top to bottom; 👤 = owner-only. Check items off in this file as they
land.

## 1. Flip the remaining switches 👤

- [ ] Confirm repo **Settings → Pages → Source = "GitHub Actions"** and that
      DNS still points at GitHub Pages ([DECISIONS.md](../DECISIONS.md) #1 —
      likely already done since deploys serve; confirm and close it).
- [ ] Take the Google OAuth consent screen out of Testing mode so Drive
      backup works for everyone without the unverified-app warning — exact
      click-path in [OVERHAUL.md](../OVERHAUL.md) "Open decisions" #4.
      (~15 min, no Google review needed.)

## 2. Make the site findable (agent-executable)

- [ ] **404 page** — none exists. Add `v2/src/pages/404.astro` (GitHub Pages
      serves `404.html` automatically).
- [ ] **Sitemap** — add `@astrojs/sitemap` (`site` is already set in
      `astro.config.mjs`); reference it from `v2/public/robots.txt`.
- [ ] **Meta audit** — per-page `<title>` / description / canonical / og tags
      on the landing pages and top tools (`og-image.svg` exists — verify it's
      actually wired into page heads).
- [ ] **Lighthouse pass** on `/`, `/sheet/`, `/world/`, and one roller page —
      fix what's cheap, file the rest in [ROADMAP.md](../ROADMAP.md).
- [ ] **Search Console** 👤 — verify storytellertoolbox.com, submit the
      sitemap.

## 3. Learn what users do

- [ ] **Analytics** — blocked on [DECISIONS.md](../DECISIONS.md) #3
      (privacy-friendly, cookieless; update `/privacy/` in the same change).
- [ ] **Feedback channel** — blocked on DECISIONS.md #4; then a footer link
      on every page (today the only path is a Reddit DM line in the README).

## 4. Dress rehearsal

- [ ] **Print a real prep sheet** end-to-end and use it at a table — the
      OVERHAUL Phase 2 exit criterion that was never formally checked
      (DECISIONS.md #8).
- [ ] **Phone pass** on the landing pages and top 5 tools (B259 covered the
      GM/solo tool lane; the landings haven't had a dedicated pass).

## 5. Announce 👤

- [ ] Decide Earth-2026 demo publicity (DECISIONS.md #7).
- [ ] Post where the content came from — r/d100, r/BehindTheTables,
      r/DnDBehindTheScreen, r/Solo_Roleplaying, r/worldbuilding —
      credit-first framing: "your tables, now live and composable" (the
      README credits already set this tone).
- [ ] Afterward: watch analytics + feedback for a week; feed what you learn
      into [ROADMAP.md](../ROADMAP.md) priorities.
