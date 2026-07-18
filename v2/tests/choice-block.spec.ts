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

// choiceList: a labelled group of dropdowns over one pool — the character's
// spellbook (pick each spell from the class list) and its multi-pick choices.
test.describe('choiceList block (a group of dropdowns)', () => {
  test('a caster spellbook renders each spell as a dropdown over the class list', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=wizard&race=gnome&level=5&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const cantrips = page.locator('.b-choiceList', { hasText: 'Cantrips' });
    await expect(cantrips).toBeVisible();
    // a real dropdown, offering a pool of wizard cantrips to choose from
    await expect(cantrips.locator('select.choice-select').first()).toBeVisible();
    expect(await cantrips.locator('select.choice-select').first().locator('option').count()).toBeGreaterThan(5);
    // leveled spells are dropdowns too
    await expect(page.locator('.b-choiceList', { hasText: '1st-Level Spells' })).toBeVisible();
  });

  test('multi-pick class choices are dropdowns (sorcerer metamagic)', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=sorcerer&race=tiefling&level=3&subclass=draconic&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('.b-choiceList', { hasText: 'Metamagic' }).locator('select.choice-select').first()).toBeVisible();
  });

  test('added from the palette: add a row, pick, and it persists across reload', async ({ page }) => {
    await page.goto('/sheet/');
    await insertBlock(page, 'choicelist');
    const cl = page.locator('.b-choiceList').first();
    await expect(cl.locator('select.choice-select')).toHaveCount(1); // one row to start
    await cl.locator('button', { hasText: 'add' }).click(); // ＋ add a row
    await expect(cl.locator('select.choice-select')).toHaveCount(2);
    await cl.locator('select.choice-select').nth(1).selectOption('Option C');
    await pinIsDurable(page);
    await page.reload();
    const rows = page.locator('.b-choiceList').first().locator('select.choice-select');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toHaveValue('Option C');
  });
});
