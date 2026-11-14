import { CADDFMRule } from "../cad/dfm.js";
import { CADGeometryMetrics } from "../cad/metrics.js";
import { BOMComponentInput, BOMGenerationResult, generateManufacturingBOM } from "./bom.js";
import { evaluateManufacturingDFM, ManufacturingDFMResult } from "./dfm.js";
import { ManufacturingReleaseResult, prepareManufacturingRelease } from "./release.js";
import {
  ManufacturingInspectionAcceptance,
  ManufacturingInspectionCriterion,
  ManufacturingInspectionResult,
  ManufacturingPlanValidation,
  ManufacturingProcess,
  ManufacturingProcessPlan
} from "./types.js";
import { evaluateManufacturingInspection, validateManufacturingProcessPlan } from "./validation.js";

export interface ManufacturingReadinessRequest {
  releaseId: string;
  metrics: CADGeometryMetrics;
  dfmRules: CADDFMRule[];
  process: ManufacturingProcess;
  processPlan: ManufacturingProcessPlan;
  bom: {
    id: string;
    projectId: string;
    revision: string;
    components: BOMComponentInput[];
  };
  requiredArtifactIds: string[];
  inspection: {
    criterion: ManufacturingInspectionCriterion;
    result: ManufacturingInspectionResult;
  };
}

export type ManufacturingReadinessStatus =
  | "INCOMPLETE"
  | "BLOCKED"
  | "READY_FOR_HUMAN_APPROVAL";

export interface ManufacturingReadinessResult {
  status: ManufacturingReadinessStatus;
  releaseId: string;
  projectId: string;
  checks: {
    dfm: boolean;
    processPlan: boolean;
    bom: boolean;
    inspection: boolean;
    artifacts: boolean;
  };
  blockingReasons: string[];
  evaluations: {
    dfm: ManufacturingDFMResult;
    processPlan: ManufacturingPlanValidation;
    bom: BOMGenerationResult;
    inspection: ManufacturingInspectionAcceptance;
    release: ManufacturingReleaseResult;
  };
  humanApprovalRequired: true;
  productionReleasePerformed: false;
}

interface ReadinessEvaluations {
  dfm: ManufacturingDFMResult;
  processPlan: ManufacturingPlanValidation;
  bom: BOMGenerationResult;
  inspection: ManufacturingInspectionAcceptance;
  release: ManufacturingReleaseResult;
  bomProjectMatches: boolean;
}

function createBlockedRelease(releaseId: string, reason: string): ManufacturingReleaseResult {
  return {
    status: "BLOCKED",
    releaseId,
    checks: { processPlan: false, bom: false, artifacts: false, approval: false },
    blockingReasons: [reason],
    message: "Manufacturing release readiness could not be evaluated because the BOM is unavailable."
  };
}

function uniqueReasons(reasons: string[]): string[] {
  return [...new Set(reasons.filter(Boolean))];
}

function evaluateReadinessInputs(request: ManufacturingReadinessRequest): ReadinessEvaluations {
  const dfm = evaluateManufacturingDFM({
    metrics: request.metrics,
    rules: request.dfmRules,
    process: request.process
  });
  const processPlan = validateManufacturingProcessPlan(request.processPlan);
  const bom = generateManufacturingBOM(
    request.bom.id,
    request.bom.projectId,
    request.bom.revision,
    request.bom.components
  );
  const inspection = evaluateManufacturingInspection(
    request.inspection.criterion,
    request.inspection.result
  );
  const bomProjectMatches = request.bom.projectId === request.processPlan.projectId;
  const release = bom.bom
    ? prepareManufacturingRelease({
        releaseId: request.releaseId,
        processPlan: request.processPlan,
        bom: bom.bom,
        requiredArtifactIds: request.requiredArtifactIds
      })
    : createBlockedRelease(
        request.releaseId,
        "A structurally generated BOM is required before release readiness can be evaluated."
      );
  return { dfm, processPlan, bom, inspection, release, bomProjectMatches };
}

function hasExplicitFailure(evaluations: ReadinessEvaluations): boolean {
  return evaluations.dfm.status === "FAIL" ||
    evaluations.processPlan.status === "FAIL" ||
    evaluations.inspection.status === "REJECTED" ||
    !evaluations.bomProjectMatches;
}

function hasIncompleteInput(evaluations: ReadinessEvaluations): boolean {
  return evaluations.dfm.status === "INCOMPLETE" ||
    evaluations.processPlan.status === "INCOMPLETE" ||
    evaluations.bom.status === "INCOMPLETE" ||
    evaluations.inspection.status === "INCOMPLETE";
}

function deriveReadinessStatus(evaluations: ReadinessEvaluations): ManufacturingReadinessStatus {
  if (hasExplicitFailure(evaluations)) return "BLOCKED";
  if (hasIncompleteInput(evaluations)) return "INCOMPLETE";
  if (evaluations.release.status === "BLOCKED") return "BLOCKED";
  return "READY_FOR_HUMAN_APPROVAL";
}

function collectBlockingReasons(evaluations: ReadinessEvaluations): string[] {
  const projectMismatch = evaluations.bomProjectMatches
    ? []
    : ["BOM projectId must match the manufacturing process plan projectId."];
  const inspectionReason = evaluations.inspection.status === "ACCEPTED"
    ? []
    : [evaluations.inspection.reason];
  return uniqueReasons([
    ...evaluations.dfm.blockingReasons,
    ...evaluations.processPlan.errors,
    ...evaluations.bom.validation.errors,
    ...inspectionReason,
    ...projectMismatch,
    ...evaluations.release.blockingReasons
  ]);
}

function buildReadinessChecks(evaluations: ReadinessEvaluations): ManufacturingReadinessResult["checks"] {
  return {
    dfm: evaluations.dfm.status === "PASS",
    processPlan: evaluations.processPlan.status === "PASS",
    bom: evaluations.bom.status === "GENERATED" && evaluations.bomProjectMatches,
    inspection: evaluations.inspection.status === "ACCEPTED",
    artifacts: evaluations.release.checks.artifacts && evaluations.release.checks.bom
  };
}

export function assessManufacturingReadiness(
  request: ManufacturingReadinessRequest
): ManufacturingReadinessResult {
  const evaluations = evaluateReadinessInputs(request);
  return {
    status: deriveReadinessStatus(evaluations),
    releaseId: request.releaseId,
    projectId: request.processPlan.projectId,
    checks: buildReadinessChecks(evaluations),
    blockingReasons: collectBlockingReasons(evaluations),
    evaluations: {
      dfm: evaluations.dfm,
      processPlan: evaluations.processPlan,
      bom: evaluations.bom,
      inspection: evaluations.inspection,
      release: evaluations.release
    },
    humanApprovalRequired: true,
    productionReleasePerformed: false
  };
}
