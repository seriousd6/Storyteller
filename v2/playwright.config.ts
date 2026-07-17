import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive the REAL built site, because the parts most worth
// testing here — the world tree, the map canvas — only exist once the island
// hydrates and IndexedDB has a world in it. `npm run check`/`validate`/`smoke`
// can't see any of that: they test data and pure modules, never the app.
// Concurrent sessions (CLAUDE.md): each agent worktree must run its e2e on
// its OWN port — with reuseExistingServer, two sessions sharing 4321 means
// one session's tests silently drive the OTHER session's build (it happened:
// a new toolbar button "didn't exist" because the served build was foreign).
const PORT = Number(process.env.STB_E2E_PORT ?? 4321);

export default defineConfig({
  testDir: './tests',
  // the world island loads a 4.3MB fixture and generates; give it room
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // build + serve the real static output, so a test failure means the SHIPPED
  // site is broken, not a dev-only quirk
  webServer: {
    command: `npm run build && npm run preview -- --port ${PORT}`,
    url: `http://localhost:${PORT}/world/`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
  },
});
