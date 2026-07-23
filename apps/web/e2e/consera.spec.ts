import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("landing page communicates the product and passes accessibility checks", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("The market moves");
  await expect(page.getByText("Silence-first project intelligence")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open Consera" })).toBeVisible();
  await expect(page).toHaveScreenshot("landing-desktop.png", { fullPage: true });

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("workspace exposes the silence-first overview and complete consequence dossier", async ({
  page,
}) => {
  await page.goto("/console");

  await expect(page.getByRole("heading", { name: /One consequence/ })).toBeVisible();
  await expect(page.getByText("Dismissed quietly")).toBeVisible();
  await page.getByRole("button", { name: "Intelligence" }).click();
  await expect(page.getByRole("heading", { name: /See the consequence/ })).toBeVisible();
  await page.getByRole("button", { name: /Open dossier/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("What protects the project")).toBeVisible();
  await expect(page.getByText("Uncertainty and limitation")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("manual ingestion, project onboarding, alerts, and cited questions are interactive", async ({
  page,
}) => {
  await page.goto("/console");

  await page.getByRole("button", { name: "Intelligence" }).click();
  await page.getByRole("button", { name: "Check for new signals" }).click();
  await expect(page.getByRole("button", { name: "Run queued" })).toBeVisible();

  await page.getByRole("button", { name: "Projects" }).click();
  await page.getByRole("button", { name: "Add project", exact: true }).click();
  await page.getByLabel("Project name").fill("Compass");
  await page
    .getByLabel("README or project brief")
    .fill(
      "# Compass\nCompass helps engineering teams evaluate model providers with repeatable benchmarks and human review.",
    );
  await page
    .getByLabel("I confirm this document contains no credentials or private secrets")
    .check();
  await page.getByRole("button", { name: /Create reviewed context/ }).click();
  await expect(
    page.getByRole("heading", { name: "Compass is ready for profile review" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "View project" }).click();
  await expect(page.getByText("Compass")).toBeVisible();
  await page.getByRole("button", { name: "Open Compass" }).click();
  await expect(
    page.getByRole("heading", { name: "Confirm what Consera should treat as authoritative" }),
  ).toBeVisible();
  await expect(page.getByText("Exact admitted source excerpt")).toBeVisible();
  await page.getByRole("button", { name: "Approve and begin monitoring" }).click();
  await expect(page.getByText("Active profile v2")).toBeVisible();
  await page.getByRole("button", { name: "Close project profile" }).click();

  await page.getByRole("button", { name: /Alerts/ }).click();
  await expect(page.getByRole("heading", { name: /Every alert justified/ })).toBeVisible();
  await expect(page.getByText("Low Relevance")).toBeVisible();

  await page.getByRole("button", { name: "Ask Consera" }).click();
  await page.getByLabel("Your question").fill("What should this project investigate today?");
  await page.locator("form").getByRole("button", { name: "Ask Consera", exact: true }).click();
  await expect(page.getByText("Cited answer")).toBeVisible();
  await expect(page.getByText("Supporting evidence")).toBeVisible();
});

test("mobile navigation and intelligence remain readable at 390 px", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await page.goto("/console");

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("navigation", { name: "Workspace navigation" })).toBeVisible();
  await page.getByRole("button", { name: "Intelligence" }).click();
  await expect(page.getByRole("heading", { name: /See the consequence/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Check for new signals" })).toBeVisible();
  await expect(page).toHaveScreenshot("intelligence-mobile.png", { fullPage: true });
});
