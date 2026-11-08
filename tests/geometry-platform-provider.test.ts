import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { CADCapabilityRouter } from "../src/cad/routing.js";
import type { CADModelIdentity } from "../src/cad/identity.js";
import type { CADExecutionRequest, CADExecutionResult, CADWorkerExecutor } from "../src/cad/execution.js";
import { CADPartCompletionWorkflow } from "../src/cad/completion.js";
import { Build123dCADProvider } from "../src/providers/build123d-cad.js";
import { Build123dIntentCodeGenerator } from "../src/providers/build123d-intent-generator.js";
import { CADValidationProvider } from "../src/providers/cad-validation.js";
import { CADCompletionGeometryProvider } from "../src/geometry-platform/cad-completion-provider.js";

const identity: CADModelIdentity = {
  id: "geometry-model",
  projectId: "geometry-project",
  name: "Test shaft",
  nativeReferences: [],
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z"
};

class FakeExecutor implements CADWorkerExecutor {
  async execute(_request: CADExecutionRequest): Promise<CADExecutionResult> {
    return {
      success: true,
      backend: "build123d",
      sourceArtifactPath: "/artifacts/source.py",
      solidArtifactPath: "/artifacts/solid.brep",
      stepArtifactPath: "/artifacts/solid.step",
      stlArtifactPath: "/artifacts/solid.stl",
      threeMfArtifactPath: "/artifacts/solid.3mf",
      warnings: []
    };
  }
}

function makeProvider() {
  const build = new Build123dCADProvider(new FakeExecutor(), {
    createExecutionId: () => "geometry-execution",
    now: () => "2026-10-01T00:01:00.000Z"
  });
  const validator = new CADValidationProvider("occt", {
    validate: async () => ({
      valid: true,
      solidCount: 1,
      checkedBy: "OCCT BRepCheck",
      validatorVersion: "test",
      artifactSha256: "b".repeat(64),
      volumeMm3: Math.PI * 15 * 15 * 200,
      boundingBoxMm: { x: 30, y: 30, z: 200 },
      dimensionChecks: [
        { axis: "x", actualMm: 30, expectedMm: 30, toleranceMm: 0.01, passed: true },
        { axis: "y", actualMm: 30, expectedMm: 30, toleranceMm: 0.01, passed: true },
        { axis: "z", actualMm: 200, expectedMm: 200, toleranceMm: 0.01, passed: true }
      ],
      warnings: []
    })
  });
  const registry = new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  registry.register(build);
  registry.register(validator);
  const router = new CADCapabilityRouter(registry, [
    { providerId: "cad.build123d", availability: "AVAILABLE" },
    { providerId: "cad.occt", availability: "AVAILABLE" }
  ]);
  return new CADCompletionGeometryProvider(new CADPartCompletionWorkflow(
    router,
    new Build123dIntentCodeGenerator(),
    {
      now: () => "2026-10-01T00:02:00.000Z",
      createReceiptId: () => "geometry-receipt"
    }
  ));
}

describe("CADCompletionGeometryProvider", () => {
  it("exposes the bounded cylinder operation and maps accepted completion to success", async () => {
    const provider = makeProvider();
    expect(provider.supportedOperations).toEqual(["geometry.create_cylinder"]);
    const result = await provider.execute({
      operation: "geometry.create_cylinder",
      operationId: "op-001",
      context: {
        projectId: "geometry-project",
        modelIdentity: identity,
        units: "mm",
        coordinateFrame: "WORLD_Z_AXIS",
        tolerancePolicyId: "CYLINDER_DIMENSION_0_01_MM"
      },
      parameters: { name: "shaft", diameter: 30, length: 200 }
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(result.workflowStatus).toBe("ACCEPTED");
    expect(result.executionProviderId).toBe("cad.build123d");
    expect(result.validationProviderId).toBe("cad.occt");
    expect(result.artifacts.some((artifact) => artifact.kind === "SOLID")).toBe(true);
    expect(result.evidenceIds).toHaveLength(1);
    expect(result.engineeringArtifactId).toBeTruthy();
    expect(result.acceptanceStatus).toBe("ACCEPTED");
  });

  it("rejects invalid dimensions, units and coordinate frames before invoking CAD", async () => {
    const provider = makeProvider();
    const result = await provider.execute({
      operation: "geometry.create_cylinder",
      operationId: "op-invalid",
      context: {
        projectId: "geometry-project",
        modelIdentity: identity,
        units: "mm",
        coordinateFrame: "WORLD_Z_AXIS",
        tolerancePolicyId: "CYLINDER_DIMENSION_0_01_MM"
      },
      parameters: { diameter: 30, length: 200 }
    });
    expect(result.status).toBe("SUCCEEDED");

    const invalid = await provider.execute({
      operation: "geometry.create_cylinder",
      operationId: "op-invalid-frame",
      context: {
        projectId: "geometry-project",
        modelIdentity: identity,
        units: "mm",
        coordinateFrame: "WORLD_Z_AXIS",
        tolerancePolicyId: "CYLINDER_DIMENSION_0_01_MM"
      },
      parameters: { diameter: -1, length: 200 }
    });
    expect(invalid.status).toBe("FAILED");
    expect(invalid.stage).toBe("REQUEST_VALIDATION");
    expect(invalid.artifacts).toHaveLength(0);

    const invalidUnits = await provider.execute({
      operation: "geometry.create_cylinder",
      operationId: "op-invalid-units",
      context: {
        projectId: "geometry-project",
        modelIdentity: identity,
        units: "inch",
        coordinateFrame: "WORLD_Z_AXIS",
        tolerancePolicyId: "CYLINDER_DIMENSION_0_01_MM"
      },
      parameters: { diameter: 30, length: 200 }
    } as unknown as import("../src/geometry-platform/contracts.js").GeometryOperationRequest);
    expect(invalidUnits.status).toBe("FAILED");
    expect(invalidUnits.errors.join(" ")).toContain("millimetres only");

    const invalidFrame = await provider.execute({
      operation: "geometry.create_cylinder",
      operationId: "op-invalid-frame",
      context: {
        projectId: "geometry-project",
        modelIdentity: identity,
        units: "mm",
        coordinateFrame: "CUSTOM_FRAME",
        tolerancePolicyId: "CYLINDER_DIMENSION_0_01_MM"
      },
      parameters: { diameter: 30, length: 200 }
    } as unknown as import("../src/geometry-platform/contracts.js").GeometryOperationRequest);
    expect(invalidFrame.status).toBe("FAILED");
    expect(invalidFrame.errors.join(" ")).toContain("+Z only");
  });
});
