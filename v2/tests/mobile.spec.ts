import { test, expect } from '@playwright/test';

// The mobile pass (GM/solo audit batch F): at phone widths the answer must
// sit on the first screen, not below a wall of six wrapped buttons. The
// toolbar collapses to ask + 🎲 + ⚙️; dials and secondary tools open on ⚙️
// (a CSS-only checkbox — works before hydration). Desktop is untouched:
// every other spec in the suite clicks those buttons at the default
// viewport, so a desktop regression fails loudly elsewhere.

test.use({ viewport: { width: 390, height: 844 } });

test('phone: the oracle answers on the first screen, tools behind ⚙️', async ({ page }) => {
  await page.goto('/solo/oracle/');
  await expect(page.locator('[data-preview] .b-statblock')).toBeVisible({ timeout: 30_000 });

  // collapsed: no dials, no secondary buttons
  await expect(page.locator('[data-copy]')).toBeHidden();
  await expect(page.locator('[data-opt="likelihood"]')).toBeHidden();

  // the answer card starts inside the first viewport
  const card = await page.locator('[data-preview] .b-statblock').boundingBox();
  expect(card!.y).toBeLessThan(700);

  // 🎲 still generates (a fresh seed lands in the hash)
  const before = page.url();
  await page.locator('[data-generate]').click();
  await expect(page).not.toHaveURL(before);

  // ⚙️ opens the dials and the tools — and they work
  await page.locator('[data-more]').click();
  await expect(page.locator('[data-opt="likelihood"]')).toBeVisible();
  await expect(page.locator('[data-copy]')).toBeVisible();
});

test('phone: slot pages collapse their tools the same way', async ({ page }) => {
  await page.goto('/gm/npc/');
  await expect(page.locator('[data-slot]').first()).toBeVisible({ timeout: 30_000 });

  await expect(page.locator('[data-copy-all]')).toBeHidden();
  await expect(page.locator('[data-roll-all]')).toBeVisible();

  await page.locator('[data-more]').click();
  await expect(page.locator('[data-copy-all]')).toBeVisible();
});
