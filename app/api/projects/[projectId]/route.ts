import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { inventoryProjectArtifacts, inventoryProjectStorageArtifacts, removeProjectArtifacts } from "../../../../src/projects/artifact-cleanup";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROJECT_NAME = 120;
const ARTIFACT_BUCKET = "engineering-cad-artifacts";

type RouteContext = { params: Promise<{ projectId: string }> };
type ProjectRecord = {
  id: string;
  name: string;
  stage: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETE";
  revision: number;
  created_at: string;
  updated_at: string;
};

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json(
    { error, ...extra },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function safeProject(record: ProjectRecord) {
  return {
    id: record.id,
    name: record.name,
    stage: record.stage,
    status: record.status,
    revision: record.revision,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

async function authorizeProject(permission: "PROJECT.READ" | "PROJECT.WRITE", projectId: string) {
  try {
    const result = await authorizeSupabaseRequest(permission, projectId);
    return result;
  } catch {
    return null;
  }
}

async function loadProjectOwner(db: Awaited<ReturnType<typeof createClient>>, projectId: string) {
  return db.from("engineering_projects")
    .select("id,owner_id,name,stage,status,revision,created_at,updated_at")
    .eq("id", projectId)
    .maybeSingle();
}

/** Read a project the current user is permitted to access. */
export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!UUID.test(projectId)) return jsonError("A registered project UUID is required.", 400);

  const authorization = await authorizeProject("PROJECT.READ", projectId);
  if (!authorization) return jsonError("Authorization service is unavailable.", 503);
  if (!authorization.allowed) { const status = authorizationFailureStatus(authorization); return jsonError(authorization.reason, status, status === 503 ? { code: "AUDIT_STORE_UNAVAILABLE" } : undefined); }

  try {
    const db = await createClient();
    const { data, error } = await loadProjectOwner(db, projectId);
    if (error) return jsonError("Project could not be loaded.", 503);
    if (!data) return jsonError("Project not found or inaccessible.", 404);
    return NextResponse.json({ project: safeProject(data as ProjectRecord) }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return jsonError("Project service is unavailable.", 503);
  }
}

/**
 * Rename a project with compare-and-set revision semantics. The database RPC
 * updates the project row and matching workspace snapshot atomically.
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!UUID.test(projectId)) return jsonError("A registered project UUID is required.", 400);

  const parsed = await request.json().catch(() => null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return jsonError("Request body must be a valid JSON object.", 400);
  }
  const input = parsed as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["name", "expectedRevision"].includes(key))) {
    return jsonError("Only name and expectedRevision may be updated through this endpoint.", 400);
  }
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (name.length < 2 || name.length > MAX_PROJECT_NAME) {
    return jsonError("Project name must contain 2–120 characters.", 400);
  }
  if (!Number.isSafeInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) {
    return jsonError("expectedRevision must be a positive integer.", 400);
  }

  const authorization = await authorizeProject("PROJECT.WRITE", projectId);
  if (!authorization) return jsonError("Authorization service is unavailable.", 503);
  if (!authorization.allowed) { const status = authorizationFailureStatus(authorization); return jsonError(authorization.reason, status, status === 503 ? { code: "AUDIT_STORE_UNAVAILABLE" } : undefined); }

  try {
    const db = await createClient();
    const { data: existing, error: loadError } = await loadProjectOwner(db, projectId);
    if (loadError) return jsonError("Project could not be loaded for update.", 503);
    if (!existing) return jsonError("Project not found or inaccessible.", 404);
    if (existing.owner_id !== authorization.subject) {
      return jsonError("Only the project owner can rename this project.", 403);
    }
    if (Number(existing.revision) !== Number(input.expectedRevision)) {
      return NextResponse.json({
        error: "This project changed since it was loaded. Reload before retrying.",
        code: "PROJECT_REVISION_CONFLICT",
        currentRevision: Number(existing.revision),
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const { data, error } = await db.rpc("update_engineering_project_name", {
      p_project_id: projectId,
      p_expected_revision: Number(input.expectedRevision),
      p_name: name,
    });

    if (error) {
      if (error.code === "40001") {
        const { data: current } = await loadProjectOwner(db, projectId);
        return NextResponse.json({
          error: "This project changed during the update. Reload before retrying.",
          code: "PROJECT_REVISION_CONFLICT",
          currentRevision: current ? Number(current.revision) : null,
        }, { status: 409, headers: { "cache-control": "no-store" } });
      }
      if (error.code === "42501") return jsonError("Only the project owner can rename this project.", 403);
      if (error.code === "22023") return jsonError("Project name is invalid.", 400);
      return jsonError("Project update could not be confirmed; no success was reported.", 503);
    }

    const updated = (Array.isArray(data) ? data[0] : data) as ProjectRecord | null;
    if (!updated) return jsonError("Project update returned no confirmation.", 503);
    return NextResponse.json({ project: safeProject(updated) }, {
      headers: { "cache-control": "no-store" },
    });
  } catch {
    return jsonError("Project service is unavailable.", 503);
  }
}

/**
 * Delete only projects owned by the current user. Inventory and remove every
 * storage object under this project prefix before cascading project records.
 */
export async function DELETE(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!UUID.test(projectId)) return jsonError("A registered project UUID is required.", 400);

  const authorization = await authorizeProject("PROJECT.WRITE", projectId);
  if (!authorization) return jsonError("Authorization service is unavailable.", 503);
  if (!authorization.allowed) { const status = authorizationFailureStatus(authorization); return jsonError(authorization.reason, status, status === 503 ? { code: "AUDIT_STORE_UNAVAILABLE" } : undefined); }

  try {
    const db = await createClient();
    const { data: project, error: loadError } = await loadProjectOwner(db, projectId);
    if (loadError) return jsonError("Project could not be loaded for deletion.", 503);
    if (!project) return jsonError("Project not found or inaccessible.", 404);
    if (project.owner_id !== authorization.subject) {
      return jsonError("Only the project owner can delete this project.", 403);
    }

    let objectPaths: Set<string>;
    try {
      objectPaths = await inventoryProjectArtifacts(
        projectId,
        async (folder, options) => {
          const { data, error } = await db.storage.from(ARTIFACT_BUCKET).list(folder, options);
          return { data: data ?? null, error };
        },
        async () => {
          const { data, error } = await db
            .from("engineering_cad_completions")
            .select("storage_objects")
            .eq("project_id", projectId);
          return {
            data: data === null ? null : data.map((completion) => ({
              storage_objects: (completion as { storage_objects: unknown }).storage_objects,
            })),
            error,
          };
        },
      );
    } catch {
      return jsonError("Project artifacts could not be safely inventoried; deletion was stopped.", 503);
    }

    let objectsRemoved: number;
    try {
      objectsRemoved = await removeProjectArtifacts([...objectPaths], async (paths) => {
        const { data, error } = await db.storage.from(ARTIFACT_BUCKET).remove(paths);
        return { data: data ?? null, error };
      });
    } catch {
      return jsonError("Project artifact cleanup failed; project records were retained and no deletion success was reported.", 503);
    }

    // Verify the bucket prefix is empty while the project owner row still exists.
    // Do not rely only on the requested deletion count or on the remove API result.
    let remainingPaths: Set<string>;
    try {
      remainingPaths = await inventoryProjectStorageArtifacts(
        projectId,
        async (folder, options) => {
          const { data, error } = await db.storage.from(ARTIFACT_BUCKET).list(folder, options);
          return { data: data ?? null, error };
        },
      );
    } catch {
      return jsonError(
        "Project artifacts were removed but cleanup could not be verified; project records were retained.",
        503,
        { code: "PROJECT_ARTIFACT_CLEANUP_UNVERIFIED" },
      );
    }
    if (remainingPaths.size > 0) {
      return jsonError(
        "Project artifact cleanup left objects behind; project records were retained.",
        503,
        { code: "PROJECT_ARTIFACTS_REMAIN", objectsRemaining: remainingPaths.size },
      );
    }

    // Use the server-only service client only after authentication, owner verification,
    // complete storage inventory, removal, and post-removal verification. Authenticated
    // clients must not be able to bypass this cleanup by calling PostgREST DELETE directly.
    const cleanupDb = createServiceRoleClient();
    const { data: deleted, error: deleteError } = await cleanupDb
      .from("engineering_projects")
      .delete()
      .eq("id", projectId)
      .eq("owner_id", authorization.subject)
      .select("id")
      .maybeSingle();

    if (deleteError) {
      return jsonError("Artifacts were cleaned, but project deletion was not confirmed. Retry the deletion; no success was reported.", 503);
    }
    if (!deleted) {
      return jsonError("Project deletion was not confirmed. Reload the project list before retrying.", 409, {
        code: "PROJECT_DELETE_NOT_CONFIRMED",
      });
    }

    return NextResponse.json({
      projectId,
      deleted: true,
      artifactCleanup: {
        status: "COMPLETED",
        objectsRemoved,
        objectsRemaining: remainingPaths.size,
        verification: "POST_REMOVE_STORAGE_INVENTORY",
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Project service is unavailable; no deletion success was reported.", 503);
  }
}
