import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { validateCADModelIdentity } from "../../../../src/cad/identity";

export const runtime = "nodejs";

function isUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function identityFromRow(row: Record<string, unknown>) {
  const model = {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    nativeReferences: row.native_references,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  const validation = validateCADModelIdentity(model, String(row.project_id ?? ""));
  if (validation.status !== "PASS") throw new Error("Stored CAD model identity failed validation.");
  return model;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId")?.trim();
    if (!isUuid(projectId)) return NextResponse.json({ error: "A registered project UUID is required." }, { status: 400 });

    const authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!authorization.allowed) return NextResponse.json({ error: authorization.reason }, { status: 403 });
    const db = await createClient();
    const { data, error } = await db
      .from("engineering_cad_models")
      .select("id,project_id,name,native_references,created_at,updated_at,revision")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return NextResponse.json({ error: "CAD models could not be loaded." }, { status: 503 });
    const models = (data ?? []).map((row) => identityFromRow(row as unknown as Record<string, unknown>));
    return NextResponse.json({ projectId, models });
  } catch {
    return NextResponse.json({ error: "CAD model service is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const input = body as Record<string, unknown>;
  const projectId = input.projectId;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!isUuid(projectId)) return NextResponse.json({ error: "A registered project UUID is required." }, { status: 400 });
  if (name.length < 1 || name.length > 160) {
    return NextResponse.json({ error: "Model name must contain 1–160 characters." }, { status: 400 });
  }

  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.WRITE", projectId);
    if (!authorization.allowed) return NextResponse.json({ error: authorization.reason }, { status: 403 });
    const db = await createClient();
    const { data: project, error: projectError } = await db
      .from("engineering_projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (projectError) return NextResponse.json({ error: "Project access could not be verified." }, { status: 503 });
    if (!project) return NextResponse.json({ error: "Project not found or inaccessible." }, { status: 404 });

    const { data, error } = await db
      .from("engineering_cad_models")
      .insert({
        project_id: projectId,
        name,
        native_references: [],
        created_by: authorization.subject
      })
      .select("id,project_id,name,native_references,created_at,updated_at,revision")
      .single();

    if (error || !data) return NextResponse.json({ error: "CAD model identity could not be created." }, { status: error?.code === "42501" ? 403 : 503 });
    return NextResponse.json({ model: identityFromRow(data as unknown as Record<string, unknown>) }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "CAD model service is unavailable." }, { status: 503 });
  }
}
