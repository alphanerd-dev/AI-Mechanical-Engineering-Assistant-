import { OpenFOAMLaminarChannelRequest, OpenFOAMLaminarChannelResult } from "../cfd/types.js";
import { validateOpenFOAMLaminarChannelRequest } from "../cfd/validation.js";
import { OpenFOAMExecutor } from "./openfoam.js";

const ARTIFACT_FILENAMES = new Set([
  "mesh.tar.gz",
  "velocity-field.tar.gz",
  "pressure-field",
  "solver.log"
]);
const JOB_ID_PATTERN = /^[a-f0-9]{32}$/;

type WorkerFetch = typeof fetch;

function assertValidRequest(request: OpenFOAMLaminarChannelRequest): void {
  const errors = validateOpenFOAMLaminarChannelRequest(request);
  if (errors.length) {
    throw new Error(`Invalid OpenFOAM benchmark request: ${errors.join("; ")}`);
  }
}

async function workerError(response: Response, operation: string): Promise<Error> {
  const detail = (await response.text()).slice(0, 1000);
  return new Error(`OpenFOAM ${operation} returned HTTP ${response.status}: ${detail}`);
}

async function readWorkerResult(response: Response): Promise<OpenFOAMLaminarChannelResult> {
  if (!response.ok) throw await workerError(response, "worker");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("OpenFOAM worker returned an invalid JSON response.");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("OpenFOAM worker response must be a JSON object.");
  }
  return payload as OpenFOAMLaminarChannelResult;
}

function normalizeWorkerUrl(baseUrl: string): string {
  const parsed = new URL(baseUrl);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("OpenFOAM worker URL must use HTTP or HTTPS.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("OpenFOAM worker URL must not contain credentials, query parameters or fragments.");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error("OpenFOAM worker URL must identify the service root.");
  }
  return parsed.origin;
}

export class OpenFOAMHttpExecutor implements OpenFOAMExecutor {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly fetcher: WorkerFetch = fetch
  ) {
    this.baseUrl = normalizeWorkerUrl(baseUrl);
    if (!token.trim()) throw new Error("OpenFOAM worker bearer token is required.");
  }

  async runLaminarChannel(
    request: OpenFOAMLaminarChannelRequest
  ): Promise<OpenFOAMLaminarChannelResult> {
    assertValidRequest(request);
    const response = await this.fetcher(
      `${this.baseUrl}/v1/cfd/laminar-channel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(request.solver.timeoutSeconds * 1000)
      }
    );
    return readWorkerResult(response);
  }

  async downloadArtifact(jobId: string, filename: string): Promise<Uint8Array> {
    if (!JOB_ID_PATTERN.test(jobId) || !ARTIFACT_FILENAMES.has(filename)) {
      throw new Error("OpenFOAM artifact identity is invalid.");
    }
    const response = await this.fetcher(
      `${this.baseUrl}/v1/cfd/artifacts/${jobId}/${encodeURIComponent(filename)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(30_000)
      }
    );
    if (!response.ok) throw await workerError(response, "artifact download");
    return new Uint8Array(await response.arrayBuffer());
  }
}
