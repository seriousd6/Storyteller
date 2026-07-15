import { test, expect, type Page } from '@playwright/test';

// Item #16: "the padlock and long names make for poor spacing". The pane was
// frozen at 250px and each row was one ellipsised box with the lock FLOATED
// into it — so a long realm name ran underneath the padlock. Now the row is a
// flex line, the lock owns a column, and the pane's width is the owner's.

const rows = (p: Page) => p.locator('#tree .node');

async function openExample(page: Page) {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  await expect(rows(page).first()).toBeVisible({ timeout: 90_000 });
}

const navWidth = (p: Page) => p.locator('#nav').evaluate((n) => n.getBoundingClientRect().width);

test.describe('tree pane width (item #16)', () => {
  test('the padlock never sits on top of the name', async ({ page }) => {
    await openExample(page);
    // squeeze the pane to its minimum: the worst case for a long realm name
    await page.locator('.wd-main').evaluate((m) => m.style.setProperty('--navw', '150px'));

    const row = rows(page).first();
    await row.hover(); // the lock only materialises on hover
    const lock = row.locator('.lk');
    await expect(lock).toBeVisible();

    const [nm, lk] = await Promise.all([
      row.locator('.nm').boundingBox(),
      lock.boundingBox(),
    ]);
    // the name's box ENDS where the lock's begins — that is the whole fix
    expect(nm!.x + nm!.width).toBeLessThanOrEqual(lk!.x + 1);
    // and the row still fits its pane rather than spilling out of it
    const nav = (await page.locator('#nav').boundingBox())!;
    expect(lk!.x + lk!.width).toBeLessThanOrEqual(nav.x + nav.width + 1);
    console.log(`  at 150px: name ends at ${Math.round(nm!.x + nm!.width)}, lock starts at ${Math.round(lk!.x)}`);
  });

  test('a name too long for the pane is clipped by the NAME, not by the lock', async ({ page }) => {
    await openExample(page);
    await page.locator('.wd-main').evaluate((m) => m.style.setProperty('--navw', '150px'));
    // "The Old World — Europe" and friends overflow 150px comfortably
    const clipped = await page.locator('#tree .nm').evaluateAll((els) =>
      els.filter((e) => e.scrollWidth > e.clientWidth + 1).length
    );
    expect(clipped).toBeGreaterThan(0);
    // the full name is still readable on hover
    await expect(rows(page).first().locator('.nm')).toHaveAttribute('title', /\S/);
  });

  test('dragging the grip resizes the pane, and the width sticks', async ({ page }) => {
    await openExample(page);
    const before = await navWidth(page);
    const grip = (await page.locator('#navGrip').boundingBox())!;

    await page.mouse.move(grip.x + grip.width / 2, grip.y + 60);
    await page.mouse.down();
    await page.mouse.move(grip.x + grip.width / 2 + 170, grip.y + 60, { steps: 8 });
    await page.mouse.up();

    const after = await navWidth(page);
    expect(after).toBeGreaterThan(before + 120);

    // furniture stays put
    await page.reload();
    await expect(rows(page).first()).toBeVisible({ timeout: 90_000 });
    expect(Math.abs((await navWidth(page)) - after)).toBeLessThan(2);
    console.log(`  pane ${Math.round(before)}px → ${Math.round(after)}px, survived reload`);
  });

  test('the pane will not drag away to nothing, nor eat the page', async ({ page }) => {
    await openExample(page);
    const grip = (await page.locator('#navGrip').boundingBox())!;
    const drag = async (dx: number) => {
      const g = (await page.locator('#navGrip').boundingBox())!;
      await page.mouse.move(g.x + g.width / 2, g.y + 60);
      await page.mouse.down();
      await page.mouse.move(g.x + g.width / 2 + dx, grip.y + 60, { steps: 6 });
      await page.mouse.up();
    };
    await drag(-900);
    expect(await navWidth(page)).toBeGreaterThanOrEqual(149);
    await drag(2000);
    expect(await navWidth(page)).toBeLessThanOrEqual(721);
  });

  // NB: folding does not widen the PAGE — .wd-page is capped at max-width:760px
  // on purpose, because prose has a reading measure. The map has no such cap,
  // and it is what the space is really for.
  test('folding the tree hands its width to the map, and comes back', async ({ page }) => {
    await openExample(page);
    await page.getByRole('button', { name: /Map/ }).click();
    await expect(page.locator('#mapHost canvas').first()).toBeVisible({ timeout: 60_000 });
    const mapW = () => page.locator('#mapHost canvas').first().evaluate((n) => n.getBoundingClientRect().width);
    const navW0 = await navWidth(page);
    const wide0 = await mapW();

    await page.locator('#navMin').click();
    await expect(page.locator('#nav')).toBeHidden();
    await expect(page.locator('#navGrip')).toBeHidden();
    // The map re-fits itself — mountMap keeps a ResizeObserver on its host.
    // "Most of" the tree's width, not all: folding leaves a 16px rail to get
    // the tree back with.
    await expect.poll(mapW).toBeGreaterThan(wide0 + navW0 * 0.8);
    console.log(`  map ${Math.round(wide0)}px → ${Math.round(await mapW())}px with the tree folded (nav was ${Math.round(navW0)}px)`);

    // folded stays folded across a reload — then the button brings it back.
    // NB: map mode itself is not persisted, so there is no canvas after this.
    await page.reload();
    await expect(page.locator('#navShow')).toBeVisible({ timeout: 90_000 });
    await expect(page.locator('#nav')).toBeHidden();

    await page.locator('#navShow').click();
    await expect(page.locator('#nav')).toBeVisible();
    await expect(page.locator('#navShow')).toBeHidden();
  });

  test('double-clicking the grip fits the longest name on show', async ({ page }) => {
    await openExample(page);
    await page.locator('.wd-main').evaluate((m) => m.style.setProperty('--navw', '150px'));
    await page.locator('#navGrip').dblclick();

    // nothing rendered is clipped any more
    const clipped = await page.locator('#tree .nm').evaluateAll((els) =>
      els.filter((e) => e.scrollWidth > e.clientWidth + 1).length
    );
    expect(clipped).toBe(0);
    expect(await navWidth(page)).toBeLessThanOrEqual(720);
  });
});
