import { defineConfig, devices } from '@playwright/test';

// End-to-end tests: a real browser against the built site, served the way
// GitHub Pages serves it, under /rsvp-web-reader/. The unit tests prove the
// logic. These prove that the thing people get actually loads and reads.
//
// Run `npm run e2e`. It builds first, so the tests never see a stale build.
// The browsers are a one-time download: `npx playwright install`.

const PORT = 4173;
// Must end with a slash, and must match `base` in vite.config.ts.
const SITE = `http://localhost:${PORT}/rsvp-web-reader/`;
const isCI = process.env.CI !== undefined;

export default defineConfig({
  testDir: 'e2e',
  // A test.only left in by mistake fails CI and does not skip the rest.
  forbidOnly: isCI,
  // No retries. A test that passes only the second time is hiding something.
  retries: 0,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: SITE,
    // Keeps a recording of a failed test, to look at afterwards.
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: SITE,
    // On your own machine a preview that is already running is used as it is.
    reuseExistingServer: !isCI,
  },
});
