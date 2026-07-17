import { test, expect, type Page } from '@playwright/test';

// Items #26–#29: the political layer's controls and legibility.

async function openMap(page: Page) {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /Map/ }).click();
  await expect(page.locator('#mapHost canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3000);
}

async function grab(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector('#mapHost canvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
  });
}
function changed(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  return n / (a.length / 4);
}

test.describe('the political layer is its own layer (item #27)', () => {
  test('turning pins off leaves the realms; turning realms off leaves the pins', async ({ page }) => {
    await openMap(page);
    const withBoth = await grab(page);

    // pins off — drawAnchors used to `return` on this, taking every realm name
    // and every ocean's name with it
    await page.locator('.mv-showpins').uncheck();
    await page.waitForTimeout(700);
    const noPins = await grab(page);
    const pinsCost = changed(withBoth, noPins);
    console.log(`  pins account for ${(pinsCost * 100).toFixed(1)}% of the canvas`);
    expect(pinsCost).toBeGreaterThan(0.001); // they did something

    // ...and the realms are still there: hiding them NOW must still change a lot
    await page.locator('.mv-showrealms').uncheck();
    await page.waitForTimeout(700);
    const neither = await grab(page);
    const realmsCost = changed(noPins, neither);
    console.log(`  with pins already off, realms still account for ${(realmsCost * 100).toFixed(1)}%`);
    expect(realmsCost).toBeGreaterThan(0.10); // the wash covers Earth's land

    // both back
    await page.locator('.mv-showrealms').check();
    await page.locator('.mv-showpins').check();
    await page.waitForTimeout(700);
    expect(changed(await grab(page), neither)).toBeGreaterThan(0.10);
  });

  test('the realms toggle takes the wash, the borders and the names together', async ({ page }) => {
    await openMap(page);
    const on = await grab(page);
    await page.locator('.mv-showrealms').uncheck();
    await page.waitForTimeout(700);
    const off = await grab(page);
    expect(changed(on, off)).toBeGreaterThan(0.10);
  });
});

test.describe('the realms legend lists what you are looking at (item #29)', () => {
  test('zooming in narrows the list; the count says so', async ({ page }) => {
    await openMap(page);
    const rows = page.locator('.mv-claims .mv-key');
    const total = await rows.count();
    const visible = () => rows.evaluateAll((els) => els.filter((e) => !(e as HTMLElement).hidden).length);

    await expect.poll(visible, { timeout: 15_000 }).toBeGreaterThan(0);
    const atWorld = await visible();
    // NB "default view", not "the whole world": the map opens at ppf 2e-5 over
    // the first anchor, which is about a third of Earth — hence ~72 of 182, not
    // all of them. Fit-to-screen only happens for an anchorless world.
    console.log(`  default view (~a third of Earth): ${atWorld}/${total} realms in the legend`);
    expect(atWorld).toBeLessThan(total); // already filtering

    // zoom right in on one country
    const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
    for (let i = 0; i < 8; i++) {
      await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.4);
      await page.mouse.wheel(0, -400);
      await page.waitForTimeout(80);
    }
    await expect.poll(visible, { timeout: 15_000 }).toBeLessThan(atWorld);
    const atCountry = await visible();
    console.log(`  zoomed in: ${atCountry}/${total} realms in the legend`);
    expect(atCountry).toBeLessThan(atWorld);

    // the header count agrees with what's actually shown
    await expect(page.locator('.mv-claimcount')).toHaveText(`${atCountry}/${total}`);

    // #33: hidden must actually HIDE. This spec used to read only the DOM
    // property, which is how a CSS specificity tie (.mv-claims .mv-key's
    // display:flex outranking .mv-key[hidden]) kept every row visibly on
    // screen while the count filtered — the owner's "only a number changes".
    const hiddenButShown = await rows.evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).hidden && getComputedStyle(e).display !== 'none').length);
    expect(hiddenButShown).toBe(0);
  });
});

test.describe('entity fields (item #28)', () => {
  test('a realm page shows its ruler and seat by name, not "[object Object]"', async ({ page }) => {
    await page.goto('/world/');
    await page.getByRole('button', { name: 'Load example' }).click();
    await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
    await page.locator('#treeSearch').fill('Verdelond'); // the owner's screenshot
    const hit = page.locator('#tree .node').first();
    await expect(hit).toBeVisible();
    await hit.click();

    // the whole page must not contain that string anywhere
    await expect(page.locator('#page')).not.toContainText('[object Object]');
    // ruler and seat are SELECTS now (entityRef), with a real entity chosen
    const ruler = page.locator('#page select[data-fkey="ruler"]');
    await expect(ruler).toHaveCount(1);
    const chosen = await ruler.evaluate((s: HTMLSelectElement) => s.selectedOptions[0]?.textContent ?? '');
    expect(chosen).not.toBe('—');
    expect(chosen.length).toBeGreaterThan(1);
    console.log(`  Verdelond's ruler resolves to: ${chosen}`);
    // and it's labelled, not showing the raw key
    await expect(page.locator('#page')).toContainText('Who holds power here?');
  });
});
