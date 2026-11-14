import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { buildDurableAuditRecord } from "../../../../src/audit/durable-store";
import { parseManufacturingDecisionRequest } from "../../../../lib/manufacturing/decision-request-schema";
import type { ManufacturingDecisionRequest } from "../../../../lib/manufacturing/decision-request-schema";

type Row = Record<string, unknown>;
type DecisionInput = ManufacturingDecisionRequest;
type Result<T> = { ok: true; value: T } | { ok: false; message: string; status: number };
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function authorizationStatus(reason: string) {
  return reason.includes("unavailable") ? 503 : 403;
}
function failure<T>(message: string, status: number): Result<T> {
  return { ok: false, message, status };
}
async function loadAssessment(db: ReturnType<typeof createServiceRoleClient>, input: DecisionInput): Promise<Result<Row>> {
  const { data, error } = await db.from("engineering_manufacturing_assessments")
    .select("id, project_id, status, created_by").eq("id", input.assessmentId).eq("project_id", input.projectId).maybeSingle();
  if (error || !data) return failure("Manufacturing assessment was not found in this project.", 404);
  return { ok: true, value: data };
}
async function findPriorDecision(db: ReturnType<typeof createServiceRoleClient>, input: DecisionInput) {
  const { data, error } = await db.from("engineering_manufacturing_decisions").select("*")
    .eq("project_id", input.projectId).eq("assessment_id", input.assessmentId).maybeSingle();
  if (error) return failure<Row | null>("Manufacturing decision idempotency lookup failed.", 503);
  return { ok: true as const, value: data as Row | null };
}
function validDecisionReceipt(value: unknown): value is Row {
  return isRecord(value) && isRecord(value.decision) && isRecord(value.audit);
}
async function commitDecision(input: {
  db: ReturnType<typeof createServiceRoleClient>; record: Row; auditRecord: Row;
  request: DecisionInput; actorId: string;
}) {
  const { db, record, auditRecord, request, actorId } = input;
  const { data, error } = await db.rpc("record_manufacturing_decision_with_audit", {
    p_decision: record, p_audit_record: auditRecord
  });
  if (!error) {
    if (validDecisionReceipt(data)) {
      return NextResponse.json({ decision: data.decision, audit: data.audit }, { status: 201 });
    }
  }
  const { data: reconciled } = await db.from("engineering_manufacturing_decisions").select("*")
    .eq("project_id", request.projectId).eq("assessment_id", request.assessmentId).maybeSingle();
  if (reconciled) {
    if (reconciled.decided_by !== actorId) return fail("This manufacturing assessment already has a final human decision.", 409);
    if (reconciled.decision !== request.decision) return fail("This manufacturing assessment already has a final human decision.", 409);
    return NextResponse.json({ decision: reconciled, idempotentReplay: true }, { status: 200 });
  }
  return fail("Manufacturing decision and audit transaction could not be confirmed.", 503);
}
function priorDecisionResponse(prior: Row | null, actorId: string, decision: DecisionInput["decision"]) {
  if (!prior) return null;
  if (prior.decided_by !== actorId) return fail("This manufacturing assessment already has a final human decision.", 409);
  if (prior.decision !== decision) return fail("This manufacturing assessment already has a final human decision.", 409);
  return NextResponse.json({ decision: prior, idempotentReplay: true }, { status: 200 });
}
async function submitDecision(input: DecisionInput, actorId: string, requestId: string) {
  const db = createServiceRoleClient();
  const assessment = await loadAssessment(db, input);
  if (!assessment.ok) return fail(assessment.message, assessment.status);
  if (assessment.value.status !== "READY_FOR_HUMAN_APPROVAL") {
    return fail("Only a readiness-approved assessment can receive a human decision.", 409);
  }
  if (assessment.value.created_by === actorId) return fail("The assessment author cannot approve or reject their own release.", 403);
  const prior = await findPriorDecision(db, input);
  if (!prior.ok) return fail(prior.message, prior.status);
  const priorResponse = priorDecisionResponse(prior.value, actorId, input.decision);
  if (priorResponse) return priorResponse;
  const decisionId = randomUUID();
  const record = {
    id: decisionId, project_id: input.projectId, assessment_id: input.assessmentId,
    decision: input.decision, comment: input.comment ?? null, decided_by: actorId
  };
  const auditRecord = buildDurableAuditRecord({
    timestamp: new Date().toISOString(), actor: { subject: actorId, actorType: "USER" },
    action: "APPROVAL_GRANT", outcome: input.decision === "APPROVED" ? "SUCCESS" : "BLOCKED",
    projectId: input.projectId, resourceType: "MANUFACTURING_DECISION", resourceId: decisionId,
    reason: input.decision === "APPROVED"
      ? "Authorized independent reviewer approved a manufacturing readiness package."
      : "Authorized independent reviewer rejected a manufacturing readiness package.",
    metadata: { assessmentId: input.assessmentId, decision: input.decision, comment: input.comment ?? null },
    correlation: { requestId, taskId: input.assessmentId }
  });
  return commitDecision({ db, record, auditRecord, request: input, actorId });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const input = parseManufacturingDecisionRequest(await request.json());
    if (!input) return fail("A valid projectId, assessmentId, decision and optional comment are required.", 400);
    const authorization = await authorizeSupabaseRequest("APPROVAL.GRANT", input.projectId, { requestId, taskId: input.assessmentId });
    if (!authorization.allowed) return fail(authorization.reason, authorizationStatus(authorization.reason));
    const sessionDb = await createClient();
    const { data: identity, error } = await sessionDb.auth.getUser();
    if (error) return fail("Authenticated approver identity could not be confirmed.", 401);
    if (!identity.user) return fail("Authenticated approver identity could not be confirmed.", 401);
    if (identity.user.id !== authorization.subject) return fail("Authenticated approver identity could not be confirmed.", 401);
    return submitDecision(input, identity.user.id, requestId);
  } catch {
    return fail("Manufacturing human decision failed without reporting success.", 503);
  }
}
