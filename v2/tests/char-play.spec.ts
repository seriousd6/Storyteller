import { test, expect } from '@playwright/test';

// Play mode is for PLAYING (owner review 2026-07-18): reading the build,
// rolling its rolls, ticking its trackers — never remaking its choices. And a
// spell you can cast offers the cast: the hover card carries to-hit/damage
// buttons and survives the pointer travelling into it.

test('play mode has NO live dropdowns — a sorcerer reads their picks', async ({ page }) => {
  // a level-5 sorcerer carries metamagic (choiceList) + a spellbook
  await page.goto('/sheet/?template=gm/dnd-character&seed=play1&class=sorcerer&level=5');
  await expect(page.locator('[data-blocks] .block').first()).toBeAttached({ timeout: 15_000 });
  // edit mode builds with dropdowns…
  expect(await page.locator('[data-blocks] select').count()).toBeGreaterThan(0);
  // …play mode reads, full stop
  await page.locator('[data-mode-toggle]').click();
  await expect(page.locator('[data-blocks] .block-play').first()).toBeAttached();
  await expect(page.locator('[data-blocks] select')).toHaveCount(0);
  // the picks are still visible as text
  await expect(page.locator('[data-blocks] .b-choiceList').first()).toContainText(/\w/);
});

test('saves, skills and attacks wear their numbers — like a real sheet', async ({ page }) => {
  await page.goto('/sheet/?template=gm/dnd-character&seed=play1&class=wizard&level=5&abilities=array');
  await expect(page.locator('[data-blocks] .block').first()).toBeAttached({ timeout: 15_000 });
  await page.locator('[data-mode-toggle]').click();
  // every attack/roll chip folded its modifier into the label
  const chipTexts = await page.locator('.b-actions .chip-action').allTextContents();
  expect(chipTexts.length).toBeGreaterThan(4);
  // no bare verbs left: every chip wears its bonus ("to hit +5") or its dice
  // ("score 4d6dl1") — a chip with no number is the old blind sheet
  expect(chipTexts.filter((t) => !/\d/.test(t))).toEqual([]);
  // damage chips show their dice ("damage 1d8+2")
  expect(chipTexts.some((t) => /damage \d+d\d+/.test(t))).toBe(true);
  // saves and skills moved onto proficiency-grid cards (B263) — all 24 wear
  // a folded "+N" bonus on the face
  const bonuses = await page.locator('.b-profGrid .pg-bonus').allTextContents();
  expect(bonuses.length).toBe(24); // 6 saves + 18 skills
  expect(bonuses.filter((t) => !/^[+−]\d+$/.test(t.trim()))).toEqual([]);
});

test('the spell card casts: hover, walk in, roll damage', async ({ page }) => {
  await page.goto('/sheet/');
  // a hand-made caster: the spellcasting grid publishes $attack, the
  // paragraph carries an attack cantrip
  await page.evaluate(() => {
    localStorage.setItem(
      'stb:sheets:v1',
      JSON.stringify({
        activeId: 's1',
        sheets: [
          {
            id: 's1',
            name: 'Test Caster',
            blocks: [
              { type: 'statGrid', id: 'g1', computeMods: false, rollable: false, stats: [{ label: 'Attack', value: '+6', sub: 'to hit' }] },
              { type: 'paragraph', id: 'p1', text: 'Opening move: [[spell:Fire Bolt]] every round.' },
            ],
          },
        ],
      }),
    );
  });
  await page.reload();
  await page.locator('[data-mode-toggle]').click();
  const chip = page.locator('.chip-spell', { hasText: 'Fire Bolt' });
  await chip.hover();
  const card = page.locator('.spell-card');
  await expect(card).toBeVisible();
  // the card offers the rolls, with the sheet's bonus folded in
  await expect(card.locator('.spell-card-rolls button', { hasText: 'to hit +6' })).toBeVisible();
  const dmg = card.locator('.spell-card-rolls button', { hasText: '1d10 fire' });
  await expect(dmg).toBeVisible();
  // the pointer can travel INTO the card without it vanishing
  await dmg.hover();
  await expect(card).toBeVisible();
  await dmg.click();
  // the roll landed: result beside the button, and in the roll log
  await expect(dmg.locator('xpath=following-sibling::span[1]')).toHaveText(/\d/);
  await expect(page.locator('[data-roll-entries]')).toContainText('Fire Bolt — damage');
});
