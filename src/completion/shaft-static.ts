import { randomUUID } from "node:crypto";
import type { CapabilityRouter } from "../capabilities/router.js";
import type { EngineeringArtifact, EvidenceRecord } from "../artifacts/engineering-artifacts.js";
import type { ProjectState, Requirement, EngineeringDecisionMetric } from "../core/types.js";
import type { EngineeringTaskGraph, EngineeringTask } from "../task-graph/types.js";
import { SHAFT_STATIC_DESIGN_CAPABILITY, SHAFT_STATIC_DESIGN_VERSION, type ShaftStaticDesignInput, type ShaftStaticDesignResult } from "../engineering/shaft-static-design.js";
import { produceEvidenceByProduct } from "../evidence/by-product.js";
import type { EngineeringCompletionReport, EngineeringValidationSummary } from "./types.js";

export interface ShaftStaticDesignCompletionRequest extends ShaftStaticDesignInput {
  projectId: string;
  assumptions?: string[];
}

export interface ShaftStaticDesignCompletionValidation extends EngineeringValidationSummary {
  criterion: ShaftStaticDesignResult["criterion"];
  minimumDiameterMm: number;
  preferredDiameterMm: number;
  candidateDiameterMm: number;
  vonMisesStressMpa: number;
  allowableVonMisesStressMpa: number;
  achievedYieldFactorOfSafety: number;
}

function makeRequirement(id: string, name: string, value: number | string, unit: string): Requirement {
  return { id, name, value, unit, priority: "MUST", status: "OPEN" };
}

function createProject(
  request: ShaftStaticDesignCompletionRequest,
  result: ShaftStaticDesignResult,
  runId: string,
  now: string
): ProjectState {
  return {
    id: request.projectId,
    name: "Geometry-derived shaft static-yield design",
    stage: "ENGINEERING_COMPLETION",
    status: "ACTIVE",
    requirements: [
      makeRequirement("REQ-" + runId + "-POWER", "Transmitted power", result.input.powerKw, "kW"),
      makeRequirement("REQ-" + runId + "-SPEED", "Shaft rotational speed", result.input.speedRpm, "rpm"),
      makeRequirement("REQ-" + runId + "-SPAN", "Bearing span", result.input.bearingSpanMm, "mm"),
      makeRequirement("REQ-" + runId + "-GEAR-POSITION", "Gear position from left support", result.input.gearPositionFromLeftMm, "mm"),
      makeRequirement("REQ-" + runId + "-PITCH-DIA", "Gear pitch diameter", result.input.pitchDiameterMm, "mm"),
      makeRequirement("REQ-" + runId + "-PRESSURE-ANGLE", "Gear pressure angle", result.input.pressureAngleDeg, "degrees"),
      makeRequirement("REQ-" + runId + "-AXIAL-LOAD", "Axial load", result.input.axialLoadN, "N"),
      makeRequirement("REQ-" + runId + "-MATERIAL", "Material grade / condition", result.input.materialGrade, "grade"),
      makeRequirement("REQ-" + runId + "-YIELD", "Yield strength Sy", result.input.yieldStrengthMpa, "MPa"),
      makeRequirement("REQ-" + runId + "-UTS", "Ultimate tensile strength Sut", result.input.ultimateTensileStrengthMpa, "MPa"),
      makeRequirement("REQ-" + runId + "-DESIGN-FACTOR", "Required design factor", result.input.designFactor, "dimensionless"),
      makeRequirement("REQ-" + runId + "-KB", "Bending stress multiplier Kb", result.input.bendingStressFactorKb, "dimensionless"),
      makeRequirement("REQ-" + runId + "-KTS", "Torsional stress multiplier Kts", result.input.torsionalStressFactorKts, "dimensionless")
    ],
    assumptions: [...new Set([...(request.assumptions ?? []), ...result.assumptions])],
    openQuestions: [],
    unresolvedRisks: result.limitations,
    events: [{
      id: "EVT-" + runId + "-CALCULATION",
      timestamp: now,
      actor: "engineering-completion",
      action: "SHAFT_STATIC_DESIGN_CALCULATED",
      input: result.input,
      output: result
    }]
  };
}

function createTaskGraph(projectId: string, runId: string, now: string): EngineeringTaskGraph {
  const makeTask = (
    suffix: string,
    name: string,
    goal: string,
    capability: string,
    dependsOn: string[] = []
  ): EngineeringTask => ({
    id: "TASK-" + runId + "-" + suffix,
    projectId,
    name,
    goal,
    capability,
    risk: "MEDIUM",
    input: {},
    ...(dependsOn.length ? { dependsOn } : {}),
    status: "COMPLETED",
    createdAt: now,
    updatedAt: now
  });

  const loadsId = "TASK-" + runId + "-LOADS";
  const bendingId = "TASK-" + runId + "-BENDING";
  const sizingId = "TASK-" + runId + "-SIZING";
  return {
    id: "TG-" + runId,
    projectId,
    revision: 1,
    tasks: [
      makeTask("LOADS", "Calculate transmitted torque and gear loads", "Derive shaft torque, tangential force and radial force from power, speed and gear geometry.", SHAFT_STATIC_DESIGN_CAPABILITY),
      makeTask("BENDING", "Derive bearing reactions and maximum bending moment", "Resolve the gear load through the two bearing supports and calculate the maximum bending moment.", SHAFT_STATIC_DESIGN_CAPABILITY, [loadsId]),
      makeTask("SIZING", "Size the solid circular shaft", "Solve the declared static-yield diameter criterion using bending and torsional stresses.", SHAFT_STATIC_DESIGN_CAPABILITY, [bendingId]),
      makeTask("VALIDATION", "Check the static-yield design factor", "Compare the calculated equivalent stress with Sy divided by the required design factor.", SHAFT_STATIC_DESIGN_CAPABILITY, [sizingId])
    ]
  };
}

function metrics(result: ShaftStaticDesignResult): EngineeringDecisionMetric[] {
  return [
    { key: "torqueNm", value: result.torqueNm, unit: "N·m" },
    { key: "tangentialForceN", value: result.tangentialForceN, unit: "N" },
    { key: "radialForceN", value: result.radialForceN, unit: "N" },
    { key: "resultantTransverseForceN", value: result.resultantTransverseForceN, unit: "N" },
    { key: "leftBearingReactionN", value: result.leftBearingReactionN, unit: "N" },
    { key: "rightBearingReactionN", value: result.rightBearingReactionN, unit: "N" },
    { key: "maximumBendingMomentNm", value: result.maximumBendingMomentNm, unit: "N·m" },
    { key: "minimumDiameterMm", value: result.minimumDiameterMm, unit: "mm" },
    { key: "preferredDiameterMm", value: result.preferredDiameterMm, unit: "mm" },
    { key: "candidateDiameterMm", value: result.candidateDiameterMm, unit: "mm" },
    { key: "principalStress1Mpa", value: result.principalStress1Mpa, unit: "MPa" },
    { key: "principalStress2Mpa", value: result.principalStress2Mpa, unit: "MPa" },
    { key: "maximumShearStressMpa", value: result.maximumShearStressMpa, unit: "MPa" },
    { key: "vonMisesStressMpa", value: result.vonMisesStressMpa, unit: "MPa" },
    { key: "achievedYieldFactorOfSafety", value: result.achievedYieldFactorOfSafety, unit: "dimensionless" }
  ];
}

function createArtifact(
  projectId: string,
  runId: string,
  result: ShaftStaticDesignResult,
  requirementIds: string[],
  now: string
): EngineeringArtifact {
  return {
    id: "ART-" + runId,
    kind: "CALCULATION_RESULT",
    name: "Geometry-derived shaft static-yield calculation",
    mediaType: "application/json",
    backend: "numerical-analysis",
    version: SHAFT_STATIC_DESIGN_VERSION,
    units: "SI",
    parameters: {
      projectId,
      capability: SHAFT_STATIC_DESIGN_CAPABILITY,
      input: result.input,
      result
    },
    validationStatus: result.passesStaticYield ? "PASS" : "FAIL",
    informationStatus: "CALCULATED",
    evidenceIds: [],
    requirementIds,
    createdAt: now
  };
}

export async function completeShaftStaticDesignUnit(
  request: ShaftStaticDesignCompletionRequest,
  router: CapabilityRouter
): Promise<EngineeringCompletionReport<ShaftStaticDesignCompletionValidation>> {
  if (typeof request.projectId !== "string" || !request.projectId.trim()) {
    throw new Error("A registered projectId is required for shaft static-design completion.");
  }

  const normalizedInput: ShaftStaticDesignInput = {
    powerKw: request.powerKw,
    speedRpm: request.speedRpm,
    bearingSpanMm: request.bearingSpanMm,
    gearPositionFromLeftMm: request.gearPositionFromLeftMm,
    pitchDiameterMm: request.pitchDiameterMm,
    pressureAngleDeg: request.pressureAngleDeg,
    axialLoadN: request.axialLoadN,
    materialGrade: request.materialGrade,
    yieldStrengthMpa: request.yieldStrengthMpa,
    ultimateTensileStrengthMpa: request.ultimateTensileStrengthMpa,
    designFactor: request.designFactor,
    bendingStressFactorKb: request.bendingStressFactorKb,
    torsionalStressFactorKts: request.torsionalStressFactorKts,
    ...(request.candidateDiameterMm === undefined ? {} : { candidateDiameterMm: request.candidateDiameterMm })
  };

  const execution = await router.execute({
    capability: SHAFT_STATIC_DESIGN_CAPABILITY,
    risk: "MEDIUM",
    input: normalizedInput as unknown as Record<string, unknown>
  });
  if (!execution.success || !execution.output) {
    throw new Error(execution.error ?? "Deterministic shaft static-yield calculation failed.");
  }

  const result = execution.output as ShaftStaticDesignResult;
  const now = new Date().toISOString();
  const runId = randomUUID();
  const project = createProject(request, result, runId, now);
  const taskGraph = createTaskGraph(request.projectId, runId, now);
  const requirementIds = project.requirements.map((item) => item.id);
  const artifact = createArtifact(request.projectId, runId, result, requirementIds, now);
  const decisionMetrics = metrics(result);
  const validation: ShaftStaticDesignCompletionValidation = {
    passed: result.passesStaticYield,
    reasons: result.passesStaticYield ? [] : [
      "The candidate diameter does not satisfy the stated static-yield design-factor criterion."
    ],
    criterion: result.criterion,
    minimumDiameterMm: result.minimumDiameterMm,
    preferredDiameterMm: result.preferredDiameterMm,
    candidateDiameterMm: result.candidateDiameterMm,
    vonMisesStressMpa: result.vonMisesStressMpa,
    allowableVonMisesStressMpa: result.allowableVonMisesStressMpa,
    achievedYieldFactorOfSafety: result.achievedYieldFactorOfSafety
  };

  if (!result.passesStaticYield) {
    project.status = "BLOCKED";
    project.unresolvedRisks = [...project.unresolvedRisks, ...validation.reasons];
    return {
      projectId: project.id,
      status: "FAILED",
      completionUnit: "ENGINEERING.COMPLETE_SHAFT",
      decisionMetrics,
      project,
      taskGraph,
      artifacts: [artifact],
      evidence: [],
      verification: null,
      validation,
      approvalRequired: true,
      approvalGranted: false,
      missingInputs: [],
      nextAction: "Increase the candidate diameter or revise the design assumptions, then rerun the deterministic static-yield check.",
      lineage: { requirementIds, artifactIds: [artifact.id], evidenceIds: [] }
    };
  }

  const evidenceIds = [
    "EVD-" + runId + "-LOADS",
    "EVD-" + runId + "-SIZING",
    "EVD-" + runId + "-STATIC-YIELD"
  ];
  const evidenceResult = produceEvidenceByProduct({
    project,
    artifacts: [artifact],
    validation: "PASS",
    timestamp: now,
    drafts: [
      {
        id: evidenceIds[0],
        type: "CALCULATION",
        claim: "Transmitted torque, gear forces, bearing reactions and maximum bending moment were derived from the stated shaft geometry.",
        method: "T = P/omega; Ft = 2T/dp; Fr = Ft tan(phi); Mmax = F a (L-a)/L",
        value: {
          torqueNm: result.torqueNm,
          tangentialForceN: result.tangentialForceN,
          radialForceN: result.radialForceN,
          leftBearingReactionN: result.leftBearingReactionN,
          rightBearingReactionN: result.rightBearingReactionN,
          maximumBendingMomentNm: result.maximumBendingMomentNm
        },
        artifactIds: [artifact.id],
        requirementIds
      },
      {
        id: evidenceIds[1],
        type: "CALCULATION",
        claim: "Minimum and preferred nominal shaft diameters were calculated by a deterministic static-yield sizing method.",
        method: result.equations.stress + "; " + result.equations.yield,
        value: result,
        artifactIds: [artifact.id],
        requirementIds
      },
      {
        id: evidenceIds[2],
        type: "CALCULATION",
        claim: "The selected candidate diameter satisfies the stated static-yield design-factor criterion.",
        method: "sigma_VM <= Sy / nd",
        value: validation,
        artifactIds: [artifact.id],
        requirementIds
      }
    ]
  });

  if (!evidenceResult.emitted) {
    project.status = "BLOCKED";
    project.openQuestions = [evidenceResult.reason];
    return {
      projectId: project.id,
      status: "FAILED",
      completionUnit: "ENGINEERING.COMPLETE_SHAFT",
      decisionMetrics,
      project,
      taskGraph,
      artifacts: evidenceResult.artifacts,
      evidence: [],
      verification: null,
      validation,
      approvalRequired: true,
      approvalGranted: false,
      missingInputs: [],
      nextAction: "Evidence production was blocked; no result was promoted.",
      lineage: { requirementIds, artifactIds: [artifact.id], evidenceIds: [] }
    };
  }

  const evidence = evidenceResult.evidence;
  const finalArtifact = evidenceResult.artifacts[0];
  project.evidenceIds = evidence.map((item: EvidenceRecord) => item.id);
  project.events.push({
    id: "EVT-" + runId + "-EVIDENCE",
    timestamp: now,
    actor: "engineering-completion",
    action: "SHAFT_STATIC_DESIGN_EVIDENCE_GENERATED",
    input: { artifactId: finalArtifact.id, validation: "PASS" },
    output: { evidenceIds: evidence.map((item: EvidenceRecord) => item.id) },
    evidence: evidence.map((item: EvidenceRecord) => item.id),
    artifactIds: [finalArtifact.id]
  });

  return {
    projectId: project.id,
    status: "WAITING_APPROVAL",
    completionUnit: "ENGINEERING.COMPLETE_SHAFT",
    decisionMetrics,
    project,
    taskGraph,
    artifacts: [finalArtifact],
    evidence,
    verification: null,
    validation,
    approvalRequired: true,
    approvalGranted: false,
    missingInputs: [],
    nextAction: "The deterministic shaft calculation and static-yield evidence are ready for review. Complete fatigue, key/keyway strength, deflection, critical-speed and bearing checks before design release.",
    lineage: {
      requirementIds,
      artifactIds: [finalArtifact.id],
      evidenceIds: evidence.map((item: EvidenceRecord) => item.id)
    }
  };
}
