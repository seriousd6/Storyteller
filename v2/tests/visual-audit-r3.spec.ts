import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

// ADVERSARIAL VISUAL AUDIT — ROUND 3 (owner, 2026-07-19): the road/river/biome
// close-up pass. Owner complaints driving this round: roads that don't connect
// or overlap or spin around cities, roads stopping short of their cities,
// near-miss roads (<10 mi apart, never merging), boxy biomes, rivers running
// too far into the ocean.
//
// NOT part of the regular e2e run: set AUDIT=1 to enable. Screenshots land in
// AUDIT_DIR (or ./audit-shots-r3). Set AUDIT_TARGETS to a JSON file of
// probe-derived viewpoints ([{name,x,y,ppf,note}] in world ft) to add
// data-driven shots aimed at the worst spots the fixture probe found.
const ENABLED = !!process.env.AUDIT;
const DIR = process.env.AUDIT_DIR || 'audit-shots-r3';
const TARGETS = process.env.AUDIT_TARGETS;

test.describe.configure({ mode: 'serial' });
test.setTimeout(1_800_000);
test.beforeEach(() => { test.skip(!ENABLED, 'visual audit only runs with AUDIT=1'); });

const CIRCUM = 132_000_000, HALF_H = 33_000_000;
const at = (lon: number, lat: number): [number, number] =>
  [Math.round(((lon + 180) / 360) * CIRCUM), Math.round((-lat / 90) * HALF_H)];

interface Shot { name: string; lon: number; lat: number; ppf: number; note: string }
// ppf 1.5e-3: frame ≈ 160 mi wide, 10 mi ≈ 79 px — the connectivity zoom.
// ppf 6e-4: frame ≈ 400 mi — network shape. 2.5e-4: ≈ 970 mi — biome bands.
const SHOTS: Shot[] = [
  // roads around cities — do they enter the walls, do neighbours connect?
  { name: 'r3-01-london-roads', lon: -0.13, lat: 51.5, ppf: 1.5e-3, note: 'city approach: roads into the metropolis art' },
  { name: 'r3-02-paris-roads', lon: 2.35, lat: 48.85, ppf: 1.5e-3, note: 'radial capital: spoke count, spin' },
  { name: 'r3-03-rhine-ruhr', lon: 6.8, lat: 51.3, ppf: 1.5e-3, note: 'dense cluster: near-miss roads, merges' },
  { name: 'r3-04-po-valley', lon: 9.8, lat: 45.3, ppf: 1.5e-3, note: 'city chain on a plain: parallel roads' },
  { name: 'r3-05-nyc-corridor', lon: -74.2, lat: 40.7, ppf: 1.5e-3, note: 'metro corridor: overlap, pile-ups' },
  { name: 'r3-06-ganges-cities', lon: 82.5, lat: 25.8, ppf: 1.5e-3, note: 'dense plain: connectivity between close cities' },
  { name: 'r3-07-north-china', lon: 114.5, lat: 34.8, ppf: 1.5e-3, note: 'dense plain #2' },
  { name: 'r3-08-kanto', lon: 139.5, lat: 35.8, ppf: 1.5e-3, note: 'coastal metro: roads vs bay' },
  { name: 'r3-09-nile-valley-roads', lon: 31.2, lat: 26.8, ppf: 1.5e-3, note: 'linear oasis: one corridor, bridges' },
  { name: 'r3-10-us-midwest', lon: -93.2, lat: 41.6, ppf: 1.5e-3, note: 'sparse country: lone road ends' },
  // network shape at survey zoom
  { name: 'r3-11-germany-net', lon: 10, lat: 50, ppf: 6e-4, note: 'network: loops, dangles, doubled lines' },
  { name: 'r3-12-england-net', lon: -1.5, lat: 52.7, ppf: 6e-4, note: 'island network' },
  { name: 'r3-13-india-net', lon: 80, lat: 25, ppf: 6e-4, note: 'subcontinent network' },
  { name: 'r3-14-china-net', lon: 115, lat: 33, ppf: 6e-4, note: 'subcontinent network #2' },
  { name: 'r3-15-useast-net', lon: -77, lat: 39.5, ppf: 6e-4, note: 'US east network' },
  // river mouths — does the line stop at the sea?
  { name: 'r3-20-nile-delta', lon: 31.0, lat: 31.3, ppf: 1e-3, note: 'delta: distributaries vs one overshooting trunk' },
  { name: 'r3-21-mississippi-delta', lon: -89.3, lat: 29.3, ppf: 1e-3, note: 'bird-foot delta' },
  { name: 'r3-22-amazon-mouth', lon: -50.5, lat: -0.5, ppf: 6e-4, note: 'giant mouth: band-4 into open Atlantic?' },
  { name: 'r3-23-rhine-mouth', lon: 4.3, lat: 51.9, ppf: 1e-3, note: 'estuary vs North Sea' },
  { name: 'r3-24-danube-delta', lon: 29.6, lat: 45.2, ppf: 1e-3, note: 'delta into Black Sea' },
  { name: 'r3-25-ganges-delta', lon: 89.5, lat: 22.3, ppf: 8e-4, note: 'the big delta' },
  { name: 'r3-26-thames-estuary', lon: 0.55, lat: 51.5, ppf: 1.5e-3, note: 'band-2 city river: mouth behaviour' },
  { name: 'r3-27-volga-delta', lon: 47.9, lat: 46.3, ppf: 1e-3, note: 'inland-sea mouth (Caspian)' },
  { name: 'r3-28-yangtze-mouth', lon: 121.3, lat: 31.6, ppf: 1e-3, note: 'estuary + coastal cities' },
  { name: 'r3-29-columbia-mouth', lon: -123.9, lat: 46.2, ppf: 1.5e-3, note: 'narrow mouth on a straight coast' },
  // biome boundaries — boxy? staircased? striped?
  { name: 'r3-30-sahel', lon: 0, lat: 15.5, ppf: 2.5e-4, note: 'desert→savanna gradient: banding, boxes' },
  { name: 'r3-31-centralasia', lon: 65, lat: 44, ppf: 2.5e-4, note: 'steppe/desert patchwork' },
  { name: 'r3-32-australia', lon: 134, lat: -25, ppf: 2.5e-4, note: 'interior desert edges' },
  { name: 'r3-33-tibet-edge', lon: 98, lat: 31, ppf: 2.5e-4, note: 'plateau rim: mountain/jungle seam' },
  { name: 'r3-34-taiga-tundra', lon: -105, lat: 62, ppf: 2.5e-4, note: 'subarctic banding' },
  { name: 'r3-35-patagonia', lon: -69, lat: -44, ppf: 2.5e-4, note: 'rain-shadow seam' },
  { name: 'r3-36-congo-edge', lon: 18, lat: 4, ppf: 2.5e-4, note: 'jungle→savanna edge' },
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
  const canvas = page.locator('#mapHost canvas');
  await page.waitForTimeout(2000);
  if (!(await canvas.first().isVisible().catch(() => false))) {
    const mapBtn = page.getByRole('button', { name: /Map/ });
    if (await mapBtn.isVisible().catch(() => false)) await mapBtn.click();
  }
  await expect(canvas.first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3500); // terrain workers settle
}

async function snap(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: false });
  console.log(`  📷 ${name}`);
}

test.beforeAll(() => { mkdirSync(DIR, { recursive: true }); });

test('round 3: roads, river mouths, biome seams', async ({ page }) => {
  wire(page);
  await loadExample(page);
  for (const s of SHOTS) {
    const [x, y] = at(s.lon, s.lat);
    await openMapAt(page, x, y, s.ppf);
    await snap(page, s.name);
  }
});

test('round 3: probe-derived worst spots', async ({ page }) => {
  test.skip(!TARGETS, 'set AUDIT_TARGETS to a probe targets JSON');
  wire(page);
  const targets: { name: string; x: number; y: number; ppf: number; note: string }[] =
    JSON.parse(readFileSync(TARGETS!, 'utf8'));
  await loadExample(page);
  for (const t of targets) {
    await openMapAt(page, t.x, t.y, t.ppf);
    await snap(page, t.name);
  }
});

test.afterAll(() => {
  writeFileSync(`${DIR}/_audit.json`, JSON.stringify({ timings, consoleErrors }, null, 2));
  console.log(`  console errors: ${consoleErrors.length}`);
});
