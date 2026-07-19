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
// This is a CATASTROPHE guard (the 9.6-second kind), not a tight per-frame target
// — the median<45 checks below own that. A wall-clock p95 near 100ms is inherently
// load-sensitive and flaked at ~110–136ms under multi-session load; 500ms sits far
// below any seconds-scale regression yet clears a loaded box's spikes.
const BUDGET_MS = 500;

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

// The ZOOM itself (item #19, owner again: "zooming to the finest grain is still
// extremely slow"). Panning was buffered in b128 but zoom deliberately was not —
// every wheel notch re-rasterised thousands of hexes + per-hex art (~50ms+). b136
// scales the cached buffer during the gesture and re-renders crisp only when it
// settles, so a zoom frame is one drawImage, like a pan frame. Time the frames a
// continuous wheel-zoom actually produces at a fine grain.
test('zooming in does not re-rasterise the terrain every frame (item #19)', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  // drop in to a fine grain first (where the per-hex art render is dearest)
  for (let i = 0; i < 7; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -300); await page.waitForTimeout(80); }
  await page.waitForTimeout(400);
  const scale = await page.evaluate(() => (document.querySelector('.mv-scale') as HTMLElement)?.textContent?.trim() ?? '?');
  await startFrames(page);
  // a slow continuous zoom-in: each notch repaints; the frames between are the
  // ones we time (mostly scaled blits, with the odd crisp re-render on settle)
  for (let i = 0; i < 16; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, -120); await page.waitForTimeout(32); }
  const f = await readFrames(page);
  console.log(`  zoom @${scale}: median ${f.med.toFixed(1)}ms  p95 ${f.p95.toFixed(1)}ms  max ${f.max.toFixed(1)}ms  (${f.n} frames)`);
  // buffer-scaled zoom frames are vsync-bound; a full re-render every frame sat
  // near/over 50ms. 45ms cleanly separates "scaling the buffer" from "redrawing it".
  expect(f.med).toBeLessThan(45);
});

// The DEEP-band tripwire (perf audit P4, 2026-07-19). Wheeling OUT of the
// finest grain over a dense city once froze a single frame for 1,666ms: a
// coverage break forced a cold terrain-buffer render INSIDE the wheel gesture
// (b271 stopped that — gestures never render for coverage), and the settle
// render of a never-visited band then paid ~0.5s of cold field evaluation in
// one frame at rest (b277 chunks that warm-up across ≤8ms rAF slices). Both
// regressions are seconds-scale, and this zoom path is one no other test
// visits — the 9.6-second flow-marker bug above survived for months for
// exactly that reason. Like BUDGET_MS this is a catastrophe guard: far below
// the failure it names, far above a loaded box's noise.
test('wheeling out of the deepest grain never freezes a frame', async ({ page }) => {
  test.setTimeout(300_000);
  await open(page);
  // pin the camera over a dense city at a fine grain via the #map hash — the
  // saved world re-opens from IDB and world.astro's boot restores the
  // viewport and opens the map. (A hash-only goto would NOT re-run the
  // island; the reload does. The fresh island starts with a COLD hex cache,
  // which is the point: every band the wheel-out crosses is never-visited.)
  await page.evaluate(() => { location.hash = '#map=42683447,-16370750,4'; });
  await page.reload();
  await expect(page.locator('#mapHost canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await startFrames(page);
  // a continuous wheel OUT through the crossfade bands the audit caught
  // (ppf 4 → ~0.01); every band between arrives mid-gesture, cold
  for (let i = 0; i < 14; i++) { await page.mouse.move(cx, cy); await page.mouse.wheel(0, 300); await page.waitForTimeout(48); }
  // keep timing through the settle — the chunked warm-up and the crisp
  // render it gates land in this window
  await page.waitForTimeout(1500);
  const f = await readFrames(page);
  console.log(`  deep zoom-out: median ${f.med.toFixed(1)}ms  p95 ${f.p95.toFixed(1)}ms  max ${f.max.toFixed(1)}ms  (${f.n} frames)`);
  // gesture frames are scaled blits (vsync); the warmed settle render is
  // ~60-80ms; the failures this guards are 500ms-1.7s single frames
  expect(f.med).toBeLessThan(45);
  expect(f.max).toBeLessThan(BUDGET_MS);
});
