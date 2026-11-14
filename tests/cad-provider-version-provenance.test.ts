import { describe, expect, it } from "vitest";
import { normalizeCADExecutionResult } from "../src/cad/artifact-manifest.js";

describe("CAD provider version provenance", () => {
  it("copies the host-controlled provider version into the execution and artifact provenance", () => {
    const result = normalizeCADExecutionResult("project-1", {
      success: true, backend: "build123d", solidArtifactPath: "/artifacts/part.brep", warnings: []
    }, {
      modelIdentity: {
        id: "cad-model-1", projectId: "project-1", name: "Test part", nativeReferences: [],
        revision: 1, createdAt: "2026-11-14T10:00:00.000Z", updatedAt: "2026-11-14T10:00:00.000Z"
      },
      request: {
        id: "execution-1", backend: "build123d", source: "from build123d import Cylinder",
        filename: "part.py", timeoutMs: 30000
      },
      providerId: "cad.build123d", providerVersion: "0.13.0",
      generatedAt: "2026-11-14T10:01:00.000Z"
    });
    const solid = result.artifacts.find((artifact) => artifact.kind === "SOLID");
    expect(result.errors).toEqual([]);
    expect(result.provenance?.providerVersion).toBe("0.13.0");
    expect(solid?.provenance?.providerVersion).toBe("0.13.0");
  });
});
