import { NextResponse } from "next/server";
import { CapabilityRegistry } from "../../../../src/capabilities/registry";
import { CapabilityRouter } from "../../../../src/capabilities/router";
import { ENGINEERING_CAPABILITIES } from "../../../../src/capabilities/catalog";
import { NumericalAnalysisProvider } from "../../../../src/providers/numerical";
import { EngineeringAgent } from "../../../../src/core/agent";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const authorization = await authorizeSupabaseRequest("TASK.EXECUTE");
  if (!authorization.allowed) {
    return NextResponse.json({ error: authorization.reason }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" && body.prompt.trim()
    ? body.prompt.trim()
    : "Design a shaft that transmits 5 kW at 1500 rpm.";

  const registry = new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  registry.register(new NumericalAnalysisProvider());
  const agent = new EngineeringAgent(new CapabilityRouter(registry));
  const result = agent.start(prompt);

  return NextResponse.json({
    project: result.project,
    intent: result.intent,
    torque: result.torque,
    gates: { cad: "BLOCKED_UNTIL_CRITICAL_INPUTS_RESOLVED" },
  });
}
