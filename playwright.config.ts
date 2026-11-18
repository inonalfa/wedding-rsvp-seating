import { defineConfig } from '@playwright/test';

const port = 4173;
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'he-IL',
    viewport: { width: 1280, height: 800 },
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  webServer: [{
    command: `npm run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    command: 'node --import ./tests/resolve-typescript.mjs --experimental-strip-types e2e/fixtures/hosted-server.mjs',
    url: 'http://127.0.0.1:4174/health',
    reuseExistingServer: false,
    timeout: 30_000,
  }],
});
