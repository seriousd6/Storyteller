import { test, expect, type Page } from '@playwright/test';
import { insertBlock, pinIsDurable } from './helpers';

// The ＋ Insert workspace (adversarial-audit batch): ONE menu inserts every
// block type — including the seven that could previously only arrive via
// pins or templates — the table picker browses the whole table forest
// instead of a prompt(), and every block's edge ＋ inserts exactly there.

const blocks = (p: Page) => p.locator('[data-blocks] > .block');

test.describe('insert menu', () => {
  test('inserts the game blocks the old toolbar never offered', async ({ page }) => {
    await page.goto('/sheet/');
    await insertBlock(page, 'tracker');
    await insertBlock(page, 'statgrid');
    await insertBlock(page, 'actions');
    await insertBlock(page, 'table');
    await expect(blocks(page)).toHaveCount(4);
    await expect(blocks(page).nth(0)).toHaveClass(/block-tracker/);
    await expect(blocks(page).nth(1)).toHaveClass(/block-statGrid/);
    await expect(blocks(page).nth(2)).toHaveClass(/block-actions/);
    await expect(blocks(page).nth(3)).toHaveClass(/block-table/);
    await pinIsDurable(page);
    await page.reload();
    await expect(blocks(page)).toHaveCount(4);
  });

  test('a block\'s edge ＋ inserts at that spot, not at the end', async ({ page }) => {
    await page.goto('/sheet/');
    await insertBlock(page, 'title');
    await insertBlock(page, 'note');
    await expect(blocks(page)).toHaveCount(2);
    await blocks(page).nth(1).hover();
    await blocks(page).nth(1).locator('.block-insert').click();
    await page.locator('[data-insert-menu] [data-add-tracker]').click();
    await expect(blocks(page)).toHaveCount(3);
    await expect(blocks(page).nth(0)).toHaveClass(/block-title/);
    await expect(blocks(page).nth(1)).toHaveClass(/block-tracker/);
    await expect(blocks(page).nth(2)).toHaveClass(/block-paragraph/);
    // and it's one undo step
    await page.keyboard.press('Control+z');
    await expect(blocks(page)).toHaveCount(2);
  });

  test('table picker embeds a searched table and the widget rolls', async ({ page }) => {
    await page.goto('/sheet/');
    await page.locator('[data-insert-open]').click();
    await page.locator('[data-insert-menu] [data-add-rolltable]').click();
    await expect(page.locator('[data-table-picker]')).toBeVisible();
    await page.locator('[data-picker-search]').fill('tavern/rumor');
    await page.locator('.picker-row[data-ref="gm/tavern/rumor"]').click();
    await expect(page.locator('[data-table-picker]')).toBeHidden();
    await expect(blocks(page).first()).toHaveClass(/block-rollTable/);
    // rolls through the real engine — the table chunk loads live
    await blocks(page).first().locator('.rt-roll').click();
    await expect(blocks(page).first().locator('.rt-results li')).toHaveCount(1);
  });

  test('closes on Escape; play mode hides every structural insert', async ({ page }) => {
    await page.goto('/sheet/');
    await insertBlock(page, 'note');
    await page.locator('[data-insert-open]').click();
    await expect(page.locator('[data-insert-menu]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-insert-menu]')).toBeHidden();
    await expect(page.locator('[data-sheet-add]')).toBeVisible();
    await page.locator('[data-mode-toggle]').click();
    await expect(page.locator('[data-insert-open]')).toBeHidden();
    await expect(page.locator('[data-sheet-add]')).toBeHidden();
    await expect(page.locator('.block-insert')).toHaveCount(0);
  });
});
