import { test, expect, type Page } from '@playwright/test';

// D12 (owner, 2026-07-17) — the promoted-pin half of audit V1: promotion
// FLOORS a pin's visibility at the millionaire-city rung instead of bypassing
// the zoom declutter. A promoted city reads from a continent away, but not
// from space — the bake's 264 promoted cities were the last world-zoom crowd.
//
// Draw and pick share one `anchorVisible` predicate, so tapping IS the
// faithful probe: if the tap finds the pin, the pin was drawn.
//
// New Jeddah: promoted, pop 3,976,000 (< the 8M "always shows" rung).
const CITY = { name: 'New Jeddah', x: 80363360, y: -7899210 };

const canvas = (p: Page) => p.locator('#mapHost canvas').first();
const card = (p: Page) => p.locator('.mv-card');

async function openMapAt(page: Page, x: number, y: number, ppf: number): Promise<void> {
  await page.evaluate(([hx, hy, hp]) => { location.hash = `#map=${hx},${hy},${(hp as number).toExponential(3)}`; }, [x, y, ppf]);
  await page.reload();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  // a #map= hash auto-opens the map once the island hydrates; settle, then
  // fall back to the Map button only if it didn't
  await page.waitForTimeout(2000);
  if (!(await canvas(page).isVisible().catch(() => false))) {
    const mapBtn = page.getByRole('button', { name: /Map/ });
    if (await mapBtn.isVisible().catch(() => false)) await mapBtn.click();
  }
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1200);
}

test('a promoted city hides from space but still reads from a continent away (D12)', async ({ page }) => {
  test.setTimeout(240_000);
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });

  // full-Earth view, the city dead centre: promotion no longer pierces the
  // declutter, so the tap falls through to open ground — no card at all
  // (nothing else with an Infinity rung sits within the tap radius here)
  await openMapAt(page, CITY.x, CITY.y, 9e-6);
  await canvas(page).click();
  await expect(card(page)).toBeHidden();

  // one continental notch in, the same tap opens the same city — the floor
  // keeps the promotion contract worth having
  await openMapAt(page, CITY.x, CITY.y, 3e-5);
  await canvas(page).click();
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('.mv-cardname')).toHaveText(CITY.name);
});
