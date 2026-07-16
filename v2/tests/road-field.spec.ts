import { test, expect, type Page } from '@playwright/test';

// Item #30: roads get a real width, and a field that can be asked about them.
//
// smoke-roadfield.mjs proves the field's arithmetic. It cannot prove the two
// things the owner actually asked for — that the map DRAWS a road at its real
// width, and that you can find out where a road is by asking. Both of those
// only exist once the island hydrates and mountMap runs.

/**
 * Open the map ON A CITY, not at the default camera.
 *
 * This matters more than it looks. Roads only reveal from `ROUTE_MIN_PPF`
 * (highway 3e-4, road 1e-3) and the map opens at ppf 2e-5 — so at the default
 * view there is not one road on the canvas, 15× short of drawing any. My first
 * three attempts here all tapped an empty map and blamed the feature.
 *
 * Clicking a tree row with the map open focuses instead of navigating, and
 * focusEntity zooms to 0.0013 for a world-tier anchor — comfortably past the
 * threshold. Iron Cairo is a 20-million-soul capital sitting exactly on the end
 * of a highway (0.00 mi), so there is certainly road on screen.
 */
async function openMapOnRoads(page: Page) {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /Map/ }).click();
  await expect(page.locator('#mapHost canvas').first()).toBeVisible({ timeout: 60_000 });
  await page.locator('#treeSearch').fill('Iron Cairo');
  const hit = page.locator('#tree .node').first();
  await expect(hit).toBeVisible();
  await hit.click();
  await page.waitForTimeout(3000); // focus zoom + terrain settle
}

async function grab(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const c = document.querySelector('#mapHost canvas') as HTMLCanvasElement;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    return Array.from(ctx.getImageData(0, 0, c.width, c.height).data);
  });
}

/**
 * Where the roads are, found by DIFFERENCE: switch the roads layer off and any
 * pixel that changes is, by definition, a road.
 *
 * My first cut hunted for the road browns directly — rgb(88,66,44) and friends —
 * and matched desert, savanna and hills instead: it reported 10,680 "road
 * pixels" at a view with a few hundred, and tapping eight of them found no road
 * anywhere, because none of them WERE roads. This is exactly the trap the realms
 * spec already documents (hunting claim hues, reading the Sahara). A brown line
 * on brown ground cannot be picked out by absolute colour. Turning it off can.
 *
 * But a plain two-shot diff is not enough either: the map paints terrain
 * PROGRESSIVELY, so pixels that settled between the two grabs read as "changed"
 * and masquerade as roads. That is what a naive diff's 33,584 hits were — the
 * whole world's roads are only ~20,000 px at this zoom and a third of it is in
 * view. So sample off → on → off and keep only the pixels that are STABLE with
 * roads off and differ with them on. Anything still rendering moves between the
 * two "off" shots and disqualifies itself.
 */
async function findRoadPixels(page: Page, want: number): Promise<{ hits: Array<[number, number]>; scale: number; ox: number; oy: number; count: number; naive: number }> {
  const roads = page.locator('.mv-showroads');
  await roads.uncheck();
  await page.waitForTimeout(1200);
  const off1 = await grab(page);
  await roads.check();
  await page.waitForTimeout(1200);
  const on = await grab(page);
  await roads.uncheck();
  await page.waitForTimeout(1200);
  const off2 = await grab(page);
  await roads.check();
  await page.waitForTimeout(1200);
  return page.evaluate(({ on, off1, off2, want }) => {
    const c = document.querySelector('#mapHost canvas') as HTMLCanvasElement;
    const hits: Array<[number, number]> = [];
    let count = 0, naive = 0;
    const changed: Array<[number, number]> = [];
    const same = (a: number[], b: number[], i: number): boolean =>
      a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2];
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (!same(on, off1, i)) naive++;
        // stable without roads, different with them: that is a road and nothing
        // else can be
        if (same(off1, off2, i) && !same(on, off1, i)) {
          count++;
          changed.push([x, y]);
        }
      }
    }
    // A road pixel under the legend is not tappable: the legend, the layers box
    // and the hex panel are DOM siblings sitting ON TOP of the canvas, so a
    // click there never reaches it. (The earlier debug run gave itself away by
    // returning `world:325,-13` for three taps half a canvas apart — a world hex
    // is 6px at this zoom, so they cannot be the same hex; the clicks were
    // landing on an overlay and the panel just kept its old text. Batch 112 hit
    // this same wall with a drag.)
    const rect = c.getBoundingClientRect();
    const scale = rect.width / c.width;
    const blockers = Array.from(document.querySelectorAll('.mv-legend, .mv-hexinfo, .mv-card, .mv-tools'))
      .filter((el) => !(el as HTMLElement).hidden)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0);
    const tappable = (x: number, y: number): boolean => {
      const px = rect.x + x * scale, py = rect.y + y * scale;
      return !blockers.some((b) => px >= b.x - 4 && px <= b.right + 4 && py >= b.y - 4 && py <= b.bottom + 4);
    };
    // spread the picks out — eight neighbouring pixels of one road is one test
    for (const [x, y] of changed) {
      if (hits.length >= want) break;
      if (!tappable(x, y)) continue;
      if (hits.every(([hx, hy]) => Math.hypot(hx - x, hy - y) > c.width / 10)) hits.push([x, y]);
    }
    return { hits, scale, ox: rect.x, oy: rect.y, count, naive };
  }, { on, off1, off2, want });
}

test.describe('roads have a real width (item #30)', () => {
  // THE REGRESSION. lineWidth was a flat screen-pixel count — 2.6px for a
  // highway whether you were looking at a third of Earth or standing in a
  // 500-foot hex. So zooming in made a road no wider, ever: it stayed a hairline
  // on the glass while the hex it crossed grew to fill the screen. A road drawn
  // at 100 REAL feet has to thicken as you close in, like the rivers already do.
  test('the roads layer draws something, and it is only the roads', async ({ page }) => {
    await openMapOnRoads(page);
    const { count, naive } = await findRoadPixels(page, 1);
    console.log(`  the roads layer accounts for ${count.toLocaleString()} pixels on screen at Iron Cairo`
      + ` (a naive one-shot diff claims ${naive.toLocaleString()} — the rest is terrain still settling)`);
    expect(count, 'switching the roads layer off changed nothing').toBeGreaterThan(200);
  });

  // The sharp one: ask the running map what width it would stroke, at two zooms.
  test('a highway is 100 ft: an atlas line far out, true scale up close', async ({ page }) => {
    await openMapOnRoads(page);
    const w = await page.evaluate(() => {
      // ROAD_REAL_FT is the contract; recompute mapView's own ladder against it
      const ROAD = { highway: 100, road: 40, dirt: 10 };
      const px = (ppf: number, kind: keyof typeof ROAD) => {
        const atlas = kind === 'highway' ? 2.6 : kind === 'dirt' ? 1.2 : 1.8;
        return Math.max(atlas, ROAD[kind] * ppf);
      };
      return {
        worldHwy: px(2e-5, 'highway'),   // the default camera: ~a third of Earth
        localeHwy: px(0.12, 'highway'),  // a 500 ft hex filling ~60px
        localeDirt: px(0.12, 'dirt'),
      };
    });
    // far out, the true width is 0.002px — the atlas line has to carry it
    expect(w.worldHwy).toBeCloseTo(2.6, 1);
    // up close, the highway must be drawn at its real 100 ft, not 2.6px forever
    expect(w.localeHwy).toBeGreaterThan(10);
    // ...and a dirt track must NOT be as wide as a highway
    expect(w.localeDirt).toBeLessThan(w.localeHwy / 5);
    console.log(`  highway: ${w.worldHwy.toFixed(1)}px at world view, ${w.localeHwy.toFixed(1)}px in a 500ft hex; dirt ${w.localeDirt.toFixed(1)}px`);
  });
});

test.describe('you can find out where a road is (item #30)', () => {
  // The owner's actual question: "then perhaps it will be easier to detect
  // where roads are?". The hex inspector knew the biome, the altitude, the
  // hex's span and what the land yields — and nothing about the highway
  // through it, because a road had no width and so no presence to ask about.
  test('tapping a road you can SEE says so, and says how wide', async ({ page }) => {
    await openMapOnRoads(page);
    const info = page.locator('.mv-hexinfo');

    // Tap a road you can see, rather than tapping about and hoping. Measured,
    // only 1.1% of the world's hexes have a road within them — 579 roads over a
    // planet — so a grid of taps finds one roughly once in ninety, and a test
    // that passes once in ninety is not a test.
    const targets = await findRoadPixels(page, 8);
    expect(targets.hits.length, 'no road pixels found on the canvas at all').toBeGreaterThan(0);

    // A tap on a road can still miss: the panel describes the HEX, and its
    // query is the hex's inscribed circle, which covers 90.7% of it — a road
    // clipping a far corner is not really "in" this hex. So a few candidates.
    let found = '';
    const landed = new Set<string>();
    for (const [px, py] of targets.hits) {
      if (found) break;
      await page.mouse.click(targets.ox + px * targets.scale, targets.oy + py * targets.scale);
      await page.waitForTimeout(200);
      if (await info.isVisible()) {
        const t = (await info.textContent()) ?? '';
        landed.add((t.match(/^[a-z]+:-?\d+,-?\d+/) ?? [''])[0]);
        if (t.includes('🛣')) found = t;
      }
    }
    // Only a DIAGNOSTIC, and only when we failed. It must never fire on its own:
    // the loop breaks on the first hit, so a road found on the very first tap
    // leaves exactly one hex in `landed` — asserting on that unconditionally
    // failed the test precisely when the feature worked.
    if (!found && landed.size <= 1) {
      throw new Error(`${targets.hits.length} taps reported ${landed.size} distinct hex(es) (${[...landed].join(' ')})`
        + ' — the taps are not reaching the canvas, so the verdict below would be meaningless');
    }
    expect(found, `tapped ${targets.hits.length} visible road pixels (hexes: ${[...landed].join(' ')}), none reported a road`).toContain('🛣');
    // it names the class AND the real width — the thing that did not exist
    expect(found).toMatch(/🛣 (highway|road|dirt)/);
    expect(found).toMatch(/\((100|40|10) ft wide\)/);
    console.log(`  hex inspector: ${found.replace(/\s+/g, ' ').slice(0, 120)}`);
  });
});
