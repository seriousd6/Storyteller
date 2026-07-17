import { test, expect } from '@playwright/test';

// The nested-spaces epic in a real browser: the /spaces/ standalone authoring
// hub (create → generate → edit → persist through IndexedDB → reopen) and the
// /world/ descend flow (a fixture city's 🏰 button opens its interior plan).
// check/smoke prove the generators; this proves the buttons are connected.
test.setTimeout(300_000);

test('spaces: create a dungeon, edit it, and it survives a reload', async ({ page }) => {
  await page.goto('/spaces/');
  await expect(page.locator('h1', { hasText: 'Spaces' })).toBeVisible();

  // create a medium dungeon from the dialog
  await page.getByRole('button', { name: /New space/ }).click();
  await page.locator('#nsName').fill('The Smoke Test Vault');
  await page.locator('#nsCreate').click();

  // the editor mounts: canvas, floor tab, and the generated key with its
  // gate and sanctum (the One Page Dungeon-style room list)
  await expect(page.locator('.sv-root canvas')).toBeVisible();
  await expect(page.locator('.sv-floors .sv-btn', { hasText: 'Ground' })).toBeVisible();
  await expect(page.locator('.sv-panel')).toContainText('Inner Sanctum');
  await expect(page.locator('.sv-panel')).toContainText('The Gate');

  // paint one wall cell (an override on the generated base), then leave
  await page.locator('[data-tool="wall"]').click();
  const canvas = page.locator('.sv-root canvas');
  await canvas.click({ position: { x: 40, y: 40 } });
  await page.locator('[data-act="exit"]').click();

  // back on the list: the card exists and survives a full reload
  await expect(page.locator('.sp-card', { hasText: 'The Smoke Test Vault' })).toBeVisible();
  await page.reload();
  const card = page.locator('.sp-card', { hasText: 'The Smoke Test Vault' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('standalone');

  // reopen: same site, same key
  await card.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.sv-root canvas')).toBeVisible();
  await expect(page.locator('.sv-panel')).toContainText('Inner Sanctum');

  // the key panel edits: select the sanctum, rename it, note it
  await page.locator('.sv-key', { hasText: 'Inner Sanctum' }).click();
  await page.locator('[data-alabel]').fill('The Vault of Smoke');
  await page.locator('[data-alabel]').press('Enter');
  await expect(page.locator('.sv-panel')).toContainText('The Vault of Smoke');
});

test('world: a fixture city descends into its interior plan', async ({ page }) => {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

  await page.locator('#treeSearch').fill('Dun Halifax');
  await page.locator('#tree .node').first().click();
  await expect(page.locator('#page h1.wd-title')).toContainText('Dun Halifax');

  // the descend button (settlement → its town/city plan)
  await page.locator('#siteBtn').click();
  await expect(page.locator('#siteOverlay .sv-root canvas')).toBeVisible();
  // a settlement plan always keys its plaza + districts
  await expect(page.locator('#siteOverlay .sv-panel')).toContainText(/Plaza|Market Square/);
  const firstKey = await page.locator('#siteOverlay .sv-key').first().textContent();

  // back to the wiki page, overlay gone
  await page.locator('#siteOverlay [data-act="exit"]').click();
  await expect(page.locator('#siteOverlay')).toHaveCount(0);

  // re-entering finds the SAME stored site (not a fresh mint)
  await page.locator('#siteBtn').click();
  await expect(page.locator('#siteOverlay .sv-key').first()).toHaveText(firstKey ?? '');
});
