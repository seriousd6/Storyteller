import { test, expect, type Page } from '@playwright/test';

// PLAN.md §14, first slice: a player uploads their character's portrait.
// Content-hashed asset in IndexedDB, image block on the sheet, float
// layout, persistence, and the empty slot hiding itself outside edit mode.

/** A REAL png, drawn by the browser itself — hand-fabricated bytes fail
 *  createImageBitmap ("source image could not be decoded"). */
async function pngUpload(page: Page, name: string) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#8b0000';
    ctx.fillRect(0, 0, 8, 8);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

test('upload a portrait: renders, floats, persists, hides its chrome in play', async ({ page }) => {
  await page.goto('/sheet/');
  await page.locator('[data-add-image]').click();
  await expect(page.locator('.b-image .img-empty')).toBeVisible();
  await page.locator('.b-image input[type=file]').setInputFiles(await pngUpload(page, 'portrait.png'));
  const img = page.locator('.b-image img');
  await expect(img).toBeVisible();
  // the block floats right by default — the character-portrait classic
  await expect(page.locator('.b-image')).toHaveClass(/img-float-right/);
  // caption edits in place
  const cap = page.locator('.b-image figcaption');
  await cap.fill('Vera the Bold');
  await cap.blur();
  // persists across reload (asset store + sheet store both IndexedDB)
  await page.reload();
  await expect(page.locator('.b-image img')).toBeVisible();
  await expect(page.locator('.b-image figcaption')).toHaveText('Vera the Bold');
  // play mode: image + caption stay, upload chrome goes
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('.b-image img')).toBeVisible();
  await expect(page.locator('.img-tools')).toHaveCount(0);
});

test('an empty image slot is invisible outside edit mode', async ({ page }) => {
  await page.goto('/sheet/');
  await page.locator('[data-add-image]').click();
  await expect(page.locator('.b-image .img-empty')).toBeVisible();
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('.b-image')).toBeHidden();
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('.b-image .img-empty')).toBeVisible();
});

test('the character template ships a portrait slot; upload survives undo of a mis-remove', async ({ page }) => {
  await page.goto('/sheet/');
  await page.locator('[data-from-template]').click();
  await page.locator('[data-template-id="character-sheet"]').click();
  await expect(page.locator('[data-sheet-name]')).toHaveText('Character Sheet');
  await page.locator('.b-image input[type=file]').setInputFiles(await pngUpload(page, 'hero.png'));
  await expect(page.locator('.b-image img')).toBeVisible();
  // remove the image, then undo — the portrait returns
  await page.locator('[aria-label="Remove the image (keeps the block)"]').click();
  await expect(page.locator('.b-image img')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('.b-image img')).toBeVisible();
});
