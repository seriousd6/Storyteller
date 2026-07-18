import { test, expect, type Page } from '@playwright/test';
import { clickTool } from './helpers';

// Phase 3 core (docs/sheets/PLAN.md §12): the Library is the shelf — every
// document type on one screen, searchable, with open/duplicate/trash.

async function makeDocs(page: Page) {
  // a sheet (via template instantiation, which also stamps its kind)…
  await page.goto('/sheet/');
  await clickTool(page, '[data-from-template]');
  await page.locator('[data-template-id="character-sheet"]').click();
  await expect(page.locator('[data-sheet-name]')).toHaveText('Character Sheet');
  // …and a user table
  await page.locator('[data-brew-panel] summary').click();
  await page.locator('[data-brew-new]').click();
  await page.locator('[data-brew-title]').fill('Omens');
  await page.locator('[data-brew-entries]').fill('A red comet\nTwo moons');
  await page.locator('[data-brew-save]').click();
  await expect(page.locator('[data-brew-editor]')).toBeHidden();
}

test('the shelf lists sheets and brews, searches, and filters', async ({ page }) => {
  await makeDocs(page);
  await page.goto('/library/');
  // both documents appear (plus the default My Sheet)
  await expect(page.locator('.lib-sheet')).toHaveCount(2);
  await expect(page.locator('.lib-brew')).toHaveCount(1);
  // the template stamped its kind
  await expect(page.locator('.lib-chip')).toHaveText('character');
  // search narrows by name
  await page.locator('[data-lib-search]').fill('omens');
  await expect(page.locator('.lib-card')).toHaveCount(1);
  await expect(page.locator('.lib-card b')).toContainText('Omens');
  // type filter narrows too
  await page.locator('[data-lib-search]').fill('');
  await page.locator('[data-lib-filter]').selectOption('sheet');
  await expect(page.locator('.lib-brew')).toHaveCount(0);
  await expect(page.locator('.lib-sheet')).toHaveCount(2);
});

test('Open activates the sheet; Duplicate copies it; Trash removes it from the shelf', async ({ page }) => {
  await makeDocs(page);
  await page.goto('/library/');
  // duplicate the character sheet
  const charCard = page.locator('.lib-sheet', { hasText: 'Character Sheet' }).first();
  await charCard.locator('.btn', { hasText: 'Duplicate' }).click();
  await expect(page.locator('.lib-sheet', { hasText: '(copy)' })).toHaveCount(1);
  // open the copy — it becomes the active sheet in the builder
  await page.locator('.lib-sheet', { hasText: '(copy)' }).locator('.btn', { hasText: 'Open' }).click();
  await expect(page).toHaveURL(/\/sheet\//);
  await expect(page.locator('[data-sheet-name]')).toHaveText('Character Sheet (copy)');
  // trash it from the library
  await page.goto('/library/');
  page.on('dialog', (d) => void d.accept());
  await page.locator('.lib-sheet', { hasText: '(copy)' }).locator('.btn', { hasText: 'Trash' }).click();
  await expect(page.locator('.lib-sheet', { hasText: '(copy)' })).toHaveCount(0);
  // …and it is in the sheet page's trash, restorable
  await page.goto('/sheet/');
  await page.locator('[data-trash-panel] summary').click();
  await expect(page.locator('[data-trash-list] b')).toContainText('(copy)');
});

test('thumbnails render, deep search finds block text, save-as-template feeds the gallery', async ({ page }) => {
  await makeDocs(page);
  await page.goto('/library/');
  // the character sheet card carries a real rendered thumbnail
  const charCard = page.locator('.lib-sheet', { hasText: 'Character Sheet' }).first();
  await expect(charCard.locator('.lib-thumb-inner .b')).not.toHaveCount(0);
  // deep search: 'longsword' appears only inside the character sheet's blocks
  await page.locator('[data-lib-search]').fill('longsword');
  await expect(page.locator('.lib-card')).toHaveCount(1);
  await expect(page.locator('.lib-card .lib-card-head b')).toContainText('Character Sheet');
  await page.locator('[data-lib-search]').fill('');
  // flag it as the user's own template…
  await charCard.locator('.btn', { hasText: '☆ Template' }).click();
  await expect(charCard.locator('.btn', { hasText: '★ Templated' })).toBeVisible();
  // …and it appears in the gallery under "Your templates", instantiating as a copy
  await page.goto('/sheet/');
  await clickTool(page, '[data-from-template]');
  // (B211 added more gallery sections — target ours, don't count them)
  await expect(page.locator('.gallery-section', { hasText: 'Your templates' })).toBeVisible();
  await page.locator('[data-template-id^="mine-"]').click();
  await expect(page.locator('[data-sheet-name]')).toHaveText('Character Sheet');
  await expect(page.locator('button.stat-box')).toHaveCount(0); // edit mode, statGrid not rollable-rendered
  await expect(page.locator('.b-statGrid .stat-box')).toHaveCount(6);
});
