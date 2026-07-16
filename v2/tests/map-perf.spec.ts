import { test, expect, type Page } from '@playwright/test';

// Item #19: "zooming to the smallest grain is extremely choppy".
//
// NB: an idle rAF loop measures VSYNC, not the map. mapView only repaints on
// demand, so timing frames while nothing moves reports a flat 16.6ms at every
// zoom and tells you exactly nothing. The map has to actually be redrawing —
// so we pan it, with real events, and time the frames that result.

async function open(page: Page) {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /Map/ }).click();
  await expect(page.locator('#mapHost canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500);
}

const startFrames = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __f: number[]; __on: boolean };
  w.__f = [];
  w.__on = true;
  let last = performance.now();
  const tick = () => {
    const n = performance.now();
    w.__f.push(n - last);
    last = n;
    if (w.__on) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const readFrames = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __f: number[]; __on: boolean };
  w.__on = false;
  const f = w.__f.slice(2).sort((a, b) => a - b);
  if (!f.length) return { med: 0, p95: 0, max: 0, n: 0 };
  return { med: f[Math.floor(f.length / 2)]!, p95: f[Math.floor(f.length * 0.95)]!, max: f[f.length - 1]!, n: f.length };
});

// What this guards, concretely: drawFlowMarkers walked each river segment in
// 62-PIXEL steps, and a segment's pixel length grows with the zoom. At the
// 50 ft grain one 7.67-mile segment of river ran 81,000 px, so it drew 1,306
// wave-arrows — 13 million a frame across Earth's 10,247 segments, nearly all
// of them off-screen. A frame took 9.6 SECONDS. Nothing failed; it was just
// unusable, and only at a zoom no test ever visited.
//
// Anything that walks SCREEN space needs clipping. World-space work is
// self-limiting — a hex is a hex — but a screen-space step count has no bound.
const BUDGET_MS = 100;

test('no zoom level costs more than a frame budget to pan', async ({ page }) => {
  test.setTimeout(600_000);
  await open(page);
  const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  const worst: Array<[string, number]> = [];
  const meds: Array<[string, number]> = [];

  for (let step = 0; step < 11; step++) {
    const scale = await page.evaluate(() => (document.querySelector('.mv-scale') as HTMLElement)?.textContent?.trim() ?? '?');
    await startFrames(page);
    // a real drag: every move triggers a real repaint, so the frames we time
    // are frames the map actually drew
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 0; i < 24; i++) {
      await page.mouse.move(cx + (i % 2 ? 14 : -14), cy + (i % 3 ? 6 : -6));
      await page.waitForTimeout(16);
    }
    await page.mouse.up();
    const f = await readFrames(page);
    console.log(`  ${String(step).padStart(2)} scale=${scale.padEnd(9)} median ${f.med.toFixed(1)}ms  p95 ${f.p95.toFixed(1)}ms  max ${f.max.toFixed(1)}ms  (${f.n} frames)`);
    worst.push([scale, f.p95]);
    meds.push([scale, f.med]);

    for (let i = 0; i < 3; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -300); await page.waitForTimeout(60); }
    await page.waitForTimeout(400);
  }

  const over = worst.filter(([, ms]) => ms > BUDGET_MS);
  if (over.length) console.log(`  OVER BUDGET: ${over.map(([s, ms]) => `${s}=${ms.toFixed(0)}ms`).join(', ')}`);
  // Catches a regression of the 9.6-SECOND kind at any zoom.
  expect(Math.max(...worst.slice(2).map(([, ms]) => ms))).toBeLessThan(BUDGET_MS);

  // The continental view used to sit at ~90-110ms, dominated by TERRAIN — the map
  // redrew every one of thousands of hexagons on every pan frame. Batch 128 caches
  // the terrain in an offscreen buffer and blits it while panning, so a pan frame
  // is one drawImage: the median fell to ~16ms (vsync-bound). The occasional
  // re-render (a drag crossing the buffer margin) is the p95, so guard the MEDIAN,
  // which is robust to those spikes and jumps straight back to ~90ms if the buffer
  // stops working. 45ms cleanly separates "buffer working" from "buffer broken".
  const contMed = Math.max(meds[0]![1], meds[1]![1]);
  console.log(`  continental-view median (buffer working ⇒ vsync-bound): ${contMed.toFixed(1)}ms`);
  expect(contMed).toBeLessThan(45);
});
