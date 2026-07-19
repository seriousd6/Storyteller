import { test, expect, type Page } from '@playwright/test';

// The government roller used to render one "Government." blob: the type essay
// plus Leadership / State Goals / Methods / Citizenry / Complication all crammed
// into a single paragraph. Batch converted it to a composite so each of those is
// its own labelled, individually-rerollable section — and, because the sub-rolls
// are gated by the rolled government TYPE (a tag), the composite freezes the type
// (lockOpts) so rerolling one section can't quietly hand back another type's
// leader. These two specs guard exactly that: the break-up, and the coherence.

async function generated(page: Page) {
  await page.goto('/gm/government/');
  const preview = page.locator('[data-preview]');
  await expect(preview.locator('.b-statblock').first()).toBeVisible({ timeout: 20_000 });
  return preview;
}

test('the government monolith renders as labelled sections, not one blob', async ({ page }) => {
  const preview = await generated(page);
  // the buried sub-sections are now first-class, labelled paragraphs/lists
  for (const label of ['Leadership', 'State Goals', 'Methods', 'The Citizenry Wants', 'Complication']) {
    await expect(preview.locator('.b', { hasText: label }).first()).toBeVisible();
  }
  // and the facet groups moved to their own headings
  for (const group of ['The People', 'Wealth', 'The Court']) {
    await expect(preview.locator('.b-statblock h3', { hasText: group }).first()).toBeVisible();
  }
  // State Goals is a list of two (drawn distinct)
  await expect(preview.locator('.b-list', { hasText: 'State Goals' }).first().locator('li')).toHaveCount(2);
});

test('rerolling a type-gated section keeps the government type (frozen spine)', async ({ page }) => {
  const preview = await generated(page);
  const typeName = preview.locator('.b-statblock').first().locator('h3');
  const leadership = () => preview.locator('.b-paragraph', { hasText: 'Leadership' }).first();

  const typeBefore = (await typeName.innerText()).trim();
  const leaderBefore = (await leadership().innerText()).trim();

  // reroll ONLY the leadership section
  await leadership().locator('.rr-btn').click();

  // the leader changes…
  await expect(leadership()).not.toHaveText(leaderBefore, { timeout: 10_000 });
  // …but the government TYPE does not — the reroll stayed in-type instead of
  // re-rolling the whole state (the lockOpts-on-reroll guarantee)
  await expect(typeName).toHaveText(typeBefore);
});
