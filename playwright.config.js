import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const phone = { viewport: { width: 390, height: 844 }, hasTouch: true, locale: "fr-FR" };

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], ...phone } },
    // WebKit is Safari's engine: the closest to the iPhone we can run in CI.
    { name: "webkit", use: { ...devices["Desktop Safari"], ...phone } },
  ],
  webServer: {
    command: `node tools/serve.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
});
