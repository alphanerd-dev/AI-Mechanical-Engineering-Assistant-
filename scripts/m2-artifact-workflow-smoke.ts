import { createHash, randomUUID } from "node:crypto";
import {
  assertNonProductionCadSmokeSupabaseTarget,
  assertNonProductionCadSmokeTarget
} from "../src/cad/live-smoke-target.js";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Required M2 acceptance environment variable " + name + " is missing.");
  return value;
}

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error("M2 acceptance endpoint returned a non-JSON response.");
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main(): Promise<void> {
  const baseUrl = new URL(requiredEnv("CAD_WORKSPACE_BASE_URL"));
  const approvedHost = requiredEnv("CAD_WORKSPACE_ALLOWED_HOST").toLowerCase();
  assertNonProductionCadSmokeTarget(baseUrl, approvedHost);
  check(baseUrl.hostname.toLowerCase() === approvedHost && !approvedHost.includes("*"),
    "The preview hostname must exactly match the protected allowlist.");

  const supabaseUrl = new URL(requiredEnv("CAD_WORKSPACE_SUPABASE_URL"));
  const supabaseAllowedHost = requiredEnv("CAD_WORKSPACE_SUPABASE_ALLOWED_HOST").toLowerCase();
  assertNonProductionCadSmokeSupabaseTarget(supabaseUrl, supabaseAllowedHost);

  const projectId = requiredEnv("CAD_WORKSPACE_PROJECT_ID");
  const modelId = requiredEnv("CAD_WORKSPACE_MODEL_ID");
  const cookie = requiredEnv("CAD_WORKSPACE_COOKIE");
  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  check(/^[0-9a-f-]{36}$/i.test(projectId) && /^[0-9a-f-]{36}$/i.test(modelId),
    "The disposable project and CAD model IDs must be UUIDs.");
  check(!/[\r\n]/.test(cookie), "The authenticated cookie must be a single header value.");

  const api = async (path: string, init: RequestInit = {}, authenticated = true) => {
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    if (authenticated) headers.set("cookie", cookie);
    return fetch(new URL(path, baseUrl.origin), {
      ...init, headers, cache: "no-store", signal: AbortSignal.timeout(180_000)
    });
  };

  const serviceHeaders = {
    apikey: serviceRoleKey,
    authorization: "Bearer " + serviceRoleKey,
    "content-type": "application/json"
  };
  const dbRequest = async (path: string, init: RequestInit = {}) => {
    const headers = new Headers(serviceHeaders);
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    return fetch(new URL("/rest/v1/" + path, supabaseUrl), {
      ...init, headers, cache: "no-store", signal: AbortSignal.timeout(30_000)
    });
  };

  const assertAuditEvent = async (
    resourceType: string,
    resourceId: string,
    action: string,
    expectedMetadata: Record<string, unknown>
  ) => {
    const params = new URLSearchParams({
      select: "event_id,metadata",
      project_id: "eq." + projectId,
      resource_type: "eq." + resourceType,
      resource_id: "eq." + resourceId,
      action: "eq." + action,
      outcome: "eq.SUCCESS"
    });
    const response = await dbRequest("engineering_audit_events?" + params.toString());
    check(response.ok, "Audit event lookup failed for " + resourceType + " " + resourceId + ".");
    const rows: unknown = await response.json();
    check(Array.isArray(rows) && rows.length === 1 && isRecord(rows[0]) &&
      typeof rows[0].event_id === "string" && isRecord(rows[0].metadata),
      "A unique durable audit event is missing for " + resourceType + " " + resourceId + ".");
    for (const [key, value] of Object.entries(expectedMetadata)) {
      check(rows[0].metadata[key] === value,
        "Audit metadata " + key + " does not match the persisted " + resourceType + " record.");
    }
  };

  // Fail early when the preview's server-side CAD worker is not configured and ready.
  const readinessResponse = await api("/api/cad/readiness?projectId=" + projectId);
  const readinessBody = await json(readinessResponse);
  check(readinessResponse.ok && isRecord(readinessBody) && readinessBody.ready === true,
    "CAD readiness is not READY on this preview. Inspect the returned readiness checks before attempting CAD execution.");

  // The accepted CAD completion creates a fresh canonical BREP and independent OCCT receipt.
  const completionResponse = await api("/api/cad/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId,
      modelIdentityId: modelId,
      rawIntent: "Create a cylindrical shaft with a diameter of 30 mm and a length of 200 mm."
    })
  });
  const completionBody = await json(completionResponse);
  check(completionResponse.status === 201 && isRecord(completionBody) && isRecord(completionBody.completion),
    "CAD completion did not return HTTP 201 with a persisted completion.");
  const completion = completionBody.completion;
  check(completion.status === "ACCEPTED" && completionBody.persisted === true && completionBody.verified === true,
    "CAD completion was not host-verified and persisted as ACCEPTED.");
  const completionId = completion.id;
  check(typeof completionId === "string", "Accepted completion has no durable identity.");
  check(Array.isArray(completion.artifact_records), "Accepted completion has no artifact manifest.");
  const solid = completion.artifact_records.find((item: unknown) => isRecord(item) && item.kind === "SOLID");
  check(isRecord(solid) && typeof solid.id === "string" && isRecord(solid.provenance) &&
    typeof solid.provenance.artifactSha256 === "string",
    "Accepted completion has no digest-bound canonical BREP artifact.");
  const sourceArtifactId = solid.id as string;
  const sourceDigest = solid.provenance.artifactSha256 as string;
  check(solid.validationStatus === "PASS" && solid.informationStatus === "VERIFIED" &&
    /^[a-f0-9]{64}$/.test(sourceDigest),
    "Canonical BREP is not PASS/VERIFIED or its digest is malformed.");
  check(Array.isArray(completion.storage_objects) && isRecord(completion.validation_receipt),
    "Accepted completion lacks its storage manifest or validation receipt.");
  const receipt = completion.validation_receipt;
  check(receipt.artifactSha256 === sourceDigest && receipt.validatorProviderId === "cad.occt" &&
    typeof receipt.validatorVersion === "string" && isRecord(receipt.validation) &&
    receipt.validation.valid === true && receipt.validation.solidCount === 1,
    "The canonical source is not backed by a matching independent OCCT PASS receipt.");
  const solidPath = completion.storage_objects.find((item: unknown) =>
    typeof item === "string" && item.endsWith("/solid.brep")
  );
  check(typeof solidPath === "string" && isRecord(completionBody.signedUrls) &&
    typeof completionBody.signedUrls[solidPath] === "string",
    "Accepted completion has no private signed URL for its canonical BREP.");
  const canonicalResponse = await fetch(completionBody.signedUrls[solidPath] as string, {
    cache: "no-store", signal: AbortSignal.timeout(60_000)
  });
  check(canonicalResponse.ok, "Private canonical BREP could not be retrieved.");
  const canonicalBytes = new Uint8Array(await canonicalResponse.arrayBuffer());
  const canonicalDigest = sha256(canonicalBytes);
  check(canonicalBytes.byteLength > 0 && canonicalDigest === sourceDigest &&
    completion.validation_receipt.artifactSha256 === sourceDigest,
    "Exact canonical BREP bytes, artifact metadata and validation receipt do not share the same SHA-256.");
  console.log("PASS CAD source: exact private BREP bytes match PASS/VERIFIED metadata and validation receipt.");

  // Geometry derivation must bind the exact source bytes, revision, converter and tessellation settings.
  const geometryResponse = await api("/api/cad/geometry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId, completionId, sourceArtifactId, operation: "TESSELLATE",
      linearDeflectionMm: 0.1, angularDeflectionRad: 0.35
    })
  });
  const geometryBody = await json(geometryResponse);
  check((geometryResponse.status === 201 || geometryResponse.status === 200) &&
    isRecord(geometryBody) && isRecord(geometryBody.derivative) &&
    typeof geometryBody.signedUrl === "string",
    "OCCT geometry endpoint did not return a persisted, signed display derivative.");
  const derivative = geometryBody.derivative;
  check(derivative.format === "GLB" && derivative.sourceArtifactId === sourceArtifactId &&
    derivative.sourceArtifactSha256 === sourceDigest && derivative.modelIdentityId === modelId &&
    Number.isSafeInteger(derivative.modelRevision) &&
    isRecord(derivative.converter) && derivative.converter.operation === "TESSELLATE" &&
    isRecord(derivative.tessellation) && derivative.units === "mm" &&
    derivative.coordinateFrame === "MODEL" &&
    typeof derivative.artifactSha256 === "string" && /^[a-f0-9]{64}$/.test(derivative.artifactSha256),
    "Display derivative metadata does not satisfy the source-bound lineage contract.");
  const glbResponse = await fetch(geometryBody.signedUrl as string, {
    cache: "no-store", signal: AbortSignal.timeout(60_000)
  });
  check(glbResponse.ok, "Private signed GLB URL could not retrieve the derivative.");
  const glb = new Uint8Array(await glbResponse.arrayBuffer());
  check(glb.byteLength >= 20 && new TextDecoder().decode(glb.slice(0, 4)) === "glTF" &&
    new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(4, true) === 2 &&
    new DataView(glb.buffer, glb.byteOffset, glb.byteLength).getUint32(8, true) === glb.byteLength &&
    sha256(glb) === derivative.artifactSha256,
    "Downloaded GLB bytes, format header, length or SHA-256 do not match persisted metadata.");
  console.log("PASS geometry: OCCT derivative, GLB v2, private signed retrieval and exact digest verified.");

  const invalidGeometryResponse = await api("/api/cad/geometry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId, completionId, sourceArtifactId, operation: "TESSELLATE",
      linearDeflectionMm: 100, angularDeflectionRad: 0.35
    })
  });
  check(invalidGeometryResponse.status === 400,
    "Out-of-range tessellation parameters were not rejected with HTTP 400.");
  console.log("PASS geometry negative case: out-of-range tessellation parameters rejected.");

  const derivativeListResponse = await api("/api/cad/geometry?projectId=" + projectId + "&modelIdentityId=" + modelId);
  const derivativeListBody = await json(derivativeListResponse);
  check(derivativeListResponse.ok && isRecord(derivativeListBody) && Array.isArray(derivativeListBody.derivatives),
    "Project derivative history could not be read.");
  const listedDerivative = derivativeListBody.derivatives.find((item: unknown) =>
    isRecord(item) && item.artifactId === derivative.artifactId
  );
  check(isRecord(listedDerivative) && listedDerivative.state === "CURRENT" &&
    typeof listedDerivative.signedUrl === "string",
    "Newly persisted display derivative is not classified CURRENT in project history.");
  await assertAuditEvent("CAD_DISPLAY_DERIVATIVE", derivative.artifactId as string, "EVIDENCE_WRITE", {
    sourceArtifactId,
    sourceArtifactSha256: sourceDigest,
    artifactSha256: derivative.artifactSha256,
    modelRevision: derivative.modelRevision
  });
  console.log("PASS lineage: derivative history reports CURRENT and its audit event binds source and derivative digests.");

  // Upload all supported drawing types and verify their immutable metadata and private bytes.
  const drawings = [
    {
      filename: "m2-acceptance.pdf", mime: "application/pdf",
      bytes: new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF")
    },
    {
      filename: "m2-acceptance.svg", mime: "image/svg+xml",
      bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><line x1="0" y1="0" x2="100" y2="100" stroke="#123456"/></svg>')
    },
    {
      filename: "m2-acceptance.dxf", mime: "application/dxf",
      bytes: new TextEncoder().encode([
        "0","SECTION","2","HEADER","9","$INSUNITS","70","4","0","ENDSEC",
        "0","SECTION","2","ENTITIES","0","LINE","8","FRAME","10","0","20","0","11","100","21","50",
        "0","ENDSEC","0","EOF"
      ].join("\n"))
    }
  ];
  const drawingIds: string[] = [];
  for (const drawing of drawings) {
    const form = new FormData();
    form.set("projectId", projectId);
    form.set("modelIdentityId", modelId);
    form.set("file", new Blob([drawing.bytes], { type: drawing.mime }), drawing.filename);
    const response = await api("/api/cad/drawings", { method: "POST", body: form });
    const body = await json(response);
    check(response.status === 201 && isRecord(body) && isRecord(body.drawing) &&
      typeof body.signedUrl === "string",
      "Supported drawing upload failed for " + drawing.filename + ".");
    const row = body.drawing;
    const expectedDigest = sha256(drawing.bytes);
    check(row.format === drawing.filename.split(".").pop()?.toUpperCase() &&
      row.sha256 === expectedDigest && row.byteSize === drawing.bytes.byteLength &&
      typeof row.id === "string" && body.signedUrlTtlSeconds === 300,
      "Drawing metadata or digest mismatch for " + drawing.filename + ".");
    const stored = await fetch(body.signedUrl as string, { cache: "no-store" });
    check(stored.ok && sha256(new Uint8Array(await stored.arrayBuffer())) === expectedDigest,
      "Private drawing bytes do not match persisted SHA-256 for " + drawing.filename + ".");
    drawingIds.push(row.id as string);
    await assertAuditEvent("CAD_DRAWING", row.id as string, "PROJECT_WRITE", {
      sha256: expectedDigest,
      format: row.format,
      byteSize: drawing.bytes.byteLength
    });
  }
  console.log("PASS drawings: PDF, safe SVG and ASCII DXF uploaded, privately retrieved and audit-bound.");

  const drawingListResponse = await api("/api/cad/drawings?projectId=" + projectId + "&modelIdentityId=" + modelId);
  const drawingListBody = await json(drawingListResponse);
  check(drawingListResponse.ok && isRecord(drawingListBody) && Array.isArray(drawingListBody.drawings),
    "Project drawing inventory could not be read.");
  for (const id of drawingIds) {
    check(drawingListBody.drawings.some((item: unknown) => isRecord(item) && item.id === id &&
      typeof item.signedUrl === "string"), "Persisted drawing " + id + " is missing from the project inventory.");
  }
  console.log("PASS drawing inventory: all uploaded drawings are listed with private signed URLs.");

  // Fail-closed content inspection: active SVG and MIME/extension spoofing must never persist.
  const unsafeSvg = new FormData();
  unsafeSvg.set("projectId", projectId);
  unsafeSvg.set("modelIdentityId", modelId);
  unsafeSvg.set("file", new Blob([new TextEncoder().encode("<svg><script>alert(1)</script></svg>")], {
    type: "image/svg+xml"
  }), "unsafe.svg");
  const unsafeResponse = await api("/api/cad/drawings", { method: "POST", body: unsafeSvg });
  check(unsafeResponse.status === 422, "Active SVG content was not rejected with HTTP 422.");

  const spoofed = new FormData();
  spoofed.set("projectId", projectId);
  spoofed.set("modelIdentityId", modelId);
  spoofed.set("file", new Blob([new TextEncoder().encode("%PDF-1.7\n%%EOF")], {
    type: "application/pdf"
  }), "spoofed.svg");
  const spoofedResponse = await api("/api/cad/drawings", { method: "POST", body: spoofed });
  check(spoofedResponse.status === 422, "MIME/extension spoofing was not rejected with HTTP 422.");

  const malformedPdf = new FormData();
  malformedPdf.set("projectId", projectId);
  malformedPdf.set("modelIdentityId", modelId);
  malformedPdf.set("file", new Blob([new TextEncoder().encode("not a PDF")], {
    type: "application/pdf"
  }), "malformed.pdf");
  const malformedPdfResponse = await api("/api/cad/drawings", { method: "POST", body: malformedPdf });
  check(malformedPdfResponse.status === 422, "Malformed PDF content was not rejected with HTTP 422.");

  const oversizedDrawing = new FormData();
  oversizedDrawing.set("projectId", projectId);
  oversizedDrawing.set("modelIdentityId", modelId);
  oversizedDrawing.set("file", new Blob([new Uint8Array(4 * 1024 * 1024 + 1)], {
    type: "application/pdf"
  }), "oversized.pdf");
  const oversizedResponse = await api("/api/cad/drawings", { method: "POST", body: oversizedDrawing });
  check(oversizedResponse.status === 413, "Drawing larger than the 4 MiB limit was not rejected with HTTP 413.");
  console.log("PASS negative drawing cases: active SVG, MIME/extension spoofing, malformed PDF and oversized upload rejected.");

  // Cross-project and unauthenticated reads must not disclose project artifact inventories.
  const foreignProjectId = randomUUID();
  const foreignRead = await api("/api/cad/drawings?projectId=" + foreignProjectId, {}, true);
  check(foreignRead.status === 403 || foreignRead.status === 404,
    "Cross-project drawing inventory access was not denied.");
  const foreignGeometryRead = await api("/api/cad/geometry?projectId=" + foreignProjectId, {}, true);
  check(foreignGeometryRead.status === 403 || foreignGeometryRead.status === 404,
    "Cross-project geometry inventory access was not denied.");
  const anonymousRead = await api("/api/cad/geometry?projectId=" + projectId, {}, false);
  check(!anonymousRead.ok, "Unauthenticated geometry derivative inventory access was allowed.");
  console.log("PASS authorization: anonymous and cross-project artifact inventory requests denied.");

  // Exercise persisted stale-source behavior by advancing the model revision in the
  // dedicated disposable Supabase project. This is deliberately impossible on production
  // because both the app host and Supabase project host must match protected exact allowlists.
  const modelRead = await dbRequest(
    "engineering_cad_models?select=id,revision&project_id=eq." + projectId + "&id=eq." + modelId
  );
  check(modelRead.ok, "Could not read the disposable CAD model revision using the protected test credential.");
  const modelRows: unknown = await modelRead.json();
  check(Array.isArray(modelRows) && modelRows.length === 1 && isRecord(modelRows[0]) &&
    Number.isSafeInteger(modelRows[0].revision) && Number(modelRows[0].revision) >= 1,
    "Disposable CAD model revision could not be resolved.");
  const nextRevision = Number(modelRows[0].revision) + 1;
  const bump = await dbRequest(
    "engineering_cad_models?project_id=eq." + projectId + "&id=eq." + modelId,
    {
      method: "PATCH",
      headers: { prefer: "return=representation" },
      body: JSON.stringify({ revision: nextRevision })
    }
  );
  check(bump.ok, "Could not advance the disposable CAD model revision for stale-source acceptance.");
  const bumpedRows: unknown = await bump.json();
  check(Array.isArray(bumpedRows) && bumpedRows.length === 1 &&
    isRecord(bumpedRows[0]) && bumpedRows[0].revision === nextRevision,
    "Disposable CAD model revision update was not confirmed by database read-back.");

  const staleListResponse = await api("/api/cad/geometry?projectId=" + projectId + "&modelIdentityId=" + modelId);
  const staleListBody = await json(staleListResponse);
  check(staleListResponse.ok && isRecord(staleListBody) && Array.isArray(staleListBody.derivatives),
    "Derivative history failed after the source model revision advanced.");
  const staleDerivative = staleListBody.derivatives.find((item: unknown) =>
    isRecord(item) && item.artifactId === derivative.artifactId
  );
  check(isRecord(staleDerivative) && staleDerivative.state === "STALE",
    "A derivative from the prior source revision was not classified STALE.");
  const staleRebuildResponse = await api("/api/cad/geometry", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      projectId, completionId, sourceArtifactId, operation: "TESSELLATE",
      linearDeflectionMm: 0.1, angularDeflectionRad: 0.35
    })
  });
  check(staleRebuildResponse.status === 409,
    "Geometry derivation from a superseded source revision was not rejected with HTTP 409.");
  const afterConflictResponse = await api("/api/cad/geometry?projectId=" + projectId + "&modelIdentityId=" + modelId);
  const afterConflictBody = await json(afterConflictResponse);
  check(afterConflictResponse.ok && isRecord(afterConflictBody) && Array.isArray(afterConflictBody.derivatives) &&
    afterConflictBody.derivatives.length === derivativeListBody.derivatives.length &&
    afterConflictBody.derivatives.filter((item) =>
      isRecord(item) && item.sourceArtifactId === sourceArtifactId
    ).every((item) => isRecord(item) && item.state === "STALE"),
    "A rejected stale-source regeneration created or left a CURRENT derivative for the superseded source.");
  console.log("PASS stale source: prior derivatives are STALE, regeneration fails closed and no new derivative is written.");

  console.log("M2 ARTIFACT / DRAWING / AUTHORIZATION / STALE-SOURCE ACCEPTANCE PASSED.");
  console.log("The test writes only to the explicitly allowlisted disposable preview project; no production records are touched.");
}

main().catch((error: unknown) => {
  console.error("M2 ACCEPTANCE FAILED: " + (error instanceof Error ? error.message : "unknown failure"));
  process.exitCode = 1;
});
