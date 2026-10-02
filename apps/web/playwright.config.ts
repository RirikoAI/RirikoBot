import { defineConfig, devices } from '@playwright/test';
import {
  DASHBOARD_URL,
  FAKE_DISCORD_PORT,
  FAKE_DISCORD_URL,
  SERVER_ENV,
  WEB_PORT,
} from './e2e/support/env.js';

/**
 * Dashboard E2E: `next start` (run `pnpm build:web` first; `pnpm test:e2e` does both) against a
 * fake Discord API and a throwaway SQLite database. See docs/testing.md section 3.3.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e-results/artifacts',
  fullyParallel: true,
  // Playwright sizes its pool from the host's CPU count, but CircleCI's `medium` resource class
  // gives the container 2 vCPUs. Eight browsers next to `next start` starved the server until
  // server action responses missed the 5 s expect window (BUG-0030).
  ...(process.env.CI ? { workers: 2 } : {}),
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: './e2e-results/report', open: 'never' }],
    ['junit', { outputFile: './e2e-results/junit.xml' }],
  ],
  use: {
    baseURL: DASHBOARD_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: `pnpm exec tsx ../../tests/support/fake-discord/cli.ts --port ${FAKE_DISCORD_PORT}`,
      url: `${FAKE_DISCORD_URL}/__fake/health`,
      reuseExistingServer: false,
    },
    {
      command: `pnpm exec tsx e2e/support/seed.ts && pnpm exec next start --port ${WEB_PORT}`,
      url: DASHBOARD_URL,
      env: SERVER_ENV,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
