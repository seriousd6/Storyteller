import { test, expect, type Page } from '@playwright/test';

// PLAN.md §10: the columns block and the measured page view. The preview
// builds REAL fixed-size pages and measures overflow — the warning is the
// product ("a CSS-only preview lies at the printer").

async function seedSheet(page: Page, blocks: unknown[]) {
  await page.goto('/sheet/');
  await page.evaluate((bs) => {
    localStorage.setItem(
      'stb:sheets:v1',
      JSON.stringify({ activeId: 's1', sheets: [{ id: 's1', name: 'Paged', blocks: bs }] }),
    );
  }, blocks);
  await page.reload();
}

test('＋ Columns wraps the last two blocks side by side; undo unwraps them', async ({ page }) => {
  await page.goto('/sheet/');
  await page.locator('[data-add-note]').click();
  await page.locator('[data-add-note]').click();
  await expect(page.locator('[data-blocks] > .block')).toHaveCount(2);
  await page.locator('[data-add-columns]').click();
  const cols = page.locator('.b-columns.cols-2');
  await expect(cols).toBeVisible();
  await expect(cols.locator('.col')).toHaveCount(2);
  await expect(page.locator('[data-blocks] > .block')).toHaveCount(1);
  // children edit in place, and a child can hop columns
  await cols.locator('.col').first().locator('[aria-label="Move to the next column"]').click();
  await expect(cols.locator('.col').nth(1).locator('.b-paragraph')).toHaveCount(2);
  // undo twice: the hop, then the wrap itself
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(page.locator('.b-columns')).toHaveCount(0);
  await expect(page.locator('[data-blocks] > .block')).toHaveCount(2);
});

test('the page view deals blocks onto letter pages and honors page breaks', async ({ page }) => {
  await seedSheet(page, [
    { type: 'title', id: 't1', text: 'Act One' },
    { type: 'paragraph', id: 'p1', text: 'The road out of town.' },
    { type: 'pageBreak', id: 'b1' },
    { type: 'title', id: 't2', text: 'Act Two' },
  ]);
  await page.locator('[data-pages-toggle]').click();
  await expect(page.locator('.page')).toHaveCount(2);
  await expect(page.locator('.page-num').first()).toHaveText('page 1 of 2');
  await expect(page.locator('.page').nth(1)).toContainText('Act Two');
  await expect(page.locator('.page-warn')).toHaveCount(0);
  // toggling back returns the editor
  await page.locator('[data-pages-toggle]').click();
  await expect(page.locator('[data-sheet]')).toBeVisible();
});

test('overflow measures honestly: packed pages spill to page 2, a giant block warns', async ({ page }) => {
  const filler = Array.from({ length: 60 }, (_, i) => ({
    type: 'paragraph',
    id: `p${i}`,
    text: `Paragraph ${i}: the caravan winds on through dust and rumor toward the high pass, trading news for water and promises for rope, while the drovers argue about the weather and the maps disagree with the mountains.`,
  }));
  await seedSheet(page, filler);
  await page.locator('[data-pages-toggle]').click();
  // 60 two-line paragraphs cannot fit 10 inches — they DEAL onto further
  // pages, no warning (poll: pagination is async while images settle)
  await expect.poll(() => page.locator('.page').count()).toBeGreaterThan(1);
  await expect(page.locator('.page-warn')).toHaveCount(0);
});

// own test: seedSheet's legacy-import trick only works ONCE per context —
// the migration marker (rightly) blocks a second import
test('a single block taller than a page cannot deal — it must warn', async ({ page }) => {
  const giant = { type: 'list', id: 'L', label: 'Everything', items: Array.from({ length: 120 }, (_, i) => `item ${i}`) };
  await seedSheet(page, [giant]);
  await page.locator('[data-pages-toggle]').click();
  await expect(page.locator('.page-warn').first()).toBeVisible();
  await expect(page.locator('.page-warn').first()).toContainText('spills page 1');
});
