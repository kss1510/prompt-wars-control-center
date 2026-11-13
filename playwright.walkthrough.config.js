import { defineConfig, devices } from '@playwright/test';

// Recorded, captioned walkthrough of the whole event in DEMO MODE (sample data in the browser only;
// never touches Supabase). Run: npm run demo:video  → video in walkthrough/.
const demoURL = 'http://127.0.0.1:4175';

export default defineConfig({
  testDir: './tests/walkthrough',
  testMatch: /\.walkthrough\.js$/,
  outputDir: './walkthrough/raw',
  reporter: 'list',
  timeout: 15 * 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: demoURL,
    viewport: { width: 1280, height: 720 },
    video: { mode: 'on', size: { width: 1280, height: 720 } },
    launchOptions: { slowMo: Number(process.env.PW_SLOWMO ?? 180) }
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4175 --strictPort --mode demo',
    url: demoURL,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { ...process.env, VITE_DEMO_MODE: '1' }
  }
});
