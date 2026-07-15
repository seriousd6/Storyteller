import { test, expect, type Page } from '@playwright/test';

// Item #3: "realms should exist in the earth example, the regions should span
// the real earth's borders".
//
// smoke-realms.mjs proves the sweep and the colouring. It cannot prove the one
// thing the owner actually asked for: that you can SEE the borders. `claims`
// was empty for two years and nothing failed — a world with no claims renders
// perfectly, just blank. So this spec goes looking for colour on the canvas.

async function openEarthMap(page: Page) {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /Map/ }).click();
  await expect(page.locator('#mapHost canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000); // terrain + claim layers settle
}

/** Snapshot the canvas as a plain array, for differencing. */
async function grab(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector('#mapHost canvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
  });
}

/** Fraction of pixels that differ between two snapshots. */
function changed(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  }
  return n / (a.length / 4);
}

test.describe('realms on the map (item #3)', () => {
  // Measured by DIFFERENCE, not by colour. My first attempt hunted for the
  // claim hues directly and matched savanna and desert terrain instead —
  // hiding every realm on Earth moved the number 9.00% -> 8.56%, so it was
  // reading the Sahara, not the borders. A 10%-alpha wash cannot be picked out
  // by absolute colour. What CAN'T be argued with: any pixel that changes when
  // the realms are switched off is, by definition, the political layer.
  test('the shipped Earth draws a political layer the legend can switch off', async ({ page }) => {
    await openEarthMap(page);
    const keys = page.locator('.mv-claims .mv-key');
    const n = await keys.count();
    console.log(`  legend lists ${n} realms`);
    expect(n).toBeGreaterThan(100); // Earth's landed crowns

    const withClaims = await grab(page);
    for (let i = 0; i < n; i++) await keys.nth(i).click(); // hide every realm
    await page.waitForTimeout(1000);
    const without = await grab(page);

    const frac = changed(withClaims, without);
    console.log(`  the political layer covers ${(frac * 100).toFixed(1)}% of the canvas`);
    // Before this item `claims` was {} and this was exactly 0: nothing to hide,
    // nothing to show. Earth's land is ~29% of the globe and the whole world is
    // in frame, so a real political layer moves a large slice of the canvas.
    expect(frac).toBeGreaterThan(0.10);

    // and putting them back restores it
    for (let i = 0; i < n; i++) await keys.nth(i).click();
    await page.waitForTimeout(1000);
    expect(changed(await grab(page), without)).toBeGreaterThan(0.10);
  });

  test('a realm is a real page: fantasy-named, under its continent, with a government', async ({ page }) => {
    await page.goto('/world/');
    await page.getByRole('button', { name: 'Load example' }).click();
    await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

    // fantasy-Russia — the largest crown on the map, per smoke-realms
    await page.locator('#treeSearch').fill('Rusenmark');
    const hit = page.locator('#tree .node').first();
    await expect(hit).toBeVisible();
    // the search hit shows where it lives: under the continent, not at the root
    await expect(page.locator('#tree .hitpath').first()).toContainText(/Vast East|Old World|Americas|Sunlands|Reefs/);
    await hit.click();

    // the page opens, named for the realm, filed under its continent
    await expect(page.locator('#page h1.wd-title')).toContainText('Rusenmark');
    await expect(page.locator('#page .crumbs')).toContainText(/Vast East|Old World/);
    // ...and carrying the government the region-flavoured tables rolled for it.
    // The registry labels this field "Who rules here?", and in GM view a field
    // is an <input> — so its value is not in the page's text at all.
    const gov = page.locator('#page [data-fkey="government"]');
    await expect(gov).toHaveValue(/\w+ — a|an /);
    console.log(`  fantasy-Russia is governed by: ${await gov.inputValue()}`);
  });
});
