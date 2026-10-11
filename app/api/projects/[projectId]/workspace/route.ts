import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../../../src/auth/supabase-service";
import { assessRequirementCompleteness, calculateShaftTorque, normalizeRequirements, normalizeTextList } from "../../../../../src/workspace/engineering-inputs";
import { createEmptyEngineeringWorkspaceSnapshot } from "../../../../../src/workspace/snapshot";
import type { EngineeringWorkspaceSnapshot } from "../../../../../src/workspace/types";
import { validateEngineeringWorkspaceSnapshot } from "../../../../../src/workspace/validation";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ projectId: string }> };
type WorkspaceRow = { revision: number; snapshot: EngineeringWorkspaceSnapshot };

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "cache-control": "no-store" } });
}

async function loadOrInitializeWorkspace(db: Awaited<ReturnType<typeof createClient>>, projectId: string): Promise<WorkspaceRow | null> {
  const { data: project, error: projectError } = await db
    .from("engineering_projects")
    .select("id,name,stage,status")
    .eq("id", projectId)
    .maybeSingle();
  if (projectError || !project) return null;

  const { data: existing, error: loadError } = await db
    .from("engineering_workspaces")
    .select("revision,snapshot")
    .eq("project_id", projectId)
    .maybeSingle();
  if (loadError) throw new Error("The project workspace could not be loaded.");

  if (existing) {
    const snapshot = existing.snapshot as EngineeringWorkspaceSnapshot;
    try {
      validateEngineeringWorkspaceSnapshot(snapshot);
    } catch {
      throw new Error("The saved workspace failed schema validation; no changes were applied.");
    }
    if (snapshot.project.id !== projectId || snapshot.taskGraph.projectId !== projectId ||
        snapshot.revision !== Number(existing.revision)) {
      throw new Error("The saved workspace identity or revision is inconsistent; no changes were applied.");
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
  if (racedError || !raced) throw new Error("The first workspace snapshot could not be initialized.");
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
    if (!authorization.allowed) return jsonError(authorization.reason, 403);
    const db = await createClient();
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
    if (!authorization.allowed) return jsonError(authorization.reason, 403);
    const db = await createClient();
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
    return jsonError(caught instanceof Error ? caught.message : "Workspace update failed.", 400);
  }
}
