import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against the real API + web app.
 * Prerequisites: a migrated and seeded database (npm run db:local, npm run db:deploy, npm run db:seed)
 * and a browser (npx playwright install chromium).
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec/ },
  ],
  webServer: [
    {
      command: 'npx tsx server/src/index.ts',
      url: 'http://localhost:8787/healthz',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { AUTH_RATE_LIMIT_PER_MINUTE: '200', RUN_WORKERS: 'false' },
    },
    {
      command: 'npx vite --port 5173 --strictPort',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
