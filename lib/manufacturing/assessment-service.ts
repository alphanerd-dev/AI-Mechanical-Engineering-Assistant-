import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../supabase/service";
import { buildDurableAuditRecord } from "../../src/audit/durable-store";
import { assessManufacturingReadiness } from "../../src/manufacturing/readiness";
import type { ManufacturingReadinessRequest } from "../../src/manufacturing/readiness";

type Row = Record<string, unknown>;
type Result<T> = { ok: true; value: T } | { ok: false; message: string; status: number };
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function assessmentReceipt(value: unknown): value is Row {
  if (!isRecord(value)) return false;
  if (!isRecord(value.assessment)) return false;
  return isRecord(value.audit);
}
function failure<T>(message: string, status: number): Result<T> {
  return { ok: false, message, status };
}
async function findPriorAssessment(projectId: string, releaseId: string): Promise<Result<Row | null>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_assessments")
    .select("*").eq("project_id", projectId).eq("release_id", releaseId).maybeSingle();
  if (error) return failure("Manufacturing assessment idempotency lookup failed.", 503);
  return { ok: true, value: data as Row | null };
}
function priorAssessmentResponse(prior: Row | null, inputSha256: string) {
  if (!prior) return null;
  if (prior.input_sha256 !== inputSha256) return fail("This releaseId is already bound to a different assessment input.", 409);
  return NextResponse.json({ assessment: prior, idempotentReplay: true }, { status: 200 });
}
async function writeAssessment(input: {
  record: Row; auditRecord: Row; projectId: string; releaseId: string; inputSha256: string; readiness: unknown;
}) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc("record_manufacturing_assessment_with_audit", {
    p_assessment: input.record, p_audit_record: input.auditRecord
  });
  if (!error && assessmentReceipt(data)) {
    return NextResponse.json({ assessment: data.assessment, audit: data.audit, readiness: input.readiness }, { status: 201 });
  }
  const { data: reconciled } = await db.from("engineering_manufacturing_assessments").select("*")
    .eq("project_id", input.projectId).eq("release_id", input.releaseId).maybeSingle();
  if (reconciled && reconciled.input_sha256 === input.inputSha256) {
    return NextResponse.json({ assessment: reconciled, idempotentReplay: true }, { status: 200 });
  }
  return fail("Manufacturing assessment and audit transaction could not be confirmed.", 503);
}
export async function createManufacturingAssessment(input: {
  body: ManufacturingReadinessRequest; actorId: string; requestId: string;
}) {
  const { body, actorId, requestId } = input;
  const projectId = body.processPlan.projectId;
  const readiness = assessManufacturingReadiness(body);
  const inputSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const prior = await findPriorAssessment(projectId, body.releaseId);
  if (!prior.ok) return fail(prior.message, prior.status);
  const replay = priorAssessmentResponse(prior.value, inputSha256);
  if (replay) return replay;
  const assessmentId = randomUUID();
  const record = {
    id: assessmentId, project_id: projectId, release_id: body.releaseId,
    status: readiness.status, process_plan: body.processPlan,
    bom_snapshot: readiness.evaluations.bom.bom ?? {},
    readiness_snapshot: readiness, input_snapshot: body,
    required_artifact_ids: body.requiredArtifactIds, input_sha256: inputSha256, created_by: actorId
  };
  const auditRecord = buildDurableAuditRecord({
    timestamp: new Date().toISOString(), actor: { subject: actorId, actorType: "USER" },
    action: "EVIDENCE_WRITE", outcome: readiness.status === "READY_FOR_HUMAN_APPROVAL" ? "SUCCESS" : "BLOCKED",
    projectId, resourceType: "MANUFACTURING_ASSESSMENT", resourceId: assessmentId,
    reason: "Deterministic manufacturing readiness assessment persisted; no machine or production release was executed.",
    metadata: { releaseId: body.releaseId, status: readiness.status, inputSha256 },
    correlation: { requestId, taskId: assessmentId }
  });
  return writeAssessment({ record, auditRecord, projectId, releaseId: body.releaseId, inputSha256, readiness });
}
async function loadAssessment(projectId: string, releaseId: string): Promise<Result<Row>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_assessments").select("*")
    .eq("project_id", projectId).eq("release_id", releaseId).maybeSingle();
  if (error) return failure("Manufacturing assessment history is unavailable.", 503);
  if (!data) return failure("Manufacturing assessment was not found.", 404);
  return { ok: true, value: data };
}
async function loadDecisions(projectId: string, assessmentId: string): Promise<Result<Row[]>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_decisions").select("*")
    .eq("project_id", projectId).eq("assessment_id", assessmentId).order("decided_at", { ascending: true });
  if (error || !Array.isArray(data)) return failure("Manufacturing decision history is unavailable.", 503);
  return { ok: true, value: data as Row[] };
}
export async function readManufacturingAssessmentHistory(projectId: string, releaseId: string) {
  const assessment = await loadAssessment(projectId, releaseId);
  if (!assessment.ok) return fail(assessment.message, assessment.status);
  const decisions = await loadDecisions(projectId, String(assessment.value.id));
  if (!decisions.ok) return fail(decisions.message, decisions.status);
  return NextResponse.json({
    assessment: assessment.value, decisions: decisions.value,
    decisionStatus: decisions.value.length ? decisions.value[decisions.value.length - 1].decision : "PENDING"
  });
}
