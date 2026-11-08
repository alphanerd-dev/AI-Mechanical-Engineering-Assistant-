import type { CapabilityRouter } from "../capabilities/router.js";
import { parseAgentActionPlan, type AgentActionPlanner } from "../agents/action-planner.js";
import type { BoundedAutonomyRequest, BoundedAutonomyReport } from "./bounded-autonomy.js";
import { runBoundedAutonomy } from "./bounded-autonomy.js";

/**
 * Host-controlled bridge from a model-generated action plan to the existing
 * bounded execution engine. The model receives only registered contracts
 * explicitly named by the host policy; every proposal is re-parsed and
 * revalidated by the backend before it mutates state or executes a capability.
 */
export async function runModelDirectedAutonomy(
  request: Omit<BoundedAutonomyRequest, "actions">,
  planner: AgentActionPlanner,
  router: CapabilityRouter
): Promise<BoundedAutonomyReport> {
  const allowed = request.limits.allowedCapabilities;
  if (request.limits.requireCapabilityAllowlist !== true || !allowed || allowed.length === 0) {
    throw new Error("Model-directed autonomy requires a non-empty host-enforced capability allowlist.");
  }
  const registeredCapabilities = allowed.map((id) => {
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

  const proposedPlan = await planner.plan({
    runId: request.runId,
    taskGraph: structuredClone(request.taskGraph),
    limits: structuredClone(request.limits),
    registeredCapabilities: structuredClone(registeredCapabilities)
  });
  // Enforce the parser at the final backend boundary even when a planner
  // implementation is injected, mocked or replaced by another model vendor.
  const plan = parseAgentActionPlan(proposedPlan, request.limits, allowed);
  if (plan.baseGraphRevision !== request.taskGraph.revision) {
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

  return runBoundedAutonomy({
    ...request,
    actions: plan.actions
  }, router);
}
