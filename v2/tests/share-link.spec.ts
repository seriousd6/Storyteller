import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { insertBlock, pinIsDurable } from './helpers';

// Share links + sheet files (PLAN.md §21.5): the sheet leaves home. The link
// carries the whole sheet in its hash — no server — and the .json file is the
// same pack. The codec's semantics are pinned by smoke-share.mjs; these drive
// the real dialog → URL → new-sheet path, and the entityRef flattening rule
// (snapshots travel, GM secrets stay home) against the real IndexedDB.

test('a share link carries the whole sheet — open it, get your own copy', async ({ page }) => {
  await page.goto('/sheet/');
  await insertBlock(page, 'tracker');
  await insertBlock(page, 'table');
  const name = await page.locator('[data-sheet-name]').textContent();
  const before = await page.locator('[data-sheet-select] option').count();

  await page.locator('[data-share-open]').click();
  const url = page.locator('[data-share-url]');
  await expect(url).toHaveValue(/#share=/); // waits out “Preparing link…”
  const link = await url.inputValue();
  await page.locator('[data-share-close]').click();

  await pinIsDurable(page);
  await page.goto('/'); // leave first — a hash-only goto would not re-run the page
  await page.goto(link);
  await expect(page.locator('[data-sheet-name]')).toHaveText(name!);
  await expect(page.locator('[data-blocks] .block-tracker')).toHaveCount(1);
  await expect(page.locator('[data-blocks] .block-table')).toHaveCount(1);
  await expect(page.locator('[data-sheet-select] option')).toHaveCount(before + 1);
  // hash stripped: a refresh must not import a duplicate
  expect(new URL(page.url()).hash).toBe('');
  await pinIsDurable(page);
  await page.reload();
  await expect(page.locator('[data-sheet-name]')).toHaveText(name!);
  await expect(page.locator('[data-sheet-select] option')).toHaveCount(before + 1);
});

test('the sheet file round-trips through the import dialog', async ({ page }) => {
  await page.goto('/sheet/');
  await insertBlock(page, 'keyvalue');
  await page.locator('[data-share-open]').click();
  await expect(page.locator('[data-share-url]')).toHaveValue(/#share=/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-share-json]').click(),
  ]);
  const text = readFileSync((await download.path())!, 'utf8');
  const parsed = JSON.parse(text) as { format: string; blocks: Array<{ type: string }> };
  expect(parsed.format).toBe('storyteller-sheet');
  expect(parsed.blocks.some((b) => b.type === 'keyValue')).toBe(true);
  await page.locator('[data-share-close]').click();

  await page.locator('[data-from-template]').click();
  await page.locator('[data-template-id="import-homebrew"]').click();
  await page.locator('[data-import-text]').fill(text);
  await page.locator('[data-import-go]').click();
  await expect(page.locator('[data-import-status]')).toContainText('Imported');
  await page.locator('[data-import-close]').click();
  await expect(page.locator('[data-blocks] .block-keyValue')).toHaveCount(1);
});

test('a damaged share link fails honestly and creates nothing', async ({ page }) => {
  await page.goto('/sheet/');
  const before = await page.locator('[data-sheet-select] option').count();
  let alerted = '';
  page.on('dialog', (d) => {
    alerted = d.message();
    void d.accept();
  });
  await page.goto('/');
  await page.goto('/sheet/#share=this-is-not-a-sheet');
  await expect(page.locator('[data-sheet-select] option')).toHaveCount(before);
  expect(alerted).toContain('damaged');
  expect(new URL(page.url()).hash).toBe('');
});

// --- entityRef flattening: what leaves the device is a snapshot, never a wire,
// and never a secret. World seeding mirrors entity-ref.spec.ts.

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
      updated: '2026-07-18T00:00:00.000Z',
      body: [
        { type: 'paragraph', id: 'b1', text: 'A blacksmith with a secret.' },
        { type: 'paragraph', id: 'b2', text: 'Sells stolen goods to the Ravens.' },
      ],
      secretBlocks: ['b2'],
    },
  },
  rev: 1,
  created: '2026-07-18T00:00:00.000Z',
  updated: '2026-07-18T00:00:00.000Z',
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

test('an embedded world entity travels as a snapshot — GM secrets stay home', async ({ page }) => {
  await page.goto('/sheet/');
  await putWorldIdb(page, WORLD);
  await page.evaluate(() => {
    localStorage.setItem(
      'stb:sheets:v1',
      JSON.stringify({
        activeId: 's1',
        sheets: [
          { id: 's1', name: 'Prep', blocks: [{ type: 'entityRef', id: 'r1', worldId: 'w1', entityId: 'e1' }] },
        ],
      }),
    );
  });
  await page.reload();
  await expect(page.locator('.b-entityRef')).toContainText('A blacksmith with a secret.');

  await page.locator('[data-share-open]').click();
  await expect(page.locator('[data-share-url]')).toHaveValue(/#share=/);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('[data-share-json]').click(),
  ]);
  const text = readFileSync((await download.path())!, 'utf8');
  expect(text).toContain('Vera the Bold'); // the snapshot leads with the entity's name
  expect(text).toContain('A blacksmith with a secret.'); // public body travels
  expect(text).not.toContain('entityRef'); // no live wire in the export
  expect(text).not.toContain('Sells stolen goods'); // the secret does NOT
});
