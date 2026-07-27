import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const accessCode = process.env.CONSERA_ACCESS_CODE;
test.skip(
  !accessCode || !process.env.CONSERA_PRODUCTION_URL,
  "Production credentials are required for this release gate.",
);

test("production serves live intelligence and dispatches a manual check", async ({ page }) => {
  if (!accessCode) throw new Error("CONSERA_ACCESS_CODE is required");

  const landing = await page.goto("/");
  expect(landing?.ok()).toBe(true);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("The market moves");
  await expect(page.locator("body")).not.toContainText(/demo|hackathon/iu);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.goto("/console");
  await page.getByLabel("Operational access code").fill(accessCode);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: /One consequence/ })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Signals reviewed")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(/demo|hackathon/iu);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.screenshot({
    fullPage: true,
    path: "../../output/playwright/consera-production-overview.png",
  });

  await page.getByRole("button", { name: "Intelligence" }).click();
  await expect(page.getByRole("heading", { name: /See the consequence/ })).toBeVisible();
  await page.getByRole("button", { name: "Check for new signals" }).click();
  await expect(page.getByRole("button", { name: "Run queued" })).toBeVisible({
    timeout: 30_000,
  });
});
