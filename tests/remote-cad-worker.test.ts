import { afterEach, describe, expect, it, vi } from "vitest";
import {
  probeRemoteCADWorker,
  REMOTE_CAD_READINESS_TIMEOUT_MS,
} from "../src/execution/remote-cad-worker.js";

const config = {
  baseUrl: "https://isolated-preview-worker.onrender.com",
  token: "a".repeat(64),
  artifactRoot: "/tmp/engineering-cad-artifacts",
};

describe("probeRemoteCADWorker", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("allows a cold worker readiness import up to the configured bounded timeout", async () => {
    vi.useFakeTimers();
    let capturedSignal: AbortSignal | undefined;
    const fetchStub = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      capturedSignal = init?.signal as AbortSignal;
      return new Promise<Response>((_resolve, reject) => {
        capturedSignal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    });
    vi.stubGlobal("fetch", fetchStub);

    const pending = probeRemoteCADWorker(config);

    expect(REMOTE_CAD_READINESS_TIMEOUT_MS).toBe(45_000);
    await vi.advanceTimersByTimeAsync(12_000);
    expect(capturedSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(REMOTE_CAD_READINESS_TIMEOUT_MS - 12_000);
    expect(capturedSignal?.aborted).toBe(true);
    await expect(pending).resolves.toMatchObject({
      ready: false,
      status: "UNREACHABLE",
      checks: [{ name: "cad_worker_reachable", status: "FAIL" }],
    });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("retries Render's transient 503 cold-start page until worker readiness responds", async () => {
    vi.useFakeTimers();
    const readyPayload = {
      ready: true,
      status: "READY",
      build123dVersion: "0.13.0",
      capabilities: ["CAD.CREATE_CYLINDER", "CAD.VALIDATE_BREP"],
      checks: [
        { name: "server_authentication", status: "PASS", detail: "token configured" },
        { name: "build123d_occt_runtime", status: "PASS", detail: "runtime imports" },
      ],
    };
    const fetchStub = vi.fn()
      .mockResolvedValueOnce(new Response("<html>Service waking up</html>", {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(readyPayload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));
    vi.stubGlobal("fetch", fetchStub);

    const pending = probeRemoteCADWorker(config);
    await vi.advanceTimersByTimeAsync(1_000);

    await expect(pending).resolves.toMatchObject({
      ready: true,
      status: "READY",
      build123dVersion: "0.13.0",
    });
    expect(fetchStub).toHaveBeenCalledTimes(2);
  });

  it("returns real worker dependency failures immediately rather than retrying them", async () => {
    const notReadyPayload = {
      ready: false,
      status: "NOT_READY",
      capabilities: [],
      checks: [
        { name: "build123d_occt_runtime", status: "FAIL", detail: "dependencies unavailable" },
      ],
    };
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify(notReadyPayload), {
      status: 503,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchStub);

    await expect(probeRemoteCADWorker(config)).resolves.toMatchObject({
      ready: false,
      status: "NOT_READY",
      checks: [{ name: "build123d_occt_runtime", status: "FAIL" }],
    });
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });
});
