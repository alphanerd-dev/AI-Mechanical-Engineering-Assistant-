import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CapabilityRouter } from "../src/capabilities/router.js";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { V2_0_10_CAPABILITIES } from "../src/capabilities/v2-0-10.js";
import { V2_0_11_CAPABILITIES } from "../src/capabilities/v2-0-11.js";
import { V2_0_12_CAPABILITIES } from "../src/capabilities/v2-0-12.js";
import { V2_0_14_CAPABILITIES } from "../src/capabilities/v2-0-14.js";
import { V2_0_21_CAPABILITIES } from "../src/capabilities/v2-0-21.js";
import { V2_0_28_CAPABILITIES } from "../src/capabilities/v2-0-28.js";
import { NumericalAnalysisProvider } from "../src/providers/numerical.js";
import { ElectricalAnalysisProvider } from "../src/providers/electrical.js";
import { ThermalAnalysisProvider } from "../src/providers/thermal.js";
import { EngineeringCompletionProvider } from "../src/providers/engineering-completion.js";
import { ElectricalEngineeringCompletionProvider } from "../src/providers/electrical-completion.js";
import { ThermalEngineeringCompletionProvider } from "../src/providers/thermal-completion.js";
import { RiskAdaptiveExperienceProvider } from "../src/providers/experience.js";
import { EngineeringContextProvider } from "../src/providers/context.js";
import { AIEngineeringIntentProvider } from "../src/providers/ai-intent.js";
import { createDefaultDeterministicEngineeringIntentInterpreter } from "../src/intent/deterministic.js";
import { createDefaultEngineeringCompletionUnitRegistry } from "../src/completion/registry.js";

function createRouter(): CapabilityRouter {
  const registry = new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  registry.registerCatalog(V2_0_10_CAPABILITIES);
  registry.registerCatalog(V2_0_11_CAPABILITIES);
  registry.registerCatalog(V2_0_12_CAPABILITIES);
  registry.registerCatalog(V2_0_14_CAPABILITIES);
  registry.registerCatalog(V2_0_21_CAPABILITIES);
  registry.registerCatalog(V2_0_28_CAPABILITIES);

  const router = new CapabilityRouter(registry);
  registry.register(new NumericalAnalysisProvider());
  registry.register(new ElectricalAnalysisProvider());
  registry.register(new ThermalAnalysisProvider());
  registry.register(new RiskAdaptiveExperienceProvider());
  registry.register(new EngineeringContextProvider());
  registry.register(new EngineeringCompletionProvider(router));
  registry.register(new ElectricalEngineeringCompletionProvider(router));
  registry.register(new ThermalEngineeringCompletionProvider(router));
  registry.register(new AIEngineeringIntentProvider(
    router,
    createDefaultDeterministicEngineeringIntentInterpreter()
  ));
  return router;
}

describe("V2.0.28 cross-domain completion acceptance", () => {
  it("registers mechanical, electrical and thermal completion units behind the shared contract", () => {
    const ids = createDefaultEngineeringCompletionUnitRegistry().list().map((unit) => unit.id);
    expect(ids).toEqual(expect.arrayContaining([
      "ENGINEERING.COMPLETE_SHAFT",
      "ENGINEERING.COMPLETE_DC_LOAD",
      "ENGINEERING.COMPLETE_SENSIBLE_HEATING"
    ]));
  });

  it.each([
    {
      domain: "mechanical shaft",
      projectId: "cross-domain-shaft",
      rawIntent: "Design a shaft transmitting 5 kW at 1500 rpm with bending moment 80 N·m, allowable shear stress 55 MPa, and proposed diameter 30 mm.",
      completionUnit: "ENGINEERING.COMPLETE_SHAFT",
      expectedMetric: "torqueNm",
      expectedValue: 31.833333333333332
    },
    {
      domain: "DC electrical load",
      projectId: "cross-domain-electrical",
      rawIntent: "Calculate a DC electrical load at 24 V and 2 A with maximum allowable power 60 W.",
      completionUnit: "ENGINEERING.COMPLETE_DC_LOAD",
      expectedMetric: "powerW",
      expectedValue: 48
    },
    {
      domain: "thermal sensible heating",
      projectId: "cross-domain-thermal",
      rawIntent: "Calculate sensible heat duty with mass flow 0.2 kg/s, specific heat 4180 J/kgK, inlet temperature 20 C, outlet temperature 40 C, and maximum heat duty 20 kW.",
      completionUnit: "ENGINEERING.COMPLETE_SENSIBLE_HEATING",
      expectedMetric: "heatDutyKw",
      expectedValue: 16.72
    }
  ])("routes $domain through the common intent, validation and evidence boundary", async (scenario) => {
    const result = await createRouter().execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: { projectId: scenario.projectId, rawIntent: scenario.rawIntent }
    });

    expect(result.success).toBe(true);
    const output = result.output as {
      status: string;
      interpretation: { completionUnit?: string };
      completion: {
        status: string;
        validation: { passed: boolean } | null;
        decisionMetrics: { key: string; value: number; unit?: string }[];
        evidence: { status: string }[];
        lineage: { evidenceIds: string[] };
        approvalRequired: boolean;
      };
      decision: { validationPassed: boolean; evidenceIds: string[] };
    };

    expect(output.interpretation.completionUnit).toBe(scenario.completionUnit);
    expect(output.status).toBe("WAITING_APPROVAL");
    expect(output.completion.status).toBe("WAITING_APPROVAL");
    expect(output.completion.validation?.passed).toBe(true);
    expect(output.decision.validationPassed).toBe(true);
    expect(output.completion.approvalRequired).toBe(true);
    expect(output.completion.evidence).toHaveLength(3);
    expect(output.completion.lineage.evidenceIds).toHaveLength(3);
    expect(output.decision.evidenceIds).toEqual(output.completion.lineage.evidenceIds);
    expect(output.completion.decisionMetrics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: scenario.expectedMetric,
        value: expect.closeTo(scenario.expectedValue, 8)
      })
    ]));
  });

  it("requests the first missing thermal input instead of inventing values", async () => {
    const result = await createRouter().execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: {
        projectId: "cross-domain-thermal-missing",
        rawIntent: "Calculate sensible heat duty for a heating process with an inlet temperature of 20 C."
      }
    });

    expect(result.success).toBe(true);
    const output = result.output as {
      status: string;
      nextQuestion: string;
      completion?: unknown;
    };
    expect(output.status).toBe("NEEDS_INPUT");
    expect(output.nextQuestion).toBe("mass flow rate");
    expect(output.completion).toBeUndefined();
  });

  it("fails closed when thermal duty exceeds the explicit limit and emits no evidence", async () => {
    const result = await createRouter().execute({
      capability: "ENGINEERING.ENTER_FROM_INTENT",
      risk: "HIGH",
      input: {
        projectId: "cross-domain-thermal-limit",
        rawIntent: "Calculate sensible heat duty with mass flow 0.2 kg/s, specific heat 4180 J/kgK, inlet temperature 20 C, outlet temperature 40 C, and maximum heat duty 10 kW."
      }
    });

    expect(result.success).toBe(false);
    const output = result.output as {
      status: string;
      completion: {
        status: string;
        validation: { passed: boolean; dutyWithinLimit: boolean } | null;
        evidence: unknown[];
        artifacts: { informationStatus: string; evidenceIds: string[] }[];
      };
    };
    expect(output.status).toBe("FAILED");
    expect(output.completion.status).toBe("FAILED");
    expect(output.completion.validation).toMatchObject({
      passed: false,
      dutyWithinLimit: false
    });
    expect(output.completion.evidence).toHaveLength(0);
    expect(output.completion.artifacts[0].informationStatus).toBe("CALCULATED");
    expect(output.completion.artifacts[0].evidenceIds).toHaveLength(0);
  });
});
