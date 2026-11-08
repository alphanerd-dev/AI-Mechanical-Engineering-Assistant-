import type { CapabilityDefinition } from "../core/types.js";
import type { CapabilityRouter } from "../capabilities/router.js";
import { parseAgentActionPlan, type AgentActionPlan, type AgentActionPlanner } from "../agents/action-planner.js";
import type { BoundedAutonomyRequest, BoundedAutonomyReport } from "./bounded-autonomy.js";
import { runBoundedAutonomy } from "./bounded-autonomy.js";

type ModelDirectedRequest = Omit<BoundedAutonomyRequest, "actions">;

function resolveAllowedCapabilities(
  request: ModelDirectedRequest,
  router: CapabilityRouter
): CapabilityDefinition[] {
  const allowed = request.limits.allowedCapabilities;
  if (request.limits.requireCapabilityAllowlist !== true || !allowed?.length) {
    throw new Error("Model-directed autonomy requires a non-empty host-enforced capability allowlist.");
  }

  return allowed.map((id) => {
    const definition = router.getDefinition(id);
    if (!definition) throw new Error("Host allowlist references an unregistered capability: " + id + ".");
    if (definition.status === "BLOCKED" || definition.status === "DEPRECATED") {
      throw new Error("Host allowlist references a blocked or deprecated capability: " + id + ".");
    }
    if (!router.hasExecutableProvider(id)) {
      throw new Error("Host allowlist references a capability without an executable provider: " + id + ".");
    }
    return definition;
  });
}

async function createValidatedPlan(
  request: ModelDirectedRequest,
  planner: AgentActionPlanner,
  capabilities: readonly CapabilityDefinition[]
): Promise<AgentActionPlan> {
  const proposal = await planner.plan({
    runId: request.runId,
    taskGraph: structuredClone(request.taskGraph),
    limits: structuredClone(request.limits),
    registeredCapabilities: structuredClone(capabilities)
  });
  // This remains a backend boundary even for injected/non-model planner implementations.
  return parseAgentActionPlan(proposal, request.limits, request.limits.allowedCapabilities ?? []);
}

function stalePlanReport(request: ModelDirectedRequest, plan: AgentActionPlan): BoundedAutonomyReport {
  return {
    runId: request.runId,
    projectId: request.taskGraph.projectId,
    initialGraphRevision: request.taskGraph.revision,
    finalGraph: structuredClone(request.taskGraph),
    status: "FAILED",
    steps: 0,
    taskExecutions: 0,
    delegations: 0,
    actions: [],
    evidenceIds: [],
    artifactIds: [],
    stopReason: "Model plan is stale: base graph revision " + plan.baseGraphRevision +
      " does not match current revision " + request.taskGraph.revision + "."
  };
}

/**
 * Host-controlled bridge from a model-generated action plan to the existing
 * bounded execution engine. The model receives only registered contracts
 * explicitly named by the host policy; every proposal is re-parsed and
 * revalidated by the backend before it mutates state or executes a capability.
 */
export async function runModelDirectedAutonomy(
  request: ModelDirectedRequest,
  planner: AgentActionPlanner,
  router: CapabilityRouter
): Promise<BoundedAutonomyReport> {
  const capabilities = resolveAllowedCapabilities(request, router);
  const plan = await createValidatedPlan(request, planner, capabilities);
  if (plan.baseGraphRevision !== request.taskGraph.revision) return stalePlanReport(request, plan);
  return runBoundedAutonomy({ ...request, actions: plan.actions }, router);
}
