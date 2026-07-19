import { test, expect, type Page } from '@playwright/test';

// Phase D (docs/CAMPAIGN-CODEX.md): a [[spell:Fireball]] token in any block text
// becomes a hoverable chip; hovering shows the SRD spell card (level, casting
// time, range, components, duration, effect). Only live outside edit mode.

async function seedPlaySheet(page: Page, blocks: unknown[]): Promise<void> {
  await page.goto('/sheet/');
  await page.evaluate((bs) => {
    localStorage.setItem(
      'stb:sheets:v1',
      JSON.stringify({ activeId: 's1', sheets: [{ id: 's1', name: 'Spells', mode: 'play', blocks: bs }] }),
    );
  }, blocks);
  await page.reload();
}

test.describe('spell hover card', () => {
  test('a [[spell:]] token becomes a chip whose card shows the mechanics', async ({ page }) => {
    await seedPlaySheet(page, [{ type: 'paragraph', id: 'p1', text: 'Cast [[spell:Fireball]] at the goblins.' }]);
    const chip = page.locator('.chip-spell', { hasText: 'Fireball' });
    await expect(chip).toBeVisible();
    await chip.hover();
    const card = page.locator('.spell-card:not([hidden])');
    await expect(card).toBeVisible();
    await expect(card).toContainText('3rd-level'); // Fireball is a 3rd-level evocation
    await expect(card).toContainText('Casting Time');
    await expect(card).toContainText('150 feet');
  });

  test('an un-authored class spell still shows at least its level', async ({ page }) => {
    await seedPlaySheet(page, [{ type: 'paragraph', id: 'p1', text: 'Prepare [[spell:Bane]] tonight.' }]);
    const chip = page.locator('.chip-spell', { hasText: 'Bane' });
    await chip.hover();
    await expect(page.locator('.spell-card:not([hidden])')).toContainText('1st-level');
  });

  test('a broken token stays literal — user text is never eaten', async ({ page }) => {
    await seedPlaySheet(page, [{ type: 'paragraph', id: 'p1', text: 'Not a spell: [[spell:]].' }]);
    await expect(page.locator('[data-blocks]')).toContainText('[[spell:]]');
    await expect(page.locator('.chip-spell')).toHaveCount(0);
  });

  test('a character spellbook is dropdowns to build, hover cards to read', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=wizard&race=gnome&level=5&abilities=array');
    await expect(page.locator('[data-blocks] > .block').first()).toBeAttached({ timeout: 15_000 });
    const cantrips = page.locator('.b-choiceList', { hasText: 'Cantrips' });
    // edit mode (default): pick each spell from a dropdown; the only chips
    // are the compact ⓘ info chips beside each row (owner ask 2026-07-19 —
    // the card is hoverable even in the dropdown), never full name chips
    await expect(cantrips.locator('select.choice-select').first()).toBeVisible();
    await expect(cantrips.locator('.chip-spell:not(.chip-spell-info)')).toHaveCount(0);
    const rows = await cantrips.locator('select.choice-select').count();
    await expect(cantrips.locator('.chip-spell-info')).toHaveCount(rows);
    // switch to play mode: the spells become full hoverable spell chips
    await page.locator('[data-mode-toggle]').click();
    const chip = cantrips.locator('.chip-spell').first();
    await expect(chip).toBeVisible();
    await chip.hover();
    await expect(page.locator('.spell-card:not([hidden])')).toBeVisible();
  });
});
