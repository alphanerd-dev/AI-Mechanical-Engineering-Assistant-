/**
 * Small, explicit CAD viewer registry.
 *
 * This registry describes presentation support only. It does not execute CAD,
 * fetch private objects, validate geometry, or promote artifact trust status.
 * Callers must obtain signed URLs through the project-authorized API.
 */
export type CADArtifactViewerMode =
  | "STL_PREVIEW"
  | "DOWNLOAD_ONLY"
  | "UNSUPPORTED";

export interface CADArtifactViewerRegistration {
  artifactKind: string;
  mode: CADArtifactViewerMode;
  previewAvailable: boolean;
  downloadAvailable: boolean;
  description: string;
  trustBoundary: string;
}

const CAD_ARTIFACT_VIEWERS: Readonly<Record<string, CADArtifactViewerRegistration>> = {
  SOURCE: {
    artifactKind: "SOURCE",
    mode: "DOWNLOAD_ONLY",
    previewAvailable: false,
    downloadAvailable: true,
    description: "Generated Python source; available as a project-scoped download.",
    trustBoundary: "Source code is provenance, not proof that the generated geometry is correct."
  },
  SOLID: {
    artifactKind: "SOLID",
    mode: "DOWNLOAD_ONLY",
    previewAvailable: false,
    downloadAvailable: true,
    description: "Canonical BREP solid; no browser BREP viewer is registered yet.",
    trustBoundary: "The BREP validation receipt applies only to the exact canonical solid bytes it identifies."
  },
  STEP: {
    artifactKind: "STEP",
    mode: "DOWNLOAD_ONLY",
    previewAvailable: false,
    downloadAvailable: true,
    description: "STEP exchange representation; available as a project-scoped download.",
    trustBoundary: "A validated BREP does not validate this STEP representation."
  },
  STL: {
    artifactKind: "STL",
    mode: "STL_PREVIEW",
    previewAvailable: true,
    downloadAvailable: true,
    description: "Read-only triangle-mesh preview using the existing bounded STL renderer.",
    trustBoundary: "This is a display derivative. Its preview does not establish mesh quality or inherit BREP validation."
  },
  THREE_MF: {
    artifactKind: "THREE_MF",
    mode: "DOWNLOAD_ONLY",
    previewAvailable: false,
    downloadAvailable: true,
    description: "3MF manufacturing representation; available as a project-scoped download.",
    trustBoundary: "A validated BREP does not validate this 3MF representation."
  },
  DRAWING: {
    artifactKind: "DRAWING",
    mode: "DOWNLOAD_ONLY",
    previewAvailable: false,
    downloadAvailable: true,
    description: "CAD drawing artifact; available as a project-scoped download.",
    trustBoundary: "No drawing renderer or drawing-standard validation is implied."
  }
};

const UNSUPPORTED: CADArtifactViewerRegistration = {
  artifactKind: "UNKNOWN",
  mode: "UNSUPPORTED",
  previewAvailable: false,
  downloadAvailable: false,
  description: "No viewer or download policy is registered for this artifact kind.",
  trustBoundary: "Unknown artifact kinds fail closed and must not be rendered by inference."
};

/**
 * Resolve presentation support from the artifact kind alone.
 * Validation and evidence fields are deliberately not accepted as inputs:
 * viewer selection must never upgrade or alter engineering trust state.
 */
export function resolveCADArtifactViewer(kind: unknown): CADArtifactViewerRegistration {
  if (typeof kind !== "string") return { ...UNSUPPORTED };
  const normalized = kind.trim().toUpperCase();
  const registration = CAD_ARTIFACT_VIEWERS[normalized];
  return registration ? { ...registration } : { ...UNSUPPORTED, artifactKind: normalized || "UNKNOWN" };
}

/** Return a stable snapshot of registered CAD presentation policies for tests and diagnostics. */
export function listCADArtifactViewers(): CADArtifactViewerRegistration[] {
  return Object.values(CAD_ARTIFACT_VIEWERS).map((registration) => ({ ...registration }));
}
