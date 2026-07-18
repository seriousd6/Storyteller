import type { Page } from '@playwright/test';

/** Add a block through the ＋ Insert menu (the toolbar's single entry point
 *  since the workspace batch). `kind` is the data-add-* suffix: title, note,
 *  list, table, keyvalue, rolltable, statgrid, tracker, actions, statblock,
 *  image, pagebreak, columns. */
export async function insertBlock(page: Page, kind: string): Promise<void> {
  await page.locator('[data-insert-open]').click();
  await page.locator(`[data-insert-menu] [data-add-${kind}]`).click();
}

/** Wait until some sheet with blocks has actually LANDED in IndexedDB.
 *  A pin's write is queued async (sheetStore mirror → IDB); navigating away
 *  aborts pending transactions and loses it. Humans have a ~ms window — the
 *  loaded e2e machine stretches it to seconds, so navigate only once the
 *  write is durable. */
/** Same durability rule for DELETION: the trash flag's write must land in
 *  IndexedDB before a reload, or the navigation aborts it and the deletion
 *  silently un-happens. */
export async function trashIsDurable(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('stb:sheets');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const get = db.transaction('sheets', 'readonly').objectStore('sheets').getAll();
            get.onerror = () => {
              db.close();
              resolve(false);
            };
            get.onsuccess = () => {
              db.close();
              resolve((get.result as { deletedAt?: number }[]).some((s) => Boolean(s.deletedAt)));
            };
          } catch {
            db.close();
            resolve(false);
          }
        };
      }),
  );
}

export async function pinIsDurable(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((resolve) => {
        const req = indexedDB.open('stb:sheets');
        req.onerror = () => resolve(false);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const get = db.transaction('sheets', 'readonly').objectStore('sheets').getAll();
            get.onerror = () => {
              db.close();
              resolve(false);
            };
            get.onsuccess = () => {
              db.close();
              resolve((get.result as { blocks?: unknown[] }[]).some((s) => (s.blocks?.length ?? 0) > 0));
            };
          } catch {
            db.close();
            resolve(false);
          }
        };
      }),
  );
}
