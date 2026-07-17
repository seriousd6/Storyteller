import { test, expect, type Page } from '@playwright/test';

// #35 (owner D13): a political power's entry is rollable — a terse gazetteer
// draft in almanac voice, deterministic off the entity's seed path. The roll
// is only offered while the page is blank, and the result is written into the
// world (IndexedDB), not just rendered.

const openExample = async (page: Page) => {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
};

const openAmericas = async (page: Page) => {
  await page.locator('#tree .node', { hasText: 'The Americas' }).first().click();
  await expect(page.locator('#page h1.wd-title')).toContainText('The Americas');
};

test('a realm page rolls a gazetteer entry, and it survives a reload (#35)', async ({ page }) => {
  test.setTimeout(240_000);
  await openExample(page);
  await openAmericas(page);

  const rollBtn = page.locator('#rollEntryBtn');
  await expect(rollBtn).toBeVisible();
  await rollBtn.click();

  // the gazetteer arrives: labelled sections, facts first
  const labels = page.locator('#page .block .blabel');
  await expect(labels.first()).toBeVisible({ timeout: 30_000 });
  const sections = await labels.allTextContents();
  for (const want of ['Government', 'Climate & land', 'Trade', 'Forces', 'Current tensions']) {
    expect(sections).toContain(want);
  }
  const prose = await page.locator('#page .block p').allTextContents();
  expect(prose.every((t) => t.trim().length > 10)).toBe(true);

  // only offered while the page is blank — a roll never stomps written prose
  await expect(rollBtn).toBeHidden();

  // written to the world, not the screen: wait for the app's own saved
  // flash (save() debounces 250ms before hitting IndexedDB), then reload
  await expect(page.locator('#savedFlash')).toHaveClass(/show/, { timeout: 5_000 });
  await page.reload();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await openAmericas(page);
  await expect(page.locator('#page .block .blabel').first()).toBeVisible();
  expect(await page.locator('#page .block p').allTextContents()).toEqual(prose);
  await expect(page.locator('#rollEntryBtn')).toBeHidden();
});
