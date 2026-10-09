import { describe, expect, it } from "vitest";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { CADCapabilityRouter } from "../src/cad/routing.js";
import { CADModelIdentity } from "../src/cad/identity.js";
import { CADExecutionRequest, CADExecutionResult, CADWorkerExecutor } from "../src/cad/execution.js";
import { Build123dCADProvider } from "../src/providers/build123d-cad.js";

const modelIdentity: CADModelIdentity = {
  id: "model-bracket", projectId: "project-bracket", name: "Mounting bracket", nativeReferences: [],
  createdAt: "2026-10-09T10:00:00.000Z", updatedAt: "2026-10-09T10:00:00.000Z"
};

class FakeExecutor implements CADWorkerExecutor {
  requests: CADExecutionRequest[] = [];
  result: CADExecutionResult = {
    success: true, backend: "build123d", sourceArtifactPath: "/tmp/part.py",
    solidArtifactPath: "/tmp/part.brep", stepArtifactPath: "/tmp/part.step", warnings: []
  };
  async execute(request: CADExecutionRequest): Promise<CADExecutionResult> {
    this.requests.push(request);
    return this.result;
  }
}

function makeProvider(executor: FakeExecutor) {
  return new Build123dCADProvider(executor, {
    createExecutionId: () => "exec-fixed",
    now: () => "2026-10-09T10:05:00.000Z"
  });
}

const source = "from build123d import *\n# bracket geometry\n";
const input = {
  projectId: "project-bracket", modelIdentity, source,
  filename: "../bracket.py", backend: "build123d", timeoutMs: 15_000,
  parameters: { widthMm: 60, thicknessMm: 4 }, requirementIds: ["REQ-MOUNT"]
};

describe("Build123dCADProvider", () => {
  it("registers artifacts with canonical model, provider and source provenance", async () => {
    const executor = new FakeExecutor();
    const result = await makeProvider(executor).execute({
      capability: "CAD.CREATE_PART", risk: "MEDIUM", input
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe("cad.build123d");
    expect(result.artifactIds).toHaveLength(3);
    expect(executor.requests[0].id).toBe("exec-fixed");
    expect(executor.requests[0].filename).toBe("bracket.py");
    expect(result.output).toMatchObject({
      projectId: "project-bracket", modelIdentityId: "model-bracket",
      executionId: "exec-fixed", backend: "build123d",
      solidArtifactId: expect.any(String),
      provenance: { providerId: "cad.build123d", sourceFilename: "bracket.py" }
    });
  });

  it("rejects part creation when the runtime returns no solid", async () => {
    const executor = new FakeExecutor();
    executor.result = { success: true, backend: "build123d", sourceArtifactPath: "/tmp/part.py", warnings: [] };
    const result = await makeProvider(executor).execute({ capability: "CAD.CREATE_PART", risk: "MEDIUM", input });
    expect(result.success).toBe(false);
    expect(result.error).toContain("requires a worker-reported solid artifact");
  });

  it("rejects mismatched project/model identity before execution", async () => {
    const executor = new FakeExecutor();
    const result = await makeProvider(executor).execute({
      capability: "CAD.CREATE_PART", risk: "MEDIUM",
      input: { ...input, projectId: "different-project" }
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("different project");
    expect(executor.requests).toHaveLength(0);
  });

  it("rejects unsupported backends and excessive timeouts before execution", async () => {
    const executor = new FakeExecutor();
    const provider = makeProvider(executor);
    const backendResult = await provider.execute({
      capability: "CAD.CREATE_PART", risk: "MEDIUM", input: { ...input, backend: "cadquery" }
    });
    const timeoutResult = await provider.execute({
      capability: "CAD.EXECUTE_GENERATED_SOURCE", risk: "HIGH", input: { ...input, timeoutMs: 90_000 }
    });
    expect(backendResult.success).toBe(false);
    expect(timeoutResult.success).toBe(false);
    expect(executor.requests).toHaveLength(0);
  });

  it("allows source-only execution but does not call it part creation", async () => {
    const executor = new FakeExecutor();
    executor.result = { success: true, backend: "build123d", sourceArtifactPath: "/tmp/part.py", warnings: [] };
    const result = await makeProvider(executor).execute({
      capability: "CAD.EXECUTE_GENERATED_SOURCE", risk: "HIGH", input
    });
    expect(result.success).toBe(true);
    expect(result.artifactIds).toHaveLength(1);
    expect(result.output).toMatchObject({ executionId: "exec-fixed", backend: "build123d" });
    expect((result.output as Record<string, unknown>).solidArtifactId).toBeUndefined();
  });

  it("routes only when trusted host configuration marks the provider AVAILABLE", async () => {
    const executor = new FakeExecutor();
    const provider = makeProvider(executor);
    const registry = new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.register(provider);

    const unavailable = new CADCapabilityRouter(registry, [
      { providerId: "cad.build123d", availability: "UNAVAILABLE", reason: "Worker is not configured." }
    ]);
    expect(unavailable.plan({
      capability: "CAD.CREATE_PART", input, risk: "MEDIUM", requiredProviderId: "cad.build123d"
    }).status).toBe("BLOCKED");

    const available = new CADCapabilityRouter(registry, [
      { providerId: "cad.build123d", availability: "AVAILABLE" }
    ]);
    const result = await available.execute({
      capability: "CAD.CREATE_PART", input, risk: "MEDIUM", requiredProviderId: "cad.build123d"
    });
    expect(result.status).toBe("EXECUTED");
    expect(result.selectedProviderId).toBe("cad.build123d");
  });
});
