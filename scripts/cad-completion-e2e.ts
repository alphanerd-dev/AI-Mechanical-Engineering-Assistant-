import { resolve } from "node:path";
import { ENGINEERING_CAPABILITIES } from "../src/capabilities/catalog.js";
import { CapabilityRegistry } from "../src/capabilities/registry.js";
import { CADCapabilityRouter } from "../src/cad/routing.js";
import { CADPartCompletionWorkflow } from "../src/cad/completion.js";
import { CADModelIdentity } from "../src/cad/identity.js";
import { createDockerBuild123dCADProvider } from "../src/providers/build123d-cad.js";
import { Build123dIntentCodeGenerator } from "../src/providers/build123d-intent-generator.js";
import { createDockerOCCTValidationProvider } from "../src/providers/occt-docker.js";

async function main(): Promise<void> {
  const artifactRoot = resolve(".cad-completion-e2e");
  const image = "ai-mechanical-engineering-assistant-build123d:0.13.0";
  const workerScriptPath = resolve("worker/cad/occt/validate_brep.py");

  const registry = new CapabilityRegistry();
  registry.registerCatalog(ENGINEERING_CAPABILITIES);
  registry.register(createDockerBuild123dCADProvider({
    image,
    artifactRoot,
    maxTimeoutMs: 30_000,
    maxRequestBytes: 260_000,
    maxStdoutBytes: 2_000_000,
    maxStderrBytes: 64_000,
    memoryLimit: "1g",
    cpus: 2,
    pidsLimit: 128
  }));
  registry.register(createDockerOCCTValidationProvider({
    image,
    artifactRoot,
    workerScriptPath,
    timeoutMs: 30_000,
    maxStdoutBytes: 64_000,
    maxStderrBytes: 32_000,
    maxArtifactBytes: 100 * 1024 * 1024,
    memoryLimit: "1g",
    cpus: 1,
    pidsLimit: 64
  }));

  const router = new CADCapabilityRouter(registry, [
    { providerId: "cad.build123d", availability: "AVAILABLE" },
    { providerId: "cad.occt", availability: "AVAILABLE" }
  ]);
  const workflow = new CADPartCompletionWorkflow(router, new Build123dIntentCodeGenerator(), {
    timeoutMs: 30_000
  });
  const now = new Date().toISOString();
  const modelIdentity: CADModelIdentity = {
    id: "ci-model-shaft",
    projectId: "ci-project-shaft",
    name: "CI generated shaft",
    nativeReferences: [],
    createdAt: now,
    updatedAt: now
  };

  const result = await workflow.complete({
    projectId: "ci-project-shaft",
    modelIdentity,
    rawIntent: "Create a cylindrical shaft with a diameter of 30 mm and a length of 200 mm.",
    requirementIds: ["CI-SHAFT-DIMENSIONS"]
  });

  const summary = {
    status: result.status,
    stage: result.stage,
    specification: result.specification,
    executionProvider: result.execution?.selectedProviderId,
    executionAttempts: result.execution?.attempts,
    executionProviderError: result.execution?.providerResult?.error,
    validationProvider: result.validation?.selectedProviderId,
    validationAttempts: result.validation?.attempts,
    validationProviderError: result.validation?.providerResult?.error,
    artifactUri: result.bundle?.cad.uri,
    informationStatus: result.bundle?.cad.informationStatus,
    validationStatus: result.bundle?.cad.validationStatus,
    evidenceStatus: result.bundle?.evidence.status,
    requirementIds: result.bundle?.evidence.requirementIds,
    errors: result.errors,
    warnings: result.warnings
  };
  process.stdout.write(JSON.stringify(summary, null, 2) + "\n");

  if (result.status !== "ACCEPTED" ||
      result.bundle?.cad.informationStatus !== "VERIFIED" ||
      result.bundle.cad.validationStatus !== "PASS" ||
      result.bundle.evidence.status !== "VERIFIED" ||
      result.execution?.selectedProviderId !== "cad.build123d" ||
      result.validation?.selectedProviderId !== "cad.occt" ||
      !(result.bundle.evidence.requirementIds ?? []).includes("CI-SHAFT-DIMENSIONS")) {
    throw new Error("CAD intent-to-acceptance CI smoke failed closed; no VERIFIED artifact may be claimed.");
  }
}

main().catch((error: unknown) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
