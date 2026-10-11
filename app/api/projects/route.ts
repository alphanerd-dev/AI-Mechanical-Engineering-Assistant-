import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../src/auth/supabase-service";
import { createEmptyEngineeringWorkspaceSnapshot } from "../../../src/workspace/snapshot";

export const runtime = "nodejs";
const MAX_PROJECT_NAME = 120;
const MAX_PROBLEM_STATEMENT = 2000;

export async function GET() {
  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.READ");
    if (!authorization.allowed) {
      return NextResponse.json({ error: authorization.reason, code: "ENGINEERING_ROLE_REQUIRED" }, { status: 403 });
    }
    const db = await createClient();
    const { data, error } = await db
      .from("engineering_projects")
      .select("id,name,stage,status,revision,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: "Projects could not be loaded from the workspace database." }, { status: 503 });
    return NextResponse.json({ projects: data ?? [] }, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Project service is unavailable." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const problemStatement = typeof input.problemStatement === "string" ? input.problemStatement.trim() : "";
  if (name.length < 2 || name.length > MAX_PROJECT_NAME) {
    return NextResponse.json({ error: "Project name must contain 2–120 characters." }, { status: 400 });
  }
  if (problemStatement.length > MAX_PROBLEM_STATEMENT) {
    return NextResponse.json({ error: "Problem statement must not exceed 2,000 characters." }, { status: 400 });
  }

  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.WRITE");
    if (!authorization.allowed) {
      return NextResponse.json({ error: authorization.reason, code: "ENGINEERING_ROLE_REQUIRED" }, { status: 403 });
    }

    const db = await createClient();
    const { data: project, error: projectError } = await db
      .from("engineering_projects")
      .insert({ owner_id: authorization.subject, name, stage: "PROBLEM", status: "ACTIVE" })
      .select("id,name,stage,status,revision,created_at,updated_at")
      .single();

    if (projectError || !project) {
      return NextResponse.json({
        error: projectError?.code === "42501"
          ? "The database denied project creation. Confirm that this account has an ADMIN or ENGINEER project role."
          : "Project creation failed; no project was reported as created."
      }, { status: projectError?.code === "42501" ? 403 : 503 });
    }

    const snapshot = createEmptyEngineeringWorkspaceSnapshot({
      id: project.id,
      name: project.name,
      stage: project.stage,
      status: project.status
    });
    if (problemStatement) {
      snapshot.project.openQuestions.push("Define acceptance criteria and boundary conditions for the captured problem.");
      snapshot.project.events.push({
        id: `problem-${project.id}`,
        timestamp: new Date().toISOString(),
        actor: authorization.subject,
        action: "PROBLEM_CAPTURED",
        input: { problemStatement },
        output: { informationStatus: "KNOWN", nextStep: "Define requirements and verification methods." }
      });
      snapshot.project.nextAction = "Define requirements and verification methods for the captured problem.";
    }

    const { error: workspaceError } = await db.from("engineering_workspaces").insert({
      project_id: project.id,
      revision: snapshot.revision,
      snapshot
    });

    return NextResponse.json({
      project,
      workspaceInitialized: !workspaceError,
      warning: workspaceError
        ? "The project was created, but its first workspace snapshot could not be initialized. Open the project to retry initialization."
        : undefined
    }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Project service is unavailable." }, { status: 503 });
  }
}
