import { test, expect, type Page } from '@playwright/test';

// The sheet editor after the Block Kit refactor (docs/sheets/PLAN.md §3):
// same editing behavior as before, plus the undo bus. These drive the real
// hydrated /sheet/ island — the surface check/validate/smoke never load.

const blocks = (p: Page) => p.locator('[data-blocks] > .block');

test.describe('sheet editor', () => {
  test('adds a heading and a note, and they persist across reload', async ({ page }) => {
    await page.goto('/sheet/');
    await page.locator('[data-add-title]').click();
    await page.locator('[data-add-note]').click();
    await expect(blocks(page)).toHaveCount(2);
    const h = page.locator('[data-blocks] .block h2');
    await h.fill('Dragon Lair');
    await h.blur();
    await page.reload();
    await expect(blocks(page)).toHaveCount(2);
    await expect(page.locator('[data-blocks] .block h2')).toHaveText('Dragon Lair');
  });

  test('undo restores a removed block; redo removes it again', async ({ page }) => {
    await page.goto('/sheet/');
    await page.locator('[data-add-title]').click();
    await page.locator('[data-add-note]').click();
    await expect(blocks(page)).toHaveCount(2);
    await blocks(page).nth(1).hover();
    await blocks(page).nth(1).locator('[aria-label="Remove"]').click();
    await expect(blocks(page)).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(blocks(page)).toHaveCount(2);
    await page.keyboard.press('Control+y');
    await expect(blocks(page)).toHaveCount(1);
  });

  test('a whole text-edit session is ONE undo step', async ({ page }) => {
    await page.goto('/sheet/');
    await page.locator('[data-add-title]').click();
    const h = page.locator('[data-blocks] .block h2');
    await expect(h).toHaveText('New heading');
    await h.fill('Dragon Lair');
    await h.blur();
    await expect(h).toHaveText('Dragon Lair');
    // one ctrl+Z rewinds the whole session, not one keystroke
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-blocks] .block h2')).toHaveText('New heading');
    await page.keyboard.press('Control+Shift+z');
    await expect(page.locator('[data-blocks] .block h2')).toHaveText('Dragon Lair');
  });

  test('move down then undo restores the original order', async ({ page }) => {
    await page.goto('/sheet/');
    await page.locator('[data-add-title]').click();
    await page.locator('[data-add-note]').click();
    // heading first, note second
    await expect(blocks(page).nth(0).locator('h2')).toHaveCount(1);
    await blocks(page).nth(0).hover();
    await blocks(page).nth(0).locator('[aria-label="Move down"]').click();
    await expect(blocks(page).nth(1).locator('h2')).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(blocks(page).nth(0).locator('h2')).toHaveCount(1);
  });

  test('structural edits inside a block are undoable (add list-style field)', async ({ page }) => {
    await page.goto('/sheet/');
    // a keyValue block arrives via pinning in real flows; build one directly
    await page.evaluate(() => {
      localStorage.setItem(
        'stb:sheets:v1',
        JSON.stringify({
          activeId: 's1',
          sheets: [
            {
              id: 's1',
              name: 'Test',
              blocks: [{ type: 'keyValue', id: 'kv1', pairs: [{ key: 'Owner', value: 'Vera' }] }],
            },
          ],
        }),
      );
    });
    await page.reload();
    await expect(page.locator('[data-blocks] .b-keyValue p')).toHaveCount(1);
    await blocks(page).first().hover();
    await page.locator('[aria-label="Add field"]').click();
    await expect(page.locator('[data-blocks] .b-keyValue p')).toHaveCount(2);
    await page.keyboard.press('Control+z');
    await expect(page.locator('[data-blocks] .b-keyValue p')).toHaveCount(1);
  });
});
