import { OpenFOAMLaminarChannelRequest, OpenFOAMLaminarChannelResult } from "../cfd/types.js";
import { OpenFOAMExecutor } from "./openfoam.js";

const ARTIFACT_FILENAMES = new Set([
  "mesh.tar.gz",
  "velocity-field.tar.gz",
  "pressure-field",
  "solver.log"
]);
const JOB_ID_PATTERN = /^[a-f0-9]{32}$/;

export class OpenFOAMHttpExecutor implements OpenFOAMExecutor {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch
  ) {
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
    if (!token.trim()) {
      throw new Error("OpenFOAM worker bearer token is required.");
    }
    this.baseUrl = parsed.origin;
  }

  async runLaminarChannel(
    request: OpenFOAMLaminarChannelRequest
  ): Promise<OpenFOAMLaminarChannelResult> {
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
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`OpenFOAM worker returned HTTP ${response.status}: ${detail}`);
    }
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
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 1000);
      throw new Error(`OpenFOAM artifact download returned HTTP ${response.status}: ${detail}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
}
