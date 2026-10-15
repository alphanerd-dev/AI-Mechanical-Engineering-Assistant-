import { afterEach, describe, expect, it, vi } from "vitest";
import {
  probeRemoteCADWorker,
  REMOTE_CAD_READINESS_TIMEOUT_MS,
} from "../src/execution/remote-cad-worker.js";

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

    const pending = probeRemoteCADWorker({
      baseUrl: "https://isolated-preview-worker.onrender.com",
      token: "a".repeat(64),
      artifactRoot: "/tmp/engineering-cad-artifacts",
    });

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
});
