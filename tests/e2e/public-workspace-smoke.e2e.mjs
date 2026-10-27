import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("public workspace overview supports keyboard search and mobile navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { name: "Engineering Workspace", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create an engineering project", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your engineering projects", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /Explore the demo sandbox/ })).toBeVisible();

  await page.screenshot({ path: "test-results/ui-smoke-desktop.png", fullPage: true });

  await page.keyboard.press("Control+k");
  const commandDialog = page.getByRole("dialog");
  await expect(commandDialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(commandDialog).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Engineering Workspace", exact: true })).toBeVisible();

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
