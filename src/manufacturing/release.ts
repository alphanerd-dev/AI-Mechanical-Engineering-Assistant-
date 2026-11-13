import { ManufacturingBOM, validateManufacturingBOM } from "./bom.js";
import { ManufacturingProcessPlan } from "./types.js";
import { validateManufacturingProcessPlan } from "./validation.js";

export interface ManufacturingHumanApproval {
  approvedBy: string;
  approvedAt: string;
  comment?: string;
}

export interface ManufacturingReleaseRequest {
  releaseId: string;
  processPlan: ManufacturingProcessPlan;
  bom: ManufacturingBOM;
  requiredArtifactIds: string[];
  approval?: ManufacturingHumanApproval;
}

export interface ManufacturingReleaseResult {
  status: "READY" | "BLOCKED" | "RELEASED";
  releaseId: string;
  checks: {
    processPlan: boolean;
    bom: boolean;
    artifacts: boolean;
    approval: boolean;
  };
  blockingReasons: string[];
  message: string;
}

interface ReleaseGateEvaluation {
  processPlanValid: boolean;
  bomValid: boolean;
  bomArtifactsLinked: boolean;
  artifactsReady: boolean;
  approvalValid: boolean;
}

function areBomArtifactsLinked(bom: ManufacturingBOM): boolean {
  return bom.items.length > 0 &&
    bom.items.every(item => typeof item.artifactId === "string" && Boolean(item.artifactId.trim()));
}

function areRequiredArtifactsConsistent(request: ManufacturingReleaseRequest): boolean {
  const required = [...new Set(request.requiredArtifactIds.filter(Boolean))];
  if (!request.requiredArtifactIds.length || required.length !== request.requiredArtifactIds.length) {
    return false;
  }

  const planArtifacts = request.processPlan.partArtifactIds;
  const bomArtifacts = request.bom.items.map(item => item.artifactId);
  const linkedArtifacts = new Set([...planArtifacts, ...bomArtifacts.filter(
    (artifactId): artifactId is string => typeof artifactId === "string" && Boolean(artifactId.trim())
  )]);

  const allRequiredLinked = required.every(artifactId => linkedArtifacts.has(artifactId));
  const allPlanArtifactsRequired = planArtifacts.every(artifactId => required.includes(artifactId));
  const allBomArtifactsRequired = bomArtifacts.every(
    artifactId => typeof artifactId === "string" &&
      Boolean(artifactId.trim()) &&
      required.includes(artifactId)
  );
  return allRequiredLinked && allPlanArtifactsRequired && allBomArtifactsRequired;
}

function isValidHumanApproval(approval?: ManufacturingHumanApproval): boolean {
  if (!approval) return true;
  return typeof approval.approvedBy === "string" &&
    Boolean(approval.approvedBy.trim()) &&
    typeof approval.approvedAt === "string" &&
    Number.isFinite(Date.parse(approval.approvedAt));
}

function evaluateReleaseGates(request: ManufacturingReleaseRequest): ReleaseGateEvaluation {
  const processPlanValid = validateManufacturingProcessPlan(request.processPlan).status === "PASS";
  const bomValid = validateManufacturingBOM(request.bom).status === "PASS";
  const bomArtifactsLinked = areBomArtifactsLinked(request.bom);
  return {
    processPlanValid,
    bomValid,
    bomArtifactsLinked,
    artifactsReady: areRequiredArtifactsConsistent(request),
    approvalValid: isValidHumanApproval(request.approval)
  };
}

function collectReleaseBlockingReasons(
  request: ManufacturingReleaseRequest,
  gates: ReleaseGateEvaluation
): string[] {
  const reasons: string[] = [];
  if (!request.releaseId.trim()) reasons.push("Release id is required.");
  if (!gates.processPlanValid) reasons.push("Manufacturing process plan is not valid for release.");
  if (!gates.bomValid) reasons.push("BOM is not structurally valid for release.");
  if (!gates.bomArtifactsLinked) reasons.push("Every BOM item must have an explicit linked artifact before release.");
  if (!gates.artifactsReady) {
    reasons.push("Every required artifact must be linked to the process plan or BOM, and all plan/BOM artifacts must be included.");
  }
  if (!gates.approvalValid) reasons.push("Human approval is invalid.");
  return reasons;
}

function buildReleaseChecks(gates: ReleaseGateEvaluation): ManufacturingReleaseResult["checks"] {
  return {
    processPlan: gates.processPlanValid,
    bom: gates.bomValid && gates.bomArtifactsLinked,
    artifacts: gates.artifactsReady,
    approval: gates.approvalValid
  };
}

function blockedRelease(
  releaseId: string,
  checks: ManufacturingReleaseResult["checks"],
  blockingReasons: string[]
): ManufacturingReleaseResult {
  return {
    status: "BLOCKED",
    releaseId,
    checks,
    blockingReasons,
    message: "Manufacturing release is blocked by one or more explicit readiness failures."
  };
}

export function prepareManufacturingRelease(
  request: ManufacturingReleaseRequest
): ManufacturingReleaseResult {
  const gates = evaluateReleaseGates(request);
  const checks = buildReleaseChecks(gates);
  const blockingReasons = collectReleaseBlockingReasons(request, gates);

  if (blockingReasons.length) {
    return blockedRelease(request.releaseId, checks, blockingReasons);
  }
  if (!request.approval) {
    return {
      status: "READY",
      releaseId: request.releaseId,
      checks: { ...checks, approval: false },
      blockingReasons: [],
      message: "Release package is structurally ready but remains unreleased until an explicit human approval is supplied."
    };
  }
  return {
    status: "RELEASED",
    releaseId: request.releaseId,
    checks,
    blockingReasons: [],
    message: "Release package passed structural gates and has explicit human approval."
  };
}
