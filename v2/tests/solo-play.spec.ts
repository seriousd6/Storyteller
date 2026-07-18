import { test, expect, type Page } from '@playwright/test';
import { pinIsDurable } from './helpers';

// The solo loop (GM/solo audit batch C): the oracle records the QUESTION with
// the answer, and the session log keeps every roll of the sitting instead of
// destroying each one on Generate. Smoke can't see any of this — the input,
// the hash param, sessionStorage, and the pin pipeline only exist hydrated.

const preview = (p: Page) => p.locator('[data-preview]');

async function hydrated(page: Page) {
  await expect(preview(page).locator('.b-statblock')).toBeVisible({ timeout: 30_000 });
}

test.describe('the question rides with the answer', () => {
  test('typed question appears in the result, the hash, and a fresh tab', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    await page.locator('input[data-ask]').fill('Will the guard believe us?');
    await page.locator('[data-generate]').click();
    await expect(preview(page)).toContainText('You asked');
    await expect(preview(page)).toContainText('Will the guard believe us?');
    expect(page.url()).toContain('question=');
    // the answer itself (statblock name) reproduces from the link, question included
    const answer = (await preview(page).locator('h3').first().textContent())!.trim();
    const page2 = await page.context().newPage();
    await page2.goto(page.url());
    await expect(preview(page2).locator('h3').first()).toHaveText(answer, { timeout: 30_000 });
    await expect(preview(page2)).toContainText('Will the guard believe us?');
    await expect(page2.locator('input[data-ask]')).toHaveValue('Will the guard believe us?');
    await page2.close();
  });

  test('Enter in the ask box asks it', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    const before = page.url();
    await page.locator('input[data-ask]').fill('Does the door open?');
    await page.locator('input[data-ask]').press('Enter');
    await expect(preview(page)).toContainText('Does the door open?');
    expect(page.url()).not.toBe(before); // a fresh seed was minted
  });

  test('a pinned answer lands on the sheet WITH its question', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    await page.locator('input[data-ask]').fill('Is the merchant lying?');
    await page.locator('[data-generate]').click();
    await expect(preview(page)).toContainText('Is the merchant lying?');
    await page.locator('[data-add]').click();
    await pinIsDurable(page);
    await page.goto('/sheet/');
    await expect(page.locator('[data-blocks]')).toContainText('Is the merchant lying?');
  });
});

test.describe('the session log', () => {
  test('each Generate files the previous roll; entries restore and clear', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    // the auto-roll on load is roll #1 — nothing to file yet
    await expect(page.locator('[data-log]')).toBeHidden();
    await page.locator('input[data-ask]').fill('First question?');
    await page.locator('[data-generate]').click(); // files the auto-roll
    await page.locator('[data-generate]').click(); // files "First question?"
    const items = page.locator('[data-log] .roll-log-item');
    await expect(items).toHaveCount(2);
    // newest first: the top entry carries the question it was asked with
    await expect(items.first()).toContainText('First question?');
    // ↩ brings an old roll back into the main preview (same answer + question)
    const headBefore = (await items.first().locator('strong').textContent())!.trim();
    await items.first().locator('[aria-label="Bring this one back"]').click();
    await expect(preview(page).locator('h3').first()).toContainText(headBefore);
    await expect(preview(page)).toContainText('First question?');
    // and Clear empties it
    await page.locator('[data-log-clear]').click();
    await expect(page.locator('[data-log]')).toBeHidden();
  });

  test('the log survives a refresh (same tab = same session)', async ({ page }) => {
    await page.goto('/solo/scene/');
    await hydrated(page);
    await page.locator('[data-generate]').click();
    await expect(page.locator('[data-log] .roll-log-item')).toHaveCount(1);
    await page.reload();
    await hydrated(page);
    await expect(page.locator('[data-log] .roll-log-item')).toHaveCount(1);
  });

  test('📌 from the log pins the real blocks to the worksheet', async ({ page }) => {
    await page.goto('/solo/outcome/');
    await hydrated(page);
    await page.locator('[data-generate]').click();
    const item = page.locator('[data-log] .roll-log-item').first();
    await expect(item).toBeVisible();
    await expect(page.locator('[data-tray-count]')).toHaveText('0');
    await item.locator('[aria-label="Pin this one to the worksheet"]').click();
    await expect(page.locator('[data-tray-count]')).toHaveText('1');
  });
});

// The world-aware oracle (audit batch D). These prove the WIRING — active
// world → cast opt → hash → the 🌍 note; the deterministic content checks
// (named events fire, no {{who}} residue, the cast never steers the dice)
// live in scripts/smoke-solo-cast.mjs where 400 seeds cost milliseconds.
const CAST_WORLD = {
  schemaVersion: 1,
  genVersion: 1,
  id: 'w_cast',
  name: 'Emberfall',
  seed: 's',
  entities: {
    e1: { id: 'e1', kind: 'person', name: 'Vekk the Knife', rev: 1, updated: '2026-07-18T00:00:00.000Z' },
    e2: { id: 'e2', kind: 'faction', name: 'The Ashen Compact', rev: 1, updated: '2026-07-18T00:00:00.000Z' },
    e3: { id: 'e3', kind: 'settlement', name: 'Duskbridge', rev: 1, updated: '2026-07-18T00:00:00.000Z' },
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

test.describe('the oracle knows your world', () => {
  test('an active world becomes the cast: note shown, cast in the hash, and it sticks', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    // no world yet — no note, no cast
    await expect(page.locator('[data-cast-note]')).toBeHidden();
    expect(page.url()).not.toContain('cast=');
    // seed the world and mark it active, then arrive fresh (no hash: a shared
    // link is authoritative, so the island only reads the world on clean loads)
    await putWorldIdb(page, CAST_WORLD);
    await page.evaluate(() => localStorage.setItem('stb:everdeep:activeWorld', 'w_cast'));
    await page.goto('/solo/oracle/');
    await expect(page.locator('[data-cast-note]')).toContainText('Emberfall', { timeout: 15_000 });
    expect(page.url()).toContain('cast=');
    // NOTE: URLSearchParams writes spaces as '+', which decodeURIComponent
    // keeps — match a single token, not the full name
    expect(decodeURIComponent(page.url())).toContain('Vekk');
    // and the cast survives the next Generate
    await page.locator('[data-generate]').click();
    expect(page.url()).toContain('cast=');
  });

  test('a shared link keeps ITS cast even on a device with a different world', async ({ page }) => {
    await page.goto('/solo/oracle/');
    await hydrated(page);
    await putWorldIdb(page, CAST_WORLD);
    await page.evaluate(() => localStorage.setItem('stb:everdeep:activeWorld', 'w_cast'));
    // a link that came from someone ELSE's world
    await page.goto('/solo/oracle/#seed=sharedcast1&likelihood=even&cast=' + encodeURIComponent('p:Foreignblade'));
    await hydrated(page);
    // the link's cast wins — the local world must not overwrite it
    expect(decodeURIComponent(page.url())).toContain('Foreignblade');
    expect(decodeURIComponent(page.url())).not.toContain('Vekk');
    await expect(page.locator('[data-cast-note]')).toBeHidden();
  });
});
