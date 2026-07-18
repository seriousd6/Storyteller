import { test, expect } from '@playwright/test';
import { insertBlock } from './helpers';

// Play mode folds the authoring frame away (§16 + the workspace audit):
// a player at the table gets the sheet, the sheet picker, Edit, Print, the
// roll log, and their dice — not Delete under a thumb, not Drive plumbing,
// not a template gallery. Leaving play restores everything.

test.describe('play mode chrome', () => {
  test('entering play hides authoring chrome; leaving restores it', async ({ page }) => {
    await page.goto('/sheet/');
    await insertBlock(page, 'note');
    await expect(page.locator('[data-new]')).toBeVisible();
    await expect(page.locator('[data-brew-panel]')).toBeVisible();
    await page.locator('[data-mode-toggle]').click();
    for (const sel of [
      '[data-new]', '[data-from-template]', '[data-rename]', '[data-delete]',
      '[data-genre-pin]', '[data-pages-toggle]', '[data-export]', '[data-drive-save]',
      '[data-sync-pill]', '.drive-hint', '[data-brew-panel]', '[data-trash-panel]',
    ]) {
      await expect(page.locator(sel)).toBeHidden();
    }
    // kept at the table: picker, Edit, Print, the roll log, the dice
    await expect(page.locator('[data-sheet-select]')).toBeVisible();
    await expect(page.locator('[data-mode-toggle]')).toHaveText('✎ Edit');
    await expect(page.locator('[data-print]')).toBeVisible();
    await expect(page.locator('[data-roll-log]')).toBeVisible();
    await expect(page.locator('[data-dice-panel]')).toBeVisible();
    await page.locator('[data-mode-toggle]').click();
    await expect(page.locator('[data-new]')).toBeVisible();
    await expect(page.locator('[data-brew-panel]')).toBeVisible();
  });

  test('rolls speak player, not engine — stage and log carry no $-syntax', async ({ page }) => {
    await page.goto('/sheet/');
    await page.evaluate(() => {
      localStorage.setItem(
        'stb:sheets:v1',
        JSON.stringify({
          activeId: 's1',
          sheets: [
            {
              id: 's1',
              name: 'PC',
              mode: 'play',
              blocks: [
                {
                  type: 'statGrid',
                  id: 'sg1',
                  computeMods: true,
                  rollable: true,
                  stats: [{ label: 'STR', value: '16' }],
                },
              ],
            },
          ],
        }),
      );
    });
    await page.reload();
    await page.locator('button.stat-box').click();
    // the stage names the check instead of showing the raw formula
    await expect(page.locator('.dice-stage .formula')).toHaveText('STR check');
    await page.locator('[data-roll-log] summary').click();
    const entry = page.locator('[data-roll-entries] li').first();
    await expect(entry).toContainText('STR check');
    await expect(entry).toContainText('(str.mod)');
    await expect(entry).not.toContainText('$');
  });
});
