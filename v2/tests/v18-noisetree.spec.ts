import { test, expect } from '@playwright/test';

// Audit V18: a noise world's settlements must group under petty crowns, not
// land as one flat 90-row list. PERMANENT — noise worlds are half the New
// dialog, and this is the only spec that creates one in the regular suite.
test('a noise world files its settlements under petty crowns (V18)', async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto('/world/');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.locator('#nwName').fill('v18-pangea');
  await page.locator('#nwLandform').selectOption('pangea');
  await page.locator('#nwSeed').fill('v18-seed-1');
  await page.waitForTimeout(300);
  await page.locator('#nwCreate').click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 280_000 });
  await page.waitForTimeout(2000);

  const probe = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const rq = indexedDB.open('stb:everdeep'); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    const worlds = await new Promise<Array<Record<string, unknown>>>((res, rej) => {
      const tx = db.transaction('worlds').objectStore('worlds').getAll();
      tx.onsuccess = () => res(tx.result); tx.onerror = () => rej(tx.error);
    });
    const w = worlds.find((x) => x.name === 'v18-pangea') as { entities: Record<string, { kind: string; name: string; tags?: string[]; parentId?: string }> } | undefined;
    if (!w) return null;
    const ents = Object.values(w.entities);
    const crowns = ents.filter((e) => (e.tags ?? []).includes('kingdom-lands'));
    const settlements = ents.filter((e) => e.kind === 'settlement');
    const underCrown = settlements.filter((e) => e.parentId && (w.entities[e.parentId]?.tags ?? []).includes('kingdom-lands'));
    return { crowns: crowns.length, settlements: settlements.length, underCrown: underCrown.length, sample: crowns.slice(0, 3).map((c) => c.name) };
  });

  expect(probe, 'world not found in IndexedDB').not.toBeNull();
  const p = probe!;
  console.log(`  ${p.crowns} petty crowns; ${p.underCrown}/${p.settlements} settlements filed under one — e.g. ${p.sample.join(' · ')}`);
  expect(p.crowns).toBeGreaterThan(1);
  // every settlement files under a crown — the flat list is gone
  expect(p.underCrown).toBe(p.settlements);
});
