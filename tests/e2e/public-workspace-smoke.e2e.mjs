import { test, expect } from "./fixtures/browserstack-test.mjs";
import AxeBuilder from "@axe-core/playwright";

test("public workspace overview supports keyboard search and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Workspace overview", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What are we engineering today?", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent projects", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Browse projects", exact: true })).toBeVisible();
  await expect(page.getByLabel("Engineering problem or task")).toBeVisible();
  await expect(page.locator(".workspaceAccessNotice")).toContainText("Sign in to view your saved engineering projects.");
  await expect(page.locator(".workspaceAccessNotice").getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await expect(page.locator(".projectError[role=\"alert\"]")).toHaveCount(0);

  await page.screenshot({ path: "test-results/ui-smoke-desktop.png", fullPage: true });

  await page.keyboard.press("Control+k");
  const commandDialog = page.getByRole("dialog");
  await expect(commandDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(commandDialog).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Workspace overview", exact: true })).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

  const navigationToggle = page.getByRole("button", { name: "Open workspace navigation" });
  await expect(navigationToggle).toBeVisible();
  await navigationToggle.click();
  await expect(navigationToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(navigationToggle).toHaveAttribute("aria-expanded", "false");

  await page.screenshot({ path: "test-results/ui-smoke-mobile.png", fullPage: true });

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const critical = accessibility.violations.filter((violation) => violation.impact === "critical");
  console.log(
    JSON.stringify({
      axeViolations: accessibility.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        affectedNodes: nodes.length,
      })),
    }),
  );
  expect(critical.map(({ id }) => id)).toEqual([]);
});
