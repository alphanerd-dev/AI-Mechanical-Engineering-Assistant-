/**
 * Browser-safe freshness logic for persisted engineering artifacts.
 *
 * The validation receipt remains historical evidence for exact inputs/outputs.
 * It does not mean the artifact is current for a later workspace revision.
 */
export interface CalculationArtifactFreshnessInput {
  workspaceRevision: number;
}

export function isCalculationArtifactStale(
  artifact: CalculationArtifactFreshnessInput,
  currentWorkspaceRevision: number
): boolean {
  return !Number.isSafeInteger(currentWorkspaceRevision) ||
    currentWorkspaceRevision !== artifact.workspaceRevision;
}
