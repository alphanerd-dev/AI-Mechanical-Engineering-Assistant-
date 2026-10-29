import { test, expect } from "@playwright/test";

async function assertResponsiveAuthForm(page, { path, fieldNames, submitName }) {
  await page.setViewportSize({ width: 390, height: 844 });
  const response = await page.goto(path);
  expect(response?.status()).toBe(200);

  const form = page.locator("form.authForm");
  await expect(form).toBeVisible();

  const inputBoxes = [];
  for (const name of fieldNames) {
    const selector = 'input[name="' + name + '"]';
    const input = page.locator(selector);
    await expect(input).toBeVisible();
    const label = input.locator("xpath=ancestor::label[1]");
    await expect(label).toBeVisible();

    const layout = await label.evaluate((node) => ({
      display: getComputedStyle(node).display,
      flexDirection: getComputedStyle(node).flexDirection,
      label: (() => {
        const r = node.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      })(),
      input: (() => {
        const element = node.querySelector("input");
        const r = element.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
      })(),
    }));

    expect(layout.display).toBe("flex");
    expect(layout.flexDirection).toBe("column");
    expect(layout.input.height).toBeGreaterThanOrEqual(44);
    expect(layout.input.left).toBeGreaterThanOrEqual(layout.label.left - 1);
    expect(layout.input.right).toBeLessThanOrEqual(layout.label.right + 1);
    expect(layout.input.top).toBeGreaterThanOrEqual(layout.label.top);
    expect(layout.input.bottom).toBeLessThanOrEqual(layout.label.bottom + 1);
    inputBoxes.push(layout.input);
  }

  const submit = form.getByRole("button", { name: submitName, exact: true });
  await expect(submit).toBeVisible();
  const buttonBox = await submit.evaluate((node) => {
    const r = node.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
  });
  const lastInput = inputBoxes[inputBoxes.length - 1];
  expect(buttonBox.height).toBeGreaterThanOrEqual(44);
  expect(buttonBox.left).toBeGreaterThanOrEqual(lastInput.left - 1);
  expect(buttonBox.right).toBeLessThanOrEqual(lastInput.right + 1);
  expect(buttonBox.top).toBeGreaterThan(lastInput.bottom + 8);

  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);
  await page.screenshot({ path: "test-results/" + path.slice(1) + "-mobile.png", fullPage: true });

  // Keyboard order and a visible focus treatment are part of the authentication contract.
  await page.keyboard.press("Tab");
  await expect(page.locator('input[name="' + fieldNames[0] + '"]')).toBeFocused();
  const focus = await page.locator('input[name="' + fieldNames[0] + '"]').evaluate((node) => {
    const style = getComputedStyle(node);
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth, boxShadow: style.boxShadow };
  });
  expect(
    (focus.outlineStyle !== "none" && Number.parseFloat(focus.outlineWidth) >= 1) ||
    (focus.boxShadow !== "none" && !focus.boxShadow.endsWith("rgba(0, 0, 0, 0)"))
  ).toBe(true);
  if (fieldNames.length > 1) {
    await page.keyboard.press("Tab");
    await expect(page.locator('input[name="' + fieldNames[1] + '"]')).toBeFocused();
  }
}

test("sign-in form stacks labelled controls at the mobile reference width", async ({ page }) => {
  await assertResponsiveAuthForm(page, {
    path: "/login",
    fieldNames: ["email", "password"],
    submitName: "Sign in",
  });
});

test("sign-up form stacks labelled controls at the mobile reference width", async ({ page }) => {
  await assertResponsiveAuthForm(page, {
    path: "/signup",
    fieldNames: ["email", "password", "confirmPassword"],
    submitName: "Create account",
  });
});
