import { test, expect, type Page } from '@playwright/test';

// Phase 4 (docs/sheets/PLAN.md §13): the auto-sync courier, end to end
// against a FAKE Google — the GSI script and the whole Drive REST surface
// are Playwright routes backed by an in-memory Map. No real network, no
// real account, and the sync engine cannot tell the difference.

interface CloudFile {
  id: string;
  name: string;
  mimeType?: string;
  appProperties?: Record<string, string>;
  content: string;
  modifiedTime: string;
}

function makeCloud() {
  const files = new Map<string, CloudFile>();
  let n = 0;
  return {
    files,
    nextId: () => `cf-${++n}`,
    byType: (t: string) => [...files.values()].filter((f) => f.appProperties?.stbType === t),
  };
}
type Cloud = ReturnType<typeof makeCloud>;

async function installFakeGoogle(page: Page, cloud: Cloud) {
  // the GSI client: hands out a token instantly, no popup
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `window.google = { accounts: { oauth2: {
        initTokenClient: (cfg) => ({ requestAccessToken: () => cfg.callback({ access_token: 'fake', expires_in: 3600 }) }),
        revoke: (t, done) => done && done(),
      } } };`,
    }),
  );

  await page.route('https://www.googleapis.com/**', (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    // GET list
    if (method === 'GET' && url.pathname === '/drive/v3/files') {
      const q = url.searchParams.get('q') ?? '';
      let out = [...cloud.files.values()];
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) {
        out = out.filter((f) => f.mimeType === 'application/vnd.google-apps.folder');
      } else if (q.includes("key='stbApp'")) {
        out = out.filter((f) => f.appProperties?.stbApp === '1');
      } else {
        out = [];
      }
      return route.fulfill({
        json: { files: out.map((f) => ({ id: f.id, name: f.name, modifiedTime: f.modifiedTime, appProperties: f.appProperties })) },
      });
    }
    // GET download
    const mediaMatch = url.pathname.match(/^\/drive\/v3\/files\/([^/]+)$/);
    if (method === 'GET' && mediaMatch && url.searchParams.get('alt') === 'media') {
      const f = cloud.files.get(mediaMatch[1]!);
      return f ? route.fulfill({ body: f.content }) : route.fulfill({ status: 404, body: 'gone' });
    }
    // DELETE
    if (method === 'DELETE' && mediaMatch) {
      cloud.files.delete(mediaMatch[1]!);
      return route.fulfill({ status: 204, body: '' });
    }
    // POST folder create (plain JSON)
    if (method === 'POST' && url.pathname === '/drive/v3/files') {
      const meta = JSON.parse(req.postData() ?? '{}');
      const id = cloud.nextId();
      cloud.files.set(id, { id, name: meta.name, mimeType: meta.mimeType, content: '', modifiedTime: new Date().toISOString() });
      return route.fulfill({ json: { id } });
    }
    // multipart upload (create or patch)
    const upMatch = url.pathname.match(/^\/upload\/drive\/v3\/files(?:\/([^/]+))?$/);
    if (upMatch && (method === 'POST' || method === 'PATCH')) {
      const raw = req.postDataBuffer()?.toString('utf8') ?? '';
      const parts = raw.split(/--stb-doc-sync(?:--)?/).filter((p) => p.trim().length);
      const meta = JSON.parse(parts[0]!.slice(parts[0]!.indexOf('{')));
      const payloadPart = parts[1] ?? '';
      const content = payloadPart.slice(payloadPart.indexOf('\r\n\r\n') + 4).replace(/\r\n$/, '');
      const id = upMatch[1] ?? cloud.nextId();
      const prev = cloud.files.get(id);
      cloud.files.set(id, {
        id,
        name: meta.name ?? prev?.name ?? 'unnamed',
        appProperties: meta.appProperties ?? prev?.appProperties,
        content,
        modifiedTime: new Date().toISOString(),
      });
      return route.fulfill({ json: { id } });
    }
    return route.fulfill({ status: 500, body: 'unhandled fake-drive route' });
  });
}

test('push: enabling auto-sync ferries every document to Drive, edits follow', async ({ page }) => {
  const cloud = makeCloud();
  await installFakeGoogle(page, cloud);
  await page.goto('/sheet/');
  await page.locator('[data-add-title]').click();
  const h = page.locator('[data-blocks] h2');
  await h.fill('The Sunken Keep');
  await h.blur();
  await page.locator('[data-sync-pill]').click(); // gesture → fake consent → first flush
  await expect(page.locator('[data-sync-pill]')).toContainText('Auto-sync: on', { timeout: 20_000 });
  // the pill reads "on" as soon as sync is ENABLED — the first flush may
  // still be in flight, so the cloud check must poll, not assert
  await expect.poll(() => cloud.byType('sheet').length, { timeout: 20_000 }).toBeGreaterThan(0);
  const before = cloud.byType('sheet').map((f) => f.appProperties!.stbHash).join(',');
  // an edit schedules a debounced push with a NEW hash
  await h.fill('The Risen Keep');
  await h.blur();
  await expect
    .poll(() => cloud.byType('sheet').map((f) => f.appProperties!.stbHash).join(','), { timeout: 30_000 })
    .not.toBe(before);
});

test('pull: a wiped device gets its documents back from Drive', async ({ page }) => {
  const cloud = makeCloud();
  await installFakeGoogle(page, cloud);
  await page.goto('/sheet/');
  const nameEl = page.locator('[data-sheet-name]');
  await nameEl.fill('Expedition Notes');
  await nameEl.blur();
  await page.locator('[data-add-title]').click();
  const h = page.locator('[data-blocks] h2');
  await h.fill('Carried by the courier');
  await h.blur();
  await page.locator('[data-sync-pill]').click();
  await expect.poll(() => cloud.byType('sheet').some((f) => f.content.includes('Carried by the courier')), { timeout: 20_000 }).toBe(true);
  // simulate a fresh device: clear the local stores + sync base, keep the link
  await page.evaluate(async () => {
    localStorage.removeItem('stb:sync:base:v1');
    await new Promise<void>((resolve) => {
      const req = indexedDB.open('stb:sheets');
      req.onsuccess = () => {
        const db = req.result;
        const t = db.transaction(['sheets', 'meta'], 'readwrite');
        t.objectStore('sheets').clear();
        t.objectStore('meta').clear();
        t.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
  });
  await page.reload();
  // the booted courier pulls the remote sheet back within debounce + flush;
  // the fresh device's own default sheet stays active, the pulled one joins
  // the picker
  await expect(page.locator('[data-sheet-select] option', { hasText: 'Expedition Notes' })).toBeAttached({ timeout: 30_000 });
  await page.locator('[data-sheet-select]').selectOption({ label: 'Expedition Notes' });
  await expect(page.locator('[data-blocks] h2')).toHaveText('Carried by the courier');
});

test('deletion propagates: removing a brew locally removes its Drive file', async ({ page }) => {
  const cloud = makeCloud();
  await installFakeGoogle(page, cloud);
  await page.goto('/sheet/');
  await page.locator('[data-brew-panel] summary').click();
  await page.locator('[data-brew-new]').click();
  await page.locator('[data-brew-title]').fill('Doomed Table');
  await page.locator('[data-brew-entries]').fill('only entry');
  await page.locator('[data-brew-save]').click();
  await page.locator('[data-sync-pill]').click();
  await expect.poll(() => cloud.byType('brew').length, { timeout: 20_000 }).toBe(1);
  // delete it locally → the courier deletes the cloud file (base-map reasoning)
  await page.locator('.brew-row .btn').click();
  page.on('dialog', (d) => void d.accept());
  await page.locator('[data-brew-delete]').click();
  await expect.poll(() => cloud.byType('brew').length, { timeout: 30_000 }).toBe(0);
});
