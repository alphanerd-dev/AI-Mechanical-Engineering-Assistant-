import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { createServiceRoleClient } from "../../../../lib/supabase/service";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import { buildDurableAuditRecord } from "../../../../src/audit/durable-store";
import { assessManufacturingReadiness } from "../../../../src/manufacturing/readiness";
import { parseManufacturingReadinessRequest } from "../../../../lib/manufacturing/readiness-request-schema";
import type { ManufacturingReadinessRequest } from "../../../../src/manufacturing/readiness";

type Row = Record<string, unknown>;
type Result<T> = { ok: true; value: T } | { ok: false; message: string; status: number };
function isRecord(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}
function authorizationStatus(reason: string) {
  return reason.includes("unavailable") ? 503 : 403;
}
function assessmentReceipt(value: unknown): value is Row {
  return isRecord(value) && isRecord(value.assessment) && isRecord(value.audit);
}
function failed<T>(message: string, status: number): Result<T> {
  return { ok: false, message, status };
}

async function createAssessment(input: {
  body: ManufacturingReadinessRequest; actorId: string; requestId: string;
}) {
  const { body, actorId, requestId } = input;
  const projectId = body.processPlan.projectId;
  const readiness = assessManufacturingReadiness(body);
  const inputSha256 = createHash("sha256").update(JSON.stringify(body)).digest("hex");
  const db = createServiceRoleClient();
  const { data: prior, error: priorError } = await db.from("engineering_manufacturing_assessments")
    .select("*").eq("project_id", projectId).eq("release_id", body.releaseId).maybeSingle();
  if (priorError) return fail("Manufacturing assessment idempotency lookup failed.", 503);
  if (prior) {
    if (prior.input_sha256 !== inputSha256) return fail("This releaseId is already bound to a different assessment input.", 409);
    return NextResponse.json({ assessment: prior, idempotentReplay: true }, { status: 200 });
  }
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
  const { data: committed, error: commitError } = await db.rpc("record_manufacturing_assessment_with_audit", {
    p_assessment: record, p_audit_record: auditRecord
  });
  if (!commitError && assessmentReceipt(committed)) {
    return NextResponse.json({ assessment: committed.assessment, audit: committed.audit, readiness }, { status: 201 });
  }
  const { data: reconciled } = await db.from("engineering_manufacturing_assessments").select("*")
    .eq("project_id", projectId).eq("release_id", body.releaseId).maybeSingle();
  if (reconciled && reconciled.input_sha256 === inputSha256) {
    return NextResponse.json({ assessment: reconciled, idempotentReplay: true }, { status: 200 });
  }
  return fail("Manufacturing assessment and audit transaction could not be confirmed.", 503);
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const body = parseManufacturingReadinessRequest(await request.json());
    if (!body) return fail("Manufacturing readiness input is incomplete or malformed.", 400);
    const projectId = body.processPlan.projectId;
    const authorization = await authorizeSupabaseRequest("EVIDENCE.WRITE", projectId, { requestId });
    if (!authorization.allowed) return fail(authorization.reason, authorizationStatus(authorization.reason));
    const sessionDb = await createClient();
    const { data: identity, error } = await sessionDb.auth.getUser();
    if (error || !identity.user || identity.user.id !== authorization.subject) {
      return fail("Authenticated project identity could not be confirmed.", 401);
    }
    return createAssessment({ body, actorId: identity.user.id, requestId });
  } catch {
    return fail("Manufacturing readiness assessment failed without reporting success.", 503);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId");
    const releaseId = url.searchParams.get("releaseId");
    if (!isUuid(projectId) || !releaseId) return fail("Valid projectId and releaseId query parameters are required.", 400);
    const authorization = await authorizeSupabaseRequest("EVIDENCE.READ", projectId, { requestId: randomUUID() });
    if (!authorization.allowed) return fail(authorization.reason, authorizationStatus(authorization.reason));
    const db = createServiceRoleClient();
    const { data: assessment, error } = await db.from("engineering_manufacturing_assessments").select("*")
      .eq("project_id", projectId).eq("release_id", releaseId).maybeSingle();
    if (error) return fail("Manufacturing assessment history is unavailable.", 503);
    if (!assessment) return fail("Manufacturing assessment was not found.", 404);
    const { data: decisions, error: decisionError } = await db.from("engineering_manufacturing_decisions").select("*")
      .eq("project_id", projectId).eq("assessment_id", assessment.id).order("decided_at", { ascending: true });
    if (decisionError || !Array.isArray(decisions)) return fail("Manufacturing decision history is unavailable.", 503);
    return NextResponse.json({ assessment, decisions, decisionStatus: decisions.length ? decisions[decisions.length - 1].decision : "PENDING" });
  } catch {
    return fail("Manufacturing assessment history could not be read.", 503);
  }
}
