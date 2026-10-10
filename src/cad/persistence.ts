import type { CADArtifactKind } from "./artifacts.js";
import type { CADPartCompletionResult } from "./completion.js";

export const CAD_ARTIFACT_BUCKET = "engineering-cad-artifacts";
export const CAD_SIGNED_URL_TTL_SECONDS = 300;

const ARTIFACT_EXTENSIONS: Partial<Record<CADArtifactKind, string>> = {
  SOURCE: "py",
  SOLID: "brep",
  STEP: "step",
  STL: "stl",
  THREE_MF: "3mf"
};

const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;

export function cadArtifactStoragePath(input: {
  projectId: string;
  modelIdentityId: string;
  executionId: string;
  kind: CADArtifactKind;
}): string {
  const { projectId, modelIdentityId, executionId, kind } = input;
  if (![projectId, modelIdentityId, executionId].every((part) => SAFE_SEGMENT.test(part))) {
    throw new Error("CAD artifact storage identity contains an unsafe path segment.");
  }
  const extension = ARTIFACT_EXTENSIONS[kind];
  if (!extension) throw new Error("Unsupported CAD artifact kind cannot be persisted.");
  return projectId + "/" + modelIdentityId + "/" + executionId + "/" + kind.toLowerCase() + "." + extension;
}

export function cadArtifactStorageUri(objectPath: string): string {
  if (!objectPath || objectPath.startsWith("/") || objectPath.split("/").some((part) => !SAFE_SEGMENT.test(part) && !/^[a-z0-9_.-]+$/.test(part))) {
    throw new Error("CAD artifact storage object path is invalid.");
  }
  return "storage://" + CAD_ARTIFACT_BUCKET + "/" + objectPath;
}

/** Never persist ACCEPTED/VERIFIED until the bundle and its exact validation evidence agree. */
export function isVerifiedCADCompletion(result: CADPartCompletionResult): boolean {
  const bundle = result?.bundle;
  if (result?.status !== "ACCEPTED" || result.acceptance?.status !== "ACCEPTED" ||
      result.acceptance.acceptance?.accepted !== true || !bundle) return false;
  if (bundle.cad.kind !== "SOLID" || bundle.cad.validationStatus !== "PASS" ||
      bundle.cad.informationStatus !== "VERIFIED" || bundle.engineering.validationStatus !== "PASS" ||
      bundle.engineering.informationStatus !== "VERIFIED") return false;
  if (bundle.evidence.type !== "GEOMETRY_CHECK" || bundle.evidence.status !== "VERIFIED" ||
      !bundle.evidence.artifactIds?.includes(bundle.cad.id) ||
      !bundle.evidence.artifactIds.includes(bundle.engineering.id)) return false;
  const receipt = bundle.evidence.value;
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) return false;
  const record = receipt as Record<string, unknown>;
  const validation = record.validation;
  return typeof record.artifactSha256 === "string" && /^[a-f0-9]{64}$/.test(record.artifactSha256) &&
    record.artifactSha256 === bundle.cad.provenance?.artifactSha256 &&
    record.artifactId === bundle.cad.id &&
    record.sourceSha256 === bundle.cad.provenance?.sourceSha256 &&
    typeof record.validatorProviderId === "string" && record.validatorProviderId.trim().length > 0 &&
    record.validatorProviderId !== bundle.cad.provenance?.providerId &&
    typeof record.validatorVersion === "string" && record.validatorVersion.trim().length > 0 &&
    typeof record.checkedAt === "string" && !Number.isNaN(Date.parse(record.checkedAt)) &&
    !!validation && typeof validation === "object" && !Array.isArray(validation) &&
    (validation as Record<string, unknown>).valid === true &&
    (validation as Record<string, unknown>).solidCount === 1;
}
