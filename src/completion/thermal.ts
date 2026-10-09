import { CapabilityRouter } from "../capabilities/router.js";
import { CapabilityRisk, ProjectState } from "../core/types.js";
import { EngineeringArtifact, EvidenceRecord } from "../artifacts/engineering-artifacts.js";
import { EngineeringTaskGraph } from "../task-graph/types.js";
import { transitionTask } from "../task-graph/validation.js";
import { EngineeringApprovalRequest, EngineeringCompletionReport, EngineeringValidationSummary } from "./types.js";
import { authorize } from "../auth/policy.js";
import { produceEvidenceByProduct } from "../evidence/by-product.js";

const MASS_FLOW_REQUIREMENT = "REQ-THERMAL-MASS-FLOW";
const SPECIFIC_HEAT_REQUIREMENT = "REQ-THERMAL-SPECIFIC-HEAT";
const INLET_TEMPERATURE_REQUIREMENT = "REQ-THERMAL-INLET-TEMPERATURE";
const OUTLET_TEMPERATURE_REQUIREMENT = "REQ-THERMAL-OUTLET-TEMPERATURE";
const MAX_DUTY_REQUIREMENT = "REQ-THERMAL-MAXIMUM-DUTY";
const HEAT_DUTY_REQUIREMENT = "REQ-THERMAL-HEAT-DUTY";

const CAPABILITY_SPECIFIC_ENERGY = "ANALYSIS.SENSIBLE_SPECIFIC_ENERGY";
const CAPABILITY_HEAT_DUTY = "ANALYSIS.SENSIBLE_HEAT_DUTY";

export interface SensibleHeatingCompletionRequest {
  projectId: string;
  massFlowKgPerS?: number;
  specificHeatJPerKgK?: number;
  inletTemperatureC?: number;
  outletTemperatureC?: number;
  maximumHeatDutyKw?: number;
  approval?: EngineeringApprovalRequest;
}

export interface SensibleHeatingValidation extends EngineeringValidationSummary {
  specificEnergyKjPerKg: number;
  calculatedHeatDutyKw: number;
  maximumHeatDutyKw: number;
  deltaTemperatureK: number;
  dutyWithinLimit: boolean;
  energyBalanceConsistent: boolean;
}

function makeRequirement(id: string, name: string, value?: number, unit?: string) {
  return {
    id,
    name,
    ...(value !== undefined ? { value } : {}),
    ...(unit !== undefined ? { unit } : {}),
    priority: "MUST" as const,
    status: "OPEN" as const
  };
}

function createProject(request: SensibleHeatingCompletionRequest): ProjectState {
  return {
    id: request.projectId,
    name: "Sensible heating duty completion unit",
    stage: "ENGINEERING_COMPLETION",
    status: "ACTIVE",
    requirements: [
      makeRequirement(MASS_FLOW_REQUIREMENT, "Mass flow rate", request.massFlowKgPerS, "kg/s"),
      makeRequirement(SPECIFIC_HEAT_REQUIREMENT, "Constant specific heat capacity", request.specificHeatJPerKgK, "J/(kg·K)"),
      makeRequirement(INLET_TEMPERATURE_REQUIREMENT, "Inlet temperature", request.inletTemperatureC, "°C"),
      makeRequirement(OUTLET_TEMPERATURE_REQUIREMENT, "Target outlet temperature", request.outletTemperatureC, "°C"),
      makeRequirement(MAX_DUTY_REQUIREMENT, "Maximum allowable heating duty", request.maximumHeatDutyKw, "kW"),
      makeRequirement(HEAT_DUTY_REQUIREMENT, "Calculated sensible heating duty")
    ],
    assumptions: [
      "Single-phase steady-state heating with constant specific heat over the stated temperature interval.",
      "Heat losses and kinetic/potential energy changes are outside this bounded calculation."
    ],
    openQuestions: [],
    unresolvedRisks: [
      "This result is not a heat-exchanger design or equipment selection.",
      "Material/property validity, pressure effects, phase change, heat loss, fouling, and transient behavior require separate analysis."
    ],
    events: []
  };
}

function createTaskGraph(projectId: string, now: string): EngineeringTaskGraph {
  return {
    id: "TG-" + projectId,
    projectId,
    revision: 1,
    tasks: [
      {
        id: "TASK-THERMAL-SPECIFIC-ENERGY",
        projectId,
        name: "Calculate sensible energy per unit mass",
        goal: "Calculate explicit constant-specific-heat energy change from inlet and outlet temperatures.",
        capability: CAPABILITY_SPECIFIC_ENERGY,
        risk: "LOW",
        input: {},
        status: "READY",
        createdAt: now,
        updatedAt: now
      },
      {
        id: "TASK-THERMAL-HEAT-DUTY",
        projectId,
        name: "Calculate sensible heating duty",
        goal: "Calculate steady-state heating duty from mass flow and specific energy.",
        capability: CAPABILITY_HEAT_DUTY,
        risk: "LOW",
        input: {},
        dependsOn: ["TASK-THERMAL-SPECIFIC-ENERGY"],
        status: "PROPOSED",
        createdAt: now,
        updatedAt: now
      }
    ]
  };
}

function baseReport(
  projectId: string,
  project: ProjectState,
  taskGraph: EngineeringTaskGraph,
  missingInputs: string[],
  nextAction: string
): EngineeringCompletionReport<SensibleHeatingValidation> {
  return {
    projectId,
    status: "BLOCKED",
    completionUnit: "ENGINEERING.COMPLETE_SENSIBLE_HEATING",
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
    nextAction,
    lineage: {
      requirementIds: project.requirements.map((item) => item.id),
      artifactIds: [],
      evidenceIds: []
    }
  };
}

function finishTask(graph: EngineeringTaskGraph, taskId: string, succeeded: boolean): EngineeringTaskGraph {
  const running = transitionTask(graph, taskId, "RUNNING");
  return transitionTask(running, taskId, succeeded ? "COMPLETED" : "FAILED");
}

function validateHeating(
  massFlowKgPerS: number,
  inletTemperatureC: number,
  outletTemperatureC: number,
  specificEnergyKjPerKg: number,
  calculatedHeatDutyKw: number,
  maximumHeatDutyKw: number
): SensibleHeatingValidation {
  const deltaTemperatureK = outletTemperatureC - inletTemperatureC;
  const independentDutyKw = massFlowKgPerS * specificEnergyKjPerKg;
  const energyBalanceConsistent =
    Number.isFinite(independentDutyKw) &&
    Math.abs(independentDutyKw - calculatedHeatDutyKw) <= Math.max(1e-9, Math.abs(calculatedHeatDutyKw) * 1e-9);
  const dutyWithinLimit = calculatedHeatDutyKw <= maximumHeatDutyKw;
  const reasons: string[] = [];
  if (!Number.isFinite(deltaTemperatureK) || deltaTemperatureK <= 0) {
    reasons.push("Outlet temperature must exceed inlet temperature for this sensible-heating unit.");
  }
  if (!Number.isFinite(specificEnergyKjPerKg) || specificEnergyKjPerKg <= 0) {
    reasons.push("Calculated specific energy must be finite and positive.");
  }
  if (!Number.isFinite(calculatedHeatDutyKw) || calculatedHeatDutyKw <= 0) {
    reasons.push("Calculated heating duty must be finite and positive.");
  }
  if (!energyBalanceConsistent) reasons.push("Heat-duty energy-balance cross-check failed.");
  if (!dutyWithinLimit) reasons.push("Calculated heating duty exceeds the explicit maximum heat-duty requirement.");
  return {
    specificEnergyKjPerKg,
    calculatedHeatDutyKw,
    maximumHeatDutyKw,
    deltaTemperatureK,
    dutyWithinLimit,
    energyBalanceConsistent,
    passed: reasons.length === 0,
    reasons
  };
}

function createArtifact(
  projectId: string,
  request: SensibleHeatingCompletionRequest,
  specificEnergyOutput: unknown,
  heatDutyOutput: unknown,
  validated: boolean
): EngineeringArtifact {
  return {
    id: "ART-" + projectId + "-THERMAL-HEATING-CALCULATION",
    kind: "CALCULATION_RESULT",
    name: "Sensible heating deterministic calculation result",
    mediaType: "application/json",
    backend: "engineering-core",
    version: "1",
    units: "SI",
    parameters: {
      projectId,
      inputs: {
        massFlowKgPerS: request.massFlowKgPerS,
        specificHeatJPerKgK: request.specificHeatJPerKgK,
        inletTemperatureC: request.inletTemperatureC,
        outletTemperatureC: request.outletTemperatureC,
        maximumHeatDutyKw: request.maximumHeatDutyKw
      },
      specificEnergy: specificEnergyOutput,
      heatDuty: heatDutyOutput,
      model: "Qdot = massFlow × cp × (Tout - Tin)"
    },
    validationStatus: validated ? "PASS" : "FAIL",
    informationStatus: validated ? "VERIFIED" : "CALCULATED",
    evidenceIds: [],
    requirementIds: [
      MASS_FLOW_REQUIREMENT,
      SPECIFIC_HEAT_REQUIREMENT,
      INLET_TEMPERATURE_REQUIREMENT,
      OUTLET_TEMPERATURE_REQUIREMENT,
      MAX_DUTY_REQUIREMENT,
      HEAT_DUTY_REQUIREMENT
    ],
    createdAt: new Date().toISOString()
  };
}

export async function completeSensibleHeatingUnit(
  request: SensibleHeatingCompletionRequest,
  router: CapabilityRouter
): Promise<EngineeringCompletionReport<SensibleHeatingValidation>> {
  if (typeof request.projectId !== "string" || !request.projectId.trim()) {
    const project: ProjectState = {
      id: "",
      name: "Sensible heating duty completion unit",
      stage: "REQUIREMENTS",
      status: "BLOCKED",
      requirements: [],
      assumptions: [],
      openQuestions: ["projectId"],
      unresolvedRisks: [],
      events: []
    };
    return baseReport(
      "",
      project,
      { id: "TG-MISSING", projectId: "", revision: 1, tasks: [] },
      ["projectId"],
      "Provide a projectId before starting the completion unit."
    );
  }

  const fields: [keyof SensibleHeatingCompletionRequest, string][] = [
    ["massFlowKgPerS", "mass flow rate"],
    ["specificHeatJPerKgK", "specific heat capacity"],
    ["inletTemperatureC", "inlet temperature"],
    ["outletTemperatureC", "outlet temperature"],
    ["maximumHeatDutyKw", "maximum heat duty"]
  ];
  const missingInputs = fields
    .filter(([key]) => typeof request[key] !== "number" || !Number.isFinite(request[key] as number))
    .map(([, label]) => label);

  const project = createProject(request);
  if (missingInputs.length > 0) {
    project.status = "BLOCKED";
    project.openQuestions = missingInputs;
    return baseReport(
      request.projectId,
      project,
      { id: "TG-" + request.projectId, projectId: request.projectId, revision: 1, tasks: [] },
      missingInputs,
      "Resolve missing thermal inputs before deterministic execution."
    );
  }

  if (
    request.massFlowKgPerS! <= 0 ||
    request.specificHeatJPerKgK! <= 0 ||
    request.maximumHeatDutyKw! <= 0 ||
    request.outletTemperatureC! <= request.inletTemperatureC!
  ) {
    project.status = "BLOCKED";
    project.openQuestions = [
      "Mass flow, specific heat and maximum heat duty must be positive; outlet temperature must exceed inlet temperature."
    ];
    return baseReport(
      request.projectId,
      project,
      createTaskGraph(request.projectId, new Date().toISOString()),
      project.openQuestions,
      "Correct the explicit thermal inputs before deterministic execution."
    );
  }

  const now = new Date().toISOString();
  let taskGraph = createTaskGraph(request.projectId, now);
  const specificEnergyResult = await router.execute({
    capability: CAPABILITY_SPECIFIC_ENERGY,
    risk: "LOW" as CapabilityRisk,
    input: {
      specificHeatJPerKgK: request.specificHeatJPerKgK!,
      inletTemperatureC: request.inletTemperatureC!,
      outletTemperatureC: request.outletTemperatureC!
    }
  });

  if (!specificEnergyResult.success || !specificEnergyResult.output) {
    taskGraph = finishTask(taskGraph, "TASK-THERMAL-SPECIFIC-ENERGY", false);
    project.status = "BLOCKED";
    project.openQuestions = [specificEnergyResult.error ?? "Specific-energy calculation returned no output."];
    return {
      ...baseReport(request.projectId, project, taskGraph, project.openQuestions, "Resolve the deterministic specific-energy failure before continuing."),
      status: "FAILED"
    };
  }

  taskGraph = finishTask(taskGraph, "TASK-THERMAL-SPECIFIC-ENERGY", true);
  taskGraph = transitionTask(taskGraph, "TASK-THERMAL-HEAT-DUTY", "READY");
  const specificEnergyOutput = specificEnergyResult.output as { specificEnergyKjPerKg?: number };
  if (typeof specificEnergyOutput.specificEnergyKjPerKg !== "number" || !Number.isFinite(specificEnergyOutput.specificEnergyKjPerKg)) {
    taskGraph = finishTask(taskGraph, "TASK-THERMAL-HEAT-DUTY", false);
    project.status = "BLOCKED";
    project.openQuestions = ["Specific-energy provider returned incomplete output."];
    return {
      ...baseReport(request.projectId, project, taskGraph, project.openQuestions, "Correct the incomplete provider result before continuing."),
      status: "FAILED"
    };
  }

  const heatDutyResult = await router.execute({
    capability: CAPABILITY_HEAT_DUTY,
    risk: "LOW" as CapabilityRisk,
    input: {
      massFlowKgPerS: request.massFlowKgPerS!,
      specificEnergyKjPerKg: specificEnergyOutput.specificEnergyKjPerKg
    }
  });
  if (!heatDutyResult.success || !heatDutyResult.output) {
    taskGraph = finishTask(taskGraph, "TASK-THERMAL-HEAT-DUTY", false);
    project.status = "BLOCKED";
    project.openQuestions = [heatDutyResult.error ?? "Heat-duty calculation returned no output."];
    return {
      ...baseReport(request.projectId, project, taskGraph, project.openQuestions, "Resolve the deterministic heat-duty failure before continuing."),
      status: "FAILED"
    };
  }
  taskGraph = finishTask(taskGraph, "TASK-THERMAL-HEAT-DUTY", true);

  const heatDutyOutput = heatDutyResult.output as { heatDutyKw?: number };
  if (typeof heatDutyOutput.heatDutyKw !== "number" || !Number.isFinite(heatDutyOutput.heatDutyKw)) {
    project.status = "BLOCKED";
    project.openQuestions = ["Heat-duty provider returned incomplete output."];
    return {
      ...baseReport(request.projectId, project, taskGraph, project.openQuestions, "Correct the incomplete provider result before continuing."),
      status: "FAILED"
    };
  }

  project.events.push({
    id: "EVT-" + project.id + "-ANALYSIS",
    timestamp: new Date().toISOString(),
    actor: "thermal-engineering-completion",
    action: "SENSIBLE_HEATING_DETERMINISTIC_ANALYSIS_COMPLETED",
    input: {
      massFlowKgPerS: request.massFlowKgPerS,
      specificHeatJPerKgK: request.specificHeatJPerKgK,
      inletTemperatureC: request.inletTemperatureC,
      outletTemperatureC: request.outletTemperatureC
    },
    output: { specificEnergy: specificEnergyOutput, heatDuty: heatDutyOutput }
  });

  const validation = validateHeating(
    request.massFlowKgPerS!,
    request.inletTemperatureC!,
    request.outletTemperatureC!,
    specificEnergyOutput.specificEnergyKjPerKg,
    heatDutyOutput.heatDutyKw,
    request.maximumHeatDutyKw!
  );
  const decisionMetrics = [
    { key: "specificEnergyKjPerKg", value: validation.specificEnergyKjPerKg, unit: "kJ/kg" },
    { key: "heatDutyKw", value: validation.calculatedHeatDutyKw, unit: "kW" },
    { key: "maximumHeatDutyKw", value: validation.maximumHeatDutyKw, unit: "kW" },
    { key: "deltaTemperatureK", value: validation.deltaTemperatureK, unit: "K" }
  ];
  const artifact = createArtifact(
    project.id,
    request,
    specificEnergyOutput,
    heatDutyOutput,
    validation.passed
  );

  if (!validation.passed) {
    project.status = "BLOCKED";
    project.unresolvedRisks.push(...validation.reasons);
    return {
      projectId: project.id,
      status: "FAILED",
      completionUnit: "ENGINEERING.COMPLETE_SENSIBLE_HEATING",
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
      nextAction: "Revise the thermal inputs; the deterministic validation gate is fail-closed.",
      lineage: {
        requirementIds: project.requirements.map((item) => item.id),
        artifactIds: [artifact.id],
        evidenceIds: []
      }
    };
  }

  const evidenceIds = [
    "EVD-" + project.id + "-SPECIFIC-ENERGY",
    "EVD-" + project.id + "-HEAT-DUTY",
    "EVD-" + project.id + "-THERMAL-ACCEPTANCE"
  ];
  const evidenceByProduct = produceEvidenceByProduct({
    project,
    artifacts: [artifact],
    validation: "PASS",
    drafts: [
      {
        id: evidenceIds[0],
        type: "CALCULATION",
        claim: "Sensible energy per unit mass was calculated deterministically from explicit specific heat and temperature bounds.",
        method: "q = cp × (Tout - Tin) / 1000",
        value: specificEnergyOutput,
        artifactIds: [artifact.id],
        requirementIds: [SPECIFIC_HEAT_REQUIREMENT, INLET_TEMPERATURE_REQUIREMENT, OUTLET_TEMPERATURE_REQUIREMENT]
      },
      {
        id: evidenceIds[1],
        type: "CALCULATION",
        claim: "Steady-state sensible heating duty was calculated deterministically from explicit mass flow and calculated specific energy.",
        method: "Qdot(kW) = massFlow(kg/s) × q(kJ/kg)",
        value: heatDutyOutput,
        artifactIds: [artifact.id],
        requirementIds: [MASS_FLOW_REQUIREMENT, SPECIFIC_HEAT_REQUIREMENT, HEAT_DUTY_REQUIREMENT]
      },
      {
        id: evidenceIds[2],
        type: "CALCULATION",
        claim: "Calculated duty passed the explicit maximum duty limit and heat-duty balance cross-check.",
        method: "Qdot <= maximumHeatDuty and Qdot = massFlow × q",
        value: validation,
        artifactIds: [artifact.id],
        requirementIds: [MASS_FLOW_REQUIREMENT, MAX_DUTY_REQUIREMENT, HEAT_DUTY_REQUIREMENT]
      }
    ]
  });

  if (!evidenceByProduct.emitted) {
    project.status = "BLOCKED";
    project.openQuestions = [evidenceByProduct.reason];
    return {
      projectId: project.id,
      status: "FAILED",
      completionUnit: "ENGINEERING.COMPLETE_SENSIBLE_HEATING",
      decisionMetrics,
      project,
      taskGraph,
      artifacts: evidenceByProduct.artifacts,
      evidence: [],
      verification: null,
      validation,
      approvalRequired: true,
      approvalGranted: false,
      missingInputs: [],
      nextAction: "Evidence production was blocked; no unverified result will be promoted.",
      lineage: {
        requirementIds: project.requirements.map((item) => item.id),
        artifactIds: evidenceByProduct.artifacts.map((item) => item.id),
        evidenceIds: []
      }
    };
  }

  const evidence = evidenceByProduct.evidence;
  const evidenceArtifact = evidenceByProduct.artifacts[0];
  project.evidenceIds = evidence.map((item) => item.id);
  project.events.push({
    id: "EVT-" + project.id + "-EVIDENCE",
    timestamp: new Date().toISOString(),
    actor: "thermal-engineering-completion",
    action: "ENGINEERING_EVIDENCE_AUTO_GENERATED",
    input: { artifactId: evidenceArtifact.id, validation: "PASS" },
    output: { evidenceIds: evidence.map((item) => item.id) },
    evidence: evidence.map((item) => item.id)
  });

  const reportBase: EngineeringCompletionReport<SensibleHeatingValidation> = {
    projectId: project.id,
    status: "WAITING_APPROVAL",
    completionUnit: "ENGINEERING.COMPLETE_SENSIBLE_HEATING",
    decisionMetrics,
    project,
    taskGraph,
    artifacts: [evidenceArtifact],
    evidence,
    verification: null,
    validation,
    approvalRequired: true,
    approvalGranted: false,
    missingInputs: [],
    nextAction: "A REVIEWER or ADMIN must explicitly approve the validated heating-duty result before the completion unit can close.",
    lineage: {
      requirementIds: project.requirements.map((item) => item.id),
      artifactIds: [evidenceArtifact.id],
      evidenceIds: [...evidenceIds]
    }
  };

  if (!request.approval) return reportBase;

  const authorization = authorize({
    identity: request.approval.identity,
    permission: "APPROVAL.GRANT",
    projectId: project.id
  });
  if (!authorization.allowed) {
    return {
      ...reportBase,
      approval: request.approval,
      nextAction: "Approval was not authorized; a REVIEWER or ADMIN must grant final approval."
    };
  }
  if (!request.approval.reason.trim()) {
    return { ...reportBase, approval: request.approval, nextAction: "Approval reason is required before the completion unit can close." };
  }

  const humanEvidence: EvidenceRecord = {
    id: "EVD-" + project.id + "-HUMAN-APPROVAL",
    type: "HUMAN_REVIEW",
    claim: "Explicit human approval was granted for the validated sensible heating-duty completion unit.",
    method: "Engineering approval gate",
    value: { reason: request.approval.reason, actor: request.approval.identity.subject },
    status: "VERIFIED",
    artifactIds: [evidenceArtifact.id],
    requirementIds: project.requirements.map((item) => item.id),
    timestamp: new Date().toISOString()
  };
  evidence.push(humanEvidence);
  evidenceArtifact.evidenceIds = [...evidenceArtifact.evidenceIds, humanEvidence.id];
  evidenceArtifact.informationStatus = "VERIFIED";
  project.evidenceIds = evidence.map((item) => item.id);

  const verificationResult = await router.execute({
    capability: "ENGINEERING.VERIFY_PROJECT",
    risk: "HIGH",
    input: {
      project,
      evidence,
      artifacts: [evidenceArtifact],
      requirementEvidence: Object.fromEntries(
        project.requirements.map((requirement) => [
          requirement.id,
          evidence.filter((item) => item.requirementIds?.includes(requirement.id)).map((item) => item.id)
        ])
      )
    }
  });
  if (!verificationResult.success || !verificationResult.output) {
    project.status = "BLOCKED";
    project.nextAction = "Final verification failed; approval does not override the evidence gate.";
    return {
      ...reportBase,
      approval: request.approval,
      evidence,
      artifacts: [evidenceArtifact],
      approvalGranted: true,
      status: "FAILED",
      nextAction: project.nextAction,
      lineage: {
        requirementIds: project.requirements.map((item) => item.id),
        artifactIds: [evidenceArtifact.id],
        evidenceIds: evidence.map((item) => item.id)
      }
    };
  }
  const verification = verificationResult.output as { status?: string };
  if (verification.status !== "PASS") {
    project.status = "BLOCKED";
    project.nextAction = "Final verification did not PASS; the completion unit remains blocked despite approval.";
    return {
      ...reportBase,
      approval: request.approval,
      evidence,
      artifacts: [evidenceArtifact],
      verification: verification as never,
      approvalGranted: true,
      status: "FAILED",
      nextAction: project.nextAction,
      lineage: {
        requirementIds: project.requirements.map((item) => item.id),
        artifactIds: [evidenceArtifact.id],
        evidenceIds: evidence.map((item) => item.id)
      }
    };
  }

  for (const requirement of project.requirements) requirement.status = "SATISFIED";
  project.stage = "VERIFIED";
  project.status = "COMPLETE";
  project.nextAction = "Sensible heating-duty completion unit closed; heat-transfer equipment design and downstream release may continue.";
  project.events.push({
    id: "EVT-" + project.id + "-COMPLETE",
    timestamp: new Date().toISOString(),
    actor: request.approval.identity.subject,
    action: "ENGINEERING_COMPLETION_APPROVED",
    input: { approvalReason: request.approval.reason },
    output: { verification: "PASS", artifactId: evidenceArtifact.id }
  });

  return {
    ...reportBase,
    status: "COMPLETE",
    project,
    artifacts: [evidenceArtifact],
    evidence,
    verification: verification as never,
    approvalGranted: true,
    approval: request.approval,
    nextAction: project.nextAction,
    lineage: {
      requirementIds: project.requirements.map((item) => item.id),
      artifactIds: [evidenceArtifact.id],
      evidenceIds: evidence.map((item) => item.id)
    }
  };
}
