import { describe, expect, it } from "vitest";
import { parseManufacturingReadinessRequest } from "../app/api/manufacturing/services/readiness-request-schema";
import { parseManufacturingDecisionRequest } from "../app/api/manufacturing/services/decision-request-schema";

const projectId = "11111111-1111-4111-8111-111111111111";
function validAssessment() {
  return {
    releaseId: "release-2026-001",
    metrics: { solidCount: 1, volumeMm3: 1000, minWallThicknessMm: 2, watertight: true },
    dfmRules: [{ kind: "MIN_WALL_THICKNESS_MM", minimumMm: 1 }],
    process: "MACHINING",
    processPlan: {
      id: "plan-1", projectId, name: "Housing machining plan", partArtifactIds: ["cad-solid-1"],
      requirementIds: ["REQ-001"], operations: [{
        id: "op-1", sequence: 1, name: "Face mill", process: "MACHINING",
        acceptanceCriteria: ["Flatness within drawing tolerance"]
      }],
      status: "READY", assumptions: []
    },
    bom: {
      id: "bom-1", projectId, revision: "A",
      components: [{ partNumber: "P-001", name: "Housing", revision: "A", quantity: 1, unit: "pcs", artifactId: "cad-solid-1" }]
    },
    requiredArtifactIds: ["cad-solid-1"],
    inspection: {
      criterion: { id: "dim-1", name: "Bore diameter", characteristic: "Diameter", unit: "mm", nominal: 10, tolerance: 0.1, method: "Bore gauge" },
      result: { id: "result-1", criterionId: "dim-1", measuredValue: 10.02, unit: "mm" }
    }
  };
}

describe("manufacturing durable record request schemas", () => {
  it("accepts a well-formed deterministic readiness request", () => {
    expect(parseManufacturingReadinessRequest(validAssessment())).not.toBeNull();
  });

  it("rejects malformed process operations and unsupported DFM rules", () => {
    const malformedOperation = validAssessment();
    const operations = (malformedOperation.processPlan as unknown as { operations: Array<Record<string, unknown>> }).operations;
    operations[0].sequence = "first";
    expect(parseManufacturingReadinessRequest(malformedOperation)).toBeNull();
    const unsupportedRule = validAssessment();
    const rules = unsupportedRule.dfmRules as unknown as unknown[];
    rules[0] = { kind: "EXECUTE_MACHINE", command: "start" };
    expect(parseManufacturingReadinessRequest(unsupportedRule)).toBeNull();
  });

  it("accepts only explicit human decisions with valid project and assessment identities", () => {
    expect(parseManufacturingDecisionRequest({
      projectId, assessmentId: "22222222-2222-4222-8222-222222222222",
      decision: "APPROVED", comment: "Reviewed independently"
    })).not.toBeNull();
    expect(parseManufacturingDecisionRequest({
      projectId, assessmentId: "not-a-uuid", decision: "APPROVED"
    })).toBeNull();
  });
});
