import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * End-to-end tests.
 *
 * These cover the flows that must never silently break: that private routes
 * bounce anonymous visitors, that the public pages render, and that the layout
 * survives a phone-sized viewport (most entries will be written on a phone).
 *
 * Run with:
 *   npx playwright install chromium   # once, downloads the browser
 *   npm run test:e2e
 *
 * The config builds and starts the app itself, so nothing needs to be running
 * first.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

  use: {
    baseURL,
    trace: "on-first-retry",
  },

  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],

  webServer: {
    // Built output rather than dev, so the test exercises what actually ships.
    command: `npm run build && npm run start -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
