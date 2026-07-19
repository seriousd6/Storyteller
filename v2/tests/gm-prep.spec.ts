import { test, expect, type Page } from '@playwright/test';

// GM prep, audit batch E: a rolled fight must be RUNNABLE, not a dead-end.
// (1) Encounter/lair/dungeon results carry SRD 5.1 statblock lines for every
// covered monster — the content invariants live in smoke-srd-statblocks.mjs;
// here we only prove the section actually renders on the shipped page.
// (2) A saved lair/dungeon offers "give it a floor plan": the world page's
// /map hash suffix descends straight into a generated interior.

const preview = (p: Page) => p.locator('[data-preview]');

async function hydrated(page: Page) {
  await expect(preview(page).locator('.b-statblock')).toBeVisible({ timeout: 30_000 });
}

// the same minimal world fixture solo-play.spec.ts uses (IDB v1, 'worlds')
const PLAN_WORLD = {
  schemaVersion: 1,
  genVersion: 1,
  id: 'w_plan',
  name: 'Emberfall',
  seed: 's',
  entities: {},
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

test.describe('rolled monsters carry their stats', () => {
  test('a shared encounter link shows the SRD statblock line', async ({ page }) => {
    // seed e-2 at the default dials rolls a Black Dragon Wyrmling — an
    // SRD-covered monster (smoke-srd-statblocks pins the content rules)
    await page.goto('/gm/encounter/#seed=e-2&size=4&level=3&difficulty=medium');
    await hydrated(page);
    await expect(preview(page)).toContainText('Black Dragon Wyrmling');
    await expect(preview(page)).toContainText('Statblocks');
    await expect(preview(page)).toContainText('AC 17 (natural armor)');
    await expect(preview(page)).toContainText('CC BY 4.0');
  });
});

test.describe('give it a floor plan', () => {
  test('save a dungeon, click the link, land inside its generated interior', async ({ page }) => {
    await page.goto('/gm/dungeon/');
    await hydrated(page);
    await putWorldIdb(page, PLAN_WORLD);

    await page.locator('[data-save-world]').click();
    await expect(page.locator('[data-world-save]')).toBeVisible();
    await page.locator('[data-world-confirm]').click();

    const plan = page.locator('[data-world-status] a', { hasText: 'floor plan' });
    await expect(plan).toBeVisible();
    await plan.click();

    // the world page opens the saved page AND descends into its interior
    await expect(page.locator('#siteOverlay canvas').first()).toBeVisible({ timeout: 30_000 });
    expect(page.url()).toContain('/world/');
  });
});
