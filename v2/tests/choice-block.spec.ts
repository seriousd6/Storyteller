import { test, expect, type Page } from '@playwright/test';
import { insertBlock, pinIsDurable } from './helpers';

// The choice block (docs/CAMPAIGN-CODEX.md): a labelled dropdown. A character's
// discrete picks (subclass features, fighting style) arrive rolled but editable;
// users can add their own from the palette. The pick is state — it persists.

const blocks = (p: Page) => p.locator('[data-blocks] > .block');

test.describe('choice block (an in-sheet dropdown)', () => {
  test('a character sheet subclass pick is a real dropdown, and a re-pick persists', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=sorcerer&race=tiefling&level=1&subclass=draconic&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const choice = page.locator('.b-choice', { hasText: 'Dragon Ancestor' });
    await expect(choice).toBeVisible();
    const sel = choice.locator('select.choice-select');
    // it's a real <select>, offering all ten SRD dragon ancestors
    await expect(sel.locator('option')).toHaveCount(10);
    // and changing it is STATE, not chrome: pick a different ancestor, and the
    // composite-emitted choice sticks across a reload (proves it's on the sink)
    const cur = await sel.inputValue();
    const target = cur === 'Red (fire)' ? 'Blue (lightning)' : 'Red (fire)';
    await sel.selectOption(target);
    await pinIsDurable(page); // the pick must reach IndexedDB before we reload
    await page.reload();
    await expect(
      page.locator('.b-choice', { hasText: 'Dragon Ancestor' }).locator('select.choice-select'),
    ).toHaveValue(target);
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

  test('🎲 rolls a random option — roller-page parity in the sheet builder', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=sorcerer&race=tiefling&level=1&subclass=draconic&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const choice = page.locator('.b-choice', { hasText: 'Dragon Ancestor' });
    const before = await choice.locator('select.choice-select').inputValue();
    await choice.locator('.mini', { hasText: '🎲' }).click();
    // the roll always lands on a DIFFERENT option when the pool offers one
    await expect(choice.locator('select.choice-select')).not.toHaveValue(before);
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

  test('multi-pick class choices are dropdowns over a real pool that persists (sorcerer metamagic)', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=sorcerer&race=tiefling&level=3&subclass=draconic&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const meta = page.locator('.b-choiceList', { hasText: 'Metamagic' });
    const sel = meta.locator('select.choice-select').first();
    await expect(sel).toBeVisible();
    // the pool is the real SRD metamagic list, not an empty/degenerate one
    await expect(sel.locator('option', { hasText: 'Quickened Spell' })).toHaveCount(1);
    // and re-picking a row is state: choose a known option and it survives reload
    const cur = await sel.inputValue();
    const target = cur === 'Subtle Spell' ? 'Quickened Spell' : 'Subtle Spell';
    await sel.selectOption(target);
    await pinIsDurable(page);
    await page.reload();
    await expect(
      page.locator('.b-choiceList', { hasText: 'Metamagic' }).locator('select.choice-select').first(),
    ).toHaveValue(target);
  });

  test('🎲 rerolls one row from the pool, preferring options no row holds', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=sorcerer&race=tiefling&level=3&subclass=draconic&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const meta = page.locator('.b-choiceList', { hasText: 'Metamagic' });
    const before = await meta.locator('select.choice-select').first().inputValue();
    await meta.locator('.choice-list li').first().locator('.mini', { hasText: '🎲' }).click();
    await expect(meta.locator('select.choice-select').first()).not.toHaveValue(before);
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
