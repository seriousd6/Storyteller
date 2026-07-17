import { test, expect } from '@playwright/test';

// Queue #37: a known place arrives with its DETAILS written. Opening a
// settlement page derives blank government/defenses/trade/settlementType from
// what the world already knows (size, land, the realm's law, the political
// web) — deterministically, so a reload shows the same words, not a re-roll.
test.setTimeout(300_000);

test('a fixture city opens with its details filled, and they are stable', async ({ page }) => {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

  await page.locator('#treeSearch').fill('Dun Halifax');
  await page.locator('#tree .node').first().click();
  await expect(page.locator('#page h1.wd-title')).toContainText('Dun Halifax');

  const read = async (): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    for (const key of ['government', 'defenses', 'trade', 'settlementType']) {
      out[key] = await page.locator(`#page [data-fkey="${key}"]`).inputValue();
    }
    return out;
  };
  const first = await read();
  console.log(`  filled: ${JSON.stringify(first)}`);
  for (const [k, v] of Object.entries(first)) {
    expect(v.trim().length, `${k} should be filled`).toBeGreaterThan(3);
  }

  // deterministic: a reload derives the SAME words
  await page.reload();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.locator('#treeSearch').fill('Dun Halifax');
  await page.locator('#tree .node').first().click();
  await expect(page.locator('#page h1.wd-title')).toContainText('Dun Halifax');
  expect(await read()).toEqual(first);
});
