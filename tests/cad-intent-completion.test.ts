import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { CADCapabilityRouter } from "../src/cad/routing.js";
import { CADModelIdentity } from "../src/cad/identity.js";
import { CADExecutionRequest, CADExecutionResult, CADWorkerExecutor } from "../src/cad/execution.js";
import { CADPartCompletionWorkflow } from "../src/cad/completion.js";
import { parseCADPartIntent } from "../src/cad/intent.js";
import { Build123dCADProvider } from "../src/providers/build123d-cad.js";
import { Build123dIntentCodeGenerator } from "../src/providers/build123d-intent-generator.js";
import { CADValidationProvider } from "../src/providers/cad-validation.js";

const modelIdentity: CADModelIdentity = {
  id: "model-shaft",
  projectId: "project-shaft",
  name: "Transmission shaft",
  nativeReferences: [],
  createdAt: "2026-10-09T10:00:00.000Z",
  updatedAt: "2026-10-09T10:00:00.000Z"
};

class FakeExecutor implements CADWorkerExecutor {
  requests: CADExecutionRequest[] = [];
  result: CADExecutionResult = {
    success: true,
    backend: "build123d",
    sourceArtifactPath: "/artifacts/shaft.py",
    solidArtifactPath: "/artifacts/part.brep",
    stepArtifactPath: "/artifacts/part.step",
    stlArtifactPath: "/artifacts/part.stl",
    threeMfArtifactPath: "/artifacts/part.3mf",
    warnings: []
  };

  async execute(request: CADExecutionRequest): Promise<CADExecutionResult> {
    this.requests.push(request);
    return this.result;
  }
}

function makeWorkflow(options: {
  validationAvailability?: "AVAILABLE" | "UNAVAILABLE";
  validation?: Record<string, unknown>;
} = {}) {
  const executor = new FakeExecutor();
  const build123d = new Build123dCADProvider(executor, {
    createExecutionId: () => "execution-shaft",
    now: () => "2026-10-10T00:30:00.000Z"
  });
  const validationOutput = {
    valid: true,
    solidCount: 1,
    checkedBy: "occt.brepcheck",
    validatorVersion: "build123d-0.13.0/OCCT-BRepCheck",
    artifactSha256: "a".repeat(64),
    volumeMm3: Math.PI * 15 * 15 * 200,
    boundingBoxMm: { x: 30, y: 30, z: 200 },
    dimensionChecks: [
      { axis: "x", actualMm: 30, expectedMm: 30, toleranceMm: 0.01, passed: true },
      { axis: "y", actualMm: 30, expectedMm: 30, toleranceMm: 0.01, passed: true },
      { axis: "z", actualMm: 200, expectedMm: 200, toleranceMm: 0.01, passed: true }
    ],
    warnings: [],
    ...(options.validation ?? {})
  };
  const validator = new CADValidationProvider("occt", {
    validate: async () => validationOutput
  });
  const registry = new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  registry.register(build123d);
  registry.register(validator);
  const router = new CADCapabilityRouter(registry, [
    { providerId: "cad.build123d", availability: "AVAILABLE" },
    {
      providerId: "cad.occt",
      availability: options.validationAvailability ?? "AVAILABLE",
      reason: "Independent geometry validator is not configured."
    }
  ]);
  const workflow = new CADPartCompletionWorkflow(router, new Build123dIntentCodeGenerator(), {
    now: () => "2026-10-10T00:31:00.000Z",
    createReceiptId: () => "receipt-shaft",
    timeoutMs: 30_000
  });
  return { workflow, executor };
}

const shaftIntent = "Create a cylindrical shaft with a diameter of 30 mm and a length of 200 mm.";

describe("bounded CAD intent interpretation", () => {
  it("normalizes explicit dimensions into millimetres", () => {
    const result = parseCADPartIntent("Create a shaft with a diameter of 1.2 inches and a length of 10 cm.");
    expect(result.status).toBe("READY");
    if (result.status !== "READY") throw new Error("Expected a parsed shaft specification.");
    expect(result.specification).toMatchObject({
      kind: "CYLINDER",
      name: "shaft",
      diameterMm: 30.48,
      lengthMm: 100
    });
  });

  it("asks for missing dimensions instead of inventing them", () => {
    const result = parseCADPartIntent("Create a shaft with a diameter of 30 mm.");
    expect(result.status).toBe("NEEDS_INPUT");
    if (result.status !== "NEEDS_INPUT") throw new Error("Expected missing-input response.");
    expect(result.missingInputs).toContain("length");
    expect(result.nextQuestion).toContain("length");
  });

  it("rejects unsupported shapes and ambiguous dimensional values", () => {
    expect(parseCADPartIntent("Create a bracket 40 mm long.").status).toBe("UNSUPPORTED");
    const ambiguous = parseCADPartIntent("Create a shaft with a diameter of 20 mm and a diameter of 30 mm, with a length of 100 mm.");
    expect(ambiguous.status).toBe("NEEDS_INPUT");
    if (ambiguous.status !== "NEEDS_INPUT") throw new Error("Expected ambiguity to require clarification.");
    expect(ambiguous.nextQuestion).toContain("conflicting diameter");
  });

  it("rejects dimensions outside the bounded generation range", () => {
    const result = parseCADPartIntent("Create a cylinder with a diameter of 20000 mm and a length of 200 mm.");
    expect(result.status).toBe("NEEDS_INPUT");
    if (result.status !== "NEEDS_INPUT") throw new Error("Expected out-of-range dimensions to be rejected.");
    expect(result.nextQuestion).toContain("between 0.01 mm and 10000 mm");
  });
});

describe("build123d deterministic source generator", () => {
  it("generates isolated-worker source and an explicit artifact manifest", async () => {
    const generated = await new Build123dIntentCodeGenerator().generate({
      specification: { kind: "CYLINDER", name: "shaft", diameterMm: 30, lengthMm: 200 }
    });
    expect(generated).toMatchObject({ backend: "build123d", filename: "shaft.py" });
    expect(generated.source).toContain("Cylinder(radius=15, height=200");
    expect(generated.source).toContain("export_brep");
    expect(generated.source).toContain("'solidArtifactPath': 'part.brep'");
    expect(generated.source).toContain("'stepArtifactPath': 'part.step'");
    expect(generated.source).toContain("CAD_ARTIFACT_DIR");
  });

  it("rejects malformed dimensions before source generation", async () => {
    await expect(new Build123dIntentCodeGenerator().generate({
      specification: { kind: "CYLINDER", name: "shaft", diameterMm: -1, lengthMm: 200 }
    })).rejects.toThrow("CAD specification was rejected");
  });
});

describe("end-to-end CAD part completion orchestration", () => {
  it("executes, validates the exact solid, and returns provenance-bound VERIFIED evidence", async () => {
    const { workflow, executor } = makeWorkflow();
    const result = await workflow.complete({
      projectId: "project-shaft",
      modelIdentity,
      rawIntent: shaftIntent,
      requirementIds: ["REQ-SHAFT"]
    });

    expect(result.status).toBe("ACCEPTED");
    expect(result.stage).toBe("ACCEPTANCE");
    expect(executor.requests).toHaveLength(1);
    expect(result.execution?.selectedProviderId).toBe("cad.build123d");
    expect(result.validation?.selectedProviderId).toBe("cad.occt");
    expect(result.bundle?.cad.informationStatus).toBe("VERIFIED");
    expect(result.bundle?.evidence.status).toBe("VERIFIED");
    expect(result.bundle?.evidence.requirementIds).toContain("REQ-SHAFT");
    expect(result.bundle?.cad.provenance?.sourceSha256).toBe(result.manifest?.provenance?.sourceSha256);
  });

  it("does not call providers when the natural-language intent is incomplete", async () => {
    const { workflow, executor } = makeWorkflow();
    const result = await workflow.complete({
      projectId: "project-shaft",
      modelIdentity,
      rawIntent: "Create a shaft with a diameter of 30 mm."
    });

    expect(result.status).toBe("NEEDS_INPUT");
    expect(result.stage).toBe("INTENT");
    expect(executor.requests).toHaveLength(0);
    expect(result.bundle).toBeUndefined();
  });

  it("leaves artifacts unverified when the independent validator is unavailable", async () => {
    const { workflow, executor } = makeWorkflow({ validationAvailability: "UNAVAILABLE" });
    const result = await workflow.complete({
      projectId: "project-shaft",
      modelIdentity,
      rawIntent: shaftIntent
    });

    expect(result.status).toBe("INCOMPLETE");
    expect(result.stage).toBe("VALIDATION");
    expect(executor.requests).toHaveLength(1);
    expect(result.bundle).toBeUndefined();
    expect(result.warnings.join(" ")).toContain("unverified");
  });

  it("records failed geometry validation as REJECTED, never VERIFIED", async () => {
    const { workflow } = makeWorkflow({
      validation: { valid: false, solidCount: 1, checkedBy: "occt", warnings: ["invalid topology"] }
    });
    const result = await workflow.complete({
      projectId: "project-shaft",
      modelIdentity,
      rawIntent: shaftIntent
    });

    expect(result.status).toBe("REJECTED");
    expect(result.bundle?.cad.validationStatus).toBe("FAIL");
    expect(result.bundle?.cad.informationStatus).toBe("CALCULATED");
    expect(result.bundle?.evidence.status).toBe("CALCULATED");
  });

  it("does not accept a success boolean without measured dimensions and output digest", async () => {
    const { workflow } = makeWorkflow({ validation: { dimensionChecks: [], artifactSha256: "bad" } });
    const result = await workflow.complete({ projectId: "project-shaft", modelIdentity, rawIntent: shaftIntent });
    expect(result.status).toBe("INCOMPLETE");
    expect(result.stage).toBe("VALIDATION");
    expect(result.bundle).toBeUndefined();
  });

  it("rejects contradictory validator claims that report multiple solids", async () => {
    const { workflow } = makeWorkflow({ validation: { solidCount: 2 } });
    const result = await workflow.complete({ projectId: "project-shaft", modelIdentity, rawIntent: shaftIntent });
    expect(result.status).toBe("REJECTED");
    expect(result.bundle?.cad.informationStatus).toBe("CALCULATED");
    expect(result.bundle?.evidence.status).toBe("CALCULATED");
  });

  it("blocks rather than silently switching providers when the execution provider is unavailable", async () => {
    const executor = new FakeExecutor();
    const build123d = new Build123dCADProvider(executor, {
      createExecutionId: () => "execution-shaft",
      now: () => "2026-10-10T00:30:00.000Z"
    });
    const registry = new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.register(build123d);
    const router = new CADCapabilityRouter(registry, [
      { providerId: "cad.build123d", availability: "UNAVAILABLE", reason: "Docker runtime is not configured." }
    ]);
    const blocked = new CADPartCompletionWorkflow(router, new Build123dIntentCodeGenerator());
    const result = await blocked.complete({
      projectId: "project-shaft",
      modelIdentity,
      rawIntent: shaftIntent
    });

    expect(result.status).toBe("BLOCKED");
    expect(result.stage).toBe("EXECUTION");
    expect(executor.requests).toHaveLength(0);
  });
});
