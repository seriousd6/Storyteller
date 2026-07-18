import { test, expect } from '@playwright/test';

// The offline shell (PLAN.md §21.7): airplane-mode prep and dead-wifi game
// nights. The service worker takes control, and a page you've visited —
// including its hashed JS chunks — reloads with the network gone.

test.describe('PWA shell', () => {
  test('manifest is linked and describes an installable app', async ({ page }) => {
    await page.goto('/sheet/');
    await expect(page.locator('link[rel=manifest]')).toHaveAttribute('href', '/manifest.webmanifest');
    const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
    expect(manifest.name).toBe('Storyteller Toolbox');
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  test('the sheet survives dead wifi: offline reload still renders and works', async ({ page, context }) => {
    await page.goto('/sheet/');
    // the worker installs, activates, and claims this page
    await page.waitForFunction(() => navigator.serviceWorker.controller != null, undefined, {
      timeout: 15_000,
    });
    // one controlled reload primes the cache with this page's hashed chunks
    await page.reload();
    await expect(page.locator('[data-insert-open]')).toBeVisible();

    await context.setOffline(true);
    await page.reload();
    // the shell came from cache…
    await expect(page.locator('[data-insert-open]')).toBeVisible();
    // …and so did the JS: the insert menu actually opens
    await page.locator('[data-insert-open]').click();
    await expect(page.locator('[data-insert-menu]')).toBeVisible();
    await context.setOffline(false);
  });
});
