import { test, expect, type Page } from '@playwright/test';

// Campaign Codex Phase B (docs/CAMPAIGN-CODEX.md §2a): a person carries a
// GM-only "Feelings toward the party" dropdown + a "why", "where the party met
// them", and GM notes. Enum + secret field types on the person kind
// (everdeep/registry.json), rendered by world.astro's fieldRow — secret fields
// never show in Player View.

const NOW = '2026-07-17T00:00:00.000Z';

// Seed a one-person world straight into IndexedDB (the shape newWorld/newEntity
// mint), mark it the active world, and reload so /world/ opens it.
async function seedPerson(page: Page, fields: Record<string, unknown>): Promise<void> {
  await page.goto('/world/');
  await page.evaluate(
    ({ fields, now }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('stb:everdeep');
        req.onsuccess = () => {
          const db = req.result;
          const world = {
            schemaVersion: 1,
            genVersion: 1,
            id: 'w_codex',
            name: 'Codex Test Realm',
            seed: 'codex',
            entities: {
              e_alice: { id: 'e_alice', kind: 'person', name: 'Alice Marsh', fields, body: [], rev: 1, created: now, updated: now },
            },
            planes: [],
            settings: { ghostDensity: 4, unitsDisplay: 'imperial' },
            conflicts: [],
            rev: 1,
            created: now,
            updated: now,
          };
          const tx = db.transaction('worlds', 'readwrite');
          tx.objectStore('worlds').put(world);
          tx.oncomplete = () => {
            localStorage.setItem('stb:everdeep:activeWorld', 'w_codex');
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    { fields, now: NOW },
  );
  await page.reload();
  await expect(page.locator('#treeSearch')).toBeVisible({ timeout: 30_000 });
  await page.locator('#treeSearch').fill('Alice');
  await page.locator('#tree .node').first().click();
  await expect(page.locator('#page h1.wd-title')).toContainText('Alice');
}

test('a person carries a disposition dropdown that edits AND persists', async ({ page }) => {
  await seedPerson(page, { disposition: 'Friendly' });
  const sel = page.locator('#page [data-fkey="disposition"]');
  await expect(sel).toHaveValue('Friendly');
  await sel.selectOption('Hostile');
  await expect(sel).toHaveValue('Hostile');
  // selectOption→toHaveValue is just native browser state — it passes even if the
  // field-commit handler were deleted. Prove the pick reached the WORLD STORE:
  // wait for the write to land in IndexedDB, then reload + re-open the person.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<string | null>((resolve) => {
              const req = indexedDB.open('stb:everdeep');
              req.onsuccess = () => {
                const g = req.result.transaction('worlds', 'readonly').objectStore('worlds').get('w_codex');
                g.onsuccess = () => resolve(g.result?.entities?.e_alice?.fields?.disposition ?? null);
                g.onerror = () => resolve(null);
              };
              req.onerror = () => resolve(null);
            }),
        ),
      { timeout: 10_000 },
    )
    .toBe('Hostile');
  await page.reload();
  await expect(page.locator('#treeSearch')).toBeVisible({ timeout: 30_000 });
  await page.locator('#treeSearch').fill('Alice');
  await page.locator('#tree .node').first().click();
  await expect(page.locator('#page h1.wd-title')).toContainText('Alice');
  await expect(page.locator('#page [data-fkey="disposition"]')).toHaveValue('Hostile');
});

// Seed a two-entity world (a person + a place) and open the person, for the
// relation-editor test.
async function seedTwoAndOpenAlice(page: Page): Promise<void> {
  await page.goto('/world/');
  await page.evaluate(
    (now) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('stb:everdeep');
        req.onsuccess = () => {
          const world = {
            schemaVersion: 1, genVersion: 1, id: 'w_codex', name: 'Codex Test Realm', seed: 'codex',
            entities: {
              e_alice: { id: 'e_alice', kind: 'person', name: 'Alice Marsh', fields: {}, body: [], rev: 1, created: now, updated: now },
              e_docks: { id: 'e_docks', kind: 'place', name: 'The Drowned Docks', fields: {}, body: [], rev: 1, created: now, updated: now },
            },
            planes: [], settings: { ghostDensity: 4, unitsDisplay: 'imperial' }, conflicts: [], rev: 1, created: now, updated: now,
          };
          const tx = req.result.transaction('worlds', 'readwrite');
          tx.objectStore('worlds').put(world);
          tx.oncomplete = () => { localStorage.setItem('stb:everdeep:activeWorld', 'w_codex'); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    NOW,
  );
  await page.reload();
  await expect(page.locator('#treeSearch')).toBeVisible({ timeout: 30_000 });
  await page.locator('#treeSearch').fill('Alice');
  await page.locator('#tree .node').first().click();
  await expect(page.locator('#page h1.wd-title')).toContainText('Alice');
}

test('a GM connects two entities with a note, and can remove it (Codex B3)', async ({ page }) => {
  await seedTwoAndOpenAlice(page);
  await page.locator('#relType').fill('met the party at');
  await page.locator('#relTarget').selectOption('e_docks');
  await page.locator('#relNote').fill('First meeting — she fished them out of the harbour.');
  await page.locator('#relAdd').click();

  const rel = page.locator('#page .rel > li').first();
  await expect(rel).toContainText('met the party at');
  await expect(rel).toContainText('Drowned Docks'); // the target link
  await expect(rel).toContainText('fished them out'); // the note the render used to drop

  await page.locator('#page [data-rel-del]').first().click();
  await expect(page.locator('#page .rel-note')).toHaveCount(0); // the connection is gone
});

// A REAL png, drawn by the browser — hand-fabricated bytes fail
// createImageBitmap (the normalize step putAssetFromFile runs).
async function pngUpload(page: Page, name: string) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 8;
    c.height = 8;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#4a6fa5';
    ctx.fillRect(0, 0, 8, 8);
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return { name, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}

test('a photo uploads onto an entity and renders as an avatar (Codex B2)', async ({ page }) => {
  await seedPerson(page, {});
  await page.locator('#photoInput').setInputFiles(await pngUpload(page, 'face.png'));
  // the store hands back an object URL that mounts as the avatar
  await expect(page.locator('#entityPhoto')).toHaveAttribute('src', /^blob:/, { timeout: 15_000 });
  // the procedural portrait steps aside once a real photo is set
  await expect(page.locator('#portraitBox')).toHaveCount(0);
});

test('GM notes and disposition hide in Player View; shared fields stay', async ({ page }) => {
  await seedPerson(page, { gmNotes: 'SECRETINTEL', disposition: 'Devoted', metParty: 'at the docks' });
  const pageEl = page.locator('#page');
  // GM view: the secret GM note (textarea) is present; the shared field holds
  // its value; the secret disposition select carries it.
  await expect(pageEl).toContainText('SECRETINTEL');
  await expect(page.locator('#page [data-fkey="metParty"]')).toHaveValue('at the docks');
  await expect(page.locator('#page [data-fkey="disposition"]')).toHaveValue('Devoted');

  await page.locator('#playerView').check();
  await expect(pageEl).not.toContainText('SECRETINTEL'); // GM note hidden
  await expect(page.locator('#page [data-fkey="disposition"]')).toHaveCount(0); // no secret dropdown
  await expect(pageEl).not.toContainText('Devoted'); // secret disposition value gone
  await expect(pageEl).toContainText('at the docks'); // non-secret field shows as read-only text
});
