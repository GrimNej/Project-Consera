import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixelRatio: 0.01,
    },
  },
  fullyParallel: false,
  outputDir: "test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  testDir: "./e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://127.0.0.1:3104",
    colorScheme: "dark",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "pnpm exec next dev -H 127.0.0.1 -p 3104",
    env: {
      ...process.env,
      NEXT_PUBLIC_CONSERA_FIXTURE_MODE: "true",
    },
    reuseExistingServer: false,
    timeout: 120_000,
    url: "http://127.0.0.1:3104",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { height: 900, width: 1440 } },
    },
  ],
});
