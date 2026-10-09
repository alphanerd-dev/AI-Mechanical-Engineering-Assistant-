import { describe, expect, it, vi } from "vitest";
import {
  ModelBackedTaskReasoningProposer,
  StaticModelReasoningGenerator,
  createDefaultReasoningFrameworkRegistry
} from "../src/reasoning-frameworks/index.js";
import { executeTaskReasoning } from "../src/task-graph/reasoning-execution.js";
import { routeTaskReasoning } from "../src/task-graph/reasoning.js";
import type { ModelReasoningGenerationRequest } from "../src/reasoning-frameworks/model-adapter.js";
import type { EngineeringTaskGraph } from "../src/task-graph/types.js";

const NOW = "2026-10-09T05:00:00.000Z";
const proposal = {
  status: "PROPOSED",
  assumptions: ["The supplied task goal is the current problem statement."],
  output: { nextStep: "List known facts and unknowns." },
  limitations: ["No engineering validation has been performed."],
  evidenceReferences: [],
  requiredGates: []
};

function makeRoutedGraph(): EngineeringTaskGraph {
  const graph: EngineeringTaskGraph = {
    id: "graph-1",
    projectId: "project-1",
    revision: 1,
    tasks: [{
      id: "task-1",
      projectId: "project-1",
      name: "Design review",
      goal: "Frame the design problem.",
      risk: "MEDIUM",
      input: {},
      status: "PROPOSED",
      createdAt: NOW,
      updatedAt: NOW
    }]
  };
  return routeTaskReasoning(graph, "task-1", {
    taskType: "novel-design",
    requestedFramework: "first-principles",
    requestedFrameworkVersion: "1.0.0",
    required: true,
    now: NOW
  }).graph;
}

describe("model-backed reasoning adapter", () => {
  it("passes pinned framework context to the model and persists only a validated advisory record", async () => {
    const generate = vi.fn(async (_request: ModelReasoningGenerationRequest) => proposal);
    const proposer = new ModelBackedTaskReasoningProposer({ generate });
    const result = await executeTaskReasoning(makeRoutedGraph(), "task-1", proposer, {
      now: NOW,
      recordId: "reasoning-model-1"
    });

    expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toMatchObject({
      task: { id: "task-1", goal: "Frame the design problem." },
      framework: { id: "first-principles", version: "1.0.0" },
      inputs: { task: "Frame the design problem." }
    });
    expect(generate.mock.calls[0][0].instructions).toContain("VERIFIED is forbidden");
    expect(result.record).toMatchObject({
      taskId: "task-1",
      projectId: "project-1",
      frameworkId: "first-principles",
      frameworkVersion: "1.0.0",
      status: "PROPOSED",
      validationStatus: "NOT_PERFORMED"
    });
    expect(result.graph.tasks[0].status).toBe("PROPOSED");
  });

  it("keeps malformed or verification-claiming model output behind the execution validator", async () => {
    const proposer = new ModelBackedTaskReasoningProposer(
      new StaticModelReasoningGenerator({ ...proposal, status: "VERIFIED" })
    );
    await expect(executeTaskReasoning(makeRoutedGraph(), "task-1", proposer, { now: NOW }))
      .rejects.toThrow(/VERIFIED is not allowed/);
  });

  it("does not let a model transport mutate the caller's task graph snapshot", async () => {
    const graph = makeRoutedGraph();
    const proposer = new ModelBackedTaskReasoningProposer({
      async generate(request) {
        (request.task as { name: string }).name = "mutated by provider";
        (request.inputs as Record<string, unknown>).task = "mutated by provider";
        return proposal;
      }
    });
    await executeTaskReasoning(graph, "task-1", proposer, { now: NOW, recordId: "isolated" });
    expect(graph.tasks[0].name).toBe("Design review");
    expect(graph.tasks[0].reasoning?.records).toEqual([]);
  });

  it("can be configured with a scoped registry without changing the provider contract", async () => {
    const registry = createDefaultReasoningFrameworkRegistry();
    const proposer = new ModelBackedTaskReasoningProposer(new StaticModelReasoningGenerator(proposal));
    const result = await executeTaskReasoning(makeRoutedGraph(), "task-1", proposer, {
      frameworkRegistry: registry,
      now: NOW
    });
    expect(result.record.frameworkVersion).toBe("1.0.0");
  });
});
