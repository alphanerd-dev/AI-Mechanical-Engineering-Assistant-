#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";

const TABLE = "engineering_execution_jobs";
const EXPECTED_TORQUE_NM = (9550 * 5) / 1500;
const baseUrl = process.env.SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const runId = process.env.GITHUB_RUN_ID?.trim();
const runAttempt = process.env.GITHUB_RUN_ATTEMPT?.trim() || "1";

function fail(message) {
  throw new Error(message);
}

function isUuid(value) {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)])
    );
  }
  return value;
}

function requestDigest(request) {
  const body = { ...request };
  delete body.id;
  delete body.correlationId;
  return createHash("sha256").update(JSON.stringify(canonical(body))).digest("hex");
}

function getUrl(params = {}) {
  if (!baseUrl) fail("SUPABASE_URL is required for Azure queue E2E.");
  const url = new URL("/rest/v1/" + TABLE, baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function rest(params, options = {}) {
  if (!serviceKey) fail("SUPABASE_SERVICE_ROLE_KEY is required for Azure queue E2E.");
  const method = options.method || "GET";
  const response = await fetch(getUrl(params), {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: "Bearer " + serviceKey,
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {})
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const text = await response.text();
  if (!response.ok) {
    fail("Supabase queue " + method + " request failed with HTTP " + response.status + ".");
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    fail("Supabase queue request returned invalid JSON.");
  }
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
  if (request?.correlationId !== "azure-worker-e2e:" + runId + ":" + runAttempt) {
    fail("Queue E2E correlation ID did not match this workflow attempt.");
  }
}

async function enqueue() {
  if (!runId) fail("GITHUB_RUN_ID is required to make the queue test idempotent.");
  const sourceRows = await rest({
    select: "owner_id,project_id,request",
    capability: "eq.ANALYSIS.SHAFT_TORQUE",
    backend: "eq.typescript-safe",
    status: "eq.SUCCEEDED",
    order: "finished_at.desc",
    limit: "1"
  });
  const source = Array.isArray(sourceRows) ? sourceRows[0] : undefined;
  if (!source || !isUuid(source.owner_id) || !isUuid(source.project_id)) {
    fail("No prior successful shaft-torque job exists to establish a valid owner/project scope. No test job was inserted.");
  }
  if (source.request?.projectId !== source.project_id) {
    fail("The previous successful job has inconsistent project scope. No test job was inserted.");
  }

  const idempotencyKey = "azure-worker-e2e-" + runId + "-" + runAttempt;
  const correlationId = "azure-worker-e2e:" + runId + ":" + runAttempt;
  const newId = randomUUID();
  const request = {
    id: newId,
    capability: "ANALYSIS.SHAFT_TORQUE",
    backend: "typescript-safe",
    inputs: { powerKw: 5, speedRpm: 1500 },
    requestedOutputs: ["torque"],
    timeoutMs: 10000,
    projectId: source.project_id,
    correlationId
  };
  const requestHash = requestDigest(request);

  const existingRows = await rest({
    select: "id,status,request_hash,request",
    owner_id: "eq." + source.owner_id,
    project_id: "eq." + source.project_id,
    idempotency_key: "eq." + idempotencyKey,
    limit: "1"
  });
  let row = Array.isArray(existingRows) ? existingRows[0] : undefined;
  let created = false;

  if (row) {
    if (row.request_hash !== requestHash) {
      fail("The queue E2E idempotency key already exists with a different request. Refusing to reuse it.");
    }
    if (row.status !== "QUEUED" && row.status !== "SUCCEEDED") {
      fail("A prior queue E2E job is in state " + row.status + "; refusing to race or replay it.");
    }
  } else {
    const activeRows = await rest({
      select: "id,status",
      or: "(status.eq.QUEUED,status.eq.RUNNING)",
      limit: "20"
    });
    if (Array.isArray(activeRows) && activeRows.length > 0) {
      fail("The production execution queue is not idle (" + activeRows.length +
        " active row(s) found in the bounded inspection). No test job was inserted; resolve pending work before retrying.");
    }

    const now = new Date().toISOString();
    const inserted = await rest(
      { select: "id,status,request_hash,request" },
      {
        method: "POST",
        prefer: "return=representation",
        body: [{
          id: newId,
          owner_id: source.owner_id,
          project_id: source.project_id,
          idempotency_key: idempotencyKey,
          request_hash: requestHash,
          capability: request.capability,
          backend: request.backend,
          request,
          status: "QUEUED",
          attempts: 0,
          max_attempts: 1,
          next_attempt_at: now,
          queued_at: now,
          artifact_ids: [],
          evidence_ids: [],
          attempt_history: []
        }]
      }
    );
    row = Array.isArray(inserted) ? inserted[0] : undefined;
    if (!row || row.id !== newId || row.status !== "QUEUED" || row.request_hash !== requestHash) {
      fail("Supabase did not confirm insertion of the queue E2E record.");
    }
    created = true;
  }

  if (!row || !isUuid(row.id)) fail("Queue E2E job ID is invalid.");
  assertTestRequest(row, row.id);
  console.log(JSON.stringify({ jobId: row.id, created, initialStatus: row.status }));
}

async function verify() {
  const jobId = process.env.AZURE_E2E_JOB_ID?.trim();
  if (!isUuid(jobId)) fail("AZURE_E2E_JOB_ID is required for queue-result verification.");
  const rows = await rest({
    select: "id,project_id,status,attempts,result,provenance,lease_owner,lease_token,lease_expires_at,started_at,finished_at,request,error_code",
    id: "eq." + jobId,
    limit: "1"
  });
  const row = Array.isArray(rows) ? rows[0] : undefined;
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

async function main() {
  const mode = process.argv[2];
  if (mode === "enqueue") return enqueue();
  if (mode === "verify") return verify();
  fail("Usage: node scripts/azure-execution-queue-e2e.mjs enqueue|verify");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown queue E2E error.";
  console.error("::error::Azure queue E2E failed: " + message);
  process.exitCode = 1;
});
