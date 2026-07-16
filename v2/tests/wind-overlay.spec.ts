import { test, expect, type Page } from '@playwright/test';

// Item #31: the winds & currents field, drawn as a toggleable overlay (owner:
// "winds and currents should be an overlay"). smoke-windfield/currentfield prove
// the arithmetic; only the mounted map can prove the 🌬 toggle actually draws the
// arrows and, crucially, that turning it off puts the map back exactly as it was
// (the overlay must not be baked into the cached terrain buffer, batch 128).

const canvas = (p: Page) => p.locator('#mapHost canvas').first();

async function openMap(page: Page): Promise<void> {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /Map/ }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500); // let the continental terrain settle before the baseline
}

const grab = (page: Page): Promise<number[]> => page.evaluate(() => {
  const c = document.querySelector('#mapHost canvas') as HTMLCanvasElement;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
});

function diffCount(a: number[], b: number[]): number {
  let n = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i]! - b[i]!) + Math.abs(a[i + 1]! - b[i + 1]!) + Math.abs(a[i + 2]! - b[i + 2]!) > 24) n++;
  }
  return n;
}

test('the winds & currents overlay draws on toggle, and clears cleanly (item #31)', async ({ page }) => {
  await openMap(page);
  const wind = page.locator('.mv-showwind');
  await expect(wind).not.toBeChecked(); // a specialised layer — off by default

  const before = await grab(page);
  await wind.check();
  await page.waitForTimeout(600);
  const on = await grab(page);
  const drawn = diffCount(before, on);
  console.log(`  winds overlay changed ${drawn.toLocaleString()} px`);
  // a sparse arrow field over the whole continental view is plainly visible
  expect(drawn).toBeGreaterThan(2000);

  await wind.uncheck();
  await page.waitForTimeout(600);
  const off = await grab(page);
  const residue = diffCount(before, off);
  console.log(`  after toggling off, ${residue.toLocaleString()} px differ from the baseline (render noise)`);
  // Turning the layer off restores the plain map — the arrows were never baked
  // into the cached terrain. A small residue remains from ordinary repaint noise
  // (sub-pixel anti-aliasing on labels/routes across a redraw); what matters is
  // it's a small FRACTION of what the overlay drew, not the whole thing back.
  expect(residue).toBeLessThan(drawn / 3);
});
