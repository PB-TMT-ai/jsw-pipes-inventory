import { defineConfig, devices } from '@playwright/test'

// E2E config for the 3-stage pipeline happy path. The webServer launches the Vite
// dev server in `test` mode (loads .env.test → dummy Supabase creds so the app
// renders). Tests drive optimistic in-session state; they must not reload mid-flow.
//
// NOTE: requires a Chromium binary (`npx playwright install chromium`). In network-
// restricted environments where cdn.playwright.dev is not allow-listed, the download
// fails and these tests cannot run — see TESTING.md.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --mode test --port 3000',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
