import { test, expect } from '@playwright/test';
import { pinIsDurable } from './helpers';

// PLAN.md §8: sheets move from localStorage to IndexedDB behind a sync
// mirror. These prove the three claims that matter: legacy data migrates,
// IndexedDB (not localStorage) is what serves afterwards, and deletion is
// a 30-day trash, not oblivion.

const LEGACY = {
  activeId: 's1',
  sheets: [
    {
      id: 's1',
      name: 'Legacy Prep',
      blocks: [{ type: 'title', id: 't1', text: 'Older than the migration' }],
    },
  ],
};

test('legacy localStorage migrates once, then IndexedDB serves alone', async ({ page }) => {
  await page.goto('/sheet/');
  await page.evaluate((legacy) => localStorage.setItem('stb:sheets:v1', JSON.stringify(legacy)), LEGACY);
  await page.reload();
  await expect(page.locator('[data-blocks] h2')).toHaveText('Older than the migration');
  // the marker is set and the data now lives in IndexedDB:
  // clear localStorage entirely — the sheet must survive
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-blocks] h2')).toHaveText('Older than the migration');
  // and a stale tab re-writing localStorage cannot resurrect zombies
  await page.evaluate((legacy) => {
    localStorage.setItem('stb:sheets:v1', JSON.stringify({ ...legacy, sheets: [{ id: 'z', name: 'Zombie', blocks: [] }] }));
    localStorage.setItem('stb:sheets:v1:migrated', '1');
  }, LEGACY);
  await page.reload();
  await expect(page.locator('[data-sheet-name]')).toHaveText('Legacy Prep');
});

test('deleted sheets go to the trash and can be restored', async ({ page }) => {
  await page.goto('/sheet/');
  await page.evaluate((legacy) => localStorage.setItem('stb:sheets:v1', JSON.stringify(legacy)), LEGACY);
  await page.reload();
  await expect(page.locator('[data-sheet-name]')).toHaveText('Legacy Prep');
  page.on('dialog', (d) => void d.accept());
  await page.locator('[data-delete]').click();
  // a fresh "My Sheet" takes over; the old one is in the trash, not gone
  await expect(page.locator('[data-sheet-name]')).toHaveText('My Sheet');
  await page.locator('[data-trash-panel] summary').click();
  await expect(page.locator('[data-trash-list] b')).toHaveText('Legacy Prep');
  await page.locator('[data-trash-list] .btn', { hasText: 'Restore' }).click();
  await expect(page.locator('[data-sheet-name]')).toHaveText('Legacy Prep');
  await expect(page.locator('[data-blocks] h2')).toHaveText('Older than the migration');
  // trash survives reloads until purged
  await page.locator('[data-delete]').click();
  await page.reload();
  await page.locator('[data-trash-panel] summary').click();
  await expect(page.locator('[data-trash-list] b')).toHaveText('Legacy Prep');
  await page.locator('[data-trash-list] .btn', { hasText: 'Delete forever' }).click();
  await expect(page.locator('[data-trash-list] b')).toHaveCount(0);
});

test('a pin from a generator lands in IndexedDB across pages', async ({ page }) => {
  await page.goto('/gm/tavern/');
  await expect(page.locator('[data-slot] [data-value]').first()).not.toHaveText('…', { timeout: 30_000 });
  await page.locator('[data-slot] [data-pin]').first().click();
  await expect(page.locator('[data-tray-count]')).toHaveText('1');
  // nothing sheet-shaped in localStorage anymore — IndexedDB carried it
  const legacyRaw = await page.evaluate(() => localStorage.getItem('stb:sheets:v1'));
  expect(legacyRaw).toBeNull();
  await pinIsDurable(page);
  await page.goto('/sheet/');
  await expect(page.locator('[data-blocks] > .block')).toHaveCount(1);
});
