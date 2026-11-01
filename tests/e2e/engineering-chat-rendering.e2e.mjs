import { test, expect } from "@playwright/test";

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
  "| Torque | T | N·m |",
  "| Angular speed | ω | rad/s |",
  "| Power | P | W |",
].join("\n");

function uiMessageStream(text) {
  const textId = "engineering-chat-renderer-text";
  const parts = [
    { type: "start", messageId: "engineering-chat-renderer-message" },
    { type: "start-step" },
    { type: "text-start", id: textId },
    { type: "text-delta", id: textId, delta: text.slice(0, 92) },
    { type: "text-delta", id: textId, delta: text.slice(92, 210) },
    { type: "text-delta", id: textId, delta: text.slice(210) },
    { type: "text-end", id: textId },
    { type: "finish-step" },
    { type: "finish" },
  ];
  return parts.map((part) => "data: " + JSON.stringify(part) + "\n\n").join("") + "data: [DONE]\n\n";
}

test("engineering chat renders streamed Markdown, equations, code, tables and currency on desktop and mobile", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  let interceptedRequests = 0;
  await page.route("**/api/projects/demo/engineering/chat", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    interceptedRequests += 1;
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        "x-accel-buffering": "no",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body: uiMessageStream(markdownResponse),
    });
  });

  const response = await page.goto("/projects/demo/engineering");
  expect(response?.status()).toBe(200);

  const chatPanel = page.locator('section[aria-labelledby="engineering-assistant-title"]');
  await expect(chatPanel).toBeVisible();
  const desktopGeometry = await chatPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { height: rect.height, bottom: rect.bottom, viewportHeight: window.innerHeight };
  });
  expect(desktopGeometry.height).toBeGreaterThan(600);
  expect(desktopGeometry.bottom).toBeLessThanOrEqual(desktopGeometry.viewportHeight + 1);

  const composer = page.getByRole("textbox", { name: "Message the engineering assistant" });
  await expect(composer).toBeVisible();
  await composer.fill("Show a hydraulic power example with its equation, code and units.");
  await page.getByRole("button", { name: "Send message" }).click();

  const assistantMessage = chatPanel.locator(".assistantMessage").last();
  const markdown = assistantMessage.locator(".assistantBubble");
  await expect(markdown.getByRole("heading", { name: "Pump shaft power", level: 1 })).toBeVisible();
  await expect(markdown.locator("strong")).toContainText("torque multiplied by angular speed");
  await expect(markdown.locator(".katex-display")).toHaveCount(1);
  expect(await markdown.locator(".katex").count()).toBeGreaterThanOrEqual(2);
  await expect(markdown.locator("pre code")).toContainText("power_kw = torque_nm * omega_rad_s / 1000");
  await expect(markdown.locator("table")).toContainText("Angular speed");
  await expect(markdown).toContainText("The replacement seal costs $1,250.00.");
  await expect(markdown.locator('a[href="https://example.com/hydraulic-power"]')).toBeVisible();
  await expect(assistantMessage.getByRole("button", { name: "Copy" })).toBeVisible();
  await expect(assistantMessage.getByRole("button", { name: "Regenerate" })).toBeVisible();
  expect(interceptedRequests).toBe(1);

  await page.screenshot({ path: "test-results/engineering-chat-rendering-desktop.png", fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(chatPanel).toBeVisible();
  await expect(composer).toBeVisible();
  const mobileGeometry = await page.evaluate(() => {
    const panel = document.querySelector('section[aria-labelledby="engineering-assistant-title"]');
    const rect = panel.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelHeight: rect.height,
      panelBottom: rect.bottom,
    };
  });
  expect(mobileGeometry.documentWidth).toBeLessThanOrEqual(mobileGeometry.viewportWidth);
  expect(mobileGeometry.panelHeight).toBeGreaterThan(500);
  expect(mobileGeometry.panelBottom).toBeLessThanOrEqual(844);
  await page.screenshot({ path: "test-results/engineering-chat-rendering-mobile.png", fullPage: true });
});
