import { NextResponse } from "next/server";
import { ExecutionEngine, ExecutionBackendAdapter } from "../../../src/execution/executor";
import { SafeNumericalAdapter } from "../../../src/execution/safe-numerical";
import { PythonWorkerAdapter } from "../../../src/execution/python-worker";
import { HttpPythonWorkerClient } from "../../../src/execution/http-python-worker";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const capability = typeof body.capability === "string" ? body.capability : "";
  const backend = body.backend === "python-worker" ? "python-worker" : "typescript-safe";

  const adapters:ExecutionBackendAdapter[] = [new SafeNumericalAdapter()];
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
    inputs: typeof body.inputs === "object" && body.inputs ? body.inputs : {},
    requestedOutputs: Array.isArray(body.requestedOutputs) ? body.requestedOutputs : [],
    timeoutMs: backend === "python-worker" ? 30_000 : 2_000,
  });

  return NextResponse.json(job, { status: job.status === "SUCCEEDED" ? 200 : 422 });
}
