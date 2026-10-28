import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "../../../../../lib/supabase/service";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../../src/auth/supabase-service";
import { assessRequirementCompleteness, calculateShaftTorque, normalizeRequirements, normalizeTextList } from "../../../../../src/workspace/engineering-inputs";
import { createEmptyEngineeringWorkspaceSnapshot } from "../../../../../src/workspace/snapshot";
import type { EngineeringWorkspaceSnapshot } from "../../../../../src/workspace/types";
import { validateEngineeringWorkspaceSnapshot } from "../../../../../src/workspace/validation";
import { createCalculationArtifact } from "../../../../../src/artifacts/calculation-artifact";
import {
  calculatePumpHydraulicPower,
  PUMP_HYDRAULIC_POWER_CAPABILITY,
  PUMP_HYDRAULIC_POWER_VALIDATOR_VERSION,
  PUMP_HYDRAULIC_POWER_VERSION,
  validatePumpHydraulicPower
} from "../../../../../src/engineering/pump-hydraulic-power";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ projectId: string }> };
class WorkspaceApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "WorkspaceApiError"; }
}
type WorkspaceRow = { revision: number; snapshot: EngineeringWorkspaceSnapshot };

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status, headers: { "cache-control": "no-store" } });
}

async function loadOrInitializeWorkspace(db: ReturnType<typeof createServiceRoleClient>, projectId: string): Promise<WorkspaceRow | null> {
  const { data: project, error: projectError } = await db
    .from("engineering_projects")
    .select("id,name,stage,status")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) throw new WorkspaceApiError(503, "The registered project could not be loaded.");
  if (!project) return null;

  const { data: existing, error: loadError } = await db
    .from("engineering_workspaces")
    .select("revision,snapshot")
    .eq("project_id", projectId)
    .maybeSingle();
  if (loadError) throw new WorkspaceApiError(503, "The project workspace could not be loaded.");

  if (existing) {
    const snapshot = existing.snapshot as EngineeringWorkspaceSnapshot;
    try {
      validateEngineeringWorkspaceSnapshot(snapshot);
    } catch {
      throw new WorkspaceApiError(503, "The saved workspace failed schema validation; no changes were applied.");
    }
    if (snapshot.project.id !== projectId || snapshot.taskGraph.projectId !== projectId ||
        snapshot.revision !== Number(existing.revision)) {
      throw new WorkspaceApiError(503, "The saved workspace identity or revision is inconsistent; no changes were applied.");
    }
    return { revision: Number(existing.revision), snapshot };
  }

  const snapshot = createEmptyEngineeringWorkspaceSnapshot({
    id: project.id, name: project.name, stage: project.stage,
    status: project.status as "ACTIVE" | "BLOCKED" | "COMPLETE"
  });
  const { data: inserted, error: insertError } = await db
    .from("engineering_workspaces")
    .insert({ project_id: projectId, revision: snapshot.revision, snapshot })
    .select("revision,snapshot")
    .maybeSingle();

  if (!insertError && inserted) return { revision: Number(inserted.revision), snapshot: inserted.snapshot as EngineeringWorkspaceSnapshot };

  // Concurrent first reads can race the unique project_id key. Read the winner rather than overwrite it.
  const { data: raced, error: racedError } = await db
    .from("engineering_workspaces")
    .select("revision,snapshot")
    .eq("project_id", projectId)
    .maybeSingle();
  if (racedError || !raced) throw new WorkspaceApiError(503, "The first workspace snapshot could not be initialized.");
  const racedSnapshot = raced.snapshot as EngineeringWorkspaceSnapshot;
  try { validateEngineeringWorkspaceSnapshot(racedSnapshot); }
  catch { throw new Error("The saved workspace failed schema validation; no changes were applied."); }
  if (racedSnapshot.project.id !== projectId || racedSnapshot.revision !== Number(raced.revision)) {
    throw new Error("The saved workspace identity or revision is inconsistent; no changes were applied.");
  }
  return { revision: Number(raced.revision), snapshot: racedSnapshot };
}

export async function GET(_request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!UUID.test(projectId)) return jsonError("A registered project UUID is required. Demo workspaces are not durable.", 400);
  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.READ", projectId);
    if (!authorization.allowed) { const status = authorizationFailureStatus(authorization); return jsonError(authorization.reason, status, status === 503 ? { code: "AUDIT_STORE_UNAVAILABLE" } : undefined); }
    // Privileged workspace IO is server-only. Authorization and current project membership were verified above.
    const db = createServiceRoleClient();
    const loaded = await loadOrInitializeWorkspace(db, projectId);
    if (!loaded) return jsonError("Project not found or inaccessible.", 404);
    return NextResponse.json({
      projectId, snapshot: loaded.snapshot, revision: loaded.revision,
      storageMode: "DURABLE", persisted: true
    }, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    return jsonError(caught instanceof Error ? caught.message : "Workspace service is unavailable.", 503);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const { projectId } = await context.params;
  if (!UUID.test(projectId)) return jsonError("A registered project UUID is required. Demo workspaces are not durable.", 400);

  let body: unknown;
  try { body = await request.json(); }
  catch { return jsonError("Request body must be valid JSON.", 400); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return jsonError("Request body must be a JSON object.", 400);
  const input = body as Record<string, unknown>;
  if (!Number.isInteger(input.expectedRevision) || Number(input.expectedRevision) < 1) {
    return jsonError("expectedRevision must be the current positive workspace revision.", 400);
  }

  try {
    const authorization = await authorizeSupabaseRequest("PROJECT.WRITE", projectId);
    if (!authorization.allowed) { const status = authorizationFailureStatus(authorization); return jsonError(authorization.reason, status, status === 503 ? { code: "AUDIT_STORE_UNAVAILABLE" } : undefined); }
    // Privileged workspace IO is server-only. Authorization and current project membership were verified above.
    const db = createServiceRoleClient();
    const loaded = await loadOrInitializeWorkspace(db, projectId);
    if (!loaded) return jsonError("Project not found or inaccessible.", 404);
    if (loaded.revision !== input.expectedRevision) {
      return NextResponse.json({
        error: "This workspace changed since it was loaded. Reload the latest revision before saving.",
        code: "REVISION_CONFLICT",
        currentRevision: loaded.revision
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    const snapshot = structuredClone(loaded.snapshot);
    const now = new Date().toISOString();
    let operationResult: Record<string, unknown> | undefined;

    switch (input.operation) {
      case "UPDATE_REQUIREMENTS":
        snapshot.project.requirements = normalizeRequirements(input.requirements);
        snapshot.project.events.push({
          id: randomUUID(), timestamp: now, actor: authorization.subject,
          action: "REQUIREMENTS_UPDATED",
          output: { count: snapshot.project.requirements.length, informationStatus: "KNOWN" }
        });
        break;
      case "UPDATE_ASSUMPTIONS":
        snapshot.project.assumptions = normalizeTextList(input.assumptions, "Assumptions");
        snapshot.project.events.push({
          id: randomUUID(), timestamp: now, actor: authorization.subject,
          action: "ASSUMPTIONS_UPDATED",
          output: { count: snapshot.project.assumptions.length, informationStatus: "KNOWN" }
        });
        break;
      case "UPDATE_OPEN_QUESTIONS":
        snapshot.project.openQuestions = normalizeTextList(input.questions, "Open questions");
        snapshot.project.events.push({
          id: randomUUID(), timestamp: now, actor: authorization.subject,
          action: "OPEN_QUESTIONS_UPDATED",
          output: { count: snapshot.project.openQuestions.length, informationStatus: "KNOWN" }
        });
        break;
      case "RUN_SHAFT_TORQUE": {
        if (typeof input.powerKw !== "number" || typeof input.speedRpm !== "number") {
          return jsonError("powerKw and speedRpm must be numeric values.", 400);
        }
        const calculation = calculateShaftTorque(input.powerKw, input.speedRpm);
        const eventId = randomUUID();
        snapshot.project.events.push({
          id: eventId, timestamp: now, actor: authorization.subject,
          action: "ANALYSIS.SHAFT_TORQUE",
          input: { powerKw: calculation.powerKw, speedRpm: calculation.speedRpm },
          output: calculation,
          evidence: [`calculation:${eventId}`]
        });
        snapshot.project.nextAction = "Review assumptions, loading arrangement, material and allowable stress before shaft sizing.";
        operationResult = { calculation, eventId };
        break;
      }
      case "RUN_PUMP_HYDRAULIC_POWER": {
        const { input: pumpInput, result: calculation } = calculatePumpHydraulicPower(input.pumpInput);
        const validation = validatePumpHydraulicPower(pumpInput, calculation, now);
        const eventId = randomUUID();
        const artifact = createCalculationArtifact({
          id: randomUUID(),
          projectId,
          name: "Pump hydraulic and shaft power calculation",
          capability: PUMP_HYDRAULIC_POWER_CAPABILITY,
          sourceRevision: loaded.revision,
          workspaceRevision: loaded.revision + 1,
          createdBy: authorization.subject,
          createdAt: now,
          providerId: "deterministic.pump-hydraulic-power",
          providerVersion: PUMP_HYDRAULIC_POWER_VERSION,
          inputs: pumpInput as unknown as Record<string, unknown>,
          outputs: calculation as unknown as Record<string, unknown>,
          executionStatus: "COMPLETED",
          validation: {
            id: randomUUID(),
            result: validation.result,
            validatorId: validation.validatorId,
            validatorVersion: PUMP_HYDRAULIC_POWER_VALIDATOR_VERSION,
            checks: validation.checks,
            warnings: validation.warnings,
            validatedAt: validation.validatedAt
          },
          approvalRequired: false,
          approvalStatus: "NOT_REQUESTED",
          verificationStatus: "NOT_VERIFIED",
          limitations: calculation.assumptions
        });
        snapshot.artifacts ??= [];
        snapshot.artifacts.push(artifact);
        snapshot.project.events.push({
          id: eventId,
          timestamp: now,
          actor: authorization.subject,
          action: PUMP_HYDRAULIC_POWER_CAPABILITY,
          input: pumpInput,
          output: calculation,
          artifactIds: [artifact.id],
          evidence: validation.result === "PASS" ? ["validation:" + artifact.validationReceipt.id] : []
        });
        snapshot.project.nextAction = validation.result === "PASS"
          ? "Review the duty point, system curve, NPSH/cavitation margin and motor/drive losses before selecting equipment."
          : "Resolve the pump-power validation findings before relying on this result.";
        operationResult = { calculation, artifact, validation, eventId };
        break;
      }
      case "CHECK_REQUIREMENTS": {
        const assessment = assessRequirementCompleteness(snapshot.project.requirements);
        const eventId = randomUUID();
        snapshot.project.events.push({
          id: eventId, timestamp: now, actor: authorization.subject,
          action: "VALIDATION.REQUIREMENT_COMPLETENESS",
          input: { requirementCount: snapshot.project.requirements.length },
          output: { ...assessment, decisionType: "PRELIMINARY_COMPLETENESS_CHECK", informationStatus: "CALCULATED" },
          evidence: [`check:${eventId}`]
        });
        operationResult = { assessment, eventId };
        break;
      }
      default:
        return jsonError("Unsupported workspace operation.", 400);
    }

    snapshot.revision = loaded.revision + 1;
    snapshot.savedAt = now;
    try { validateEngineeringWorkspaceSnapshot(snapshot); }
    catch { return jsonError("The proposed workspace state failed validation and was not saved.", 422); }

    const { data: saved, error: saveError } = await db
      .from("engineering_workspaces")
      .update({ revision: snapshot.revision, snapshot, saved_at: now })
      .eq("project_id", projectId)
      .eq("revision", loaded.revision)
      .select("revision")
      .maybeSingle();

    if (saveError) return jsonError("The workspace could not be saved; no success was reported.", 503);
    if (!saved) {
      const { data: current } = await db.from("engineering_workspaces")
        .select("revision").eq("project_id", projectId).maybeSingle();
      return NextResponse.json({
        error: "A concurrent update won the revision check. Reload before applying another change.",
        code: "REVISION_CONFLICT",
        currentRevision: current?.revision ?? null
      }, { status: 409, headers: { "cache-control": "no-store" } });
    }

    return NextResponse.json({
      projectId, snapshot, revision: snapshot.revision,
      storageMode: "DURABLE", persisted: true,
      result: operationResult
    }, { headers: { "cache-control": "no-store" } });
  } catch (caught) {
    if (caught instanceof WorkspaceApiError) return jsonError(caught.message, caught.status);
    return jsonError(caught instanceof Error ? caught.message : "Workspace update failed.", 400);
  }
}
