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

test('a person carries a disposition dropdown that edits', async ({ page }) => {
  await seedPerson(page, { disposition: 'Friendly' });
  const sel = page.locator('#page [data-fkey="disposition"]');
  await expect(sel).toHaveValue('Friendly');
  await sel.selectOption('Hostile');
  await expect(sel).toHaveValue('Hostile');
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
