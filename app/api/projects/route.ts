import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../src/auth/supabase-service";
import { createEmptyEngineeringWorkspaceSnapshot } from "../../../src/workspace/snapshot";

export const runtime = "nodejs";
const MAX_PROJECT_NAME = 120;
const MAX_PROBLEM_STATEMENT = 2000;

function logProjectDatabaseFailure(
  operation: string,
  error: { code?: unknown; status?: unknown } | null | undefined,
  subject?: string,
) {
  let projectRef = "unknown";
  try {
    const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (value) projectRef = new URL(value).hostname.split(".")[0] || "unknown";
  } catch {
    // Never log environment values.
  }
  const provider = process.env.VERCEL === "1"
    ? "vercel"
    : process.env.RENDER === "true"
      ? "render"
      : "node";
  console.error("[engineering-project-diagnostic]", JSON.stringify({
    timestamp: new Date().toISOString(),
    event: "database_operation_failed",
    operation,
    provider,
    projectRef,
    errorCode: typeof error?.code === "string" ? error.code : undefined,
    errorStatus: typeof error?.status === "number" ? error.status : undefined,
    ownershipPolicyDenied: error?.code === "42501",
    userIdSuffix: typeof subject === "string" && subject.length >= 6 ? subject.slice(-6) : undefined,
  }));
}

export async function GET() {
  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.READ");
    if (!authorization.allowed) {
      const status = authorizationFailureStatus(authorization); return NextResponse.json({ error: authorization.reason, code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED" }, { status });
    }
    const db = await createClient();
    const { data, error } = await db
      .from("engineering_projects")
      .select("id,name,stage,status,revision,created_at,updated_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) {
      logProjectDatabaseFailure("projects_select", error);
      return NextResponse.json({ error: "Projects could not be loaded from the workspace database." }, { status: 503 });
    }
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
      const status = authorizationFailureStatus(authorization); return NextResponse.json({ error: authorization.reason, code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED" }, { status });
    }

    // The request is authenticated and role-authorized above. Use the server-only
    // service client for this trusted write and bind ownership to the verified
    // Supabase user ID; never accept owner_id from the request body.
    const db = createServiceRoleClient();
    const { data: project, error: projectError } = await db
      .from("engineering_projects")
      .insert({ owner_id: authorization.subject, name, stage: "PROBLEM", status: "ACTIVE" })
      .select("id,name,stage,status,revision,created_at,updated_at")
      .single();

    if (projectError || !project) {
      logProjectDatabaseFailure("engineering_projects_insert", projectError, authorization.subject);
      const ownershipDenied = projectError?.code === "42501";
      return NextResponse.json({
        error: ownershipDenied
          ? "The database rejected the project ownership check. No project was created."
          : "Project creation failed; no project was reported as created.",
        code: ownershipDenied ? "PROJECT_OWNER_POLICY_DENIED" : "PROJECT_CREATION_FAILED"
      }, { status: ownershipDenied ? 403 : 503 });
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
    if (workspaceError) {
      logProjectDatabaseFailure("engineering_workspaces_insert", workspaceError, authorization.subject);
    }

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
