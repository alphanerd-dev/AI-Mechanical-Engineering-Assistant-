import { describe, expect, it } from "vitest";
import {
  createDefaultReasoningFrameworkRegistry,
  InMemoryReasoningFrameworkRegistry,
  InMemorySkillManifestRegistry,
  createFrameworkReasoningRecord,
  parseFrameworkReasoningRecord
} from "../src/reasoning-frameworks/index.js";
import {
  appendTaskReasoningRecord,
  assignTaskSkillManifest,
  evaluateTaskReady,
  routeTaskReasoning,
  transitionTask,
  validateEngineeringTaskGraph
} from "../src/task-graph/index.js";
import type { EngineeringTaskGraph } from "../src/task-graph/types.js";
import { ENGINEERING_WORKSPACE_SCHEMA_VERSION, type EngineeringWorkspaceSnapshot } from "../src/workspace/types.js";
import { deserializeEngineeringWorkspaceSnapshot, serializeEngineeringWorkspaceSnapshot } from "../src/workspace/validation.js";

const NOW = "2026-10-09T04:00:00.000Z";

function createGraph(options: { capability?: string; risk?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" } = {}): EngineeringTaskGraph {
  return {
    id: "graph-1",
    projectId: "project-1",
    revision: 1,
    tasks: [{
      id: "task-1",
      projectId: "project-1",
      name: "Define shaft design approach",
      goal: "Develop a preliminary approach for a shaft that transmits the stated power.",
      ...(options.capability ? { capability: options.capability } : {}),
      risk: options.risk ?? "MEDIUM",
      input: { powerKw: 5, speedRpm: 1500 },
      status: "PROPOSED",
      createdAt: NOW,
      updatedAt: NOW
    }]
  };
}

function createSkill(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: "engineering-rd",
    version: "1.0.0",
    name: "Engineering R&D",
    description: "A bounded skill for structured engineering analysis and design planning.",
    domains: ["mechanical", "product-development"],
    requiredInputs: ["task"],
    outputs: ["analysis", "assumptions", "verification-plan"],
    allowedCapabilities: ["ANALYSIS.SHAFT_SIZE"],
    maximumRisk: "MEDIUM",
    requiresApproval: true,
    ...overrides
  };
}

function proposedRecord(frameworkId: string, frameworkVersion: string, taskId = "task-1", projectId = "project-1") {
  const frameworkRegistry = createDefaultReasoningFrameworkRegistry();
  return createFrameworkReasoningRecord({
    recordId: `record-${frameworkId}-${frameworkVersion}`,
    createdAt: NOW,
    projectId,
    taskId,
    taskType: "novel-design",
    frameworkId,
    frameworkVersion,
    status: "PROPOSED",
    inputs: { task: "Develop a preliminary shaft design approach." },
    assumptions: ["The stated power and speed are the current design inputs."],
    output: { nextStep: "List known quantities and derived constraints." },
    limitations: ["No design calculations or verification have been performed."],
    evidenceReferences: [],
    requiredGates: ["deterministic-analysis", "engineering-validation"]
  }, frameworkRegistry);
}

describe("reasoning-framework integration with task graphs", () => {
  it("registers versioned skill manifests and returns isolated copies", () => {
    const registry = new InMemorySkillManifestRegistry();
    registry.register(createSkill());
    expect(registry.get("engineering-rd", "1.0.0")?.version).toBe("1.0.0");
    expect(registry.list()).toHaveLength(1);
    expect(() => registry.register(createSkill())).toThrow(/already registered/);

    const retrieved = registry.get("engineering-rd", "1.0.0")!;
    retrieved.allowedCapabilities.push("CAD.CREATE_PART");
    expect(registry.get("engineering-rd", "1.0.0")?.allowedCapabilities).toEqual(["ANALYSIS.SHAFT_SIZE"]);
  });

  it("pins the exact registered skill to task state and adds approval without granting it", () => {
    const registry = new InMemorySkillManifestRegistry([createSkill()]);
    const graph = createGraph({ capability: "ANALYSIS.SHAFT_SIZE" });
    const next = assignTaskSkillManifest(graph, "task-1", "engineering-rd", "1.0.0", registry, NOW);
    const task = next.tasks[0];

    expect(next.revision).toBe(2);
    expect(task.reasoning?.skillManifest?.version).toBe("1.0.0");
    expect(task.approvalRequired).toBe(true);
    expect(task.approvalGranted).toBeUndefined();
    expect(validateEngineeringTaskGraph(next)).toEqual([]);
  });

  it("rejects assigning a skill outside its declared capability or risk boundary", () => {
    const registry = new InMemorySkillManifestRegistry([createSkill()]);
    expect(() => assignTaskSkillManifest(createGraph({ capability: "CAD.CREATE_PART" }), "task-1", "engineering-rd", "1.0.0", registry, NOW))
      .toThrow(/outside the skill's allowedCapabilities/);
    expect(() => assignTaskSkillManifest(createGraph({ capability: "ANALYSIS.SHAFT_SIZE", risk: "HIGH" }), "task-1", "engineering-rd", "1.0.0", registry, NOW))
      .toThrow(/maximum risk/);
  });

  it("routes a task and records the selection without executing or changing task status", () => {
    const graph = createGraph();
    const result = routeTaskReasoning(graph, "task-1", {
      taskType: "novel-design",
      requestedFramework: "first-principles",
      required: true,
      now: NOW
    });
    expect(result.decision).toMatchObject({ status: "SELECTED", frameworkId: "first-principles", frameworkVersion: "1.0.0" });
    expect(result.graph.revision).toBe(2);
    expect(result.graph.tasks[0].status).toBe("PROPOSED");
    expect(result.graph.tasks[0].reasoning?.required).toBe(true);
    expect(result.graph.tasks[0].reasoning?.records).toEqual([]);
    expect(validateEngineeringTaskGraph(result.graph)).toEqual([]);
  });

  it("supports a registered custom framework through the same router", () => {
    const registry = createDefaultReasoningFrameworkRegistry();
    registry.register({
      schemaVersion: 1,
      id: "systems-thinking",
      version: "1.2.0",
      name: "Systems Thinking",
      purpose: "Identify system boundaries and interdependencies.",
      suitableFor: ["systems-analysis"],
      requiredInputs: ["system-boundary"],
      outputKind: "REASONING_RECORD"
    });
    const graph = createGraph();
    graph.tasks[0].input["system-boundary"] = "shaft, coupling, bearings, and load";
    const result = routeTaskReasoning(graph, "task-1", {
      taskType: "systems-analysis",
      requestedFramework: "systems-thinking",
      requestedFrameworkVersion: "1.2.0",
      frameworkRegistry: registry,
      now: NOW
    });
    expect(result.decision).toMatchObject({ status: "SELECTED", frameworkId: "systems-thinking", frameworkVersion: "1.2.0" });
  });

  it("blocks an explicitly requested framework when its required inputs are absent", () => {
    const result = routeTaskReasoning(createGraph(), "task-1", {
      taskType: "option-selection",
      requestedFramework: "weighted-decision-matrix",
      required: true,
      now: NOW
    });
    expect(result.decision.status).toBe("BLOCKED");
    expect(result.decision.missingInputs).toEqual(["alternatives", "criteria"]);
    expect(evaluateTaskReady(result.graph, "task-1").ready).toBe(false);
  });

  it("requires a matching proposed record before a reasoning-gated task can become ready", () => {
    const routed = routeTaskReasoning(createGraph({ capability: "ANALYSIS.SHAFT_SIZE" }), "task-1", {
      taskType: "novel-design",
      requestedFramework: "first-principles",
      required: true,
      now: NOW
    });
    expect(evaluateTaskReady(routed.graph, "task-1").reasons).toContain(
      "Required reasoning record is missing; create a PROPOSED record before readiness."
    );
    expect(() => transitionTask(routed.graph, "task-1", "READY", NOW)).toThrow(/Required reasoning record is missing/);

    const record = proposedRecord("first-principles", "1.0.0");
    const withRecord = appendTaskReasoningRecord(routed.graph, "task-1", record, NOW);
    expect(withRecord.tasks[0].reasoning?.records?.[0]).toMatchObject({
      projectId: "project-1",
      taskId: "task-1",
      frameworkId: "first-principles",
      frameworkVersion: "1.0.0",
      validationStatus: "NOT_PERFORMED"
    });
    expect(evaluateTaskReady(withRecord, "task-1").ready).toBe(true);
    expect(transitionTask(withRecord, "task-1", "READY", NOW).tasks[0].status).toBe("READY");
    expect(validateEngineeringTaskGraph(withRecord)).toEqual([]);
  });

  it("refuses mismatched framework versions and cross-task record attachments", () => {
    const routed = routeTaskReasoning(createGraph(), "task-1", {
      taskType: "novel-design",
      requestedFramework: "first-principles",
      now: NOW
    });
    const wrongVersion = proposedRecord("first-principles", "1.0.0", "other-task");
    expect(() => appendTaskReasoningRecord(routed.graph, "task-1", wrongVersion, NOW)).toThrow(/taskId does not match/);

    const customRegistry = new InMemoryReasoningFrameworkRegistry();
    customRegistry.register({
      schemaVersion: 1,
      id: "first-principles",
      version: "2.0.0",
      name: "First-Principles Thinking",
      purpose: "Different major version used to test pinning.",
      suitableFor: ["problem-framing"],
      requiredInputs: ["task"],
      outputKind: "REASONING_RECORD"
    });
    const wrongFrameworkVersion = createFrameworkReasoningRecord({
      recordId: "wrong-version",
      createdAt: NOW,
      taskType: "novel-design",
      frameworkId: "first-principles",
      frameworkVersion: "2.0.0",
      status: "PROPOSED",
      inputs: { task: "Test." },
      assumptions: [],
      output: { candidate: "test" },
      limitations: [],
      evidenceReferences: [],
      requiredGates: []
    }, customRegistry);
    expect(() => appendTaskReasoningRecord(routed.graph, "task-1", wrongFrameworkVersion, NOW)).toThrow(/does not match/);
  });

  it("preserves task-linked reasoning records through workspace serialization", () => {
    const routed = routeTaskReasoning(createGraph(), "task-1", {
      taskType: "novel-design",
      requestedFramework: "first-principles",
      required: true,
      now: NOW
    });
    const graph = appendTaskReasoningRecord(
      routed.graph,
      "task-1",
      proposedRecord("first-principles", "1.0.0"),
      NOW
    );
    const snapshot: EngineeringWorkspaceSnapshot = {
      schemaVersion: ENGINEERING_WORKSPACE_SCHEMA_VERSION,
      id: "workspace-1",
      name: "Reasoning integration test",
      project: {
        id: "project-1",
        name: "Test project",
        stage: "DESIGN",
        status: "ACTIVE",
        requirements: [],
        assumptions: [],
        openQuestions: [],
        unresolvedRisks: [],
        events: []
      },
      taskGraph: graph,
      revision: 1,
      savedAt: NOW
    };
    const restored = deserializeEngineeringWorkspaceSnapshot(serializeEngineeringWorkspaceSnapshot(snapshot));
    expect(restored.taskGraph.tasks[0].reasoning?.records?.[0].recordId).toBe("record-first-principles-1.0.0");
    expect(restored.taskGraph.tasks[0].reasoning?.records?.[0].taskId).toBe("task-1");
  });

  it("parses record snapshots without allowing them to claim verification", () => {
    const record = proposedRecord("first-principles", "1.0.0");
    expect(parseFrameworkReasoningRecord(record).validationStatus).toBe("NOT_PERFORMED");
    expect(() => parseFrameworkReasoningRecord({ ...record, status: "VERIFIED", validationStatus: "VERIFIED" }))
      .toThrow(/Invalid reasoning record/);
  });
});
