import { test, expect, type Page } from '@playwright/test';
import { clickTool } from './helpers';

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
    await clickTool(page, '[data-from-template]');
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
    await clickTool(page, '[data-from-template]');
    await page.locator('[data-template-id="item-card"]').click();
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await page.locator('[data-mode-toggle]').click();
    await expect(page.locator('.chip-dice').first()).toHaveText('1d8+1');
  });

  // GENERATORS-AS-ONEPAGERS.md: every slot generator auto-registers as a
  // self-filling one-pager, derived from its own slots — no hand-authoring.
  test('a generator auto-registers and instantiates fully rolled', async ({ page }) => {
    await page.goto('/sheet/');
    await clickTool(page, '[data-from-template]');
    const card = page.locator('[data-template-id="gm/tavern"]'); // not a hand-authored template
    await expect(card).toBeVisible();
    await card.click();
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('Tavern');
    // the whole page arrived as one statblock, filled — no raw tokens survive
    await expect(page.locator('[data-blocks] > .block.block-statblock')).toHaveCount(1);
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:');
    expect(text.length).toBeGreaterThan(200);
  });

  // §4: a curated page owns its topic, so the generator twin is suppressed —
  // one entry per topic, not two landing pages for the same information.
  test('a curated page suppresses its generator twin', async ({ page }) => {
    await page.goto('/sheet/');
    await clickTool(page, '[data-from-template]');
    await expect(page.locator('[data-template-id="npc-one-pager"]')).toBeVisible();
    await expect(page.locator('[data-template-id="gm/npc"]')).toHaveCount(0);
    await expect(page.locator('[data-template-id="gm/shop"]')).toHaveCount(0);
  });
});

// The seamless bridge (GENERATORS-AS-ONEPAGERS.md §3.3): a generator's
// roll-table page links to /sheet/?template=<id>, which opens the whole topic
// as an editable, self-filling one-pager.
test.describe('deep link — open a topic as a full page', () => {
  test('?template=<id> instantiates a fully rolled page, then drops the query', async ({ page }) => {
    await page.goto('/sheet/?template=gm/tavern');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('Tavern');
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:');
    expect(text.length).toBeGreaterThan(200);
    // query stripped so a refresh won't spawn a duplicate sheet
    await expect.poll(() => new URL(page.url()).search).toBe('');
  });

  test('a gallery-suppressed generator still resolves by id', async ({ page }) => {
    await page.goto('/sheet/?template=gm/npc');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('NPC');
  });

  test('a shared seed reproduces the same page', async ({ page }) => {
    await page.goto('/sheet/?template=gm/tavern&seed=fixed-seed-42');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const first = (await page.locator('[data-blocks]').textContent()) ?? '';
    await page.goto('/sheet/?template=gm/tavern&seed=fixed-seed-42');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const second = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(second).toBe(first);
  });

  test('the generator page links through to a full page — carrying the rolls', async ({ page }) => {
    await page.goto('/gm/tavern/');
    // wait for the island: slots rolled from the page seed (batch B parity)
    const firstValue = page.locator('[data-slot] [data-value]').first();
    await expect(firstValue).not.toHaveText('…', { timeout: 30_000 });
    const rolled = (await firstValue.textContent())!.trim();
    await page.locator('[data-full-page]').click();
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('Tavern');
    // the sheet is filled from the SAME seeds the page rolled from
    // (slotSeeds ↔ instantiate contract) — the text carries over exactly
    await expect(page.locator('[data-blocks]')).toContainText(rolled);
  });
});

// The D&D 5e character sheet: a full curated template built on statGrid /
// tracker / actions, self-filling its spells, personality, and backstory.
test.describe('D&D 5e character sheet', () => {
  test('lists, instantiates fully rolled, and carries its mechanics', async ({ page }) => {
    await page.goto('/sheet/');
    await clickTool(page, '[data-from-template]');
    const card = page.locator('[data-template-id="dnd-5e-character"]');
    await expect(card).toBeVisible();
    await card.click();
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('D&D 5e Character');
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:'); // spells/personality/backstory rolled
    // the mechanical spine rendered: abilities, all 18 skills, attacks
    expect(text).toContain('STR');
    expect(text).toContain('Acrobatics');
    expect(text).toContain('Longsword');
    // two stat grids (abilities + the prof/AC/speed numbers)
    await expect(page.locator('[data-blocks] .block-statGrid')).toHaveCount(2);
  });

  test('abilities roll in play mode', async ({ page }) => {
    await page.goto('/sheet/?template=dnd-5e-character');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await page.locator('[data-mode-toggle]').click(); // → play
    // rollable abilities become roll buttons; the non-rollable numbers grid does not
    const abilityButtons = page.locator('[data-blocks] .block-statGrid button');
    expect(await abilityButtons.count()).toBeGreaterThanOrEqual(6);
    // and tapping one ACTUALLY rolls: the stage resolves the ability's modifier
    // (humanized, never $-syntax). The button being present is not proof it works.
    await abilityButtons.first().click();
    const stage = page.locator('.dice-stage');
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute('title', /\.mod\)/);
    await expect(stage).not.toHaveAttribute('title', /\$/);
  });
});

// A composite one-click builder (§3.2) also opens as a full page — but by
// RUNNING build() with its dials, not by filling a static template.
test.describe('deep link — a composite as a full page', () => {
  test('a composite deep link runs build() and lands an editable page', async ({ page }) => {
    await page.goto('/sheet/?template=gm/tavern-page');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('Tavern One-Pager');
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:');
    expect(text.length).toBeGreaterThan(200);
    await expect.poll(() => new URL(page.url()).search).toBe('');
  });

  test('the dials ride in as params and change the build', async ({ page }) => {
    await page.goto('/sheet/?template=gm/hoard&seed=dialtest&items=none');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('Treasure Hoard');
    const lean = (await page.locator('[data-blocks]').textContent()) ?? '';
    await page.goto('/sheet/?template=gm/hoard&seed=dialtest&items=loaded');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const loaded = (await page.locator('[data-blocks]').textContent()) ?? '';
    // same seed, one dial changed → the magic-items section differs
    expect(loaded).not.toBe(lean);
  });

  test('a composite page links through, carrying its dials', async ({ page }) => {
    await page.goto('/gm/hoard/');
    // pick a non-default dial so we can prove it travels
    await page.locator('select[data-opt="items"]').selectOption('loaded');
    await page.locator('[data-full-page]').click();
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    await expect(page.locator('[data-sheet-name]')).toHaveText('Treasure Hoard');
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:');
  });
});

// The SRD 5.1 character builder (engine/dnd5e.ts + composites/dnd-character.ts):
// dials for class/race/level compute a mechanically-correct sheet.
test.describe('D&D character builder', () => {
  test('builds a computed sheet from its dials, spellcasting and all', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=wizard&race=elf&level=5&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    // the sheet is named after the CHARACTER (the rolled title), not the generator
    const h2 = page.locator('[data-blocks] .b-title h2').first();
    const charName = ((await h2.evaluate((el) => el.childNodes[0]?.textContent)) ?? '').trim();
    expect(charName.length).toBeGreaterThan(0);
    await expect(page.locator('[data-sheet-name]')).not.toHaveText('D&D Character');
    expect((await page.locator('[data-sheet-name]').textContent())?.trim()).toBe(charName);
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:'); // spells/personality rolled
    expect(text).toContain('Wizard');
    expect(text).toContain('Elf');
    expect(text).toContain('Save DC'); // a caster gets a spellcasting page
    // the printed-sheet layout: ability + combat strips on page 1, the casting
    // summary on the spell page — each stat strip is its own statGrid
    await expect(page.locator('[data-blocks] .b-statGrid')).toHaveCount(4);
  });

  test('a martial class has no spellcasting; the dial changes the build', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=barbarian&race=half-orc&level=3');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const barb = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(barb).toContain('Barbarian');
    expect(barb).not.toContain('Spell Save DC');
  });

  test('a subclass and its features land once the level unlocks it', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=fighter&race=human&level=5&subclass=champion&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).toContain('Champion'); // subclass named in header + features
    expect(text).toContain('Improved Critical'); // a Champion feature
    expect(text).toContain('Fighting Style'); // a rolled class choice
  });

  test('the subclass dial follows the class and unlocks at its subclass level', async ({ page }) => {
    await page.goto('/gm/dnd-character/');
    // wait for the island to hydrate and run its first build (proves setup ran)
    await expect(page.locator('.composite [data-preview]')).not.toBeEmpty({ timeout: 15_000 });
    const cls = page.locator('select[data-opt="class"]');
    const lvl = page.locator('select[data-opt="level"]');
    const sub = page.locator('select[data-opt="subclass"]');

    await cls.selectOption('fighter');
    await lvl.selectOption('2');
    await expect(sub).toBeDisabled(); // martial archetype unlocks at 3
    await lvl.selectOption('3');
    await expect(sub).toBeEnabled();
    await expect(sub.locator('option', { hasText: 'Champion' })).toHaveCount(1);

    // switching class swaps the subclass list to the new class's options
    await cls.selectOption('rogue');
    await expect(sub.locator('option', { hasText: 'Thief' })).toHaveCount(1);
    await expect(sub.locator('option', { hasText: 'Champion' })).toHaveCount(0);
  });

  test('a caster rolls a class spellbook, and HP can be rolled', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=wizard&race=gnome&level=5&abilities=array&hp=roll');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).not.toContain('{table:');
    expect(text).toContain('Spellcasting'); // the spell page renders
    expect(text).toContain('Cantrips'); // a class spellbook renders
    expect(text).toContain('1st-Level Spells');
    expect(text).toContain('hit points are rolled'); // the HP dial took effect
  });

  test('a feat can be taken at a level-up, shown in Level-Up Choices', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=fighter&race=human&level=8&feats=feat&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).toContain('Level-Up Choices');
    expect(text).toContain('Grappler'); // the SRD feat
  });

  test('a subclass menu choice is rolled (Draconic ancestor)', async ({ page }) => {
    await page.goto('/sheet/?template=gm/dnd-character&class=sorcerer&race=tiefling&level=1&subclass=draconic&abilities=array');
    await expect(blocks(page).first()).toBeAttached({ timeout: 15_000 });
    const text = (await page.locator('[data-blocks]').textContent()) ?? '';
    expect(text).toContain('Draconic Bloodline');
    expect(text).toContain('Dragon Ancestor');
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
