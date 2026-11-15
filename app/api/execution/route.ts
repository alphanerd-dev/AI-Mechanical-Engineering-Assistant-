import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeSupabaseRequest } from "../../../src/auth/supabase-service.js";
import { createServiceRoleClient } from "../../../lib/supabase/service.js";
import { ExecutionJobStoreError, IdempotencyConflictError, SupabaseExecutionJobStore } from "../../../src/execution/supabase-job-store.js";
import { buildDurableExecutionRequest, isRecord, parseDurableExecutionInput } from "./durable.js";
import { legacySynchronousPost } from "./legacy.js";

export const runtime = "nodejs";

function jsonError(error: string, status: number, code?: string) {
  return NextResponse.json({ error, ...(code ? { code } : {}) }, {
    status, headers: { "cache-control": "no-store" }
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
  const executionRequest = buildDurableExecutionRequest({ execution: input, jobId });
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
