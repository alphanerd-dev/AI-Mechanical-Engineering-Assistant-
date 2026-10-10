import { createHash } from "node:crypto";
import { CADExecutionBackend } from "./execution.js";
import { CADArtifactProvenance } from "./artifacts.js";

export interface CADProvenanceExpectation {
  projectId?: string;
  modelIdentityId?: string;
  executionId?: string;
  providerId?: string;
  backend?: string;
  outputUri?: string;
}

export interface CADProvenanceValidation {
  status: "PASS" | "FAIL";
  errors: string[];
}

/** SHA-256 of the exact UTF-8 CAD source text; not a digest of output geometry bytes. */
export function createCADSourceSha256(source: string): string {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validDate(value: unknown): value is string {
  return nonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

export function validateCADArtifactProvenance(
  value: unknown,
  expected: CADProvenanceExpectation = {}
): CADProvenanceValidation {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { status: "FAIL", errors: ["CAD artifact provenance must be an object."] };
  }

  if (value.schemaVersion !== 1) errors.push("Unsupported CAD artifact provenance schema version.");
  if (value.sourceType !== "CAD_EXECUTION") errors.push("CAD artifact provenance sourceType must be CAD_EXECUTION.");

  for (const key of ["projectId", "modelIdentityId", "executionId", "providerId", "sourceFilename", "outputUri"] as const) {
    if (!nonEmptyString(value[key])) errors.push("CAD artifact provenance " + key + " is required.");
  }

  if (value.backend !== "build123d" && value.backend !== "cadquery") {
    errors.push("CAD artifact provenance backend is unsupported.");
  }
  if (typeof value.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sourceSha256)) {
    errors.push("CAD artifact provenance sourceSha256 must be a lowercase SHA-256 digest.");
  }
  if (!validDate(value.generatedAt)) errors.push("CAD artifact provenance generatedAt must be a valid date string.");
  if (value.sourceArtifactUri !== undefined && !nonEmptyString(value.sourceArtifactUri)) {
    errors.push("CAD artifact provenance sourceArtifactUri must be non-empty when supplied.");
  }
  if (value.artifactSha256 !== undefined && (typeof value.artifactSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.artifactSha256))) {
    errors.push("CAD artifact provenance artifactSha256 must be a lowercase SHA-256 digest when supplied.");
  }

  const comparisons: Array<[keyof CADProvenanceExpectation, string]> = [
    ["projectId", "projectId"],
    ["modelIdentityId", "modelIdentityId"],
    ["executionId", "executionId"],
    ["providerId", "providerId"],
    ["backend", "backend"],
    ["outputUri", "outputUri"]
  ];
  for (const [expectedKey, valueKey] of comparisons) {
    const expectedValue = expected[expectedKey];
    if (expectedValue !== undefined && value[valueKey] !== expectedValue) {
      errors.push("CAD artifact provenance " + valueKey + " does not match the expected value.");
    }
  }

  return { status: errors.length ? "FAIL" : "PASS", errors };
}

export function isCADExecutionBackend(value: unknown): value is CADExecutionBackend {
  return value === "build123d" || value === "cadquery";
}

/** Type guard for consumers that receive provenance metadata from a persistence boundary. */
export function isCADArtifactProvenance(value: unknown): value is CADArtifactProvenance {
  return validateCADArtifactProvenance(value).status === "PASS";
}
