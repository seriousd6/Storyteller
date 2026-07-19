import { test, expect } from '@playwright/test';

// The 🎲 Dice tooltip (owner ask 2026-07-19): build a pool of real dice from
// the command bar and THROW them — true 3D polyhedra (engine/dice3d.ts) that
// fly across the viewport table, bounce, tumble, and settle with the rolled
// face to the camera (the D&D Beyond feel). The bottom bar keeps the label
// and total; every roll lands in the roll log.

test('build a pool, roll it: real polyhedra fly the table and the log records it', async ({ page }) => {
  await page.goto('/sheet/');
  await page.locator('[data-dice-open]').click();
  await expect(page.locator('[data-dice-pop]')).toBeVisible();
  // two d6 and a d20
  await page.locator('.dice-kind-add', { hasText: /^d6$/ }).click();
  await page.locator('.dice-kind-add', { hasText: /^d6$/ }).click();
  await page.locator('.dice-kind-add', { hasText: /^d20$/ }).click();
  await expect(page.locator('[data-dice-formula]')).toHaveText('2d6 + 1d20');
  await page.locator('[data-dice-roll]').click();
  // the table: three thrown polyhedra — two cubes and an icosahedron (20
  // faces), each face a real 3D-placed facet
  const table = page.locator('.dice-table');
  await expect(table).toBeVisible();
  await expect(table.locator('.die3d')).toHaveCount(3);
  await expect(table.locator('.die3d-6')).toHaveCount(2);
  await expect(table.locator('.die3d-20')).toHaveCount(1);
  await expect(table.locator('.die3d-20 .df')).toHaveCount(20);
  // labels are FIXED to their faces (owner: the physics lands the roll —
  // nothing may be relabelled at rest): capture the d20's face labels
  // mid-flight, in DOM order, and they must survive the landing untouched
  const labelsBefore = await table.locator('.die3d-20 .df-n').allTextContents();
  expect([...labelsBefore].sort((a, b) => +a - +b).join(',')).toBe(
    Array.from({ length: 20 }, (_, i) => i + 1).join(','),
  );
  // the dice settle and the bar lands the total
  await expect(page.locator('.dice-stage .total.shown')).toBeVisible({ timeout: 10_000 });
  expect(await table.locator('.die3d-20 .df-n').allTextContents()).toEqual(labelsBefore);
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
  // one octahedron on the table: 8 real faces
  await expect(page.locator('.dice-table .die3d-8')).toHaveCount(1);
  await expect(page.locator('.dice-table .die3d-8 .df')).toHaveCount(8);
  // THE HONEST LANDING (owner: "the number selected ends on top"): once the
  // die rests, the facet geometrically facing the camera — the one whose
  // world-space normal points most at the viewer — carries the rolled
  // value. 1d8 has no modifier, so the bar total IS the die's value.
  await expect(page.locator('.dice-stage .total.shown')).toBeVisible({ timeout: 10_000 });
  const total = Number((await page.locator('.dice-stage .total').textContent())!.replace(/[^0-9]/g, ''));
  const front = await page.evaluate(() => {
    const die = document.querySelector('.dice-table .die3d-8')!;
    const body = die.querySelector('.die3d-body') as HTMLElement;
    const bm = new DOMMatrix(getComputedStyle(body).transform);
    let best = '';
    let bestZ = -Infinity;
    for (const f of die.querySelectorAll('.df')) {
      // a face transform's third column is its normal; the body matrix maps
      // it to world space — its z (m33 of the product) is "how much at the
      // viewer". The winner must be the rolled face.
      const m = bm.multiply(new DOMMatrix(getComputedStyle(f as HTMLElement).transform));
      if (m.m33 > bestZ) {
        bestZ = m.m33;
        best = f.querySelector('.df-n')!.textContent!;
      }
    }
    return best;
  });
  expect(Number(front)).toBe(total);
});
