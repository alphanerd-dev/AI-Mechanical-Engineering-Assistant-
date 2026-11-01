import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CapabilityRouter } from "../src/capabilities/router.js";
import { NumericalAnalysisProvider } from "../src/providers/numerical.js";
import { EngineeringCompletionProvider } from "../src/providers/engineering-completion.js";
import { SHAFT_STATIC_DESIGN_CAPABILITY, type ShaftStaticDesignResult } from "../src/engineering/shaft-static-design.js";
import { EngineeringVerificationProvider } from "../src/providers/engineering-verification.js";
import { AuthenticatedIdentity } from "../src/auth/types.js";

function setup() {
  const registry = new CapabilityRegistry();
  registry.registerCatalog([
    {
      id: SHAFT_STATIC_DESIGN_CAPABILITY, domain: "analysis", purpose: "geometry-based shaft static-yield",
      inputs: ["powerKw", "speedRpm", "bearingSpanMm", "gearPositionFromLeftMm", "pitchDiameterMm",
        "pressureAngleDeg", "axialLoadN", "materialGrade", "yieldStrengthMpa",
        "ultimateTensileStrengthMpa", "designFactor", "bendingStressFactorKb", "torsionalStressFactorKts"],
      outputs: ["forces", "reactions", "bendingMoment", "minimumDiameterMm", "vonMisesStressMpa"],
      risk: "MEDIUM", providers: ["numerical-analysis"], status: "PILOT"
    },
    {
      id: "ENGINEERING.COMPLETE_SHAFT", domain: "orchestration", purpose: "geometry-based shaft static-yield completion",
      inputs: [], outputs: ["engineering_completion_report"], risk: "HIGH",
      providers: ["engineering-completion"], status: "PILOT"
    }
  ]);
  registry.register(new NumericalAnalysisProvider());
  registry.register(new EngineeringVerificationProvider());
  const router = new CapabilityRouter(registry);
  registry.register(new EngineeringCompletionProvider(router));
  return router;
}

const reviewer: AuthenticatedIdentity = {
  subject: "reviewer-1",
  roles: ["REVIEWER"],
  authenticatedAt: "2026-10-07T22:00:00.000Z"
};

function completeInput(projectId: string, candidateDiameterMm?: number) {
  return {
    projectId,
    powerKw: 12,
    speedRpm: 1450,
    bearingSpanMm: 400,
    gearPositionFromLeftMm: 200,
    pitchDiameterMm: 180,
    pressureAngleDeg: 20,
    axialLoadN: 0,
    materialGrade: "AISI 1020",
    yieldStrengthMpa: 350,
    ultimateTensileStrengthMpa: 420,
    designFactor: 2.5,
    bendingStressFactorKb: 1,
    torsionalStressFactorKts: 1,
    ...(candidateDiameterMm === undefined ? {} : { candidateDiameterMm })
  };
}

describe("V2.0.10 geometry-based shaft completion unit", () => {
  it("requests missing geometry/material data, never a user-entered bending moment", async () => {
    const result = await setup().execute({
      capability: "ENGINEERING.COMPLETE_SHAFT",
      risk: "HIGH",
      input: { projectId: "P-10", powerKw: 12, speedRpm: 1450 }
    });
    expect(result.success).toBe(true);
    const output = result.output as any;
    expect(output.status).toBe("BLOCKED");
    expect(output.missingInputs[0]).toBe("bearing span");
    expect(output.nextAction).toContain("Bending moment is calculated from the gear forces and bearing geometry");
    expect(output).not.toHaveProperty("completion");
  });

  it("derives gear forces and bending moment from the supplied midspan geometry", async () => {
    const result = await setup().execute({
      capability: "ENGINEERING.COMPLETE_SHAFT",
      risk: "HIGH",
      input: completeInput("P-10A")
    });
    expect(result.success).toBe(true);
    const report = result.output as any;
    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.validation.passed).toBe(true);
    expect(report.decisionMetrics).toEqual(expect.arrayContaining([
      { key: "torqueNm", value: expect.any(Number), unit: "N·m" },
      { key: "tangentialForceN", value: expect.any(Number), unit: "N" },
      { key: "radialForceN", value: expect.any(Number), unit: "N" },
      { key: "maximumBendingMomentNm", value: expect.any(Number), unit: "N·m" },
      { key: "minimumDiameterMm", value: expect.any(Number), unit: "mm" },
      { key: "vonMisesStressMpa", value: expect.any(Number), unit: "MPa" }
    ]));
    const calculation = report.artifacts[0].parameters.output as ShaftStaticDesignResult;
    expect(calculation.bendingMomentLocationMm).toBe(200);
    expect(calculation.maximumBendingMomentNm).toBeGreaterThan(0);
    expect(calculation.resultantTransverseForceN).toBeCloseTo(
      Math.hypot(calculation.tangentialForceN, calculation.radialForceN), 8
    );
    expect(report.artifacts[0].kind).toBe("CALCULATION_RESULT");
    expect(report.artifacts[0].validationStatus).toBe("PASS");
    expect(report.artifacts[0].informationStatus).toBe("CALCULATED");
    expect(report.evidence).toHaveLength(0);
    expect(report.approvalRequired).toBe(true);
    expect(report.approvalGranted).toBe(false);
    expect(report.nextAction).toContain("not an ASME elliptic result");
  });

  it("does not convert a supplied approval object into a human approval or verified evidence", async () => {
    const result = await setup().execute({
      capability: "ENGINEERING.COMPLETE_SHAFT",
      risk: "HIGH",
      input: {
        ...completeInput("P-10B"),
        approval: {
          identity: reviewer,
          reason: "Reviewed preliminary calculation."
        }
      }
    });
    expect(result.success).toBe(true);
    const report = result.output as any;
    expect(report.status).toBe("WAITING_APPROVAL");
    expect(report.approvalGranted).toBe(false);
    expect(report.evidence).toHaveLength(0);
    expect(report.artifacts[0].informationStatus).toBe("CALCULATED");
  });

  it("fails closed when the explicitly checked candidate diameter is too small", async () => {
    const result = await setup().execute({
      capability: "ENGINEERING.COMPLETE_SHAFT",
      risk: "HIGH",
      input: completeInput("P-10D", 10)
    });
    expect(result.success).toBe(false);
    const report = result.output as any;
    expect(report.status).toBe("FAILED");
    expect(report.validation.passed).toBe(false);
    expect(report.lineage.evidenceIds).toHaveLength(0);
    expect(report.nextAction).toContain("Do not accept the failing candidate");
  });
});
