import { test, expect } from "@playwright/test";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error("Missing required E2E environment variable: " + name);
  }
  return value;
}

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
  await expect(page.locator(".projectError[role=\"alert\"]")).toHaveCount(0);
  await expect(
    page.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" })
  ).toBeVisible();
}

test("durable workspace writes, intent decisions, session restore, and direct API ownership", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const userBEmail = requiredEnv("E2E_USER_B_EMAIL");
  const userBPassword = requiredEnv("E2E_USER_B_PASSWORD");
  const suffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  const projectName = "E2E API acceptance " + suffix;
  const sessionId = "e2e-session-" + suffix;
  const diagnostics = { pageErrors: [], serverErrors: [] };
  let contextA;
  let contextB;

  try {
    contextA = await browser.newContext({ baseURL });
    const pageA = await contextA.newPage();
    pageA.on("pageerror", (error) => diagnostics.pageErrors.push(String(error.message).slice(0, 500)));
    pageA.on("response", (response) => {
      if (response.status() >= 500) {
        let pathname = "/";
        try { pathname = new URL(response.url()).pathname; } catch {}
        diagnostics.serverErrors.push({ status: response.status(), pathname });
      }
    });

    await test.step("Authenticate user A and create an isolated test project", async () => {
      await signIn(pageA, userAEmail, userAPassword);
      const createResponse = await pageA.request.post("/api/projects", {
        data: {
          name: projectName,
          problemStatement: "Disposable E2E project for persisted workspace and intent acceptance.",
        },
      });
      expect(createResponse.status(), "project creation API should return 201").toBe(201);
      const created = await createResponse.json();
      expect(created.project?.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(created.workspaceInitialized).toBe(true);
      testInfo.annotations.push({ type: "e2e-project-id", description: created.project.id });
      testInfo.annotations.push({ type: "e2e-session-id", description: sessionId });
      await pageA.goto("/");
      await expect(pageA.getByRole("link").filter({ hasText: projectName })).toBeVisible();
    });

    const listResponse = await pageA.request.get("/api/projects");
    expect(listResponse.status()).toBe(200);
    const listed = await listResponse.json();
    const createdProject = (listed.projects ?? []).find((project) => project.name === projectName);
    expect(createdProject, "user A should see the project in their own list").toBeTruthy();
    const projectId = createdProject.id;
    const workspacePath = "/api/projects/" + projectId + "/workspace";

    await test.step("Read workspace, persist requirements, and reject stale revisions", async () => {
      const initialResponse = await pageA.request.get(workspacePath);
      expect(initialResponse.status()).toBe(200);
      const initial = await initialResponse.json();
      expect(initial).toMatchObject({ projectId, persisted: true, storageMode: "DURABLE" });
      expect(initial.revision).toBeGreaterThanOrEqual(1);

      const requirementId = "e2e-req-" + suffix;
      const writeResponse = await pageA.request.patch(workspacePath, {
        data: {
          operation: "UPDATE_REQUIREMENTS",
          expectedRevision: initial.revision,
          requirements: [{
            id: requirementId,
            name: "Transmitted power",
            priority: "MUST",
            value: 5,
            unit: "kW",
            verificationMethod: "Calibrated power measurement",
          }],
        },
      });
      expect(writeResponse.status()).toBe(200);
      const written = await writeResponse.json();
      expect(written).toMatchObject({ persisted: true, revision: initial.revision + 1 });
      expect(written.snapshot.project.requirements).toEqual([
        expect.objectContaining({ id: requirementId, name: "Transmitted power", value: 5, unit: "kW", status: "OPEN" }),
      ]);

      const staleResponse = await pageA.request.patch(workspacePath, {
        data: {
          operation: "UPDATE_ASSUMPTIONS",
          expectedRevision: initial.revision,
          assumptions: ["This write is deliberately stale and must not overwrite current state."],
        },
      });
      expect(staleResponse.status()).toBe(409);
      expect(await staleResponse.json()).toMatchObject({ code: "REVISION_CONFLICT", currentRevision: written.revision });

      const persistedResponse = await pageA.request.get(workspacePath);
      expect(persistedResponse.status()).toBe(200);
      const persisted = await persistedResponse.json();
      expect(persisted.snapshot.project.requirements).toEqual([
        expect.objectContaining({ id: requirementId, name: "Transmitted power", value: 5, unit: "kW" }),
      ]);
      expect(persisted.snapshot.project.assumptions).toEqual([]);
    });

    await test.step("Persist deterministic torque calculation with linked evidence", async () => {
      const currentResponse = await pageA.request.get(workspacePath);
      expect(currentResponse.status()).toBe(200);
      const current = await currentResponse.json();
      const calculationResponse = await pageA.request.patch(workspacePath, {
        data: {
          operation: "RUN_SHAFT_TORQUE",
          expectedRevision: current.revision,
          powerKw: 5,
          speedRpm: 1500,
        },
      });
      expect(calculationResponse.status()).toBe(200);
      const calculationBody = await calculationResponse.json();
      expect(calculationBody).toMatchObject({ persisted: true, revision: current.revision + 1 });
      expect(calculationBody.result.calculation).toMatchObject({
        powerKw: 5,
        speedRpm: 1500,
        torqueNm: 31.830989,
        informationStatus: "CALCULATED",
      });
      const eventId = calculationBody.result.eventId;
      const event = calculationBody.snapshot.project.events.find((candidate) => candidate.id === eventId);
      expect(event).toBeTruthy();
      expect(event.action).toBe("ANALYSIS.SHAFT_TORQUE");
      expect(event.evidence).toContain("calculation:" + eventId);
      expect(event.output.informationStatus).toBe("CALCULATED");
    });

    await test.step("Exercise engineering intent NEEDS_INPUT, validated proposal, and fail-closed result", async () => {
      const incompleteResponse = await pageA.request.post("/api/engineering/intent", {
        data: { projectId, rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm." },
      });
      expect(incompleteResponse.status()).toBe(200);
      const incomplete = await incompleteResponse.json();
      expect(incomplete.status).toBe("NEEDS_INPUT");
      expect(incomplete.decision).toMatchObject({ status: "NEEDS_INPUT", validationPassed: false, evidenceIds: [] });
      expect(incomplete.nextQuestion).toBeTruthy();

      const completeResponse = await pageA.request.post("/api/engineering/intent", {
        data: {
          projectId,
          rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm.",
        },
      });
      expect(completeResponse.status()).toBe(200);
      const complete = await completeResponse.json();
      expect(complete.status).toBe("WAITING_APPROVAL");
      expect(complete.completion.validation.passed).toBe(true);
      expect(complete.decision).toMatchObject({ status: "WAITING_APPROVAL", validationPassed: true });
      expect(complete.decision.evidenceIds.length).toBeGreaterThan(0);
      expect(complete.decisionSummary).toMatch(/approval/i);

      const unsafeResponse = await pageA.request.post("/api/engineering/intent", {
        data: {
          projectId,
          rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 10 mm.",
        },
      });
      expect(unsafeResponse.status()).toBe(422);
      const unsafe = await unsafeResponse.json();
      expect(unsafe.status).toBe("FAILED");
      expect(unsafe.decision).toMatchObject({ status: "FAILED", validationPassed: false, evidenceIds: [] });
      expect(unsafe.completion.evidence).toEqual([]);
    });

    await test.step("Save and restore a conversation, then reject stale session writes", async () => {
      const conversation = [
        { role: "engineer", text: "Design a shaft for 5 kW at 1500 rpm." },
        { role: "assistant", text: "I need the bending moment and allowable shear stress before checking the proposal." },
      ];
      const saveResponse = await pageA.request.put("/api/engineering/intent", {
        data: { projectId, sessionId, conversation },
      });
      expect(saveResponse.status()).toBe(200);
      const saved = await saveResponse.json();
      expect(saved).toMatchObject({ projectId, sessionId, saved: true, snapshotRevision: 1, conversation });

      const restoreResponse = await pageA.request.get(
        "/api/engineering/intent?projectId=" + encodeURIComponent(projectId) + "&sessionId=" + encodeURIComponent(sessionId),
      );
      expect(restoreResponse.status()).toBe(200);
      expect(await restoreResponse.json()).toMatchObject({
        projectId, sessionId, restored: true, snapshotRevision: 1, conversation,
      });

      const updatedConversation = [...conversation, { role: "engineer", text: "The bending moment is 80 N·m." }];
      const updateResponse = await pageA.request.put("/api/engineering/intent", {
        data: { projectId, sessionId, expectedRevision: 1, conversation: updatedConversation },
      });
      expect(updateResponse.status()).toBe(200);
      expect(await updateResponse.json()).toMatchObject({ saved: true, snapshotRevision: 2, conversation: updatedConversation });

      const staleSessionResponse = await pageA.request.put("/api/engineering/intent", {
        data: { projectId, sessionId, expectedRevision: 1, conversation: [{ role: "engineer", text: "stale overwrite" }] },
      });
      expect(staleSessionResponse.status()).toBe(409);
      expect(await staleSessionResponse.json()).toMatchObject({
        code: "SESSION_REVISION_CONFLICT", snapshotRevision: 2, recoverable: true, lastTurnSaved: false,
      });

      const finalRestore = await pageA.request.get(
        "/api/engineering/intent?projectId=" + encodeURIComponent(projectId) + "&sessionId=" + encodeURIComponent(sessionId),
      );
      expect(finalRestore.status()).toBe(200);
      const finalSession = await finalRestore.json();
      expect(finalSession.snapshotRevision).toBe(2);
      expect(finalSession.conversation).toEqual(updatedConversation);
    });

    await test.step("Confirm user B cannot list, read, update, or restore user A's records", async () => {
      contextB = await browser.newContext({ baseURL });
      const pageB = await contextB.newPage();
      await signIn(pageB, userBEmail, userBPassword);

      const listBResponse = await pageB.request.get("/api/projects");
      expect(listBResponse.status()).toBe(200);
      const listB = await listBResponse.json();
      expect((listB.projects ?? []).some((project) => project.id === projectId)).toBe(false);

      const readWorkspace = await pageB.request.get(workspacePath);
      expect([403, 404]).toContain(readWorkspace.status());
      expect((await readWorkspace.json()).snapshot).toBeUndefined();

      const writeWorkspace = await pageB.request.patch(workspacePath, {
        data: { operation: "UPDATE_ASSUMPTIONS", expectedRevision: 999, assumptions: ["unauthorized write"] },
      });
      expect([403, 404]).toContain(writeWorkspace.status());

      const readSession = await pageB.request.get(
        "/api/engineering/intent?projectId=" + encodeURIComponent(projectId) + "&sessionId=" + encodeURIComponent(sessionId),
      );
      expect(readSession.status()).toBe(403);
      expect((await readSession.json()).conversation).toBeUndefined();

      const writeSession = await pageB.request.put("/api/engineering/intent", {
        data: { projectId, sessionId, expectedRevision: 2, conversation: [{ role: "engineer", text: "unauthorized write" }] },
      });
      expect(writeSession.status()).toBe(403);

      const directPageResponse = await pageB.goto("/projects/" + projectId);
      expect(directPageResponse).toBeTruthy();
      expect(directPageResponse.status()).toBe(404);
    });

    await test.step("Reject anonymous direct workspace and session access after logout", async () => {
      await pageA.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" }).click();
      await expect(pageA).toHaveURL(/\/login(?:\?.*)?$/);
      const anonymousWorkspace = await pageA.request.get(workspacePath);
      expect([401, 403, 404]).toContain(anonymousWorkspace.status());
      const anonymousSession = await pageA.request.get(
        "/api/engineering/intent?projectId=" + encodeURIComponent(projectId) + "&sessionId=" + encodeURIComponent(sessionId),
      );
      expect([401, 403, 404]).toContain(anonymousSession.status());
    });

    expect(diagnostics.pageErrors, "unhandled browser JavaScript errors").toEqual([]);
    expect(diagnostics.serverErrors, "unexpected HTTP 5xx responses").toEqual([]);
  } finally {
    await testInfo.attach("workspace-intent-diagnostics.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });
    if (contextB) await contextB.close().catch(() => undefined);
    if (contextA) await contextA.close().catch(() => undefined);
  }
});
