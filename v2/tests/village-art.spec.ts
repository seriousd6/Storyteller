import { test, expect, type Page } from '@playwright/test';

// Owner (2026-07-22): give villages and dungeon entrances richer, scaling art
// like the cities got. Villages now draw a tilled fringe, a lane, a green, and a
// chapel; dungeon entrances gained an approach path + rubble and two new
// variants (ruined tower, mine adit). Screenshot the settled country around a
// city to eyeball it; assert the footprint layer paints (pins toggle delta).

const LAND = { x: 80363360, y: -7899210 }; // New Jeddah + its farming country
const canvas = (p: Page) => p.locator('#mapHost canvas').first();

async function openAt(page: Page, x: number, y: number, ppf: number): Promise<void> {
  await page.evaluate(([hx, hy, hp]) => {
    location.hash = `#map=${hx},${hy},${(hp as number).toExponential(3)}`;
  }, [x, y, ppf]);
  await page.reload();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.waitForTimeout(2000);
  if (!(await canvas(page).isVisible().catch(() => false))) {
    const mapBtn = page.getByRole('button', { name: /Map/ });
    if (await mapBtn.isVisible().catch(() => false)) await mapBtn.click();
  }
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
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

test('villages and their fields draw as real footprint art at close zoom', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

  // close enough that settlement footprints (city fabric + village art) draw
  await openAt(page, LAND.x, LAND.y, 9e-3);
  await canvas(page).screenshot({ path: test.info().outputPath('village-country.png') });

  // the footprint art paints a real area (toggle the pins layer, diff)
  const on = await grab(page);
  await page.locator('.mv-showpins').uncheck();
  await page.waitForTimeout(700);
  const off = await grab(page);
  const swing = changed(on, off);
  console.log(`  settlement footprint art paints ${(swing * 100).toFixed(1)}% of the canvas at close zoom`);
  expect(swing, 'settlement footprints draw at close zoom').toBeGreaterThan(0.02);
});
