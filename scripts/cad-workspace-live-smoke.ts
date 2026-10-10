import { createHash } from "node:crypto";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Required environment variable " + name + " is not set.");
  return value;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("The CAD workspace returned a non-JSON response.");
  }
}

async function main() {
  const baseUrl = new URL(requiredEnv("CAD_WORKSPACE_BASE_URL"));
  if (baseUrl.protocol !== "https:" && !["localhost", "127.0.0.1", "::1"].includes(baseUrl.hostname)) {
    throw new Error("CAD_WORKSPACE_BASE_URL must use HTTPS except for local development.");
  }
  const projectId = requiredEnv("CAD_WORKSPACE_PROJECT_ID");
  const modelIdentityId = requiredEnv("CAD_WORKSPACE_MODEL_ID");
  const cookie = requiredEnv("CAD_WORKSPACE_COOKIE");
  const base = baseUrl.origin;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(modelIdentityId)) {
    throw new Error("CAD_WORKSPACE_PROJECT_ID and CAD_WORKSPACE_MODEL_ID must be registered UUIDs.");
  }
  if (/\r|\n/.test(cookie)) throw new Error("CAD_WORKSPACE_COOKIE must be a single HTTP Cookie header value.");

  const api = async (pathname: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    headers.set("cookie", cookie);
    const response = await fetch(new URL(pathname, base), {
      ...init,
      headers,
      signal: AbortSignal.timeout(180_000),
      cache: "no-store"
    });
    const body = await readJson(response);
    return { response, body };
  };

  const readinessPath = "/api/cad/readiness?projectId=" + encodeURIComponent(projectId);
  const readiness = await api(readinessPath);
  check(readiness.response.ok && isRecord(readiness.body) && readiness.body.ready === true,
    "CAD readiness failed: " + JSON.stringify(isRecord(readiness.body) ? readiness.body.checks ?? readiness.body.error ?? readiness.body.status : readiness.body));
  console.log("PASS readiness: server runtime, Docker images, database schema and private bucket are ready.");

  const completionResponse = await api("/api/cad/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId,
      modelIdentityId,
      rawIntent: "Create a cylindrical shaft with a diameter of 30 mm and a length of 200 mm."
    })
  });
  const completionBody = completionResponse.body;
  check(completionResponse.response.status === 201 && isRecord(completionBody),
    "CAD completion endpoint did not return HTTP 201 for a verified supported request.");
  const record = completionBody.completion;
  check(isRecord(record), "The accepted response did not include its persisted completion record.");
  check(record.status === "ACCEPTED" && completionBody.verified === true && completionBody.persisted === true,
    "The completion was not persisted as an accepted, host-verified result.");
  check(typeof record.id === "string" && record.id.length > 0, "The completion record has no durable id.");
  check(Array.isArray(record.storage_objects), "The completion record has no persisted storage object list.");
  const solidPath = record.storage_objects.find((item) => typeof item === "string" && item.endsWith("/solid.brep"));
  check(typeof solidPath === "string", "The accepted completion did not persist a BREP solid.");
  const signedUrls = completionBody.signedUrls;
  check(isRecord(signedUrls) && typeof signedUrls[solidPath] === "string", "No short-lived signed URL was returned for the persisted BREP.");

  const artifacts = record.artifact_records;
  check(Array.isArray(artifacts), "The completion record does not contain artifact metadata.");
  const solid = artifacts.find((item) => isRecord(item) && item.kind === "SOLID");
  check(isRecord(solid) && solid.validationStatus === "PASS" && solid.informationStatus === "VERIFIED",
    "The persisted BREP artifact is not marked PASS/VERIFIED.");
  check(isRecord(solid.provenance), "The persisted BREP artifact has no provenance.");
  const artifactDigest = solid.provenance.artifactSha256;
  check(typeof artifactDigest === "string" && /^[a-f0-9]{64}$/.test(artifactDigest),
    "The persisted BREP record has no host-computed SHA-256 digest.");

  const receipt = record.validation_receipt;
  check(isRecord(receipt), "The stored completion has no validation receipt.");
  check(receipt.artifactSha256 === artifactDigest, "The persisted receipt digest does not match the artifact record.");
  check(receipt.validatorProviderId === "cad.occt" && typeof receipt.validatorVersion === "string",
    "The stored receipt does not identify the independent OpenCascade validator and version.");
  check(isRecord(receipt.validation) && receipt.validation.valid === true && receipt.validation.solidCount === 1,
    "The stored geometry verdict is not a valid single-solid result.");

  const measurements = receipt.geometryMeasurements;
  check(isRecord(measurements) && typeof measurements.volumeMm3 === "number" &&
    Number.isFinite(measurements.volumeMm3) && measurements.volumeMm3 > 0,
    "The stored receipt is missing the measured volume.");
  const bounds = measurements.boundingBoxMm;
  check(isRecord(bounds) &&
    typeof bounds.x === "number" && Number.isFinite(bounds.x) && Math.abs(bounds.x - 30) <= 0.010001 &&
    typeof bounds.y === "number" && Number.isFinite(bounds.y) && Math.abs(bounds.y - 30) <= 0.010001 &&
    typeof bounds.z === "number" && Number.isFinite(bounds.z) && Math.abs(bounds.z - 200) <= 0.0102,
    "The stored receipt is missing the requested X/Y/Z measured bounds.");
  const checks = measurements.dimensionChecks;
  check(Array.isArray(checks) && checks.length === 3 &&
    checks.every((item) => isRecord(item) && item.passed === true && item.toleranceMm === 0.01),
    "The stored receipt is missing three successful checks at the host-selected 0.01 mm tolerance.");
  const expectedVolume = Math.PI * 15 * 15 * 200;
  check(Math.abs(measurements.volumeMm3 - expectedVolume) <= Math.max(expectedVolume * 1e-3, 1e-9),
    "The persisted measured volume contradicts the requested cylinder.");

  // Download the exact stored bytes through a short-lived, private signed URL.
  const signedUrl = signedUrls[solidPath] as string;
  const download = await fetch(signedUrl, { signal: AbortSignal.timeout(60_000), cache: "no-store" });
  check(download.ok, "The returned signed URL could not retrieve the stored BREP.");
  const bytes = Buffer.from(await download.arrayBuffer());
  check(bytes.length > 0, "The retrieved BREP is empty.");
  const downloadedDigest = createHash("sha256").update(bytes).digest("hex");
  check(downloadedDigest === artifactDigest && downloadedDigest === receipt.artifactSha256,
    "The exact BREP bytes retrieved from private storage do not match the trusted validation receipt.");
  console.log("PASS artifact: downloaded private BREP SHA-256 matches metadata and validation evidence.");

  const history = await api("/api/cad/completions?projectId=" + encodeURIComponent(projectId));
  check(history.response.ok && isRecord(history.body) && Array.isArray(history.body.completions),
    "The project completion history could not be loaded.");
  const persisted = history.body.completions.find((item) =>
    isRecord(item) && item.id === record.id && item.status === "ACCEPTED"
  );
  check(persisted, "The accepted completion was not present in a subsequent history read.");
  console.log("PASS persistence: accepted completion and evidence are readable from project history.");

  if (process.env.CAD_WORKSPACE_TEST_NEEDS_INPUT === "1") {
    const negative = await api("/api/cad/completions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        projectId,
        modelIdentityId,
        rawIntent: "Create a shaft with a diameter of 30 mm."
      })
    });
    check(negative.response.ok && isRecord(negative.body) && negative.body.persisted === true &&
      isRecord(negative.body.completion) && negative.body.completion.status === "NEEDS_INPUT",
      "The missing-dimension negative-path test did not persist a NEEDS_INPUT record.");
    check(Array.isArray(negative.body.completion.artifact_records) &&
      negative.body.completion.artifact_records.length === 0,
      "A missing-dimension request must not create generated artifacts.");
    console.log("PASS negative path: missing dimensions persisted as NEEDS_INPUT without generating CAD.");
  }

  console.log("CAD WORKSPACE LIVE SMOKE TEST PASSED. No cookie, signed URL, or secret was printed.");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown live CAD workspace smoke-test failure.";
  console.error("CAD WORKSPACE LIVE SMOKE TEST FAILED: " + message);
  process.exitCode = 1;
});
