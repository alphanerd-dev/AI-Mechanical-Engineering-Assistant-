import { NextResponse } from "next/server";
import { ExecutionEngine, ExecutionBackendAdapter } from "../../../src/execution/executor";
import { SafeNumericalAdapter } from "../../../src/execution/safe-numerical";
import { PythonWorkerAdapter } from "../../../src/execution/python-worker";
import { HttpPythonWorkerClient } from "../../../src/execution/http-python-worker";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../src/auth/supabase-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsedBody = await request.json().catch(() => ({}));
  const body = parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)
    ? parsedBody as Record<string, unknown>
    : {};

  let projectId: string | undefined;
  if (body.projectId !== undefined) {
    if (typeof body.projectId !== "string" || !body.projectId.trim()) {
      return NextResponse.json({ error: "projectId must be a non-empty string when provided." }, { status: 400 });
    }
    projectId = body.projectId.trim();
  }

  let authorization: Awaited<ReturnType<typeof authorizeSupabaseRequest>>;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
  } catch {
    // Authorization infrastructure errors must never fall through to execution.
    return NextResponse.json({ error: "Engineering authorization is unavailable." }, { status: 503 });
  }
  if (!authorization.allowed) { const status = authorizationFailureStatus(authorization); return NextResponse.json({ error: authorization.reason, code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED" }, { status }); }

  const capability = typeof body.capability === "string" ? body.capability : "";
  const backend = body.backend === "python-worker" ? "python-worker" : "typescript-safe";

  const adapters: ExecutionBackendAdapter[] = [new SafeNumericalAdapter()];
  if (backend === "python-worker" && process.env.PYTHON_WORKER_URL) {
    adapters.push(new PythonWorkerAdapter(
      new HttpPythonWorkerClient(
        process.env.PYTHON_WORKER_URL,
        fetch,
        process.env.PYTHON_WORKER_API_TOKEN
      )
    ));
  }

  const engine = new ExecutionEngine(adapters);
  const job = await engine.run({
    id: crypto.randomUUID(),
    capability,
    backend,
    inputs: typeof body.inputs === "object" && body.inputs !== null && !Array.isArray(body.inputs)
      ? body.inputs as Record<string, unknown>
      : {},
    requestedOutputs: Array.isArray(body.requestedOutputs) ? body.requestedOutputs : [],
    timeoutMs: backend === "python-worker" ? 30_000 : 2_000,
  });

  return NextResponse.json(job, { status: job.status === "SUCCEEDED" ? 200 : 422 });
}
