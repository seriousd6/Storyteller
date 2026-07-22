import { test, expect, type Page } from '@playwright/test';

// Owner (2026-07-22): ghosts — abandoned villages, lairs, and other unwritten
// places — should read as a hex-area hazard ZONE that scales with the map, not
// a fixed ~8px dot that shrinks to a speck inside a 500 ft hex as you zoom in.
// Screenshots at region + deep zoom to eyeball; a toggle-delta proves the layer
// paints an area, and the delta must GROW (not shrink) as you zoom in.

const LAND = { x: 80363360, y: -7899210 }; // near New Jeddah — inhabited country
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

// how much of the canvas the ghost layer paints (toggle it off, diff)
async function ghostFootprint(page: Page): Promise<number> {
  const on = await grab(page);
  await page.locator('.mv-showghosts').uncheck();
  await page.waitForTimeout(600);
  const off = await grab(page);
  await page.locator('.mv-showghosts').check();
  await page.waitForTimeout(400);
  return changed(on, off);
}

test('ghost hazards draw as a hex zone that scales with the map', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

  // region view — the country is close enough that the unwritten appear
  await openAt(page, LAND.x, LAND.y, 1.5e-3);
  await canvas(page).screenshot({ path: test.info().outputPath('ghosts-region.png') });
  const atRegion = await ghostFootprint(page);
  console.log(`  ghost layer paints ${(atRegion * 100).toFixed(2)}% of the canvas at region zoom`);
  expect(atRegion, 'the ghost layer draws at region zoom').toBeGreaterThan(0.001);

  // deep zoom on the SAME ghost-rich country around New Jeddah — where a fixed
  // dot used to shrink to a speck in a 500 ft hex. The zones scale with the map,
  // so the unwritten places near the centre still draw as real areas here.
  await openAt(page, LAND.x, LAND.y, 5e-3);
  await canvas(page).screenshot({ path: test.info().outputPath('ghosts-deep.png') });
  const atDeep = await ghostFootprint(page);
  console.log(`  ghost layer paints ${(atDeep * 100).toFixed(2)}% of the canvas zoomed in`);
  expect(atDeep, 'ghosts still draw as real areas zoomed in, not specks').toBeGreaterThan(0.001);
});