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
  // the shelf shows the map itself (thumbnails render async, so wait)
  await expect(card.locator('.sp-thumb canvas')).toBeVisible();

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

test('the continuous gesture: overzoom descends into a city, zoom-out ascends', async ({ page }) => {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

  // open the city's page, then jump to its pin on the map (focused + centred)
  await page.locator('#treeSearch').fill('Dun Halifax');
  await page.locator('#tree .node').first().click();
  await page.locator('#showMapBtn').click();
  const canvas = page.locator('#mapHost canvas').first();
  await expect(canvas).toBeVisible({ timeout: 60_000 });
  // an earth world's remount awaits the Earth grid before it can focus the
  // pin — wait for the camera hash to show the focus zoom, not a fixed nap
  await expect
    .poll(async () => {
      const h = await page.evaluate(() => location.hash);
      const m = /,([\d.eE+-]+)$/.exec(h);
      return m ? Number(m[1]) : 0;
    }, { timeout: 30_000 })
    .toBeGreaterThan(1e-3);
  await page.waitForTimeout(300);
  const box = (await canvas.boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

  // world → dungeon in one continuous gesture (MAPS §3.1): keep zooming.
  // The wheel rides to the ceiling, the "keep zooming to enter" charge
  // builds over the pin, and the interior opens — no button.
  await page.mouse.move(cx, cy);
  let entered = false;
  for (let i = 0; i < 60 && !entered; i++) {
    await page.mouse.wheel(0, -300);
    await page.waitForTimeout(90);
    entered = (await page.locator('#siteOverlay').count()) > 0;
  }
  expect(entered, 'overzoom should descend into the settlement plan').toBe(true);
  await expect(page.locator('#siteOverlay .sv-root canvas')).toBeVisible();

  // and back out: zooming past the editor's floor ascends to the map
  await page.mouse.move(cx, cy);
  let left = false;
  for (let i = 0; i < 25 && !left; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(70);
    left = (await page.locator('#siteOverlay').count()) === 0;
  }
  expect(left, 'zoom-out at the floor should return to the map').toBe(true);
  await expect(canvas).toBeVisible();
});
