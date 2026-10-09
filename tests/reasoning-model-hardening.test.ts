import { describe, expect, it, vi } from "vitest";
import { executeTaskReasoning } from "../src/task-graph/reasoning-execution.js";
import { routeTaskReasoning } from "../src/task-graph/reasoning.js";
import type { TaskReasoningProposalRequest, TaskReasoningProposer } from "../src/task-graph/reasoning-execution.js";
import type { EngineeringTaskGraph } from "../src/task-graph/types.js";

const NOW = "2026-10-09T15:00:00.000Z";
const PROVENANCE = {
  mode: "MODEL_BACKED" as const,
  providerId: "openai-compatible-http",
  modelId: "test-model",
  deploymentRevision: "test-revision"
};

const validProposal = {
  status: "PROPOSED",
  assumptions: ["The written task is the current problem statement."],
  output: { nextStep: "Separate known facts from unknowns." },
  limitations: ["No engineering validation has been performed."],
  evidenceReferences: [] as string[],
  requiredGates: [] as string[]
};

function makeGraph(evidenceRequired = false): EngineeringTaskGraph {
  const graph: EngineeringTaskGraph = {
    id: "hardening-graph",
    projectId: "hardening-project",
    revision: 1,
    tasks: [{
      id: "hardening-task",
      projectId: "hardening-project",
      name: "Reasoning hardening acceptance",
      goal: "Create a bounded advisory plan without claiming engineering verification.",
      risk: "LOW",
      input: {},
      evidenceRequired,
      status: "PROPOSED",
      createdAt: NOW,
      updatedAt: NOW
    }]
  };
  return routeTaskReasoning(graph, "hardening-task", {
    taskType: "problem-framing",
    requestedFramework: "first-principles",
    requestedFrameworkVersion: "1.0.0",
    required: true,
    now: NOW
  }).graph;
}

function proposer(output: unknown): TaskReasoningProposer {
  return { propose: vi.fn(async () => output) };
}

describe("reasoning model hardening and evidence traceability", () => {
  it("fails closed when the model invents an evidence identifier", async () => {
    const graph = makeGraph();
    const malicious = {
      ...validProposal,
      evidenceReferences: ["VERIFIED-inspection-record-fabricated-001"]
    };
    const model = proposer(malicious);

    await expect(executeTaskReasoning(graph, "hardening-task", model, {
      now: NOW,
      recordId: "invented-evidence-must-not-persist",
      trustedEvidenceReferences: []
    })).rejects.toThrow(/outside the trusted evidence context/);

    expect(model.propose).toHaveBeenCalledTimes(1);
    expect(graph.tasks[0].reasoning?.records ?? []).toEqual([]);
    expect(graph.tasks[0].status).toBe("PROPOSED");
  });

  it("accepts only host-allowlisted references and never turns them into verified evidence", async () => {
    const graph = makeGraph(true);
    const result = await executeTaskReasoning(
      graph,
      "hardening-task",
      proposer({ ...validProposal, evidenceReferences: ["inspection-record-001"] }),
      {
        now: NOW,
        recordId: "allowlisted-reference",
        trustedEvidenceReferences: ["inspection-record-001"],
        provenance: PROVENANCE
      }
    );

    expect(result.record.evidenceReferences).toEqual(["inspection-record-001"]);
    expect(result.record.validationStatus).toBe("NOT_PERFORMED");
    expect(result.record.status).toBe("PROPOSED");
    expect(result.record.requiredGates).toContain("engineering-validation");
    expect(result.record.requiredGates).toContain("evidence-validation");
    expect(result.record.provenance).toEqual(PROVENANCE);
    expect(result.graph.tasks[0].status).toBe("PROPOSED");
    expect(graph.tasks[0].reasoning?.records ?? []).toEqual([]);
  });

  it("records provider identity from host configuration and rejects model-owned provenance", async () => {
    const graph = makeGraph();
    const result = await executeTaskReasoning(graph, "hardening-task", proposer(validProposal), {
      now: NOW,
      recordId: "host-provenance",
      provenance: PROVENANCE
    });
    expect(result.record.provenance).toEqual(PROVENANCE);

    const forged = { ...validProposal, provenance: { ...PROVENANCE, providerId: "attacker" } };
    await expect(executeTaskReasoning(graph, "hardening-task", proposer(forged), {
      now: NOW,
      recordId: "forged-provider"
    })).rejects.toThrow(/unsupported fields/);
    expect(graph.tasks[0].reasoning?.records ?? []).toEqual([]);
  });

  it("rejects malformed, privileged, or non-JSON model output without attaching a record", async () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const malformed: unknown[] = [
      null,
      [],
      { ...validProposal, status: "VERIFIED" },
      { ...validProposal, validationStatus: "VERIFIED" },
      { ...validProposal, projectId: "attacker-project" },
      { ...validProposal, assumptions: [42] },
      { ...validProposal, limitations: ["   "] },
      { ...validProposal, evidenceReferences: ["  "] },
      { ...validProposal, requiredGates: ["  "] },
      { ...validProposal, output: Number.NaN },
      { ...validProposal, output: circular },
      { ...validProposal, output: undefined }
    ];

    for (const [index, output] of malformed.entries()) {
      const graph = makeGraph();
      await expect(executeTaskReasoning(graph, "hardening-task", proposer(output), {
        now: NOW,
        recordId: `malformed-${index}`
      })).rejects.toThrow();
      expect(graph.tasks[0].reasoning?.records ?? []).toEqual([]);
      expect(graph.tasks[0].status).toBe("PROPOSED");
    }
  });

  it("does not let a proposer mutate the caller's task, framework, or input snapshots", async () => {
    const graph = makeGraph();
    const originalGoal = graph.tasks[0].goal;
    const maliciousProposer: TaskReasoningProposer = {
      async propose(request: TaskReasoningProposalRequest) {
        (request.task as { projectId: string }).projectId = "attacker-project";
        (request.framework as { id: string }).id = "attacker-framework";
        (request.inputs as Record<string, unknown>).task = "overwritten prompt";
        return validProposal;
      }
    };

    const result = await executeTaskReasoning(graph, "hardening-task", maliciousProposer, {
      now: NOW,
      recordId: "snapshot-isolation"
    });

    expect(graph.projectId).toBe("hardening-project");
    expect(graph.tasks[0].projectId).toBe("hardening-project");
    expect(graph.tasks[0].goal).toBe(originalGoal);
    expect(result.record.projectId).toBe("hardening-project");
    expect(result.record.taskId).toBe("hardening-task");
    expect(result.record.frameworkId).toBe("first-principles");
    expect(result.record.inputs.task).toBe(originalGoal);
    expect(result.graph.tasks[0].status).toBe("PROPOSED");
  });

  it("produces repeatable records for the same version-pinned context and deterministic response", async () => {
    const graph = makeGraph();
    const first = await executeTaskReasoning(graph, "hardening-task", proposer(validProposal), {
      now: NOW,
      recordId: "repeatable-record",
      provenance: PROVENANCE
    });
    const second = await executeTaskReasoning(graph, "hardening-task", proposer(validProposal), {
      now: NOW,
      recordId: "repeatable-record",
      provenance: PROVENANCE
    });

    expect(first.record).toEqual(second.record);
    expect(first.graph).toEqual(second.graph);
    expect(graph.tasks[0].reasoning?.records ?? []).toEqual([]);
  });

  it("rejects invalid host evidence or provenance before calling the model", async () => {
    const graph = makeGraph();
    const model = proposer(validProposal);
    await expect(executeTaskReasoning(graph, "hardening-task", model, {
      now: NOW,
      trustedEvidenceReferences: ["   "]
    })).rejects.toThrow(/non-empty identifiers/);
    await expect(executeTaskReasoning(graph, "hardening-task", model, {
      now: NOW,
      provenance: { ...PROVENANCE, modelId: "" }
    })).rejects.toThrow(/invalid provider identity/);
    expect(model.propose).not.toHaveBeenCalled();
  });
});
