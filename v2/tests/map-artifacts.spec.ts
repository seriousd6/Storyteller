import { test, expect, type Page } from '@playwright/test';

// Item #13: "artifacts at higher zoom... they move and shift with panning".
// They were RIVERS: toScreen wraps each point to the nearest half-world of the
// view centre, so a line straddling the view's ANTIPODE lands on opposite screen
// edges and strokes clean across the map — and the antipode moves as you pan,
// which is why they shifted.
//
// The signature is unmistakable in pixels: a horizontal row of river-blue that
// runs nearly the full width of the canvas. Real rivers never do that.

async function openMap(page: Page) {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /Map/ }).click();
  await expect(page.locator('#mapHost canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(2500); // let terrain + layers settle
}

/** Longest horizontal run of "river blue" as a fraction of canvas width, plus
 *  the total count of river-blue pixels — so we can tell "no wrap artifact" from
 *  "no rivers at all" (a max<0.8 check alone passes when rivers vanish). */
async function riverStats(page: Page): Promise<{ widest: number; total: number }> {
  return page.evaluate(() => {
    const c = document.querySelector('#mapHost canvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    const { width: w, height: h } = c;
    const img = ctx.getImageData(0, 0, w, h).data;
    // the river stroke is a distinctly blue, mid-bright pixel: blue clearly
    // ahead of red, and not the near-black of deep ocean
    const isRiver = (i: number) => {
      const r = img[i]!, g = img[i + 1]!, b = img[i + 2]!;
      return b > r + 28 && b > 90 && g > 60 && g < b;
    };
    let widest = 0, total = 0;
    for (let y = 0; y < h; y++) {
      let run = 0;
      for (let x = 0; x < w; x++) {
        if (isRiver((y * w + x) * 4)) { run++; total++; if (run > widest) widest = run; }
        else run = 0;
      }
    }
    return { widest: widest / w, total };
  });
}

test.describe('map rendering artifacts (item #13)', () => {
  test('no river is ruled clean across the map, at any pan position', async ({ page }) => {
    await openMap(page);
    const box = (await page.locator('#mapHost canvas').first().boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;

    // Pan across a full world-width in steps. The artifact only appears when a
    // river straddles the view's antipode, so a single view can easily miss it —
    // that's exactly why it survived this long.
    const worst: number[] = [];
    let seenRivers = 0;
    for (let i = 0; i < 8; i++) {
      const { widest, total } = await riverStats(page);
      worst.push(widest);
      seenRivers = Math.max(seenRivers, total);
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      await page.mouse.move(cx - box.width * 0.45, cy, { steps: 6 });
      await page.mouse.up();
      await page.waitForTimeout(700);
    }
    const max = Math.max(...worst);
    console.log(`  widest continuous river-blue row across 8 pans: ${(max * 100).toFixed(1)}% of canvas width`);
    console.log(`  per-pan: ${worst.map((f) => (f * 100).toFixed(0) + '%').join(', ')}; peak river pixels: ${seenRivers}`);
    // rivers must actually be DRAWN — otherwise "no wide run" passes on a map
    // with no rivers at all (the check would miss a rivers-vanished regression).
    expect(seenRivers, 'the map drew river strokes at all').toBeGreaterThan(150);
    // an ocean row could legitimately be wide, but a *river stroke* spanning
    // ~the whole viewport is only ever the wrap artifact
    expect(max).toBeLessThan(0.8);
  });
});
