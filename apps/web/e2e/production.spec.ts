import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.skip(
  !process.env.CONSERA_PRODUCTION_URL,
  "The production URL is required for this release gate.",
);

test("production serves the private live intelligence workspace", async ({ page }) => {
  const accessPasscode = process.env.CONSERA_ACCESS_PASSCODE;
  if (!accessPasscode) throw new Error("CONSERA_ACCESS_PASSCODE is required");

  const landing = await page.goto("/");
  expect(landing?.status()).toBe(200);
  await expect(page).toHaveURL(/\/access\?next=/u);
  await expect(page.getByRole("heading", { name: "Enter the signal room." })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("Four-digit passkey").fill(accessPasscode);
  await page.getByRole("button", { name: "Open Consera" }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("The market moves");
  await expect(page.locator("body")).not.toContainText(/demo|hackathon/iu);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.goto("/console");
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
  const manualCheck = page.getByRole("button", { name: "Check for new signals" });
  await expect(manualCheck).toBeVisible();

  if (process.env.CONSERA_ALLOW_PRODUCTION_DISPATCH === "true") {
    await manualCheck.click();
    await expect(page.getByRole("button", { name: "Run queued" })).toBeVisible({
      timeout: 30_000,
    });
  }
});
