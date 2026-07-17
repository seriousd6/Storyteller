import { test, expect } from '@playwright/test';

// Queue #36 (owner): the Local Life web scales by population — per 200,000
// people, 1 inn + 2 shops + 8 connected people + 2 side quests + 1 thread out
// into the wider world, ×⌈pop/200000⌉ — and re-rolling it rebuilds the SAME
// cast in place (seed-derived stamp + entity ids) instead of stacking a
// duplicate town-within-a-town. Dun Halifax (~403k → ×3) locks both rules:
// exactly 43 entities minted, and a second click changes nothing.
test.setTimeout(300_000);

async function entityCount(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => new Promise<number>((resolve) => {
    const req = indexedDB.open('stb:everdeep', 1);
    req.onsuccess = () => {
      const all = req.result.transaction('worlds', 'readonly').objectStore('worlds').getAll();
      all.onsuccess = () => {
        const w = (all.result as Array<Record<string, unknown>>).find((x) => String(x.name).startsWith('Earth'));
        resolve(w ? Object.keys(w.entities as object).length : -1);
      };
    };
  }));
}

test('Local Life scales with population and re-rolls in place', async ({ page }) => {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

  await page.locator('#treeSearch').fill('Dun Halifax'); // pop ~403,131 → m=3
  const hit = page.locator('#tree .node').first();
  await expect(hit).toBeVisible();
  await hit.click();
  await expect(page.locator('#page h1.wd-title')).toContainText('Dun Halifax');

  const before = await entityCount(page);
  await page.locator('#webLifeBtn').click();
  // m=3 → 3 inns + 6 shops + 24 people + 6 quests + 3 road-notes + 1 feud = 43
  await expect(page.locator('#page h1.wd-title')).toContainText('feud', { ignoreCase: true, timeout: 120_000 });
  // the save is async — poll IndexedDB until the write lands
  await expect.poll(() => entityCount(page), { timeout: 30_000 }).toBe(before + 43);
  const after = await entityCount(page);
  console.log(`  entities: ${before} -> ${after} (created ${after - before})`);

  // navigate back to the city and roll again — the SAME cast, no duplicates
  await page.locator('#treeSearch').fill('Dun Halifax');
  await page.locator('#tree .node').first().click();
  await expect(page.locator('#page h1.wd-title')).toContainText('Dun Halifax');
  await page.locator('#webLifeBtn').click();
  await expect(page.locator('#page h1.wd-title')).toContainText('feud', { ignoreCase: true, timeout: 120_000 });
  await page.waitForTimeout(3000); // let any (wrong) extra write land before asserting stability
  const again = await entityCount(page);
  console.log(`  after re-roll: ${again} (delta ${again - after})`);
  expect(again).toBe(after);
});
