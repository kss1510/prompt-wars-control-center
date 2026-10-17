import { defineConfig, devices } from '@playwright/test';

// Two app servers:
//  * 4173 — event mode with fake, non-secret Supabase values: signed-out screens only (app.spec.js).
//  * 4174 — demo mode (VITE_DEMO_MODE=1): full host/judge/student workflow on browser-local
//    sample data, never contacting Supabase (demo.spec.js). Each test gets fresh storage.
const authURL = process.env.PW_BASE_URL || 'http://127.0.0.1:4173';
const demoURL = process.env.PW_DEMO_URL || 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  expect: { timeout: 7_000 },
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome']
  },
  projects: [
    { name: 'signed-out', testMatch: /app\.spec\.js/, use: { ...devices['Desktop Chrome'], baseURL: authURL } },
    { name: 'demo', testMatch: /demo\.spec\.js/, use: { ...devices['Desktop Chrome'], baseURL: demoURL } },
    { name: 'demo-mobile', testMatch: /mobile\.spec\.js/, use: { ...devices['Pixel 7'], baseURL: demoURL } }
  ],
  webServer: [
    {
      command: 'npx vite --host 127.0.0.1 --port 4173 --strictPort',
      url: authURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        ...process.env,
        VITE_DEMO_MODE: '0',
        // Fake, non-secret values let CI test the signed-out UI without contacting a real project.
        VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://example.supabase.co',
        VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ci_placeholder'
      }
    },
    {
      command: 'npx vite --host 127.0.0.1 --port 4174 --strictPort --mode demo',
      url: demoURL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { ...process.env, VITE_DEMO_MODE: '1' }
    }
  ]
});
