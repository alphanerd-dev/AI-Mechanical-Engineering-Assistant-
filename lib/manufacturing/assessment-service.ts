import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../supabase/service";
import { buildDurableAuditRecord } from "../../src/audit/durable-store";
import { assessManufacturingReadiness } from "../../src/manufacturing/readiness";
import type { ManufacturingReadinessRequest } from "../../src/manufacturing/readiness";

type Row = Record<string, unknown>;
type HttpFailure = { message: string; status: number };
type AssessmentKey = { projectId: string; releaseId: string };
type DecisionHistoryKey = { projectId: string; assessmentId: string };
type Result<T> = { ok: true; value: T } | { ok: false; message: string; status: number };
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function fail(input: HttpFailure) {
  return NextResponse.json({ error: input.message }, { status: input.status });
}
function assessmentReceipt(value: unknown): value is Row {
  if (!isRecord(value)) return false;
  if (!isRecord(value.assessment)) return false;
  return isRecord(value.audit);
}
function failure<T>(input: HttpFailure): Result<T> {
  return { ok: false, message: input.message, status: input.status };
}
async function findPriorAssessment(input: AssessmentKey): Promise<Result<Row | null>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_assessments")
    .select("*").eq("project_id", input.projectId).eq("release_id", input.releaseId).maybeSingle();
  if (error) return failure({ message: "Manufacturing assessment idempotency lookup failed.", status: 503 });
  return { ok: true, value: data as Row | null };
}
function priorAssessmentResponse(input: { prior: Row | null; inputSha256: string }) {
  if (!input.prior) return null;
  if (input.prior.input_sha256 !== input.inputSha256) return fail({ message: "This releaseId is already bound to a different assessment input.", status: 409 });
  return NextResponse.json({ assessment: input.prior, idempotentReplay: true }, { status: 200 });
}
async function writeAssessment(input: {
  record: Row; auditRecord: Row; projectId: string; releaseId: string; inputSha256: string; readiness: unknown;
}) {
  const db = createServiceRoleClient();
  const { data, error } = await db.rpc("record_manufacturing_assessment_with_audit", {
    p_assessment: input.record, p_audit_record: input.auditRecord
  });
  if (!error) {
    if (assessmentReceipt(data)) {
      return NextResponse.json({ assessment: data.assessment, audit: data.audit, readiness: input.readiness }, { status: 201 });
    }
  }
  const { data: reconciled } = await db.from("engineering_manufacturing_assessments").select("*")
    .eq("project_id", input.projectId).eq("release_id", input.releaseId).maybeSingle();
  if (reconciled) {
    if (reconciled.input_sha256 === input.inputSha256) {
      return NextResponse.json({ assessment: reconciled, idempotentReplay: true }, { status: 200 });
    }
  }
  return fail({ message: "Manufacturing assessment and audit transaction could not be confirmed.", status: 503 });
}
export async function createManufacturingAssessment(input: {
  body: ManufacturingReadinessRequest; actorId: string; requestId: string;
}) {
  const { body, actorId, requestId } = input;
  const projectId = body.processPlan.projectId;
  const readiness = assessManufacturingReadiness(body);
  const inputSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const prior = await findPriorAssessment({ projectId, releaseId: body.releaseId });
  if (!prior.ok) return fail({ message: prior.message, status: prior.status });
  const replay = priorAssessmentResponse({ prior: prior.value, inputSha256 });
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
async function loadAssessment(input: AssessmentKey): Promise<Result<Row>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_assessments").select("*")
     .eq("project_id", input.projectId).eq("release_id", input.releaseId).maybeSingle();
  if (error) return failure({ message: "Manufacturing assessment history is unavailable.", status: 503 });
  if (!data) return failure({ message: "Manufacturing assessment was not found.", status: 404 });
  return { ok: true, value: data };
}
async function loadDecisions(input: DecisionHistoryKey): Promise<Result<Row[]>> {
  const db = createServiceRoleClient();
  const { data, error } = await db.from("engineering_manufacturing_decisions").select("*")
     .eq("project_id", input.projectId).eq("assessment_id", input.assessmentId).order("decided_at", { ascending: true });
  if (error) return failure({ message: "Manufacturing decision history is unavailable.", status: 503 });
  if (!Array.isArray(data)) return failure({ message: "Manufacturing decision history is unavailable.", status: 503 });
  return { ok: true, value: data as Row[] };
}
export async function readManufacturingAssessmentHistory(input: AssessmentKey) {
  const assessment = await loadAssessment(input);
  if (!assessment.ok) return fail({ message: assessment.message, status: assessment.status });
  const decisions = await loadDecisions({ projectId: input.projectId, assessmentId: String(assessment.value.id) });
  if (!decisions.ok) return fail({ message: decisions.message, status: decisions.status });
  return NextResponse.json({
    assessment: assessment.value, decisions: decisions.value,
    decisionStatus: decisions.value.length ? decisions.value[decisions.value.length - 1].decision : "PENDING"
  });
}
