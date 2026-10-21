import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { test, expect } from "@playwright/test";

function requiredEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) throw new Error("Missing required E2E environment variable: " + name);
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
  await expect(page.locator('.projectError[role="alert"]')).toHaveCount(0);
}

test("OPT-IN authenticated point-cloud upload is hashed, project-scoped, audited, and cleaned", async ({ browser }, testInfo) => {
  test.skip(
    process.env.E2E_RUN_POINT_CLOUD_UPLOAD_SMOKE !== "true",
    "Opt-in only: requires the isolated E2E preview to have the V2.2 upload migration applied.",
  );
  test.setTimeout(180_000);

  const baseURL = requiredEnv("E2E_BASE_URL");
  const supabaseRef = requiredEnv("E2E_SUPABASE_PROJECT_REF");
  const publishableKey = requiredEnv("E2E_SUPABASE_PUBLISHABLE_KEY");
  const context = await browser.newContext({ baseURL });
  const supabase = createClient(
    "https://" + supabaseRef + ".supabase.co",
    publishableKey,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
  );
  let projectId;

  try {
    const page = await context.newPage();
    await signIn(page, requiredEnv("E2E_USER_A_EMAIL"), requiredEnv("E2E_USER_A_PASSWORD"));

    const suffix = Date.now().toString(36);
    const projectResponse = await page.request.post("/api/projects", {
      data: {
        name: "E2E point-cloud upload " + suffix,
        problemStatement: "Disposable test project for authenticated point-cloud source intake.",
      },
    });
    expect(projectResponse.status()).toBe(201);
    projectId = (await projectResponse.json()).project?.id;
    expect(projectId).toMatch(/^[0-9a-f-]{36}$/i);

    const bytes = Buffer.from("# scan fixture\n0 0 0\n10 0 0\n0 10 0\n0 0 10\n", "utf8");
    const startResponse = await page.request.post("/api/perception/uploads", {
      data: {
        projectId,
        fileName: "scan.xyz",
        format: "XYZ",
        units: "mm",
        coordinateFrame: "e2e-fixture-frame",
        byteSize: bytes.byteLength,
      },
    });
    expect(startResponse.status()).toBe(201);
    const startBody = await startResponse.json();
    const artifactId = startBody.artifact?.id;
    expect(artifactId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(startBody.artifact).toMatchObject({ status: "UPLOADING", sha256: null });
    expect(startBody.upload).toMatchObject({
      bucket: "engineering-point-clouds",
      method: "uploadToSignedUrl",
      maxBytes: expect.any(Number),
    });
    expect(typeof startBody.upload.uploadToken).toBe("string");
    expect(startBody.upload.storagePath).toBe(projectId + "/" + artifactId + "/source.xyz");

    const { error: uploadError } = await supabase.storage
      .from(startBody.upload.bucket)
      .uploadToSignedUrl(startBody.upload.storagePath, startBody.upload.uploadToken, bytes, { contentType: "text/plain" });
    expect(uploadError, "signed upload should write only to its reserved object path").toBeNull();

    const finalizeResponse = await page.request.post("/api/perception/uploads/" + artifactId + "/finalize", {
      data: { projectId },
    });
    expect(finalizeResponse.status()).toBe(200);
    const finalized = await finalizeResponse.json();
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    expect(finalized).toMatchObject({
      finalized: true,
      artifact: {
        id: artifactId,
        projectId,
        format: "XYZ",
        units: "mm",
        coordinateFrame: "e2e-fixture-frame",
        byteSize: bytes.byteLength,
        sha256: expectedHash,
        declaredPointCount: 4,
        status: "UPLOADED",
        inspectionStatus: "PENDING_OPEN3D_INSPECTION",
      },
      audit: {
        eventId: expect.any(String),
        chainSequence: expect.any(Number),
        eventHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        chainHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
    expect(finalized.warning).toMatch(/Open3D coordinate inspection.*have not run/i);

    const listResponse = await page.request.get("/api/perception/uploads?projectId=" + encodeURIComponent(projectId));
    expect(listResponse.status()).toBe(200);
    const listBody = await listResponse.json();
    expect(listBody.uploads.some((item) => item.id === artifactId && item.sha256 === expectedHash)).toBe(true);

    await testInfo.attach("point-cloud-upload-acceptance.json", {
      body: Buffer.from(JSON.stringify({
        projectId,
        artifactId,
        sourceSha256: expectedHash,
        byteSize: bytes.byteLength,
        declaredPointCount: 4,
        status: "UPLOADED",
        inspectionStatus: "PENDING_OPEN3D_INSPECTION",
        audit: finalized.audit,
      }, null, 2)),
      contentType: "application/json",
    });
  } finally {
    if (projectId) {
      const cleanup = await context.request.delete("/api/projects/" + projectId, { timeout: 60_000 }).catch(() => null);
      if (!cleanup) throw new Error("Disposable point-cloud upload project cleanup could not be confirmed.");
      expect(cleanup.status()).toBe(200);
      expect(await cleanup.json()).toMatchObject({
        projectId,
        deleted: true,
        artifactCleanup: { status: "COMPLETED", objectsRemaining: 0 },
      });
    }
    await context.close().catch(() => undefined);
  }
});
