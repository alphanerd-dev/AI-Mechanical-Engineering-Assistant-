import { NextResponse } from "next/server";
import { CapabilityRegistry } from "../../../../src/capabilities/registry.js";
import { CapabilityRouter } from "../../../../src/capabilities/router.js";
import { ENGINEERING_CAPABILITIES } from "../../../../src/capabilities/catalog.js";
import { NumericalAnalysisProvider } from "../../../../src/providers/numerical.js";
import { EngineeringAgent } from "../../../../src/core/agent.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
    calculation: result.calculation,
    gates: { cad: "BLOCKED_UNTIL_CRITICAL_INPUTS_RESOLVED" },
  });
}
