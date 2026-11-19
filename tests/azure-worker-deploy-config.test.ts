import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/deploy-azure-execution-worker.yml"),
  "utf8"
);
const expression = (source: "vars" | "secrets", key: string) =>
  "${{ " + source + "." + key + " }}";
const executionWorker = readFileSync(resolve(process.cwd(), "scripts/execution-worker.ts"), "utf8");

describe("Azure solver worker deployment configuration", () => {
  it("reads both solver endpoint URLs and tokens from protected environment configuration", () => {
    for (const backend of ["CALCULIX", "OPENFOAM"]) {
      const urlKey = backend + "_WORKER_URL";
      const tokenKey = backend + "_WORKER_API_TOKEN";
      expect(workflow).toContain(urlKey + ": " + expression("vars", urlKey));
      expect(workflow).toContain(tokenKey + ": " + expression("secrets", tokenKey));
    }
  });

  it("fails closed when endpoint and token pairs are incomplete or URLs are not HTTPS", () => {
    expect(workflow).toContain("for backend in CALCULIX OPENFOAM; do");
    expect(workflow).toContain("requires the matching $token_var secret.");
    expect(workflow).toContain("cannot be set without $url_var.");
    expect(workflow).toContain("must use HTTPS.");
  });

  it("gives the bounded worker enough time for the maximum supported OpenFOAM benchmark", () => {
    expect(workflow).toContain("--replica-timeout 900");
    expect(workflow).toContain("EXECUTION_WORKER_MAX_RUNTIME_MS=780000");
    expect(executionWorker).toContain("EXECUTION_WORKER_MAX_RUNTIME_MS,210_000,1_000,900_000");
  });

  it("stores solver tokens as Container Apps secrets and exposes only secret references to the job", () => {
    expect(workflow).toContain("calculix-worker-api-token=$CALCULIX_WORKER_API_TOKEN");
    expect(workflow).toContain("CALCULIX_WORKER_API_TOKEN=secretref:calculix-worker-api-token");
    expect(workflow).toContain("openfoam-worker-api-token=$OPENFOAM_WORKER_API_TOKEN");
    expect(workflow).toContain("OPENFOAM_WORKER_API_TOKEN=secretref:openfoam-worker-api-token");
  });
});
