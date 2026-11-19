import type { FEAStaticStructuralResult } from "./types.js";
const SHA256 = /^[a-f0-9]{64}$/;
function hasNonEmptyPath(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isAbsoluteArtifactPath(value: string): boolean {
  return value.startsWith("/") || value.charCodeAt(0) === 92 || /^[A-Za-z]:/.test(value);
}
function hasSafeArtifactSegments(value: string): boolean {
  return value.split(/[\\/]/).every(segment =>
    segment.length > 0 && segment !== "." && segment !== ".."
  );
}
function safeRelativePath(value: unknown): boolean {
  if (!hasNonEmptyPath(value)) return false;
  if (isAbsoluteArtifactPath(value)) return false;
  if (value.includes(String.fromCharCode(0))) return false;
  return hasSafeArtifactSegments(value);
}
function validKind(value: unknown): boolean {
  return value === "FEA_MODEL" || value === "FEA_RESULT";
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function hasMediaType(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
function hasSha256(value: unknown): boolean {
  return typeof value === "string" && SHA256.test(value);
}
function validArtifact(value: unknown): value is Record<string, unknown> {
  if (!isRecord(value)) return false;
  const artifactChecks = [
    validKind(value.kind),
    safeRelativePath(value.path),
    hasMediaType(value.mediaType),
    hasSha256(value.sha256)
  ];
  return artifactChecks.every(Boolean);
}
function hasRequiredKinds(kinds: Set<string>): boolean {
  return kinds.has("FEA_MODEL") && kinds.has("FEA_RESULT");
}
export function validateFEAArtifactManifest(result: FEAStaticStructuralResult): string[] {
  if (!Array.isArray(result.artifacts) || result.artifacts.length < 4) {
    return ["The FEA worker did not return the complete solver artifact manifest."];
  }
  const errors: string[] = [];
  const kinds = new Set<string>();
  for (const artifact of result.artifacts) {
    if (!validArtifact(artifact)) {
      errors.push("An FEA artifact has malformed metadata or an unsafe path.");
      continue;
    }
    kinds.add(String(artifact.kind));
  }
  if (!hasRequiredKinds(kinds)) errors.push("The FEA model and result artifact kinds are both required.");
  return errors;
}
