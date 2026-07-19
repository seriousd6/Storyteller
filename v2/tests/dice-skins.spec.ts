import { test, expect, type Page } from '@playwright/test';

// PLAN.md §17: dice skins. The genre brings its own dice, the player can
// pick any set site-wide, build their own in the editor (a DOCUMENT: it
// lists in the Library), and pin a set to one sheet.

async function seedRollableSheet(page: Page) {
  await page.goto('/sheet/');
  await page.evaluate(() => {
    localStorage.setItem(
      'stb:sheets:v1',
      JSON.stringify({
        activeId: 's1',
        sheets: [
          { id: 's1', name: 'Skin Test', mode: 'play', blocks: [{ type: 'paragraph', id: 'p1', text: 'Damage [[2d6+3]] on a hit.' }] },
        ],
      }),
    );
  });
  await page.reload();
}

// the skin paints every polyhedron facet (.df since the 3D table)
const dieColor = (page: Page) =>
  page.locator('.dice-table .df').first().evaluate((el) => getComputedStyle(el).backgroundColor);

test('the genre brings its own dice: parchment by default, console under sci-fi', async ({ page }) => {
  await seedRollableSheet(page);
  await page.locator('.chip-dice').click();
  await expect(page.locator('.dice-stage')).toBeVisible();
  expect(await dieColor(page)).toBe('rgb(243, 234, 216)'); // parchment
  // flip the site to sci-fi: the pack's --dice-skin token now names console
  await page.locator('#genre-pick').selectOption('scifi');
  await page.locator('.chip-dice').click();
  await expect(page.locator('.dice-stage')).toBeVisible();
  expect(await dieColor(page)).toBe('rgb(13, 27, 33)'); // console
});

test('a custom skin: built in the editor, rolls the attacks, lists in the Library', async ({ page }) => {
  await seedRollableSheet(page);
  await page.locator('[data-dice-panel] summary').click();
  await page.locator('[data-skin-new]').click();
  await page.locator('[data-skin-name]').fill('Dragon Jade');
  await page.locator('[data-skin-body]').fill('#123456');
  await page.locator('[data-skin-material]').selectOption('metal');
  await page.locator('[data-skin-save]').click();
  // it appears in the list; picking it makes it the site-wide choice
  await page.locator('input[aria-label="Roll with Dragon Jade"]').check();
  await page.locator('.chip-dice').click();
  await expect(page.locator('.dice-stage')).toBeVisible();
  expect(await dieColor(page)).toBe('rgb(18, 52, 86)');
  await expect(page.locator('.dice-stage')).toHaveClass(/mat-metal/);
  // a skin is a document: the Library shelves it
  await page.goto('/library/');
  await expect(page.locator('.lib-diceskin', { hasText: 'Dragon Jade' })).toBeVisible();
});

test('a sheet pins its dice: the pin beats the site choice and survives reload', async ({ page }) => {
  await seedRollableSheet(page);
  await page.locator('[data-dice-panel] summary').click();
  await page.locator('[data-skin-pin]').selectOption('bone');
  await page.locator('.chip-dice').click();
  await expect(page.locator('.dice-stage')).toBeVisible();
  expect(await dieColor(page)).toBe('rgb(232, 224, 208)'); // bone, not parchment
  await page.reload();
  await page.locator('[data-dice-panel] summary').click();
  await expect(page.locator('[data-skin-pin]')).toHaveValue('bone');
  await page.locator('.chip-dice').click();
  await expect(page.locator('.dice-stage')).toBeVisible();
  expect(await dieColor(page)).toBe('rgb(232, 224, 208)');
});
