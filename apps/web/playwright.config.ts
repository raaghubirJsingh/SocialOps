import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for apps/web (SocialOps Testing Foundation).
 *
 * The smoke test boots the production Next.js server via `npm run start`
 * (which executes `next start`, defaulting to port 3000) and verifies
 * that the dashboard entry page renders. The test reuses any running
 * instance locally (reuseExistingServer: !CI) so the developer does not
 * have to wait for a server boot on every test invocation. CI is expected
 * to start a fresh server.
 *
 * Browser scope: Chromium only. AGENTS.md §3 mandates Playwright as the
 * e2e framework; the foundation stage establishes a single browser
 * smoke test, not a full cross-browser matrix. Additional projects can
 * be added later without changing this foundation.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
