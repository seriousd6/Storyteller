import { test, expect, type Page } from '@playwright/test';

// Item #17: tapping a pin used to call onSelectEntity → navigate(), and
// navigate() starts with `if (mapMode) setMapMode(false)`. So a glance at a
// city closed the map and threw away your pan and zoom. The peek card answers
// "what is this" in place; "More →" is that old jump, on purpose now.

const canvas = (p: Page) => p.locator('#mapHost canvas').first();
const card = (p: Page) => p.locator('.mv-card');

/** Load the fixture, open the map, and centre it on a named settlement.
 *  Clicking a tree row with the map open focuses instead of navigating, and
 *  focusEntity sets view.x/view.y to the anchor — so the pin lands dead centre
 *  and a click on the canvas centre is a click on that pin. */
async function focusSettlement(page: Page): Promise<string> {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(page.locator('#tree .node').first()).toBeVisible({ timeout: 90_000 });
  await page.getByRole('button', { name: /Map/ }).click();
  await expect(canvas(page)).toBeVisible({ timeout: 60_000 });

  await page.locator('#treeSearch').fill('Applehurst');
  const hit = page.locator('#tree .node').first();
  await expect(hit).toBeVisible();
  const name = ((await hit.locator('.nm').textContent()) ?? '').trim().replace(/^\S+\s/, '');
  await hit.click();
  await page.waitForTimeout(800); // let the focus zoom settle
  return name;
}

test.describe('map peek card (item #17)', () => {
  test('tapping a pin opens a card — and does NOT close the map', async ({ page }) => {
    const name = await focusSettlement(page);
    await canvas(page).click();

    await expect(card(page)).toBeVisible();
    await expect(card(page).locator('.mv-cardname')).toHaveText(name);
    // what it is, and where
    await expect(card(page).locator('.mv-cardkind')).toContainText(/settlement/i);
    // the brief intro — the fixture's villages all carry a paragraph
    await expect(card(page).locator('.mv-cardbrief')).not.toHaveClass(/mv-cardempty/);
    // hard facts beat prose when you're scanning: population is one
    await expect(card(page).locator('.mv-cardfacts')).toContainText(/Population/i);

    // THE REGRESSION: the map is still here, still where I left it
    await expect(canvas(page)).toBeVisible();
    console.log(`  card for "${name}" opened with the map still up`);
  });

  test('the card rides its pin as the map pans, and lets go at the edge', async ({ page }) => {
    await focusSettlement(page);
    await canvas(page).click();
    await expect(card(page)).toBeVisible();
    const before = (await card(page).boundingBox())!;

    const box = (await canvas(page).boundingBox())!;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx - 120, cy, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(400);

    // pinned to the WORLD point, so it tracks its subject rather than sitting
    // wherever the tap happened to land
    const after = (await card(page).boundingBox())!;
    expect(Math.round(before.x - after.x)).toBeGreaterThan(80);

    // Drag its subject right off the map and the card stops competing for
    // space. Each stroke stays INSIDE the canvas (a mouse.move to a negative
    // page coordinate dispatches nothing) and along the BOTTOM, clear of the
    // legend top-right and of the card itself in the middle.
    const lane = box.y + box.height * 0.86;
    for (let i = 0; i < 6; i++) {
      await page.mouse.move(box.x + box.width * 0.7, lane);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.1, lane, { steps: 5 });
      await page.mouse.up();
    }
    console.log(`  after 6 pans: ${await page.locator('.mv-card').evaluate((c) =>
      `left=${(c as HTMLElement).style.left} visibility=${getComputedStyle(c).visibility}`)}`);
    await expect(card(page)).toBeHidden();
  });

  test('"More →" is the old jump: full page, editor and cross-links', async ({ page }) => {
    const name = await focusSettlement(page);
    await canvas(page).click();
    await expect(card(page)).toBeVisible();
    await page.getByRole('button', { name: 'More →' }).click();

    // now — and only now — we leave the map for the page
    await expect(canvas(page)).toBeHidden();
    await expect(page.locator('#page h1.wd-title')).toContainText(name);
    await expect(card(page)).toBeHidden();
  });

  test('tapping open ground dismisses the card', async ({ page }) => {
    await focusSettlement(page);
    await canvas(page).click();
    await expect(card(page)).toBeVisible();
    // well away from the pin, but still on the canvas
    const box = (await canvas(page).boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.28, box.y + box.height * 0.72);
    await expect(card(page)).toBeHidden();
  });

  // The hit-test must ask the SAME question the draw does. It didn't: the tap
  // loop selected any anchor within 14px whether or not it was on the map, so a
  // pin you had switched off still opened its card when you tapped where it used
  // to be. Draw and pick now share one `anchorVisible` predicate.
  test('a pin you have hidden cannot be tapped; showing it makes the same tap work', async ({ page }) => {
    await focusSettlement(page); // the pin sits dead-centre, pins layer on by default
    const pins = page.locator('.mv-showpins');

    // hide the pins layer, then tap exactly where the pin is: it is no longer on
    // the map, so the tap falls through to the hex — no card
    await pins.uncheck();
    await page.waitForTimeout(200);
    await canvas(page).click();
    await expect(card(page)).toBeHidden();

    // show it again and the very same tap opens its card — draw and hit-test agree
    await pins.check();
    await page.waitForTimeout(200);
    await canvas(page).click();
    await expect(card(page)).toBeVisible();
  });
});
