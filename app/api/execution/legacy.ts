import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../src/auth/supabase-service.js";
import { ExecutionBackendAdapter, ExecutionEngine } from "../../../src/execution/executor.js";
import { HttpPythonWorkerClient } from "../../../src/execution/http-python-worker.js";
import { PythonWorkerAdapter } from "../../../src/execution/python-worker.js";
import { SafeNumericalAdapter } from "../../../src/execution/safe-numerical.js";
import { isRecord } from "./durable.js";

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

export async function legacySynchronousPost(request: Request, body: Record<string, unknown>) {
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
