import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { insertBlock, clickTool } from './helpers';

// @-mentions (Phase 5, last item): type @ in any text field, pick a world
// entity, get an inline [[@worldId:entityId]] token — a name-link chip on
// play/static surfaces, the plain name in anything that leaves the device.

const WORLD = {
  schemaVersion: 1,
  genVersion: 1,
  id: 'w1',
  name: 'Testland',
  seed: 's',
  entities: {
    e1: {
      id: 'e1',
      kind: 'person',
      name: 'Vera the Bold',
      rev: 1,
      updated: '2026-07-19T00:00:00.000Z',
      body: [{ type: 'paragraph', id: 'b1', text: 'A blacksmith with a secret.' }],
    },
    e2: {
      id: 'e2',
      kind: 'faction',
      name: 'Veiled Hand',
      secret: true, // GM-only: must never autocomplete
      rev: 1,
      updated: '2026-07-19T00:00:00.000Z',
      body: [],
    },
  },
  rev: 1,
  created: '2026-07-19T00:00:00.000Z',
  updated: '2026-07-19T00:00:00.000Z',
};

function putWorldIdb(page: Page, world: unknown): Promise<void> {
  return page.evaluate(
    (w) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('stb:everdeep', 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains('worlds')) {
            req.result.createObjectStore('worlds', { keyPath: 'id' });
          }
        };
        req.onsuccess = () => {
          const tx = req.result.transaction('worlds', 'readwrite');
          tx.objectStore('worlds').put(w);
          tx.oncomplete = () => {
            req.result.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    world,
  );
}

async function startTyping(page: Page): Promise<void> {
  await page.goto('/sheet/');
  await putWorldIdb(page, WORLD);
  await insertBlock(page, 'note');
  const text = page.locator('[data-blocks] .b-paragraph span[contenteditable]').first();
  await text.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Talk to ');
}

test('typing @ suggests entities; picking one plants the token; Play renders the name link', async ({ page }) => {
  await startTyping(page);
  await page.keyboard.type('@Ver');
  const menu = page.locator('.mention-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('.mention-item')).toHaveCount(1); // 'Veiled Hand' is secret — absent
  await expect(menu).toContainText('Vera the Bold');
  await page.keyboard.press('Enter');
  await expect(menu).toBeHidden();
  await expect(page.locator('[data-blocks] .b-paragraph').first()).toContainText('[[@w1:e1]]');

  await page.locator('[data-mode-toggle]').click(); // Play: the token becomes a link
  const chip = page.locator('.chip-entity');
  await expect(chip).toHaveText('@Vera the Bold');
  await expect(chip).toHaveAttribute('href', /world=w1.*entity=e1/);
});

test('Escape dismisses the menu and the @ stays as typed text', async ({ page }) => {
  await startTyping(page);
  await page.keyboard.type('@Ver');
  await expect(page.locator('.mention-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.mention-menu')).toBeHidden();
  await expect(page.locator('[data-blocks] .b-paragraph').first()).toContainText('Talk to @Ver');
});

test('exports carry the plain name — a mention token never leaves the device', async ({ page }) => {
  await startTyping(page);
  await page.keyboard.type('@Vera');
  await expect(page.locator('.mention-menu')).toBeVisible();
  await page.keyboard.press('Enter');
  await page.locator('body').click(); // blur commits the edit session

  // markdown export
  const [mdDownload] = await Promise.all([
    page.waitForEvent('download'),
    clickTool(page, '[data-export]'),
  ]);
  const md = readFileSync((await mdDownload.path())!, 'utf8');
  expect(md).toContain('Talk to Vera the Bold');
  expect(md).not.toContain('[[@');

  // sheet-file export (the share pack)
  await clickTool(page, '[data-share-open]');
  await expect(page.locator('[data-share-url]')).toHaveValue(/#share=/);
  const [jsonDownload] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-share-json]').click(),
  ]);
  const json = readFileSync((await jsonDownload.path())!, 'utf8');
  expect(json).toContain('Talk to Vera the Bold');
  expect(json).not.toContain('[[@');
});
