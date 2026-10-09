import { CADModelIdentity, validateCADModelIdentity } from "./identity.js";
import { CADExecutionRequest, CADExecutionResult } from "./execution.js";
import { CADArtifact, CADArtifactKind, CADExecutionProvenance } from "./artifacts.js";
import { createCADSourceSha256 } from "./provenance.js";

export interface CADArtifactManifestContext {
  modelIdentity: CADModelIdentity;
  request: CADExecutionRequest;
  /** Host-authored identity of the adapter that actually handled this execution. */
  providerId: string;
  requirementIds?: string[];
  generatedAt?: string;
}

export interface CADArtifactManifest {
  artifacts: CADArtifact[];
  warnings: string[];
  errors: string[];
  provenance?: CADExecutionProvenance;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function stableArtifactToken(projectId: string, executionId: string, sourceSha256: string, providerId: string): string {
  return createCADSourceSha256(projectId + "\u0000" + executionId + "\u0000" + sourceSha256 + "\u0000" + providerId).slice(0, 24);
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() || "cad-artifact";
}

function noArtifacts(warnings: string[], errors: string[]): CADArtifactManifest {
  return { artifacts: [], warnings, errors };
}

function buildProvenance(
  projectId: string,
  execution: CADExecutionResult,
  context: CADArtifactManifestContext
): { provenance?: CADExecutionProvenance; errors: string[] } {
  const errors: string[] = [];
  const request = context.request;
  const identityCheck = validateCADModelIdentity(context.modelIdentity, projectId);
  errors.push(...identityCheck.errors);

  if (!nonEmptyString(request?.id)) errors.push("CAD execution request id is required.");
  if (!nonEmptyString(request?.source)) errors.push("CAD execution source must be non-empty.");
  if (!nonEmptyString(request?.filename)) errors.push("CAD execution filename is required.");
  if (!Number.isFinite(request?.timeoutMs) || request.timeoutMs <= 0) {
    errors.push("CAD execution timeoutMs must be finite and positive.");
  }
  if (!nonEmptyString(context.providerId)) errors.push("Host-authored CAD provider id is required.");
  if (request?.backend !== execution.backend) {
    errors.push("CAD execution request backend does not match the worker result backend.");
  }

  const generatedAt = context.generatedAt ?? new Date().toISOString();
  if (!validDate(generatedAt)) errors.push("CAD provenance generatedAt must be a valid date string.");
  if (errors.length) return { errors };

  return {
    errors,
    provenance: {
      schemaVersion: 1,
      sourceType: "CAD_EXECUTION",
      projectId,
      modelIdentityId: context.modelIdentity.id,
      executionId: request.id,
      providerId: context.providerId.trim(),
      backend: request.backend,
      sourceSha256: createCADSourceSha256(request.source),
      sourceFilename: request.filename.trim(),
      ...(nonEmptyString(execution.sourceArtifactPath) ? { sourceArtifactUri: execution.sourceArtifactPath.trim() } : {}),
      generatedAt
    }
  };
}

/**
 * Converts worker-reported output paths into UNVALIDATED artifact records.
 * Provenance is attached only when a valid model identity, execution request,
 * source and host-authored provider identity are supplied.
 */
export function normalizeCADExecutionResult(
  projectId: string,
  execution: CADExecutionResult,
  context?: CADArtifactManifestContext
): CADArtifactManifest {
  const warnings = Array.isArray(execution?.warnings)
    ? execution.warnings.filter((value): value is string => typeof value === "string")
    : [];
  const errors: string[] = [];

  if (!nonEmptyString(projectId)) {
    return noArtifacts(warnings, ["CAD artifact manifest requires a non-empty project id."]);
  }
  if (!execution || typeof execution !== "object") {
    return noArtifacts(warnings, ["CAD execution result must be an object."]);
  }
  if (execution.success !== true) {
    errors.push("CAD worker execution did not succeed; returned paths are not registered as artifacts.");
    if (nonEmptyString(execution.error)) errors.push(execution.error);
    return noArtifacts(warnings, errors);
  }
  if (!Array.isArray(execution.warnings)) {
    warnings.push("Worker warnings were missing or malformed.");
  }

  let provenance: CADExecutionProvenance | undefined;
  if (context) {
    const result = buildProvenance(projectId.trim(), execution, context);
    if (result.errors.length || !result.provenance) {
      return noArtifacts(warnings, result.errors.length ? result.errors : ["CAD provenance could not be established."]);
    }
    provenance = result.provenance;
  } else {
    warnings.push("No model/source provenance context was supplied; generated artifacts remain unverified.");
  }

  const paths: Array<[CADArtifactKind, unknown]> = [
    ["SOURCE", execution.sourceArtifactPath],
    ["SOLID", execution.solidArtifactPath],
    ["STEP", execution.stepArtifactPath],
    ["STL", execution.stlArtifactPath],
    ["THREE_MF", execution.threeMfArtifactPath]
  ];
  const seenPaths = new Set<string>();
  const artifacts: CADArtifact[] = [];
  const token = provenance
    ? stableArtifactToken(projectId.trim(), provenance.executionId, provenance.sourceSha256, provenance.providerId)
    : String(Date.now());

  for (const [kind, rawPath] of paths) {
    if (rawPath === undefined || rawPath === null) continue;
    if (!nonEmptyString(rawPath)) {
      warnings.push("Ignored an empty or malformed path for CAD artifact kind " + kind + ".");
      continue;
    }
    const path = rawPath.trim();
    if (seenPaths.has(path)) {
      warnings.push("Ignored duplicate CAD artifact path reported for kind " + kind + ".");
      continue;
    }
    seenPaths.add(path);
    const artifactId = projectId.trim() + "-cad-" + token + "-" + kind.toLowerCase();
    const artifact: CADArtifact = {
      id: artifactId,
      kind,
      name: basename(path),
      uri: path,
      backend: execution.backend,
      ...(context?.request.parameters ? { parameters: { ...context.request.parameters } } : {}),
      validationStatus: "UNVALIDATED",
      informationStatus: "CALCULATED",
      evidenceIds: [],
      ...(context?.requirementIds ? { requirementIds: [...context.requirementIds] } : {}),
      createdAt: provenance?.generatedAt ?? new Date().toISOString(),
      ...(provenance ? { provenance: { ...provenance, outputUri: path } } : {})
    };
    artifacts.push(artifact);
  }

  if (artifacts.length === 0) warnings.push("Worker reported success but supplied no supported artifact paths.");
  return { artifacts, warnings, errors, ...(provenance ? { provenance } : {}) };
}
