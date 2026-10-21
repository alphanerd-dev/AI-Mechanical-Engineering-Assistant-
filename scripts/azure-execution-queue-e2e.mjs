#!/usr/bin/env node
const TABLE = "engineering_execution_jobs";
const EXPECTED_TORQUE_NM = (9550 * 5) / 1500;
const baseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const runId = process.env.GITHUB_RUN_ID?.trim();
const runAttempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "1";

function fail(message) {
  throw new Error(message);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail("Required environment variable " + name + " is not set.");
  return value;
}

function getUrl(params = {}) {
  if (!baseUrl) fail("SUPABASE_URL is required for read-only Azure queue acceptance checks.");
  const url = new URL("/rest/v1/" + TABLE, baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function restRead(params) {
  if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY is required for read-only Azure queue acceptance checks.");
  const response = await fetch(getUrl(params), {
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store"
  });
  if (!response.ok) fail("Read-only Supabase queue request failed with HTTP " + response.status + ".");
  try {
    const result = await response.json();
    if (!Array.isArray(result)) fail("Supabase queue query did not return an array.");
    return result;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Supabase queue")) throw error;
    fail("Supabase queue query returned invalid JSON.");
  }
}

function expectedCorrelationId() {
  if (!runId) fail("GITHUB_RUN_ID is required to verify the queue acceptance job.");
  return "azure-worker-e2e:" + runId + ":" + runAttempt;
}

function assertTestRequest(row, expectedId) {
  const request = row?.request;
  if (row?.id !== expectedId) fail("Queue E2E returned an unexpected job ID.");
  if (row?.capability !== "ANALYSIS.SHAFT_TORQUE" ||
      row?.backend !== "typescript-safe" ||
      request?.capability !== "ANALYSIS.SHAFT_TORQUE" ||
      request?.backend !== "typescript-safe" ||
      request?.inputs?.powerKw !== 5 ||
      request?.inputs?.speedRpm !== 1500) {
    fail("Queue E2E job request does not match the bounded shaft-torque acceptance case.");
  }
  if (request?.correlationId !== expectedCorrelationId()) {
    fail("Queue E2E correlation ID did not match this workflow attempt.");
  }
}

function requireJobId() {
  const jobId = process.env.AZURE_E2E_JOB_ID?.trim();
  if (!isUuid(jobId)) fail("AZURE_E2E_JOB_ID is required for Azure queue acceptance checks.");
  return jobId;
}

async function authorizedApi(method, path, body, extraHeaders = {}) {
  const base = new URL(requiredEnv("CAD_WORKSPACE_BASE_URL"));
  if (base.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(base.hostname)) {
    fail("CAD_WORKSPACE_BASE_URL must use HTTPS except for local development.");
  }
  const cookie = requiredEnv("CAD_WORKSPACE_COOKIE");
  if (/\r|\n/.test(cookie)) fail("CAD_WORKSPACE_COOKIE must be a single HTTP Cookie header value.");
  const response = await fetch(new URL(path, base.origin), {
    method,
    headers: {
      Accept: "application/json",
      Cookie: cookie,
      ...extraHeaders,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000),
    cache: "no-store"
  });
  let parsed;
  try {
    parsed = await response.json();
  } catch {
    fail("The authenticated execution API returned a non-JSON response (HTTP " + response.status + ").");
  }
  return { response, body: parsed };
}

async function enqueueApi() {
  const projectId = requiredEnv("CAD_WORKSPACE_PROJECT_ID");
  if (!isUuid(projectId)) fail("CAD_WORKSPACE_PROJECT_ID must be a registered project UUID.");
  const idempotencyKey = "azure-worker-e2e-" + requiredEnv("GITHUB_RUN_ID") + "-" + runAttempt;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(idempotencyKey)) fail("Generated idempotency key is invalid.");
  const { response, body } = await authorizedApi(
    "POST",
    "/api/execution",
    {
      projectId,
      capability: "ANALYSIS.SHAFT_TORQUE",
      backend: "typescript-safe",
      inputs: { powerKw: 5, speedRpm: 1500 },
      requestedOutputs: ["torque"]
    },
    { "Idempotency-Key": idempotencyKey, "X-Request-ID": expectedCorrelationId() }
  );
  if (!response.ok || response.status !== 202 || !isRecord(body) ||
      body.status !== "QUEUED" || !isUuid(body.id) || body.request?.projectId !== projectId) {
    const status = isRecord(body) && typeof body.status === "string" ? body.status : "unknown";
    fail("Authenticated execution API did not durably enqueue the E2E request (HTTP " +
      response.status + ", status=" + status + "). Check durable-execution configuration; no direct database insert was attempted.");
  }
  console.log(JSON.stringify({ jobId: body.id, initialStatus: body.status }));
}

async function preflight() {
  const jobId = requireJobId();
  const rowResults = await restRead({
    select: "id,project_id,status,capability,backend,request,attempts",
    id: "eq." + jobId,
    limit: "1"
  });
  const row = rowResults[0];
  if (!row) fail("Authenticated API queued job was not found in Supabase.");
  assertTestRequest(row, jobId);
  if (row.request?.projectId !== row.project_id) fail("Queue acceptance job has inconsistent project scope.");
  if (row.status !== "QUEUED") fail("Queue acceptance job is not QUEUED at preflight; refusing to start an untargeted worker run.");

  const activeRows = await restRead({
    select: "id,status,capability,request",
    or: "(status.eq.QUEUED,status.eq.RUNNING)",
    limit: "25"
  });
  if (activeRows.length !== 1 || activeRows[0]?.id !== jobId || activeRows[0]?.status !== "QUEUED") {
    fail("Execution queue is not exclusively occupied by this acceptance job; refusing to run a worker that might consume unrelated work.");
  }
  console.log("Azure queue E2E preflight passed: the authenticated acceptance job is the only active queue item.");
}

async function verify() {
  const jobId = requireJobId();
  const rows = await restRead({
    select: "id,project_id,status,attempts,result,provenance,lease_owner,lease_token,lease_expires_at,started_at,finished_at,request,error_code",
    id: "eq." + jobId,
    limit: "1"
  });
  const row = rows[0];
  if (!row) fail("Azure queue E2E job was not found after worker execution.");
  assertTestRequest(row, jobId);
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

async function cleanupApi() {
  const jobId = requireJobId();
  const projectId = requiredEnv("CAD_WORKSPACE_PROJECT_ID");
  if (!isUuid(projectId)) fail("CAD_WORKSPACE_PROJECT_ID must be a registered project UUID.");
  const path = "/api/execution/" + encodeURIComponent(jobId) + "?projectId=" + encodeURIComponent(projectId);
  const { response, body } = await authorizedApi("DELETE", path);
  if (!response.ok || !isRecord(body) || !isRecord(body.job) || body.job.id !== jobId) {
    fail("Authenticated execution API could not confirm safe cancellation of the acceptance job (HTTP " + response.status + ").");
  }
  const status = body.job.status;
  if (status !== "QUEUED" && status !== "RUNNING" && status !== "SUCCEEDED" &&
      status !== "FAILED" && status !== "CANCELLED") {
    fail("Execution API returned an unknown job state during cleanup.");
  }
  const cancellationPending = body.cancellationPending === true;
  console.log("Azure queue E2E cleanup via authenticated API: status=" + status +
    ", cancellationPending=" + cancellationPending + ".");
}

async function main() {
  const mode = process.argv[2];
  if (mode === "enqueue-api") return enqueueApi();
  if (mode === "preflight") return preflight();
  if (mode === "verify") return verify();
  if (mode === "cleanup-api") return cleanupApi();
  fail("Usage: node scripts/azure-execution-queue-e2e.mjs enqueue-api|preflight|verify|cleanup-api");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown queue E2E error.";
  console.error("::error::Azure queue E2E failed: " + message);
  process.exitCode = 1;
});
