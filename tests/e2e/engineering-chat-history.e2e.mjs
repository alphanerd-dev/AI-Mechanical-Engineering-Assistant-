import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";

async function signIn(page, email, password) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Engineering Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your engineering projects" })).toBeVisible();
  await expect(page.getByText("Loading projects…")).toHaveCount(0);
  await expect(page.getByText("Engineering role required")).toHaveCount(0);
  await expect(page.locator('.projectError[role="alert"]')).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" })
  ).toBeVisible();
}

test("streamed engineering chat restores after refresh and recovers a missing browser session key", async ({ browser }, testInfo) => {
  const baseURL = process.env.E2E_BASE_URL;
  const email = process.env.E2E_USER_A_EMAIL;
  const password = process.env.E2E_USER_A_PASSWORD;
  if (!baseURL || !email || !password) {
    throw new Error("E2E_BASE_URL and E2E_USER_A credentials are required for engineering chat history acceptance.");
  }

  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const diagnostics = { pageErrors: [], serverErrors: [] };
  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error.message).slice(0, 500)));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      let pathname = "/";
      try { pathname = new URL(response.url()).pathname; } catch {}
      diagnostics.serverErrors.push({ status: response.status(), pathname });
    }
  });

  try {
    await signIn(page, email, password);

    const suffix = randomUUID();
    const projectName = "E2E streamed chat history " + suffix;
    const createResponse = await page.request.post("/api/projects", {
      data: {
        name: projectName,
        problemStatement: "Disposable project for streamed engineering chat refresh acceptance.",
      },
    });
    expect(createResponse.status(), "test project creation should succeed").toBe(201);
    const projectId = (await createResponse.json()).project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto("/projects/" + projectId + "/engineering");
    await expect(page.getByRole("heading", { name: "Explore the problem before you execute" })).toBeVisible();

    const prompt = "Reply with exactly CHAT_HISTORY_E2E and no other text.";
    const composer = page.getByRole("textbox", { name: "Message the engineering assistant" });
    await expect(composer).toBeEnabled();
    await composer.fill(prompt);
    await page.getByRole("button", { name: "Send ↑" }).click();

    const userBubble = page.locator(".userMessage .userBubble").filter({ hasText: prompt });
    const assistantBubble = page.locator(".assistantMessage .assistantBubble").last();
    await expect(userBubble).toBeVisible({ timeout: 30_000 });
    await expect(assistantBubble).toContainText("CHAT_HISTORY_E2E", { timeout: 90_000 });
    const sessionKey = "engineering-chat-session:" + projectId;
    const originalSessionId = await page.evaluate((key) => window.localStorage.getItem(key), sessionKey);
    expect(originalSessionId).toMatch(/^engineering-chat-/);

    const historyUrl = "/api/engineering/intent?projectId=" + encodeURIComponent(projectId) +
      "&sessionId=" + encodeURIComponent(originalSessionId);
    await expect.poll(async () => {
      const response = await page.request.get(historyUrl);
      if (!response.ok()) return 0;
      const body = await response.json();
      return Array.isArray(body.conversation) &&
        body.conversation.length === 2 &&
        JSON.stringify(body.conversation).includes("CHAT_HISTORY_E2E");
    }, { timeout: 30_000 }).toBe(true);

    await testInfo.attach("engineering-chat-session-metadata.json", {
      body: Buffer.from(JSON.stringify({ projectId, sessionIdPresent: true, savedMessageCount: 2 })),
      contentType: "application/json",
    });

    // First prove ordinary reload restores from the saved browser identity.
    await page.reload();
    await expect(userBubble).toBeVisible({ timeout: 30_000 });
    await expect(assistantBubble).toContainText("CHAT_HISTORY_E2E", { timeout: 30_000 });

    // A stale browser identity must fall back to the newest saved chat, not create an empty thread.
    const staleSessionId = "engineering-chat-stale-" + suffix;
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: sessionKey,
      value: staleSessionId,
    });
    await page.reload();
    await expect(page.locator(".userMessage .userBubble").filter({ hasText: prompt })).toBeVisible({ timeout: 30_000 });
    let restoredAssistant = page.locator(".assistantMessage .assistantBubble").last();
    await expect(restoredAssistant).toContainText("CHAT_HISTORY_E2E", { timeout: 30_000 });

    let recoveredSessionId = await page.evaluate((key) => window.localStorage.getItem(key), sessionKey);
    expect(recoveredSessionId, "a stale browser identity should be replaced with the saved server session").toBe(originalSessionId);

    // Storage eviction is also recoverable; the session ID is rehydrated from the server.
    await page.evaluate((key) => window.localStorage.removeItem(key), sessionKey);
    await page.reload();
    await expect(page.locator(".userMessage .userBubble").filter({ hasText: prompt })).toBeVisible({ timeout: 30_000 });
    restoredAssistant = page.locator(".assistantMessage .assistantBubble").last();
    await expect(restoredAssistant).toContainText("CHAT_HISTORY_E2E", { timeout: 30_000 });

    recoveredSessionId = await page.evaluate((key) => window.localStorage.getItem(key), sessionKey);
    expect(recoveredSessionId, "latest server-side chat lookup should restore the browser session key").toBe(originalSessionId);
    await expect(page.getByText(/Chat history issue:/)).toHaveCount(0);
    expect(diagnostics.pageErrors, "no uncaught browser errors during chat restoration").toEqual([]);
    expect(diagnostics.serverErrors, "no HTTP 5xx responses during chat restoration").toEqual([]);
  } finally {
    await testInfo.attach("engineering-chat-refresh-diagnostics.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });
    await context.close().catch(() => undefined);
  }
});
