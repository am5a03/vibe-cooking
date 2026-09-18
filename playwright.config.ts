import { defineConfig } from '@playwright/test';
import process from 'node:process';
const config = process.env.KITCHEN_TEST_CONFIG;
const state = process.env.KITCHEN_TEST_STATE;
if (!config || !state || !process.env.KITCHEN_TEST_TOKEN) throw new Error('Use npm run test:browser to create an isolated test database.');
export default defineConfig({
  testDir: './tests/browser', workers: 1, timeout: 60000,
  use: { launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}, baseURL: 'http://127.0.0.1:8787', trace: 'off', screenshot: 'only-on-failure', viewport: { width: 1360, height: 960 } },
  reporter: [['list']],
  webServer: {
    command: `npx wrangler dev --local --config ${JSON.stringify(config)} --persist-to ${JSON.stringify(state)} --ip 127.0.0.1 --port 8787`,
    url: 'http://127.0.0.1:8787/api/health', reuseExistingServer: false, timeout: 120000,
  },
});
