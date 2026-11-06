import { test, expect } from "./fixtures/browserstack-test.mjs";

async function signIn(page, email, password) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent projects" })).toBeVisible();
  await expect(page.getByText("Loading persisted projectsâ€¦")).toHaveCount(0);
  await expect(page.getByText("Engineering role required")).toHaveCount(0);
  await expect(page.locator(".projectError[role=\"alert\"]")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" })
  ).toBeVisible();
}

const markdownResponse = [
  "# Pump shaft power",
  "",
  "The shaft power is **torque multiplied by angular speed**.",
  "Inline equation: \\(P_s = T \\omega\\).",
  "",
  "\\[P_h = \\frac{\\Delta p \\cdot Q}{600}\\]",
  "",
  "The replacement seal costs $1,250.00.",
  "",
  "Use the [hydraulic power reference](https://example.com/hydraulic-power) for further reading.",
  "",
  "```python",
  "power_kw = torque_nm * omega_rad_s / 1000",
  "print(power_kw)",
  "```",
  "",
  "| Quantity | Symbol | SI unit |",
  "| --- | --- | --- |",
  "| Torque | T | NÂ·m |",
  "| An¶»§q«^