import { test, expect, type Page } from '@playwright/test';

// Phase 1 live-sheet surfaces (docs/sheets/PLAN.md §4-§9, §16-§17): the
// rollTable widget, inline dice chips + the dice stage, play mode, and
// template instantiation — all only exist once the island hydrates.

const blocks = (p: Page) => p.locator('[data-blocks] > .block');

async function seedSheet(page: Page, sheetBlocks: unknown[], mode?: string) {
  await page.goto('/sheet/');
  await page.evaluate(
    ([bs, m]) => {
      localStorage.setItem(
        'stb:sheets:v1',
        JSON.stringify({
          activeId: 's1',
          sheets: [{ id: 's1', name: 'Test', mode: m || undefined, blocks: bs }],
        }),
      );
    },
    [sheetBlocks, mode] as [unknown[], string | undefined],
  );
  await page.reload();
}

test.describe('rollTable widget', () => {
  test('rolls, keeps history, and undo removes the roll', async ({ page }) => {
    await seedSheet(page, [{ type: 'rollTable', id: 'rt1', ref: 'gm/tavern/rumor', title: 'Rumors' }]);
    const results = page.locator('.b-rollTable .rt-results li');
    await expect(results).toHaveCount(0);
    await page.locator('.rt-roll').click();
    await expect(results).toHaveCount(1);
    expect(((await results.first().textContent()) ?? '').trim().length).toBeGreaterThan(3);
    await page.locator('.rt-roll').click();
    await expect(results).toHaveCount(2);
    // a roll is undoable like any other edit (history is per-session)
    await page.keyboard.press('Control+z');
    await expect(results).toHaveCount(1);
    // and kept results persist across reload
    await page.reload();
    await expect(page.locator('.b-rollTable .rt-results li')).toHaveCount(1);
  });

  test('a bad ref fails loud, not silent', async ({ page }) => {
    await seedSheet(page, [{ type: 'rollTable', id: 'rt1', ref: 'gm/no/such-table' }]);
    await page.locator('.rt-roll').click();
    await expect(page.locator('.b-rollTable .rt-results li').first()).toContainText('⚠');
  });
});

test.describe('inline dice chips + dice stage', () => {
  test('a [[2d6+3]] chip rolls on the stage and logs it', async ({ page }) => {
    await seedSheet(
      page,
      [{ type: 'paragraph', id: 'p1', text: 'Goblin ambush! Damage [[2d6+3]] on a hit.' }],
      'play',
    );
    const chip = page.locator('.chip-dice');
    await expect(chip).toHaveText('2d6+3');
    await chip.click();
    // the stage appears and settles on a total in [5, 15]
    const stage = page.locator('.dice-stage');
    await expect(stage).toBeVisible();
    const total = page.locator('.chip-result');
    await expect(total).not.toHaveText('', { timeout: 5_000 });
    const value = parseInt(((await total.textContent()) ?? '').trim(), 10);
    expect(value).toBeGreaterThanOrEqual(5);
    expect(value).toBeLessThanOrEqual(15);
    // the roll log recorded it
    await page.locator('[data-roll-log] summary').click();
    await expect(page.locator('[data-roll-entries] li').first()).toContainText('2d6+3');
  });

  test('a [[table:...]] chip rolls the real table inline', async ({ page }) => {
    await seedSheet(page, [{ type: 'paragraph', id: 'p1', text: 'Overheard: [[table:gm/tavern/rumor]]' }], 'play');
    await page.locator('.chip-table').click();
    const out = page.locator('.chip-result');
    await expect(out).not.toHaveText('', { timeout: 5_000 });
    expect(((await out.textContent()) ?? '').trim().length).toBeGreaterThan(5);
  });

  test('broken tokens stay literal — user text is never eaten', async ({ page }) => {
    await seedSheet(page, [{ type: 'paragraph', id: 'p1', text: 'Not a roll: [[hello world]].' }], 'play');
    await expect(page.locator('[data-blocks]')).toContainText('[[hello world]]');
    await expect(page.locator('.chip')).toHaveCount(0);
  });
});

test.describe('play mode', () => {
  test('locks text editing and hides structure chrome; edit mode restores them', async ({ page }) => {
    await seedSheet(page, [{ type: 'title', id: 't1', text: 'The Keep' }]);
    // edit mode: h2 is contenteditable, controls exist
    await expect(page.locator('[data-blocks] h2')).toHaveAttribute('contenteditable', 'true');
    await expect(page.locator('.block-controls').first()).toBeAttached();
    await page.locator('[data-mode-toggle]').click();
    // play mode: no contenteditable, no controls, mode persists
    await expect(page.locator('[data-blocks] h2')).not.toHaveAttribute('contenteditable', 'true');
    await expect(page.locator('.block-controls')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('[data-mode-toggle]')).toHaveText('✎ Edit');
    await page.locator('[data-mode-toggle]').click();
    await expect(page.locator('[data-blocks] h2')).toHaveAttribute('contenteditable', 'true');
  });
});

test.describe('template gallery', () => {
  test('Session Prep instantiates fully rolled — no raw tokens survive', async ({ page }) => {
    await page.goto('/sheet/');
    await page.locator('[data-from-template]').click();
    await page.locator('[data-template-id="session-prep"]').click();
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('Session Prep');
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:');
    // the live widgets arrived too
    await expect(page.locator('.b-rollTable')).toHaveCount(2);
    // rumors actually rolled into prose
    expect(text.length).toBeGreaterThan(200);
  });

  test('Magic Item Card carries a live dice chip into play mode', async ({ page }) => {
    await page.goto('/sheet/');
    await page.locator('[data-from-template]').click();
    await page.locator('[data-template-id="item-card"]').click();
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await page.locator('[data-mode-toggle]').click();
    await expect(page.locator('.chip-dice').first()).toHaveText('1d8+1');
  });
});

test.describe('page break', () => {
  test('renders its rule and survives markdown-bound rendering', async ({ page }) => {
    await seedSheet(page, [
      { type: 'paragraph', id: 'p1', text: 'Page one.' },
      { type: 'pageBreak', id: 'pb1' },
      { type: 'paragraph', id: 'p2', text: 'Page two.' },
    ]);
    await expect(page.locator('.b-pageBreak')).toBeVisible();
    await expect(page.locator('.b-pageBreak span')).toHaveText('✂ page break');
  });
});
