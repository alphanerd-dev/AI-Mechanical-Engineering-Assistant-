import { randomUUID } from "node:crypto";
import { test, expect } from "./fixtures/browserstack-test.mjs";

async function signIn(page, email, password) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Workspace overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent projects" })).toBeVisible();
  await expect(page.getByText("Loading persisted projects…")).toHaveCount(0);
  await expect(page.getByText("Engineering role required")).toHaveCount(0);
  await expect(page.locator('.projectError[role="alert"]')).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" })
  ).toBeVisible();
}

test("streamed engineering chat restores after refresh and recovers a missing browser session key", async ({ testBrowser: browser }, testInfo) => {
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
    const chatPanel = page.locator('section[aria-labelledby="engineering-assistant-title"]');
    await expect(chatPanel).toBeVisible();

    const corePanel = page.locator("details").filter({ hasText: "Engineering Core" });
    await expect(corePanel).toBeVisible();
    expect(await corePanel.evaluate((element) => element.open)).toBe(false);
    await corePanel.locator("summary").click();
    await expect(corePanel.getByRole("heading", { name: "From engineering intent to a checked result" })).toBeVisible();
    expect(await corePanel.evaluate((element) => element.open)).toBe(true);
    await corePanel.locator("summary").click();
    expect(await corePanel.evaluate((element) => element.open)).toBe(false);
    await expect(chatPanel.getByRole("textbox", { name: "Message the engineering assistant" })).toBeVisible();

    const prompt = "Reply with exactly CHAT_HISTORY_E2E and no other text.";
    const composer = page.getByRole("textbox", { name: "Message the engineering assistant" });
    await expect(composer).toBeEnabled();
    await composer.fill(prompt);
    await page.getByRole("button", { name: "Send message" }).click();

    const userMessage = chatPanel.getByText(prompt, { exact: true });
    const assistantMessage = chatPanel.getByText("CHAT_HISTORY_E2E", { exact: true });
    await expect(userMessage).toBeVisible({ timeout: 30_000 });
    await expect(assistantMessage).toBeVisible({ timeout: 90_000 });
    const sessionKey = "engineering-chat-session:" + projectId;
    // The streaming bubble can render before the async history adapter finishes its
    // initial session lookup/create and writes the ID to localStorage.
    await expect.poll(
      () => page.evaluate((key) => window.localStorage.getItem(key), sessionKey),
      { timeout: 30_000, message: "chat history adapter should finish initializing its durable session" },
    ).toMatch(/^engineering-chat-/);
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

    const firstSnapshotResponse = await page.request.get(historyUrl);
    expect(firstSnapshotResponse.status()).toBe(200);
    const firstSnapshot = await firstSnapshotResponse.json();
    const firstRows = firstSnapshot.conversation.map((entry) => JSON.parse(entry.text));
    expect(firstRows).toHaveLength(2);
    expect(firstRows[0].parent_id).toBeNull();
    expect(firstRows[1].parent_id).toBe(firstRows[0].id);

    await testInfo.attach("engineering-chat-session-metadata.json", {
      body: Buffer.from(JSON.stringify({ projectId, sessionIdPresent: true, savedMessageCount: 2 })),
      contentType: "application/json",
    });

    // A second turn must extend the same message chain rather than create a
    // disconnected root that assistant-ui can hide when it selects a branch.
    const followUpPrompt = "Reply with exactly CHAT_HISTORY_E2E_FOLLOWUP and no other text.";
    await composer.fill(followUpPrompt);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(chatPanel.getByText(followUpPrompt, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E_FOLLOWUP", { exact: true })).toBeVisible({ timeout: 90_000 });
    await expect.poll(async () => {
      const response = await page.request.get(historyUrl);
      if (!response.ok()) return false;
      const body = await response.json();
      if (!Array.isArray(body.conversation) || body.conversation.length !== 4) return false;
      const rows = body.conversation.map((entry) => JSON.parse(entry.text));
      return rows[0].parent_id === null &&
        rows.slice(1).every((row, index) => row.parent_id === rows[index].id);
    }, { timeout: 30_000, message: "every later message should point to the preceding message in the linear chat" }).toBe(true);

    // Simulate a legacy snapshot written by the previous adapter: the second
    // user turn is accidentally disconnected from the preceding assistant turn.
    const currentSnapshotResponse = await page.request.get(historyUrl);
    expect(currentSnapshotResponse.status()).toBe(200);
    const currentSnapshot = await currentSnapshotResponse.json();
    const legacyConversation = [...currentSnapshot.conversation];
    const disconnectedRow = JSON.parse(legacyConversation[2].text);
    disconnectedRow.parent_id = null;
    legacyConversation[2] = {
      ...legacyConversation[2],
      text: JSON.stringify(disconnectedRow),
    };
    const legacyWrite = await page.request.put("/api/engineering/intent", {
      data: {
        projectId,
        sessionId: originalSessionId,
        expectedRevision: currentSnapshot.snapshotRevision,
        conversation: legacyConversation,
      },
    });
    expect(legacyWrite.status(), "legacy fixture should be stored with revision protection").toBe(200);
    await page.reload();
    await expect(chatPanel.getByText(prompt, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(chatPanel.getByText(followUpPrompt, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E_FOLLOWUP", { exact: true })).toBeVisible({ timeout: 30_000 });

    // First prove ordinary reload restores from the saved browser identity.
    await page.reload();
    await expect(userMessage).toBeVisible({ timeout: 30_000 });
    await expect(assistantMessage).toBeVisible({ timeout: 30_000 });

    // A stale browser identity must fall back to the newest saved chat, not create an empty thread.
    const staleSessionId = "engineering-chat-stale-" + suffix;
    await page.evaluate(({ key, value }) => window.localStorage.setItem(key, value), {
      key: sessionKey,
      value: staleSessionId,
    });
    await page.reload();
    await expect(userMessage).toBeVisible({ timeout: 30_000 });
    let restoredAssistant = chatPanel.getByText("CHAT_HISTORY_E2E", { exact: true });
    await expect(restoredAssistant).toBeVisible({ timeout: 30_000 });

    let recoveredSessionId = await page.evaluate((key) => window.localStorage.getItem(key), sessionKey);
    expect(recoveredSessionId, "a stale browser identity should be replaced with the saved server session").toBe(originalSessionId);

    // Storage eviction is also recoverable; the session ID is rehydrated from the server.
    await page.evaluate((key) => window.localStorage.removeItem(key), sessionKey);
    await page.reload();
    await expect(userMessage).toBeVisible({ timeout: 30_000 });
    restoredAssistant = chatPanel.getByText("CHAT_HISTORY_E2E", { exact: true });
    await expect(restoredAssistant).toBeVisible({ timeout: 30_000 });

    recoveredSessionId = await page.evaluate((key) => window.localStorage.getItem(key), sessionKey);
    expect(recoveredSessionId, "latest server-side chat lookup should restore the browser session key").toBe(originalSessionId);
    // Create a second durable thread, then prove switching restores each transcript independently.
    const activeSessionKey = "engineering-chat-active-session:" + projectId;
    const historyNav = page.getByRole("navigation", { name: "Saved project conversations" });
    await page.getByRole("button", { name: "New chat" }).click();
    await expect.poll(
      () => page.evaluate((key) => window.localStorage.getItem(key), activeSessionKey),
      { timeout: 30_000, message: "new chat should become the active durable thread" },
    ).not.toBe(originalSessionId);
    const secondSessionId = await page.evaluate((key) => window.localStorage.getItem(key), activeSessionKey);
    expect(secondSessionId).toMatch(/^engineering-chat-/);

    const secondPrompt = "Reply with exactly CHAT_HISTORY_E2E_SECOND and no other text.";
    await composer.fill(secondPrompt);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(chatPanel.getByText(secondPrompt, { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E_SECOND", { exact: true })).toBeVisible({ timeout: 90_000 });

    const firstThreadButton = historyNav.getByRole("button").filter({ hasText: prompt });
    await firstThreadButton.click();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), activeSessionKey))
      .toBe(originalSessionId);
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E_SECOND", { exact: true })).toHaveCount(0);

    const secondThreadButton = historyNav.getByRole("button").filter({ hasText: "CHAT_HISTORY_E2E_SECOND" }).first();
    await secondThreadButton.click();
    await expect.poll(() => page.evaluate((key) => window.localStorage.getItem(key), activeSessionKey))
      .toBe(secondSessionId);
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E_SECOND", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E", { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E_SECOND", { exact: true })).toBeVisible({ timeout: 30_000 });
    await secondThreadButton.click();
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E_SECOND", { exact: true })).toBeVisible({ timeout: 30_000 });
    await firstThreadButton.click();
    await expect(chatPanel.getByText("CHAT_HISTORY_E2E", { exact: true })).toBeVisible({ timeout: 30_000 });

    await expect(page.getByText(/Chat history issue:/)).toHaveCount(0);
    expect(diagnostics.pageErrors, "no uncaught browser errors during chat restoration").toEqual([]);
    expect(diagnostics.serverErrors, "no HTTP 5xx responses during chat restoration").toEqual([]);
  } finally {
    await testInfo.attach("engineering-chat-refresh-diagnostics.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });
    
  }
});
