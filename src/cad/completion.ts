import { randomUUID } from "node:crypto";
import { CapabilityRisk } from "../core/types.js";
import { CADCodeGenerator } from "../providers/cad-code.js";
import { CADArtifact, CADExecutionProvenance, GeometryValidation } from "./artifacts.js";
import { CADArtifactManifest } from "./artifact-manifest.js";
import { CADArtifactBundle, CADArtifactBundleResult, CADValidationReceipt, createCADArtifactBundleFromManifest } from "./artifact-bridge.js";
import { CADModelIdentity, validateCADModelIdentity } from "./identity.js";
import { CADIntentResolution, CADPartSpecification, parseCADPartIntent } from "./intent.js";
import { CADCapabilityRouter, CADRoutingResult } from "./routing.js";
import { createCADSourceSha256 } from "./provenance.js";

export type CADPartCompletionStatus =
  | "ACCEPTED"
  | "REJECTED"
  | "INCOMPLETE"
  | "NEEDS_INPUT"
  | "UNSUPPORTED"
  | "BLOCKED"
  | "FAILED";

export type CADPartCompletionStage =
  | "INTENT"
  | "SOURCE_GENERATION"
  | "EXECUTION"
  | "VALIDATION"
  | "ACCEPTANCE";

export interface CADPartCompletionRequest {
  projectId: string;
  modelIdentity: CADModelIdentity;
  rawIntent: string;
  requirementIds?: string[];
  risk?: CapabilityRisk;
}

export interface CADPartCompletionOptions {
  /** Must be explicitly AVAILABLE in the router's trusted host profile. */
  cadProviderId?: string;
  /** Must be a different provider from the CAD execution provider. */
  validationProviderId?: string;
  timeoutMs?: number;
  now?: () => string;
  createReceiptId?: () => string;
}

export interface CADPartCompletionResult {
  status: CADPartCompletionStatus;
  stage: CADPartCompletionStage;
  intent: CADIntentResolution;
  specification?: CADPartSpecification;
  source?: string;
  execution?: CADRoutingResult;
  validation?: CADRoutingResult;
  manifest?: CADArtifactManifest;
  acceptance?: CADArtifactBundleResult;
  bundle?: CADArtifactBundle;
  errors: string[];
  warnings: string[];
  nextQuestion?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return undefined;
  return value as string[];
}

function validSha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Successful validator verdicts need measured dimensions, not just a boolean claim. */
function validateCylinderMeasurements(value: Record<string, unknown>, specification: CADPartSpecification): string[] {
  const errors: string[] = [];
  if (typeof value.volumeMm3 !== "number" || !Number.isFinite(value.volumeMm3) || value.volumeMm3 <= 0) {
    errors.push("A successful geometry verdict must include a finite positive measured volume.");
  }
  if (!isRecord(value.boundingBoxMm)) {
    errors.push("A successful cylinder verdict must include measured boundingBoxMm dimensions.");
  }
  const checks = value.dimensionChecks;
  if (!Array.isArray(checks) || checks.length !== 3 || checks.some((item) => !isRecord(item))) {
    errors.push("A successful cylinder verdict must include exactly three measured dimension checks.");
    return errors;
  }
  const expected: Record<string, number> = {
    x: specification.diameterMm,
    y: specification.diameterMm,
    z: specification.lengthMm
  };
  const seen = new Set<string>();
  for (const item of checks as Record<string, unknown>[]) {
    const axis = item.axis;
    if (typeof axis !== "string" || !(axis in expected) || seen.has(axis)) {
      errors.push("Cylinder dimension checks must include each of x, y and z exactly once.");
      continue;
    }
    seen.add(axis);
    const target = expected[axis];
    const actual = item.actualMm;
    const expectedValue = item.expectedMm;
    const tolerance = item.toleranceMm;
    if (typeof actual !== "number" || !Number.isFinite(actual) || actual <= 0 ||
        typeof expectedValue !== "number" || !Number.isFinite(expectedValue) ||
        typeof tolerance !== "number" || !Number.isFinite(tolerance) || tolerance <= 0 || tolerance > 1 ||
        item.passed !== true) {
      errors.push("Cylinder dimension check for " + axis + " is malformed or failed.");
      continue;
    }
    if (Math.abs(expectedValue - target) > 1e-9 ||
        Math.abs(actual - target) > tolerance + target * 1e-6) {
      errors.push("Measured cylinder " + axis + " extent does not match the requested specification.");
    }
    const measuredBounds = value.boundingBoxMm;
    if (isRecord(measuredBounds) && typeof measuredBounds[axis] === "number" &&
        Math.abs((measuredBounds[axis] as number) - actual) > 1e-9) {
      errors.push("Cylinder dimension check " + axis + " does not match boundingBoxMm.");
    }
  }
  if (seen.size !== 3) errors.push("Cylinder dimension checks are incomplete.");
  return [...new Set(errors)];
}

function emptyResult(
  status: CADPartCompletionStatus,
  stage: CADPartCompletionStage,
  intent: CADIntentResolution,
  errors: string[] = [],
  warnings: string[] = [],
  nextQuestion?: string
): CADPartCompletionResult {
  return { status, stage, intent, errors, warnings, ...(nextQuestion ? { nextQuestion } : {}) };
}

/**
 * Coordinates the first end-to-end CAD completion path without owning a CAD runtime.
 * The host injects a source generator and configures the CAD router with explicit
 * execution and independent validation providers. Missing infrastructure fails closed.
 */
export class CADPartCompletionWorkflow {
  private readonly cadProviderId: string;
  private readonly validationProviderId: string;
  private readonly timeoutMs: number;
  private readonly now: () => string;
  private readonly createReceiptId: () => string;

  constructor(
    private readonly router: CADCapabilityRouter,
    private readonly sourceGenerator: CADCodeGenerator,
    options: CADPartCompletionOptions = {}
  ) {
    this.cadProviderId = options.cadProviderId ?? "cad.build123d";
    this.validationProviderId = options.validationProviderId ?? "cad.occt";
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createReceiptId = options.createReceiptId ?? randomUUID;

    if (!nonEmptyString(this.cadProviderId)) throw new Error("cadProviderId must be a non-empty provider id.");
    if (!nonEmptyString(this.validationProviderId)) throw new Error("validationProviderId must be a non-empty provider id.");
    if (this.cadProviderId === this.validationProviderId) {
      throw new Error("CAD execution and geometry validation must use distinct providers.");
    }
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("timeoutMs must be a positive integer.");
    }
  }

  async complete(request: CADPartCompletionRequest): Promise<CADPartCompletionResult> {
    const intent = parseCADPartIntent(request?.rawIntent);
    if (intent.status !== "READY") {
      const status = intent.status === "NEEDS_INPUT" ? "NEEDS_INPUT" : "UNSUPPORTED";
      return emptyResult(status, "INTENT", intent, [], intent.warnings, intent.status === "NEEDS_INPUT" ? intent.nextQuestion : undefined);
    }

    const projectId = typeof request.projectId === "string" ? request.projectId.trim() : "";
    if (!projectId) {
      return emptyResult("FAILED", "INTENT", intent, ["A server-resolved projectId is required."]);
    }
    const identityValidation = validateCADModelIdentity(request.modelIdentity, projectId);
    if (identityValidation.status !== "PASS") {
      return emptyResult("FAILED", "INTENT", intent, identityValidation.errors);
    }

    const rawRequirementIds = request.requirementIds ?? [];
    if (!Array.isArray(rawRequirementIds) || rawRequirementIds.some((id) => !nonEmptyString(id))) {
      return emptyResult("FAILED", "INTENT", intent, ["requirementIds must contain only non-empty strings when supplied."]);
    }
    const requirementIds = [...new Set(rawRequirementIds.map((id) => id.trim()))];

    let generated: { source: string; backend: "build123d" | "cadquery"; filename: string };
    try {
      generated = await this.sourceGenerator.generate({ specification: intent.specification });
    } catch (error) {
      return emptyResult(
        "FAILED",
        "SOURCE_GENERATION",
        intent,
        [error instanceof Error ? error.message : "CAD source generation failed."]
      );
    }

    if (!generated || !nonEmptyString(generated.source) ||
        (generated.backend !== "build123d" && generated.backend !== "cadquery") ||
        !nonEmptyString(generated.filename) ||
        /[\\/\r\n\0]/.test(generated.filename) ||
        !generated.filename.toLowerCase().endsWith(".py")) {
      return emptyResult("FAILED", "SOURCE_GENERATION", intent, ["Source generator returned an invalid source/backend/filename contract."]);
    }

    const sourceSha256 = createCADSourceSha256(generated.source);
    const execution = await this.router.execute({
      capability: "CAD.CREATE_PART",
      risk: request.risk ?? "MEDIUM",
      input: {
        projectId,
        modelIdentity: request.modelIdentity,
        backend: generated.backend,
        source: generated.source,
        filename: generated.filename,
        timeoutMs: this.timeoutMs,
        parameters: {
          kind: intent.specification.kind,
          name: intent.specification.name,
          diameterMm: intent.specification.diameterMm,
          lengthMm: intent.specification.lengthMm,
          units: "mm"
        },
        requirementIds
      },
      requiredProviderId: this.cadProviderId,
      allowFallback: false
    });

    if (execution.status === "BLOCKED") {
      return {
        ...emptyResult("BLOCKED", "EXECUTION", intent, [execution.reason ?? "CAD execution was blocked by provider policy."]),
        specification: intent.specification,
        source: generated.source,
        execution
      };
    }
    if (execution.status !== "EXECUTED" || !execution.providerResult?.success) {
      const providerError = execution.providerResult?.error ??
        [...execution.attempts].reverse().find((attempt) => attempt.error)?.error;
      return {
        ...emptyResult("FAILED", "EXECUTION", intent, [providerError ?? execution.reason ?? "CAD execution failed."]),
        specification: intent.specification,
        source: generated.source,
        execution
      };
    }

    const output = execution.providerResult.output;
    if (!isRecord(output) || !Array.isArray(output.artifacts) || !isRecord(output.provenance) ||
        !nonEmptyString(output.executionId) || output.projectId !== projectId ||
        output.modelIdentityId !== request.modelIdentity.id || output.backend !== generated.backend ||
        output.provenance.projectId !== projectId ||
        output.provenance.modelIdentityId !== request.modelIdentity.id ||
        output.provenance.executionId !== output.executionId ||
        output.provenance.providerId !== execution.selectedProviderId ||
        output.provenance.backend !== generated.backend ||
        output.provenance.sourceSha256 !== sourceSha256) {
      return {
        ...emptyResult("FAILED", "EXECUTION", intent, ["CAD provider output violated the artifact/provenance contract; acceptance is denied."]),
        specification: intent.specification,
        source: generated.source,
        execution
      };
    }

    const artifacts = output.artifacts as CADArtifact[];
    const manifest: CADArtifactManifest = {
      artifacts,
      warnings: stringArray(output.warnings) ?? [],
      errors: [],
      provenance: output.provenance as unknown as CADExecutionProvenance
    };
    const solid = artifacts.find((artifact) => isRecord(artifact) && artifact.kind === "SOLID");
    if (!solid || !nonEmptyString(solid.uri) || !isRecord(solid.provenance) ||
        solid.provenance.sourceSha256 !== sourceSha256 ||
        solid.provenance.modelIdentityId !== request.modelIdentity.id ||
        solid.provenance.projectId !== projectId ||
        solid.provenance.outputUri !== solid.uri) {
      return {
        ...emptyResult("FAILED", "EXECUTION", intent, ["CAD provider did not return a provenance-matched solid artifact."]),
        specification: intent.specification,
        source: generated.source,
        execution,
        manifest
      };
    }

    const validation = await this.router.execute({
      capability: "CAD.VALIDATE_GEOMETRY",
      risk: "MEDIUM",
      input: {
        projectId,
        artifactId: solid.id,
        artifactUri: solid.uri,
        artifactKind: solid.kind,
        backend: generated.backend,
        modelIdentityId: request.modelIdentity.id,
        executionId: output.executionId,
        providerId: execution.selectedProviderId,
        sourceSha256,
        parameters: {
          kind: intent.specification.kind,
          name: intent.specification.name,
          diameterMm: intent.specification.diameterMm,
          lengthMm: intent.specification.lengthMm,
          units: "mm"
        }
      },
      requiredProviderId: this.validationProviderId,
      allowFallback: false
    });

    if (validation.status !== "EXECUTED" || !validation.providerResult?.success) {
      const providerError = validation.providerResult?.error ??
        [...validation.attempts].reverse().find((attempt) => attempt.error)?.error;
      return {
        ...emptyResult(
          "INCOMPLETE",
          "VALIDATION",
          intent,
          [providerError ?? validation.reason ?? "Independent geometry validation is unavailable; artifact remains unverified."],
          ["CAD execution completed, but the artifact remains unverified because no accepted geometry-validation receipt was produced."]
        ),
        specification: intent.specification,
        source: generated.source,
        execution,
        validation,
        manifest
      };
    }

    const rawValidation = validation.providerResult.output;
    if (!isRecord(rawValidation) || typeof rawValidation.valid !== "boolean" ||
        !Number.isInteger(rawValidation.solidCount) || (rawValidation.solidCount as number) < 0 ||
        !nonEmptyString(rawValidation.checkedBy) || !nonEmptyString(rawValidation.validatorVersion) ||
        !validSha256(rawValidation.artifactSha256) || stringArray(rawValidation.warnings) === undefined ||
        validation.selectedProviderId !== this.validationProviderId) {
      return {
        ...emptyResult(
          "INCOMPLETE",
          "VALIDATION",
          intent,
          ["Geometry validator response is malformed or does not match the host-selected validator; artifact remains unverified."]
        ),
        specification: intent.specification,
        source: generated.source,
        execution,
        validation,
        manifest
      };
    }

    if (rawValidation.valid === true) {
      const measurementErrors = validateCylinderMeasurements(rawValidation, intent.specification);
      if (measurementErrors.length) {
        return {
          ...emptyResult(
            "INCOMPLETE",
            "VALIDATION",
            intent,
            measurementErrors,
            ["The validator claimed success without complete, specification-matched geometry measurements."]
          ),
          specification: intent.specification,
          source: generated.source,
          execution,
          validation,
          manifest
        };
      }
    }

    // Computed at the trusted host boundary; never accept an output-byte digest from generated CAD source.
    solid.provenance.artifactSha256 = rawValidation.artifactSha256;
    const checkedAt = this.now();
    const validationData: GeometryValidation = {
      valid: rawValidation.valid,
      solidCount: rawValidation.solidCount as number,
      checkedBy: rawValidation.checkedBy,
      warnings: stringArray(rawValidation.warnings) ?? []
    };
    const receipt: CADValidationReceipt = {
      id: this.createReceiptId(),
      projectId,
      artifactId: solid.id,
      modelIdentityId: request.modelIdentity.id,
      sourceSha256,
      backend: generated.backend,
      validatorProviderId: validation.selectedProviderId!,
      validatorVersion: rawValidation.validatorVersion as string,
      artifactSha256: rawValidation.artifactSha256 as string,
      checkedBy: validationData.checkedBy,
      checkedAt,
      validation: validationData
    };

    const acceptance = createCADArtifactBundleFromManifest(manifest, receipt, requirementIds);
    return {
      status: acceptance.status,
      stage: "ACCEPTANCE",
      intent,
      specification: intent.specification,
      source: generated.source,
      execution,
      validation,
      manifest,
      acceptance,
      ...(acceptance.bundle ? { bundle: acceptance.bundle } : {}),
      errors: [...acceptance.errors],
      warnings: [...acceptance.warnings]
    };
  }
}
