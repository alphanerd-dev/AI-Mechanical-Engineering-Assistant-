import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../src/auth/supabase-service.js";
import { createServiceRoleClient } from "../../../lib/supabase/service.js";
import { ExecutionBackendAdapter, ExecutionEngine } from "../../../src/execution/executor.js";
import { HttpPythonWorkerClient } from "../../../src/execution/http-python-worker.js";
import { PythonWorkerAdapter } from "../../../src/execution/python-worker.js";
import { SafeNumericalAdapter } from "../../../src/execution/safe-numerical.js";
import { ExecutionJobStoreError, IdempotencyConflictError, SupabaseExecutionJobStore } from "../../../src/execution/supabase-job-store.js";
import { buildDurableExecutionRequest, isRecord, parseDurableExecutionInput } from "./durable.js";

export const runtime = "nodejs";

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, {
    status, headers: { "cache-control": "no-store" }
  });
}

type LegacyAuthorizationResult =
  | { allowed: true; authorization: Awaited<ReturnType<typeof authorizeSupabaseRequest>> }
  | { allowed: false; response: NextResponse };

function legacySolverBackendError(body: Record<string, unknown>): NextResponse | undefined {
  const solverBackend = body.backend === "fea-worker" || body.backend === "cfd-worker";
  if (!solverBackend) return undefined;
  return jsonError("Solver execution requires the durable worker runtime.", 503, "DURABLE_WORKER_REQUIRED");
}
function parseLegacyProjectId(body: Record<string, unknown>): string | undefined | NextResponse {
  if (body.projectId === undefined) return undefined;
  if (typeof body.projectId !== "string" || !body.projectId.trim()) {
    return jsonError("projectId must be a non-empty string when provided.", 400);
  }
  return body.projectId.trim();
}
async function authorizeLegacyProject(projectId: string | undefined): Promise<LegacyAuthorizationResult> {
  let authorization: Awaited<ReturnType<typeof authorizeSupabaseRequest>>;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
  } catch {
    return { allowed: false, response: jsonError("Engineering authorization is unavailable.", 503) };
  }
  if (!authorization.allowed) {
    const status = authorizationFailureStatus(authorization);
    return {
      allowed: false,
      response: jsonError(
        authorization.reason,
        status,
        status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED"
      )
    };
  }
  return { allowed: true, authorization };
}
function createLegacyAdapters(backend: "typescript-safe" | "python-worker"): ExecutionBackendAdapter[] {
  const adapters: ExecutionBackendAdapter[] = [new SafeNumericalAdapter()];
  const workerUrl = process.env.PYTHON_WORKER_URL;
  if (backend === "python-worker" && workerUrl) {
    adapters.push(new PythonWorkerAdapter(
      new HttpPythonWorkerClient(workerUrl, fetch, process.env.PYTHON_WORKER_API_TOKEN)
    ));
  }
  return adapters;
}
function createLegacyRequest(input: {
  body: Record<string, unknown>;
  backend: "typescript-safe" | "python-worker";
  projectId: string | undefined;
  requestId: string | null;
}) {
  return {
    id: randomUUID(),
    capability: typeof input.body.capability === "string" ? input.body.capability : "",
    backend: input.backend,
    inputs: isRecord(input.body.inputs) ? input.body.inputs : {},
    requestedOutputs: Array.isArray(input.body.requestedOutputs) ? input.body.requestedOutputs as string[] : [],
    timeoutMs: input.backend === "python-worker" ? 30_000 : 2_000,
    projectId: input.projectId,
    correlationId: input.requestId ?? undefined
  };
}
async function legacySynchronousPost(request: Request, body: Record<string, unknown>) {
  const solverError = legacySolverBackendError(body);
  if (solverError) return solverError;
  const projectId = parseLegacyProjectId(body);
  if (projectId instanceof NextResponse) return projectId;
  const outcome = await authorizeLegacyProject(projectId);
  if (!outcome.allowed) return outcome.response;
  const backend = body.backend === "python-worker" ? "python-worker" : "typescript-safe";
  const adapters = createLegacyAdapters(backend);
  const executionRequest = createLegacyRequest({
    body,
    backend,
    projectId,
    requestId: request.headers.get("x-request-id")
  });
  const job = await new ExecutionEngine(adapters).run(executionRequest);
  return NextResponse.json(job, {
    status: job.status === "SUCCEEDED" ? 200 : 422,
    headers: { "cache-control": "no-store" }
  });
}


export async function POST(request: Request) {
  const parsedBody = await request.json().catch(() => ({}));
  if (!isRecord(parsedBody)) {
    if (process.env.DURABLE_EXECUTION_ENABLED === "true") {
      return jsonError("Request body must be a JSON object.", 400, "INVALID_REQUEST");
    }
    return legacySynchronousPost(request, {});
  }
  if (process.env.DURABLE_EXECUTION_ENABLED !== "true") {
    return legacySynchronousPost(request, parsedBody);
  }

  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const parsed = parseDurableExecutionInput({
    body: parsedBody,
    idempotencyKey: request.headers.get("idempotency-key") ?? "",
    requestId
  });
  if (!parsed.ok) return jsonError(parsed.error, parsed.status, parsed.code);

  const input = parsed.value;
  let authorization: Awaited<ReturnType<typeof authorizeSupabaseRequest>>;
  let evidenceAuthorization: Awaited<ReturnType<typeof authorizeSupabaseRequest>> | undefined;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", input.projectId, { requestId });
    if (input.backend === "fea-worker" || input.backend === "cfd-worker") {
      evidenceAuthorization = await authorizeSupabaseRequest("EVIDENCE.WRITE", input.projectId, { requestId });
    }
  } catch {
    return jsonError("Engineering authorization is unavailable.", 503, "AUTHORIZATION_UNAVAILABLE");
  }
  if (!authorization.allowed) {
    const status = authorizationFailureStatus(authorization);
    return jsonError(authorization.reason, status, status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED");
  }
  if (evidenceAuthorization && !evidenceAuthorization.allowed) {
    const status = authorizationFailureStatus(evidenceAuthorization);
    return jsonError(evidenceAuthorization.reason, status, status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "EVIDENCE_WRITE_DENIED");
  }
  if (evidenceAuthorization && evidenceAuthorization.subject !== authorization.subject) {
    return jsonError("Execution and evidence-write identities do not match.", 401, "SESSION_IDENTITY_MISMATCH");
  }
  if (!authorization.subject) {
    return jsonError("Authenticated owner identity is unavailable.", 503, "IDENTITY_UNAVAILABLE");
  }

  const jobId = randomUUID();
  const executionRequest = buildDurableExecutionRequest(input, jobId);
  try {
    const store = new SupabaseExecutionJobStore(createServiceRoleClient());
    const submitted = await store.submit({
      request: executionRequest,
      ownerId: authorization.subject,
      idempotencyKey: input.idempotencyKey
    });
    const statusUrl = "/api/execution/" + submitted.job.id + "?projectId=" + encodeURIComponent(input.projectId);
    return NextResponse.json({
      ...submitted.job,
      idempotentReplay: !submitted.created,
      statusUrl,
      cancelUrl: statusUrl
    }, {
      status: submitted.created ? 202 : 200,
      headers: { "cache-control": "no-store", location: statusUrl }
    });
  } catch (error) {
    if (error instanceof IdempotencyConflictError) return jsonError(error.message, 409, "IDEMPOTENCY_CONFLICT");
    if (error instanceof ExecutionJobStoreError) return jsonError("Durable execution storage is unavailable.", 503, "EXECUTION_STORE_UNAVAILABLE");
    return jsonError("Execution request could not be durably queued.", 503, "EXECUTION_QUEUE_FAILED");
  }
}
