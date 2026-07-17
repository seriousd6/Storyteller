import { test, expect, type Page } from '@playwright/test';

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
    await expect(page.locator('.frag').first()).toBeVisible();
    // reroll the leading fragment a few times; the line must stay populated
    for (let i = 0; i < 4; i++) await page.locator('.frag').first().click();
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

  test('a composite pins to the sheet', async ({ page }) => {
    await page.goto('/gm/mystery/');
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-preview]')).toContainText('GMs only', { timeout: 15_000 });
    await page.locator('[data-add]').click();
    await page.goto('/sheet/');
    await expect(page.locator('[data-blocks] > *')).toHaveCount(1);
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
    await expect(page.locator('[data-new]')).toBeVisible();
    await expect(page.locator('[data-blocks]')).toBeAttached();
    // and the unreadable bytes were preserved for recovery, not discarded
    const backup = await page.evaluate(() => localStorage.getItem('stb:sheets:v1:corrupt'));
    expect(backup).toContain('not valid json');
  });
});
