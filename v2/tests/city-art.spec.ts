import { test, expect, type Page } from '@playwright/test';

// Owner: "city population realistic to footprint... the overlays add little
// houses but the ground is still grass... every town/city tile its own
// texture." The footprint now lays OPAQUE cleared ground + a block/street
// fabric across the whole built-up area, sized to population at fantasy-
// Victorian density — so no biome shows between the roofs.
//
// The pins layer carries the footprints, so toggling it off reverts the city
// centre to bare biome. The size of that swing (biome-independent) proves the
// footprint paints a large opaque region, and the "grass" fraction proves the
// ground under the roofs is no longer green.

const CITY = { name: 'New Jeddah', x: 80363360, y: -7899210 }; // promoted, ~4M souls

const canvas = (p: Page) => p.locator('#mapHost canvas').first();

async function openMapAt(page: Page, x: number, y: number, ppf: number): Promise<void> {
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

/** RGBA of a centred box (~a third of the canvas), plus built/grass fractions.
 *  built = warm packed earth or rooftop (r clearly ahead of g and b);
 *  grass = biome green (g clearly ahead of both). */
async function centre(page: Page): Promise<{ built: number; grass: number; raw: number[] }> {
  return page.evaluate(() => {
    const c = document.querySelector('#mapHost canvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const w = c.width, h = c.height, s = Math.min(w, h);
    const bx = Math.round(w / 2 - s * 0.18), by = Math.round(h / 2 - s * 0.18), bs = Math.round(s * 0.36);
    const img = Array.from(ctx.getImageData(bx, by, bs, bs).data);
    let built = 0, grass = 0, n = 0;
    for (let i = 0; i < img.length; i += 4) {
      const r = img[i]!, g = img[i + 1]!, b = img[i + 2]!;
      n++;
      if (r > g + 8 && r > b + 8 && r > 90) built++;
      else if (g > r + 12 && g > b + 12 && g > 100) grass++;
    }
    return { built: built / n, grass: grass / n, raw: img };
  });
}

function changedFrac(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2]) n++;
  return n / (a.length / 4);
}

test('a big city draws opaque built ground over its whole footprint, not huts on grass', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

  // zoom so the ~8-mile footprint reads as a whole city on screen
  await openMapAt(page, CITY.x, CITY.y, 1.5e-2);
  await page.locator('.mv-legend').evaluate((el) => { (el as HTMLElement).style.opacity = '0'; }).catch(() => {});
  await page.waitForTimeout(300);
  await canvas(page).screenshot({ path: test.info().outputPath('city-footprint.png') });
  await page.locator('.mv-legend').evaluate((el) => { (el as HTMLElement).style.opacity = ''; }).catch(() => {});

  const withPins = await centre(page);
  console.log(`  city centre WITH footprint: built=${(withPins.built * 100).toFixed(0)}% grass=${(withPins.grass * 100).toFixed(0)}%`);

  // the built-up centre is warm cleared ground + roofs, not a green lawn
  expect(withPins.built, 'city centre is packed earth / rooftops').toBeGreaterThan(0.30);
  expect(withPins.grass, 'no grass showing through the city centre').toBeLessThan(0.15);

  // toggle the footprints away → the centre reverts to bare biome. The swing is
  // how much opaque ground the footprint painted (biome-independent proof).
  await page.locator('.mv-showpins').uncheck();
  await page.waitForTimeout(700);
  const noPins = await centre(page);
  const swing = changedFrac(withPins.raw, noPins.raw);
  console.log(`  footprint painted ${(swing * 100).toFixed(0)}% of the city centre; grass without it: ${(noPins.grass * 100).toFixed(0)}%`);
  expect(swing, 'the footprint covers a large area, not a few specks').toBeGreaterThan(0.15);
  // and it never ADDED grass — the ground got MORE built, not less
  expect(withPins.grass).toBeLessThanOrEqual(noPins.grass + 0.03);
});