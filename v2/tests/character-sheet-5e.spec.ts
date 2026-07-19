import { test, expect, type Page } from '@playwright/test';

// The D&D character composite (composites/dnd-character.ts) lays a computed
// build out like the printed 5e sheet: a three-column body — abilities, saves
// and skills down the left; the combat block and attacks in the middle;
// roleplay and features on the right — then a character-detail page, and a
// spellcasting page whose slots tick down as you cast and whose spells hover
// for their card. The paper sheet, with a webpage's conveniences.

const blocks = (p: Page) => p.locator('[data-blocks] > .block');

async function openCharacter(page: Page, query: string): Promise<void> {
  await page.goto(`/sheet/?template=gm/dnd-character&${query}`);
  await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
}

// A caster, fixed seed → a reproducible sheet with a spell page.
const WIZARD = 'class=wizard&race=elf&level=5&subclass=evocation&abilities=array&seed=e2e';

test.describe('the 5e character sheet layout', () => {
  test('page 1 is the three-column sheet — saves, skills and attacks in place', async ({ page }) => {
    await openCharacter(page, WIZARD);
    // the body is a three-column grid — the printed sheet's shape
    await expect(page.locator('[data-blocks] .b-columns.cols-3').first()).toBeVisible();
    // the classic regions, each where the sheet puts them
    await expect(page.locator('.b-actions', { hasText: 'Saving Throws' })).toBeVisible();
    await expect(page.locator('.b-actions', { hasText: 'Skills' })).toBeVisible();
    await expect(page.locator('.b-actions', { hasText: 'Attacks' })).toBeVisible();
    // abilities are a strip of boxes — STR lives in the left column
    await expect(page.locator('.b-statGrid .stat-box', { hasText: 'STR' })).toBeVisible();
    // the sheet breaks into pages: a character-detail page and a spellcasting page
    await expect(page.locator('.b-pageBreak')).toHaveCount(2);
    await expect(page.locator('[data-blocks]')).toContainText('Character Details');
    await expect(page.locator('[data-blocks]')).toContainText('Spellcasting');
  });

  test('spell slots are clickable boxes that tick down as you cast', async ({ page }) => {
    await openCharacter(page, WIZARD);
    // to play mode, where the sheet is used at the table
    await page.locator('[data-mode-toggle]').click();
    // a wizard's 1st-level slots: four boxes, all available to start
    const slots = page.locator('.b-tracker', { hasText: 'Level 1 Slots' });
    await expect(slots).toBeVisible();
    await expect(slots.locator('.tracker-box')).toHaveCount(4);
    await expect(slots.locator('.tracker-box.filled')).toHaveCount(4);
    // cast a spell: click the last filled box to expend a slot
    await slots.locator('.tracker-box').nth(3).click();
    await expect(slots.locator('.tracker-box.filled')).toHaveCount(3);
    // the expended slot is state — it survives a reload
    await page.reload();
    await expect(
      page.locator('.b-tracker', { hasText: 'Level 1 Slots' }).locator('.tracker-box.filled'),
    ).toHaveCount(3);
  });

  test('a spellbook spell hovers for its SRD card in play mode', async ({ page }) => {
    await openCharacter(page, WIZARD);
    await page.locator('[data-mode-toggle]').click();
    // the spellbook renders each spell as a hoverable chip once out of edit mode
    const chip = page.locator('.chip-spell').first();
    await expect(chip).toBeVisible();
    await chip.hover();
    await expect(page.locator('.spell-card:not([hidden])')).toBeVisible();
  });
});
