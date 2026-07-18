import { test, expect, type Page } from '@playwright/test';
import { insertBlock, pinIsDurable } from './helpers';

// The choice block (docs/CAMPAIGN-CODEX.md): a labelled dropdown. A character's
// discrete picks (subclass features, fighting style) arrive rolled but editable;
// users can add their own from the palette. The pick is state — it persists.

const blocks = (p: Page) => p.locator('[data-blocks] > .block');

test.describe('choice block (an in-sheet dropdown)', () => {
  test('a character sheet renders its subclass pick as a real dropdown', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=sorcerer&race=tiefling&level=1&subclass=draconic&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const choice = page.locator('.b-choice', { hasText: 'Dragon Ancestor' });
    await expect(choice).toBeVisible();
    // it's a real <select>, offering all ten SRD dragon ancestors
    await expect(choice.locator('select.choice-select')).toBeVisible();
    await expect(choice.locator('select.choice-select option')).toHaveCount(10);
  });

  test('adds from the palette, and the chosen option persists across reload', async ({ page }) => {
    await page.goto('/sheet/');
    await insertBlock(page, 'choice');
    const sel = page.locator('.b-choice select.choice-select').first();
    await expect(sel).toBeVisible();
    await expect(sel).toHaveValue('Option A'); // the palette default
    await sel.selectOption('Option B');
    await pinIsDurable(page); // the pick must land in IndexedDB before we navigate
    await page.reload();
    await expect(page.locator('.b-choice select.choice-select').first()).toHaveValue('Option B');
  });
});
