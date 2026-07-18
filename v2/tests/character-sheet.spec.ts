import { test, expect, type Page } from '@playwright/test';
import { clickTool } from './helpers';

// Phase 2 mechanics (docs/sheets/PLAN.md §6, §16): the character sheet that
// PLAYS. The exit criterion, as a test: a player builds a character, taps
// STR, and watches the dice tumble to a check using their modifier; raises
// STR and every attack row updates.

async function seedCharacter(page: Page, str: string, mode = 'play') {
  await page.goto('/sheet/');
  await page.evaluate(
    ([s, m]) => {
      localStorage.setItem(
        'stb:sheets:v1',
        JSON.stringify({
          activeId: 'c1',
          sheets: [
            {
              id: 'c1',
              name: 'Hero',
              mode: m,
              blocks: [
                {
                  type: 'statGrid',
                  id: 'sg1',
                  computeMods: true,
                  rollable: true,
                  stats: [
                    { label: 'STR', value: s },
                    { label: 'DEX', value: '12' },
                  ],
                },
                { type: 'tracker', id: 'tr1', label: 'Hit Points', current: 3, max: 6, style: 'boxes' },
                {
                  type: 'actions',
                  id: 'ac1',
                  title: 'Actions',
                  items: [
                    {
                      label: 'Longsword',
                      rolls: [{ name: 'to-hit', formula: '1d20+$str.mod' }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      );
    },
    [str, mode],
  );
  await page.reload();
}

test.describe('the character sheet plays', () => {
  test('tap STR → the stage rolls a check with the modifier', async ({ page }) => {
    await seedCharacter(page, '16'); // +3
    const box = page.locator('button.stat-box').first();
    await expect(box.locator('.stat-sub')).toHaveText('+3');
    await box.click();
    const stage = page.locator('.dice-stage');
    await expect(stage).toBeVisible();
    // breakdown carries the resolved modifier, humanized — never $-syntax
    await expect(stage).toHaveAttribute('title', /\+ 3 \(str\.mod\)/);
    // and the log names the check
    await page.locator('[data-roll-log] summary').click();
    await expect(page.locator('[data-roll-entries] li').first()).toContainText('STR check');
  });

  test('raise STR and the attack row uses the new modifier', async ({ page }) => {
    await seedCharacter(page, '10', 'edit'); // +0
    // edit the stat value in place: 10 → 18 (+4)
    const value = page.locator('.stat-box .stat-value').first();
    await value.fill('18');
    await value.blur();
    // switch to play, roll the attack
    await page.locator('[data-mode-toggle]').click();
    await page.locator('.chip-action', { hasText: 'to-hit' }).click();
    await expect(page.locator('.dice-stage')).toHaveAttribute('title', /\+ 4 \(str\.mod\)/);
  });

  test('HP boxes tick, persist, and undo', async ({ page }) => {
    await seedCharacter(page, '14');
    const boxes = page.locator('.tracker-box');
    await expect(boxes).toHaveCount(6);
    await expect(page.locator('.tracker-box.filled')).toHaveCount(3);
    // take a hit: click the 3rd (last filled) box to untick it
    await boxes.nth(2).click();
    await expect(page.locator('.tracker-box.filled')).toHaveCount(2);
    // heal to 5
    await boxes.nth(4).click();
    await expect(page.locator('.tracker-box.filled')).toHaveCount(5);
    // survives reload
    await page.reload();
    await expect(page.locator('.tracker-box.filled')).toHaveCount(5);
    // and a mis-tap is one undo away
    await page.locator('.tracker-box').nth(0).click();
    await expect(page.locator('.tracker-box.filled')).toHaveCount(1);
    await page.keyboard.press('Control+z');
    await expect(page.locator('.tracker-box.filled')).toHaveCount(5);
  });

  test('a missing variable fails loud on the action button', async ({ page }) => {
    await page.goto('/sheet/');
    await page.evaluate(() => {
      localStorage.setItem(
        'stb:sheets:v1',
        JSON.stringify({
          activeId: 'c1',
          sheets: [
            {
              id: 'c1',
              name: 'Broken',
              mode: 'play',
              blocks: [
                {
                  type: 'actions',
                  id: 'ac1',
                  items: [{ label: 'Ghost punch', rolls: [{ name: 'to-hit', formula: '1d20+$nope' }] }],
                },
              ],
            },
          ],
        }),
      );
    });
    await page.reload();
    await page.locator('.chip-action').click();
    await expect(page.locator('.chip-result')).toHaveText(' ⚠');
  });

  test('the Character Sheet template instantiates and plays end-to-end', async ({ page }) => {
    await page.goto('/sheet/');
    await clickTool(page, '[data-from-template]');
    await page.locator('[data-template-id="character-sheet"]').click();
    await expect(page.locator('[data-sheet-name]')).toHaveText('Character Sheet');
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:');
    // to play mode: six rollable stats, ticking HP, three action rows
    await page.locator('[data-mode-toggle]').click();
    await expect(page.locator('button.stat-box')).toHaveCount(6);
    await expect(page.locator('.tracker-box')).toHaveCount(12);
    await page.locator('.chip-action', { hasText: '4d6 drop lowest' }).click();
    await expect(page.locator('.dice-stage')).toBeVisible();
  });
});
