import { createHash, randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { test, expect } from "@playwright/test";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error("Missing required E2E environment variable: " + name);
  }
  return value;
}

function safeTransportFailureDetails(error) {
  const value = typeof error === "object" && error !== null ? error : {};
  const cause = typeof value.cause === "object" && value.cause !== null ? value.cause : {};
  const allowedCodes = new Set([
    "ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "EPIPE", "ECONNABORTED", "EAI_AGAIN",
    "UND_ERR_SOCKET", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT", "UND_ERR_ABORTED"
  ]);
  const code = [value.code, cause.code].find((candidate) =>
    typeof candidate === "string" && allowedCodes.has(candidate)
  ) ?? null;
  const name = ["AbortError", "TimeoutError", "TypeError"].includes(value.name)
    ? value.name
    : "TransportError";
  const message = typeof value.message === "string" ? value.message : "";
  const category = code
    ? "socket_or_network_code"
    : /timeout|timed out|deadline/i.test(message)
      ? "timeout"
      : /socket|connection reset|broken pipe/i.test(message)
        ? "socket_failure"
        : "unknown";
  return { name, category, code };
}

async function safeAuthenticatedRequest(label, requestFn) {
  const startedAt = Date.now();
  try {
    const response = await requestFn();
    console.log("[cad-e2e] " + label + " status=" + response.status() +
      " elapsedMs=" + (Date.now() - startedAt));
    return response;
  } catch (error) {
    // Never log the raw transport error: it can include request headers and session cookies.
    const elapsedMs = Date.now() - startedAt;
    const details = safeTransportFailureDetails(error);
    console.error("[cad-e2e] " + label + " transport failure", {
      ...details,
      elapsedMs
    });
    throw new Error(label + " failed after " + elapsedMs + "ms (" +
      details.name + "/" + details.category +
      (details.code ? "/" + details.code : "") +
      "); raw transport diagnostics were suppressed.");
  }
}

function safeE2EDiagnosticText(value) {
  return String(value ?? "")
    .replace(/\b[a-f0-9]{64}\b/gi, "[redacted-digest-or-token]")
    .replace(/https?:\/\/[^\s"'<>]+/gi, "[redacted-url]")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, 300);
}

function safeE2EDiagnosticList(value) {
  return Array.isArray(value)
    ? value.slice(0, 10).map(safeE2EDiagnosticText)
    : [];
}

function accessTokenFromContextCookies(cookies, projectRef) {
  const baseName = "sb-" + projectRef + "-auth-token";
  const baseCookie = cookies.find((cookie) => cookie.name === baseName);
  const chunks = cookies
    .filter((cookie) => cookie.name.startsWith(baseName + "."))
    .sort((left, right) => Number(left.name.slice(baseName.length + 1)) - Number(right.name.slice(baseName.length + 1)));
  const raw = chunks.length ? chunks.map((cookie) => cookie.value).join("") : baseCookie?.value;
  if (!raw) throw new Error("Authenticated Supabase session cookie was not found for the E2E project.");
  let decoded = raw;
  try { decoded = decodeURIComponent(decoded); } catch {}
  if (decoded.startsWith("base64-")) decoded = Buffer.from(decoded.slice(7), "base64url").toString("utf8");
  let session;
  try { session = JSON.parse(decoded); }
  catch { throw new Error("Authenticated Supabase session cookie could not be decoded."); }
  const accessToken = session?.access_token ?? session?.currentSession?.access_token;
  if (typeof accessToken !== "string" || !accessToken) {
    throw new Error("Authenticated Supabase session cookie did not contain an access token.");
  }
  return accessToken;
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
  const suffix = randomUUID();
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
      const creationKey = "e2e-project-create-" + suffix;
      const creationPayload = {
        name: projectName,
        problemStatement: "Disposable E2E project for persisted workspace and intent acceptance.",
      };
      const createResponse = await pageA.request.post("/api/projects", {
        headers: { "idempotency-key": creationKey },
        data: creationPayload,
      });
      expect(createResponse.status(), "project creation API should return 201").toBe(201);
      const created = await createResponse.json();
      expect(created.project?.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(created.workspaceInitialized).toBe(true);

      const replayResponse = await pageA.request.post("/api/projects", {
        headers: { "idempotency-key": creationKey },
        data: creationPayload,
      });
      expect(replayResponse.status(), "retrying the same project request must replay the first project").toBe(200);
      const replay = await replayResponse.json();
      expect(replay).toMatchObject({
        idempotentReplay: true,
        workspaceInitialized: true,
        project: { id: created.project.id },
      });

      const reusedKeyResponse = await pageA.request.post("/api/projects", {
        headers: { "idempotency-key": creationKey },
        data: { ...creationPayload, problemStatement: "Different payload must not reuse the original creation key." },
      });
      expect(reusedKeyResponse.status(), "reusing a key for different project data must conflict").toBe(409);
      expect(await reusedKeyResponse.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

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

    await test.step("Reject direct authenticated Data API writes to trusted workspace state", async () => {
      const projectRef = requiredEnv("E2E_SUPABASE_PROJECT_REF");
      const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
      const currentResponse = await pageA.request.get(workspacePath);
      expect(currentResponse.status()).toBe(200);
      const before = await currentResponse.json();
      const accessToken = accessTokenFromContextCookies(await contextA.cookies([baseURL]), projectRef);
      const directWrite = await fetch(
        "https://" + projectRef + ".supabase.co/rest/v1/engineering_workspaces?project_id=eq." + encodeURIComponent(projectId),
        {
          method: "PATCH",
          headers: {
            apikey: publishableKey,
            authorization: "Bearer " + accessToken,
            "content-type": "application/json",
            prefer: "return=representation",
          },
          body: JSON.stringify({
            revision: before.revision + 99,
            snapshot: {
              ...before.snapshot,
              revision: before.revision + 99,
              project: {
                ...before.snapshot.project,
                events: [{
                  id: "forged-direct-api-event",
                  timestamp: new Date().toISOString(),
                  actor: "forged",
                  action: "FORGED_VALIDATION",
                  output: { informationStatus: "VERIFIED" },
                  evidence: ["forged-evidence"],
                }],
              },
            },
            saved_at: new Date().toISOString(),
          }),
        },
      );
      expect(
        [401, 403],
        "authenticated clients must not bypass server-side workspace validation by writing arbitrary snapshot JSON",
      ).toContain(directWrite.status);

      const afterResponse = await pageA.request.get(workspacePath);
      expect(afterResponse.status()).toBe(200);
      const after = await afterResponse.json();
      expect(after.revision).toBe(before.revision);
      expect(after.snapshot.project.events).toEqual(before.snapshot.project.events);
    });

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

    await test.step("Persist pump power calculation and verify digest-bound validation receipt", async () => {
      const currentResponse = await pageA.request.get(workspacePath);
      expect(currentResponse.status()).toBe(200);
      const current = await currentResponse.json();
      const idempotencyKey = randomUUID();
      const pumpInput = {
        density: { value: 1000, unit: "kg/m3" },
        flowRate: { value: 20, unit: "L/s" },
        head: { value: 20, unit: "m" },
        efficiencyPercent: 75,
      };
      const runResponse = await pageA.request.patch(workspacePath, {
        data: {
          operation: "RUN_PUMP_HYDRAULIC_POWER",
          expectedRevision: current.revision,
          idempotencyKey,
          pumpInput,
        },
      });
      expect(runResponse.status()).toBe(200);
      const run = await runResponse.json();
      expect(run).toMatchObject({ projectId, persisted: true, revision: current.revision + 1 });
      expect(run.result.calculation.hydraulicPowerKw).toBeCloseTo(3.92266, 6);
      expect(run.result.calculation.shaftPowerKw).toBeCloseTo(5.2302133333, 6);
      const artifact = run.result.artifact;
      expect(artifact).toMatchObject({
        projectId,
        capability: "ANALYSIS.PUMP_HYDRAULIC_POWER",
        sourceRevision: current.revision,
        workspaceRevision: run.revision,
        executionStatus: "COMPLETED",
        validationStatus: "VALIDATED",
        approvalStatus: "NOT_REQUESTED",
        verificationStatus: "NOT_VERIFIED",
      });
      expect(artifact.validationReceipt.result).toBe("PASS");
      expect(artifact.validationReceipt.checks.length).toBeGreaterThanOrEqual(5);
      expect(artifact.inputSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(artifact.outputSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(artifact.validationReceipt.inputSha256).toBe(artifact.inputSha256);
      expect(artifact.validationReceipt.outputSha256).toBe(artifact.outputSha256);
      const event = run.snapshot.project.events.find((candidate) => candidate.id === run.result.eventId);
      expect(event.artifactIds).toContain(artifact.id);
      expect(event.evidence).toContain("validation:" + artifact.validationReceipt.id);
      expect(event.idempotencyKey).toBe(idempotencyKey);

      // Repeat with the original revision, as happens when the first response was lost in transit.
      const replayResponse = await pageA.request.patch(workspacePath, {
        data: { operation: "RUN_PUMP_HYDRAULIC_POWER", expectedRevision: current.revision, idempotencyKey, pumpInput },
      });
      expect(replayResponse.status()).toBe(200);
      const replay = await replayResponse.json();
      expect(replay).toMatchObject({ projectId, persisted: true, revision: run.revision });
      expect(replay.result).toMatchObject({ idempotentReplay: true, artifact: { id: artifact.id } });
      expect(replay.snapshot.artifacts).toHaveLength(1);
      expect(replay.snapshot.project.events).toHaveLength(run.snapshot.project.events.length);

      const keyReuseResponse = await pageA.request.patch(workspacePath, {
        data: {
          operation: "RUN_PUMP_HYDRAULIC_POWER",
          expectedRevision: run.revision,
          idempotencyKey,
          pumpInput: { ...pumpInput, flowRate: { value: 21, unit: "L/s" } },
        },
      });
      expect(keyReuseResponse.status()).toBe(409);
      expect(await keyReuseResponse.json()).toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED" });

      const restoredResponse = await pageA.request.get(workspacePath);
      expect(restoredResponse.status()).toBe(200);
      const restored = await restoredResponse.json();
      expect(restored.snapshot.artifacts).toEqual([
        expect.objectContaining({
          id: artifact.id,
          capability: "ANALYSIS.PUMP_HYDRAULIC_POWER",
          inputSha256: artifact.inputSha256,
          outputSha256: artifact.outputSha256,
          verificationStatus: "NOT_VERIFIED",
        }),
      ]);

      await test.step("Mark older calculation evidence stale after a later workspace revision", async () => {
        const changeResponse = await pageA.request.patch(workspacePath, {
          data: {
            operation: "UPDATE_ASSUMPTIONS",
            expectedRevision: restored.revision,
            assumptions: ["A later context change must not silently make older calculation evidence current."],
          },
        });
        expect(changeResponse.status()).toBe(200);
        const changed = await changeResponse.json();
        expect(changed.revision).toBe(restored.revision + 1);

        await pageA.goto("/projects/" + projectId + "/analysis");
        await expect(pageA.getByText("STALE", { exact: true })).toBeVisible();
        await expect(pageA.getByText(/This artifact was saved at workspace revision/)).toBeVisible();
        await expect(pageA.getByText("NOT_VERIFIED", { exact: true })).toBeVisible();
      });
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

    await test.step("Reject malformed session identifiers and conversation payloads", async () => {
      const malformedConversation = await pageA.request.put("/api/engineering/intent", {
        data: { projectId, sessionId, conversation: [{ role: "administrator", text: "invalid role" }] },
      });
      expect(malformedConversation.status()).toBe(400);
      expect(await malformedConversation.json()).toHaveProperty("error");

      const invalidRevision = await pageA.request.put("/api/engineering/intent", {
        data: { projectId, sessionId, expectedRevision: 0, conversation: [{ role: "engineer", text: "invalid revision" }] },
      });
      expect(invalidRevision.status()).toBe(400);
      expect(await invalidRevision.json()).toHaveProperty("error");

      const oversizedSessionId = "x".repeat(129);
      const invalidSessionRead = await pageA.request.get(
        "/api/engineering/intent?projectId=" + encodeURIComponent(projectId) + "&sessionId=" + encodeURIComponent(oversizedSessionId),
      );
      expect(invalidSessionRead.status()).toBe(400);
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


test("engineering conversation and decision restore after full browser reload", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
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
    await signIn(page, userAEmail, userAPassword);

  const suffix = randomUUID();
    const projectName = "E2E conversation refresh " + suffix;
    const createResponse = await page.request.post("/api/projects", {
      data: {
        name: projectName,
        problemStatement: "Disposable project for browser conversation refresh/resume acceptance.",
      },
    });
    expect(createResponse.status(), "test project should be created for the authenticated owner").toBe(201);
    const created = await createResponse.json();
    const projectId = created.project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto("/projects/" + projectId + "/engineering");
    await expect(page.getByRole("heading", { name: "From engineering intent to a checked result" })).toBeVisible();
    await expect(page.locator(".conversation")).toHaveAttribute("aria-live", "polite");
    await expect(page.getByRole("button", { name: "Run engineering task" })).toBeVisible();

    const requestBox = page.getByRole("textbox", { name: "Engineering request" });
    await expect(requestBox).toBeEnabled();
    const prompt = "Design a shaft that transmits 5 kW at 1500 rpm.";
    await requestBox.fill(prompt);
    await page.getByRole("button", { name: "Run engineering task" }).click();

    await expect(page.locator(".message.engineer p").filter({ hasText: prompt })).toBeVisible();
    await expect(page.locator(".interactionHeader .pill")).toHaveText("NEEDS_INPUT");
    const replyLocator = page.locator(".message.assistant p").nth(1);
    await expect(replyLocator).not.toHaveText("");
    const assistantReply = (await replyLocator.textContent())?.trim() ?? "";
    expect(assistantReply.length, "assistant decision should be visible before refresh").toBeGreaterThan(0);

    const sessionKey = "engineering-intent-session:" + projectId;
    const sessionIdBefore = await page.evaluate((key) => sessionStorage.getItem(key), sessionKey);
    expect(sessionIdBefore, "browser should retain the server session identity").toBeTruthy();
    await page.reload();

    // Heading appears only after the restore effect has completed and the UI returns to ready state.
    await expect(page.getByRole("heading", { name: "From engineering intent to a checked result" })).toBeVisible();
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();
    await expect(page.getByText(assistantReply, { exact: true })).toBeVisible();
    await expect(page.locator(".interactionHeader .pill")).toHaveText("NEEDS_INPUT");
    const sessionIdAfter = await page.evaluate((key) => sessionStorage.getItem(key), sessionKey);
    expect(sessionIdAfter, "reload must not silently replace the saved session").toBe(sessionIdBefore);
    await expect(page.getByRole("textbox", { name: "Engineering request" })).toBeEnabled();

    expect(diagnostics.pageErrors, "unhandled browser JavaScript errors during restore").toEqual([]);
    expect(diagnostics.serverErrors, "unexpected HTTP 5xx responses during restore").toEqual([]);
  } finally {
    await testInfo.attach("browser-refresh-diagnostics.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });
    await context.close().catch(() => undefined);
  }
});


test("provider outage is shown and the failed turn remains recoverable after reload", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const diagnostics = { pageErrors: [], unexpectedServerErrors: [] };
  let intentPostCount = 0;

  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error.message).slice(0, 500)));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      let pathname = "/";
      try { pathname = new URL(response.url()).pathname; } catch {}
      const expectedInjectedFailure =
        pathname === "/api/engineering/intent" && response.request().method() === "POST";
      if (!expectedInjectedFailure) {
        diagnostics.unexpectedServerErrors.push({ status: response.status(), pathname });
      }
    }
  });

  try {
    await signIn(page, userAEmail, userAPassword);
  const suffix = randomUUID();
    const projectName = "E2E provider outage " + suffix;
    const createResponse = await page.request.post("/api/projects", {
      data: {
        name: projectName,
        problemStatement: "Disposable project for simulated provider outage recovery acceptance.",
      },
    });
    expect(createResponse.status()).toBe(201);
    const projectId = (await createResponse.json()).project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.route("**/api/engineering/intent", async (route) => {
      if (route.request().method() === "POST") {
        intentPostCount += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated provider outage" }),
        });
        return;
      }
      await route.continue();
    });

    await page.goto("/projects/" + projectId + "/engineering");
    await expect(page.getByRole("textbox", { name: "Engineering request" })).toBeEnabled();
    const prompt = "Calculate shaft torque for 5 kW at 1500 rpm.";
    await page.getByRole("textbox", { name: "Engineering request" }).fill(prompt);
    await page.getByRole("button", { name: "Run engineering task" }).click();

    await expect(page.getByRole("alert").filter({ hasText: "Simulated provider outage" })).toBeVisible();
    await expect(page.locator(".message.engineer p", { hasText: prompt })).toBeVisible();
    await expect(page.locator(".message.assistant p", {
      hasText: "The engineering service did not return a usable decision.",
    })).toBeVisible();
    await expect(page.locator(".decisionCard")).toHaveCount(0);
    expect(intentPostCount).toBe(1);
    // The error is rendered before the failure snapshot write completes. Wait for
    // submit() to leave its busy state, which occurs after persistConversation resolves.
    await expect(page.locator(".interactionHeader .pill")).toHaveText("REQUEST FAILED");

    await page.reload();
    await expect(page.getByRole("heading", { name: "From engineering intent to a checked result" })).toBeVisible();
    await expect(page.getByText(prompt, { exact: true })).toBeVisible();
    await expect(page.locator(".message.assistant p").filter({
      hasText: "The engineering service did not return a usable decision.",
    })).toBeVisible();
    await expect(page.locator(".decisionCard")).toHaveCount(0);
    expect(intentPostCount, "reload must restore history, not resubmit the engineering task").toBe(1);

    expect(diagnostics.pageErrors, "unhandled browser JavaScript errors").toEqual([]);
    expect(diagnostics.unexpectedServerErrors, "unexpected non-injected HTTP 5xx responses").toEqual([]);
  } finally {
    await testInfo.attach("provider-outage-diagnostics.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });
    await context.close().catch(() => undefined);
  }
});


test("existing session restore outage preserves identity and does not start a replacement session", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const diagnostics = { injectedFailures: 0, pageErrors: [], unexpectedServerErrors: [] };

  page.on("pageerror", (error) => diagnostics.pageErrors.push(String(error.message).slice(0, 500)));
  page.on("response", (response) => {
    if (response.status() >= 500) {
      let pathname = "/";
      try { pathname = new URL(response.url()).pathname; } catch {}
      const expectedInjectedFailure = pathname === "/api/engineering/intent" && response.request().method() === "GET";
      if (!expectedInjectedFailure) diagnostics.unexpectedServerErrors.push({ status: response.status(), pathname });
    }
  });

  try {
    await signIn(page, userAEmail, userAPassword);
  const suffix = randomUUID();
    const projectName = "E2E existing session restore outage " + suffix;
    const createResponse = await page.request.post("/api/projects", {
      data: {
        name: projectName,
        problemStatement: "Disposable project for existing-session restoration outage acceptance.",
      },
    });
    expect(createResponse.status()).toBe(201);
    const projectId = (await createResponse.json()).project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto("/projects/" + projectId + "/engineering");
    await expect(page.getByRole("heading", { name: "From engineering intent to a checked result" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Engineering request" })).toBeEnabled();
    const sessionKey = "engineering-intent-session:" + projectId;
    const originalSessionId = await page.evaluate((key) => sessionStorage.getItem(key), sessionKey);
    expect(originalSessionId, "initial session identity must be persisted").toBeTruthy();

    await page.route("**/api/engineering/intent**", async (route) => {
      if (route.request().method() === "GET") {
        diagnostics.injectedFailures += 1;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Simulated existing-session storage outage",
            code: "SESSION_STORAGE_UNAVAILABLE",
            recoverable: true,
          }),
        });
        return;
      }
      await route.continue();
    });

    await page.reload();
    await expect(page.getByRole("heading", { name: "Session could not be restored" })).toBeVisible();
    await expect(page.locator('.interaction .notice[role="alert"]')).toContainText("Simulated existing-session storage outage");
    await expect(page.getByRole("button", { name: "Start new session" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Engineering request" })).toHaveCount(0);

    const sessionIdAfterFailure = await page.evaluate((key) => sessionStorage.getItem(key), sessionKey);
    expect(sessionIdAfterFailure, "restore failure must not silently replace saved identity").toBe(originalSessionId);
    expect(diagnostics.injectedFailures).toBe(1);
    expect(diagnostics.pageErrors).toEqual([]);
    expect(diagnostics.unexpectedServerErrors).toEqual([]);
  } finally {
    await testInfo.attach("existing-session-restore-outage-diagnostics.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });
    await context.close().catch(() => undefined);
  }
});

test("initial session persistence outage fails closed without dispatching engineering work", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  let intentPostCount = 0;

  try {
    await signIn(page, userAEmail, userAPassword);
  const suffix = randomUUID();
    const projectName = "E2E session outage " + suffix;
    const createResponse = await page.request.post("/api/projects", {
      data: {
        name: projectName,
        problemStatement: "Disposable project for fail-closed initial session persistence acceptance.",
      },
    });
    expect(createResponse.status()).toBe(201);
    const projectId = (await createResponse.json()).project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.route("**/api/engineering/intent", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Simulated session storage outage" }),
        });
        return;
      }
      if (route.request().method() === "POST") intentPostCount += 1;
      await route.continue();
    });

    await page.goto("/projects/" + projectId + "/engineering");
    await expect(page.getByRole("heading", { name: "Session could not be restored" })).toBeVisible();
    await expect(page.locator('.interaction .notice[role="alert"]')).toContainText("No engineering request has been sent.");
    await expect(page.getByRole("button", { name: "Start new session" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Engineering request" })).toHaveCount(0);
    expect(intentPostCount, "failed initial session persistence must block task dispatch").toBe(0);

    expect(await page.evaluate(() => sessionStorage.length)).toBeGreaterThan(0);
  } finally {
    await testInfo.attach("initial-session-outage-diagnostics.json", {
      body: Buffer.from(JSON.stringify({ intentPostCount }, null, 2)),
      contentType: "application/json",
    });
    await context.close().catch(() => undefined);
  }
});


test("CAD needs-input completion persists a correlated durable audit event without executing CAD", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const suffix = randomUUID();
  const projectName = "E2E CAD audit acceptance " + suffix;
  const context = await browser.newContext({ baseURL });
  let page;
  let projectId;
  let modelIdentityId;
  let completionId;
  let cleanupStatus = "NOT_ATTEMPTED";

  try {
    page = await context.newPage();
    await signIn(page, userAEmail, userAPassword);

    const projectResponse = await page.request.post("/api/projects", {
      data: {
        name: projectName,
        problemStatement: "Disposable CAD audit acceptance; the incomplete request must not execute CAD.",
      },
    });
    expect(projectResponse.status(), "project creation must succeed on isolated staging").toBe(201);
    const projectBody = await projectResponse.json();
    projectId = projectBody.project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    const modelResponse = await page.request.post("/api/cad/models", {
      data: { projectId, name: "E2E incomplete CAD intent" },
    });
    expect(modelResponse.status(), "a project-scoped CAD identity should be created").toBe(201);
    const modelBody = await modelResponse.json();
    modelIdentityId = modelBody.model?.id;
    expect(modelIdentityId).toMatch(/^[0-9a-f-]{36}$/i);

    // Missing explicit diameter and length intentionally take the NEEDS_INPUT path.
    // This must persist a proposal and audit event without calling any CAD worker.
    const completionResponse = await page.request.post("/api/cad/completions", {
      data: { projectId, modelIdentityId, rawIntent: "cylinder" },
    });
    expect(completionResponse.status(), "incomplete CAD intent should be durably recorded without execution")
      .toBe(200);
    const completionBody = await completionResponse.json();
    const completion = completionBody.completion;
    completionId = completion?.id;
    expect(completionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(completion).toMatchObject({
      project_id: projectId,
      model_identity_id: modelIdentityId,
      status: "NEEDS_INPUT",
      stage: "INTENT",
      execution_id: null,
      storage_objects: [],
      evidence_records: [],
    });
    expect(completionBody.persisted).toBe(true);
    expect(completion.intent_resolution).toMatchObject({ status: "NEEDS_INPUT" });

    await testInfo.attach("e2e-cad-audit-acceptance.json", {
      body: Buffer.from(JSON.stringify({
        projectId,
        modelIdentityId,
        completionId,
        expectedAudit: {
          action: "TASK_PROPOSE",
          outcome: "PENDING",
          resourceType: "CAD_COMPLETION",
          resourceId: completionId,
          taskId: modelIdentityId,
          metadataStatus: "NEEDS_INPUT",
          metadataStage: "INTENT",
          requestIdRequired: true,
        },
        executionPerformed: false,
      }, null, 2)),
      contentType: "application/json",
    });
  } finally {
    if (projectId && page) {
      const cleanupResponse = await page.request.delete("/api/projects/" + projectId).catch(() => null);
      cleanupStatus = cleanupResponse ? String(cleanupResponse.status()) : "REQUEST_FAILED";
      if (cleanupResponse) {
        expect(cleanupResponse.status(), "disposable CAD audit project must be cleaned up")
          .toBe(200);
        const cleanupBody = await cleanupResponse.json();
        expect(cleanupBody).toMatchObject({
          projectId,
          deleted: true,
          artifactCleanup: {
            status: "COMPLETED",
            objectsRemoved: 0,
            objectsRemaining: 0,
            verification: "POST_REMOVE_STORAGE_INVENTORY",
          },
        });
      } else {
        throw new Error("Disposable CAD audit project cleanup request could not be completed.");
      }
    }
    await testInfo.attach("e2e-cad-audit-cleanup.json", {
      body: Buffer.from(JSON.stringify({ projectId, modelIdentityId, completionId, cleanupStatus }, null, 2)),
      contentType: "application/json",
    });
    await context.close().catch(() => undefined);
  }
});

test("project GET/PATCH/DELETE are owner scoped and revision guarded", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const userBEmail = requiredEnv("E2E_USER_B_EMAIL");
  const userBPassword = requiredEnv("E2E_USER_B_PASSWORD");
  const suffix = randomUUID();
  const originalName = "E2E project CRUD " + suffix;
  const updatedName = originalName + " renamed";
  const pathPrefix = "/api/projects/";
  let contextA;
  let contextB;

  try {
    contextA = await browser.newContext({ baseURL });
    const pageA = await contextA.newPage();
    await signIn(pageA, userAEmail, userAPassword);

    const createResponse = await pageA.request.post("/api/projects", {
      data: {
        name: originalName,
        problemStatement: "Disposable project for project-specific GET/PATCH/DELETE acceptance.",
      },
    });
    expect(createResponse.status()).toBe(201);
    const created = await createResponse.json();
    const projectId = created.project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.workspaceInitialized).toBe(true);
    testInfo.annotations.push({ type: "e2e-project-id", description: projectId });

    const invalidIdRead = await pageA.request.get(pathPrefix + "not-a-project-id");
    expect(invalidIdRead.status()).toBe(400);
    const invalidBodyPatch = await pageA.request.patch(pathPrefix + projectId, {
      data: { expectedRevision: 1, name: updatedName, status: "COMPLETE" },
    });
    expect(invalidBodyPatch.status()).toBe(400);

    const readResponse = await pageA.request.get(pathPrefix + projectId);
    expect(readResponse.status()).toBe(200);
    const readBody = await readResponse.json();
    expect(readBody.project).toMatchObject({ id: projectId, name: originalName, revision: 1 });

    const patchResponse = await pageA.request.patch(pathPrefix + projectId, {
      data: { expectedRevision: readBody.project.revision, name: updatedName },
    });
    expect(patchResponse.status()).toBe(200);
    const patched = await patchResponse.json();
    expect(patched.project).toMatchObject({ id: projectId, name: updatedName, revision: 2 });

    const stalePatch = await pageA.request.patch(pathPrefix + projectId, {
      data: { expectedRevision: readBody.project.revision, name: originalName },
    });
    expect(stalePatch.status()).toBe(409);
    expect(await stalePatch.json()).toMatchObject({
      code: "PROJECT_REVISION_CONFLICT",
      currentRevision: 2,
    });

    contextB = await browser.newContext({ baseURL });
    const pageB = await contextB.newPage();
    await signIn(pageB, userBEmail, userBPassword);

    const foreignRead = await pageB.request.get(pathPrefix + projectId);
    expect([403, 404]).toContain(foreignRead.status());
    expect((await foreignRead.json()).project).toBeUndefined();

    const foreignPatch = await pageB.request.patch(pathPrefix + projectId, {
      data: { expectedRevision: 2, name: "Unauthorized rename" },
    });
    expect(foreignPatch.status()).toBe(403);

    const foreignDelete = await pageB.request.delete(pathPrefix + projectId);
    expect(foreignDelete.status()).toBe(403);

    const userBProjects = await pageB.request.get("/api/projects");
    expect(userBProjects.status()).toBe(200);
    expect(((await userBProjects.json()).projects ?? []).some((project) => project.id === projectId)).toBe(false);

    const ownerReadAfterForeignAttempts = await pageA.request.get(pathPrefix + projectId);
    expect(ownerReadAfterForeignAttempts.status()).toBe(200);
    expect((await ownerReadAfterForeignAttempts.json()).project.name).toBe(updatedName);

    await test.step("Reject anonymous project list, read, update, and delete requests", async () => {
      await pageA.getByRole("navigation", { name: "Account" }).getByRole("button", { name: "Sign out" }).click();
      await expect(pageA).toHaveURL(/\/login(?:\?.*)?$/);

      const anonymousList = await pageA.request.get("/api/projects");
      expect([401, 403, 404]).toContain(anonymousList.status());

      const anonymousRead = await pageA.request.get(pathPrefix + projectId);
      expect([401, 403, 404]).toContain(anonymousRead.status());
      expect((await anonymousRead.json()).project).toBeUndefined();

      const anonymousPatch = await pageA.request.patch(pathPrefix + projectId, {
        data: { expectedRevision: 2, name: "Anonymous rename attempt" },
      });
      expect([401, 403, 404]).toContain(anonymousPatch.status());

      const anonymousDelete = await pageA.request.delete(pathPrefix + projectId);
      expect([401, 403, 404]).toContain(anonymousDelete.status());

      await signIn(pageA, userAEmail, userAPassword);
      const projectAfterAnonymousAttempts = await pageA.request.get(pathPrefix + projectId);
      expect(projectAfterAnonymousAttempts.status()).toBe(200);
      expect((await projectAfterAnonymousAttempts.json()).project.name).toBe(updatedName);
    });

    const projectRef = requiredEnv("E2E_SUPABASE_PROJECT_REF");
    const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
    const accessToken = accessTokenFromContextCookies(await contextA.cookies([baseURL]), projectRef);
    const artifactPath = projectId + "/delete-acceptance-" + suffix + ".txt";
    const uploadResponse = await fetch(
      "https://" + projectRef + ".supabase.co/storage/v1/object/engineering-cad-artifacts/" + artifactPath,
      {
        method: "POST",
        headers: {
          apikey: publishableKey,
          authorization: "Bearer " + accessToken,
          "content-type": "text/plain",
          "x-upsert": "false",
        },
        body: "Disposable project-delete acceptance artifact.",
      },
    );
    expect([200, 201], "a real object should upload to the authenticated project-scoped bucket").toContain(uploadResponse.status);

    const deleteResponse = await pageA.request.delete(pathPrefix + projectId);
    expect(deleteResponse.status()).toBe(200);
    expect(await deleteResponse.json()).toMatchObject({
      projectId,
      deleted: true,
      artifactCleanup: { status: "COMPLETED", objectsRemoved: 1 },
    });

    const readAfterDelete = await pageA.request.get(pathPrefix + projectId);
    expect([403, 404]).toContain(readAfterDelete.status());
    const userAProjects = await pageA.request.get("/api/projects");
    expect(userAProjects.status()).toBe(200);
    expect(((await userAProjects.json()).projects ?? []).some((project) => project.id === projectId)).toBe(false);
  } finally {
    if (contextB) await contextB.close().catch(() => undefined);
    if (contextA) await contextA.close().catch(() => undefined);
  }
});


test.describe("Non-retriable live accepted CAD acceptance", () => {
  // A transport failure after a mutating POST is ambiguous: do not replay this whole test.
  // Only the idempotent readiness GET below may be retried.
  test.describe.configure({ retries: 0 });

  test("OPT-IN live accepted CAD completion persists artifacts and independently verifiable atomic audit correlation", async ({ browser }, testInfo) => {
  test.skip(
    process.env.E2E_RUN_ACCEPTED_CAD_SMOKE !== "true",
    "Opt-in only: exercises a real CAD worker and writes then removes disposable artifacts in the dedicated E2E project.",
  );
  test.setTimeout(360_000);

  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const suffix = randomUUID();
  const projectName = "E2E accepted CAD atomic audit " + suffix;
  const diagnostics = {
    projectId: null,
    modelIdentityId: null,
    completionId: null,
    completionStatus: null,
    completionStage: null,
    completionErrors: [],
    completionWarnings: [],
    storageObjectCount: 0,
    readiness: null,
    readinessAttempts: [],
    auditEvent: null,
    cleanup: null,
  };
  const context = await browser.newContext({ baseURL });
  let page;
  let projectId;
  let modelIdentityId;

  try {
    page = await context.newPage();
    await signIn(page, userAEmail, userAPassword);

    const projectResponse = await safeAuthenticatedRequest("Disposable accepted-CAD project creation", () =>
      page.request.post("/api/projects", {
        data: {
          name: projectName,
          problemStatement: "Opt-in E2E: verify one accepted CAD result and its atomic durable audit, using disposable artifacts.",
        },
      }),
    );
    expect(projectResponse.status(), "disposable project creation must succeed in the isolated E2E project").toBe(201);
    const projectBody = await projectResponse.json();
    projectId = projectBody.project?.id;
    diagnostics.projectId = projectId;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    // Readiness is a read-only GET, so bounded retries are safe if the edge/worker
    // cold start resets the transport or returns a transient gateway response. Never apply
    // this retry policy to POST /api/cad/completions: an ambiguous POST must not be replayed.
    const readinessPath = "/api/cad/readiness?projectId=" + encodeURIComponent(projectId);
    const readinessAttempts = [];
    let readinessResponse;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await page.request.get(readinessPath, { timeout: 60_000 });
        const retryableStatus = [502, 503, 504].includes(response.status());
        readinessAttempts.push({
          attempt,
          httpStatus: response.status(),
          retryableStatus: retryableStatus && attempt < 2,
        });
        readinessResponse = response;
        if (!retryableStatus || attempt === 2) break;
      } catch {
        readinessAttempts.push({ attempt, outcome: "transport_timeout_or_reset" });
        if (attempt === 2) {
          diagnostics.readinessAttempts = readinessAttempts;
          throw new Error("CAD readiness probe failed after two bounded read-only attempts; transport diagnostics were suppressed to protect session credentials.");
        }
      }
      if (attempt < 2) await page.waitForTimeout(3_000);
    }
    diagnostics.readinessAttempts = readinessAttempts;
    const readinessBody = await readinessResponse.json();
    diagnostics.readiness = { status: readinessResponse.status(), body: readinessBody };
    expect(
      readinessResponse.status(),
      "live CAD readiness must pass before submitting execution; checks=" + JSON.stringify(readinessBody?.checks ?? readinessBody),
    ).toBe(200);
    expect(readinessBody).toMatchObject({ projectId, ready: true, status: "READY" });

    const modelResponse = await safeAuthenticatedRequest("CAD model identity creation", () =>
      page.request.post("/api/cad/models", {
        data: { projectId, name: "E2E accepted cylindrical shaft " + suffix },
      }),
    );
    expect(modelResponse.status(), "a project-scoped CAD model identity should be created").toBe(201);
    const modelBody = await modelResponse.json();
    modelIdentityId = modelBody.model?.id;
    diagnostics.modelIdentityId = modelIdentityId;
    expect(modelIdentityId).toMatch(/^[0-9a-f-]{36}$/i);

    const completionResponse = await safeAuthenticatedRequest("Live accepted CAD completion", () =>
      page.request.post("/api/cad/completions", {
        data: {
          projectId,
          modelIdentityId,
          rawIntent: "Create a cylindrical shaft with a diameter of 30 mm and a length of 200 mm.",
        },
        timeout: 180_000,
      }),
    );
    const completionBody = await completionResponse.json();
    const completion = completionBody?.completion;
    diagnostics.completionId = completion?.id ?? null;
    diagnostics.completionStatus = completion?.status ?? null;
    diagnostics.completionStage = completion?.stage ?? null;
    diagnostics.completionErrors = safeE2EDiagnosticList(completion?.errors);
    diagnostics.completionWarnings = safeE2EDiagnosticList(completion?.warnings);
    diagnostics.storageObjectCount = Array.isArray(completion?.storage_objects) ? completion.storage_objects.length : 0;
    expect(
      completionResponse.status(),
      "fully specified request must reach an accepted, persisted completion; body=" + JSON.stringify({
        status: completionResponse.status(),
        error: safeE2EDiagnosticText(completionBody?.error),
        code: safeE2EDiagnosticText(completionBody?.code),
        completionStatus: completion?.status,
        completionStage: completion?.stage,
        completionErrors: diagnostics.completionErrors,
        completionWarnings: diagnostics.completionWarnings,
      }),
    ).toBe(201);
    expect(completion).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
      project_id: projectId,
      model_identity_id: modelIdentityId,
      status: "ACCEPTED",
      execution_id: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    expect(completionBody).toMatchObject({ persisted: true, verified: true });
    expect(Array.isArray(completion.storage_objects)).toBe(true);
    expect(completion.storage_objects.length).toBeGreaterThanOrEqual(5);
    expect(Array.isArray(completion.artifact_records)).toBe(true);
    for (const kind of ["SOURCE", "SOLID", "STEP", "STL", "THREE_MF"]) {
      const artifact = completion.artifact_records.find((item) => item?.kind === kind);
      expect(artifact, "accepted completion must persist " + kind + " artifact metadata").toBeTruthy();
      expect(artifact.validationStatus === "PASS" || kind !== "SOLID").toBe(true);
    }
    expect(completion.validation_receipt).toMatchObject({
      validatorProviderId: "cad.occt",
      validation: { valid: true, solidCount: 1 },
    });
    const receipt = completion.validation_receipt;
    expect(receipt.id).toEqual(expect.any(String));
    expect(receipt.artifactSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(receipt.validatorVersion).toEqual(expect.any(String));
    const measurements = receipt.geometryMeasurements;
    expect(measurements?.boundingBoxMm).toMatchObject({ x: expect.any(Number), y: expect.any(Number), z: expect.any(Number) });
    expect(Math.abs(measurements.boundingBoxMm.x - 30)).toBeLessThanOrEqual(0.010001);
    expect(Math.abs(measurements.boundingBoxMm.y - 30)).toBeLessThanOrEqual(0.010001);
    expect(Math.abs(measurements.boundingBoxMm.z - 200)).toBeLessThanOrEqual(0.0102);
    const expectedVolume = Math.PI * 15 * 15 * 200;
    expect(Math.abs(measurements.volumeMm3 - expectedVolume)).toBeLessThanOrEqual(expectedVolume * 1e-3);
    const solidPath = completion.storage_objects.find((item) => typeof item === "string" && item.endsWith("/solid.brep"));
    expect(solidPath, "the accepted completion must include its persisted BREP path").toEqual(expect.any(String));
    const signedUrls = completionBody.signedUrls;
    expect(typeof signedUrls?.[solidPath]).toBe("string");
    expect(signedUrls[solidPath]).toMatch(/^https:\/\//);
    const downloadedSolid = await safeAuthenticatedRequest("Persisted BREP readback", () =>
      page.request.get(signedUrls[solidPath], { timeout: 60_000 }),
    );
    expect(downloadedSolid.ok(), "the short-lived private signed URL must read the stored BREP bytes").toBe(true);
    const downloadedDigest = createHash("sha256").update(await downloadedSolid.body()).digest("hex");
    expect(downloadedDigest).toBe(receipt.artifactSha256);

    const historyResponse = await safeAuthenticatedRequest("CAD completion history readback", () =>
      page.request.get("/api/cad/completions?projectId=" + encodeURIComponent(projectId)),
    );
    expect(historyResponse.status()).toBe(200);
    const historyBody = await historyResponse.json();
    expect((historyBody.completions ?? []).some((item) => item.id === completion.id && item.status === "ACCEPTED")).toBe(true);

    const auditResponse = await safeAuthenticatedRequest("Durable audit-chain readback", () =>
      page.request.get("/api/engineering/audit?projectId=" + encodeURIComponent(projectId) + "&limit=200"),
    );
    const auditBody = await auditResponse.json();
    expect(
      auditResponse.status(),
      "authorized audit read must independently verify the durable hash chain; body=" + JSON.stringify(auditBody),
    ).toBe(200);
    expect(auditBody).toMatchObject({ projectId, verified: true, chainIntegrity: { verified: true } });
    const auditEvent = (auditBody.events ?? []).find((event) =>
      event?.resource_type === "CAD_COMPLETION" && event?.resource_id === completion.id
    );
    expect(auditEvent, "an append-only audit event for this exact completion must exist").toBeTruthy();
    expect(auditEvent).toMatchObject({
      action: "EVIDENCE_WRITE",
      outcome: "SUCCESS",
      project_id: projectId,
      resource_type: "CAD_COMPLETION",
      resource_id: completion.id,
      task_id: modelIdentityId,
      run_id: completion.execution_id,
      provider_id: expect.any(String),
      artifact_sha256: receipt.artifactSha256,
    });
    expect(typeof auditEvent.request_id).toBe("string");
    expect(auditEvent.request_id.length).toBeGreaterThan(0);
    expect(auditEvent.provider_id.length).toBeGreaterThan(0);
    if (receipt.id) expect(auditEvent.validator_receipt_id).toBe(receipt.id);
    expect(auditEvent.decision_id).toEqual(expect.any(String));
    expect(auditEvent.chain_sequence).toEqual(expect.any(Number));
    expect(auditEvent.chain_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(auditEvent.event_hash).toMatch(/^[a-f0-9]{64}$/);
    diagnostics.auditEvent = {
      event_id: auditEvent.event_id,
      action: auditEvent.action,
      outcome: auditEvent.outcome,
      project_id: auditEvent.project_id,
      resource_id: auditEvent.resource_id,
      request_id: auditEvent.request_id,
      task_id: auditEvent.task_id,
      run_id: auditEvent.run_id,
      provider_id: auditEvent.provider_id,
      artifact_sha256: auditEvent.artifact_sha256,
      validator_receipt_id: auditEvent.validator_receipt_id,
      decision_id: auditEvent.decision_id,
      chain_sequence: auditEvent.chain_sequence,
      event_hash: auditEvent.event_hash,
      chain_hash: auditEvent.chain_hash,
    };
    await testInfo.attach("accepted-cad-atomic-audit-evidence.json", {
      body: Buffer.from(JSON.stringify({
        sourceHead: process.env.GITHUB_SHA ?? "not-provided",
        projectId,
        modelIdentityId,
        completionId: completion.id,
        executionId: completion.execution_id,
        completionStatus: completion.status,
        persisted: completionBody.persisted,
        verified: completionBody.verified,
        storageObjects: completion.storage_objects,
        artifacts: completion.artifact_records.map((item) => ({
          kind: item.kind,
          validationStatus: item.validationStatus,
          informationStatus: item.informationStatus,
          artifactSha256: item.provenance?.artifactSha256,
        })),
        validationReceipt: receipt,
        independentlyVerifiedChain: auditBody.chainIntegrity,
        correlatedAuditEvent: diagnostics.auditEvent,
      }, null, 2)),
      contentType: "application/json",
    });
  } finally {
    if (projectId && page) {
      let cleanupBody = null;
      // A timeout/reset can happen after the server already deleted the project.
      // Retry once, then verify absence explicitly before classifying cleanup as failed.
      let cleanupResponse = await page.request.delete("/api/projects/" + projectId, { timeout: 60_000 }).catch(() => null);
      if (!cleanupResponse) {
        cleanupResponse = await page.request.delete("/api/projects/" + projectId, { timeout: 60_000 }).catch(() => null);
      }
      if (!cleanupResponse || cleanupResponse.status() === 404) {
        const absenceResponse = await page.request.get("/api/projects/" + projectId, { timeout: 30_000 }).catch(() => null);
        if (absenceResponse?.status() === 404) {
          diagnostics.cleanup = { status: "ALREADY_ABSENT", verifiedAbsent: true };
        } else {
          diagnostics.cleanup = {
            status: "UNCONFIRMED",
            deleteResponseStatus: cleanupResponse?.status() ?? null,
            verificationStatus: absenceResponse?.status() ?? null,
          };
          await testInfo.attach("accepted-cad-cleanup-diagnostics.json", {
            body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
            contentType: "application/json",
          });
          throw new Error("Disposable accepted-CAD project cleanup could not be confirmed after a bounded retry.");
        }
      } else {
        cleanupBody = await cleanupResponse.json().catch(() => ({}));
        diagnostics.cleanup = { status: cleanupResponse.status(), body: cleanupBody };
        expect(
          cleanupResponse.status(),
          "disposable project and generated CAD objects must clean up even when the acceptance path fails; body=" + JSON.stringify(cleanupBody),
        ).toBe(200);
        expect(cleanupBody).toMatchObject({
          projectId,
          deleted: true,
          artifactCleanup: { status: "COMPLETED", objectsRemaining: 0 },
        });
      }
      const expectedCleanupObjects = Number(diagnostics.storageObjectCount ?? 0);
      if (expectedCleanupObjects > 0 && cleanupBody) {
        expect(
          Number(cleanupBody.artifactCleanup?.objectsRemoved ?? 0),
          "all persisted CAD objects must be removed during cleanup; diagnostics=" + JSON.stringify({
            completionStatus: diagnostics.completionStatus,
            storageObjectCount: expectedCleanupObjects,
            cleanup: cleanupBody.artifactCleanup,
          }),
        ).toBeGreaterThanOrEqual(expectedCleanupObjects);
      }
    }
    await testInfo.attach("accepted-cad-test-diagnostics.json", {
      body: Buffer.from(JSON.stringify(diagnostics, null, 2)),
      contentType: "application/json",
    });
    await context.close().catch(() => undefined);
  }
  });
});


test("axe WCAG 2.1/2.2 AA scan covers login, project list, and project engineering workspace", async ({ browser }, testInfo) => {
  const baseURL = requiredEnv("E2E_BASE_URL");
  const userAEmail = requiredEnv("E2E_USER_A_EMAIL");
  const userAPassword = requiredEnv("E2E_USER_A_PASSWORD");
  const suffix = randomUUID();
  const projectName = "E2E accessibility audit " + suffix;
  const report = [];
  let projectId;
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();

  async function auditPage(routeName) {
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
      .analyze();
    report.push({
      routeName,
      url: page.url(),
      violations: result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        description: violation.description,
        nodes: violation.nodes.map((node) => ({
          target: node.target,
          html: node.html,
          failureSummary: node.failureSummary,
        })),
      })),
      incomplete: result.incomplete.map((item) => ({ id: item.id, impact: item.impact, help: item.help })),
    });
  }

  try {
    await page.goto("/login");
    await auditPage("login");
    await signIn(page, userAEmail, userAPassword);
    await auditPage("authenticated-project-list");

    const projectResponse = await page.request.post("/api/projects", {
      data: {
        name: projectName,
        problemStatement: "Disposable project for automated axe WCAG conformance scans.",
      },
    });
    expect(projectResponse.status()).toBe(201);
    projectId = (await projectResponse.json()).project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    const workspaceResponse = await page.goto("/projects/" + projectId + "/engineering");
    expect(workspaceResponse?.status(), "the project engineering workspace must load before it is audited").toBe(200);
    await expect(page.getByRole("main")).toBeVisible();
    await auditPage("project-engineering-workspace");

    await testInfo.attach("axe-accessibility-audit.json", {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });
    const violations = report.flatMap((item) => item.violations.map((violation) => ({
      routeName: item.routeName,
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target),
    })));
    expect(violations, "axe reported WCAG or accessibility best-practice violations: " + JSON.stringify(violations)).toEqual([]);
  } finally {
    if (projectId) {
      const cleanup = await page.request.delete("/api/projects/" + projectId).catch(() => null);
      expect(cleanup, "disposable accessibility-test project cleanup must respond").toBeTruthy();
      if (cleanup) {
        const cleanupBody = await cleanup.json().catch(() => ({}));
        expect(cleanup.status(), JSON.stringify(cleanupBody)).toBe(200);
        expect(cleanupBody).toMatchObject({
          projectId,
          deleted: true,
          artifactCleanup: { status: "COMPLETED", objectsRemaining: 0 },
        });
      }
    }
    await context.close().catch(() => undefined);
    await testInfo.attach("axe-accessibility-audit-diagnostics.json", {
      body: Buffer.from(JSON.stringify(report, null, 2)),
      contentType: "application/json",
    });
  }
});
