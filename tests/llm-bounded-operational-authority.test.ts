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

  it("lets the model create a task, then request backend readiness and execution using the host-assigned id", async () => {
    const router = setup();
    let planningCycle = 0;
    const generator: StructuredModelGenerator = {
      generateStructured: vi.fn(async () => {
        planningCycle += 1;
        if (planningCycle === 1) {
          return {
            baseGraphRevision: 1,
            actions: [{
              kind: "CREATE_TASK",
              name: "Calculate torque",
              goal: "Calculate the torque transmitted by a shaft.",
              capability: "ANALYSIS.SHAFT_TORQUE",
              risk: "LOW",
              input: { powerKw: 5, speedRpm: 1500 }
            }]
          };
        }
        return {
          baseGraphRevision: 2,
          actions: [
            { kind: "REQUEST_READY", taskId: "HOST-TASK-1" },
            { kind: "EXECUTE_TASK", taskId: "HOST-TASK-1", stage: "ANALYSIS" }
          ]
        };
      })
    };
    const planner = new ModelBackedAgentActionPlanner(generator);
    const policy = limits();
    const created = await runModelDirectedAutonomy({
      runId: "RUN-1",
      taskGraph: graph(),
      limits: policy,
      createTaskId: () => "HOST-TASK-1",
      now: stamp
    }, planner, router);

    expect(created.status).toBe("COMPLETED");
    expect(created.finalGraph.tasks[0]).toMatchObject({
      id: "HOST-TASK-1",
      projectId: "P-1",
      status: "PROPOSED",
      capability: "ANALYSIS.SHAFT_TORQUE"
    });

    const executed = await runModelDirectedAutonomy({
      runId: "RUN-1",
      taskGraph: created.finalGraph,
      limits: policy,
      now: stamp
    }, planner, router);

    expect(generator.generateStructured).toHaveBeenCalledTimes(2);
    expect(executed.status).toBe("COMPLETED");
    expect(executed.taskExecutions).toBe(1);
    expect(executed.finalGraph.tasks[0]).toMatchObject({
      id: "HOST-TASK-1",
      projectId: "P-1",
      status: "COMPLETED",
      capability: "ANALYSIS.SHAFT_TORQUE"
    });
    expect(executed.finalGraph.tasks[0].approvalGranted).toBeUndefined();
    expect(executed.actions.map(action => action.status)).toEqual(["SUCCESS", "SUCCESS"]);
  });

  it("rejects nested task input fields outside a registered capability input path", async () => {
    const registry = new CapabilityRegistry();
    registry.registerCapability({
      id: "TEST.NESTED_INPUT",
      domain: "analysis",
      purpose: "Test a nested capability input contract.",
      inputs: ["geometry.radiusMm"],
      outputs: ["result"],
      risk: "LOW",
      providers: ["test.nested"],
      status: "VERIFIED"
    });
    registry.register({
      id: "test.nested",
      capabilities: ["TEST.NESTED_INPUT"],
      execute: async request => ({
        capability: request.capability,
        provider: "test.nested",
        success: true,
        output: { accepted: true }
      })
    });
    const router = new CapabilityRouter(registry);
    const report = await runBoundedAutonomy({
      runId: "RUN-NESTED-INPUT",
      taskGraph: graph(),
      limits: limits({ allowedCapabilities: ["TEST.NESTED_INPUT"] }),
      createTaskId: () => "HOST-NESTED",
      now: stamp,
      actions: [{
        kind: "CREATE_TASK",
        name: "Create nested input task",
        goal: "Verify nested input contract enforcement.",
        capability: "TEST.NESTED_INPUT",
        risk: "LOW",
        input: { geometry: { radiusMm: 10, unregisteredDimension: 20 } }
      }]
    }, router);

    expect(report.status).toBe("FAILED");
    expect(report.finalGraph.tasks).toHaveLength(0);
    expect(report.stopReason).toContain("geometry.unregisteredDimension");
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
        input: {
          powerKw: 5,
          speedRpm: 1500,
          bearingSpanMm: 300,
          gearPositionFromLeftMm: 150,
          pitchDiameterMm: 100,
          pressureAngleDeg: 20,
          axialLoadN: 0,
          materialGrade: "STEEL",
          yieldStrengthMpa: 250,
          ultimateTensileStrengthMpa: 400,
          designFactor: 2,
          bendingStressFactorKb: 1,
          torsionalStressFactorKts: 1
        }
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

  it("rejects privileged fields injected directly into the backend task-update boundary", async () => {
    const router = setup();
    const unsafeAction = {
      kind: "UPDATE_TASK",
      taskId: "T-1",
      patch: { goal: "Try to remove the approval gate.", approvalRequired: false }
    } as unknown as import("../src/agents/runtime.js").AgentActionProposal;
    const report = await runBoundedAutonomy({
      runId: "RUN-UPDATE-GATE",
      taskGraph: graph([task({ approvalRequired: true })]),
      limits: limits(),
      now: stamp,
      actions: [unsafeAction]
    }, router);

    expect(report.status).toBe("FAILED");
    expect(report.finalGraph.revision).toBe(1);
    expect(report.finalGraph.tasks[0].approvalRequired).toBe(true);
    expect(report.stopReason).toContain("unsupported fields");
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

  it("re-gates a READY task when approval is requested before execution", async () => {
    const router = setup();
    const report = await runBoundedAutonomy({
      runId: "RUN-READY-APPROVAL",
      taskGraph: graph([task({ status: "READY" })]),
      limits: limits(),
      now: stamp,
      actions: [{
        kind: "REQUEST_APPROVAL",
        taskId: "T-1",
        reason: "A human review is required before execution."
      }]
    }, router);

    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.taskExecutions).toBe(0);
    expect(report.finalGraph.revision).toBe(2);
    expect(report.finalGraph.tasks[0].status).toBe("PROPOSED");
    expect(report.finalGraph.tasks[0].approvalRequired).toBe(true);
    expect(report.finalGraph.tasks[0].approvalGranted).toBeUndefined();
  });

  it("rejects control-plane capabilities even when present in the model host allowlist", () => {
    expect(() => parseAgentActionPlan({
      baseGraphRevision: 1,
      actions: [{
        kind: "CREATE_TASK",
        name: "Recursive agent task",
        goal: "Attempt to invoke bounded autonomy as an engineering task.",
        capability: "AGENT.RUN_BOUNDED",
        risk: "HIGH",
        input: {}
      }]
    }, limits({ maxRisk: "HIGH" }), ["AGENT.RUN_BOUNDED"])).toThrow(/control-plane capability/);
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
