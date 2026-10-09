import { randomUUID } from "node:crypto";
import path from "node:path";
import { CapabilityProvider } from "../capabilities/registry.js";
import { CapabilityRequest, CapabilityResult } from "../core/types.js";
import { CADModelIdentity, validateCADModelIdentity } from "../cad/identity.js";
import { CADExecutionBackend, CADExecutionRequest, CADExecutionResult, CADWorkerExecutor } from "../cad/execution.js";
import { normalizeCADExecutionResult } from "../cad/artifact-manifest.js";
import { CAD_CODE_WORKER_POLICY, validateCADWorkerRequest } from "../execution/cad-worker-policy.js";
import { DockerBuild123dWorkerOptions, DockerBuild123dWorkerTransport } from "../execution/docker-build123d-transport.js";
import { Build123dWorkerExecutor } from "../execution/build123d-worker.js";

export interface Build123dCADProviderOptions {
  createExecutionId?: () => string;
  now?: () => string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function failed(request: CapabilityRequest, error: string): CapabilityResult {
  return { capability: request.capability, provider: "cad.build123d", success: false, error };
}

function normalizeFilename(value: unknown): string | undefined {
  if (value === undefined) return "generated.py";
  if (typeof value !== "string" || !value.trim()) return undefined;
  const filename = path.posix.basename(value.trim().replace(/\\/g, "/"));
  if (!filename || filename === "." || filename === ".." || /[\r\n\0]/.test(filename)) return undefined;
  if (!filename.toLowerCase().endsWith(".py")) return undefined;
  return filename;
}

/**
 * Reference CAD capability provider backed by the isolated build123d worker.
 * It executes supplied/generated Python source; it does not invent CAD source from dimensions.
 */
export class Build123dCADProvider implements CapabilityProvider {
  readonly id = "cad.build123d";
  readonly capabilities = ["CAD.CREATE_PART", "CAD.EXECUTE_GENERATED_SOURCE"];

  private readonly createExecutionId: () => string;
  private readonly now: () => string;

  constructor(
    private readonly executor: CADWorkerExecutor,
    options: Build123dCADProviderOptions = {}
  ) {
    this.createExecutionId = options.createExecutionId ?? randomUUID;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  async execute(request: CapabilityRequest): Promise<CapabilityResult> {
    if (!this.capabilities.includes(request.capability)) {
      return failed(request, "Unsupported build123d CAD capability.");
    }
    if (!record(request.input)) return failed(request, "CAD input must be an object.");

    const input = request.input;
    const backend = input.backend === undefined ? "build123d" : input.backend;
    if (backend !== "build123d") return failed(request, "The build123d provider accepts only the build123d backend.");

    const source = input.source;
    if (!nonEmptyString(source)) return failed(request, "CAD source must be a non-empty string.");
    if (Buffer.byteLength(source, "utf8") > 250_000) {
      return failed(request, "CAD source exceeds the 250000-byte worker limit.");
    }

    const filename = normalizeFilename(input.filename);
    if (!filename) return failed(request, "CAD source filename must be a simple Python filename.");

    const timeoutMs = input.timeoutMs === undefined ? 30_000 : input.timeoutMs;
    const policyErrors = validateCADWorkerRequest(
      CAD_CODE_WORKER_POLICY,
      request.capability,
      "build123d",
      typeof timeoutMs === "number" ? timeoutMs : Number.NaN
    );
    if (policyErrors.length) return failed(request, policyErrors.join(" "));

    const projectId = input.projectId;
    if (!nonEmptyString(projectId)) {
      return failed(request, "A server-resolved projectId is required to preserve CAD artifact provenance.");
    }
    if (!record(input.modelIdentity)) {
      return failed(request, "A server-resolved canonical CAD model identity is required.");
    }
    const modelIdentity = input.modelIdentity as unknown as CADModelIdentity;
    const identityValidation = validateCADModelIdentity(modelIdentity, projectId);
    if (identityValidation.status !== "PASS") {
      return failed(request, "CAD model identity was rejected: " + identityValidation.errors.join(" "));
    }

    let parameters: Record<string, unknown> | undefined;
    if (input.parameters !== undefined) {
      if (!record(input.parameters)) return failed(request, "CAD parameters must be an object when supplied.");
      parameters = input.parameters;
    }

    let requirementIds: string[] = [];
    if (input.requirementIds !== undefined) {
      if (!Array.isArray(input.requirementIds) || input.requirementIds.some((id) => !nonEmptyString(id))) {
        return failed(request, "requirementIds must contain only non-empty strings.");
      }
      requirementIds = [...new Set(input.requirementIds.map((id: string) => id.trim()))];
    }

    const executionRequest: CADExecutionRequest = {
      id: this.createExecutionId(),
      backend: "build123d" as CADExecutionBackend,
      source,
      filename,
      timeoutMs: timeoutMs as number,
      ...(parameters ? { parameters } : {})
    };

    let execution: CADExecutionResult;
    try {
      execution = await this.executor.execute(executionRequest);
    } catch (error) {
      return failed(request, error instanceof Error ? error.message : "Build123d worker execution failed unexpectedly.");
    }
    if (execution.backend !== "build123d") {
      return failed(request, "Build123d worker returned a mismatched execution backend.");
    }
    if (!execution.success) {
      return {
        ...failed(request, execution.error || "Build123d worker execution failed."),
        output: { executionId: executionRequest.id, backend: "build123d", warnings: execution.warnings }
      };
    }

    const manifest = normalizeCADExecutionResult(projectId.trim(), execution, {
      modelIdentity,
      request: executionRequest,
      providerId: this.id,
      requirementIds,
      generatedAt: this.now()
    });
    if (manifest.errors.length) {
      return failed(request, "CAD artifact provenance was rejected: " + manifest.errors.join(" "));
    }
    if (manifest.artifacts.length === 0) {
      return failed(request, "Build123d worker returned success without a registered artifact.");
    }

    const solid = manifest.artifacts.find((artifact) => artifact.kind === "SOLID");
    if (request.capability === "CAD.CREATE_PART" && !solid) {
      return {
        ...failed(request, "CAD.CREATE_PART requires a worker-reported solid artifact; execution is not accepted as part creation."),
        output: {
          executionId: executionRequest.id,
          backend: "build123d",
          artifacts: manifest.artifacts,
          warnings: [...manifest.warnings]
        }
      };
    }

    return {
      capability: request.capability,
      provider: this.id,
      success: true,
      output: {
        projectId: projectId.trim(),
        modelIdentityId: modelIdentity.id,
        executionId: executionRequest.id,
        backend: "build123d",
        solidArtifactId: solid?.id,
        artifacts: manifest.artifacts,
        provenance: manifest.provenance,
        warnings: manifest.warnings
      },
      artifactIds: manifest.artifacts.map((artifact) => artifact.id),
      ...(manifest.warnings.length ? { warnings: [...manifest.warnings] } : {})
    };
  }
}

/** Creates the reference provider without instantiating a CAD runtime in the web process. */
export function createDockerBuild123dCADProvider(
  options: DockerBuild123dWorkerOptions,
  providerOptions: Build123dCADProviderOptions = {}
): Build123dCADProvider {
  return new Build123dCADProvider(
    new Build123dWorkerExecutor(new DockerBuild123dWorkerTransport(options)),
    providerOptions
  );
}
