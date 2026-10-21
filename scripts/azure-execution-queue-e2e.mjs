#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const TABLE = "engineering_execution_jobs";
const EXPECTED_TORQUE_NM = (9550 * 5) / 1500;
const DEFAULT_API_BASE = "https://ai-mechanical-engineering-assistant.vercel.app";

function fail(message) { throw new Error(message); }
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail("Required environment variable " + name + " is not set.");
  return value;
}
function correlationId() {
  return "azure-worker-e2e:" + requiredEnv("GITHUB_RUN_ID") + ":" +
    (process.env.GITHUB_RUN_ATTEMPT?.trim() || "1");
}
function idempotencyKey() {
  return "azure-worker-e2e-" + requiredEnv("GITHUB_RUN_ID") + "-" +
    (process.env.GITHUB_RUN_ATTEMPT?.trim() || "1");
}
function getSupabaseConfig() {
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  if (!url.startsWith("https://") || !publishableKey.startsWith("sb_publishable_")) {
    fail("Supabase URL or publishable-key format is invalid.");
  }
  return { url, serviceKey, publishableKey };
}
function createServiceClient() {
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!url.startsWith("https://")) fail("SUPABASE_URL must use HTTPS.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
function apiBase() {
  const base = new URL(process.env.EXECUTION_API_BASE_URL?.trim() || DEFAULT_API_BASE);
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(base.hostname)) {
    fail("EXECUTION_API_BASE_URL must use HTTPS except for local development.");
  }
  return base.origin;
}
async function restRead(params) {
  const { url, serviceKey } = getSupabaseConfig();
  const target = new URL("/rest/v1/" + TABLE, url);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
  const response = await fetch(target, {
    headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey, Accept: "application/json" },
    signal: AbortSignal.timeout(20000),
    cache: "no-store"
  });
  if (!response.ok) fail("Read-only Supabase queue request failed with HTTP " + response.status + ".");
  const result = await response.json().catch(() => null);
  if (!Array.isArray(result)) fail("Supabase queue query did not return an array.");
  return result;
}
async function authorizedApi(method, path, cookie, body, headers = {}) {
  const response = await fetch(new URL(path, apiBase()), {
    method,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...headers,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30000),
    cache: "no-store"
  });
  const parsed = await response.json().catch(() => null);
  return { response, body: parsed };
}
function setGithubEnv(name, value) {
  if (/[\r\n]/.test(value)) fail("Cannot export a multiline GitHub environment value.");
  const envFile = process.env.GITHUB_ENV;
  if (!envFile) fail("GITHUB_ENV is unavailable; run this mode only in GitHub Actions.");
  appendFileSync(envFile, name + "=" + value + "\n", { encoding: "utf8", mode: 0o600 });
}
function assertTestRequest(row, jobId, projectId) {
  if (row?.id !== jobId || row?.project_id !== projectId ||
      row?.capability !== "ANALYSIS.SHAFT_TORQUE" ||
      row?.backend !== "typescript-safe" ||
      row?.request?.projectId !== projectId ||
      row?.request?.correlationId !== correlationId() ||
      row?.request?.capability !== "ANALYSIS.SHAFT_TORQUE" ||
      row?.request?.backend !== "typescript-safe" ||
      row?.request?.inputs?.powerKw !== 5 ||
      row?.request?.inputs?.speedRpm !== 1500) {
    fail("Queue E2E record identity, project scope, correlation or bounded inputs do not match this run.");
  }
}
async function readJob(jobId, projectId) {
  const rows = await restRead({
    select: "id,owner_id,project_id,idempotency_key,capability,backend,request,status,attempts,result,provenance,lease_owner,lease_token,lease_expires_at,started_at,finished_at,error_code,cancel_requested_at",
    id: "eq." + jobId,
    project_id: "eq." + projectId,
    limit: "1"
  });
  return rows[0];
}
async function createCookie(session, url, publishableKey) {
  const stored = new Map();
  const cookieClient = createServerClient(url, publishableKey, {
    cookies: {
      getAll() { return [...stored.entries()].map(([name, value]) => ({ name, value })); },
      setAll(values) { for (const item of values) stored.set(item.name, item.value); }
    }
  });
  const result = await cookieClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token
  });
  if (result.error) fail("Could not serialize the temporary authenticated Supabase session.");
  const cookie = [...stored.entries()].map(([name, value]) =>
    name + "=" + encodeURIComponent(value)
  ).join("; ");
  if (!cookie || !cookie.includes("auth-token")) fail("Supabase SSR did not persist the temporary session cookie.");
  return cookie;
}
async function setup() {
  const { url, publishableKey } = getSupabaseConfig();
  const service = createServiceClient();
  const runId = requiredEnv("GITHUB_RUN_ID");
  const attempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "1";

  const active = await restRead({
    select: "id,status",
    or: "(status.eq.QUEUED,status.eq.RUNNING)",
    limit: "10"
  });
  if (active.length !== 0) {
    fail("Production execution queue is not idle. No temporary identity or project was created; refusing to interfere with queued/running engineering work.");
  }

  const email = "azure-execution-e2e+" + runId + "." + attempt + "@example.com";
  const password = randomBytes(32).toString("base64url") + "aA1!";
  let userId;
  let projectId;
  let cookie;
  let jobId;
  try {
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { engineering_roles: ["ENGINEER"] },
      user_metadata: { purpose: "temporary Azure execution queue acceptance test", run_id: runId, run_attempt: attempt }
    });
    if (created.error || !created.data.user) {
      fail("Could not create the temporary test identity in Supabase Auth.");
    }
    userId = created.data.user.id;
    setGithubEnv("AZURE_E2E_USER_ID", userId);
    const loginClient = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const login = await loginClient.auth.signInWithPassword({ email, password });
    if (login.error || !login.data.session) fail("Temporary test identity could not obtain an authenticated session.");
    cookie = await createCookie(login.data.session, url, publishableKey);
    setGithubEnv("AZURE_E2E_COOKIE", cookie);

    const projectResponse = await authorizedApi("POST", "/api/projects", cookie, {
      name: "Azure execution E2E " + runId + "." + attempt,
      problemStatement: "Temporary bounded acceptance test; deterministic shaft-torque execution only."
    }, { "X-Request-ID": correlationId() });
    if (projectResponse.response.status !== 201 || !isRecord(projectResponse.body) ||
        !isRecord(projectResponse.body.project) || !isUuid(projectResponse.body.project.id)) {
      fail("Authenticated project setup failed (HTTP " + projectResponse.response.status + ").");
    }
    projectId = projectResponse.body.project.id;
    setGithubEnv("AZURE_E2E_PROJECT_ID", projectId);

    const idempotency = idempotencyKey();
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotency)) fail("Generated idempotency key is invalid.");
    const queued = await authorizedApi("POST", "/api/execution", cookie, {
      projectId,
      capability: "ANALYSIS.SHAFT_TORQUE",
      backend: "typescript-safe",
      inputs: { powerKw: 5, speedRpm: 1500 },
      requestedOutputs: ["torque"]
    }, { "Idempotency-Key": idempotency, "X-Request-ID": correlationId() });
    if (queued.response.status !== 202 || !isRecord(queued.body) ||
        queued.body.status !== "QUEUED" || !isUuid(queued.body.id)) {
      const code = isRecord(queued.body) && typeof queued.body.code === "string" ? queued.body.code : "unknown";
      fail("Authenticated durable execution API did not queue the test (HTTP " + queued.response.status + ", code=" + code + ").");
    }
    jobId = queued.body.id;
    const row = await readJob(jobId, projectId);
    if (!row || row.owner_id !== userId || row.idempotency_key !== idempotency || row.status !== "QUEUED") {
      fail("The durable API response could not be reconciled to its stored queue row.");
    }
    assertTestRequest(row, jobId, projectId);

    setGithubEnv("AZURE_E2E_JOB_ID", jobId);
    console.log(JSON.stringify({ jobId, projectId, status: "QUEUED", request: "ANALYSIS.SHAFT_TORQUE", backend: "typescript-safe" }));
  } catch (error) {
    // The same workflow job runs cleanup under if: always(), using the identifiers
    // already written to GITHUB_ENV. Do not race the cleanup step here.
    throw error;
  }
}
async function preflight() {
  const jobId = requiredEnv("AZURE_E2E_JOB_ID");
  const projectId = requiredEnv("AZURE_E2E_PROJECT_ID");
  const row = await readJob(jobId, projectId);
  if (!row) fail("The temporary authenticated API queue job could not be found.");
  assertTestRequest(row, jobId, projectId);
  if (row.status !== "QUEUED") fail("The queue acceptance job is not QUEUED; refusing to start Azure.");
  const active = await restRead({
    select: "id,status",
    or: "(status.eq.QUEUED,status.eq.RUNNING)",
    limit: "10"
  });
  if (active.length !== 1 || active[0]?.id !== jobId || active[0]?.status !== "QUEUED") {
    fail("Production execution queue is not exclusively occupied by the acceptance job; refusing to run a worker that might consume unrelated work.");
  }
  console.log("Azure queue E2E preflight passed: the acceptance job is the only active queue item.");
}
async function verify() {
  const jobId = requiredEnv("AZURE_E2E_JOB_ID");
  const projectId = requiredEnv("AZURE_E2E_PROJECT_ID");
  const row = await readJob(jobId, projectId);
  if (!row) fail("Azure queue E2E job was not found after worker execution.");
  assertTestRequest(row, jobId, projectId);
  if (row.status !== "SUCCEEDED") {
    fail("Azure queue E2E job status is " + row.status + (row.error_code ? " (" + row.error_code + ")" : "") + ".");
  }
  const torque = Number(row.result?.torqueNm ?? row.result?.torque?.value);
  if (!Number.isFinite(torque) || Math.abs(torque - EXPECTED_TORQUE_NM) > 1e-9 ||
      row.result?.status !== "CALCULATED") {
    fail("Azure queue E2E result failed the deterministic torque and result-status assertions.");
  }
  if (!(Number(row.attempts) >= 1) || !row.started_at || !row.finished_at) {
    fail("Azure queue E2E record lacks claim/attempt/completion timestamps.");
  }
  if (row.provenance?.provider !== "execution.typescript-safe" ||
      row.provenance?.executionId !== jobId) {
    fail("Azure queue E2E provenance does not identify the expected deterministic provider and execution.");
  }
  if (row.lease_owner !== null || row.lease_token !== null || row.lease_expires_at !== null) {
    fail("Azure queue E2E job finished without clearing its worker lease.");
  }
  console.log("Azure queue-to-result acceptance passed: status=SUCCEEDED, attempts=" +
    row.attempts + ", torqueNm=" + torque.toFixed(9) + ", provenance=verified, lease=cleared.");
}
async function cleanup() {
  const userId = process.env.AZURE_E2E_USER_ID?.trim();
  if (!userId) {
    console.log("Azure queue E2E cleanup: no temporary test identity was created.");
    return;
  }
  if (!isUuid(userId)) fail("Temporary test user ID is invalid; refusing cleanup.");
  const projectId = process.env.AZURE_E2E_PROJECT_ID?.trim();
  const jobId = process.env.AZURE_E2E_JOB_ID?.trim();
  const cookie = process.env.AZURE_E2E_COOKIE?.trim();
  if (projectId && jobId && cookie) {
    const before = await readJob(jobId, projectId);
    if (before && (before.status === "QUEUED" || before.status === "RUNNING")) {
      const cancel = await authorizedApi("DELETE",
        "/api/execution/" + encodeURIComponent(jobId) + "?projectId=" + encodeURIComponent(projectId),
        cookie);
      if (!cancel.response.ok || !isRecord(cancel.body) || !isRecord(cancel.body.job)) {
        fail("Authenticated cancellation of the temporary acceptance job failed (HTTP " + cancel.response.status + "); preserving the temporary identity for safe recovery.");
      }
      let latest = cancel.body.job;
      for (let attempt = 0; attempt < 36 && (latest.status === "QUEUED" || latest.status === "RUNNING"); attempt++) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        const polled = await authorizedApi("GET",
          "/api/execution/" + encodeURIComponent(jobId) + "?projectId=" + encodeURIComponent(projectId),
          cookie);
        if (!polled.response.ok || !isRecord(polled.body) || typeof polled.body.status !== "string") {
          fail("Could not confirm terminal state for the temporary acceptance job; preserving the temporary identity for safe recovery.");
        }
        latest = polled.body;
      }
      if (latest.status === "QUEUED" || latest.status === "RUNNING") {
        fail("Temporary acceptance job did not reach a terminal state within 180 seconds after cancellation; preserving the user/project rather than deleting a live lease.");
      }
    }
  }
  const result = await createServiceClient().auth.admin.deleteUser(userId);
  if (result.error) fail("Could not delete the temporary acceptance identity and its owned test project.");
  console.log("Azure queue E2E cleanup passed: temporary test identity removed after queue terminal state.");
}
async function main() {
  switch (process.argv[2]) {
    case "setup": return setup();
    case "preflight": return preflight();
    case "verify": return verify();
    case "cleanup": return cleanup();
    default: fail("Usage: node scripts/azure-execution-queue-e2e.mjs setup|preflight|verify|cleanup");
  }
}
main().catch(error => {
  const message = error instanceof Error ? error.message : "Unknown Azure queue E2E failure.";
  console.error("::error::Azure queue E2E failed: " + message);
  process.exitCode = 1;
});
