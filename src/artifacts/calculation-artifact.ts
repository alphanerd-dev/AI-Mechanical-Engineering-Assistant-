import { createHash } from "node:crypto";

export const CALCULATION_ARTIFACT_SCHEMA_VERSION = 1 as const;

export type ArtifactExecutionStatus = "COMPLETED" | "FAILED";
export type ArtifactValidationStatus = "VALIDATED" | "FAILED" | "INCOMPLETE";
export type ArtifactApprovalStatus = "NOT_REQUESTED" | "WAITING_APPROVAL" | "APPROVED" | "REJECTED";
export type ArtifactVerificationStatus = "NOT_VERIFIED" | "VERIFIED";
export type ValidationResult = "PASS" | "FAIL" | "INCOMPLETE";

export interface CalculationValidationReceipt {
  id: string;
  result: ValidationResult;
  validatorId: string;
  validatorVersion: string;
  checks: string[];
  warnings: string[];
  inputSha256: string;
  outputSha256: string;
  validatedAt: string;
}

export interface CalculationArtifact<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>
> {
  id: string;
  projectId: string;
  kind: "CALCULATION_RESULT";
  schemaVersion: typeof CALCULATION_ARTIFACT_SCHEMA_VERSION;
  name: string;
  capability: string;
  sourceRevision: number;
  workspaceRevision: number;
  createdBy: string;
  createdAt: string;
  providerId: string;
  providerVersion: string;
  inputs: TInput;
  outputs: TOutput;
  inputSha256: string;
  outputSha256: string;
  executionStatus: ArtifactExecutionStatus;
  validationStatus: ArtifactValidationStatus;
  validationReceipt: CalculationValidationReceipt;
  approvalRequired: boolean;
  approvalStatus: ArtifactApprovalStatus;
  verificationStatus: ArtifactVerificationStatus;
  limitations: string[];
}

export interface CalculationArtifactInput<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>
> {
  id: string;
  projectId: string;
  name: string;
  capability: string;
  sourceRevision: number;
  workspaceRevision: number;
  createdBy: string;
  createdAt: string;
  providerId: string;
  providerVersion: string;
  inputs: TInput;
  outputs: TOutput;
  executionStatus: ArtifactExecutionStatus;
  validation: Omit<CalculationValidationReceipt, "inputSha256" | "outputSha256">;
  approvalRequired: boolean;
  approvalStatus: ArtifactApprovalStatus;
  verificationStatus: ArtifactVerificationStatus;
  limitations: string[];
}

/** Canonical JSON for reproducible digests. Rejects non-JSON values and non-finite numbers. */
export function canonicalJson(value: unknown): string {
  const ancestors = new Set<object>();
  const normalize = (current: unknown): unknown => {
    if (current === null || typeof current === "string" || typeof current === "boolean") return current;
    if (typeof current === "number") {
      if (!Number.isFinite(current)) throw new Error("Calculation artifact data cannot contain non-finite numbers.");
      return current;
    }
    if (typeof current !== "object") throw new Error("Calculation artifact data must be JSON-compatible.");
    if (ancestors.has(current)) throw new Error("Calculation artifact data cannot be cyclic.");
    ancestors.add(current);
    try {
      if (Array.isArray(current)) return current.map(normalize);
      const record = current as Record<string, unknown>;
      const normalized: Record<string, unknown> = {};
      for (const key of Object.keys(record).sort()) {
        if (record[key] === undefined) throw new Error("Calculation artifact data cannot contain undefined values.");
        normalized[key] = normalize(record[key]);
      }
      return normalized;
    } finally {
      ancestors.delete(current);
    }
  };
  return JSON.stringify(normalize(value));
}

export function sha256Json(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

/** Construct a calculation artifact while binding its receipt to the exact input/output JSON digests. */
export function createCalculationArtifact<
  TInput extends Record<string, unknown>,
  TOutput extends Record<string, unknown>
>(input: CalculationArtifactInput<TInput, TOutput>): CalculationArtifact<TInput, TOutput> {
  const inputSha256 = sha256Json(input.inputs);
  const outputSha256 = sha256Json(input.outputs);
  const receipt: CalculationValidationReceipt = {
    ...input.validation,
    inputSha256,
    outputSha256
  };
  const validationStatus: ArtifactValidationStatus =
    receipt.result === "PASS" ? "VALIDATED" : receipt.result === "FAIL" ? "FAILED" : "INCOMPLETE";

  return {
    id: input.id,
    projectId: input.projectId,
    kind: "CALCULATION_RESULT",
    schemaVersion: CALCULATION_ARTIFACT_SCHEMA_VERSION,
    name: input.name,
    capability: input.capability,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    createdBy: input.createdBy,
    createdAt: input.createdAt,
    providerId: input.providerId,
    providerVersion: input.providerVersion,
    inputs: input.inputs,
    outputs: input.outputs,
    inputSha256,
    outputSha256,
    executionStatus: input.executionStatus,
    validationStatus,
    validationReceipt: receipt,
    approvalRequired: input.approvalRequired,
    approvalStatus: input.approvalStatus,
    verificationStatus: input.verificationStatus,
    limitations: input.limitations
  };
}

/**
 * Conservatively mark a result stale whenever the current workspace revision differs
 * from the revision in which the artifact was saved. The receipt remains historical
 * evidence for its exact inputs/outputs; it is not evidence that the result is current.
 */
export function isCalculationArtifactStale(
  artifact: Pick<CalculationArtifact, "workspaceRevision">,
  currentWorkspaceRevision: number
): boolean {
  return !Number.isSafeInteger(currentWorkspaceRevision) || currentWorkspaceRevision !== artifact.workspaceRevision;
}

/** Validate artifact structure and digest/receipt bindings before persisting a workspace snapshot. */
export function validateCalculationArtifact(value: unknown): string[] {
  const errors: string[] = [];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return ["Calculation artifact must be an object."];
  const artifact = value as Record<string, unknown>;
  const digestPattern = /^[a-f0-9]{64}$/;
  const nonEmpty = (field: string) => typeof artifact[field] === "string" && (artifact[field] as string).trim().length > 0;
  const positiveInteger = (field: string) => Number.isSafeInteger(artifact[field]) && Number(artifact[field]) >= 1;

  for (const field of ["id", "projectId", "name", "capability", "createdBy", "createdAt", "providerId", "providerVersion"]) {
    if (!nonEmpty(field)) errors.push("Calculation artifact " + field + " is required.");
  }
  for (const field of ["sourceRevision", "workspaceRevision"]) {
    if (!positiveInteger(field)) errors.push("Calculation artifact " + field + " must be a positive integer.");
  }
  if (artifact.kind !== "CALCULATION_RESULT" || artifact.schemaVersion !== CALCULATION_ARTIFACT_SCHEMA_VERSION) {
    errors.push("Calculation artifact kind or schema version is unsupported.");
  }
  if (typeof artifact.createdAt === "string" && Number.isNaN(Date.parse(artifact.createdAt))) {
    errors.push("Calculation artifact createdAt must be a valid date.");
  }
  if (typeof artifact.inputSha256 !== "string" || !digestPattern.test(artifact.inputSha256)) errors.push("Calculation artifact inputSha256 is invalid.");
  if (typeof artifact.outputSha256 !== "string" || !digestPattern.test(artifact.outputSha256)) errors.push("Calculation artifact outputSha256 is invalid.");
  if (artifact.executionStatus !== "COMPLETED" && artifact.executionStatus !== "FAILED") errors.push("Calculation artifact executionStatus is invalid.");
  if (!["VALIDATED", "FAILED", "INCOMPLETE"].includes(String(artifact.validationStatus))) errors.push("Calculation artifact validationStatus is invalid.");
  if (!["NOT_REQUESTED", "WAITING_APPROVAL", "APPROVED", "REJECTED"].includes(String(artifact.approvalStatus))) errors.push("Calculation artifact approvalStatus is invalid.");
  if (artifact.verificationStatus !== "NOT_VERIFIED" && artifact.verificationStatus !== "VERIFIED") errors.push("Calculation artifact verificationStatus is invalid.");
  if (typeof artifact.approvalRequired !== "boolean") errors.push("Calculation artifact approvalRequired must be boolean.");
  if (!Array.isArray(artifact.limitations) || artifact.limitations.some((item) => typeof item !== "string")) errors.push("Calculation artifact limitations must be a string array.");
  if (artifact.inputs === null || typeof artifact.inputs !== "object" || Array.isArray(artifact.inputs)) errors.push("Calculation artifact inputs must be an object.");
  if (artifact.outputs === null || typeof artifact.outputs !== "object" || Array.isArray(artifact.outputs)) errors.push("Calculation artifact outputs must be an object.");

  try {
    if (artifact.inputs && typeof artifact.inputs === "object" && !Array.isArray(artifact.inputs) &&
        typeof artifact.inputSha256 === "string" && sha256Json(artifact.inputs) !== artifact.inputSha256) {
      errors.push("Calculation artifact inputs do not match inputSha256.");
    }
    if (artifact.outputs && typeof artifact.outputs === "object" && !Array.isArray(artifact.outputs) &&
        typeof artifact.outputSha256 === "string" && sha256Json(artifact.outputs) !== artifact.outputSha256) {
      errors.push("Calculation artifact outputs do not match outputSha256.");
    }
  } catch {
    errors.push("Calculation artifact inputs or outputs are not canonical JSON.");
  }

  const receipt = artifact.validationReceipt;
  if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt)) {
    errors.push("Calculation artifact validationReceipt is required.");
  } else {
    const typedReceipt = receipt as Record<string, unknown>;
    if (typeof typedReceipt.id !== "string" || !typedReceipt.id.trim()) errors.push("Validation receipt id is required.");
    if (!["PASS", "FAIL", "INCOMPLETE"].includes(String(typedReceipt.result))) errors.push("Validation receipt result is invalid.");
    if (typeof typedReceipt.validatorId !== "string" || !typedReceipt.validatorId.trim()) errors.push("Validation receipt validatorId is required.");
    if (typeof typedReceipt.validatorVersion !== "string" || !typedReceipt.validatorVersion.trim()) errors.push("Validation receipt validatorVersion is required.");
    if (!Array.isArray(typedReceipt.checks) || typedReceipt.checks.some((item) => typeof item !== "string")) errors.push("Validation receipt checks must be a string array.");
    if (!Array.isArray(typedReceipt.warnings) || typedReceipt.warnings.some((item) => typeof item !== "string")) errors.push("Validation receipt warnings must be a string array.");
    if (typedReceipt.inputSha256 !== artifact.inputSha256 || typedReceipt.outputSha256 !== artifact.outputSha256) {
      errors.push("Validation receipt digests must match the artifact's exact inputs and outputs.");
    }
    if (typeof typedReceipt.validatedAt !== "string" || Number.isNaN(Date.parse(typedReceipt.validatedAt))) errors.push("Validation receipt validatedAt must be a valid date.");
    if (artifact.validationStatus === "VALIDATED" && typedReceipt.result !== "PASS") errors.push("VALIDATED requires a passing validation receipt.");
    if (artifact.validationStatus === "FAILED" && typedReceipt.result !== "FAIL") errors.push("FAILED requires a failing validation receipt.");
    if (artifact.validationStatus === "INCOMPLETE" && typedReceipt.result !== "INCOMPLETE") errors.push("INCOMPLETE requires an incomplete validation receipt.");
  }
  if (artifact.verificationStatus === "VERIFIED" && artifact.validationStatus !== "VALIDATED") {
    errors.push("VERIFIED requires capability-specific validation to have passed.");
  }
  return errors;
}
