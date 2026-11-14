import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { buildDurableAuditRecord } from "../../../../src/audit/durable-store";

type Row = Record<string, unknown>;
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function parseDecision(value: unknown) {
  if (!isRecord(value)) return null;
  if (!isUuid(value.projectId) || !isUuid(value.assessmentId)) return null;
  if (value.decision !== "APPROVED" && value.decision !== "REJECTED") return null;
  if (value.comment !== undefined && (typeof value.comment !== "string" || value.comment.length > 1000)) return null;
  return { projectId: value.projectId, assessmentId: value.assessmentId, decision: value.decision as "APPROVED" | "REJECTED", comment: value.comment as string | undefined };
}
function authorizationStatus(reason: string) {
  return reason.includes("unavailable") ? 503 : 403;
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const input = parseDecision(await request.json());
    if (!input) return fail("A valid projectId, assessmentId, decision and optional comment are required.", 400);
    const authorization = await authorizeSupabaseRequest("APPROVAL.GRANT", input.projectId, { requestId, taskId: input.assessmentId });
    if (!authorization.allowed) return fail(authorization.reason, authorizationStatus(authorization.reason));
    const sessionDb = await createClient();
    const { data: identity, error: identityError } = await sessionDb.auth.getUser();
    if (identityError || !identity.user || identity.user.id !== authorization.subject) return fail("Authenticated approver identity could not be confirmed.", 401);
    const actorId = identity.user.id;
    const db = createServiceRoleClient();
    const { data: assessment, error: assessmentError } = await db.from("engineering_manufacturing_assessments")
      .select("id, project_id, status, created_by").eq("id", input.assessmentId).eq("project_id", input.projectId).maybeSingle();
    if (assessmentError || !assessment) return fail("Manufacturing assessment was not found in this project.", 404);
    if (assessment.status !== "READY_FOR_HUMAN_APPROVAL") return fail("Only a readiness-approved assessment can receive a human decision.", 409);
    if (assessment.created_by === actorId) return fail("The assessment author cannot approve or reject their own release.", 403);

    const { data: prior, error: priorError } = await db.from("engineering_manufacturing_decisions").select("*")
      .eq("project_id", input.projectId).eq("assessment_id", input.assessmentId).maybeSingle();
    if (priorError) return fail("Manufacturing decision idempotency lookup failed.", 503);
    if (prior && prior.decided_by === actorId && prior.decision === input.decision) {
      return NextResponse.json({ decision: prior, idempotentReplay: true }, { status: 200 });
    }
    if (prior) return fail("This manufacturing assessment already has a final human decision.", 409);

    const decisionId = randomUUID();
    const decidedAt = new Date().toISOString();
    const record = {
      id: decisionId, project_id: input.projectId, assessment_id: input.assessmentId,
      decision: input.decision, comment: input.comment ?? null, decided_by: actorId
    };
    const auditRecord = buildDurableAuditRecord({
      timestamp: decidedAt, actor: { subject: actorId, actorType: "USER" },
      action: "APPROVAL_GRANT", outcome: input.decision === "APPROVED" ? "SUCCESS" : "BLOCKED",
      projectId: input.projectId, resourceType: "MANUFACTURING_DECISION", resourceId: decisionId,
      reason: input.decision === "APPROVED"
        ? "Authorized independent reviewer approved a manufacturing readiness package."
        : "Authorized independent reviewer rejected a manufacturing readiness package.",
      metadata: { assessmentId: input.assessmentId, decision: input.decision, comment: input.comment ?? null },
      correlation: { requestId, taskId: input.assessmentId }
    });
    const { data: committed, error: commitError } = await db.rpc("record_manufacturing_decision_with_audit", {
      p_decision: record, p_audit_record: auditRecord
    });
    if (commitError || !isRecord(committed) || !isRecord(committed.decision) || !isRecord(committed.audit)) {
      const { data: reconciled } = await db.from("engineering_manufacturing_decisions").select("*")
        .eq("project_id", input.projectId).eq("assessment_id", input.assessmentId).maybeSingle();
      if (reconciled && reconciled.decided_by === actorId && reconciled.decision === input.decision) {
        return NextResponse.json({ decision: reconciled, idempotentReplay: true }, { status: 200 });
      }
      if (reconciled) return fail("This manufacturing assessment already has a final human decision.", 409);
      return fail("Manufacturing decision and audit transaction could not be confirmed.", 503);
    }
    return NextResponse.json({ decision: committed.decision, audit: committed.audit }, { status: 201 });
  } catch {
    return fail("Manufacturing human decision failed without reporting success.", 503);
  }
}
