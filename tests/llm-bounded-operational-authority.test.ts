import { describe, expect, it, vi } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CapabilityRouter } from "../src/capabilities/router.js";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { V2_0_2_CAPABILITIES } from "../src/capabilities/v2-0-2.js";
import { V2_0_5_CAPABILITIES } from "../src/capabilities/v2-0-5.js";
import { NumericalAnalysisProvider } from "../src/providers/numerical.js";
import { TaskGraphExecutionProvider } from "../src/providers/task-execution.js";
import { BoundedAutonomyProvider } from "../src/providers/bounded-autonomy.js";
import { ModelBackedAgentActionPlanner, parseAgentActionPlan } from "../src/agents/action-planner.js";
import { runBoundedAutonomy } from "../src/orchestration/bounded-autonomy.js";
import { runModelDirectedAutonomy } from "../src/orchestration/model-directed-autonomy.js";
import type { EngineeringTask, EngineeringTaskGraph } from "../src/task-graph/types.js";
import type { AgentRunLimits, StructuredModelGenerator } from "../src/agents/runtime.js";

const stamp = "2026-11-08T00:00:00.000Z";

function graph(tasks: EngineeringTask[] = []): EngineeringTaskGraph {
  return { id: "TG-1", projectId: "P-1", revision: 1, tasks };
}

function task(overrides: Partial<EngineeringTask> = {}): EngineeringTask {
  return {
    id: "T-1",
    projectId: "P-1",
    name: "Calculate shaft torque",
    goal: "Calculate torque from transmitted power and rotational speed.",
    capability: "ANALYSIS.SHAFT_TORQUE",
    risk: "LOW",
    input: { powerKw: 5, speedRpm: 1500 },
    status: "PROPOSED",
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides
  };
}

function limits(overrides: Partial<AgentRunLimits> = {}): AgentRunLimits {
  return {
    maxSteps: 10,
    maxTaskExecutions: 3,
    maxDelegations: 0,
    maxRisk: "LOW",
    allowedCapabilities: ["ANALYSIS.SHAFT_TORQUE"],
    requireCapabilityAllowlist: true,
    allowTaskCreation: true,
    allowTaskUpdates: true,
    stopOnFailure: true,
    ...overrides
  };
}

function setup() {
  const registry = new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  registry.registerCatalog(V2_0_2_CAPABILITIES);
  registry.registerCatalog(V2_0_5_CAPABILITIES);
  registry.register(new NumericalAnalysisProvider());
  const router = new CapabilityRouter(registry);
  registry.register(new TaskGraphExecutionProvider(router));
  registry.register(new BoundedAutonomyProvider(router));
  return router;
}

describe("LLM bounded operational authority", () => {
  it("parses a strict model plan and rejects model-supplied approval or status fields", () => {
    const policy = limits();
    const valid = parseAgentActionPlan({
      baseGraphRevision: 1,
      actions: [{
        kind: "CREATE_TASK",
        name: "Calculate torque",
        goal: "Calculate torque from known power and speed.",
        capability: "ANALYSIS.SHAFT_TORQUE",
        risk: "LOW",
        input: { powerKw: 5, speedRpm: 1500 }
      }]
    }, policy, ["ANALYSIS.SHAFT_TORQUE"]);
    expect(valid.actions).toHaveLength(1);

    expect(() => parseAgentActionPlan({
      baseGraphRevision: 1,
      actions: [{
        kind: "CREATE_TASK",
        id: "model-picked-id",
        projectId: "P-OTHER",
        status: "READY",
        approvalGranted: true,
        name: "Unsafe task",
        goal: "Bypass the approval boundary.",
        capability: "ANALYSIS.SHAFT_TORQUE",
        risk: "LOW",
        input: { powerKw: 5, speedRpm: 1500 }
      }]
    }, policy, ["ANALYSIS.SHAFT_TORQUE"])).toThrow(/unsupported fields/);
  });

  it("lets the model create a task, request backend readiness, and execute only through the capability router", async () => {
    const router = setup();
    const generator: StructuredModelGenerator = {
      generateStructured: vi.fn(async () => ({
        baseGraphRevision: 1,
        actions: [
          {
            kind: "CREATE_TASK",
            name: "Calculate torque",
            goal: "Calculate the torque transmitted by a shaft.",
            capability: "ANALYSIS.SHAFT_TORQUE",
            risk: "LOW",
            input: { powerKw: 5, speedRpm: 1500 }
          },
          { kind: "REQUEST_READY", taskId: "HOST-TASK-1" },
          { kind: "EXECUTE_TASK", taskId: "HOST-TASK-1", stage: "ANALYSIS" }
        ]
      }))
    };
    const planner = new ModelBackedAgentActionPlanner(generator);
    const report = await runModelDirectedAutonomy({
      runId: "RUN-1",
      taskGraph: graph(),
      limits: limits(),
      createTaskId: () => "HOST-TASK-1",
      now: stamp
    }, planner, router);

    expect(generator.generateStructured).toHaveBeenCalledTimes(1);
    expect(report.status).toBe("COMPLETED");
    expect(report.taskExecutions).toBe(1);
    expect(report.finalGraph.tasks[0]).toMatchObject({
      id: "HOST-TASK-1",
      projectId: "P-1",
      status: "COMPLETED",
      capability: "ANALYSIS.SHAFT_TORQUE"
    });
    expect(report.finalGraph.tasks[0].approvalGranted).toBeUndefined();
    expect(report.actions.map(action => action.status)).toEqual(["SUCCESS", "SUCCESS", "SUCCESS"]);
  });

  it("requires human approval for pilot capabilities and never treats an LLM approval request as approval", async () => {
    const router = setup();
    const policy = limits({ allowedCapabilities: ["ANALYSIS.SHAFT_STATIC_DESIGN"], maxRisk: "MEDIUM" });
    const report = await runBoundedAutonomy({
      runId: "RUN-2",
      taskGraph: graph(),
      limits: policy,
      createTaskId: () => "HOST-TASK-2",
      now: stamp,
      actions: [{
        kind: "CREATE_TASK",
        name: "Preliminary shaft design",
        goal: "Size a shaft under bending and torsion.",
        capability: "ANALYSIS.SHAFT_STATIC_DESIGN",
        risk: "MEDIUM",
        input: {}
      }]
    }, router);

    expect(report.status).toBe("COMPLETED");
    expect(report.finalGraph.tasks[0].approvalRequired).toBe(true);
    expect(report.finalGraph.tasks[0].approvalGranted).toBeUndefined();
    const ready = await runBoundedAutonomy({
      runId: "RUN-3",
      taskGraph: report.finalGraph,
      limits: policy,
      now: stamp,
      actions: [{ kind: "REQUEST_READY", taskId: "HOST-TASK-2" }]
    }, router);
    expect(ready.status).toBe("WAITING_APPROVAL");
    expect(ready.taskExecutions).toBe(0);
  });

  it("invalidates previous approval and reasoning when an eligible task is updated", async () => {
    const router = setup();
    const original = task({ approvalRequired: true, approvalGranted: true });
    const report = await runBoundedAutonomy({
      runId: "RUN-4",
      taskGraph: graph([original]),
      limits: limits(),
      now: stamp,
      actions: [{
        kind: "UPDATE_TASK",
        taskId: "T-1",
        patch: { goal: "Recalculate torque using the revised power and speed inputs." }
      }]
    }, router);

    expect(report.status).toBe("COMPLETED");
    expect(report.finalGraph.tasks[0].status).toBe("PROPOSED");
    expect(report.finalGraph.tasks[0].approvalRequired).toBe(true);
    expect(report.finalGraph.tasks[0].approvalGranted).toBeUndefined();
  });

  it("refuses to update a READY task even when the model proposes a valid patch", async () => {
    const router = setup();
    const original = task({ status: "READY" });
    const report = await runBoundedAutonomy({
      runId: "RUN-5",
      taskGraph: graph([original]),
      limits: limits(),
      now: stamp,
      actions: [{
        kind: "UPDATE_TASK",
        taskId: "T-1",
        patch: { goal: "Change the approved task after readiness." }
      }]
    }, router);

    expect(report.status).toBe("FAILED");
    expect(report.finalGraph.revision).toBe(1);
    expect(report.finalGraph.tasks[0].goal).toBe(original.goal);
  });

  it("rejects a stale model plan before any mutation or execution", async () => {
    const router = setup();
    const generator: StructuredModelGenerator = {
      generateStructured: vi.fn(async () => ({
        baseGraphRevision: 99,
        actions: [{
          kind: "CREATE_TASK",
          name: "Calculate torque",
          goal: "Calculate torque.",
          capability: "ANALYSIS.SHAFT_TORQUE",
          risk: "LOW",
          input: { powerKw: 5, speedRpm: 1500 }
        }]
      }))
    };
    const report = await runModelDirectedAutonomy({
      runId: "RUN-6",
      taskGraph: graph(),
      limits: limits(),
      createTaskId: () => "HOST-TASK-6",
      now: stamp
    }, new ModelBackedAgentActionPlanner(generator), router);

    expect(report.status).toBe("FAILED");
    expect(report.finalGraph.tasks).toHaveLength(0);
    expect(report.stopReason).toContain("Model plan is stale");
  });

  it("fails closed when a model plan tries a capability outside the host allowlist", async () => {
    const policy = limits();
    expect(() => parseAgentActionPlan({
      baseGraphRevision: 1,
      actions: [{
        kind: "CREATE_TASK",
        name: "Run a solver",
        goal: "Run an unapproved simulation.",
        capability: "ANALYSIS.STATIC_STRUCTURAL",
        risk: "HIGH",
        input: {}
      }]
    }, policy, ["ANALYSIS.SHAFT_TORQUE"])).toThrow(/host-authorized capability allowlist/);
  });

  it("requires a host-owned, non-empty capability allowlist before model planning", async () => {
    const generator: StructuredModelGenerator = {
      generateStructured: vi.fn(async () => ({ baseGraphRevision: 1, actions: [{ kind: "STOP", reason: "stop" }] }))
    };
    const planner = new ModelBackedAgentActionPlanner(generator);
    await expect(planner.plan({
      runId: "RUN-7",
      taskGraph: graph(),
      limits: limits({ allowedCapabilities: undefined }),
      registeredCapabilities: []
    })).rejects.toThrow(/non-empty, host-enforced capability allowlist/);
    expect(generator.generateStructured).not.toHaveBeenCalled();
  });
});
