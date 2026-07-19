import { test, expect } from '@playwright/test';

// The 🎲 Dice tooltip (owner ask 2026-07-19): build a pool of real dice from
// the command bar and tumble them all on the 3D stage — in edit or play,
// every roll filed in the roll log. The stage's dice are SHAPED now (cube d6,
// hexagon d20…) and spin in CSS 3D before settling on the engine's result.

test('build a pool, roll it: shaped dice tumble and the log records it', async ({ page }) => {
  await page.goto('/sheet/');
  await page.locator('[data-dice-open]').click();
  await expect(page.locator('[data-dice-pop]')).toBeVisible();
  // two d6 and a d20
  await page.locator('.dice-kind-add', { hasText: /^d6$/ }).click();
  await page.locator('.dice-kind-add', { hasText: /^d6$/ }).click();
  await page.locator('.dice-kind-add', { hasText: /^d20$/ }).click();
  await expect(page.locator('[data-dice-formula]')).toHaveText('2d6 + 1d20');
  await page.locator('[data-dice-roll]').click();
  // the stage: three dice, each one wearing its shape, and a total
  const stage = page.locator('.dice-stage');
  await expect(stage).toBeVisible();
  await expect(stage.locator('.die3')).toHaveCount(3);
  await expect(stage.locator('.die3.d6')).toHaveCount(2);
  await expect(stage.locator('.die3.d20 .die-shape')).toHaveCount(1);
  // the roll reached the log, and the pool survives for a repeat
  await expect(page.locator('[data-roll-entries]')).toContainText('2d6+1d20');
  await expect(page.locator('[data-dice-formula]')).toHaveText('2d6 + 1d20');
});

test('the dice tooltip works in play mode too, and − trims the pool', async ({ page }) => {
  await page.goto('/sheet/');
  await page.locator('[data-mode-toggle]').click(); // → play
  await expect(page.locator('[data-dice-open]')).toBeVisible();
  await page.locator('[data-dice-open]').click();
  await page.locator('.dice-kind-add', { hasText: /^d8$/ }).click();
  await page.locator('.dice-kind-add', { hasText: /^d8$/ }).click();
  await page.locator('.dice-kind', { hasText: 'd8' }).locator('.dice-kind-minus').click();
  await expect(page.locator('[data-dice-formula]')).toHaveText('1d8');
  await page.locator('[data-dice-roll]').click();
  await expect(page.locator('.dice-stage .die3.d8')).toHaveCount(1);
});
