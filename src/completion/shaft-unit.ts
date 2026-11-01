import { randomUUID } from "node:crypto";
import { CapabilityRouter } from "../capabilities/router.js";
import type { EngineeringTaskGraph } from "../task-graph/types.js";
import type { EngineeringArtifact } from "../artifacts/engineering-artifacts.js";
import type { ProjectState, Requirement } from "../core/types.js";
import {
  SHAFT_STATIC_DESIGN_CAPABILITY,
  type ShaftStaticDesignInput,
  type ShaftStaticDesignResult
} from "../engineering/shaft-static-design.js";
import { completeShaftEngineeringUnit } from "./shaft.js";
import type {
  EngineeringCompletionUnit,
  EngineeringCompletionUnitRequest,
  EngineeringCompletionReport,
  ShaftEngineeringCompletionRequest,
  EngineeringValidationSummary
} from "./types.js";

const SHAFT_REQUIRED_GEOMETRY_INPUTS = [
  { key: "bearingSpanMm", label: "bearing span" },
  { key: "gearPositionFromLeftMm", label: "gear position from the left bearing (or an explicit midpoint)" },
  { key: "pitchDiameterMm", label: "gear pitch diameter" },
  { key: "pressureAngleDeg", label: "gear pressure angle" },
  { key: "materialGrade", label: "material grade" },
  { key: "yieldStrengthMpa", label: "material yield strength Sy" },
  { key: "ultimateTensileStrengthMpa", label: "material ultimate tensile strength Sut" },
  { key: "designFactor", label: "design factor" }
] as const;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function missingInputsReport(projectId: string, missingInputs: string[]): EngineeringCompletionReport {
  const project: ProjectState = {
    id: projectId,
    name: "Shaft static-yield analysis",
    stage: "REQUIREMENTS",
    status: "BLOCKED",
    requirements: [],
    assumptions: [],
    openQuestions: [...missingInputs],
    unresolvedRisks: [],
    events: []
  };
  const taskGraph: EngineeringTaskGraph = {
    id: "TG-" + projectId,
    projectId,
    revision: 1,
    tasks: []
  };
  return {
    projectId,
    status: "BLOCKED",
    completionUnit: "ENGINEERING.COMPLETE_SHAFT",
    decisionMetrics: [],
    project,
    taskGraph,
    artifacts: [],
    evidence: [],
    verification: null,
    validation: null,
    approvalRequired: true,
    approvalGranted: false,
    missingInputs,
    nextAction: "Provide the missing shaft geometry and material inputs. Bending moment is calculated from the gear forces and bearing geometry; it is not a required user-entered value.",
    lineage: { requirementIds: [], artifactIds: [], evidenceIds: [] }
  };
}

function makeRequirement(id: string, name: string, value: number | string, unit: string): Requirement {
  return { id, name, value, unit, priority: "MUST", status: "OPEN" };
}

function buildCompletionReport(
  projectId: string,
  input: ShaftStaticDesignInput,
  result: ShaftStaticDesignResult,
  assumptionNotes: string[]
): EngineeringCompletionReport {
  const now = new Date().toISOString();
  const artifactId = "ART-" + randomUUID();
  const requirementSpecs: Array<[string, string, number | string, string]> = [
    ["REQ-SHAFT-POWER", "Transmitted power", input.powerKw, "kW"],
    ["REQ-SHAFT-SPEED", "Shaft speed", input.speedRpm, "rpm"],
    ["REQ-SHAFT-SPAN", "Bearing span", input.bearingSpanMm, "mm"],
    ["REQ-SHAFT-GEAR-POSITION", "Gear position from left bearing", input.gearPositionFromLeftMm, "mm"],
    ["REQ-SHAFT-PITCH-DIAMETER", "Gear pitch diameter", input.pitchDiameterMm, "mm"],
    ["REQ-SHAFT-PRESSURE-ANGLE", "Gear pressure angle", input.pressureAngleDeg, "deg"],
    ["REQ-SHAFT-MATERIAL", "Material grade", input.materialGrade, "—"],
    ["REQ-SHAFT-YIELD", "Material yield strength Sy", input.yieldStrengthMpa, "MPa"],
    ["REQ-SHAFT-UTS", "Material ultimate tensile strength Sut", input.ultimateTensileStrengthMpa, "MPa"],
    ["REQ-SHAFT-DESIGN-FACTOR", "Design factor", input.designFactor, "—"],
    ["REQ-SHAFT-AXIAL-LOAD", "Axial load", input.axialLoadN, "N"]
  ];
  const requirements = requirementSpecs.map(([id, name, value, unit]) =>
    makeRequirement(id, name, value, unit)
  );
  const validation: EngineeringValidationSummary = {
    passed: result.passesStaticYield,
    reasons: result.passesStaticYield
      ? ["The candidate diameter satisfies the implemented von Mises static-yield inequality."]
      : ["The candidate diameter does not satisfy the implemented von Mises static-yield inequality."]
  };
  const artifact: EngineeringArtifact = {
    id: artifactId,
    kind: "CALCULATION_RESULT",
    name: "Preliminary shaft static-yield calculation",
    mediaType: "application/json",
    backend: "numerical-analysis",
    version: result.version,
    units: "SI",
    parameters: { capability: SHAFT_STATIC_DESIGN_CAPABILITY, input: result.input, output: result },
    validationStatus: result.passesStaticYield ? "PASS" : "FAIL",
    informationStatus: "CALCULATED",
    evidenceIds: [],
    requirementIds: requirements.map((item) => item.id),
    createdAt: now
  };
  const asmeRequested = assumptionNotes.some((note) => /ASME elliptic/i.test(note));
  const project: ProjectState = {
    id: projectId,
    name: "Shaft static-yield analysis",
    stage: "ENGINEERING_ANALYSIS",
    status: result.passesStaticYield ? "ACTIVE" : "BLOCKED",
    requirements,
    assumptions: [...result.assumptions, ...assumptionNotes],
    openQuestions: [],
    unresolvedRisks: [...result.limitations],
    events: [{
      id: "EVT-" + randomUUID(),
      timestamp: now,
      actor: "engineering-core",
      action: SHAFT_STATIC_DESIGN_CAPABILITY,
      input: result.input,
      output: result,
      artifactIds: [artifactId],
      evidence: []
    }],
    nextAction: result.passesStaticYield
      ? "Review this preliminary von Mises static-yield calculation. " +
        (asmeRequested ? "The requested ASME elliptic criterion was not evaluated. " : "") +
        "This is not fatigue verification, independent verification or design release."
      : "Increase or revise the candidate diameter and rerun the calculation. Do not accept the failing candidate."
  };
  const taskGraph: EngineeringTaskGraph = {
    id: "TG-" + randomUUID(),
    projectId,
    revision: 1,
    tasks: [{
      id: "TASK-" + randomUUID(),
      projectId,
      name: "Calculate preliminary shaft static-yield design",
      goal: "Derive gear forces and bending moment from supplied gear geometry, then evaluate the shaft under axial force, bending and torsion.",
      capability: SHAFT_STATIC_DESIGN_CAPABILITY,
      risk: "MEDIUM",
      input: result.input as unknown as Record<string, unknown>,
      status: "COMPLETED",
      createdAt: now,
      updatedAt: now
    }]
  };

  return {
    projectId,
    status: result.passesStaticYield ? "WAITING_APPROVAL" : "FAILED",
    completionUnit: "ENGINEERING.COMPLETE_SHAFT",
    decisionMetrics: [
      { key: "torqueNm", value: result.torqueNm, unit: "N·m" },
      { key: "tangentialForceN", value: result.tangentialForceN, unit: "N" },
      { key: "radialForceN", value: result.radialForceN, unit: "N" },
      { key: "maximumBendingMomentNm", value: result.maximumBendingMomentNm, unit: "N·m" },
      { key: "minimumDiameterMm", value: result.minimumDiameterMm, unit: "mm" },
      { key: "preferredDiameterMm", value: result.preferredDiameterMm, unit: "mm" },
      { key: "vonMisesStressMpa", value: result.vonMisesStressMpa, unit: "MPa" },
      { key: "achievedYieldFactorOfSafety", value: result.achievedYieldFactorOfSafety, unit: "—" }
    ],
    project,
    taskGraph,
    artifacts: [artifact],
    evidence: [],
    verification: null,
    validation,
    approvalRequired: true,
    approvalGranted: false,
    missingInputs: [],
    nextAction: project.nextAction!,
    lineage: {
      requirementIds: requirements.map((item) => item.id),
      artifactIds: [artifactId],
      evidenceIds: []
    }
  };
}

export class ShaftEngineeringCompletionUnit implements EngineeringCompletionUnit {
  id = "ENGINEERING.COMPLETE_SHAFT";
  capability = "ENGINEERING.COMPLETE_SHAFT";
  // Power/speed are the common minimum. This unit owns conditional input checks:
  // legacy explicit-M sizing remains supported; geometry mode derives bending moment.
  requiredInputs = [
    { key: "powerKw", label: "transmitted power" },
    { key: "speedRpm", label: "shaft speed" }
  ];

  async execute(
    request: EngineeringCompletionUnitRequest,
    router: CapabilityRouter
  ): Promise<EngineeringCompletionReport> {
    const source = request.inputs;
    const legacyKeys = ["bendingMomentNm", "allowableShearStressMpa", "proposedDiameterMm"] as const;
    const hasCompleteLegacyInputs = legacyKeys.every((key) => isFiniteNumber(source[key]));
    if (hasCompleteLegacyInputs) {
      const legacyRequest: ShaftEngineeringCompletionRequest = {
        projectId: request.projectId,
        powerKw: source.powerKw as number,
        speedRpm: source.speedRpm as number,
        bendingMomentNm: source.bendingMomentNm as number,
        allowableShearStressMpa: source.allowableShearStressMpa as number,
        proposedDiameterMm: source.proposedDiameterMm as number,
        ...(request.approval ? { approval: request.approval } : {})
      };
      return completeShaftEngineeringUnit(legacyRequest, router);
    }

    const missing = SHAFT_REQUIRED_GEOMETRY_INPUTS
      .filter(({ key }) => {
        const value = source[key];
        return key === "materialGrade"
          ? typeof value !== "string" || !value.trim()
          : !isFiniteNumber(value);
      })
      .map(({ label }) => label);
    if (missing.length > 0) return missingInputsReport(request.projectId, missing);

    const input: ShaftStaticDesignInput = {
      powerKw: source.powerKw as number,
      speedRpm: source.speedRpm as number,
      bearingSpanMm: source.bearingSpanMm as number,
      gearPositionFromLeftMm: source.gearPositionFromLeftMm as number,
      pitchDiameterMm: source.pitchDiameterMm as number,
      pressureAngleDeg: source.pressureAngleDeg as number,
      axialLoadN: isFiniteNumber(source.axialLoadN) ? source.axialLoadN : 0,
      materialGrade: source.materialGrade as string,
      yieldStrengthMpa: source.yieldStrengthMpa as number,
      ultimateTensileStrengthMpa: source.ultimateTensileStrengthMpa as number,
      designFactor: source.designFactor as number,
      bendingStressFactorKb: isFiniteNumber(source.bendingStressFactorKb) ? source.bendingStressFactorKb : 1,
      torsionalStressFactorKts: isFiniteNumber(source.torsionalStressFactorKts) ? source.torsionalStressFactorKts : 1,
      ...(isFiniteNumber(source.candidateDiameterMm) ? { candidateDiameterMm: source.candidateDiameterMm } : {})
    };

    const capabilityResult = await router.execute({
      capability: SHAFT_STATIC_DESIGN_CAPABILITY,
      risk: "MEDIUM",
      input: input as unknown as Record<string, unknown>
    });
    if (!capabilityResult.success || !capabilityResult.output) {
      throw new Error(capabilityResult.error ?? "Deterministic shaft static-yield calculation failed.");
    }
    const result = capabilityResult.output as ShaftStaticDesignResult;
    const assumptionNotes = [
      typeof source.assumptionNotes === "string" ? source.assumptionNotes : "",
      typeof source.requestedCriterion === "string" && /ASME/i.test(source.requestedCriterion)
        ? "The prompt requested an ASME elliptic criterion. This pilot implements a von Mises static-yield check only; ASME elliptic compliance has not been evaluated."
        : "",
      !isFiniteNumber(source.axialLoadN)
        ? "Axial force was not supplied and was set to 0 N for this preliminary model."
        : "",
      !isFiniteNumber(source.bendingStressFactorKb) || !isFiniteNumber(source.torsionalStressFactorKts)
        ? "Missing Kb/Kts values defaulted to 1.0. These are static stress multipliers, not shock/service factors or fatigue factors."
        : ""
    ].filter(Boolean);

    return buildCompletionReport(request.projectId, input, result, assumptionNotes);
  }
}
