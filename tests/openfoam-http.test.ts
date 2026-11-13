import { describe, expect, it, vi } from "vitest";
import { OpenFOAMLaminarChannelRequest, OpenFOAMLaminarChannelResult } from "../src/cfd/types.js";
import { OpenFOAMHttpExecutor } from "../src/providers/openfoam-http.js";

const request: OpenFOAMLaminarChannelRequest = {
  caseId: "laminar-channel-poiseuille-v1",
  meanVelocityMps: 0.2,
  heightM: 0.01,
  depthM: 0.001,
  densityKgM3: 1000,
  kinematicViscosityM2PerS: 1e-5,
  mesh: { cellsVertical: 20 },
  solver: { maxIterations: 2000, residualTolerance: 1e-7, timeoutSeconds: 120 }
};

const result: OpenFOAMLaminarChannelResult = {
  jobId: "a".repeat(32),
  status: "COMPLETED",
  solver: "OpenFOAM",
  solverVersion: "14",
  converged: true,
  meshCells: 20,
  massFluxKgS: 0.002,
  residuals: { pressure: 1e-8, velocity: 1e-8 },
  velocityProfile: [],
  artifacts: [],
  warnings: []
};

describe("OpenFOAM HTTP executor", () => {
  it("requires a private service URL and bearer token", () => {
    expect(() => new OpenFOAMHttpExecutor("ftp://worker", "token")).toThrow("HTTP or HTTPS");
    expect(() => new OpenFOAMHttpExecutor("https://user:pass@worker", "token")).toThrow("credentials");
    expect(() => new OpenFOAMHttpExecutor("https://worker/path", "token")).toThrow("service root");
    expect(() => new OpenFOAMHttpExecutor("https://worker", " ")).toThrow("bearer token");
  });

  it("posts a bounded manifest with bearer authentication and a wall-clock timeout", async () => {
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(JSON.stringify(result), { status: 200 });
    });
    const executor = new OpenFOAMHttpExecutor("http://127.0.0.1:8080", "secret", fetcher);
    const response = await executor.runLaminarChannel(request);
    expect(response.jobId).toBe(result.jobId);
    expect(capturedUrl).toBe("http://127.0.0.1:8080/v1/cfd/laminar-channel");
    expect(capturedInit?.method).toBe("POST");
    expect(new Headers(capturedInit?.headers).get("Authorization")).toBe("Bearer secret");
    expect(JSON.parse(String(capturedInit?.body))).toEqual(request);
    expect(capturedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects invalid numerical manifests before making a network request", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(result), { status: 200 }));
    const executor = new OpenFOAMHttpExecutor("https://worker.internal", "secret", fetcher);
    await expect(executor.runLaminarChannel({
      ...request,
      meanVelocityMps: 1,
      kinematicViscosityM2PerS: 1e-5
    })).rejects.toThrow("Invalid OpenFOAM benchmark request");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("surfaces worker HTTP errors and malformed JSON", async () => {
    const failed = new OpenFOAMHttpExecutor(
      "https://worker.internal",
      "secret",
      async () => new Response("solver unavailable", { status: 503 })
    );
    await expect(failed.runLaminarChannel(request)).rejects.toThrow("HTTP 503");

    const malformed = new OpenFOAMHttpExecutor(
      "https://worker.internal",
      "secret",
      async () => new Response("not-json", { status: 200 })
    );
    await expect(malformed.runLaminarChannel(request)).rejects.toThrow("invalid JSON");
  });

  it("downloads only whitelisted artifacts for a valid job identity", async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 }));
    const executor = new OpenFOAMHttpExecutor("https://worker.internal", "secret", fetcher);
    const bytes = await executor.downloadArtifact("a".repeat(32), "mesh.tar.gz");
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(fetcher).toHaveBeenCalledWith(
      "https://worker.internal/v1/cfd/artifacts/" + "a".repeat(32) + "/mesh.tar.gz",
      expect.objectContaining({
        method: "GET",
        headers: { Authorization: "Bearer secret" }
      })
    );
    await expect(executor.downloadArtifact("../bad", "mesh.tar.gz")).rejects.toThrow("identity is invalid");
    await expect(executor.downloadArtifact("a".repeat(32), "../outside")).rejects.toThrow("identity is invalid");
  });
});
