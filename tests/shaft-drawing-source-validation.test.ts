import { describe, expect, it } from "vitest";
import type { CanonicalSolid, Completion, Row } from "../src/cad/geometry-revision-persistence-types.js";
import { DrawingGenerationError } from "../app/api/cad/drawings/generate/errors.js";
import { extractCylinderDimensions } from "../app/api/cad/drawings/generate/shaft-dimensions.js";
import { validateRevisionArtifactBinding } from "../app/api/cad/drawings/generate/source-validation.js";

const revision = {
  id: "a9d4aef0-1f23-4f2d-9e67-21e0f87b3d01",
  canonical_artifact_id: "solid-1",
  canonical_artifact_sha256: "a".repeat(64),
  storage_bucket: "engineering-cad-artifacts",
  storage_object_name: "project/model/execution/solid.brep"
} as unknown as Row;

function makeCompletion(overrides: Record<string, unknown> = {}): Completion {
  return {
    specification: { kind: "CYLINDER", name: "shaft", diameterMm: 20, lengthMm: 200 },
    validation_receipt: {
      artifactSha256: "a".repeat(64),
      projectId: "project-1",
      artifactId: "solid-1",
      modelIdentityId: "model-1",
      checkedBy: "validator",
      validatorProviderId: "occt-validator",
      validatorVersion: "1.0.0",
      checkedAt: "2026-11-15T12:00:00.000Z",
      validation: { valid: true },
      geometryMeasurements: {
        boundingBoxMm: { x: 20.005, y: 19.995, z: 200.005 },
        dimensionChecks: [
          { axis: "x", actualMm: 20.005, expectedMm: 20, toleranceMm: 0.01, passed: true },
          { axis: "y", actualMm: 19.995, expectedMm: 20, toleranceMm: 0.01, passed: true },
          { axis: "z", actualMm: 200.005, expectedMm: 200, toleranceMm: 0.01, passed: true }
        ]
      }
    },
    ...overrides
  } as unknown as Completion;
}

describe("source-bound shaft drawing dimensions", () => {
  it("derives dimensions from accepted geometry using validator-provided axis tolerances", () => {
    const result = extractCylinderDimensions({
      completion: makeCompletion(), revision, projectId: "project-1",
      modelIdentityId: "model-1", solidId: "solid-1"
    });
    expect(result.diameterMm).toBe(20);
    expect(result.lengthMm).toBe(200.005);
  });

  it("rejects non-shaft CAD specifications", () => {
    const completion = makeCompletion({ specification: { kind: "CYLINDER", name: "roller", diameterMm: 20, lengthMm: 200 } });
    expect(() => extractCylinderDimensions({
      completion, revision, projectId: "project-1", modelIdentityId: "model-1", solidId: "solid-1"
    })).toThrowError(DrawingGenerationError);
  });

  it("rejects a geometry receipt bound to another model or artifact", () => {
    const completion = makeCompletion({
      validation_receipt: {
        ...makeCompletion().validation_receipt as object,
        modelIdentityId: "other-model"
      }
    });
    expect(() => extractCylinderDimensions({
      completion, revision, projectId: "project-1", modelIdentityId: "model-1", solidId: "solid-1"
    })).toThrowError(DrawingGenerationError);
  });

  it("rejects dimension checks that fail or exceed the accepted CAD specification", () => {
    const base = makeCompletion();
    const receipt = base.validation_receipt as Record<string, unknown>;
    const measurements = receipt.geometryMeasurements as Record<string, unknown>;
    const checks = measurements.dimensionChecks as Array<Record<string, unknown>>;
    const completion = makeCompletion({
      validation_receipt: {
        ...receipt,
        geometryMeasurements: {
          ...measurements,
          dimensionChecks: checks.map((check, index) => index === 0 ? { ...check, passed: false } : check)
        }
      }
    });
    expect(() => extractCylinderDimensions({
      completion, revision, projectId: "project-1", modelIdentityId: "model-1", solidId: "solid-1"
    })).toThrowError(DrawingGenerationError);
  });

  it("binds immutable geometry revisions to the canonical solid digest and storage object", () => {
    const solid = {
      id: "solid-1",
      provenance: { artifactSha256: "a".repeat(64) },
      objectPath: "project/model/execution/solid.brep"
    } as unknown as CanonicalSolid;
    expect(() => validateRevisionArtifactBinding(revision, solid)).not.toThrow();
    expect(() => validateRevisionArtifactBinding(revision, {
      ...solid, provenance: { artifactSha256: "b".repeat(64) }
    } as unknown as CanonicalSolid)).toThrowError(DrawingGenerationError);
  });
});
