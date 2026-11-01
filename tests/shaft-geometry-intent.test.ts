import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CapabilityRouter } from "../src/capabilities/router.js";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { V2_0_10_CAPABILITIES } from "../src/capabilities/v2-0-10.js";
import { V2_0_11_CAPABILITIES } from "../src/capabilities/v2-0-11.js";
import { V2_0_12_CAPABILITIES } from "../src/capabilities/v2-0-12.js";
import { V2_0_14_CAPABILITIES } from "../src/capabilities/v2-0-14.js";
import { V2_0_21_CAPABILITIES } from "../src/capabilities/v2-0-21.js";
import { NumericalAnalysisProvider } from "../src/providers/numerical.js";
import { EngineeringCompletionProvider } from "../src/providers/engineering-completion.js";
import { RiskAdaptiveExperienceProvider } from "../src/providers/experience.js";
import { EngineeringContextProvider } from "../src/providers/context.js";
import { EngineeringVerificationProvider } from "../src/providers/engineering-verification.js";
import { AIEngineeringIntentProvider } from "../src/providers/ai-intent.js";
import { DeterministicShaftIntentInterpreter } from "../src/intent/shaft.js";

const screenshotPrompt = [
  "Design a solid circular shaft to transmit 12 kW at 1450 rpm.",
  "The shaft is simply supported between two bearings 400 mm apart, with a spur gear mounted at the midpoint.",
  "The gear has a pitch diameter of 180 mm and transmits a tangential force with a pressure angle of 20 degrees.",
  "Assume the shaft is made of AISI 1020 steel (Sut = 420 MPa, Sy = 350 MPa).",
  "Use a design factor of 2.5 based on yield strength and apply the ASME elliptic criteria.",
  "Neglect axial forces and shock/impact factors for now.",
  "Provide required shaft diameter, maximum bending moment and torque, principal stresses and factor of safety."
].join(" ");

function createIntentRouter() {
  const registry = new CapabilityRegistry();
  registry.registerCatalog(V2_0_10_CAPABILITIES);
  registry.registerCatalog(V2_0_11_CAPABILITIES);
  registry.registerCatalog(V2_0_12_CAPABILITIES);
  registry.registerCatalog(V2_0_14_CAPABILITIES);
  registry.registerCatalog(V2_0_21_CAPABILITIES);
  registry.registerCatalog(ENGINEERING_CAPABILITIES);

  const router = new CapabilityRouter(registry);
  registry.register(new NumericalAnalysisProvider());
  registry.register(new EngineeringCompletionProvider(router));
  registry.register(new RiskAdaptiveExperienceProvider());
  registry.register(new EngineeringContextProvider());
  registry.register(new EngineeringVerificationProvider());
  registry.register(new AIEngineeringIntentProvider(router, new DeterministicShaftIntentInterpreter()));
  return router;
}

describe("geometry-derived shaft design from natural-language intent", () => {
  it("derives the bending moment and completes the screenshot scenario without requesting it", async () => {
    const result = await createIntentRouter().execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: {
        projectId: "shaft-geometry-regression",
        rawIntent: screenshotPrompt
      }
    });

    expect(result.success).toBe(true);
    const output = result.output as any;
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.nextQuestion).toBeUndefined();
    expect(output.interpretation.missingInputs).toEqual([]);
    expect(output.interpretation.extractedInputs).toMatchObject({
      powerKw: 12,
      speedRpm: 1450,
      bearingSpanMm: 400,
      gearPositionFromLeftMm: 200,
      pitchDiameterMm: 180,
      pressureAngleDeg: 20,
      materialGrade: "AISI 1020",
      yieldStrengthMpa: 350,
      ultimateTensileStrengthMpa: 420,
      designFactor: 2.5,
      axialLoadN: 0,
      bendingStressFactorKb: 1,
      torsionalStressFactorKts: 1
    });
    expect(output.interpretation.extractedInputs).not.toHaveProperty("candidateDiameterMm");
    expect(output.interpretation.extractedInputs).not.toHaveProperty("bendingMomentNm");

    const report = output.completion;
    expect(report.validation.passed).toBe(true);
    expect(report.validation.criterion).toBe("ASME_ELLIPTIC_STATIC_YIELD");
    expect(report.decisionMetrics).toEqual(expect.arrayContaining([
      { key: "maximumBendingMomentNm", value: expect.closeTo(93.44505, 3), unit: "N·m" },
      { key: "torqueNm", value: expect.closeTo(79.02866, 3), unit: "N·m" },
      { key: "minimumDiameterMm", value: expect.closeTo(20.34988, 3), unit: "mm" },
      { key: "preferredDiameterMm", value: 22, unit: "mm" },
      { key: "principalStress1Mpa", value: expect.closeTo(103.23078, 3), unit: "MPa" },
      { key: "principalStress2Mpa", value: expect.closeTo(-13.84090, 3), unit: "MPa" },
      { key: "achievedYieldFactorOfSafety", value: expect.closeTo(3.15880, 3), unit: "dimensionless" }
    ]));
    expect(report.evidence).toHaveLength(3);
    expect(report.artifacts).toHaveLength(1);
    expect(report.nextAction).toContain("fatigue");
    expect(report.nextAction).not.toMatch(/bending moment/i);
  });

  it("asks for gear position, not bending moment, when geometry is incomplete", async () => {
    const prompt = screenshotPrompt.replace("with a spur gear mounted at the midpoint", "with a spur gear mounted somewhere along the span");
    const result = await createIntentRouter().execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: { projectId: "shaft-geometry-missing-position", rawIntent: prompt }
    });

    expect(result.success).toBe(true);
    const output = result.output as any;
    expect(output.status).toBe("NEEDS_INPUT");
    expect(output.nextQuestion).toBe("gear position from the left bearing");
    expect(output.interpretation.missingInputs).toEqual(["gear position from the left bearing"]);
    expect(output.decision.validationPassed).toBe(false);
    expect(output.decision.evidenceIds).toEqual([]);
  });

  it("does not mistake a bearing span or gear pitch diameter for a proposed shaft diameter", async () => {
    const result = await createIntentRouter().execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: { projectId: "shaft-geometry-no-candidate", rawIntent: screenshotPrompt }
    });
    const output = result.output as any;
    expect(output.interpretation.extractedInputs).not.toHaveProperty("candidateDiameterMm");
    expect(output.completion.decisionMetrics).toEqual(expect.arrayContaining([
      { key: "candidateDiameterMm", value: 22, unit: "mm" }
    ]));
  });
});
