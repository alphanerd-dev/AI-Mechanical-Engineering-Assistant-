import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../../lib/supabase/service";
import { authorizeSupabaseRequest } from "../../../../../src/auth/supabase-service";
import { createGeometryRevisionResponse } from "../../../../../src/cad/geometry-revision-persistence";

export const runtime = "nodejs";
type Row = Record<string, unknown>;
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function parseCreateRequest(body: unknown) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!isRecord(body) || typeof body.projectId !== "string" || !uuid.test(body.projectId) ||
      typeof body.completionId !== "string" || !uuid.test(body.completionId) ||
      !(body.expectedParentRevisionId === null ||
        (typeof body.expectedParentRevisionId === "string" && uuid.test(body.expectedParentRevisionId)))) return null;
  return { projectId: body.projectId, completionId: body.completionId, expectedParentRevisionId: body.expectedParentRevisionId as string | null };
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const input = parseCreateRequest(await request.json());
    if (!input) return fail("A valid projectId, completionId, and expectedParentRevisionId (UUID or null) are required.", 400);
    const authorization = await authorizeSupabaseRequest("EVIDENCE.WRITE", input.projectId, { requestId });
    if (!authorization.allowed) return fail(authorization.reason, authorization.reason.includes("unavailable") ? 503 : 403);
    const sessionDb = await createClient();
    const { data, error } = await sessionDb.auth.getUser();
    if (error || !data.user || data.user.id !== authorization.subject) return fail("Authenticated project identity could not be confirmed.", 401);
    return createGeometryRevisionResponse({ ...input, actorId: data.user.id, requestId });
  } catch {
    return fail("Geometry revision persistence failed without reporting success.", 503);
  }
}

/** Project-authorized read of immutable geometry revision lineage. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? "";
    const modelIdentityId = url.searchParams.get("modelIdentityId") ?? "";
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuid.test(projectId) || !uuid.test(modelIdentityId)) return fail("Valid projectId and modelIdentityId query parameters are required.", 400);
    const authorization = await authorizeSupabaseRequest("EVIDENCE.READ", projectId, { requestId: randomUUID(), taskId: modelIdentityId });
    if (!authorization.allowed) return fail(authorization.reason, authorization.reason.includes("unavailable") ? 503 : 403);
    const db = createServiceRoleClient();
    const { data, error } = await db.from("engineering_geometry_revisions").select("*")
      .eq("project_id", projectId).eq("model_identity_id", modelIdentityId)
      .order("revision_number", { ascending: true }).limit(500);
    if (error || !Array.isArray(data)) return fail("Geometry revision history is unavailable.", 503);
    return NextResponse.json({ revisions: data, count: data.length });
  } catch {
    return fail("Geometry revision history could not be read.", 503);
  }
}
