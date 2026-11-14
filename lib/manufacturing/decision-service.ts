import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../supabase/service";
import { buildDurableAuditRecord } from "../../src/audit/durable-store";
import type { ManufacturingDecisionRequest } from "./decision-request-schema";

type Row = Record<string, unknown>;
type HttpFailure = { message: string; status: number };
type Result<T> = { ok: true; value: T } | { ok: false; message: string; status: number };
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(input: HttpFailure) {
  return NextResponse.json({ error: input.message }, { status: input.status });
}
function failure<T>(input: HttpFailure): Result<T> {
  return { ok: false, message: input.message, status: input.status };
}
async function loadAssessment(input: ManufacturingDecisionRequest): Promise<Result<Row>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_assessments")
    .select("id, project_id, status, created_by").eq("id", input.assessmentId).eq("project_id", input.projectId).maybeSingle();
  if (error || !data) return failure({ message: "Manufacturing assessment was not found in this project.", status: 404 });
  return { ok: true, value: data };
}
function validateApprovalEligibility(input: { assessment: Row; actorId: string }): Result<true> {
  if (input.assessment.status !== "READY_FOR_HUMAN_APPROVAL") {
    return failure({ message: "Only a readiness-approved assessment can receive a human decision.", status: 409 });
  }
  if (input.assessment.created_by === input.actorId) {
    return failure({ message: "The assessment author cannot approve or reject their own release.", status: 403 });
  }
  return { ok: true, value: true };
}
async function findPriorDecision(input: ManufacturingDecisionRequest): Promise<Result<Row | null>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_decisions").select("*")
    .eq("project_id", input.projectId).eq("assessment_id", input.assessmentId).maybeSingle();
  if (error) return failure({ message: "Manufacturing decision idempotency lookup failed.", status: 503 });
  return { ok: true, value: data as Row | null };
}
function priorDecisionResponse(input: { prior: Row | null; actorId: string; decision: ManufacturingDecisionRequest["decision"] }) {
  if (!input.prior) return null;
  if (input.prior.decided_by !== input.actorId) return fail({ message: "This manufacturing assessment already has a final human decision.", status: 409 });
  if (input.prior.decision !== input.decision) return fail({ message: "This manufacturing assessment already has a final human decision.", status: 409 });
  return NextResponse.json({ decision: input.prior, idempotentReplay: true }, { status: 200 });
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
      return fail({ message: "This manufacturing assessment already has a final human decision.", status: 409 });
    }
    return NextResponse.json({ decision: reconciled, idempotentReplay: true }, { status: 200 });
  }
  return fail({ message: "Manufacturing decision and audit transaction could not be confirmed.", status: 503 });
}
export async function submitManufacturingDecision(input: {
  request: ManufacturingDecisionRequest; actorId: string; requestId: string;
}) {
  const assessment = await loadAssessment(input.request);
  if (!assessment.ok) return fail({ message: assessment.message, status: assessment.status });
  const eligibility = validateApprovalEligibility({ assessment: assessment.value, actorId: input.actorId });
  if (!eligibility.ok) return fail({ message: eligibility.message, status: eligibility.status });
  const prior = await findPriorDecision(input.request);
  if (!prior.ok) return fail({ message: prior.message, status: prior.status });
  const replay = priorDecisionResponse({ prior: prior.value, actorId: input.actorId, decision: input.request.decision });
  if (replay) return replay;
  const payload = createDecisionPayload(input);
  return writeDecision({ ...input, ...payload });
}
