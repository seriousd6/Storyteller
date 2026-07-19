import { test, expect, type Page } from '@playwright/test';

// The D&D character composite (composites/dnd-character.ts) lays a computed
// build out like the printed 5e sheet: a compact combat strip up top
// (Initiative rolls on tap), a three-column body — abilities, senses and the
// six-card saving throws down the left; the HP and Death Saves groups and
// attacks in the middle; the race-locked portrait, choices and aggregated
// features on the right — a full-width six-column skills table, an inventory
// page (purse, attunement, bag of holding) with notes/lore at the bottom,
// and a spellcasting page whose slots tick down as you cast. The paper
// sheet, with a webpage's conveniences.

const blocks = (p: Page) => p.locator('[data-blocks] > .block');

async function openCharacter(page: Page, query: string): Promise<void> {
  await page.goto(`/sheet/?template=gm/dnd-character&${query}`);
  await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
}

// A caster, fixed seed → a reproducible sheet with a spell page.
const WIZARD = 'class=wizard&race=elf&level=5&subclass=evocation&abilities=array&seed=e2e';

test.describe('the 5e character sheet layout', () => {
  test('page 1 is the sheet — combat strip, saves, skills table, attacks in place', async ({ page }) => {
    await openCharacter(page, WIZARD);
    // the body is a three-column grid — the printed sheet's shape
    await expect(page.locator('[data-blocks] .b-columns.cols-3').first()).toBeVisible();
    // the combat strip heads the sheet, its Initiative box a roll button
    const combat = page.locator('.b-statGrid', { hasText: 'Combat' }).first();
    await expect(combat.locator('.stat-box', { hasText: 'Initiative' })).toBeVisible();
    // saves are the six-card grid; skills the six-column ability table
    await expect(page.locator('.b-profGrid', { hasText: 'Saving Throws' })).toBeVisible();
    const skills = page.locator('.b-profGrid', { hasText: 'Skills' }).last();
    await expect(skills.locator('.pg-col')).toHaveCount(6);
    await expect(skills.locator('.pg-card')).toHaveCount(18);
    // HP and Death Saves are condensed groups; attacks stay in the middle
    await expect(page.locator('.b-statblock', { hasText: 'Hit Points' }).first()).toBeVisible();
    await expect(page.locator('.b-statblock', { hasText: 'Death Saves' }).first()).toBeVisible();
    await expect(page.locator('.b-actions', { hasText: 'Attacks' })).toBeVisible();
    // abilities are a titled strip of boxes — STR lives in the left column
    await expect(page.locator('.b-statGrid', { hasText: 'Ability Scores' }).locator('.stat-box', { hasText: 'STR' })).toBeVisible();
    // the sheet breaks into pages: inventory + notes, and spellcasting
    await expect(page.locator('.b-pageBreak')).toHaveCount(2);
    await expect(page.locator('[data-blocks]')).toContainText('Inventory & Equipment');
    await expect(page.locator('[data-blocks]')).toContainText('Notes & Lore');
    await expect(page.locator('[data-blocks]')).toContainText('Spellcasting');
  });

  test('initiative rolls on tap from the combat strip in play mode', async ({ page }) => {
    await openCharacter(page, WIZARD);
    await page.locator('[data-mode-toggle]').click();
    const init = page.locator('.b-statGrid button.stat-box', { hasText: 'Initiative' });
    await expect(init).toBeVisible();
    await init.click();
    await expect(page.locator('[data-roll-entries]')).toContainText('Initiative check');
  });

  test('HP is typable in play mode, and the typed value survives a reload', async ({ page }) => {
    await openCharacter(page, WIZARD);
    await page.locator('[data-mode-toggle]').click();
    const hp = page.locator('.b-statblock', { hasText: 'Hit Points' }).locator('.tracker-input').first();
    await expect(hp).toBeVisible();
    await hp.fill('7');
    await hp.blur();
    await page.reload();
    await expect(
      page.locator('.b-statblock', { hasText: 'Hit Points' }).locator('.tracker-input').first(),
    ).toHaveValue('7');
  });

  test('a skill card rolls its check in play, wearing its live bonus', async ({ page }) => {
    await openCharacter(page, WIZARD);
    await page.locator('[data-mode-toggle]').click();
    const skills = page.locator('.b-profGrid', { hasText: 'Skills' }).last();
    // every card wears a folded bonus, not a blind verb
    const bonuses = await skills.locator('.pg-bonus').allTextContents();
    expect(bonuses.length).toBe(18);
    expect(bonuses.filter((t) => !/^[+−]\d+$/.test(t.trim()))).toEqual([]);
    const card = skills.locator('button.pg-card', { hasText: 'Arcana' });
    await card.click();
    await expect(page.locator('[data-roll-entries]')).toContainText('Arcana check');
  });

  test('proficiency and expertise are checkboxes in edit; ticking expertise doubles the fold', async ({ page }) => {
    await openCharacter(page, WIZARD);
    const skills = page.locator('.b-profGrid', { hasText: 'Skills' }).last();
    // Acrobatics: never class- or background-granted for a wizard, so it
    // starts unproficient — expertise must add exactly 2 × prof (+3 at L5).
    const card = skills.locator('.pg-card', { hasText: 'Acrobatics' });
    // both flags render as real checkboxes on the card
    await expect(card.locator('.pg-flag input')).toHaveCount(2);
    const before = (await card.locator('.pg-bonus').textContent())!.trim();
    // click, not check(): the commit re-renders the block, detaching the node
    await card.locator('.pg-flag', { hasText: 'expertise' }).locator('input').click();
    // the card announces its tier and folds 2×prof into the bonus
    await expect(card.locator('.pg-sub')).toContainText('expertise');
    const after = (await card.locator('.pg-bonus').textContent())!.trim();
    const num = (s: string) => parseInt(s.replace('−', '-').replace('+', ''), 10);
    expect(num(after) - num(before)).toBe(6); // 2 × prof (+3)
    // in play mode, the card wears the badge and rolls with the doubled bonus
    await page.locator('[data-mode-toggle]').click();
    const playCard = page.locator('.b-profGrid', { hasText: 'Skills' }).last().locator('button.pg-card', { hasText: 'Acrobatics' });
    await expect(playCard).toHaveClass(/pg-exp/);
    await expect(playCard.locator('.pg-sub')).toContainText('expertise');
  });

  test('the six-card saving throws wear proficiency badges', async ({ page }) => {
    await openCharacter(page, WIZARD);
    await page.locator('[data-mode-toggle]').click();
    const saves = page.locator('.b-profGrid', { hasText: 'Saving Throws' });
    await expect(saves.locator('.pg-card')).toHaveCount(6);
    // a wizard saves with INT and WIS — those two cards are badged proficient
    await expect(saves.locator('.pg-card.pg-prof')).toHaveCount(2);
    await expect(saves.locator('.pg-card.pg-prof .pg-badge')).toHaveCount(2);
  });

  test('the portrait is generated, rerollable in edit, and photo-replaceable', async ({ page }) => {
    await openCharacter(page, WIZARD);
    const portrait = page.locator('.b-image .img-portrait');
    await expect(portrait.locator('svg')).toBeVisible();
    const before = await portrait.innerHTML();
    // reroll keeps the person (race+sex) but redraws the look
    await page.locator('.b-image .mini', { hasText: 'reroll' }).click();
    await expect
      .poll(async () => (await page.locator('.b-image .img-portrait').innerHTML()) !== before)
      .toBe(true);
    // and the escape hatch to a real photo is right beside it
    await expect(page.locator('.b-image .img-upload', { hasText: 'Replace with photo' })).toBeVisible();
  });

  test('＋ action opens a type picker; charges add checkable boxes that persist', async ({ page }) => {
    await openCharacter(page, WIZARD);
    const attacks = page.locator('.b-actions', { hasText: 'Attacks' });
    await attacks.locator('.mini', { hasText: '＋ action' }).click();
    // the picker offers the action kinds
    const picker = attacks.locator('.action-add-menu');
    await expect(picker.locator('.mini', { hasText: 'charges' })).toBeVisible();
    await expect(picker.locator('.mini', { hasText: 'attack' })).toBeVisible();
    await picker.locator('.mini', { hasText: 'charges' }).click();
    // a charges row: three empty boxes, tickable like spell slots
    const row = page.locator('.b-actions .action-row', { hasText: 'Charges' });
    await expect(row.locator('.use-box')).toHaveCount(3);
    await row.locator('.use-box').nth(1).click();
    await expect(row.locator('.use-box.filled')).toHaveCount(2);
    // the ticks are state — they survive a reload
    await page.reload();
    await expect(
      page.locator('.b-actions .action-row', { hasText: 'Charges' }).locator('.use-box.filled'),
    ).toHaveCount(2);
  });

  test('spell slots are clickable boxes that tick down as you cast', async ({ page }) => {
    await openCharacter(page, WIZARD);
    // to play mode, where the sheet is used at the table
    await page.locator('[data-mode-toggle]').click();
    // a wizard's 1st-level slots: four boxes, all available to start
    const slots = page.locator('.b-tracker', { hasText: 'Level 1 Slots' });
    await expect(slots).toBeVisible();
    await expect(slots.locator('.tracker-box')).toHaveCount(4);
    await expect(slots.locator('.tracker-box.filled')).toHaveCount(4);
    // cast a spell: click the last filled box to expend a slot
    await slots.locator('.tracker-box').nth(3).click();
    await expect(slots.locator('.tracker-box.filled')).toHaveCount(3);
    // the expended slot is state — it survives a reload
    await page.reload();
    await expect(
      page.locator('.b-tracker', { hasText: 'Level 1 Slots' }).locator('.tracker-box.filled'),
    ).toHaveCount(3);
  });

  test('a spellbook spell hovers for its SRD card in play mode', async ({ page }) => {
    await openCharacter(page, WIZARD);
    await page.locator('[data-mode-toggle]').click();
    // the spellbook renders each spell as a hoverable chip once out of edit mode
    const chip = page.locator('.chip-spell').first();
    await expect(chip).toBeVisible();
    await chip.hover();
    await expect(page.locator('.spell-card:not([hidden])')).toBeVisible();
  });

  // The regression guard for B258: the ability/prof strips live INSIDE the
  // three-column `columns` block, so a roll only resolves if the var scope
  // (collectVars) descends into columns. A layout-only assertion can't see a
  // dead scope — so we actually roll, in play mode, and prove the resolved
  // modifier reaches the dice stage. (Broke once when collectVars stopped
  // descending columns — every save/skill/attack was silently dead.)
  test('a columns-nested ability and save actually roll in play mode', async ({ page }) => {
    await openCharacter(page, WIZARD);
    await page.locator('[data-mode-toggle]').click(); // → play

    // tap STR (a rollable box in the LEFT column): the stage rolls a check whose
    // breakdown carries the resolved modifier, humanized — never $-syntax. A dead
    // scope errors the box (no stage) instead of rolling, so this fails loud.
    await page.locator('button.stat-box', { hasText: 'STR' }).click();
    const stage = page.locator('.dice-stage');
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute('title', /\(str\.mod\)/);
    await expect(stage).not.toHaveAttribute('title', /\$/);

    // and the Saving Throw cards (profGrid since B267) wear their folded
    // bonus on the face — proof the columns-nested Prof + ability strips fed
    // the var scope. A dead scope renders every card face as "—".
    const save = page.locator('.b-profGrid', { hasText: 'Saving Throws' }).locator('.pg-bonus').first();
    await expect(save).toHaveText(/[+−-]\d/);
  });
});
