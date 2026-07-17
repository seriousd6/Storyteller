import type { Page } from '@playwright/test';

/** Wait until some sheet with blocks has actually LANDED in IndexedDB.
 *  A pin's write is queued async (sheetStore mirror → IDB); navigating away
 *  aborts pending transactions and loses it. Humans have a ~ms window — the
 *  loaded e2e machine stretches it to seconds, so navigate only once the
 *  write is durable. */
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
