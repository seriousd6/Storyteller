import type { Locator, Page } from '@playwright/test';

/** Add a block through the ＋ Insert menu (the toolbar's single entry point
 *  since the workspace batch). `kind` is the data-add-* suffix: title, note,
 *  list, table, keyvalue, rolltable, statgrid, tracker, actions, statblock,
 *  image, pagebreak, columns. */
export async function insertBlock(page: Page, kind: string): Promise<void> {
  await page.locator('[data-insert-open]').click();
  await page.locator(`[data-insert-menu] [data-add-${kind}]`).click();
}

/** Reach a command-bar tool wherever it lives (editor-shell batch): daily
 *  verbs sit on the bar; occasional ones are inside the Sheet ▾ / ☁ Drive
 *  dropdowns and need their menu opened first. */
export async function tool(page: Page, selector: string): Promise<Locator> {
  const el = page.locator(selector).first();
  if (!(await el.isVisible().catch(() => false))) {
    for (const menuSel of ['[data-file-menu]', '[data-drive-menu]']) {
      const menu = page.locator(menuSel);
      if ((await menu.count()) > 0 && (await menu.locator(selector).count()) > 0) {
        if (!(await menu.evaluate((d) => (d as HTMLDetailsElement).open))) {
          await menu.locator('summary').click();
        }
        break;
      }
    }
  }
  return el;
}

export async function clickTool(page: Page, selector: string): Promise<void> {
  await (await tool(page, selector)).click();
}

export async function selectTool(page: Page, selector: string, value: string): Promise<void> {
  await (await tool(page, selector)).selectOption(value);
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
