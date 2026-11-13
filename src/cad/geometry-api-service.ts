import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "../../lib/supabase/server";
import { createServiceRoleClient } from "../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../auth/supabase-service";
import { persistEngineeringAuditEvent } from "../audit/server";
import { CAD_ARTIFACT_BUCKET, CAD_SIGNED_URL_TTL_SECONDS } from "./persistence";
import { classifyCADDisplayDerivative, validateCADDisplayDerivative, type CADDisplayDerivative } from "./display-derivative";
import { createCADDisplayGLB } from "./glb";
import { validateCADGeometrySource, type CADGeometrySource } from "./geometry-kernel-contract";
import { DockerOCCTGeometryExecutor } from "../execution/docker-occt-geometry";
import { getRemoteCADWorkerConfig } from "../execution/remote-cad-worker";
import { RemoteOCCTGeometryExecutor } from "../execution/remote-occt-geometry";
import { DockerOCCTGeometryKernelAdapter } from "../providers/occt-geometry";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const ALLOWED_FIELDS = new Set(["projectId", "completionId", "sourceArtifactId", "operation", "linearDeflectionMm", "angularDeflectionRad"]);

type Row = Record<string, unknown>;
type Database = Awaited<ReturnType<typeof createClient>>;
type ServiceDatabase = ReturnType<typeof createServiceRoleClient>;

export class CADGeometryAPIError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "CADGeometryAPIError";
  }
}

class CADGeometryAuditAmbiguousError extends CADGeometryAPIError {}

export interface CADGeometryRequest {
  projectId: string;
  completionId: string;
  sourceArtifactId: string;
  operation: "INSPECT" | "TESSELLATE";
  linearDeflectionMm: number;
  angularDeflectionRad: number;
}

interface AuthorizedContext {
  subject: string;
  db: Database;
  serviceDb: ServiceDatabase;
}

interface CanonicalSourceContext {
  source: CADGeometrySource;
  modelIdentityId: string;
  completionId: string;
  sourceSha256: string;
  sourceRevision: number;
}

interface GeneratedDerivative {
  derivative: CADDisplayDerivative;
  bytes: Buffer;
  storagePath: string;
  row: Row;
}

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function sourceDigest(value: unknown): string | null {
  return typeof value === "string" && SHA256.test(value) ? value : null;
}

function fail(message: string, status: number): never {
  throw new CADGeometryAPIError(message, status);
}

function storageObjectPath(uri: unknown, projectId: string): string | null {
  if (!nonEmpty(uri)) return null;
  const prefix = "storage://" + CAD_ARTIFACT_BUCKET + "/";
  if (!uri.startsWith(prefix)) return null;
  const objectPath = uri.slice(prefix.length);
  const segments = objectPath.split("/");
  const validSegments = segments.every((part) =>
    /^[A-Za-z0-9_.-]{1,128}$/.test(part) && part !== "." && part !== ".."
  );
  return segments.length === 4 && segments[0] === projectId && validSegments ? objectPath : null;
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof CADGeometryAPIError) {
    return NextResponse.json({ error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
  }
  return NextResponse.json({ error: "CAD geometry service failed unexpectedly." }, {
    status: 500, headers: { "cache-control": "no-store" }
  });
}

function validateDeflection(body: Row, operation: CADGeometryRequest["operation"]) {
  const linearValue = body.linearDeflectionMm;
  const angularValue = body.angularDeflectionRad;
  if ((linearValue !== undefined && typeof linearValue !== "number") ||
      (angularValue !== undefined && typeof angularValue !== "number")) {
    fail("Tessellation deflection values must be numeric.", 400);
  }
  const linearDeflectionMm = linearValue === undefined ? 0.1 : linearValue;
  const angularDeflectionRad = angularValue === undefined ? 0.35 : angularValue;
  if (operation === "TESSELLATE" && (
      !Number.isFinite(linearDeflectionMm) || linearDeflectionMm < 0.001 || linearDeflectionMm > 5 ||
      !Number.isFinite(angularDeflectionRad) || angularDeflectionRad < 0.01 || angularDeflectionRad > Math.PI / 2
  )) fail("Tessellation deflection is outside the supported range.", 400);
  return { linearDeflectionMm, angularDeflectionRad };
}

export async function parseCADGeometryRequest(request: Request): Promise<CADGeometryRequest> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) fail("Geometry request exceeds the 16 KiB limit.", 413);
  let body: unknown;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_REQUEST_BYTES) fail("Geometry request exceeds the 16 KiB limit.", 413);
    body = JSON.parse(raw);
  } catch (error) {
    if (error instanceof CADGeometryAPIError) throw error;
    fail("Geometry request must be valid JSON.", 400);
  }
  if (!isRecord(body)) fail("Geometry request must be a JSON object.", 400);
  if (Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) fail("Geometry request contains unsupported fields.", 400);
  const { projectId, completionId, sourceArtifactId, operation } = body;
  if (!isUuid(projectId) || !isUuid(completionId) || !nonEmpty(sourceArtifactId) ||
      sourceArtifactId.length > 160 || (operation !== "INSPECT" && operation !== "TESSELLATE")) {
    fail("A project, accepted completion, source artifact and supported geometry operation are required.", 400);
  }
  const deflection = validateDeflection(body, operation);
  return { projectId, completionId, sourceArtifactId, operation, ...deflection };
}

async function authorizeGeometryRequest(projectId: string): Promise<AuthorizedContext> {
  try {
    const authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
    if (!authorization.allowed) fail(authorization.reason, authorizationFailureStatus(authorization));
    return {
      subject: authorization.subject,
      db: await createClient(),
      serviceDb: createServiceRoleClient()
    };
  } catch (error) {
    if (error instanceof CADGeometryAPIError) throw error;
    fail("Project authorization or trusted artifact storage is unavailable.", 503);
  }
}

async function loadAcceptedCompletion(db: Database, request: CADGeometryRequest): Promise<Row> {
  const { data, error } = await db.from("engineering_cad_completions")
    .select("id,project_id,model_identity_id,status,specification,artifact_records,storage_objects")
    .eq("id", request.completionId).eq("project_id", request.projectId).maybeSingle();
  if (error) fail("CAD completion could not be loaded.", 503);
  if (!data || data.status !== "ACCEPTED" || !isUuid(data.model_identity_id)) {
    fail("An accepted CAD completion in this project is required.", 404);
  }
  return data as Row;
}

async function loadCurrentModel(db: Database, projectId: string, modelIdentityId: string): Promise<number> {
  const { data, error } = await db.from("engineering_cad_models")
    .select("id,revision").eq("id", modelIdentityId).eq("project_id", projectId).maybeSingle();
  if (error) fail("CAD model revision could not be loaded.", 503);
  const revision = Number(data?.revision);
  if (!data || !Number.isSafeInteger(revision) || revision < 1) fail("The CAD model revision is unavailable.", 409);
  return revision;
}

function resolveCanonicalArtifact(completion: Row, request: CADGeometryRequest, currentRevision: number) {
  const artifact = Array.isArray(completion.artifact_records)
    ? completion.artifact_records.find((item: unknown) => isRecord(item) && item.id === request.sourceArtifactId)
    : null;
  if (!isRecord(artifact) || (artifact.kind !== "SOLID" && artifact.kind !== "STEP") ||
      !isRecord(artifact.provenance) || artifact.provenance.modelIdentityId !== completion.model_identity_id ||
      artifact.provenance.projectId !== request.projectId) {
    fail("The requested source artifact is not an eligible canonical BREP or STEP artifact.", 422);
  }
  const sha256 = sourceDigest(artifact.provenance.artifactSha256);
  const revision = Number(artifact.provenance.modelRevision);
  if (!sha256 || !Number.isSafeInteger(revision) || revision !== currentRevision) {
    fail("The source geometry is stale or lacks revision-bound provenance; regenerate the CAD completion before deriving a mesh.", 409);
  }
  const parameters = isRecord(artifact.parameters) ? artifact.parameters : {};
  const specification = isRecord(completion.specification) ? completion.specification : {};
  const units = artifact.units ?? parameters.units ?? specification.units;
  if (units !== "mm") fail("Only explicitly declared millimetre CAD artifacts are supported by this geometry worker.", 422);
  const pathValue = storageObjectPath(artifact.uri, request.projectId);
  const storedPaths = Array.isArray(completion.storage_objects) ? completion.storage_objects : [];
  if (!pathValue || !storedPaths.includes(pathValue)) {
    fail("The canonical source artifact is not registered in this completion's private storage manifest.", 403);
  }
  return { artifact, sha256, revision, path: pathValue };
}

async function downloadCanonicalSource(
  serviceDb: ServiceDatabase,
  request: CADGeometryRequest,
  completion: Row,
  artifactContext: ReturnType<typeof resolveCanonicalArtifact>
): Promise<CanonicalSourceContext> {
  const { data: file, error } = await serviceDb.storage.from(CAD_ARTIFACT_BUCKET).download(artifactContext.path);
  if (error || !file) fail("The private CAD source artifact could not be retrieved.", 503);
  if (file.size < 1 || file.size > MAX_ARTIFACT_BYTES) {
    fail("The canonical source artifact exceeds the 100 MiB processing limit.", 413);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== artifactContext.sha256) fail("The stored source bytes do not match the accepted artifact digest.", 409);
  const source: CADGeometrySource = {
    artifactId: request.sourceArtifactId,
    modelIdentityId: String(completion.model_identity_id),
    modelRevision: artifactContext.revision,
    format: artifactContext.artifact.kind === "SOLID" ? "BREP" : "STEP",
    sha256: digest,
    bytes,
    units: "mm",
    coordinateFrame: "MODEL"
  };
  const sourceErrors = validateCADGeometrySource(source);
  if (sourceErrors.length) fail(sourceErrors.join("; "), 422);
  return {
    source,
    modelIdentityId: String(completion.model_identity_id),
    completionId: request.completionId,
    sourceSha256: digest,
    sourceRevision: artifactContext.revision
  };
}

async function loadCanonicalSource(
  context: AuthorizedContext,
  request: CADGeometryRequest
): Promise<CanonicalSourceContext> {
  const completion = await loadAcceptedCompletion(context.db, request);
  const currentRevision = await loadCurrentModel(context.db, request.projectId, String(completion.model_identity_id));
  const artifact = resolveCanonicalArtifact(completion, request, currentRevision);
  return downloadCanonicalSource(context.serviceDb, request, completion, artifact);
}

function createGeometryAdapter(): DockerOCCTGeometryKernelAdapter {
  const remote = getRemoteCADWorkerConfig();
  if (remote.configured) return new DockerOCCTGeometryKernelAdapter(new RemoteOCCTGeometryExecutor(remote.value));
  if (remote.error) fail(remote.error, 503);
  const image = process.env.CAD_OCCT_IMAGE?.trim() ?? "";
  const dockerBinary = process.env.CAD_DOCKER_BINARY?.trim() || "docker";
  const workerScriptPath = path.resolve(process.env.CAD_OCCT_GEOMETRY_WORKER_PATH?.trim() ||
    path.join(process.cwd(), "worker/cad/occt/geometry_kernel.py"));
  if (!image || !dockerBinary || /[\r\n\0]/.test(dockerBinary)) fail("The trusted OCCT geometry runtime is not configured.", 503);
  if (process.env.NODE_ENV === "production" && !/@sha256:[a-f0-9]{64}$/i.test(image)) {
    fail("Production OCCT geometry images must be pinned by immutable SHA-256 digest.", 503);
  }
  return new DockerOCCTGeometryKernelAdapter(new DockerOCCTGeometryExecutor({ image, workerScriptPath, dockerBinary }));
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
    converter: { providerId: String(row.converter_provider_id), version: String(row.converter_version), operation: "TESSELLATE" },
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

async function findExistingDerivative(
  db: Database,
  request: CADGeometryRequest,
  source: CanonicalSourceContext,
  adapter: DockerOCCTGeometryKernelAdapter
): Promise<NextResponse | null> {
  const { data, error } = await db.from("engineering_cad_display_derivatives").select("*")
    .eq("project_id", request.projectId).eq("model_identity_id", source.modelIdentityId)
    .eq("source_artifact_id", request.sourceArtifactId).eq("source_artifact_sha256", source.sourceSha256)
    .eq("model_revision", source.sourceRevision).eq("converter_provider_id", adapter.providerId)
    .eq("converter_version", adapter.providerVersion).eq("linear_deflection_mm", request.linearDeflectionMm)
    .eq("angular_deflection_rad", request.angularDeflectionRad).maybeSingle();
  if (error) fail("Display derivative idempotency lookup failed.", 503);
  if (!data) return null;
  const { data: signed, error: signError } = await db.storage.from(CAD_ARTIFACT_BUCKET)
    .createSignedUrl(String(data.storage_object_path), CAD_SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) fail("Existing display derivative could not be signed.", 503);
  return NextResponse.json({
    derivative: derivativeFromRow(data as unknown as Row),
    signedUrl: signed.signedUrl,
    signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS,
    created: false
  }, { headers: { "cache-control": "no-store" } });
}

async function inspectCanonicalSource(
  adapter: DockerOCCTGeometryKernelAdapter,
  request: CADGeometryRequest,
  source: CanonicalSourceContext
): Promise<NextResponse> {
  const inspected = await adapter.inspect(source.source);
  return NextResponse.json({
    operation: request.operation,
    sourceArtifactId: request.sourceArtifactId,
    sourceArtifactSha256: source.sourceSha256,
    modelRevision: source.sourceRevision,
    status: inspected.status,
    topology: inspected.value ?? null,
    errors: inspected.errors,
    limitations: inspected.limitations
  }, {
    status: inspected.status === "COMPLETED" ? 200 : 422,
    headers: { "cache-control": "no-store" }
  });
}

async function generateDisplayDerivative(
  adapter: DockerOCCTGeometryKernelAdapter,
  request: CADGeometryRequest,
  source: CanonicalSourceContext
): Promise<GeneratedDerivative> {
  const result = await adapter.tessellate(source.source, {
    linearDeflectionMm: request.linearDeflectionMm,
    angularDeflectionRad: request.angularDeflectionRad
  });
  if (result.status !== "COMPLETED" || !result.value) {
    fail(result.errors.join("; ") || "OCCT tessellation failed.", result.status === "UNSUPPORTED" ? 501 : 422);
  }
  const id = randomUUID();
  const bytes = createCADDisplayGLB({
    artifactId: id,
    sourceArtifactId: request.sourceArtifactId,
    sourceArtifactSha256: source.sourceSha256,
    positions: result.value.positions,
    normals: result.value.normals,
    indices: result.value.indices,
    units: "mm",
    coordinateFrame: "MODEL"
  });
  const artifactSha256 = createHash("sha256").update(bytes).digest("hex");
  const derivative: CADDisplayDerivative = {
    schemaVersion: 1,
    artifactId: id,
    format: "GLB",
    sourceArtifactId: request.sourceArtifactId,
    sourceArtifactSha256: source.sourceSha256,
    modelIdentityId: source.modelIdentityId,
    modelRevision: source.sourceRevision,
    converter: { providerId: result.value.providerId, version: result.value.providerVersion, operation: "TESSELLATE" },
    tessellation: {
      linearDeflectionMm: request.linearDeflectionMm,
      angularDeflectionRad: request.angularDeflectionRad,
      relative: false
    },
    units: "mm",
    coordinateFrame: "MODEL",
    artifactSha256,
    generatedAt: new Date().toISOString()
  };
  const validation = validateCADDisplayDerivative(derivative);
  if (!validation.valid) fail("Generated display derivative failed its metadata contract.", 422);
  const storagePath = request.projectId + "/" + source.modelIdentityId + "/" +
    source.completionId + "/display-" + id + ".glb";
  const row = {
    id,
    project_id: request.projectId,
    model_identity_id: source.modelIdentityId,
    completion_id: source.completionId,
    source_artifact_id: request.sourceArtifactId,
    source_artifact_sha256: source.sourceSha256,
    model_revision: source.sourceRevision,
    storage_object_path: storagePath,
    artifact_sha256: artifactSha256,
    media_type: "model/gltf-binary",
    converter_provider_id: derivative.converter.providerId,
    converter_version: derivative.converter.version,
    linear_deflection_mm: request.linearDeflectionMm,
    angular_deflection_rad: request.angularDeflectionRad,
    units: "mm",
    coordinate_frame: "MODEL"
  };
  return { derivative, bytes, storagePath, row };
}

async function persistDerivativeAudit(
  serviceDb: ServiceDatabase,
  subject: string,
  projectId: string,
  derivative: CADDisplayDerivative
): Promise<void> {
  try {
    await persistEngineeringAuditEvent({
      timestamp: new Date().toISOString(),
      actor: { subject, actorType: "USER" },
      action: "EVIDENCE_WRITE",
      outcome: "SUCCESS",
      projectId,
      resourceType: "CAD_DISPLAY_DERIVATIVE",
      resourceId: derivative.artifactId,
      reason: "A display-only mesh derivative was persisted against exact canonical source bytes; no geometry validation or approval state was changed.",
      metadata: {
        sourceArtifactId: derivative.sourceArtifactId,
        sourceArtifactSha256: derivative.sourceArtifactSha256,
        artifactSha256: derivative.artifactSha256,
        modelRevision: derivative.modelRevision,
        converterProviderId: derivative.converter.providerId,
        converterVersion: derivative.converter.version,
        linearDeflectionMm: derivative.tessellation.linearDeflectionMm,
        angularDeflectionRad: derivative.tessellation.angularDeflectionRad,
        units: derivative.units,
        coordinateFrame: derivative.coordinateFrame
      }
    });
  } catch {
    const { data, error } = await serviceDb.from("engineering_audit_events").select("event_id")
      .eq("resource_type", "CAD_DISPLAY_DERIVATIVE").eq("resource_id", derivative.artifactId)
      .eq("action", "EVIDENCE_WRITE").maybeSingle();
    if (data || error) throw new CADGeometryAuditAmbiguousError("Display derivative was committed but its audit acknowledgement is ambiguous. Reload derivative history before retrying.", 503);
    fail("Display derivative audit persistence failed.", 503);
  }
}

async function persistGeneratedDerivative(
  context: AuthorizedContext,
  request: CADGeometryRequest,
  generated: GeneratedDerivative
): Promise<NextResponse> {
  const { derivative, bytes, storagePath, row } = generated;
  const { error: uploadError } = await context.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).upload(storagePath, bytes, {
    upsert: false, contentType: "model/gltf-binary", cacheControl: "3600"
  });
  if (uploadError) fail("Private display derivative upload failed.", 503);

  const insertRow = { ...row, created_by: context.subject };
  const { error: insertError } = await context.serviceDb.from("engineering_cad_display_derivatives").insert(insertRow);
  if (insertError) {
    const { data, error: reconcileError } = await context.serviceDb.from("engineering_cad_display_derivatives")
      .select("id").eq("id", derivative.artifactId).eq("project_id", request.projectId).maybeSingle();
    if (!data && !reconcileError) {
      await context.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storagePath]);
      if (insertError.code === "40001" || insertError.message?.includes("CAD model revision changed")) {
        fail("The CAD model revision changed during tessellation. The temporary derivative was discarded; retry against the current accepted artifact.", 409);
      }
      fail("Display derivative metadata could not be committed; the uploaded object was cleaned up.", 503);
    }
    if (reconcileError) fail("Display derivative commit is ambiguous. Reload derivative history before retrying.", 503);
  }

  try {
    await persistDerivativeAudit(context.serviceDb, context.subject, request.projectId, derivative);
  } catch (error) {
    if (error instanceof CADGeometryAuditAmbiguousError) throw error;
    await context.serviceDb.from("engineering_cad_display_derivatives").delete()
      .eq("id", derivative.artifactId).eq("project_id", request.projectId);
    await context.serviceDb.storage.from(CAD_ARTIFACT_BUCKET).remove([storagePath]);
    throw new CADGeometryAPIError("Display derivative audit persistence failed; the uncommitted derivative was rolled back.", 503);
  }

  const { data: signed, error: signError } = await context.db.storage.from(CAD_ARTIFACT_BUCKET)
    .createSignedUrl(storagePath, CAD_SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    fail("Display derivative was persisted but its short-lived read URL could not be created. Reload derivative history.", 503);
  }
  return NextResponse.json({
    derivative,
    signedUrl: signed.signedUrl,
    signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS,
    created: true
  }, { status: 201, headers: { "cache-control": "no-store" } });
}

export async function executeCADGeometryRequest(request: Request): Promise<NextResponse> {
  try {
    const payload = await parseCADGeometryRequest(request);
    const context = await authorizeGeometryRequest(payload.projectId);
    const source = await loadCanonicalSource(context, payload);
    const adapter = createGeometryAdapter();
    if (payload.operation === "INSPECT") return inspectCanonicalSource(adapter, payload, source);
    const existing = await findExistingDerivative(context.db, payload, source, adapter);
    if (existing) return existing;
    const generated = await generateDisplayDerivative(adapter, payload, source);
    return await persistGeneratedDerivative(context, payload, generated);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function listCADDisplayDerivatives(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  const modelIdentityId = url.searchParams.get("modelIdentityId")?.trim();
  if (!isUuid(projectId) || (modelIdentityId && !isUuid(modelIdentityId))) {
    return NextResponse.json({ error: "A registered project UUID and optional model identity UUID are required." }, { status: 400 });
  }
  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!authorization.allowed) fail(authorization.reason, authorizationFailureStatus(authorization));
    const db = await createClient();
    let query = db.from("engineering_cad_display_derivatives").select("*")
      .eq("project_id", projectId).order("created_at", { ascending: false }).limit(100);
    if (modelIdentityId) query = query.eq("model_identity_id", modelIdentityId);
    const { data: rows, error } = await query;
    if (error) fail("CAD display derivative history is unavailable.", 503);
    const values = rows ?? [];
    const modelIds = [...new Set(values.map((row) => row.model_identity_id).filter(isUuid))];
    const completionIds = [...new Set(values.map((row) => row.completion_id).filter(isUuid))];
    const [modelsResult, completionsResult] = await Promise.all([
      modelIds.length ? db.from("engineering_cad_models").select("id,revision").eq("project_id", projectId).in("id", modelIds) : Promise.resolve({ data: [], error: null }),
      completionIds.length ? db.from("engineering_cad_completions").select("id,artifact_records").eq("project_id", projectId).in("id", completionIds) : Promise.resolve({ data: [], error: null })
    ]);
    if (modelsResult.error || completionsResult.error) fail("CAD derivative lineage could not be resolved.", 503);
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
  } catch (error) {
    return errorResponse(error);
  }
}
