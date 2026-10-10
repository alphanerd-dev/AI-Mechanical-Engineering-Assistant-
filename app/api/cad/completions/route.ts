import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { ENGINEERING_CAPABILITIES } from "../../../../src/capabilities/catalog";
import { CapabilityRegistry } from "../../../../src/capabilities/registry";
import { CADPartCompletionResult, CADPartCompletionWorkflow } from "../../../../src/cad/completion";
import { CADArtifact, CADArtifactKind } from "../../../../src/cad/artifacts";
import { CADModelIdentity, validateCADModelIdentity } from "../../../../src/cad/identity";
import {
  CAD_ARTIFACT_BUCKET,
  CAD_SIGNED_URL_TTL_SECONDS,
  cadArtifactStoragePath,
  cadArtifactStorageUri,
  isVerifiedCADCompletion
} from "../../../../src/cad/persistence";
import { CADCapabilityRouter } from "../../../../src/cad/routing";
import { createCADSourceSha256 } from "../../../../src/cad/provenance";
import { parseCADPartIntent } from "../../../../src/cad/intent";
import { DockerOCCTValidatorOptions } from "../../../../src/execution/docker-occt-validator";
import { Build123dIntentCodeGenerator } from "../../../../src/providers/build123d-intent-generator";
import { createDockerBuild123dCADProvider } from "../../../../src/providers/build123d-cad";
import { createDockerOCCTValidationProvider } from "../../../../src/providers/occt-docker";

export const runtime = "nodejs";
const MAX_ARTIFACT_BYTES = 100 * 1024 * 1024;
const MAX_INTENT_CHARS = 5000;
const MAX_REQUIREMENTS = 50;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
function env(value: string | undefined): string {
  return value?.trim() ?? "";
}
function jsonArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
function httpError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function rowModel(row: Row): CADModelIdentity {
  const model = {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    nativeReferences: row.native_references,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  const checked = validateCADModelIdentity(model, String(row.project_id ?? ""));
  if (checked.status !== "PASS") throw new Error("Stored CAD model identity failed validation.");
  return model as CADModelIdentity;
}
function safeImage(value: string): boolean {
  return Boolean(value) && !value.startsWith("-") && !/[\r\n\0]/.test(value);
}
function configuredRuntime() {
  const buildImage = env(process.env.CAD_BUILD123D_IMAGE);
  const occtImage = env(process.env.CAD_OCCT_IMAGE);
  const artifactRoot = env(process.env.CAD_ARTIFACT_ROOT);
  const dockerBinary = env(process.env.CAD_DOCKER_BINARY) || "docker";
  const workerScriptPath = path.resolve(env(process.env.CAD_OCCT_WORKER_PATH) || path.join(process.cwd(), "worker/cad/occt/validate_brep.py"));
  if (!buildImage || !occtImage || !artifactRoot) return { error: "CAD execution is not configured. Set CAD_BUILD123D_IMAGE, CAD_OCCT_IMAGE and CAD_ARTIFACT_ROOT on the server." } as const;
  if (!path.isAbsolute(artifactRoot) || !safeImage(buildImage) || !safeImage(occtImage) ||
      !dockerBinary || /[\r\n\0]/.test(dockerBinary)) {
    return { error: "CAD runtime configuration is invalid; no CAD execution was attempted." } as const;
  }
  if (process.env.NODE_ENV === "production" &&
      (![buildImage, occtImage].every((image) => /@sha256:[a-f0-9]{64}$/i.test(image)))) {
    return { error: "Production CAD images must be pinned by immutable @sha256 image digests." } as const;
  }
  return { buildImage, occtImage, artifactRoot: path.resolve(artifactRoot), dockerBinary, workerScriptPath } as const;
}
function safeArtifactUri(uri: unknown, artifactRoot: string): Promise<{ path: string; bytes: Buffer; sha256: string }> {
  if (!nonEmpty(uri)) return Promise.reject(new Error("CAD artifact has no host artifact URI."));
  return (async () => {
    const root = await realpath(artifactRoot);
    const resolved = await realpath(uri);
    const relative = path.relative(root, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("CAD artifact resolves outside the configured artifact root.");
    const info = await stat(resolved);
    if (!info.isFile() || info.size < 1 || info.size > MAX_ARTIFACT_BYTES) throw new Error("CAD artifact is not a regular file or exceeds the 100 MiB persistence limit.");
    const chunks: Buffer[] = [];
    let size = 0;
    const stream = createReadStream(resolved);
    for await (const raw of stream) {
      const chunk = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
      size += chunk.length;
      if (size > MAX_ARTIFACT_BYTES) throw new Error("CAD artifact exceeded the persistence size limit while reading.");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks);
    return { path: resolved, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  })();
}
function contentType(kind: CADArtifactKind): string {
  switch (kind) {
    case "SOURCE": return "text/x-python";
    case "SOLID": return "application/octet-stream";
    case "STEP": return "model/step";
    case "STL": return "model/stl";
    case "THREE_MF": return "application/vnd.ms-package.3dmanufacturing-3dmodel+xml";
    default: return "application/octet-stream";
  }
}
function errorStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 50) : [];
}
async function signObjectPaths(db: Awaited<ReturnType<typeof createClient>>, projectId: string, value: unknown) {
  const paths = jsonArray(value).filter((item): item is string =>
    typeof item === "string" && item.startsWith(projectId + "/") && !item.split("/").includes("..")
  ).slice(0, 25);
  const links: Record<string, string> = {};
  for (const objectPath of paths) {
    const { data, error } = await db.storage.from(CAD_ARTIFACT_BUCKET)
      .createSignedUrl(objectPath, CAD_SIGNED_URL_TTL_SECONDS);
    if (!error && data?.signedUrl) links[objectPath] = data.signedUrl;
  }
  return links;
}
function storedArtifactRecords(result: CADPartCompletionResult, objectPaths: Map<string, string>, artifactDigests: Map<string, string>) {
  const sourceUri = result.manifest?.artifacts.find((item) => item.kind === "SOURCE");
  const sourceObjectPath = sourceUri ? objectPaths.get(sourceUri.id) : undefined;
  const mappedUri = (artifact: CADArtifact) => {
    const objectPath = objectPaths.get(artifact.id);
    return objectPath ? cadArtifactStorageUri(objectPath) : undefined;
  };
  return (result.manifest?.artifacts ?? []).map((artifact) => {
    const uri = mappedUri(artifact);
    const { uri: _localUri, provenance: _localProvenance, ...clean } = artifact;
    const provenance = artifact.provenance ? {
      ...artifact.provenance,
      outputUri: uri,
      ...(sourceObjectPath ? { sourceArtifactUri: cadArtifactStorageUri(sourceObjectPath) } : { sourceArtifactUri: undefined }),
      ...(uri && artifactDigests.has(artifact.id) ? { artifactSha256: artifactDigests.get(artifact.id) } : {})
    } : undefined;
    return {
      ...clean,
      ...(uri ? { uri } : {}),
      ...(provenance ? { provenance } : {}),
      ...(artifact.kind === "SOLID" && result.bundle
        ? { validationStatus: result.bundle.cad.validationStatus, informationStatus: result.bundle.cad.informationStatus, evidenceIds: result.bundle.cad.evidenceIds }
        : { validationStatus: "UNVALIDATED", informationStatus: "CALCULATED", evidenceIds: [] }),
      requirementIds: artifact.requirementIds ?? []
    };
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim();
  if (!isUuid(projectId)) return httpError("A registered project UUID is required.", 400);
  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!authorization.allowed) return httpError(authorization.reason, 403);
    const db = await createClient();
    const { data, error } = await db
      .from("engineering_cad_completions")
      .select("id,project_id,model_identity_id,execution_id,status,stage,raw_intent,intent_resolution,specification,source_sha256,artifact_records,engineering_artifacts,evidence_records,validation_receipt,storage_objects,errors,warnings,created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return httpError("CAD completion history could not be loaded.", 503);
    const completions = await Promise.all((data ?? []).map(async (row) => ({
      ...row,
      signedUrls: await signObjectPaths(db, projectId, row.storage_objects)
    })));
    return NextResponse.json({ projectId, completions, signedUrlTtlSeconds: CAD_SIGNED_URL_TTL_SECONDS });
  } catch {
    return httpError("CAD completion service is unavailable.", 503);
  }
}

export async function POST(request: Request) {
  let parsed: unknown;
  try { parsed = await request.json(); }
  catch { return httpError("Request body must be valid JSON.", 400); }
  if (!isRecord(parsed)) return httpError("Request body must be a JSON object.", 400);
  const projectId = parsed.projectId;
  const modelIdentityId = parsed.modelIdentityId;
  const rawIntent = typeof parsed.rawIntent === "string" ? parsed.rawIntent.trim() : "";
  const requirementIdsRaw = parsed.requirementIds === undefined ? [] : parsed.requirementIds;
  if (!isUuid(projectId) || !isUuid(modelIdentityId)) return httpError("A registered project UUID and CAD model identity UUID are required.", 400);
  if (!rawIntent || rawIntent.length > MAX_INTENT_CHARS) return httpError("rawIntent must contain 1–5000 characters.", 400);
  if (!Array.isArray(requirementIdsRaw) || requirementIdsRaw.length > MAX_REQUIREMENTS ||
      requirementIdsRaw.some((value) => !nonEmpty(value))) {
    return httpError("requirementIds must be an array of at most 50 non-empty strings.", 400);
  }
  const requirementIds = [...new Set((requirementIdsRaw as string[]).map((item) => item.trim()))];

  let authorization;
  let db: Awaited<ReturnType<typeof createClient>>;
  try {
    authorization = await authorizeSupabaseRequest("TASK.EXECUTE", projectId);
    if (!authorization.allowed) return httpError(authorization.reason, 403);
    db = await createClient();
  } catch {
    return httpError("CAD project authorization or persistence is unavailable.", 503);
  }
  const { data: modelRow, error: modelError } = await db
    .from("engineering_cad_models")
    .select("id,project_id,name,native_references,created_at,updated_at,revision")
    .eq("id", modelIdentityId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (modelError) return httpError("CAD model identity could not be resolved.", 503);
  if (!modelRow) return httpError("CAD model identity was not found in this project.", 404);
  const modelIdentity = rowModel(modelRow as unknown as Row);

  if (requirementIds.length) {
    const { data: workspace, error } = await db
      .from("engineering_workspaces")
      .select("snapshot")
      .eq("project_id", projectId)
      .maybeSingle();
    if (error) return httpError("Requirement context could not be loaded.", 503);
    const requirements = isRecord(workspace?.snapshot) && isRecord(workspace.snapshot.project)
      ? jsonArray(workspace.snapshot.project.requirements)
      : [];
    const known = new Set(requirements.filter(isRecord).map((requirement) => requirement.id).filter((id): id is string => typeof id === "string"));
    if (requirementIds.some((id) => !known.has(id))) return httpError("Every requirementId must exist in this project's durable workspace snapshot.", 422);
  }

  // Incomplete/unsupported intent is safe to record without invoking an unconfigured CAD runtime.
  const intent = parseCADPartIntent(rawIntent);
  if (intent.status !== "READY") {
    const status = intent.status === "NEEDS_INPUT" ? "NEEDS_INPUT" : "UNSUPPORTED";
    const completionId = randomUUID();
    const record = {
      id: completionId,
      project_id: projectId,
      model_identity_id: modelIdentityId,
      status,
      stage: "INTENT",
      raw_intent: rawIntent,
      intent_resolution: intent,
      specification: null,
      artifact_records: [],
      engineering_artifacts: [],
      evidence_records: [],
      storage_objects: [],
      errors: [],
      warnings: intent.warnings,
      created_by: authorization.subject
    };
    const { data, error } = await db.from("engineering_cad_completions").insert(record).select("*").single();
    if (error || !data) return httpError("The incomplete CAD request could not be recorded.", 503);
    return NextResponse.json({ completion: data, signedUrls: {}, persisted: true }, { status: 200 });
  }

  const configured = configuredRuntime();
  if ("error" in configured) return httpError(configured.error, 503);
  let result: CADPartCompletionResult;
  try {
    const registry = new CapabilityRegistry();
    registry.registerCatalog(ENGINEERING_CAPABILITIES);
    registry.register(createDockerBuild123dCADProvider({
      image: configured.buildImage,
      artifactRoot: configured.artifactRoot,
      dockerBinary: configured.dockerBinary
    }));
    const occtOptions: DockerOCCTValidatorOptions = {
      image: configured.occtImage,
      artifactRoot: configured.artifactRoot,
      workerScriptPath: configured.workerScriptPath,
      dockerBinary: configured.dockerBinary
    };
    registry.register(createDockerOCCTValidationProvider(occtOptions));
    const router = new CADCapabilityRouter(registry, [
      { providerId: "cad.build123d", availability: "AVAILABLE" },
      { providerId: "cad.occt", availability: "AVAILABLE" }
    ]);
    const workflow = new CADPartCompletionWorkflow(router, new Build123dIntentCodeGenerator());
    result = await workflow.complete({ projectId, modelIdentity, rawIntent, requirementIds, risk: "HIGH" });
  } catch {
    return httpError("CAD runtime failed before a completion result could be produced.", 503);
  }

  const executionOutput = result.execution?.providerResult?.output;
  const executionId = result.manifest?.provenance?.executionId ??
    (isRecord(executionOutput) && nonEmpty(executionOutput.executionId) ? executionOutput.executionId : null);
  const persistedPaths: string[] = [];
  const objectPaths = new Map<string, string>();
  const artifactDigests = new Map<string, string>();
  const artifactBytes = new Map<string, Buffer>();
  try {
    if (result.status === "ACCEPTED") {
      if (!isVerifiedCADCompletion(result) || !result.manifest || !result.bundle) {
        return httpError("CAD result failed the host acceptance contract; no artifacts were persisted as verified.", 422);
      }
      if (!executionId || !UUID.test(executionId)) throw new Error("Provider execution identity is missing or malformed.");
      const artifacts = result.manifest.artifacts;
      for (const artifact of artifacts) {
        if (!artifact.uri) throw new Error("Accepted CAD completion included an artifact without a host file URI.");
        const file = await safeArtifactUri(artifact.uri, configured.artifactRoot);
        artifactDigests.set(artifact.id, file.sha256);
        artifactBytes.set(artifact.id, file.bytes);
        const objectPath = cadArtifactStoragePath({ projectId, modelIdentityId, executionId, kind: artifact.kind });
        objectPaths.set(artifact.id, objectPath);
        if (artifact.kind === "SOURCE" && result.manifest.provenance?.sourceSha256 !== createCADSourceSha256(file.bytes.toString("utf8"))) {
          throw new Error("Persisted CAD source bytes do not match the accepted source digest.");
        }
        if (artifact.kind === "SOLID" && file.sha256 !== result.bundle.cad.provenance?.artifactSha256) {
          throw new Error("CAD solid bytes changed after independent validation; no verified artifact will be persisted.");
        }
      }
      const solidObjectPath = objectPaths.get(result.bundle.cad.id);
      if (!solidObjectPath || artifactDigests.get(result.bundle.cad.id) !== (result.bundle.evidence.value as Row).artifactSha256) {
        throw new Error("Accepted evidence does not match the exact solid output bytes.");
      }
      for (const artifact of artifacts) {
        const objectPath = objectPaths.get(artifact.id)!;
        const { error } = await db.storage.from(CAD_ARTIFACT_BUCKET).upload(
          objectPath,
          artifactBytes.get(artifact.id)!,
          { upsert: false, contentType: contentType(artifact.kind) }
        );
        if (error) throw new Error("Private CAD artifact upload failed.");
        persistedPaths.push(objectPath);
      }
    }

    const artifactRecords = result.status === "ACCEPTED" ? storedArtifactRecords(result, objectPaths, artifactDigests) : [];
    const engineeringArtifacts = result.status === "ACCEPTED" && result.bundle
      ? [{
          ...result.bundle.engineering,
          uri: cadArtifactStorageUri(objectPaths.get(result.bundle.cad.id)!),
          provenance: {
            ...result.bundle.engineering.provenance,
            artifactSha256: result.bundle.cad.provenance?.artifactSha256,
            sourceArtifactIds: [result.bundle.cad.id]
          }
        }]
      : [];
    const evidenceRecords = result.status === "ACCEPTED" && result.bundle ? [result.bundle.evidence] : [];
    const receipt = result.status === "ACCEPTED" && result.bundle ? result.bundle.evidence.value : null;
    const dbRecord = {
      project_id: projectId,
      model_identity_id: modelIdentityId,
      execution_id: executionId || null,
      status: result.status,
      stage: result.stage,
      raw_intent: rawIntent,
      intent_resolution: result.intent,
      specification: result.specification ?? null,
      source_sha256: result.manifest?.provenance?.sourceSha256 ?? null,
      artifact_records: artifactRecords,
      engineering_artifacts: engineeringArtifacts,
      evidence_records: evidenceRecords,
      validation_receipt: receipt,
      storage_objects: persistedPaths,
      errors: errorStrings(result.errors),
      warnings: errorStrings(result.warnings),
      created_by: authorization.subject
    };
    const { data, error } = await db.from("engineering_cad_completions").insert(dbRecord).select("*").single();
    if (error || !data) throw new Error("CAD completion metadata could not be persisted.");
    return NextResponse.json({
      completion: data,
      signedUrls: await signObjectPaths(db, projectId, persistedPaths),
      persisted: true,
      verified: result.status === "ACCEPTED" && isVerifiedCADCompletion(result)
    }, { status: result.status === "ACCEPTED" ? 201 : result.status === "NEEDS_INPUT" || result.status === "UNSUPPORTED" ? 200 : 422 });
  } catch (error) {
    if (persistedPaths.length) {
      try { await db.storage.from(CAD_ARTIFACT_BUCKET).remove(persistedPaths); } catch { /* Cleanup is best-effort; never report success. */ }
    }
    return httpError(error instanceof Error ? error.message : "CAD completion persistence failed.", 503);
  }
}
