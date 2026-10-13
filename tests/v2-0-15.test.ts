import { describe, expect, it } from "vitest";
import { runV2_0_15BenchmarkSuite, createV2_0_15Router } from "../src/benchmarks/v2-0-15.js";

function asRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeDefined();
  expect(value).not.toBeNull();
  expect(typeof value).toBe("object");
  expect(Array.isArray(value)).toBe(false);
  return value as Record<string, unknown>;
}

function expectDecisionContract(output: unknown): void {
  const decision = asRecord(asRecord(output).decision);
  expect(decision).toHaveProperty("status");
  expect(decision).toHaveProperty("validationPassed");
  expect(decision).toHaveProperty("evidenceIds");
  expect(Array.isArray(decision.evidenceIds)).toBe(true);
  expect(Array.isArray(decision.metrics)).toBe(true);
  expect(decision.nextAction ?? decision.nextQuestion).toBeTruthy();
}

describe("V2.0.15 AI-native completion path acceptance gate", () => {
  it("passes all seven product acceptance cases", async () => {
    const report = await runV2_0_15BenchmarkSuite();
    expect(report.suiteId).toBe("engineering-ai-native-v2.0.15");
    expect(report.version).toBe("2.0.15");
    expect(report.cases).toHaveLength(7);
    expect(report.failed).toBe(0);
    expect(report.passRate).toBe(1);
  });

  it("enforces the decision-ready contract on success, needs-input and failure paths", async () => {
    const { router } = createV2_0_15Router();
    const requests = [
      "Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm.",
      "Design a shaft that transmits 5 kW at 1500 rpm. Proposed diameter is 30 mm.",
      "Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 10 mm.",
    ];
    const results = await Promise.all(requests.map((rawIntent, index) => router.execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: { projectId: `V2-0-15-CONTRACT-${index}`, rawIntent },
    })));
    for (const result of results) expectDecisionContract(result.output);
  });

  it("keeps the reference interpreter as structure extraction rather than engineering authority", async () => {
    const { router } = createV2_0_15Router();
    const result = await router.execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: {
        projectId: "V2-0-15-INVARIANT",
        rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm.",
      },
    });
    expect(result.success).toBe(true);
    const output = asRecord(result.output);
    const interpretation = asRecord(output.interpretation);
    const decision = asRecord(output.decision);
    expect(interpretation).not.toHaveProperty("torqueNm");
    expect(interpretation).not.toHaveProperty("minimumDiameterMm");
    expect(decision.metrics).toEqual(expect.arrayContaining([
      { key: "torqueNm", value: expect.closeTo(31.8333333333, 10), unit: "N·m" },
    ]));
    expect(decision.validationPassed).toBe(true);
  });

  it("reuses prior missing-input context across separate intent turns in the same session", async () => {
    const { router } = createV2_0_15Router();
    const first = await router.execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: {
        projectId: "V2-0-15-SESSION",
        sessionId: "shaft-session-1",
        rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm. Proposed diameter is 30 mm.",
      },
    });
    expect(first.success).toBe(true);
    expect(asRecord(first.output).status).toBe("NEEDS_INPUT");

    const second = await router.execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: {
        projectId: "V2-0-15-SESSION",
        sessionId: "shaft-session-1",
        rawIntent: "Bending moment is 80 N·m. Allowable shear stress is 55 MPa.",
      },
    });
    expect(second.success).toBe(true);
    const output = asRecord(second.output);
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(asRecord(asRecord(output.interpretation).extractedInputs)).toMatchObject({
      powerKw: 5,
      speedRpm: 1500,
      bendingMomentNm: 80,
      allowableShearStressMpa: 55,
      proposedDiameterMm: 30,
    });
  });

  it("does not create a second engineering execution path", async () => {
    const { router } = createV2_0_15Router();
    const result = await router.execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: {
        projectId: "V2-0-15-ROUTER",
        rawIntent: "Design a shaft that transmits 5 kW at 1500 rpm. Bending moment is 80 N·m. Allowable shear is 55 MPa. Proposed diameter is 30 mm.",
      },
    });
    const output = asRecord(result.output);
    const decision = asRecord(output.decision);
    const completion = asRecord(output.completion);
    expect(result.success).toBe(true);
    expect(asRecord(completion.validation).passed).toBe(true);
    expect(completion.evidence).toHaveLength(3);
    expect(decision.evidenceIds).toEqual(asRecord(completion.lineage).evidenceIds);
  });
});
