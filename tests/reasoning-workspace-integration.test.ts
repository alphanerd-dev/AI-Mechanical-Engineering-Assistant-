import { describe, expect, it, vi } from "vitest";
import {
  createWorkspaceReasoningTask,
  proposeWorkspaceTaskReasoning,
  updateWorkspaceReasoningTaskInputs
} from "../src/workspace/reasoning.js";
import {
  ModelBackedTaskReasoningProposer,
  StaticModelReasoningGenerator,
  createDefaultReasoningFrameworkRegistry
} from "../src/reasoning-frameworks/index.js";
import type { EngineeringWorkspaceSnapshot } from "../src/workspace/types.js";

const NOW = "2026-10-09T08:00:00.000Z";
const registry = createDefaultReasoningFrameworkRegistry();

function makeWorkspace(): EngineeringWorkspaceSnapshot {
  return {
    schemaVersion: 1,
    id: "project-1",
    name: "Test Engineering Project",
    project: {
      id: "project-1",
      name: "Test Engineering Project",
      stage: "PROBLEM",
      status: "ACTIVE",
      requirements: [],
      assumptions: [],
      openQuestions: [],
      unresolvedRisks: [],
      events: []
    },
    taskGraph: { id: "graph-1", projectId: "project-1", revision: 1, tasks: [] },
    revision: 1,
    savedAt: NOW
  };
}

function createFirstPrinciplesTask(snapshot = makeWorkspace()) {
  return createWorkspaceReasoningTask(snapshot, {
    taskId: "task-1",
    name: "Frame the problem",
    goal: "Identify the known facts and constraints for a design task.",
    taskType: "novel-design",
    risk: "MEDIUM",
    uncertainty: "MEDIUM",
    requestedFramework: "first-principles",
    requestedFrameworkVersion: "1.0.0",
    input: {}
  }, { frameworkRegistry: registry, now: NOW });
}

const validProposal = {
  status: "PROPOSED",
  assumptions: ["The written task is the current problem statement."],
  output: { nextStep: "Separate facts, constraints, and unknowns." },
  limitations: ["No engineering validation has been performed."],
  evidenceReferences: [],
  requiredGates: []
};

describe("workspace controlled reasoning integration", () => {
  it("creates a task in the project graph and pins the selected framework version", () => {
    const result = createFirstPrinciplesTask();
    expect(result.task).toMatchObject({
      id: "task-1",
      projectId: "project-1",
      status: "PROPOSED",
      reasoning: {
        required: true,
        routingDecision: {
          status: "SELECTED",
          frameworkId: "first-principles",
          frameworkVersion: "1.0.0"
        },
        records: []
      }
    });
    expect(result.workspace.taskGraph.tasks).toHaveLength(1);
    expect(makeWorkspace().taskGraph.tasks).toHaveLength(0);
  });

  it("keeps tasks blocked until required framework inputs are supplied", () => {
    const routed = createWorkspaceReasoningTask(makeWorkspace(), {
      taskId: "task-2",
      name: "Investigate a recurring failure",
      goal: "Understand the repeated pump seal leak.",
      taskType: "failure-analysis",
      risk: "HIGH",
      uncertainty: "HIGH",
      requestedFramework: "five-whys",
      requestedFrameworkVersion: "1.0.0",
      input: {}
    }, { frameworkRegistry: registry, now: NOW });
    expect(routed.task.reasoning?.routingDecision).toMatchObject({
      status: "BLOCKED",
      frameworkId: "five-whys",
      frameworkVersion: "1.0.0",
      missingInputs: ["problem-statement"]
    });

    const proposer = { propose: vi.fn(async () => validProposal) };
    await expect(proposeWorkspaceTaskReasoning(routed.workspace, "task-2", proposer, {
      frameworkRegistry: registry,
      now: NOW
    })).rejects.toThrow(/selected, version-pinned framework/);
    expect(proposer.propose).not.toHaveBeenCalled();
  });

  it("re-routes after inputs are updated and does not keep stale reasoning records", async () => {
    const routed = createWorkspaceReasoningTask(makeWorkspace(), {
      taskId: "task-3",
      name: "Investigate a recurring failure",
      goal: "Understand the repeated pump seal leak.",
      taskType: "failure-analysis",
      risk: "HIGH",
      uncertainty: "HIGH",
      requestedFramework: "five-whys",
      requestedFrameworkVersion: "1.0.0",
      input: {}
    }, { frameworkRegistry: registry, now: NOW });

    const updated = updateWorkspaceReasoningTaskInputs(routed.workspace, "task-3", {
      "problem-statement": "Pump seal leaks after approximately two operating hours."
    }, { frameworkRegistry: registry, now: "2026-10-09T08:01:00.000Z" });
    expect(updated.task.reasoning?.routingDecision).toMatchObject({
      status: "SELECTED",
      frameworkId: "five-whys",
      frameworkVersion: "1.0.0"
    });
    expect(updated.task.reasoning?.routingDecision?.missingInputs).toEqual([]);
    expect(updated.task.reasoning?.records).toEqual([]);
  });

  it("attaches a valid model proposal without changing the task lifecycle status", async () => {
    const created = createFirstPrinciplesTask();
    const proposer = new ModelBackedTaskReasoningProposer(new StaticModelReasoningGenerator(validProposal));
    const result = await proposeWorkspaceTaskReasoning(created.workspace, "task-1", proposer, {
      frameworkRegistry: registry,
      now: "2026-10-09T08:02:00.000Z"
    });
    expect(result.record).toMatchObject({
      taskId: "task-1",
      projectId: "project-1",
      frameworkId: "first-principles",
      frameworkVersion: "1.0.0",
      status: "PROPOSED",
      validationStatus: "NOT_PERFORMED"
    });
    expect(result.task.status).toBe("PROPOSED");
    expect(result.task.reasoning?.records).toHaveLength(1);
    expect(created.workspace.taskGraph.tasks[0].reasoning?.records).toEqual([]);
  });

  it("rejects a verification claim without attaching any record", async () => {
    const created = createFirstPrinciplesTask();
    const proposer = new ModelBackedTaskReasoningProposer(
      new StaticModelReasoningGenerator({ ...validProposal, status: "VERIFIED" })
    );
    await expect(proposeWorkspaceTaskReasoning(created.workspace, "task-1", proposer, {
      frameworkRegistry: registry,
      now: "2026-10-09T08:02:00.000Z"
    })).rejects.toThrow(/VERIFIED is not allowed/);
    expect(created.workspace.taskGraph.tasks[0].reasoning?.records).toEqual([]);
  });
});
