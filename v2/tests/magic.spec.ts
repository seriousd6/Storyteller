import { test, expect, type Page } from '@playwright/test';

// The magic roller's "Magic System" slot was one line — "<School> Magic —
// Source: … Cost: … Potency: … Accessibility: … Mastery: …" — with all five
// sub-rolls gated by the rolled school. Now a composite breaks them into
// labelled, rerollable sections, and freezes the school so a per-section reroll
// stays in-school (same mechanism as government; guarded here on the real page).

async function generated(page: Page) {
  await page.goto('/gm/magic/');
  const preview = page.locator('[data-preview]');
  await expect(preview.locator('.b-statblock').first()).toBeVisible({ timeout: 20_000 });
  return preview;
}

test('the magic-system monolith renders as labelled sections', async ({ page }) => {
  const preview = await generated(page);
  for (const label of ['Source', 'Cost', 'Potency', 'Accessibility', 'Mastery']) {
    await expect(preview.locator('.b', { hasText: label }).first()).toBeVisible();
  }
  for (const group of ['The Craft', 'Its Nature', 'Wild Magic']) {
    await expect(preview.locator('.b-statblock h3', { hasText: group }).first()).toBeVisible();
  }
});

test('rerolling a school-gated section keeps the school (frozen spine)', async ({ page }) => {
  const preview = await generated(page);
  const schoolName = preview.locator('.b-statblock').first().locator('h3');
  const source = () => preview.locator('.b-paragraph', { hasText: 'Source' }).first();

  const schoolBefore = (await schoolName.innerText()).trim();
  const sourceBefore = (await source().innerText()).trim();

  await source().locator('.rr-btn').click();

  await expect(source()).not.toHaveText(sourceBefore, { timeout: 10_000 });
  await expect(schoolName).toHaveText(schoolBefore);
});
