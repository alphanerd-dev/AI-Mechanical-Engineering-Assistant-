import { test, expect } from "@playwright/test";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error("Missing required E2E environment variable: " + name);
  }
  return value;
}

function watchPage(page, label, diagnostics) {
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push({ page: label, message: String(error.message).slice(0, 500) });
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      diagnostics.consoleErrors.push({
        page: label,
        message: String(message.text()).slice(0, 500)
      });
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 500) {
      let pathname = "/";
      try { pathname = new URL(response.url()).pathname; } catch {}
      diagnostics.serverErrors.push({ page: label, status: response.status(), pathname });
    }
  });
}

async function signIn(page, email, password) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("heading", { name: "Engineering Workspace" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your engineering projects" })).toBeVisible();

  // The heading can render before the initial projects request finishes. Wait for
  // that request's UI state before asserting the user's authorization is valid.
  await expect(page.getByText("Loading projects…")).toHaveCount(0);
  await expect(page.getByText("Engineering role required")).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" })
  ).toBeVisible();
}

test("sign-in, project persistence, sign-out, and cross-user isolation", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const userBEmail = requiredEnv("E2E_USER_B_EMAIL");
  const userBPassword = requiredEnv("E2E_USER_B_PASSWORD");

  const diagnostics = { pageErrors: [], consoleErrors: [], serverErrors: [] };
  let contextA;
  let contextB;

  try {
    contextA = await browser.newContext({ baseURL });
    const pageA = await contextA.newPage();
    watchPage(pageA, "user-a", diagnostics);

    await test.step("Authenticate user A in the browser", async () => {
      await signIn(pageA, userAEmail, userAPassword);
    });

    const suffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    const projectName = "E2E ownership verification " + suffix;
    const problemStatement = "Automated acceptance run. This project is disposable staging test data.";

    await test.step("Create a project through the workspace UI", async () => {
      await pageA.getByLabel("Project name").fill(projectName);
      await pageA.getByLabel(/Problem statement/).fill(problemStatement);
      const createButton = pageA.getByRole("button", { name: "Create project" });
      await expect(createButton, "project creation should be enabled after valid form input").toBeEnabled();
      await createButton.click();

      await expect(pageA).toHaveURL(/\/projects\/[0-9a-f-]{36}$/i);
      await expect(pageA.getByRole("heading", { name: projectName })).toBeVisible();
    });

    const projectId = new URL(pageA.url()).pathname.split("/").pop();
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    await test.step("Reload the project and verify persisted state", async () => {
      await pageA.reload();
      await expect(pageA.getByRole("heading", { name: projectName })).toBeVisible();
      await expect(pageA.getByText("PERSISTED ENGINEERING PROJECT")).toBeVisible();

      await pageA.goto("/");
      await expect(pageA.getByRole("heading", { name: "Your engineering projects" })).toBeVisible();
      const projectCard = pageA.getByRole("link").filter({ hasText: projectName });
      await expect(projectCard).toBeVisible();
    });

    await test.step("Sign out and confirm protected API access is denied", async () => {
      await pageA.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" }).click();
      await expect(pageA).toHaveURL(/\/login(?:\?.*)?$/);
      const anonymousResponse = await pageA.request.get("/api/projects");
      // A protected route may deliberately return 404 to avoid revealing resource existence.
      expect([401, 403, 404], "anonymous project-list API access must be denied")
        .toContain(anonymousResponse.status());
    });

    await test.step("Authenticate user B and verify user A's project is not listed", async () => {
      contextB = await browser.newContext({ baseURL });
      const pageB = await contextB.newPage();
      watchPage(pageB, "user-b", diagnostics);
      await signIn(pageB, userBEmail, userBPassword);

      const projectCard = pageB.getByRole("link").filter({ hasText: projectName });
      await expect(projectCard).toHaveCount(0);

      const directAccessResponse = await pageB.goto("/projects/" + projectId);
      expect(directAccessResponse, "project route should return an HTTP response").toBeTruthy();
      expect(directAccessResponse.status()).toBe(404);
    });

    expect(diagnostics.pageErrors, "unhandled browser JavaScript errors").toEqual([]);
    expect(diagnostics.serverErrors, "HTTP 5xx responses").toEqual([]);
  } finally {
    await testInfo.attach("browser-diagnostics.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json"
    });
    if (contextB) await contextB.close().catch(() => undefined);
    if (contextA) await contextA.close().catch(() => undefined);
  }
});
