import { test, expect, type Page } from '@playwright/test';

// Drives the world tree in a real browser against the real Earth — 2026 fixture
// (4,113 entities). This is the half of item #5 that check/smoke can't reach:
// the DOM wiring. The algorithm was validated separately; this proves the
// buttons are actually connected to it.

const rows = (p: Page) => p.locator('#tree .node');

async function openExample(page: Page) {
  await page.goto('/world/');
  await page.getByRole('button', { name: 'Load example' }).click();
  // the fixture is 4.3MB and the island stores it into IndexedDB before
  // rendering — wait for the tree to actually populate
  await expect(rows(page).first()).toBeVisible({ timeout: 90_000 });
}

test.describe('world tree (item #5)', () => {
  test('opens collapsed — a handful of rows, not thousands', async ({ page }) => {
    await openExample(page);
    const n = await rows(page).count();
    console.log(`  tree opened with ${n} rows (fixture has 4,113 entities)`);
    // the whole point: the old default rendered every node
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(60);
  });

  test('top-level groups render open by default', async ({ page }) => {
    await openExample(page);
    // only NON-EMPTY groups render, and every root in Earth — 2026 is a region
    // or a landmark (both Geography), so this world shows exactly one group.
    // Politics / People & Story appear once something is filed at root.
    const grps = page.locator('#tree .grp');
    expect(await grps.count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#tree .grp', { hasText: 'Geography' })).toBeVisible();
    // open by default means its children are already listed
    await expect(rows(page).first()).toBeVisible();
  });

  test('expanding a branch reveals its children; collapsing hides them', async ({ page }) => {
    await openExample(page);
    const before = await rows(page).count();
    await page.locator('#tree .tw[data-toggle^="e_"]').first().click();
    const opened = await rows(page).count();
    expect(opened).toBeGreaterThan(before);
    await page.locator('#tree .tw[data-toggle^="e_"]').first().click();
    expect(await rows(page).count()).toBe(before);
  });

  test('clicking a page opens just that spot and keeps it in view', async ({ page }) => {
    await openExample(page);
    // drill in two levels, then select a leaf
    await page.locator('#tree .tw[data-toggle^="e_"]').first().click();
    const child = rows(page).nth(1);
    const childId = await child.getAttribute('data-id');
    await child.click();
    const active = page.locator('#tree .node.active');
    await expect(active).toHaveAttribute('data-id', childId!);
    await expect(active).toBeInViewport();
  });

  test('a search hit reveals its path in the tree, not just a flat list', async ({ page }) => {
    await openExample(page);
    const search = page.locator('#treeSearch');
    await search.fill('grange'); // a hamlet ending — plenty of hits in any Earth
    await expect(page.locator('#tree .hitpath').first()).toBeVisible();
    const hit = rows(page).first();
    const hitId = await hit.getAttribute('data-id');
    await hit.click();

    // picking a hit means "take me there": the query clears and we land in the
    // HIERARCHY at that page, not back on the flat hit list
    await expect(search).toHaveValue('');
    await expect(page.locator('#tree .grp').first()).toBeVisible();
    const active = page.locator('#tree .node.active');
    await expect(active).toHaveAttribute('data-id', hitId!);
    await expect(active).toBeInViewport();
  });
});

test.describe('hidden regions (item #5c)', () => {
  test('locking a region sinks it to the Hidden shelf; unlocking restores it', async ({ page }) => {
    await openExample(page);
    const target = rows(page).first();
    const targetId = await target.getAttribute('data-id');
    const before = await rows(page).count();

    // the lock only appears on hover
    await target.hover();
    await page.locator(`#tree .lk[data-hide="${targetId}"]`).click();

    // gone from the tree, and a Hidden group appeared
    await expect(page.locator(`#tree .node[data-id="${targetId}"]`)).toHaveCount(0);
    const hiddenGrp = page.locator('#tree .grp', { hasText: 'Hidden' });
    await expect(hiddenGrp).toBeVisible();

    // open the shelf and unlock it
    await hiddenGrp.locator('.tw').click();
    await page.locator(`#tree .lk[data-show="${targetId}"]`).click();
    await expect(page.locator(`#tree .node[data-id="${targetId}"]`).first()).toBeVisible();
    expect(await rows(page).count()).toBe(before);
  });

  test('hidden state survives a reload', async ({ page }) => {
    await openExample(page);
    const target = rows(page).first();
    const targetId = await target.getAttribute('data-id');
    await target.hover();
    await page.locator(`#tree .lk[data-hide="${targetId}"]`).click();
    await expect(page.locator('#tree .grp', { hasText: 'Hidden' })).toBeVisible();

    await page.reload();
    await expect(rows(page).first()).toBeVisible({ timeout: 90_000 });
    // still hidden, and still off the main tree
    await expect(page.locator('#tree .grp', { hasText: 'Hidden' })).toBeVisible();
    await expect(page.locator(`#tree .node[data-id="${targetId}"]`)).toHaveCount(0);
  });
});
