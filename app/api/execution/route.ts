import { NextResponse } from "next/server";
import { ExecutionEngine } from "../../../src/execution/executor";
import { SafeNumericalAdapter } from "../../../src/execution/safe-numerical";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const capability = typeof body.capability === "string" ? body.capability : "";
  const backend = body.backend === "typescript-safe" ? body.backend : "typescript-safe";

  const engine = new ExecutionEngine([new SafeNumericalAdapter()]);
  const job = await engine.run({
    id: crypto.randomUUID(),
    capability,
    backend,
    inputs: typeof body.inputs === "object" && body.inputs ? body.inputs : {},
    requestedOutputs: Array.isArray(body.requestedOutputs) ? body.requestedOutputs : [],
    timeoutMs: 2000,
  });

  return NextResponse.json(job, { status: job.status === "SUCCEEDED" ? 200 : 422 });
}
