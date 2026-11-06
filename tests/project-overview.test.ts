import { describe, expect, it } from "vitest";
import type { CalculationArtifact } from "../src/artifacts/calculation-artifact";
import type { ProjectState } from "../src/core/types";
import type { EngineeringTask, EngineeringTaskGraph } from "../src/task-graph/types";
import { deriveProjectOverview } from "../src/projects/project-overview";

const project: ProjectState = {
  id: "project-1", name: "Pump redesign", stage: "mechanical_design", status: "ACTIVE",
  requirements: [], assumptions: [], openQuestions: [], unresolvedRisks: [], events: [],
};

function task(status: EngineeringTask["status"]): EngineeringTask {
  return {
    id: "task-1", projectId: project.id, name: "Calculate pump", goal: "Calculate pump duty",
    risk: "LOW", input: {}, status, createdAt: "2026-11-01T10:00:00.000Z", updatedAt: "2026-11-01T10:01:00.000Z",
  };
}

function graph(status: EngineeringTask["status"]): EngineeringTaskGraph {
  return { id: "graph-1", projectId: project.id, revision: 2, tasks: [task(status)] };
}

function artifact(overrides: Partial<CalculationArtifact> = {}): CalculationArtifact {
  return {
    id: "artifact-1", projectId: project.id, kind: "CALCULATION_RESULT", schemaVersion: 1,
    name: "Pump hydraulic power", capability: "PUMP.HYDRAULIC_POWER", sourceRevision: 2, workspaceRevision: 3,
    createdBy: "engineer-1", createdAt: "2026-11-01T10:01:00.000Z", providerId: "deterministic-pump-provider", providerVersion: "1.0.0",
    inputs: {}, outputs: {}, inputSha256: "a".repeat(64), outputSha256: "b".repeat(64),
    executionStatus: "COMPLETED", validationStatus: "VALIDATED",
    validationReceipt: { id: "receipt-1", result: "PASS", validatorId: "pump-validator", validatorVersion: "1.0.0", checks: ["power positive"], warnings: [], inputSha256: "a".repeat(64), outputSha256: "b".repeat(64), validatedAt: "2026-11-01T10:02:00.000Z" },
    approvalRequired: true, approvalStatus: "WAITING_APPROVAL", verificationStatus: "VERIFIED", limitations: [],
    ...overrides,
  };
}

describe("persisted project overview summary", () => {
  it("does not infer execution, artifact inventory, validation or approval from an empty snapshot", () => {
    const summary = deriveProjectOverview(project, undefined, undefined);
    expect(summary.execution.state).toBe("NOT_RECORDED");
    expect(summary.artifactCount).toBeNull();
    expect(summary.validation.label).toBe("Not recorded");
    expect(summary.review.label).toBe("Not recorded");
    expect(summary.baseline).toBeNull();
  });

  it("keeps a running task separate from failed validation and pending human approval", () => {
    const summary = deriveProjectOverview(project, graph("RUNNING"), [artifact({ validationStatus: "FAILED", validationReceipt: { ...artifact().validationReceipt, result: "FAIL" }, approvalStatus: "WAITING_APPROVAL" })]);
    expect(summary.execution.state).toBe("RUNNING");
    expect(summary.validation.label).toBe("Validation failed");
    expect(summary.review.label).toBe("Awaiting approval");
  });

  it("does not equate task completion with verification or approval", () => {
    const summary = deriveProjectOverview(project, graph("COMPLETED"), []);
    expect(summary.execution.label).toBe("Task execution completed");
    expect(summary.execution.detail).toContain("Validation and human approval remain separate");
    expect(summary.validation.label).toBe("No artifacts");
    expect(summary.review.label).toBe("Not recorded");
  });

  it("exposes a baseline only when execution, validation receipt and verification all pass", () => {
    const verified = artifact();
    const summary = deriveProjectOverview(project, graph("VERIFIED"), [verified]);
    expect(summary.baseline?.id).toBe("artifact-1");
    expect(summary.review.label).toBe("Awaiting approval");
    expect(summary.validation.label).toBe("Validated artifacts");
  });

  it("uses a captured problem statement only when it exists in the event record", () => {
    const withObjective = { ...project, events: [{ id: "problem-1", timestamp: "2026-11-01T10:00:00.000Z", actor: "engineer-1", action: "PROBLEM_CAPTURED", input: { problemStatement: "Improve pump efficiency within the existing envelope." } }] };
    expect(deriveProjectOverview(withObjective).objective).toBe("Improve pump efficiency within the existing envelope.");
    expect(deriveProjectOverview(project).objective).toBeNull();
  });
});
