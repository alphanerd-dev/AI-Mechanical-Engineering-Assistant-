import { CADDFMRule, evaluateCADDFM } from "../cad/dfm.js";
import { CADGeometryMetrics } from "../cad/metrics.js";
import { BOMComponentInput, BOMGenerationResult, generateManufacturingBOM } from "./bom.js";
import { ManufacturingDFMResult } from "./dfm.js";
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

export function assessManufacturingReadiness(
  request: ManufacturingReadinessRequest
): ManufacturingReadinessResult {
  const dfm = evaluateCADDFM(request.metrics, request.dfmRules);
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
    : createBlockedRelease(request.releaseId, "A structurally generated BOM is required before release readiness can be evaluated.");

  const hasExplicitFailure =
    dfm.status === "FAIL" ||
    processPlan.status === "FAIL" ||
    inspection.status === "REJECTED" ||
    !bomProjectMatches;
  const hasIncompleteInput =
    dfm.status === "INCOMPLETE" ||
    processPlan.status === "INCOMPLETE" ||
    bom.status === "INCOMPLETE" ||
    inspection.status === "INCOMPLETE";

  let status: ManufacturingReadinessStatus;
  if (hasExplicitFailure) {
    status = "BLOCKED";
  } else if (hasIncompleteInput) {
    status = "INCOMPLETE";
  } else if (release.status === "BLOCKED") {
    status = "BLOCKED";
  } else {
    status = "READY_FOR_HUMAN_APPROVAL";
  }

  const projectMismatchReason = bomProjectMatches
    ? []
    : ["BOM projectId must match the manufacturing process plan projectId."];
  const blockingReasons = uniqueReasons([
    ...dfm.blockingReasons,
    ...processPlan.errors,
    ...bom.validation.errors,
    ...(inspection.status === "ACCEPTED" ? [] : [inspection.reason]),
    ...projectMismatchReason,
    ...release.blockingReasons
  ]);

  return {
    status,
    releaseId: request.releaseId,
    projectId: request.processPlan.projectId,
    checks: {
      dfm: dfm.status === "PASS",
      processPlan: processPlan.status === "PASS",
      bom: bom.status === "GENERATED" && bomProjectMatches,
      inspection: inspection.status === "ACCEPTED",
      artifacts: release.checks.artifacts && release.checks.bom
    },
    blockingReasons,
    evaluations: { dfm, processPlan, bom, inspection, release },
    humanApprovalRequired: true,
    productionReleasePerformed: false
  };
}
