import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { writeFileSync } from 'node:fs';

// ADVERSARIAL VISUAL AUDIT (owner, 2026-07-17): drive the real app in real
// Chromium and photograph every world feature — terrain, coasts, rivers,
// roads, cities, realms, overlays, the globe, noise worlds — so a reviewer
// (human or model) can hunt visual defects the numeric smokes cannot see.
//
// NOT part of the regular e2e run: set AUDIT=1 to enable. Screenshots land in
// AUDIT_DIR (or ./audit-shots). Timings + console errors go to _audit.json.
const ENABLED = !!process.env.AUDIT;
const DIR = process.env.AUDIT_DIR || 'audit-shots';

test.describe.configure({ mode: 'serial' });
test.setTimeout(600_000);
test.beforeEach(() => { test.skip(!ENABLED, 'visual audit only runs with AUDIT=1'); });

const CIRCUM = 132_000_000, HALF_H = 33_000_000;
const at = (lon: number, lat: number): [number, number] =>
  [Math.round(((lon + 180) / 360) * CIRCUM), Math.round((-lat / 90) * HALF_H)];

interface Shot { name: string; lon: number; lat: number; ppf: number; note: string }
const SHOTS: Shot[] = [
  { name: '01-world-full', lon: 0, lat: 0, ppf: 9e-6, note: 'whole Earth: landmass shapes, realm washes, label density' },
  { name: '02-europe', lon: 10, lat: 48, ppf: 3.5e-4, note: 'dense region: cities, roads, rivers, borders' },
  { name: '03-nile', lon: 31, lat: 27, ppf: 2.2e-4, note: 'authored Nile: course, bridges, desert band' },
  { name: '04-amazon', lon: -60, lat: -3, ppf: 2.2e-4, note: 'Amazon: jungle, tributaries, delta' },
  { name: '05-alps', lon: 10, lat: 46.5, ppf: 6e-4, note: 'mountains: relief, passes, road routing' },
  { name: '06-florida', lon: -81.5, lat: 27.5, ppf: 1.2e-3, note: 'coastline fidelity (the square-coast complaint)' },
  { name: '07-siberia', lon: 100, lat: 60, ppf: 1.5e-4, note: 'sparse country: taiga banding, lone roads' },
  { name: '08-japan', lon: 138, lat: 36, ppf: 4e-4, note: 'island nation: straits, coastal cities' },
  { name: '09-india', lon: 80, lat: 24, ppf: 2.2e-4, note: 'the no-roads regression region + Ganges' },
  { name: '10-china', lon: 115, lat: 33, ppf: 2.2e-4, note: 'the other no-roads region + Yangtze' },
  { name: '11-us-east', lon: -75, lat: 40, ppf: 3e-4, note: 'US east coast: city chain, highways' },
  { name: '12-mediterranean', lon: 18, lat: 37, ppf: 3e-4, note: 'inland sea: islands, coasts both sides' },
  { name: '13-london-region', lon: -0.13, lat: 51.5, ppf: 4e-3, note: 'locale approach: city, ghosts, art marks' },
  { name: '14-london-city', lon: -0.13, lat: 51.5, ppf: 2e-2, note: 'deep zoom: hex grain, coast at street scale' },
];

const timings: Record<string, number> = {};
const consoleErrors: string[] = [];

function wire(page: Page): void {
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(`console: ${m.text().slice(0, 300)}`); });
}

async function loadExample(page: Page): Promise<void> {
  await page.goto('/world/');
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  timings['load-example-ms'] ??= Date.now() - t0;
}

async function openMapAt(page: Page, x: number, y: number, ppf: number): Promise<void> {
  await page.evaluate(([hx, hy, hp]) => { location.hash = `#map=${hx},${hy},${(hp as number).toExponential(3)}`; }, [x, y, ppf]);
  await page.reload();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  const t0 = Date.now();
  // a #map= hash auto-opens the map on load, but only after the island
  // hydrates — settle first, then check which state we're in; the Map button
  // only exists while the Pages view is showing
  const canvas = page.locator('#mapHost canvas');
  await page.waitForTimeout(2000);
  if (!(await canvas.first().isVisible().catch(() => false))) {
    const mapBtn = page.getByRole('button', { name: /Map/ });
    if (await mapBtn.isVisible().catch(() => false)) await mapBtn.click();
  }
  await expect(canvas.first()).toBeVisible({ timeout: 60_000 });
  timings['map-mount-ms'] = Date.now() - t0;
  await page.waitForTimeout(3500); // terrain workers settle
}

async function snap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
  console.log(`  📷 ${name}`);
}

test.beforeAll(() => { mkdirSync(DIR, { recursive: true }); });

test('viewpoints across Earth', async ({ page }) => {
  test.setTimeout(900_000);
  wire(page);
  await loadExample(page);
  for (const s of SHOTS) {
    const [x, y] = at(s.lon, s.lat);
    await openMapAt(page, x, y, s.ppf);
    await snap(page, s.name);
  }
});

test('overlays at the Europe view', async ({ page }) => {
  wire(page);
  await loadExample(page);
  const [x, y] = at(10, 48);
  await openMapAt(page, x, y, 3.5e-4);

  await page.locator('.mv-showrealms').uncheck();
  await page.waitForTimeout(800);
  await snap(page, '20-europe-no-realms');

  await page.locator('.mv-showrelief').check();
  await page.waitForTimeout(1500);
  await snap(page, '21-europe-relief');
  await page.locator('.mv-showrelief').uncheck();

  await page.locator('.mv-showres').check();
  await page.waitForTimeout(1500);
  await snap(page, '22-europe-resources');
  await page.locator('.mv-showres').uncheck();

  await page.locator('.mv-showwind').check();
  await page.waitForTimeout(1500);
  await snap(page, '23-europe-winds');
  await page.locator('.mv-showwind').uncheck();
  await page.locator('.mv-showrealms').check();

  // travel plan, land (round-2 lesson): the example SHIPS a party at
  // fantasy-London, and 🥾 starts from the party — two blind clicks made the
  // first click the destination and the second an ordinary tap. Move the
  // party in-frame first, then ask for one destination (Paris-ish -> Munich-ish).
  const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
  await page.locator('.mv-party').click();
  await page.mouse.click(box.x + box.width * 0.38, box.y + box.height * 0.45);
  await page.waitForTimeout(400);
  await page.locator('.mv-travel').click();
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.55);
  await page.waitForTimeout(1200);
  await snap(page, '24-travel-land');
});

test('sea travel across the Mediterranean', async ({ page }) => {
  wire(page);
  await loadExample(page);
  const PPF = 2.2e-4;
  const [cx0, cy0] = at(19.8, 36.3);
  await openMapAt(page, cx0, cy0, PPF);
  // click by real geography, not frame fractions — the old fractions both
  // landed on open water (round-2 lesson: the first click was the DESTINATION,
  // because 🥾 starts from the shipped party at fantasy-London). Sicily →
  // Crete: an ISLAND destination has no walk-around, so the boat leg crosses
  // the open Ionian mid-frame — the sea-leg legibility check V23 deferred.
  // (Sicily → Greece walks up Italy and ferries the Otranto strait off-frame;
  // scenic for the A*, useless for the camera.) Watery world-hex taps snap to
  // the nearest walkable hex (V25), which Crete's 35-mi-wide spine relies on.
  const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
  const px = (lon: number, lat: number): [number, number] => {
    const [wx, wy] = at(lon, lat);
    return [box.x + box.width / 2 + (wx - cx0) * PPF, box.y + box.height / 2 + (wy - cy0) * PPF];
  };
  const [p1x, p1y] = px(14.8, 37.5); // eastern Sicily, safely inland
  await page.locator('.mv-party').click();
  await page.mouse.click(p1x, p1y);
  await page.waitForTimeout(400);
  await page.locator('.mv-travel').click(); // arms the destination pick…
  // …then tuck the legend away (the 🚩/🥾 buttons live inside it, so this
  // must come AFTER them): the Cretan click would land on the panel, not the map
  await page.locator('.mv-legmin').click();
  const [p2x, p2y] = px(24.8, 35.2); // Crete
  await page.mouse.click(p2x, p2y);
  await page.waitForTimeout(1500);
  await snap(page, '25-travel-sea');
});

test('the globe and its toggles', async ({ page }) => {
  wire(page);
  await loadExample(page);
  const [x, y] = at(10, 30);
  await openMapAt(page, x, y, 9e-6);

  const t0 = Date.now();
  await page.locator('.mv-globe').click();
  await page.waitForTimeout(4000); // texture bake
  timings['globe-first-paint-wait-ms'] = Date.now() - t0;
  await snap(page, '30-globe');

  // toggles must apply to the globe (item #34, batch 140)
  await page.locator('.mv-showrivers').uncheck();
  await page.waitForTimeout(2500);
  await snap(page, '31-globe-no-rivers');
  await page.locator('.mv-showpins').uncheck();
  await page.locator('.mv-showlabels').uncheck();
  await page.waitForTimeout(1500);
  await snap(page, '32-globe-bare');
});

test('pan jank at region zoom (longtask blocking)', async ({ page }) => {
  wire(page);
  await loadExample(page);
  const [x, y] = at(10, 48);
  await openMapAt(page, x, y, 3.5e-4);
  const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).__blocked = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) (window as unknown as Record<string, number>).__blocked += e.duration;
    }).observe({ entryTypes: ['longtask'] });
  });
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
  await page.mouse.down();
  for (let i = 0; i < 40; i++) {
    await page.mouse.move(box.x + box.width * 0.7 - i * 8, box.y + box.height * 0.5, { steps: 1 });
    await page.waitForTimeout(40);
  }
  await page.mouse.up();
  timings['pan-longtask-blocked-ms'] = await page.evaluate(() => (window as unknown as Record<string, number>).__blocked);
  await snap(page, '40-after-pan');

  // wheel zoom in and out — repaint responsiveness + final state
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(120); }
  await page.waitForTimeout(1500);
  await snap(page, '41-after-zoom-in');
});

test('noise worlds: one per landform', async ({ page }) => {
  test.setTimeout(900_000);
  wire(page);
  for (const [i, lf] of (['pangea', 'continents', 'archipelago'] as const).entries()) {
    await page.goto('/world/');
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await page.locator('#nwName').fill(`audit-${lf}`);
    await page.locator('#nwLandform').selectOption(lf);
    await page.locator('#nwSeed').fill(`audit-${lf}-7`);
    await page.waitForTimeout(300);
    const t0 = Date.now();
    await page.locator('#nwCreate').click();
    await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 280_000 });
    timings[`create-${lf}-ms`] = Date.now() - t0;
    // creating a world auto-opens its map; the Map button only exists on Pages
    await page.waitForTimeout(2000);
    if (!(await page.locator('#mapHost canvas').first().isVisible().catch(() => false))) {
      await page.getByRole('button', { name: /Map/ }).click();
    }
    await expect(page.locator('#mapHost canvas').first()).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(4000);
    await snap(page, `5${i}-noise-${lf}`);
    // one zoom-in for coast/settlement grain
    const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, -300); await page.waitForTimeout(150); }
    await page.waitForTimeout(2000);
    await snap(page, `5${i}-noise-${lf}-zoom`);
  }
});

test.afterAll(() => {
  writeFileSync(`${DIR}/_audit.json`, JSON.stringify({ timings, consoleErrors }, null, 2));
  console.log('  timings:', JSON.stringify(timings));
  console.log(`  console errors: ${consoleErrors.length}`);
});
