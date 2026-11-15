import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import {
  authorizationFailureStatus, authorizeSupabaseRequest
} from "../../../src/auth/supabase-service.js";
import type { ExecutionBackend } from "../../../src/execution/types.js";
import { createServiceRoleClient } from "../../../lib/supabase/service.js";
import {
  ExecutionJobStoreError, IdempotencyConflictError, SupabaseExecutionJobStore
} from "../../../src/execution/supabase-job-store.js";
import { buildDurableExecutionRequest, parseDurableExecutionInput } from "./durable.js";
import { jsonError } from "./response.js";

type DurableAuthorizationResult =
  | { allowed: true; ownerId: string }
  | { allowed: false; response: NextResponse };

async function authorizeDurableExecution(input: {
  projectId: string;
  backend: ExecutionBackend;
  requestId: string;
}): Promise<DurableAuthorizationResult> {
  let authorization: Awaited<ReturnType<typeof authorizeSupabaseRequest>>;
  let evidenceAuthorization: Awaited<ReturnType<typeof authorizeSupabaseRequest>> | undefined;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", input.projectId, { requestId: input.requestId });
    if (input.backend === "fea-worker" || input.backend === "cfd-worker") {
      evidenceAuthorization = await authorizeSupabaseRequest(
        "EVIDENCE.WRITE", input.projectId, { requestId: input.requestId }
      );
    }
  } catch {
    return { allowed: false, response: jsonError("Engineering authorization is unavailable.", 503, "AUTHORIZATION_UNAVAILABLE") };
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
  if (evidenceAuthorization && !evidenceAuthorization.allowed) {
    const status = authorizationFailureStatus(evidenceAuthorization);
    return {
      allowed: false,
      response: jsonError(
        evidenceAuthorization.reason,
        status,
        status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "EVIDENCE_WRITE_DENIED"
      )
    };
  }
  if (evidenceAuthorization && evidenceAuthorization.subject !== authorization.subject) {
    return {
      allowed: false,
      response: jsonError("Execution and evidence-write identities do not match.", 401, "SESSION_IDENTITY_MISMATCH")
    };
  }
  if (!authorization.subject) {
    return {
      allowed: false,
      response: jsonError("Authenticated owner identity is unavailable.", 503, "IDENTITY_UNAVAILABLE")
    };
  }
  return { allowed: true, ownerId: authorization.subject };
}

async function persistDurableExecution(input: {
  request: ReturnType<typeof buildDurableExecutionRequest>;
  ownerId: string;
  idempotencyKey: string;
  projectId: string;
}): Promise<NextResponse> {
  try {
    const store = new SupabaseExecutionJobStore(createServiceRoleClient());
    const submitted = await store.submit({
      request: input.request,
      ownerId: input.ownerId,
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
    if (error instanceof IdempotencyConflictError) {
      return jsonError(error.message, 409, "IDEMPOTENCY_CONFLICT");
    }
    if (error instanceof ExecutionJobStoreError) {
      return jsonError("Durable execution storage is unavailable.", 503, "EXECUTION_STORE_UNAVAILABLE");
    }
    return jsonError("Execution request could not be durably queued.", 503, "EXECUTION_QUEUE_FAILED");
  }
}

export async function handleDurableExecution(
  request: Request,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const parsed = parseDurableExecutionInput({
    body,
    idempotencyKey: request.headers.get("idempotency-key") ?? "",
    requestId
  });
  if (!parsed.ok) return jsonError(parsed.error, parsed.status, parsed.code);

  const execution = parsed.value;
  const authorization = await authorizeDurableExecution({
    projectId: execution.projectId,
    backend: execution.backend,
    requestId
  });
  if (!authorization.allowed) return authorization.response;

  const jobId = randomUUID();
  const executionRequest = buildDurableExecutionRequest({ execution, jobId });
  return persistDurableExecution({
    request: executionRequest,
    ownerId: authorization.ownerId,
    idempotencyKey: execution.idempotencyKey,
    projectId: execution.projectId
  });
}
