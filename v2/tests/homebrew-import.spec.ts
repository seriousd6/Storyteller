import { test, expect } from '@playwright/test';
import { pinIsDurable, clickTool } from './helpers';

// Homebrewery import (PLAN.md §21.5): paste a brew, get living blocks.
// The parser's semantics are pinned by smoke-homebrew.mjs; this drives the
// real dialog → sheet → reload path.

const BREW = `# The Sunken Crypt
A dungeon for **4–6** adventurers.

#### Random Encounters
| d6 | Encounter |
|:--:|-----------|
| 1  | 2d4 stirges |
| 2  | A will-o-wisp |

**Smell.** Rot and brine.
**Sound.** Dripping water.

\\page

> ## Bog Ghast
> *Medium undead, neutral evil*
>
> Its breath reeks of the marsh.
`;

test('paste a brew → an editable sheet that survives reload', async ({ page }) => {
  await page.goto('/sheet/');
  await clickTool(page, '[data-from-template]');
  await page.locator('[data-template-id="import-homebrew"]').click();
  await expect(page.locator('[data-import-dialog]')).toBeVisible();
  await page.locator('[data-import-text]').fill(BREW);
  await page.locator('[data-import-go]').click();
  await expect(page.locator('[data-import-status]')).toContainText('Imported');
  await page.locator('[data-import-close]').click();

  await expect(page.locator('[data-sheet-name]')).toHaveText('The Sunken Crypt');
  await expect(page.locator('[data-blocks] .block-table')).toHaveCount(1);
  await expect(page.locator('[data-blocks] .block-keyValue')).toHaveCount(1);
  await expect(page.locator('[data-blocks] .block-pageBreak')).toHaveCount(1);
  await expect(page.locator('[data-blocks] .block-statblock')).toHaveCount(1);
  await expect(page.locator('.b-statblock')).toContainText('Bog Ghast');
  // the h4 became the table's LABEL (model + markdown), not a title block —
  // so no heading on the page carries that text
  await expect(page.locator('[data-blocks] h2, [data-blocks] h3')).not.toContainText(['Random Encounters']);
  await expect(page.locator('.b-table')).toContainText('will-o-wisp');

  // "editable" is the claim in the title — prove it: the imported table is a
  // live block, not frozen text. Edit a cell (addressed by position, so the edit
  // doesn't move it out from under us); the change must survive the reload.
  const cell = page.locator('.b-table tr').nth(1).locator('td').nth(1);
  await expect(cell).toHaveText('2d4 stirges');
  await cell.fill('a swarm of bats');
  await cell.blur();
  await expect(cell).toHaveText('a swarm of bats');

  await pinIsDurable(page);
  await page.reload();
  await expect(page.locator('[data-sheet-name]')).toHaveText('The Sunken Crypt');
  await expect(page.locator('[data-blocks] .block-statblock')).toHaveCount(1);
  await expect(page.locator('.b-table')).toContainText('a swarm of bats'); // the edit persisted
});

test('junk input fails honestly, no sheet created', async ({ page }) => {
  await page.goto('/sheet/');
  const before = await page.locator('[data-sheet-select] option').count();
  await clickTool(page, '[data-from-template]');
  await page.locator('[data-template-id="import-homebrew"]').click();
  await page.locator('[data-import-text]').fill('<div></div>');
  await page.locator('[data-import-go]').click();
  await expect(page.locator('[data-import-status]')).toContainText('Nothing recognizable');
  await page.locator('[data-import-close]').click();
  await expect(page.locator('[data-sheet-select] option')).toHaveCount(before);
});
