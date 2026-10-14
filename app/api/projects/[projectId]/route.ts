import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PROJECT_NAME = 120;
const ARTIFACT_BUCKET = "engineering-cad-artifacts";
const STORAGE_PAGE_SIZE = 100;

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

function validStoredObjectPath(projectId: string, value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith(projectId + "/")) return false;
  const segments = value.split("/");
  return segments[0] === projectId
    && segments.length >= 2
    && segments.slice(1).every((segment) => segment.length > 0 && segment !== "." && segment !== ".." && !segment.includes("\\"));
}

async function collectProjectObjectPaths(
  db: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
): Promise<Set<string>> {
  const paths = new Set<string>();

  async function walk(folder: string, depth: number): Promise<void> {
    if (depth > 12) throw new Error("Artifact folder nesting exceeds the safe cleanup limit.");
    let offset = 0;

    while (true) {
      const { data, error } = await db.storage
        .from(ARTIFACT_BUCKET)
        .list(folder, { limit: STORAGE_PAGE_SIZE, offset });
      if (error) throw new Error("Project artifact inventory could not be listed.");

      const entries = data ?? [];
      for (const entry of entries) {
        const name = entry.name;
        if (
          typeof name !== "string"
          || name.length === 0
          || name === "."
          || name === ".."
          || name.includes("/")
          || name.includes("\\")
        ) {
          throw new Error("Project artifact inventory contains an unsafe path segment.");
        }

        const objectPath = folder + "/" + name;
        if (entry.id == null && entry.metadata == null) {
          await walk(objectPath, depth + 1);
        } else {
          if (!validStoredObjectPath(projectId, objectPath)) {
            throw new Error("Project artifact inventory contains a path outside the project scope.");
          }
          paths.add(objectPath);
        }
      }

      if (entries.length < STORAGE_PAGE_SIZE) break;
      offset += entries.length;
    }
  }

  await walk(projectId, 0);

  const { data: completions, error: completionError } = await db
    .from("engineering_cad_completions")
    .select("storage_objects")
    .eq("project_id", projectId);
  if (completionError) throw new Error("Project artifact references could not be loaded.");

  for (const completion of completions ?? []) {
    const storedPaths: unknown = completion.storage_objects;
    if (storedPaths == null) continue;
    if (!Array.isArray(storedPaths)) {
      throw new Error("Project artifact references are malformed.");
    }
    for (const path of storedPaths) {
      if (!validStoredObjectPath(projectId, path)) {
        throw new Error("A recorded artifact path falls outside the project scope; deletion was stopped.");
      }
      paths.add(path);
    }
  }

  return paths;
}

async function removeProjectObjects(
  db: Awaited<ReturnType<typeof createClient>>,
  paths: string[],
): Promise<void> {
  // Keep each storage operation bounded; on any failure, leave the project rows
  // intact and report no deletion success so the owner can safely retry.
  for (let offset = 0; offset < paths.length; offset += 100) {
    const batch = paths.slice(offset, offset + 100);
    const { error } = await db.storage.from(ARTIFACT_BUCKET).remove(batch);
    if (error) throw new Error("One or more project artifacts could not be removed.");
  }
}

/** Read a project the current user is permitted to access. */
export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!UUID.test(projectId)) return jsonError("A registered project UUID is required.", 400);

  const authorization = await authorizeProject("PROJECT.READ", projectId);
  if (!authorization) return jsonError("Authorization service is unavailable.", 503);
  if (!authorization.allowed) return jsonError(authorization.reason, 403);

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
  if (!authorization.allowed) return jsonError(authorization.reason, 403);

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
  if (!authorization.allowed) return jsonError(authorization.reason, 403);

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
      objectPaths = await collectProjectObjectPaths(db, projectId);
    } catch {
      return jsonError("Project artifacts could not be safely inventoried; deletion was stopped.", 503);
    }

    try {
      await removeProjectObjects(db, [...objectPaths]);
    } catch {
      return jsonError("Project artifact cleanup failed; project records were retained and no deletion success was reported.", 503);
    }

    const { data: deleted, error: deleteError } = await db
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
      artifactCleanup: { status: "COMPLETED", objectsRemoved: objectPaths.size },
    }, { headers: { "cache-control": "no-store" } });
  } catch {
    return jsonError("Project service is unavailable; no deletion success was reported.", 503);
  }
}
