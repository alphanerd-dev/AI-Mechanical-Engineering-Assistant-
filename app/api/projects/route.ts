import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../src/auth/supabase-service";
import { createEmptyEngineeringWorkspaceSnapshot } from "../../../src/workspace/snapshot";
import { hashProjectCreationPayload, parseProjectCreationIdempotencyKey } from "../../../src/projects/creation-idempotency.js";

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

type ProjectRecord = {
  id: string;
  name: string;
  stage: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETE";
  revision: number;
  created_at: string;
  updated_at: string;
  creation_payload_sha256?: string | null;
};

const PROJECT_PUBLIC_FIELDS = "id,name,stage,status,revision,created_at,updated_at";
const PROJECT_IDEMPOTENCY_FIELDS = PROJECT_PUBLIC_FIELDS + ",creation_payload_sha256";

function toPublicProject(project: ProjectRecord) {
  return {
    id: project.id,
    name: project.name,
    stage: project.stage,
    status: project.status,
    revision: project.revision,
    created_at: project.created_at,
    updated_at: project.updated_at
  };
}

function buildInitialWorkspaceSnapshot(project: ProjectRecord, problemStatement: string, actor: string) {
  const snapshot = createEmptyEngineeringWorkspaceSnapshot({
    id: project.id,
    name: project.name,
    stage: project.stage,
    status: project.status
  });
  if (problemStatement) {
    snapshot.project.openQuestions.push("Define acceptance criteria and boundary conditions for the captured problem.");
    snapshot.project.events.push({
      id: "problem-" + project.id,
      timestamp: new Date().toISOString(),
      actor,
      action: "PROBLEM_CAPTURED",
      input: { problemStatement },
      output: { informationStatus: "KNOWN", nextStep: "Define requirements and verification methods." }
    });
    snapshot.project.nextAction = "Define requirements and verification methods for the captured problem.";
  }
  return snapshot;
}

/**
 * Initialize the workspace only if it is absent. A replay must never overwrite existing
 * project state; a concurrent initializer is treated as successful only after read-back.
 */
async function ensureInitialWorkspace(
  db: ReturnType<typeof createServiceRoleClient>,
  project: ProjectRecord,
  problemStatement: string,
  actor: string
): Promise<boolean> {
  const { data: current, error: readError } = await db
    .from("engineering_workspaces")
    .select("project_id")
    .eq("project_id", project.id)
    .maybeSingle();

  if (readError) {
    logProjectDatabaseFailure("engineering_workspaces_read_before_initialize", readError, actor);
    return false;
  }
  if (current) return true;

  const snapshot = buildInitialWorkspaceSnapshot(project, problemStatement, actor);
  const { error: insertError } = await db.from("engineering_workspaces").insert({
    project_id: project.id,
    revision: snapshot.revision,
    snapshot
  });
  if (!insertError) return true;

  logProjectDatabaseFailure("engineering_workspaces_insert", insertError, actor);
  const { data: winner, error: verifyError } = await db
    .from("engineering_workspaces")
    .select("project_id")
    .eq("project_id", project.id)
    .maybeSingle();
  return !verifyError && Boolean(winner);
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

  let idempotencyKey: string | undefined;
  try {
    idempotencyKey = parseProjectCreationIdempotencyKey(request.headers.get("idempotency-key"));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Invalid Idempotency-Key header.",
      code: "INVALID_IDEMPOTENCY_KEY"
    }, { status: 400 });
  }
  const payloadSha256 = hashProjectCreationPayload(name, problemStatement);

  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.WRITE");
    if (!authorization.allowed) {
      const status = authorizationFailureStatus(authorization);
      return NextResponse.json({
        error: authorization.reason,
        code: status === 503 ? "AUDIT_STORE_UNAVAILABLE" : "ENGINEERING_ROLE_REQUIRED"
      }, { status });
    }

    // All privileged project/workspace writes stay server-side and follow identity, membership,
    // permission and durable-audit checks. The owner comes only from the verified identity.
    const db = createServiceRoleClient();

    const projectResponse = async (project: ProjectRecord, replay: boolean) => {
      const workspaceInitialized = await ensureInitialWorkspace(
        db, project, problemStatement, authorization.subject
      );
      return NextResponse.json({
        project: toPublicProject(project),
        workspaceInitialized,
        warning: workspaceInitialized
          ? undefined
          : "The project exists, but its workspace snapshot could not be initialized. Retry this same request to safely retry initialization.",
        ...(replay ? { idempotentReplay: true } : {})
      }, { status: replay ? 200 : 201, headers: { "cache-control": "no-store" } });
    };

    const findByIdempotencyKey = async () => db
      .from("engineering_projects")
      .select(PROJECT_IDEMPOTENCY_FIELDS)
      .eq("owner_id", authorization.subject)
      .eq("creation_request_key", idempotencyKey as string)
      .maybeSingle();

    if (idempotencyKey) {
      const { data: previous, error: lookupError } = await findByIdempotencyKey();
      if (lookupError) {
        logProjectDatabaseFailure("project_creation_idempotency_lookup", lookupError, authorization.subject);
        return NextResponse.json({
          error: "Project creation retry state could not be checked. No retry success was reported.",
          code: "PROJECT_CREATION_IDEMPOTENCY_UNAVAILABLE"
        }, { status: 503 });
      }
      if (previous) {
        if (previous.creation_payload_sha256 !== payloadSha256) {
          return NextResponse.json({
            error: "This Idempotency-Key was already used with a different project-creation payload.",
            code: "IDEMPOTENCY_KEY_REUSED"
          }, { status: 409, headers: { "cache-control": "no-store" } });
        }
        return projectResponse(previous as ProjectRecord, true);
      }
    }

    const insertPayload: Record<string, unknown> = {
      owner_id: authorization.subject,
      name,
      stage: "PROBLEM",
      status: "ACTIVE"
    };
    if (idempotencyKey) {
      insertPayload.creation_request_key = idempotencyKey;
      insertPayload.creation_payload_sha256 = payloadSha256;
    }

    const { data: project, error: projectError } = await db
      .from("engineering_projects")
      .insert(insertPayload)
      .select(PROJECT_PUBLIC_FIELDS)
      .single();

    if (projectError || !project) {
      // Two requests with the same key may race between lookup and insert. The database's
      // per-owner unique index selects one winner; read that committed winner back safely.
      if (idempotencyKey && projectError?.code === "23505") {
        const { data: winner, error: winnerLookupError } = await findByIdempotencyKey();
        if (!winnerLookupError && winner) {
          if (winner.creation_payload_sha256 !== payloadSha256) {
            return NextResponse.json({
              error: "This Idempotency-Key was already used with a different project-creation payload.",
              code: "IDEMPOTENCY_KEY_REUSED"
            }, { status: 409, headers: { "cache-control": "no-store" } });
          }
          return projectResponse(winner as ProjectRecord, true);
        }
      }

      logProjectDatabaseFailure("engineering_projects_insert", projectError, authorization.subject);
      const ownershipDenied = projectError?.code === "42501";
      return NextResponse.json({
        error: ownershipDenied
          ? "The database rejected the project ownership check. No project was created."
          : "Project creation failed; no project was reported as created.",
        code: ownershipDenied ? "PROJECT_OWNER_POLICY_DENIED" : "PROJECT_CREATION_FAILED"
      }, { status: ownershipDenied ? 403 : 503 });
    }

    return projectResponse(project as ProjectRecord, false);
  } catch {
    return NextResponse.json({ error: "Project service is unavailable." }, { status: 503 });
  }
}
