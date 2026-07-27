import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.CONSERA_PRODUCTION_URL;
if (!baseURL) throw new Error("CONSERA_PRODUCTION_URL is required");

export default defineConfig({
  fullyParallel: false,
  outputDir: "test-results/production",
  reporter: [["list"]],
  testDir: "./e2e",
  testMatch: "production.spec.ts",
  timeout: 90_000,
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    viewport: { height: 900, width: 1440 },
  },
});
