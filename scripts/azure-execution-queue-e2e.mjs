#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const TABLE = "engineering_execution_jobs";
const EXPECTED_TORQUE_NM = (9550 * 5) / 1500;
const E2E_SUPABASE_PROJECT_REF = "mpbrlegwrrrfpeumtqhi";

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
function assertIsolatedE2ETarget() {
  const rawUrl = requiredEnv("SUPABASE_URL");
  let supabaseUrl;
  try { supabaseUrl = new URL(rawUrl); } catch { fail("SUPABASE_URL is not a valid URL."); }
  if (supabaseUrl.protocol !== "https:" ||
      supabaseUrl.hostname !== E2E_SUPABASE_PROJECT_REF + ".supabase.co" ||
      supabaseUrl.pathname !== "/" || supabaseUrl.username || supabaseUrl.password ||
      supabaseUrl.search || supabaseUrl.hash) {
    fail("Azure queue acceptance is restricted to the exact dedicated E2E Supabase project URL; refusing any other database target.");
  }
  const api = new URL(requiredEnv("EXECUTION_API_BASE_URL"));
  if (api.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(api.hostname) ||
      api.username || api.password || api.search || api.hash) {
    fail("Azure queue acceptance must use the local E2E API bound to loopback; remote and production API targets are rejected.");
  }
}
function assertServiceRoleCredential(key) {
  if (key.startsWith("sb_secret_")) return;
  if (!key.startsWith("eyJ")) fail("Azure queue acceptance requires a service_role credential, not a public key.");
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (payload.role !== "service_role") fail("Azure queue acceptance requires a service_role credential.");
  } catch {
    fail("Azure queue acceptance requires a valid service_role JWT or current sb_secret_ key.");
  }
}
function getSupabaseConfig() {
  assertIsolatedE2ETarget();
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  assertServiceRoleCredential(serviceKey);
  if (!url.startsWith("https://") || !publishableKey.startsWith("sb_publishable_")) {
    fail("Supabase URL or publishable-key format is invalid.");
  }
  return { url, serviceKey, publishableKey };
}
function createServiceClient() {
  assertIsolatedE2ETarget();
  const url = requiredEnv("SUPABASE_URL");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  assertServiceRoleCredential(serviceKey);
  if (!url.startsWith("https://")) fail("SUPABASE_URL must use HTTPS.");
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}
function apiBase() {
  assertIsolatedE2ETarget();
  return new URL(requiredEnv("EXECUTION_API_BASE_URL")).origin;
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
async function assertQueueIdle() {
  const active = await restRead({
    select: "id,status",
    or: "(status.eq.QUEUED,status.eq.RUNNING)",
    limit: "10"
  });
  if (active.length !== 0) {
    fail("Isolated E2E execution queue is not idle. No temporary identity or project was created; refusing to interfere with existing test work.");
  }
}
async function createTemporaryIdentity(service, email, password, runId, attempt) {
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { engineering_roles: ["ENGINEER"] },
    user_metadata: {
      purpose: "temporary Azure execution queue acceptance test",
      run_id: runId,
      run_attempt: attempt
    }
  });
  if (created.error || !created.data.user) {
    fail("Could not create the temporary test identity in Supabase Auth.");
  }
  const userId = created.data.user.id;
  setGithubEnv("AZURE_E2E_USER_ID", userId);
  return userId;
}
async function createAuthenticatedCookie(url, publishableKey, email, password) {
  const loginClient = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const login = await loginClient.auth.signInWithPassword({ email, password });
  if (login.error || !login.data.session) {
    fail("Temporary test identity could not obtain an authenticated session.");
  }
  const cookie = await createCookie(login.data.session, url, publishableKey);
  setGithubEnv("AZURE_E2E_COOKIE", cookie);
  return cookie;
}
async function createTemporaryProject(cookie, runId, attempt) {
  const projectName = "Azure execution E2E " + runId + "." + attempt;
  setGithubEnv("AZURE_E2E_PROJECT_NAME", projectName);
  const response = await authorizedApi("POST", "/api/projects", cookie, {
    name: projectName,
    problemStatement: "Temporary bounded acceptance test; deterministic shaft-torque execution only."
  }, { "X-Request-ID": correlationId() });
  const project = isRecord(response.body) && isRecord(response.body.project)
    ? response.body.project
    : undefined;
  if (response.response.status !== 201 || !project || !isUuid(project.id)) {
    fail("Authenticated project setup failed (HTTP " + response.response.status + ").");
  }
  setGithubEnv("AZURE_E2E_PROJECT_ID", project.id);
  return project.id;
}
function buildExecutionPayload(projectId) {
  return {
    projectId,
    capability: "ANALYSIS.SHAFT_TORQUE",
    backend: "typescript-safe",
    inputs: { powerKw: 5, speedRpm: 1500 },
    requestedOutputs: ["torque"]
  };
}
async function submitAndVerifyExecution(cookie, userId, projectId) {
  const idempotency = idempotencyKey();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotency)) {
    fail("Generated idempotency key is invalid.");
  }
  const payload = buildExecutionPayload(projectId);
  const headers = { "Idempotency-Key": idempotency, "X-Request-ID": correlationId() };
  const queued = await authorizedApi("POST", "/api/execution", cookie, payload, headers);
  if (queued.response.status !== 202 || !isRecord(queued.body) ||
      queued.body.status !== "QUEUED" || !isUuid(queued.body.id)) {
    const code = isRecord(queued.body) && typeof queued.body.code === "string"
      ? queued.body.code
      : "unknown";
    fail("Authenticated durable execution API did not queue the test (HTTP " +
      queued.response.status + ", code=" + code + ").");
  }
  const jobId = queued.body.id;
  const replay = await authorizedApi("POST", "/api/execution", cookie, payload, headers);
  if (replay.response.status !== 200 || !isRecord(replay.body) ||
      replay.body.id !== jobId || replay.body.idempotentReplay !== true) {
    fail("Idempotent replay did not return the original durable job without creating a duplicate.");
  }
  const row = await readJob(jobId, projectId);
  if (!row || row.owner_id !== userId || row.idempotency_key !== idempotency || row.status !== "QUEUED") {
    fail("The durable API response could not be reconciled to its stored queue row.");
  }
  assertTestRequest(row, jobId, projectId);
  setGithubEnv("AZURE_E2E_JOB_ID", jobId);
  return jobId;
}
async function setup() {
  const { url, publishableKey } = getSupabaseConfig();
  const service = createServiceClient();
  const runId = requiredEnv("GITHUB_RUN_ID");
  const attempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "1";
  await assertQueueIdle();

  const email = "azure-execution-e2e+" + runId + "." + attempt + "@example.com";
  const password = randomBytes(32).toString("base64url") + "aA1!";
  const userId = await createTemporaryIdentity(service, email, password, runId, attempt);
  const cookie = await createAuthenticatedCookie(url, publishableKey, email, password);
  const projectId = await createTemporaryProject(cookie, runId, attempt);
  const jobId = await submitAndVerifyExecution(cookie, userId, projectId);

  console.log(JSON.stringify({
    jobId,
    projectId,
    status: "QUEUED",
    request: "ANALYSIS.SHAFT_TORQUE",
    backend: "typescript-safe",
    idempotentReplay: true
  }));
}
async function preflight() {
  assertIsolatedE2ETarget();
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
    fail("Isolated E2E execution queue is not exclusively occupied by this acceptance job; refusing to run the test worker.");
  }
  console.log("Azure queue E2E preflight passed: the acceptance job is the only active queue item.");
}
function assertJobSucceeded(row) {
  if (row.status !== "SUCCEEDED") {
    const detail = row.error_code ? " (" + row.error_code + ")" : "";
    fail("Azure queue E2E job status is " + row.status + detail + ".");
  }
}
function readExpectedTorque(row) {
  const torque = Number(row.result?.torqueNm ?? row.result?.torque?.value);
  if (!Number.isFinite(torque) || Math.abs(torque - EXPECTED_TORQUE_NM) > 1e-9) {
    fail("Azure queue E2E result failed the deterministic torque assertion.");
  }
  if (row.result?.status !== "CALCULATED") {
    fail("Azure queue E2E result status is not CALCULATED.");
  }
  return torque;
}
function assertCompletedAttempt(row) {
  if (!(Number(row.attempts) >= 1) || !row.started_at || !row.finished_at) {
    fail("Azure queue E2E record lacks claim/attempt/completion timestamps.");
  }
}
function assertTrustedProvenance(row, jobId) {
  if (row.provenance?.provider !== "execution.typescript-safe" ||
      row.provenance?.executionId !== jobId) {
    fail("Azure queue E2E provenance does not identify the expected deterministic provider and execution.");
  }
}
function assertLeaseReleased(row) {
  if (row.lease_owner !== null || row.lease_token !== null || row.lease_expires_at !== null) {
    fail("Azure queue E2E job finished without clearing its worker lease.");
  }
}
async function assertAuthenticatedStatusReadback(jobId, projectId) {
  const cookie = requiredEnv("AZURE_E2E_COOKIE");
  const path = "/api/execution/" + encodeURIComponent(jobId) +
    "?projectId=" + encodeURIComponent(projectId);
  const status = await authorizedApi("GET", path, cookie);
  const matchesJob = isRecord(status.body) &&
    status.body.id === jobId && status.body.status === "SUCCEEDED";
  if (status.response.status !== 200 || !matchesJob) {
    fail("Authenticated durable job-status API did not read back the completed job for its owning project.");
  }
}
async function assertQueueDrained() {
  const active = await restRead({
    select: "id,status",
    or: "(status.eq.QUEUED,status.eq.RUNNING)",
    limit: "10"
  });
  if (active.length !== 0) {
    fail("The isolated E2E queue is not empty after the one-job acceptance run.");
  }
}
async function verify() {
  assertIsolatedE2ETarget();
  const jobId = requiredEnv("AZURE_E2E_JOB_ID");
  const projectId = requiredEnv("AZURE_E2E_PROJECT_ID");
  const row = await readJob(jobId, projectId);
  if (!row) fail("Azure queue E2E job was not found after worker execution.");

  assertTestRequest(row, jobId, projectId);
  assertJobSucceeded(row);
  const torque = readExpectedTorque(row);
  assertCompletedAttempt(row);
  assertTrustedProvenance(row, jobId);
  assertLeaseReleased(row);
  await assertAuthenticatedStatusReadback(jobId, projectId);
  await assertQueueDrained();

  console.log("Azure queue-to-result acceptance passed: status=SUCCEEDED, attempts=" +
    row.attempts + ", torqueNm=" + torque.toFixed(9) +
    ", idempotentReplay=verified, authenticatedReadback=verified, provenance=verified, lease=cleared.");
}
async function cleanup() {
  const userId = process.env.AZURE_E2E_USER_ID?.trim();
  if (!userId) {
    console.log("Azure queue E2E cleanup: no temporary test identity was created.");
    return;
  }
  assertIsolatedE2ETarget();
  if (!isUuid(userId)) fail("Temporary test user ID is invalid; refusing cleanup.");
  let projectId = process.env.AZURE_E2E_PROJECT_ID?.trim();
  const projectName = process.env.AZURE_E2E_PROJECT_NAME?.trim();
  const cookie = process.env.AZURE_E2E_COOKIE?.trim();
  const service = createServiceClient();

  // Recover a project created by the API if the response was lost before its ID
  // could be exported. Match both the temporary owner and unique run-specific name.
  if (!projectId && projectName) {
    const recovered = await service.from("engineering_projects")
      .select("id")
      .eq("owner_id", userId)
      .eq("name", projectName)
      .limit(2);
    if (recovered.error) fail("Could not recover a partially created temporary project; preserving the test identity.");
    if ((recovered.data ?? []).length > 1) fail("More than one project matched the temporary run identity; refusing cleanup.");
    projectId = recovered.data?.[0]?.id;
    if (projectId && !isUuid(projectId)) fail("Recovered temporary project ID is invalid; refusing cleanup.");
  }

  if (projectId) {
    if (!isUuid(projectId)) fail("Temporary project ID is invalid; refusing cleanup.");
    const projectRows = await restRead({
      select: "id,owner_id,project_id,idempotency_key,capability,backend,request,status",
      project_id: "eq." + projectId,
      limit: "10"
    });
    if (projectRows.length >= 10) {
      fail("Temporary project contains an unexpected number of queue records; refusing broad cleanup.");
    }
    for (const row of projectRows) {
      if (row.owner_id !== userId || row.project_id !== projectId ||
          row.idempotency_key !== idempotencyKey() ||
          row.request?.correlationId !== correlationId() ||
          row.request?.capability !== "ANALYSIS.SHAFT_TORQUE" ||
          row.request?.backend !== "typescript-safe") {
        fail("Refusing to clean the temporary project because it contains a row outside this acceptance run's scope.");
      }
      if (row.status === "QUEUED" || row.status === "RUNNING") {
        if (!cookie) fail("Cannot safely cancel the temporary queue item because its authenticated session cookie is missing.");
        const cancellation = await authorizedApi(
          "DELETE",
          "/api/execution/" + encodeURIComponent(row.id) + "?projectId=" + encodeURIComponent(projectId),
          cookie
        );
        if (!cancellation.response.ok || !isRecord(cancellation.body) ||
            !isRecord(cancellation.body.job) || cancellation.body.job.id !== row.id) {
          fail("Authenticated cancellation failed for the temporary acceptance job; preserving the project and identity for safe recovery.");
        }
        let latest = cancellation.body.job;
        for (let attempt = 0; attempt < 36 && (latest.status === "QUEUED" || latest.status === "RUNNING"); attempt++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          latest = await readJob(row.id, projectId);
          if (!latest) break;
        }
        if (latest && (latest.status === "QUEUED" || latest.status === "RUNNING")) {
          fail("Temporary acceptance job did not reach a terminal state within 180 seconds after cancellation; preserving the project and identity rather than deleting a live lease.");
        }
      }
    }

    // The project owner FK is RESTRICT, not CASCADE. Delete this run's project only
    // after all its execution jobs are terminal; child rows such as jobs, workspace
    // snapshots and memberships cascade from the project.
    const removedProject = await service.from("engineering_projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", userId)
      .select("id")
      .maybeSingle();
    if (removedProject.error) {
      fail("Could not remove the temporary acceptance project after queue cleanup; preserving the test identity.");
    }
    if (removedProject.data && removedProject.data.id !== projectId) {
      fail("Project cleanup returned an unexpected ID; preserving the test identity.");
    }
  }

  const existingUser = await service.auth.admin.getUserById(userId);
  if (existingUser.error) {
    const status = existingUser.error.status;
    const code = existingUser.error.code;
    if (status === 404 || code === "user_not_found") {
      console.log("Azure queue E2E cleanup: temporary identity and project were already removed.");
      return;
    }
    fail("Could not verify the temporary test identity state; manual cleanup may be required.");
  }
  const removedUser = await service.auth.admin.deleteUser(userId);
  if (removedUser.error) fail("Could not delete the temporary acceptance identity after project cleanup.");
  console.log("Azure queue E2E cleanup passed: test job terminal, temporary project removed, temporary identity deleted.");
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
