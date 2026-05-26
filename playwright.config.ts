import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for visual/overflow checks on the map routes.
 *
 * - Boots `vite dev` automatically (reuses an existing one in local dev).
 * - Runs only against Chromium — these tests assert geometry (CSS pixels),
 *   not engine-specific rendering, so cross-browser coverage isn't worth
 *   the extra CI time.
 * - Two mobile viewports (iPhone SE 375, iPhone 12 390) and one desktop
 *   reference to catch regressions in either direction.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Map tiles are slow on cold cache; give them room.
    navigationTimeout: 30_000,
  },

  projects: [
    {
      name: "mobile-375",
      use: { ...devices["iPhone SE"], viewport: { width: 375, height: 812 } },
    },
    {
      name: "mobile-390",
      use: { ...devices["iPhone 12"], viewport: { width: 390, height: 844 } },
    },
    {
      name: "desktop-1280",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],

  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: "bun run dev",
        url: "http://localhost:8080",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        stdout: "ignore",
        stderr: "pipe",
      },
});
