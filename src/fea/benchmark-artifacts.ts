import type { FEAStaticStructuralResult } from "./types.js";
const SHA256 = /^[a-f0-9]{64}$/;
function safeRelativePath(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim() || value.startsWith("/")) return false;
  return !value.split(/[\\/]/).includes("..");
}
function validKind(value: unknown): boolean {
  return value === "FEA_MODEL" || value === "FEA_RESULT";
}
function validArtifact(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as Record<string, unknown>;
  return validKind(artifact.kind) &&
    safeRelativePath(artifact.path) &&
    typeof artifact.mediaType === "string" && artifact.mediaType.trim().length > 0 &&
    typeof artifact.sha256 === "string" && SHA256.test(artifact.sha256);
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
