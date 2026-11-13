import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { persistEngineeringAuditEvent } from "../../../../src/audit/server";
import { CAD_ARTIFACT_BUCKET, CAD_SIGNED_URL_TTL_SECONDS } from "../../../../src/cad/persistence";
import { CADDisplayDerivative, classifyCADDisplayDerivative, validateCADDisplayDerivative } from "../../../../src/cad/display-derivative";
import { createCADDisplayGLB } from "../../../../src/cad/glb";
import { CADGeometrySource } from "../../../../src/cad/geometry-kernel-contract";
import { DockerOCCTGeometryExecutor } from "../../../../src/execution/docker-occt-geometry";
import { getRemoteCADWorkerConfig } from "../../../../src/execution/remote-cad-worker";
import { RemoteOCCTGeometryExecutor } from "../../../../src/execution/remote-occt-geometry";
import { DockerOCCTGeometryKernelAdapter } from "../../../../src/providers/occt-geometry";

export const runtime = "nodejs";
export const maxDuration = 150;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function httpError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
}
function env(value: string | undefined): string {
  return value?.trim() ?? "";
}
function storageObjectPath(uri: unknown, projectId: string): string | null {
  if (!nonEmpty(uri)) return null;
  const prefix = "storage://" + CAD_ARTIFACT_BUCKET + "/";
  if (!uri.startsWith(prefix)) return null;
  const objectPath = uri.slice(prefix.length);
  const segments = objectPath.split("/");
  if (segments.length !== 4 || segments[0] !== projectId ||
      segments.some((part) => !/^[A-Za-z0-9_.-]{1,128}$/.test(part) || part === "." || part === "..")) return null;
  return objectPath;
}
function sourceDigest(value: unknown): string | null {
  return typeof value === "string" && SHA256.test(value) ? value : null;
}
function configuredGeometryAdapter() {
  const remote = getRemoteCADWorkerConfig();
  if (remote.configured) return new DockerOCCTGeometryKernelAdapter(new RemoteOCCTGeometryExecutor(remote.value));
  if (remote.error) throw new Error(remote.error);
  const image = env(process.env.CAD_OCCT_IMAGE);
  const dockerBinary = env(process.env.CAD_DOCKER_BINARY) || "docker";
  const workerScriptPath = path.resolve(env(process.env.CAD_OCCT_GEOMETRY_WORKER_PATH) ||
    path.join(process.cwd(), "worker/cad/occt/geometry_kernel.py"));
  if (!image || !path.isAbsolute(workerScriptPath) || !dockerBinary || /[\r\n\0]/.test(dockerBinary)) {
    throw new Error("The trusted OCCT geometry runtime is not configured.");
  }
  if (process.env.NODE_ENV === "production" && !/@sha256:[a-f0-9]{64}$/i.test(image)) {
    throw new Error("Production OCCT geometry images must be pinned by immutable SHA-256 digest.");
  }
  return new DockerOCCTGeometryKernelAdapter(new DockerOCCTGeometryExecutor({
    image, workerScriptPath, dockerBinary
  }));
}
function derivativeFromRow(row: Row): CADDisplayDerivative {
  return {
    schemaVersion: 1,
    artifactId: String(row.id),
    format: "GLB",
    sourceArtifactId: String(row.source_artifact_id),
    sourceArtifactSha256: String(row.source_artifact_sha256),
    modelIdentityId: String(row.model_identity_id),
    modelRevision: Number(row.model_revision),
    converter: {
      providerId: String(row.converter_provider_id),
      version: String(row.converter_version),
      operation: "TESSELLATE"
    },
    tessellation: {
      linearDeflectionMm: Number(row.linear_deflection_mm),
      angularDeflectionRad: Number(row.angular_deflection_rad),
      relative: false
    },
    units: String(row.units),
    coordinateFrame: String(row.coordinate_frame),
    artifactSha256: String(row.artifact_sha256),
    generatedAt: String(row.created_at)
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  const modelIdentityId = url.searchParams.get("modelIdentityId")?.trim();
  if (!isUuid(projectId) || (modelIdentityId && !isUuid(modelIdentityId))) {
    return httpError("A registered project UUID and optional model identity UUID are required.", 400);
  }
  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!authorization.allowed) return httpError(authorization.reason, authorizationFailureStatus(authorization));
    const db = await createClient();
    let query = db.from("engineering_cad_display_derivatives").select("*")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
    if (modelIdentityId) query = query.eq("model_identity_id", modelIdentityId);
    const { data: rows, error } = await query;
    if (error) return httpError("CAD display derivative history is unavailable.", 503);
    const values = rows ?? [];
    const modelIds = [...new Set(values.map((row) => row.model_identity_id).filter(isUuid))];
    const completionIds = [...new Set(values.map((row) => row.completion_id).filter(isUuid))];
    const [modelsResult, completionsResult] = await Promise.all([
      modelIds.length ? db.from("engineering_cad_models").select("id,revision").eq("project_id", projectId).in("id", modelIds) : Promise.resolve({ data: [], error: null }),
      completionIds.length ? db.from("engineering_cad_completions").select("id,artifact_records").eq("project_id", projectId).in("id", completionIds) : Promise.resolve({ data: [], error: null })
    ]);
    if (modelsResult.error || completionsResult.error) return httpError("CAD derivative lineage could not be resolved.", 503);
    const models = new Map((modelsResult.data ?? []).map((row) => [row.id, row]));
    const completions = new Map((completionsResult.data ?? []).map((row) => [row.id, row]));
    const derivatives = await Promise.all(values.map(async (row) => {
      const derivative = derivativeFromRow(row as unknown as Row);
      const model = models.get(row.model_identity_id);
      const completion = completions.get(row.completion_id);
      const source = Array.isArray(completion?.artifact_records)
        ? completion.artifact_records.find((item: unknown) => isRecord(item) && item.id === row.source_artifact_id)
        : null;
      const currentSource = isRecord(source) ? {
        id: String(source.id),
        provenance: isRecord(source.provenance) ? {
          artifactSha256: typeof source.provenance.artifactSha256 === "string" ? source.provenance.artifactSha256 : undefined
        } : undefined
      } : null;
      const state = classifyCADDisplayDerivative(derivative, currentSource, model ? {
        id: model.id, revision: Number(model.revision)
      } : null);
      const { data: signed, error: signError } = await db.storage.from(CAD_ARTIFACT_BUCKET)
        .createSignedUrl(String(row.storage_object_path), CAD_SIGNED_URL_TTL_SECONDS);
      return {
        ...derivative,
        state,
        signedUrl: !signError && signed?.signedUrl ? signed.signedUrl : null
      };
    }));
    return NextResponse.json({ projectId, derivatives, signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS }, {
      headers: { "cache-control": "no-store" }
    });
  } catch {
    return httpError("CAD display derivative service is unavailable.", 503);
  }
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return httpError("Geometry request exceeds the 16 KiB limit.", 413);
  }
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) return httpError("Geometry request exceeds the 16 KiB limit.", 413);
    body = JSON.parse(raw);
  } catch {
    return httpError("Geometry request must be valid JSON.", 400);
  }
  if (!isRecord(body)) return httpError("Geometry request must be a JSON object.", 400);
  const allowed = new Set(["projectId", "completionId", "sourceArtifactId", "operation", "linearDeflectionMm", "angularDeflectionRad"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) return httpError("Geometry request contains unsupported fields.", 400);
  const projectId = body.projectId;
  const completionId = body.completionId;
  const sourceArtifactId = body.sourceArtifactId;
  const operation = body.operation;
  if (!isUuid(projectId) || !isUuid(completionId) || !nonEmpty(sourceArtifactId) || sourceArtifactId.length > 160 ||
      (operation !== "INSPECT" && operation !== "TESSELLATE")) {
    return httpError("A project, accepted completion, source artifact and supported geometry operation are required.", 400);
  }
  const linearDeflectionMm = body.linearDeflectionMm === undefined ? 0.1 : body.linearDeflectionMm;
  const angularDeflectionRad = body.angularDeflectionRad === undefined ? 0.35 : body.angularDeflectionRad;
  if (operation === "TESSELLATE" && (
      typeof linearDeflectionMm !== "number" || !Number.isFinite(linearDeflectionMm) || linearDeflectionMm < 0.001 || linearDeflectionMm > 5 ||
      typeof angularDeflectionRad !== "number" || !Number.isFinite(angularDeflectionRad) || angularDeflectionRad < 0.01 || angularDeflectionRad > Math.PI / 2
  )) return httpError("Tessellation deflection is outside the supported range.", 400);

  let authorization;
  let db: Awaited<ReturnType<typeof createClient>>;
  let serviceDb: ReturnType<typeof createServiceRoleClient>;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
    if (!authorization.allowed) return httpError(authorization.reason, authorizationFailureStatus(authorization));
    db = await createClient();
    serviceDb = createServiceRoleClient();
  } catch {
    return httpError("Project authorization or trusted artifact storage is unavailable.", 503);
  }

  const { data: completion, error: completionError } = await db.from("engineering_cad_completions")
    .select("id,project_id,model_identity_id,status,artifact_records,storage_objects")
    .eq("id", completionId).eq("project_id", projectId).maybeSingle();
  if (completionError) return httpError("CAD completion could not be loaded.", 503);
  if (!completion || completion.status !== "ACCEPTED" || !isUuid(completion.model_identity_id)) {
    return httpError("An accepted CAD completion in this project is required.", 404);
  }
  const { data: model, error: modelError } = await db.from("engineering_cad_models")
    .select("id,revision").eq("id", completion.model_identity_id).eq("project_id", projectId).maybeSingle();
  if (modelError) return httpError("CAD model revision could not be loaded.", 503);
  if (!model || !Number.isSafeInteger(Number(model.revision)) || Number(model.revision) < 1) {
    return httpError("The CAD model revision is unavailable.", 409);
  }

  const artifact = Array.isArray(completion.artifact_records)
    ? completion.artifact_records.find((item: unknown) => isRecord(item) && item.id === sourceArtifactId)
    : null;
  if (!isRecord(artifact) || (artifact.kind !== "SOLID" && artifact.kind !== "STEP") ||
      !isRecord(artifact.provenance) || artifact.provenance.modelIdentityId !== completion.model_identity_id ||
      artifact.provenance.projectId !== projectId) {
    return httpError("The requested source artifact is not an eligible canonical BREP or STEP artifact.", 422);
  }
  const sourceSha256 = sourceDigest(artifact.provenance.artifactSha256);
  const sourceRevision = Number(artifact.provenance.modelRevision);
  if (!sourceSha256 || !Number.isSafeInteger(sourceRevision) || sourceRevision !== Number(model.revision)) {
    return httpError("The source geometry is stale or lacks revision-bound provenance; regenerate the CAD completion before deriving a mesh.", 409);
  }
  if (artifact.units !== "mm") return httpError("Only millimetre CAD artifacts are supported by this geometry worker.", 422);
  const objectPath = storageObjectPath(artifact.uri, projectId);
  const storedPaths = Array.isArray(completion.storage_objects) ? completion.storage_objects : [];
  if (!objectPath || !storedPaths.includes(objectPath)) return httpError("The canonical source artifact is not registered in this completion's private storage manifest.", 403);

  const { data: file, error: downloadError } = await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).download(objectPath);
  if (downloadError || !file) return httpError("The private CAD source artifact could not be retrieved.", 503);
  if (file.size < 1 || file.size > MAX_ARTIFACT_BYTES) return httpError("The canonical source artifact exceeds the 100 MiB processing limit.", 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== sourceSha256) return httpError("The stored source bytes do not match the accepted artifact digest.", 409);

  const source: CADGeometrySource = {
    artifactId: sourceArtifactId,
    modelIdentityId: completion.model_identity_id,
    modelRevision: sourceRevision,
    format: artifact.kind === "SOLID" ? "BREP" : "STEP",
    sha256: digest,
    bytes,
    units: "mm",
    coordinateFrame: "MODEL"
  };
  let adapter: DockerOCCTGeometryKernelAdapter;
  try {
    adapter = configuredGeometryAdapter();
  } catch (error) {
    return httpError(error instanceof Error ? error.message : "OCCT geometry runtime is not configured.", 503);
  }
  if (operation === "INSPECT") {
    const inspected = await adapter.inspect(source);
    return NextResponse.json({
      operation, sourceArtifactId, sourceArtifactSha256: digest, modelRevision: sourceRevision,
      status: inspected.status, topology: inspected.value ?? null,
      errors: inspected.errors, limitations: inspected.limitations
    }, { status: inspected.status === "COMPLETED" ? 200 : 422, headers: { "cache-control": "no-store" } });
  }

  const result = await adapter.tessellate(source, { linearDeflectionMm, angularDeflectionRad });
  if (result.status !== "COMPLETED" || !result.value) {
    return NextResponse.json({ status: result.status, errors: result.errors, limitations: result.limitations }, {
      status: result.status === "UNSUPPORTED" ? 501 : 422,
      headers: { "cache-control": "no-store" }
    });
  }

  const derivativeId = randomUUID();
  const glb = createCADDisplayGLB({
    artifactId: derivativeId,
    sourceArtifactId,
    sourceArtifactSha256: digest,
    positions: result.value.positions,
    normals: result.value.normals,
    indices: result.value.indices,
    units: "mm",
    coordinateFrame: "MODEL"
  });
  const artifactSha256 = createHash("sha256").update(glb).digest("hex");
  const derivative: CADDisplayDerivative = {
    schemaVersion: 1,
    artifactId: derivativeId,
    format: "GLB",
    sourceArtifactId,
    sourceArtifactSha256: digest,
    modelIdentityId: completion.model_identity_id,
    modelRevision: sourceRevision,
    converter: {
      providerId: result.value.providerId,
      version: result.value.providerVersion,
      operation: "TESSELLATE"
    },
    tessellation: { linearDeflectionMm, angularDeflectionRad, relative: false },
    units: "mm",
    coordinateFrame: "MODEL",
    artifactSha256,
    generatedAt: new Date().toISOString()
  };
  const derivativeValidation = validateCADDisplayDerivative(derivative);
  if (!derivativeValidation.valid) return httpError("Generated display derivative failed its metadata contract.", 422);

  const { data: existing, error: existingError } = await db.from("engineering_cad_display_derivatives")
    .select("*").eq("project_id", projectId).eq("model_identity_id", completion.model_identity_id)
    .eq("source_artifact_id", sourceArtifactId).eq("source_artifact_sha256", digest)
    .eq("model_revision", sourceRevision).eq("converter_provider_id", result.value.providerId)
    .eq("converter_version", result.value.providerVersion).eq("linear_deflection_mm", linearDeflectionMm)
    .eq("angular_deflection_rad", angularDeflectionRad).maybeSingle();
  if (existingError) return httpError("Display derivative idempotency lookup failed.", 503);
  if (existing) {
    const { data: signed, error: signError } = await db.storage.from(CAD_ARTIFACT_BUCKET)
      .createSignedUrl(String(existing.storage_object_path), CAD_SIGNED_URL_TTL_SECONDS);
    if (signError || !signed?.signedUrl) return httpError("Existing display derivative could not be signed.", 503);
    return NextResponse.json({ derivative: derivativeFromRow(existing as unknown as Row), signedUrl: signed.signedUrl,
      signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS, created: false }, { headers: { "cache-control": "no-store" } });
  }

  const derivativePath = projectId + "/" + completion.model_identity_id + "/" + completionId + "/display-" + derivativeId + ".glb";
  const { error: uploadError } = await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).upload(derivativePath, glb, {
    upsert: false, contentType: "model/gltf-binary", cacheControl: "3600"
  });
  if (uploadError) return httpError("Private display derivative upload failed.", 503);

  const row = {
    id: derivativeId,
    project_id: projectId,
    model_identity_id: completion.model_identity_id,
    completion_id: completionId,
    source_artifact_id: sourceArtifactId,
    source_artifact_sha256: digest,
    model_revision: sourceRevision,
    storage_object_path: derivativePath,
    artifact_sha256: artifactSha256,
    media_type: "model/gltf-binary",
    converter_provider_id: result.value.providerId,
    converter_version: result.value.providerVersion,
    linear_deflection_mm: linearDeflectionMm,
    angular_deflection_rad: angularDeflectionRad,
    units: "mm",
    coordinate_frame: "MODEL",
    created_by: authorization.subject
  };
  const { error: insertError } = await serviceDb.from("engineering_cad_display_derivatives").insert(row);
  if (insertError) {
    const { data: committedRow, error: reconcileError } = await serviceDb.from("engineering_cad_display_derivatives")
      .select("id").eq("id", derivativeId).eq("project_id", projectId).maybeSingle();
    if (!committedRow && !reconcileError) {
      await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([derivativePath]);
      return httpError("Display derivative metadata could not be committed; the uploaded object was cleaned up.", 503);
    }
    if (reconcileError) return httpError("Display derivative commit is ambiguous. Reload derivative history before retrying.", 503);
  }
  try {
    await persistEngineeringAuditEvent({
      timestamp: new Date().toISOString(),
      actor: { subject: authorization.subject, actorType: "USER" },
      action: "EVIDENCE_WRITE",
      outcome: "SUCCESS",
      projectId,
      resourceType: "CAD_DISPLAY_DERIVATIVE",
      resourceId: derivativeId,
      reason: "A display-only mesh derivative was persisted against exact canonical source bytes; no geometry validation or approval state was changed.",
      metadata: {
        sourceArtifactId, sourceArtifactSha256: digest, artifactSha256,
        modelRevision: sourceRevision, converterProviderId: result.value.providerId,
        converterVersion: result.value.providerVersion, linearDeflectionMm,
        angularDeflectionRad, units: "mm", coordinateFrame: "MODEL"
      }
    });
  } catch {
    const { data: auditRecord, error: auditLookupError } = await serviceDb.from("engineering_audit_events")
      .select("event_id").eq("resource_type", "CAD_DISPLAY_DERIVATIVE")
      .eq("resource_id", derivativeId).eq("action", "EVIDENCE_WRITE").maybeSingle();
    if (auditRecord || auditLookupError) {
      return httpError("Display derivative was committed but its audit acknowledgement is ambiguous. Reload derivative history before retrying.", 503);
    }
    await serviceDb.from("engineering_cad_display_derivatives").delete().eq("id", derivativeId).eq("project_id", projectId);
    await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([derivativePath]);
    return httpError("Display derivative audit persistence failed; the uncommitted derivative was rolled back.", 503);
  }

  const { data: signed, error: signError } = await db.storage.from(CAD_ARTIFACT_BUCKET)
    .createSignedUrl(derivativePath, CAD_SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    return httpError("Display derivative was persisted but its short-lived read URL could not be created. Reload derivative history.", 503);
  }
  return NextResponse.json({
    derivative, signedUrl: signed.signedUrl,
    signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS,
    created: true
  }, { status: 201, headers: { "cache-control": "no-store" } });
}
