import { test, expect, type Page } from '@playwright/test';
import { pinIsDurable } from './helpers';

// The solo loop (GM/solo audit batch C): the oracle records the QUESTION with
// the answer, and the session log keeps every roll of the sitting instead of
// destroying each one on Generate. Smoke can't see any of this — the input,
// the hash param, sessionStorage, and the pin pipeline only exist hydrated.

const preview = (p: Page) => p.locator('[data-preview]');

async function hydrated(page: Page) {
  await expect(preview(page).locator('.b-statblock')).toBeVisible({ timeout: 30_000 });
}

test.describe('the question rides with the answer', () => {
  test('typed question appears in the result, the hash, and a fresh tab', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    await page.locator('input[data-ask]').fill('Will the guard believe us?');
    await page.locator('[data-generate]').click();
    await expect(preview(page)).toContainText('You asked');
    await expect(preview(page)).toContainText('Will the guard believe us?');
    expect(page.url()).toContain('question=');
    // the answer itself (statblock name) reproduces from the link, question included
    const answer = (await preview(page).locator('h3').first().textContent())!.trim();
    const page2 = await page.context().newPage();
    await page2.goto(page.url());
    await expect(preview(page2).locator('h3').first()).toHaveText(answer, { timeout: 30_000 });
    await expect(preview(page2)).toContainText('Will the guard believe us?');
    await expect(page2.locator('input[data-ask]')).toHaveValue('Will the guard believe us?');
    await page2.close();
  });

  test('Enter in the ask box asks it', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    const before = page.url();
    await page.locator('input[data-ask]').fill('Does the door open?');
    await page.locator('input[data-ask]').press('Enter');
    await expect(preview(page)).toContainText('Does the door open?');
    expect(page.url()).not.toBe(before); // a fresh seed was minted
  });

  test('a pinned answer lands on the sheet WITH its question', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    await page.locator('input[data-ask]').fill('Is the merchant lying?');
    await page.locator('[data-generate]').click();
    await expect(preview(page)).toContainText('Is the merchant lying?');
    await page.locator('[data-add]').click();
    await pinIsDurable(page);
    await page.goto('/sheet/');
    await expect(page.locator('[data-blocks]')).toContainText('Is the merchant lying?');
  });
});

test.describe('the session log', () => {
  test('each Generate files the previous roll; entries restore and clear', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    // the auto-roll on load is roll #1 — nothing to file yet
    await expect(page.locator('[data-log]')).toBeHidden();
    await page.locator('input[data-ask]').fill('First question?');
    await page.locator('[data-generate]').click(); // files the auto-roll
    await page.locator('[data-generate]').click(); // files "First question?"
    const items = page.locator('[data-log] .roll-log-item');
    await expect(items).toHaveCount(2);
    // newest first: the top entry carries the question it was asked with
    await expect(items.first()).toContainText('First question?');
    // ↩ brings an old roll back into the main preview (same answer + question)
    const headBefore = (await items.first().locator('strong').textContent())!.trim();
    await items.first().locator('[aria-label="Bring this one back"]').click();
    await expect(preview(page).locator('h3').first()).toContainText(headBefore);
    await expect(preview(page)).toContainText('First question?');
    // and Clear empties it
    await page.locator('[data-log-clear]').click();
    await expect(page.locator('[data-log]')).toBeHidden();
  });

  test('the log survives a refresh (same tab = same session)', async ({ page }) => {
    await page.goto('/solo/scene/');
    await hydrated(page);
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-log] .roll-log-item')).toHaveCount(1);
    await page.reload();
    await hydrated(page);
    await expect(page.locator('[data-log] .roll-log-item')).toHaveCount(1);
  });

  test('📌 from the log pins the real blocks to the worksheet', async ({ page }) => {
    await page.goto('/solo/outcome/');
    await hydrated(page);
    await page.locator('[data-generate]').click();
    const item = page.locator('[data-log] .roll-log-item').first();
    await expect(item).toBeVisible();
    await expect(page.locator('[data-tray-count]')).toHaveText('0');
    await item.locator('[aria-label="Pin this one to the worksheet"]').click();
    await expect(page.locator('[data-tray-count]')).toHaveText('1');
  });
});
