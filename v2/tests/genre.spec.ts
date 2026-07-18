import { test, expect, type Page } from '@playwright/test';
import { insertBlock } from './helpers';

// PLAN.md §15 + §14: genre themes and the image fades they own. The site
// picker flips the token contract pre-paint; a sheet can pin its own genre;
// the fade picker offers the ACTIVE genre's masks and never edits pixels.

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

test('the site genre picker flips tokens, persists, and applies pre-paint', async ({ page }) => {
  await page.goto('/sheet/');
  const accent = () =>
    page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim());
  const before = await accent();
  await page.locator('#genre-pick').selectOption('scifi');
  await expect(page.locator('html')).toHaveAttribute('data-genre', 'scifi');
  expect(await accent()).not.toBe(before);
  // the pre-paint inline script applies the saved genre before first paint —
  // by document ready the attribute must already be there, no flash-of-fantasy
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-genre', 'scifi');
  await expect(page.locator('#genre-pick')).toHaveValue('scifi');
  // back to the default: fantasy is the ABSENCE of the attribute
  await page.locator('#genre-pick').selectOption('fantasy');
  await expect(page.locator('html')).not.toHaveAttribute('data-genre');
});

test('a sheet pins horror: its surface flips, the site does not, the shelf chips it', async ({ page }) => {
  await page.goto('/sheet/');
  await page.locator('[data-genre-pin]').selectOption('horror');
  await expect(page.locator('[data-sheet]')).toHaveAttribute('data-genre', 'horror');
  await expect(page.locator('html')).not.toHaveAttribute('data-genre');
  // the pin travels with the sheet
  await page.reload();
  await expect(page.locator('[data-sheet]')).toHaveAttribute('data-genre', 'horror');
  await expect(page.locator('[data-genre-pin]')).toHaveValue('horror');
  await page.goto('/library/');
  await expect(page.locator('.lib-chip-genre').first()).toHaveText('horror');
});

test('fades: the picker cycles the active genre\'s masks, strength slides, undo unwinds', async ({ page }) => {
  await page.goto('/sheet/');
  await insertBlock(page, 'image');
  await page.locator('.b-image input[type=file]').setInputFiles(await pngUpload(page, 'art.png'));
  await expect(page.locator('.b-image img')).toBeVisible();
  const shell = page.locator('.img-shell');
  await expect(shell).not.toHaveClass(/img-faded/);

  const fadeBtn = () => page.locator('button[aria-label="Cycle the fade mask (genre set, then none)"]');
  const maskOf = () =>
    shell.evaluate((el) => {
      const s = getComputedStyle(el);
      return s.maskImage || (s as unknown as { webkitMaskImage: string }).webkitMaskImage;
    });

  // default genre (fantasy) → the watercolor splotch leads the set
  await fadeBtn().click();
  await expect(shell).toHaveClass(/img-faded/);
  expect(await maskOf()).toContain('fantasy-splotch');

  // strength is the alpha floor: 0.4 strength → a 0.6 uniform layer
  await page.locator('.fade-strength').fill('0.4');
  expect(await maskOf()).toContain('0.6');

  // pin sci-fi and cycle: the foreign mask restarts the sci-fi set
  await page.locator('[data-genre-pin]').selectOption('scifi');
  await fadeBtn().click();
  expect(await maskOf()).toContain('scifi-hex');

  // undo unwinds look-changes like any other edit
  await page.keyboard.press('Control+z'); // scifi-hex → splotch @0.4
  expect(await maskOf()).toContain('fantasy-splotch');
  await page.keyboard.press('Control+z'); // strength → 0.85
  await page.keyboard.press('Control+z'); // fade → none
  await expect(page.locator('.img-shell')).not.toHaveClass(/img-faded/);
});

test('display faces are self-hosted and actually load (OFL, public/fonts)', async ({ page }) => {
  await page.goto('/sheet/');
  // fantasy default: Alegreya is the display face on every heading
  await page.waitForFunction(
    async () => {
      await document.fonts.ready;
      return document.fonts.check('16px Alegreya');
    },
    undefined,
    { timeout: 15_000 },
  );
  // pin horror on the sheet → IM Fell English loads for its surface
  await page.locator('[data-genre-pin]').selectOption('horror');
  await page.waitForFunction(
    async () => {
      await document.fonts.ready;
      return document.fonts.check('16px "IM Fell English"');
    },
    undefined,
    { timeout: 15_000 },
  );
});
