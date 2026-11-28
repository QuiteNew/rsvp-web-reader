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
  // Three browsers at once are heavy for one machine. With Playwright's
  // default (half the processor threads, 10 on the owner's laptop) a
  // Firefox test that takes 3 s alone took up to 28 s, and some ran out of
  // the 30 s a test gets. Fewer at a time keeps each one quick. CI keeps
  // Playwright's default.
  workers: isCI ? undefined : 4,
  // Room for a slow machine. A test that hangs still fails, a minute later.
  timeout: 60_000,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: SITE,
    // Keeps a recording of a failed test, to look at afterwards.
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      // One WebKit test at a time on the owner's machine. Playwright's WebKit
      // for Windows stopped drawing altogether for a minute when several of
      // its pages ran at once, even with no other browser running, and a
      // test waiting for a button to hold still then timed out. Its traces
      // show no frames at all after that moment and nothing on the page
      // moving. CI runs on Linux and keeps Playwright's default.
      workers: isCI ? undefined : 1,
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: SITE,
    // On your own machine a preview that is already running is used as it is.
    reuseExistingServer: !isCI,
  },
});
