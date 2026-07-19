import { test, expect, type Page } from '@playwright/test';

// Phase 2b (docs/sheets/PLAN.md §7): user-authored roll tables. The exit
// criterion as a test: author a custom crit-fail table in the no-JSON
// editor and embed it on a sheet next to everything else.

async function authorTable(page: Page, title: string, entries: string[]) {
  await page.locator('[data-brew-panel] summary').click();
  await page.locator('[data-brew-new]').click();
  await page.locator('[data-brew-title]').fill(title);
  await page.locator('[data-brew-entries]').fill(entries.join('\n'));
  await page.locator('[data-brew-save]').click();
}

test.describe('homebrew tables', () => {
  test('author, lint, test-roll, persist', async ({ page }) => {
    await page.goto('/sheet/');
    await page.locator('[data-brew-panel] summary').click();
    await page.locator('[data-brew-new]').click();
    await page.locator('[data-brew-title]').fill('Crit Fails');
    await expect(page.locator('[data-brew-id]')).toHaveText('user/crit-fails');
    // a broken ref is caught by the SAME linter the site validator runs
    await page.locator('[data-brew-entries]').fill('You drop your sword\n{table:gm/no/such}');
    await page.locator('[data-brew-save]').click();
    await expect(page.locator('[data-brew-issues] li')).toContainText('unresolved reference');
    // fix it with a real site ref — user tables may reference site tables
    await page.locator('[data-brew-entries]').fill(
      'You drop your sword\nYou hit yourself for {num:1-4} damage\nDistracted by {table:gm/npc/fear}',
    );
    await page.locator('[data-brew-testroll]').click();
    await expect(page.locator('[data-brew-test]')).toBeVisible();
    // the test-roll must RESOLVE a real entry — ">3 chars" also passes a ⚠ error
    // or a raw un-rolled entry. Assert no leftover tokens, and that it matches one
    // of the three entries in its rolled form.
    const rolled = ((await page.locator('[data-brew-test-out]').textContent()) ?? '').trim();
    expect(rolled).not.toContain('{');
    expect(rolled).toMatch(/^(You drop your sword|You hit yourself for \d+ damage|Distracted by .+)$/);
    await page.locator('[data-brew-save]').click();
    await expect(page.locator('[data-brew-editor]')).toBeHidden();
    // IndexedDB persistence
    await page.reload();
    await page.locator('[data-brew-panel] summary').click();
    await expect(page.locator('.brew-row')).toHaveCount(1);
    await expect(page.locator('.brew-row code')).toHaveText('user/crit-fails');
  });

  test('a user table rolls inside a sheet like any site table', async ({ page }) => {
    await page.goto('/sheet/');
    await authorTable(page, 'Omens', ['A red comet', 'Two moons rise', 'The wells run black']);
    await page.evaluate(() => {
      localStorage.setItem(
        'stb:sheets:v1',
        JSON.stringify({
          activeId: 's1',
          sheets: [
            {
              id: 's1',
              name: 'Test',
              mode: 'play',
              blocks: [
                { type: 'rollTable', id: 'rt1', ref: 'user/omens', title: 'Omens' },
                { type: 'paragraph', id: 'p1', text: 'Tonight: [[table:user/omens]]' },
              ],
            },
          ],
        }),
      );
    });
    await page.reload();
    // the widget
    await page.locator('.rt-roll').click();
    const result = page.locator('.b-rollTable .rt-results li').first();
    await expect(result).not.toBeEmpty();
    const text = (await result.textContent()) ?? '';
    expect(['A red comet', 'Two moons rise', 'The wells run black']).toContain(text.trim());
    // the inline chip resolves to one of the table's three entries, not a ⚠
    await page.locator('.chip-table').click();
    const chipOut = page.locator('.chip-result');
    await expect(chipOut).not.toHaveText('', { timeout: 5_000 });
    expect(['A red comet', 'Two moons rise', 'The wells run black']).toContain(((await chipOut.textContent()) ?? '').trim());
  });

  test('deleting a user table makes dependent widgets fail loud, not wrong', async ({ page }) => {
    await page.goto('/sheet/');
    await authorTable(page, 'Doomed', ['Only entry']);
    await page.evaluate(() => {
      localStorage.setItem(
        'stb:sheets:v1',
        JSON.stringify({
          activeId: 's1',
          sheets: [
            { id: 's1', name: 'T', blocks: [{ type: 'rollTable', id: 'rt1', ref: 'user/doomed' }] },
          ],
        }),
      );
    });
    await page.reload();
    await page.locator('[data-brew-panel] summary').click();
    await page.locator('.brew-row .btn').click();
    page.on('dialog', (d) => void d.accept());
    await page.locator('[data-brew-delete]').click();
    await expect(page.locator('.brew-row')).toHaveCount(0);
    await page.locator('.rt-roll').click();
    await expect(page.locator('.b-rollTable .rt-results li').first()).toContainText('⚠');
  });
});
