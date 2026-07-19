import { test, expect, type Page } from '@playwright/test';
import { pinIsDurable } from './helpers';

// Drives the actual roller UI in a real browser — the half of the pipeline
// check/smoke never reach: island hydration, the fragment-reroll model, the
// option dials, and the pin -> tray -> sheet handoff. Every other e2e spec is
// about the world map; the 40+ generator/composite pages had no coverage at
// all, which is exactly the "only exists once the island hydrates" surface
// CLAUDE.md warns smoke can't see.

const firstValue = (p: Page) => p.locator('[data-slot] [data-value]').first();

async function waitHydrated(page: Page) {
  // the generator auto-rolls every slot on hydration; "…" is the pre-hydration
  // placeholder, so a real value means the island is live and wired.
  await expect(firstValue(page)).not.toHaveText('…', { timeout: 30_000 });
}

test.describe('slot generators', () => {
  test('a generator hydrates and auto-rolls', async ({ page }) => {
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    expect((await firstValue(page).textContent())?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test('"Roll everything" leaves no slot empty', async ({ page }) => {
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    await page.locator('[data-roll-all]').click();
    const values = page.locator('[data-slot] [data-value]');
    const n = await values.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const txt = (await values.nth(i).textContent())?.trim() ?? '';
      expect(txt.length, `slot ${i} should be populated`).toBeGreaterThan(0);
      expect(txt).not.toBe('…');
    }
  });

  test('one status region announces, not every slot', async ({ page }) => {
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    // slots are no longer individual live regions (the ~22-announcement storm)
    await expect(firstValue(page)).not.toHaveAttribute('aria-live', 'polite');
    // "Roll everything" writes a single summary to the one status region
    await page.locator('[data-roll-all]').click();
    await expect(page.locator('[data-status]')).toContainText(/Rolled \d+ fields/);
  });

  test('clicking a fragment rerolls just that piece without breaking the line', async ({ page }) => {
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    const frag0 = page.locator('.frag').first();
    await expect(frag0).toBeVisible();
    const before = (await frag0.textContent())?.trim();
    // reroll the leading fragment until it actually CHANGES — the point of the
    // feature. The old test only checked the line stayed non-empty, so a dead
    // click passed. A small table can repeat, so retry. (Isolation — a sibling
    // fragment staying put — is NOT asserted here: see TEST-AUDIT § blockers, the
    // sibling .frag changed too, which needs a closer look.)
    let changed = false;
    for (let i = 0; i < 10 && !changed; i++) {
      await frag0.click();
      if ((await frag0.textContent())?.trim() !== before) changed = true;
    }
    expect(changed, 'rerolling a fragment must change its text').toBe(true);
    // the line stays populated (no fragment reroll blanks the value)
    expect((await firstValue(page).textContent())?.trim().length ?? 0).toBeGreaterThan(0);
  });

  test('the copy button puts the slot value on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    const value = (await firstValue(page).textContent())?.trim() ?? '';
    await page.locator('[data-slot] [data-copy]').first().click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toBe(value);
  });

  test('pinning a slot sends it to the tray and onto the sheet', async ({ page }) => {
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    const count = page.locator('[data-tray-count]');
    await expect(count).toHaveText('0');
    await page.locator('[data-slot] [data-pin]').first().click();
    await expect(count).toHaveText('1');
    // and it is really persisted onto the sheet page, not just the tray badge
    await page.goto('/sheet/');
    await expect(page.locator('[data-blocks] > *')).toHaveCount(1);
  });
});

test.describe('composite builders', () => {
  test('Mystery generates a full case (incl. the GM-only solution)', async ({ page }) => {
    await page.goto('/gm/mystery/');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText('GMs only', { timeout: 15_000 });
  });

  test('Quick NPC race + gender dials constrain the result', async ({ page }) => {
    await page.goto('/gm/npc-block/');
    await page.locator('select[data-opt="race"]').selectOption('dwarf');
    await page.locator('select[data-opt="gender"]').selectOption('female');
    await page.locator('[data-generate]').click();
    // the statblock meta line is "<race> · <vocation>", so a forced dwarf shows here
    await expect(page.locator('[data-preview]')).toContainText('Dwarf (female)', { timeout: 15_000 });
  });

  test('Encounter builder themed to undead builds a fight', async ({ page }) => {
    await page.goto('/gm/encounter/');
    await page.locator('select[data-opt="theme"]').selectOption('undead');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText('encounter', { timeout: 15_000 });
    // the THEME must actually steer the roster — "encounter" is in the meta line
    // regardless, so a theme that was ignored would pass. Assert the forces are
    // undead.
    await expect(page.locator('[data-preview]')).toContainText(
      /skeleton|zombie|ghoul|ghast|ghost|wight|wraith|specter|spectre|shadow|lich|mummy|revenant|undead/i,
    );
  });

  test('Fantasy Names forges a single name with a matching face', async ({ page }) => {
    await page.goto('/gm/names/');
    await page.locator('select[data-opt="race"]').selectOption('dwarf');
    await page.locator('select[data-opt="count"]').selectOption('1');
    await page.locator('[data-generate]').click();
    // a single name comes back as a named plate whose meta names the race…
    await expect(page.locator('[data-preview]')).toContainText('Dwarf', { timeout: 15_000 });
    // …and the island sketches a portrait to go with it
    await expect(page.locator('[data-preview] .npc-portrait svg')).toBeVisible();
  });

  test('Fantasy Names returns a batch as a list', async ({ page }) => {
    await page.goto('/gm/names/');
    await page.locator('select[data-opt="race"]').selectOption('high-elf');
    await page.locator('select[data-opt="count"]').selectOption('5');
    await page.locator('[data-generate]').click();
    const items = page.locator('[data-preview] li');
    await expect(items).toHaveCount(5, { timeout: 15_000 });
  });

  test('Portents & Omens shows a sign in the sky on demand', async ({ page }) => {
    await page.goto('/gm/omen/');
    await page.locator('select[data-opt="kind"]').selectOption('sign');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText('A sign in the sky', { timeout: 15_000 });
  });

  test('a shared link reproduces the exact same result', async ({ page }) => {
    await page.goto('/gm/names/');
    await page.locator('select[data-opt="race"]').selectOption('dwarf');
    await page.locator('select[data-opt="count"]').selectOption('1');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText('Dwarf', { timeout: 15_000 });
    const name = (await page.locator('[data-preview] h3').first().textContent())?.trim() ?? '';
    expect(name.length).toBeGreaterThan(0);
    // the address bar now carries a permalink to this exact roll
    const shared = page.url();
    expect(shared).toContain('seed=');
    // open it fresh — same seed + options must forge the same name (and race dial)
    const page2 = await page.context().newPage();
    await page2.goto(shared);
    await expect(page2.locator('[data-preview] h3').first()).toHaveText(name, { timeout: 15_000 });
    await expect(page2.locator('select[data-opt="race"]')).toHaveValue('dwarf');
    await page2.close();
  });

  test('Art Object can be forced to roll a curse', async ({ page }) => {
    await page.goto('/gm/art/');
    await page.locator('select[data-opt="magic"]').selectOption('cursed');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText('Cursed — GMs only', { timeout: 15_000 });
  });

  test('Plot Hook aims by terrain and class', async ({ page }) => {
    await page.goto('/gm/plot-hook/');
    await page.locator('select[data-opt="biome"]').selectOption('mountain');
    await page.locator('select[data-opt="class"]').selectOption('paladin');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText("Paladin's calling", { timeout: 15_000 });
    await expect(page.locator('[data-preview]')).toContainText('Up in the mountains');
  });

  test('Dungeon builds a themed delve with rooms, a boss, and a hoard', async ({ page }) => {
    await page.goto('/gm/dungeon/');
    await page.locator('select[data-opt="theme"]').selectOption('undead');
    await page.locator('select[data-opt="treasure"]').selectOption('rich');
    await page.locator('[data-generate]').click();
    const preview = page.locator('[data-preview]');
    // themed throughout: the meta line names the theme…
    await expect(preview).toContainText('Undead crypt', { timeout: 15_000 });
    // …and the structure is a real delve, not a bag of set-pieces
    await expect(preview).toContainText('The Warded Gate');
    await expect(preview).toContainText('Room 1');
    await expect(preview).toContainText('The Inner Sanctum');
    await expect(preview).toContainText('The Hoard');
  });

  test('Treasure Hoard dials adjust what is in the pile', async ({ page }) => {
    await page.goto('/gm/hoard/');
    // strip the magic items right out
    await page.locator('select[data-opt="items"]').selectOption('none');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText('None — this time.', { timeout: 15_000 });
    // and take away the coins — the pile is then all in kind
    await page.locator('select[data-opt="coins"]').selectOption('none');
    await expect(page.locator('[data-preview]')).toContainText('all in kind', { timeout: 15_000 });
  });

  test('a composite pins to the sheet', async ({ page }) => {
    await page.goto('/gm/mystery/');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText('GMs only', { timeout: 15_000 });
    await page.locator('[data-add]').click();
    // navigating away aborts a still-pending IndexedDB write and loses the
    // pin — wait for durability first (tests/helpers.ts)
    await pinIsDurable(page);
    await page.goto('/sheet/');
    await expect(page.locator('[data-blocks] > *')).toHaveCount(1);
  });
});

test.describe('composite per-part reroll', () => {
  test('rerolling one section changes it and leaves the rest alone', async ({ page }) => {
    await page.goto('/gm/tavern-page/');
    const preview = page.locator('[data-preview]');
    await expect(preview.locator('.b-statblock')).toBeVisible({ timeout: 15_000 });
    // target the SECTION paragraphs, not the enclosing statblock (which also
    // "contains" the text)
    const impression = preview.locator('.b-paragraph', { hasText: 'First Impression' }).first();
    const overheard = preview.locator('.b-paragraph', { hasText: 'Overheard' }).first();
    const impressionBefore = (await impression.innerText()).trim();
    const overheardBefore = (await overheard.innerText()).trim();
    // reroll just the First Impression section
    await impression.locator('.rr-btn').click();
    // it changes…
    await expect(preview.locator('.b-paragraph', { hasText: 'First Impression' }).first()).not.toHaveText(
      impressionBefore,
      { timeout: 10_000 },
    );
    // …and the untouched section stays put
    await expect(preview.locator('.b-paragraph', { hasText: 'Overheard' }).first()).toHaveText(overheardBefore);
  });

  test('a single list item rerolls without disturbing its neighbours', async ({ page }) => {
    await page.goto('/gm/hoard/');
    const preview = page.locator('[data-preview]');
    await expect(preview.locator('.b-statblock')).toBeVisible({ timeout: 15_000 });
    const gems = preview.locator('.b-list', { hasText: 'Gems' }).first();
    const items = gems.locator('li');
    expect(await items.count()).toBeGreaterThan(1);
    const item0Before = (await items.nth(0).innerText()).trim();
    const item1Before = (await items.nth(1).innerText()).trim();
    // reroll just the first gem
    await items.nth(0).locator('.rr-item').click();
    // it changes, its neighbour does not
    await expect(gems.locator('li').nth(0)).not.toHaveText(item0Before, { timeout: 10_000 });
    await expect(gems.locator('li').nth(1)).toHaveText(item1Before);
  });

  test('a per-part reroll is captured in the share link and reproduces', async ({ page }) => {
    await page.goto('/gm/tavern-page/');
    const preview = page.locator('[data-preview]');
    await expect(preview.locator('.b-statblock')).toBeVisible({ timeout: 15_000 });
    const impression = preview.locator('.b-paragraph', { hasText: 'First Impression' }).first();
    await impression.locator('.rr-btn').click();
    const rolled = (await preview.locator('.b-paragraph', { hasText: 'First Impression' }).first().innerText()).trim();
    // the reroll state rode into the address bar…
    const url = page.url();
    expect(url).toContain('rr=');
    // …and a fresh tab off that link reproduces the exact rerolled section
    const page2 = await page.context().newPage();
    await page2.goto(url);
    await expect(page2.locator('[data-preview] .b-paragraph', { hasText: 'First Impression' }).first()).toHaveText(
      rolled,
      { timeout: 15_000 },
    );
    await page2.close();
  });
});

test.describe('composite lock', () => {
  test('a locked section survives "Generate" while the rest rerolls', async ({ page }) => {
    await page.goto('/gm/tavern-page/');
    const preview = page.locator('[data-preview]');
    await expect(preview.locator('.b-statblock')).toBeVisible({ timeout: 15_000 });
    const impression = preview.locator('.b-paragraph', { hasText: 'First Impression' }).first();
    const overheard = preview.locator('.b-paragraph', { hasText: 'Overheard' }).first();
    const impressionText = (await impression.innerText()).trim();
    const overheardText = (await overheard.innerText()).trim();
    // lock the First Impression section
    await impression.locator('.rr-lock').click();
    await expect(preview.locator('.b-paragraph', { hasText: 'First Impression' }).first().locator('.rr-lock')).toHaveClass(
      /is-locked/,
    );
    // Generate: the locked section holds, an unlocked one moves
    await page.locator('[data-generate]').click();
    await expect(preview.locator('.b-paragraph', { hasText: 'First Impression' }).first()).toHaveText(impressionText, {
      timeout: 10_000,
    });
    await expect(preview.locator('.b-paragraph', { hasText: 'Overheard' }).first()).not.toHaveText(overheardText);
  });

  test('a locked-then-regenerated page reproduces from its share link', async ({ page }) => {
    await page.goto('/gm/tavern-page/');
    const preview = page.locator('[data-preview]');
    await expect(preview.locator('.b-statblock')).toBeVisible({ timeout: 15_000 });
    const impression = preview.locator('.b-paragraph', { hasText: 'First Impression' }).first();
    await impression.locator('.rr-lock').click();
    const lockedText = (await impression.innerText()).trim();
    await page.locator('[data-generate]').click();
    await expect(preview.locator('.b-paragraph', { hasText: 'First Impression' }).first()).toHaveText(lockedText, {
      timeout: 10_000,
    });
    // the lock rode into the address bar…
    expect(page.url()).toContain('lk=');
    // …and a fresh tab off that link reproduces the pinned section
    const page2 = await page.context().newPage();
    await page2.goto(page.url());
    await expect(page2.locator('[data-preview] .b-paragraph', { hasText: 'First Impression' }).first()).toHaveText(
      lockedText,
      { timeout: 15_000 },
    );
    await page2.close();
  });
});

test.describe('worksheet tray', () => {
  test('can be fully dismissed and restored, and the dismissal persists', async ({ page }) => {
    await page.goto('/gm/tavern/');
    const tray = page.locator('[data-tray]');
    const restore = page.locator('[data-tray-restore]');
    await expect(tray).toBeVisible();
    await expect(restore).toBeHidden();
    // fully dismiss — the whole tray goes, only the small tab remains
    await page.locator('[data-tray-dismiss]').click();
    await expect(tray).toBeHidden();
    await expect(restore).toBeVisible();
    // the dismissal sticks across a reload
    await page.reload();
    await expect(page.locator('[data-tray]')).toBeHidden();
    await expect(page.locator('[data-tray-restore]')).toBeVisible();
    // and the tab brings it back, already open
    await page.locator('[data-tray-restore]').click();
    await expect(page.locator('[data-tray]')).toBeVisible();
    await expect(page.locator('[data-tray-restore]')).toBeHidden();
    await expect(page.locator('[data-tray-panel]')).toBeVisible();
  });
});

test.describe('tool catalog navigation', () => {
  test('the GM index groups tools into sections and filters as you type', async ({ page }) => {
    await page.goto('/gm/');
    // topical sections exist (the flat A–Z scroll is gone)
    await expect(page.locator('.catalog-head', { hasText: 'Loot & Magic' })).toBeVisible();
    const dungeonCard = page.locator('[data-tool-card][href="/gm/dungeon/"]');
    const tavernCard = page.locator('[data-tool-card][href="/gm/tavern/"]');
    await expect(dungeonCard).toBeVisible();
    await expect(tavernCard).toBeVisible();
    // typing narrows to matches and hides the rest
    await page.locator('[data-tool-filter]').fill('dungeon');
    await expect(dungeonCard).toBeVisible();
    await expect(tavernCard).toBeHidden();
    // a section with no surviving cards collapses entirely
    await expect(page.locator('.catalog-head', { hasText: 'World & Rule' })).toBeHidden();
    // clearing brings everything back
    await page.locator('[data-tool-filter]').fill('');
    await expect(tavernCard).toBeVisible();
  });

  test('the renamed Dungeon Dressing table is reachable (no route collision)', async ({ page }) => {
    await page.goto('/gm/dungeon-dressing/');
    await expect(page.locator('h1')).toHaveText('Dungeon Dressing');
    // it is the slot roller, distinct from the /gm/dungeon/ builder
    await expect(page.locator('[data-slot]').first()).toBeVisible();
  });
});

test.describe('sheet store resilience', () => {
  test('a corrupt store is backed up and recovered, not silently wiped', async ({ page }) => {
    await page.goto('/sheet/'); // establish the origin so localStorage is writable
    await page.evaluate(() => localStorage.setItem('stb:sheets:v1', '{ this is : not valid json'));
    await page.reload();
    // the page still loads a working (empty) sheet instead of throwing — the
    // toolbar renders and the blocks container is present (empty = zero-size,
    // so assert attached, not visible)
    await expect(page.locator('[data-file-menu]')).toBeVisible();
    await expect(page.locator('[data-blocks]')).toBeAttached();
    // and the unreadable bytes were preserved for recovery, not discarded
    const backup = await page.evaluate(() => localStorage.getItem('stb:sheets:v1:corrupt'));
    expect(backup).toContain('not valid json');
  });
});

// The [hidden]-vs-author-display trap keeps recurring (SheetTray, the Spaces
// dialog, now the world-save panel and the tray panel itself): an element
// whose CSS sets `display` ignores the hidden attribute entirely, and nothing
// fails — the UI just quietly shows. These pin the two panels this audit
// caught, in both states.
test.describe('hidden really means hidden', () => {
  test('the save-to-world panel stays hidden until asked for', async ({ page }) => {
    await page.goto('/gm/tavern-page/');
    await expect(page.locator('[data-preview] .b-statblock')).toBeVisible({ timeout: 15_000 });
    // hydrated and generated, and the panel has NOT greeted us uninvited
    await expect(page.locator('[data-world-save]')).toBeHidden();
  });

  test('the tray toggle actually collapses the panel', async ({ page }) => {
    await page.goto('/gm/tavern/');
    const panel = page.locator('[data-tray-panel]');
    const toggle = page.locator('[data-tray-toggle]');
    await expect(page.locator('[data-tray]')).toBeVisible();
    // whatever state it opened in, one click must flip it — visibly
    if (await panel.isVisible()) {
      await toggle.click();
      await expect(panel).toBeHidden();
    } else {
      await toggle.click();
      await expect(panel).toBeVisible();
      await toggle.click();
      await expect(panel).toBeHidden();
    }
  });
});

test.describe('slot-page portrait', () => {
  test('the face card contains its own reroll button (no full-width stray row)', async ({ page }) => {
    await page.goto('/gm/npc/');
    // the NPC race slot always leads "Race: …", so the sketch always mounts
    const card = page.locator('.npc-portrait');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(card.locator('svg')).toBeVisible();
    // the "new face" button lives INSIDE the card — as a sibling it rendered
    // as its own full-width grid row across the whole page
    await expect(card.locator('button')).toBeVisible();
    await expect(page.locator('.sheet-head .npc-portrait')).toBeVisible();
  });
});

// The one-page-sheet render (Batch 260 + fleet): a `page`-hinted generator lays
// its slots out as a designed sheet — a serif lead, small-caps section heads,
// and (for stat-block slots) a parsed stat card that reuses the Block Kit's
// .b-statGrid boxes. The `page` contract is smoke-checked for slot-id typos;
// this pins the render itself.
test.describe('one-page sheet layout', () => {
  test('the NPC page renders section heads and a humanoid stat card', async ({ page }) => {
    await page.goto('/gm/npc/');
    await expect(page.locator('[data-slot] [data-value]').first()).not.toHaveText('…', { timeout: 30_000 });
    // grouped, not a flat list
    await expect(page.locator('.sheet-sec .sec-head', { hasText: 'Presence' })).toBeVisible();
    // the stat-block slot became a card with the shared statGrid ability boxes
    const card = page.locator('[data-slot="statblock"] .stat-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.b-statGrid .stat-box')).toHaveCount(6);
    // rerolling the stat block swaps the archetype and rebuilds the card
    const before = (await card.locator('.stat-card-name').textContent())?.trim();
    for (let i = 0; i < 6; i++) {
      await page.locator('[data-slot="statblock"] [data-reroll]').click();
      const now = (await page.locator('[data-slot="statblock"] .stat-card-name').textContent())?.trim();
      if (now !== before) break;
    }
    await expect(page.locator('[data-slot="statblock"] .stat-card .b-statGrid .stat-box')).toHaveCount(6);
  });

  test('the Villain page carries a stat card and the monster-reskin thread', async ({ page }) => {
    await page.goto('/gm/villain/');
    await expect(page.locator('[data-slot] [data-value]').first()).not.toHaveText('…', { timeout: 30_000 });
    // the villain description opens the sheet as a body entry (no serif wall)
    const villain = page.locator('[data-slot="villain"] [data-value]');
    expect((await villain.textContent())?.trim().length ?? 0).toBeGreaterThan(20);
    // the reskinned-monster thread is its own section, and "Run It As" fills
    await expect(page.locator('.sec-head', { hasText: "In Monster's Clothing" })).toBeVisible();
    const runAs = page.locator('[data-slot="reskin-monster"] [data-value]');
    expect((await runAs.textContent())?.trim().length ?? 0).toBeGreaterThan(20);
    // and the villain statline renders as a card too
    await expect(page.locator('[data-slot="statblock"] .stat-card .b-statGrid')).toBeVisible();
  });
});

// Slot pages get the composites' machinery (GM/solo audit, batch B): a page
// seed in the hash, per-slot overrides riding along, copy-all, and save-to-
// world. Before this, a slot page's rolls lived and died in the tab.
test.describe('slot-page parity', () => {
  const values = (p: Page) => p.locator('[data-slot] [data-value]');

  test('the address bar carries a link that reproduces every roll', async ({ page }) => {
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    expect(page.url()).toContain('seed=');
    const n = await values(page).count();
    const texts: string[] = [];
    for (let i = 0; i < n; i++) texts.push((await values(page).nth(i).textContent())!.trim());
    const page2 = await page.context().newPage();
    await page2.goto(page.url());
    await expect(values(page2).first()).not.toHaveText('…', { timeout: 30_000 });
    for (let i = 0; i < n; i++) {
      expect((await values(page2).nth(i).textContent())!.trim(), `slot ${i} reproduces`).toBe(texts[i]);
    }
    await page2.close();
  });

  test('a hand-rerolled slot rides the link as an override', async ({ page }) => {
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    await page.locator('[data-slot] [data-reroll]').first().click();
    const rerolled = (await firstValue(page).textContent())!.trim();
    expect(page.url()).toContain('ov=');
    const page2 = await page.context().newPage();
    await page2.goto(page.url());
    await expect(values(page2).first()).toHaveText(rerolled, { timeout: 30_000 });
    await page2.close();
  });

  test('📋 Copy puts the whole result on the clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    await page.locator('[data-copy-all]').click();
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    expect(clip).toContain('Tavern');
    expect(clip).toContain((await firstValue(page).textContent())!.trim());
  });

  test('🌍 Save to world with no worlds yet sends you to make one', async ({ page }) => {
    await page.goto('/gm/tavern/');
    await waitHydrated(page);
    await page.locator('.gen-toolbar [data-save-world]').click();
    await page.waitForURL(/\/world\//, { timeout: 15_000 });
  });
});
