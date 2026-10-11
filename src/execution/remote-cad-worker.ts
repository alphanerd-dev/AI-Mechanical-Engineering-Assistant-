import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CADExecutionRequest, CADExecutionResult } from "../cad/execution.js";
import type { CADWorkerTransport } from "./build123d-worker.js";
import type { OcctExecutor } from "../providers/occt.js";

const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_ARTIFACT_BYTES = 8 * 1024 * 1024;
const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const SHA_PATTERN = /^[a-f0-9]{64}$/;
const WORKER_ARTIFACTS = {
  source: { field: "sourceArtifactPath", filename: "source.py" },
  solid: { field: "solidArtifactPath", filename: "part.brep" },
  step: { field: "stepArtifactPath", filename: "part.step" },
  stl: { field: "stlArtifactPath", filename: "part.stl" },
  threeMf: { field: "threeMfArtifactPath", filename: "part.3mf" }
} as const;

export interface RemoteCADWorkerConfig {
  baseUrl: string;
  token: string;
  artifactRoot: string;
}

export type RemoteCADWorkerConfigResult =
  | { configured: true; value: RemoteCADWorkerConfig }
  | { configured: false; error?: string };

type RemoteArtifact = {
  filename: string;
  contentBase64: string;
  sha256: string;
  sizeBytes: number;
};

type RemoteJSON = Record<string, unknown>;

function isRecord(value: unknown): value is RemoteJSON {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function publicWorkerError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 500) : "Remote CAD worker request failed.";
}

export function getRemoteCADWorkerConfig(
  env: Record<string, string | undefined> = process.env
): RemoteCADWorkerConfigResult {
  const configuredUrl = env.CAD_WORKER_URL?.trim() ?? "";
  const token = env.CAD_WORKER_API_TOKEN?.trim() ?? "";
  if (!configuredUrl && !token) return { configured: false };
  if (!configuredUrl || !token) {
    return { configured: false, error: "Both CAD_WORKER_URL and CAD_WORKER_API_TOKEN must be configured together." };
  }
  if (!TOKEN_PATTERN.test(token)) {
    return { configured: false, error: "CAD_WORKER_API_TOKEN must be a 64-character lowercase hex token." };
  }
  let parsed: URL;
  try { parsed = new URL(configuredUrl); }
  catch { return { configured: false, error: "CAD_WORKER_URL must be a valid HTTPS URL." }; }
  const localDevelopment = env.NODE_ENV !== "production" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.protocol !== "https:" && !localDevelopment) {
    return { configured: false, error: "CAD_WORKER_URL must use HTTPS outside local development." };
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash ||
      !["", "/"].includes(parsed.pathname)) {
    return { configured: false, error: "CAD_WORKER_URL must be an origin URL without credentials, path, query or fragment." };
  }
  if (!localDevelopment && !parsed.hostname.endsWith(".onrender.com")) {
    return { configured: false, error: "Production CAD_WORKER_URL must point to the configured Render worker domain." };
  }
  const artifactRoot = env.CAD_ARTIFACT_ROOT?.trim() || "/tmp/engineering-cad-artifacts";
  if (!path.isAbsolute(artifactRoot) || artifactRoot === path.parse(artifactRoot).root) {
    return { configured: false, error: "CAD_ARTIFACT_ROOT must be an absolute non-root path." };
  }
  return {
    configured: true,
    value: {
      baseUrl: parsed.origin,
      token,
      artifactRoot: path.resolve(artifactRoot)
    }
  };
}

async function postWorker(config: RemoteCADWorkerConfig, endpoint: string, body: Record<string, unknown>, timeoutMs: number): Promise<RemoteJSON> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(endpoint, config.baseUrl), {
      method: "POST",
      headers: {
        authorization: "Bearer " + config.token,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (!isRecord(payload)) throw new Error("Remote CAD worker returned a malformed JSON response.");
    if (!response.ok) {
      const message = text(payload.error) ? payload.error : "Remote CAD worker rejected the request with HTTP " + response.status + ".";
      throw new Error(message.slice(0, 500));
    }
    return payload;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Remote CAD worker exceeded the configured request timeout.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function decodeArtifact(value: unknown, expectedFilename: string): Buffer {
  if (!isRecord(value) || value.filename !== expectedFilename ||
      typeof value.contentBase64 !== "string" || value.contentBase64.length === 0 ||
      !SHA_PATTERN.test(String(value.sha256)) || !Number.isInteger(value.sizeBytes) ||
      (value.sizeBytes as number) < 1 || (value.sizeBytes as number) > MAX_ARTIFACT_BYTES ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.contentBase64)) {
    throw new Error("Remote CAD worker returned a malformed artifact manifest.");
  }
  const bytes = Buffer.from(value.contentBase64, "base64");
  if (bytes.length !== value.sizeBytes || bytes.length > MAX_ARTIFACT_BYTES ||
      createHash("sha256").update(bytes).digest("hex") !== value.sha256) {
    throw new Error("Remote CAD artifact failed host-side size or SHA-256 verification.");
  }
  return bytes;
}

export class RemoteCADWorkerTransport implements CADWorkerTransport {
  constructor(private readonly config: RemoteCADWorkerConfig) {}

  async run(request: CADExecutionRequest): Promise<CADExecutionResult> {
    if (request.backend !== "build123d") {
      return { success: false, backend: request.backend, warnings: [], error: "The remote worker supports build123d only." };
    }
    const requestedTimeout = Number.isFinite(request.timeoutMs) ? request.timeoutMs : 30_000;
    if (requestedTimeout < 100 || requestedTimeout > 60_000) {
      return { success: false, backend: "build123d", warnings: [], error: "CAD execution timeout is outside the remote worker bounds." };
    }
    let runDirectory: string | undefined;
    try {
      const payload = await postWorker(this.config, "/v1/cad/execute", {
        id: request.id,
        backend: request.backend,
        source: request.source,
        filename: request.filename,
        timeoutMs: requestedTimeout,
        parameters: request.parameters ?? {}
      }, Math.min(90_000, requestedTimeout + 30_000));
      if (payload.success !== true || payload.backend !== "build123d" || payload.executionId !== request.id ||
          !isRecord(payload.artifacts) || !Array.isArray(payload.warnings)) {
        throw new Error(text(payload.error) ? payload.error : "Remote CAD worker response violated its execution contract.");
      }
      const artifactEntries = Object.entries(WORKER_ARTIFACTS);
      if (Object.keys(payload.artifacts).length !== artifactEntries.length) {
        throw new Error("Remote CAD worker did not return the complete required artifact bundle.");
      }
      const decoded = new Map<string, Buffer>();
      let total = 0;
      for (const [key, metadata] of artifactEntries) {
        const bytes = decodeArtifact(payload.artifacts[key], metadata.filename);
        total += bytes.length;
        decoded.set(key, bytes);
      }
      if (total > MAX_TOTAL_ARTIFACT_BYTES) throw new Error("Remote CAD artifact bundle exceeds the 8 MiB limit.");
      const sourceBytes = decoded.get("source")!;
      const requestedSourceHash = createHash("sha256").update(request.source, "utf8").digest("hex");
      if (createHash("sha256").update(sourceBytes).digest("hex") !== requestedSourceHash) {
        throw new Error("Remote worker source artifact does not match the exact requested source bytes.");
      }

      await mkdir(this.config.artifactRoot, { recursive: true, mode: 0o700 });
      const root = await realpath(this.config.artifactRoot);
      if (!root.startsWith(path.parse(root).root) || root === path.parse(root).root) {
        throw new Error("Configured CAD artifact root is unsafe.");
      }
      runDirectory = path.join(root, randomUUID());
      await mkdir(runDirectory, { recursive: false, mode: 0o700 });
      const result: CADExecutionResult = {
        success: true,
        backend: "build123d",
        warnings: payload.warnings.filter((item): item is string => typeof item === "string").slice(0, 50)
      };
      for (const [key, metadata] of artifactEntries) {
        const artifactPath = path.join(runDirectory, metadata.filename);
        await writeFile(artifactPath, decoded.get(key)!, { flag: "wx", mode: 0o600 });
        const verifiedPath = await realpath(artifactPath);
        if (path.dirname(verifiedPath) !== runDirectory || !(await stat(verifiedPath)).isFile()) {
          throw new Error("A remote CAD artifact was written outside its allocated run directory.");
        }
        result[metadata.field] = verifiedPath;
      }
      return result;
    } catch (error) {
      if (runDirectory) await rm(runDirectory, { recursive: true, force: true }).catch(() => undefined);
      return { success: false, backend: "build123d", warnings: [], error: publicWorkerError(error) };
    }
  }
}

export class RemoteOCCTValidatorExecutor implements OcctExecutor {
  constructor(private readonly config: RemoteCADWorkerConfig) {}

  async call(operation: string, input: Record<string, unknown>): Promise<unknown> {
    if (operation !== "validate_geometry") throw new Error("Remote OCCT worker supports validate_geometry only.");
    for (const key of ["projectId", "artifactId", "modelIdentityId", "executionId", "providerId", "sourceSha256"]) {
      if (!text(input[key])) throw new Error("OCCT validation requires " + key + " provenance.");
    }
    if (input.backend !== "build123d" || input.artifactKind !== "SOLID" || !text(input.artifactUri)) {
      throw new Error("OCCT validation requires a BREP SOLID artifact from the build123d worker.");
    }
    const root = await realpath(this.config.artifactRoot);
    const artifactPath = await realpath(input.artifactUri);
    const relative = path.relative(root, artifactPath);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative) || path.extname(artifactPath).toLowerCase() !== ".brep") {
      throw new Error("OCCT validator artifact is outside the configured artifact root.");
    }
    const info = await stat(artifactPath);
    if (!info.isFile() || info.size < 1 || info.size > MAX_ARTIFACT_BYTES) {
      throw new Error("OCCT validator artifact is empty, not a regular file or exceeds the 4 MiB transfer limit.");
    }
    const artifact = await readFile(artifactPath);
    const artifactSha256 = createHash("sha256").update(artifact).digest("hex");
    const parameters = input.parameters;
    if (!isRecord(parameters) || parameters.kind !== "CYLINDER" ||
        typeof parameters.diameterMm !== "number" || !Number.isFinite(parameters.diameterMm) ||
        typeof parameters.lengthMm !== "number" || !Number.isFinite(parameters.lengthMm)) {
      throw new Error("OCCT validation requires a bounded cylinder specification.");
    }
    const response = await postWorker(this.config, "/v1/cad/validate", {
      artifactBase64: artifact.toString("base64"),
      artifactSha256,
      parameters,
      toleranceMm: 0.01
    }, 45_000);
    if (response.artifactSha256 !== artifactSha256 || typeof response.valid !== "boolean" ||
        !Number.isInteger(response.solidCount) || typeof response.checkedBy !== "string" ||
        typeof response.validatorVersion !== "string" || !Array.isArray(response.warnings) ||
        response.warnings.some((warning) => typeof warning !== "string")) {
      throw new Error("Remote OCCT validator returned malformed or digest-mismatched evidence.");
    }
    const bytesAfter = await readFile(artifactPath);
    if (createHash("sha256").update(bytesAfter).digest("hex") !== artifactSha256) {
      throw new Error("CAD solid bytes changed while independent validation was running.");
    }
    return response;
  }
}

export async function probeRemoteCADWorker(config: RemoteCADWorkerConfig): Promise<{
  ready: boolean;
  status: string;
  build123dVersion?: string;
  capabilities: string[];
  checks: Array<{ name: string; status: string; detail: string }>;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(new URL("/v1/readiness", config.baseUrl), {
      headers: { authorization: "Bearer " + config.token, accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    const payload: unknown = await response.json().catch(() => ({}));
    if (isRecord(payload) && typeof payload.ready === "boolean" &&
        typeof payload.status === "string" && Array.isArray(payload.checks)) {
      return {
        ready: response.ok && payload.ready,
        status: payload.status,
        ...(typeof payload.build123dVersion === "string" ? { build123dVersion: payload.build123dVersion } : {}),
        capabilities: Array.isArray(payload.capabilities) ? payload.capabilities.filter((item): item is string => typeof item === "string") : [],
        checks: payload.checks.filter(isRecord).map((item) => ({
          name: typeof item.name === "string" ? item.name : "worker_check",
          status: typeof item.status === "string" ? item.status : "FAIL",
          detail: typeof item.detail === "string" ? item.detail : "Worker check returned no detail."
        }))
      };
    }
    return { ready: false, status: "NOT_READY", capabilities: [], checks: [{ name: "cad_worker_response", status: "FAIL", detail: "Worker returned an invalid readiness response." }] };
  } catch {
    return { ready: false, status: "UNREACHABLE", capabilities: [], checks: [{ name: "cad_worker_reachable", status: "FAIL", detail: "The authenticated CAD worker readiness endpoint could not be reached." }] };
  } finally {
    clearTimeout(timer);
  }
}
