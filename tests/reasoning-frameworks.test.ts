import { describe, expect, it } from "vitest";
import { getReasoningFramework, REASONING_FRAMEWORKS } from "../src/reasoning-frameworks/registry.js";
import { routeReasoningFramework } from "../src/reasoning-frameworks/router.js";
import { createFrameworkReasoningRecord, REASONING_RECORD_ADVISORY_LIMITATION } from "../src/reasoning-frameworks/records.js";
import {
  parseFrameworkManifest,
  parseSkillManifest,
  validateFrameworkReasoningRecord,
  validateFrameworkManifest,
  validateSkillManifest
} from "../src/reasoning-frameworks/validation.js";

describe("reasoning framework contracts", () => {
  it("provides versioned initial frameworks", () => {
    expect(REASONING_FRAMEWORKS.length).toBe(3);
    expect(REASONING_FRAMEWORKS.every((framework) => framework.version === "1.0.0")).toBe(true);
  });

  it("validates well-formed skill manifests using the schema", () => {
    const skill = {
      schemaVersion: 1,
      id: "hardware-innovation-engineer",
      version: "1.0.0",
      name: "Hardware Innovation Engineer",
      description: "A bounded hardware R&D skill.",
      domains: ["mechanical"],
      requiredInputs: ["problem"],
      outputs: ["concepts"],
      allowedCapabilities: ["research"],
      maximumRisk: "MEDIUM",
      requiresApproval: true
    };
    expect(validateSkillManifest(skill)).toEqual([]);
    expect(parseSkillManifest(skill)).toEqual(skill);
  });

  it("rejects malformed skill manifests and additional properties", () => {
    expect(validateSkillManifest({ schemaVersion: 1, id: "", unexpected: true }).length).toBeGreaterThan(0);
    expect(() => parseSkillManifest({ schemaVersion: 1, id: "" })).toThrow(/Invalid skill manifest/);
  });

  it("validates extensible, versioned framework manifest IDs", () => {
    const customManifest = {
      schemaVersion: 1,
      id: "systems-thinking",
      version: "1.2.0",
      name: "Systems Thinking",
      purpose: "Explore interdependencies and system-level effects.",
      suitableFor: ["systems-analysis"],
      requiredInputs: ["system-boundary"],
      outputKind: "REASONING_RECORD"
    };
    expect(validateFrameworkManifest(customManifest)).toEqual([]);
    expect(parseFrameworkManifest(customManifest)).toEqual(customManifest);
  });

  it("selects 5 Whys for failure investigation", () => {
    const result = routeReasoningFramework({
      taskType: "failure-analysis",
      risk: "MEDIUM",
      uncertainty: "MEDIUM",
      availableInputs: ["problem-statement"]
    });
    expect(result.status).toBe("SELECTED");
    expect(result.frameworkId).toBe("five-whys");
  });

  it("blocks selection when prerequisites are absent", () => {
    const result = routeReasoningFramework({
      taskType: "option-selection",
      risk: "LOW",
      uncertainty: "LOW",
      availableInputs: []
    });
    expect(result.status).toBe("BLOCKED");
    expect(result.missingInputs).toEqual(["alternatives", "criteria"]);
  });

  it("skips unnecessary framework overhead", () => {
    const result = routeReasoningFramework({
      taskType: "formatting",
      risk: "LOW",
      uncertainty: "LOW",
      availableInputs: []
    });
    expect(result.status).toBe("SKIPPED");
  });

  it("preserves validation and approval gates at high risk", () => {
    const result = routeReasoningFramework({
      taskType: "architecture-decision",
      risk: "HIGH",
      uncertainty: "HIGH",
      availableInputs: ["alternatives", "criteria"]
    });
    expect(result.status).toBe("SELECTED");
    expect(result.reasons.join(" ")).toMatch(/validation and approval gates remain mandatory/);
  });

  it("creates versioned advisory records without certifying correctness", () => {
    const record = createFrameworkReasoningRecord({
      recordId: "reasoning-001",
      createdAt: "2026-10-09T12:00:00.000Z",
      taskType: "failure-analysis",
      frameworkId: "five-whys",
      status: "PROPOSED",
      inputs: { "problem-statement": "A hose leaked." },
      assumptions: ["The reported leak location is accurate."],
      output: { candidateCause: "Possible seal damage" },
      limitations: ["The cause has not been physically inspected."],
      evidenceReferences: ["inspection-note-01"],
      requiredGates: ["independent-cause-verification", "engineering-approval"]
    });
    expect(record.frameworkVersion).toBe("1.0.0");
    expect(record.status).toBe("PROPOSED");
    expect(record.validationStatus).toBe("NOT_PERFORMED");
    expect(record.limitations).toContain(REASONING_RECORD_ADVISORY_LIMITATION);
    expect(validateFrameworkReasoningRecord(record)).toEqual([]);
    expect(getReasoningFramework("five-whys")).toBeDefined();
  });

  it("rejects records that claim verification or omit the advisory limitation", () => {
    const invalid = {
      schemaVersion: 1,
      recordId: "reasoning-002",
      createdAt: "2026-10-09T12:00:00.000Z",
      taskType: "failure-analysis",
      frameworkId: "five-whys",
      frameworkVersion: "1.0.0",
      status: "VERIFIED",
      inputs: {},
      assumptions: [],
      output: {},
      limitations: ["No tests have been performed."],
      evidenceReferences: [],
      validationStatus: "VERIFIED",
      requiredGates: []
    };
    expect(validateFrameworkReasoningRecord(invalid).length).toBeGreaterThan(0);
  });

  it("requires output for a proposed record", () => {
    expect(() => createFrameworkReasoningRecord({
      recordId: "reasoning-003",
      createdAt: "2026-10-09T12:00:00.000Z",
      taskType: "failure-analysis",
      frameworkId: "five-whys",
      status: "PROPOSED",
      inputs: { "problem-statement": "A hose leaked." },
      assumptions: [],
      limitations: [],
      evidenceReferences: [],
      requiredGates: []
    })).toThrow(/must include output/);
  });

  it("rejects invalid timestamps", () => {
    expect(() => createFrameworkReasoningRecord({
      recordId: "reasoning-004",
      createdAt: "not-a-time",
      taskType: "failure-analysis",
      frameworkId: "five-whys",
      status: "BLOCKED",
      inputs: {},
      assumptions: [],
      limitations: [],
      evidenceReferences: [],
      requiredGates: []
    })).toThrow(/valid date-time/);
  });
});
