import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../supabase/service";
import { buildDurableAuditRecord } from "../../src/audit/durable-store";
import type { ManufacturingDecisionRequest } from "./decision-request-schema";

type Row = Record<string, unknown>;
type Result<T> = { ok: true; value: T } | { ok: false; message: string; status: number };
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function failure<T>(message: string, status: number): Result<T> {
  return { ok: false, message, status };
}
async function loadAssessment(input: ManufacturingDecisionRequest): Promise<Result<Row>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_assessments")
    .select("id, project_id, status, created_by").eq("id", input.assessmentId).eq("project_id", input.projectId).maybeSingle();
  if (error || !data) return failure("Manufacturing assessment was not found in this project.", 404);
  return { ok: true, value: data };
}
function validateApprovalEligibility(assessment: Row, actorId: string): Result<true> {
  if (assessment.status !== "READY_FOR_HUMAN_APPROVAL") {
    return failure("Only a readiness-approved assessment can receive a human decision.", 409);
  }
  if (assessment.created_by === actorId) {
    return failure("The assessment author cannot approve or reject their own release.", 403);
  }
  return { ok: true, value: true };
}
async function findPriorDecision(input: ManufacturingDecisionRequest): Promise<Result<Row | null>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_decisions").select("*")
    .eq("project_id", input.projectId).eq("assessment_id", input.assessmentId).maybeSingle();
  if (error) return failure("Manufacturing decision idempotency lookup failed.", 503);
  return { ok: true, value: data as Row | null };
}
function priorDecisionResponse(prior: Row | null, actorId: string, decision: ManufacturingDecisionRequest["decision"]) {
  if (!prior) return null;
  if (prior.decided_by !== actorId) return fail("This manufacturing assessment already has a final human decision.", 409);
  if (prior.decision !== decision) return fail("This manufacturing assessment already has a final human decision.", 409);
  return NextResponse.json({ decision: prior, idempotentReplay: true }, { status: 200 });
}
function validDecisionReceipt(value: unknown): value is Row {
  if (!isRecord(value)) return false;
  if (!isRecord(value.decision)) return false;
  return isRecord(value.audit);
}
function createDecisionPayload(input: {
  request: ManufacturingDecisionRequest; actorId: string; requestId: string;
}) {
  const decisionId = randomUUID();
  const record = {
    id: decisionId, project_id: input.request.projectId, assessment_id: input.request.assessmentId,
    decision: input.request.decision, comment: input.request.comment ?? null, decided_by: input.actorId
  };
  const auditRecord = buildDurableAuditRecord({
    timestamp: new Date().toISOString(), actor: { subject: input.actorId, actorType: "USER" },
    action: "APPROVAL_GRANT", outcome: input.request.decision === "APPROVED" ? "SUCCESS" : "BLOCKED",
    projectId: input.request.projectId, resourceType: "MANUFACTURING_DECISION", resourceId: decisionId,
    reason: input.request.decision === "APPROVED"
      ? "Authorized independent reviewer approved a manufacturing readiness package."
      : "Authorized independent reviewer rejected a manufacturing readiness package.",
    metadata: { assessmentId: input.request.assessmentId, decision: input.request.decision, comment: input.request.comment ?? null },
    correlation: { requestId: input.requestId, taskId: input.request.assessmentId }
  });
  return { record, auditRecord };
}
async function writeDecision(input: {
  request: ManufacturingDecisionRequest; actorId: string; record: Row; auditRecord: Row;
}) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc("record_manufacturing_decision_with_audit", {
    p_decision: input.record, p_audit_record: input.auditRecord
  });
  if (!error && validDecisionReceipt(data)) {
    return NextResponse.json({ decision: data.decision, audit: data.audit }, { status: 201 });
  }
  const { data: reconciled } = await db.from("engineering_manufacturing_decisions").select("*")
    .eq("project_id", input.request.projectId).eq("assessment_id", input.request.assessmentId).maybeSingle();
  if (reconciled) {
    if (reconciled.decided_by !== input.actorId || reconciled.decision !== input.request.decision) {
      return fail("This manufacturing assessment already has a final human decision.", 409);
    }
    return NextResponse.json({ decision: reconciled, idempotentReplay: true }, { status: 200 });
  }
  return fail("Manufacturing decision and audit transaction could not be confirmed.", 503);
}
export async function submitManufacturingDecision(input: {
  request: ManufacturingDecisionRequest; actorId: string; requestId: string;
}) {
  const assessment = await loadAssessment(input.request);
  if (!assessment.ok) return fail(assessment.message, assessment.status);
  const eligibility = validateApprovalEligibility(assessment.value, input.actorId);
  if (!eligibility.ok) return fail(eligibility.message, eligibility.status);
  const prior = await findPriorDecision(input.request);
  if (!prior.ok) return fail(prior.message, prior.status);
  const replay = priorDecisionResponse(prior.value, input.actorId, input.request.decision);
  if (replay) return replay;
  const payload = createDecisionPayload(input);
  return writeDecision({ ...input, ...payload });
}
