import { test, expect, type Page } from '@playwright/test';
import { insertBlock } from './helpers';

// entityRef (owner decision 2026-07-18, PLAN.md §21.10): a sheet block that
// IS a world entity. One copy of the data — edit the sheet, the world store
// changes; change the world, WORLD_EVENT re-renders the sheet. These drive
// both directions against the real IndexedDB.

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
      body: [{ type: 'paragraph', id: 'b1', text: 'A blacksmith with a secret.' }],
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

function readWorldIdb(page: Page): Promise<unknown> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('stb:everdeep', 1);
        req.onsuccess = () => {
          const get = req.result.transaction('worlds').objectStore('worlds').get('w1');
          get.onsuccess = () => {
            req.result.close();
            resolve(get.result);
          };
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

async function seedRefSheet(page: Page): Promise<void> {
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
}

test.describe('entityRef — one copy of the data', () => {
  test('renders the entity, and a sheet-side edit lands in the world store', async ({ page }) => {
    await seedRefSheet(page);
    const ref = page.locator('.b-entityRef');
    await expect(ref.locator('.entity-ref-head b')).toHaveText('Vera the Bold');
    await expect(ref).toContainText('A blacksmith with a secret.');
    const text = ref.locator('.b-paragraph span[contenteditable]');
    await text.click();
    await text.fill('A blacksmith with TWO secrets.');
    await text.blur();
    await expect
      .poll(async () => JSON.stringify(await readWorldIdb(page)), { timeout: 10_000 })
      .toContain('TWO secrets');
  });

  test('a world-side edit re-renders the embedded entity live', async ({ page }) => {
    await seedRefSheet(page);
    await expect(page.locator('.entity-ref-head b')).toHaveText('Vera the Bold');
    const changed = structuredClone(WORLD);
    changed.entities.e1.name = 'Vera the Renamed';
    changed.entities.e1.body[0]!.text = 'Now a duchess.';
    changed.rev = 2;
    await putWorldIdb(page, changed);
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('stb:world-changed', { detail: { id: 'w1' } }));
    });
    await expect(page.locator('.entity-ref-head b')).toHaveText('Vera the Renamed');
    await expect(page.locator('.b-entityRef')).toContainText('Now a duchess.');
  });

  test('Save to world promotes the sheet and re-points it at the entity; undo detaches', async ({ page }) => {
    await page.goto('/sheet/');
    await putWorldIdb(page, structuredClone(WORLD)); // one world → no chooser
    await insertBlock(page, 'note');
    await page.locator('[data-promote]').click();
    await expect(page.locator('[data-blocks] .block')).toHaveCount(1);
    await expect(page.locator('.b-entityRef .entity-ref-head b')).toHaveText('My Sheet');
    // the entity really exists in the world store, body included
    await expect
      .poll(async () => JSON.stringify(await readWorldIdb(page)))
      .toContain('Write here…');
    // undo: the sheet detaches (the world keeps the entity)
    await page.keyboard.press('Control+z');
    await expect(page.locator('.b-entityRef')).toHaveCount(0);
    await expect(page.locator('[data-blocks] .block-paragraph')).toHaveCount(1);
  });
});
