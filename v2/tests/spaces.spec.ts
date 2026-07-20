import { test, expect } from '@playwright/test';

// The nested-spaces epic in a real browser: the /spaces/ standalone authoring
// hub (create → generate → edit → persist through IndexedDB → reopen) and the
// /world/ descend flow (a fixture city's 🏰 button opens its interior plan).
// check/smoke prove the generators; this proves the buttons are connected.
test.setTimeout(300_000);

test('spaces: create a dungeon, edit it, and it survives a reload', async ({ page }) => {
  await page.goto('/spaces/');
  await expect(page.locator('h1', { hasText: 'Spaces' })).toBeVisible();

  // create a medium dungeon from the dialog — the dialog previews the
  // layout live, and 🎲 rolls a fresh seed (still previewing)
  await page.getByRole('button', { name: /New space/ }).click();
  await page.locator('#nsName').fill('The Smoke Test Vault');
  await expect(page.locator('#nsPrev canvas')).toBeVisible();
  await page.locator('#nsReroll').click();
  await expect(page.locator('#nsPrev canvas')).toBeVisible();
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

  // shelf QoL: duplicate lands a copy, search isolates it, delete clears it
  await card.getByRole('button', { name: '⧉' }).click();
  await expect(page.locator('.sp-card', { hasText: '(copy)' })).toBeVisible();
  await page.locator('#spSearch').fill('copy');
  await expect(page.locator('.sp-card')).toHaveCount(1);
  page.once('dialog', (d) => void d.accept());
  await page.locator('.sp-card').getByRole('button', { name: '🗑' }).click();
  await page.locator('#spSearch').fill('');
  await expect(page.locator('.sp-card')).toHaveCount(1);

  // rename in place: the title becomes an input, Enter commits (the card
  // loses its name text while the input is open, so target the input
  // globally, not through the name-keyed card locator)
  await card.getByRole('button', { name: '✏️' }).click();
  await page.locator('.sp-rename').fill('The Renamed Vault');
  await page.locator('.sp-rename').press('Enter');
  const renamed = page.locator('.sp-card', { hasText: 'The Renamed Vault' });
  await expect(renamed).toBeVisible();

  // reopen: same site, same key
  await renamed.getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.sv-root canvas')).toBeVisible();
  await expect(page.locator('.sv-panel')).toContainText('Inner Sanctum');

  // the key panel edits: select the sanctum, rename it, note it
  await page.locator('.sv-key', { hasText: 'Inner Sanctum' }).click();
  await page.locator('[data-alabel]').fill('The Vault of Smoke');
  await page.locator('[data-alabel]').press('Enter');
  await expect(page.locator('.sv-panel')).toContainText('The Vault of Smoke');

  // 💰 roll a hoard into the sanctum: the composite mints a real page and
  // the cell pins it — the loot ecosystem reaches the map. The key click
  // above centred the view on the sanctum, so the canvas centre is a
  // floor cell inside it.
  const cbox = (await page.locator('.sv-root canvas').boundingBox())!;
  await page.locator('.sv-root canvas').click({ position: { x: cbox.width / 2, y: cbox.height / 2 } });
  await page.locator('[data-act="rollhoard"]').click();
  await expect(page.locator('.sv-panel')).toContainText('Treasure Hoard');
});

test('the scale ladder: city overview → ward district → building, breadcrumbs walk back up', async ({ page }) => {
  await page.goto('/spaces/');
  await page.getByRole('button', { name: /New space/ }).click();
  await page.locator('#nsName').fill('Everspire Test');
  await page.locator('#nsKind').selectOption('city');
  await expect(page.locator('#nsPrev canvas')).toBeVisible();
  await page.locator('#nsCreate').click();

  // the overview mounts: the ward fabric's plaza plus keyed burrow hamlets
  await expect(page.locator('.sv-root canvas')).toBeVisible();
  await expect(page.locator('.sv-panel')).toContainText('The Grand Plaza');
  const districtKeys = page.locator('.sv-key', { hasText: 'district' });
  expect(await districtKeys.count()).toBeGreaterThan(1);

  // drill 1: a ward district opens its own 10 ft site
  await districtKeys.first().click();
  await page.locator('[data-act="interior"]').click();
  await expect(page.locator('.sv-title .sv-crumb')).toHaveCount(1);
  await expect(page.locator('.sv-title .sv-crumb').first()).toContainText('Everspire Test');
  await expect(page.locator('.sv-panel')).toContainText(/Ward Square|Market Square|Plaza/);

  // drill 2: the district's landmark building opens at battle scale —
  // notable=1 guarantees the ladder never dead-ends here
  await page.locator('.sv-key', { hasText: 'building' }).first().click();
  await page.locator('[data-act="interior"]').click();
  await expect(page.locator('.sv-title .sv-crumb')).toHaveCount(2);
  await expect(page.locator('.sv-panel')).toContainText('5 ft/cell');

  // the root crumb jumps all the way back to the overview
  await page.locator('.sv-title .sv-crumb').first().click();
  await expect(page.locator('.sv-panel')).toContainText('The Grand Plaza');
  await expect(page.locator('.sv-title .sv-crumb')).toHaveCount(0);
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
  // pin — wait for the camera hash to show the focus zoom, not a fixed nap.
  // ppf is the THIRD hash field, not the last: the hash also carries its
  // world (",@id" since V20), so "last comma-field" would read the id
  await expect
    .poll(async () => {
      const h = await page.evaluate(() => location.hash);
      const m = /^#map=-?[\d.]+,-?[\d.]+,([\d.eE+-]+)/.exec(h);
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
