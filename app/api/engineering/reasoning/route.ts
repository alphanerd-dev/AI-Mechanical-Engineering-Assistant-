import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import { authorizeSupabaseRequest } from "../../../../src/auth/supabase-service";
import {
  createDefaultReasoningFrameworkRegistry,
  ModelBackedTaskReasoningProposer,
  createConfiguredReasoningGenerator,
  ModelTransportError
} from "../../../../src/reasoning-frameworks/index";
import {
  createWorkspaceReasoningTask,
  proposeWorkspaceTaskReasoning,
  updateWorkspaceReasoningTaskInputs
} from "../../../../src/workspace/reasoning";
import type { EngineeringWorkspaceSnapshot } from "../../../../src/workspace/types";
import { validateEngineeringWorkspaceSnapshot } from "../../../../src/workspace/validation";
import type { EngineeringTask } from "../../../../src/task-graph/types";

export const runtime = "nodejs";

type StorageMode = "DURABLE" | "DEMO_EPHEMERAL";
type LoadedWorkspace = {
  snapshot: EngineeringWorkspaceSnapshot;
  persisted: boolean;
  rowRevision: number;
  storageMode: StorageMode;
  demoKey?: string;
};
type ApiErrorStatus = 400 | 403 | 404 | 409 | 422 | 502 | 503;

class ApiError extends Error {
  constructor(readonly status: ApiErrorStatus, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

const demoStoreKey = "__ENGINEERING_REASONING_DEMO_WORKSPACES__";
type GlobalWithDemoStore = typeof globalThis & {
  [demoStoreKey]?: Map<string, EngineeringWorkspaceSnapshot>;
};

function demoStore(): Map<string, EngineeringWorkspaceSnapshot> {
  const holder = globalThis as GlobalWithDemoStore;
  holder[demoStoreKey] ??= new Map<string, EngineeringWorkspaceSnapshot>();
  return holder[demoStoreKey]!;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function emptySnapshot(project: {
  id: string;
  name: string;
  stage: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETE";
}): EngineeringWorkspaceSnapshot {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    id: project.id,
    name: project.name,
    project: {
      ...project,
      requirements: [],
      assumptions: [],
      openQuestions: [],
      unresolvedRisks: [],
      events: []
    },
    taskGraph: {
      id: `task-graph-${project.id}`,
      projectId: project.id,
      revision: 1,
      tasks: []
    },
    revision: 1,
    savedAt: now
  };
}

function validateStoredSnapshot(value: unknown, projectId: string, rowRevision: number): EngineeringWorkspaceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(503, "The saved workspace snapshot is not a valid object. Changes were not applied.");
  }
  const snapshot = value as EngineeringWorkspaceSnapshot;
  try {
    validateEngineeringWorkspaceSnapshot(snapshot);
  } catch {
    throw new ApiError(503, "The saved workspace snapshot failed validation. Changes were not applied.");
  }
  if (snapshot.project.id !== projectId || snapshot.taskGraph.projectId !== projectId) {
    throw new ApiError(503, "Saved workspace project identity does not match the requested project.");
  }
  if (snapshot.revision !== rowRevision) {
    throw new ApiError(503, "Saved workspace revision metadata is inconsistent. Changes were not applied.");
  }
  return structuredClone(snapshot);
}

async function loadWorkspace(
  projectId: string,
  subject: string
): Promise<LoadedWorkspace> {
  if (projectId === "demo") {
    const key = `${subject}:${projectId}`;
    const store = demoStore();
    let snapshot = store.get(key);
    if (!snapshot) {
      snapshot = emptySnapshot({
        id: projectId,
        name: "Demo Engineering Project",
        stage: "PROBLEM",
        status: "ACTIVE"
      });
      store.set(key, structuredClone(snapshot));
    }
    return {
      snapshot: structuredClone(snapshot),
      persisted: true,
      rowRevision: snapshot.revision,
      storageMode: "DEMO_EPHEMERAL",
      demoKey: key
    };
  }

  if (!isUuid(projectId)) {
    throw new ApiError(400, "A registered project UUID is required for durable reasoning workspaces.");
  }

  let db: any;
  try {
    db = await createClient();
  } catch {
    throw new ApiError(503, "Supabase is not configured or the authenticated workspace session is unavailable.");
  }

  const { data: row, error: rowError } = await db
    .from("engineering_workspaces")
    .select("revision,snapshot")
    .eq("project_id", projectId)
    .maybeSingle();

  if (rowError) {
    throw new ApiError(503, "The project workspace could not be loaded.");
  }
  if (row) {
    return {
      snapshot: validateStoredSnapshot(row.snapshot, projectId, Number(row.revision)),
      persisted: true,
      rowRevision: Number(row.revision),
      storageMode: "DURABLE"
    };
  }

  const { data: project, error: projectError } = await db
    .from("engineering_projects")
    .select("id,name,stage,status")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) throw new ApiError(503, "The registered engineering project could not be loaded.");
  if (!project) throw new ApiError(404, "The requested project was not found or is not accessible.");

  const status = ["ACTIVE", "BLOCKED", "COMPLETE"].includes(project.status)
    ? project.status as "ACTIVE" | "BLOCKED" | "COMPLETE"
    : "ACTIVE";
  return {
    snapshot: emptySnapshot({
      id: project.id,
      name: project.name,
      stage: typeof project.stage === "string" ? project.stage : "PROBLEM",
      status
    }),
    persisted: false,
    rowRevision: 0,
    storageMode: "DURABLE"
  };
}

async function saveWorkspace(
  loaded: LoadedWorkspace,
  workspace: EngineeringWorkspaceSnapshot
): Promise<EngineeringWorkspaceSnapshot> {
  const next = structuredClone(workspace);
  next.revision = loaded.persisted ? loaded.rowRevision + 1 : 1;
  next.savedAt = new Date().toISOString();
  try {
    validateEngineeringWorkspaceSnapshot(next);
  } catch {
    throw new ApiError(422, "The proposed workspace state failed validation and was not saved.");
  }

  if (loaded.storageMode === "DEMO_EPHEMERAL") {
    const key = loaded.demoKey;
    if (!key) throw new ApiError(503, "The demo workspace session is unavailable.");
    demoStore().set(key, structuredClone(next));
    return structuredClone(next);
  }

  let db: any;
  try {
    db = await createClient();
  } catch {
    throw new ApiError(503, "Supabase is not configured or the authenticated workspace session is unavailable.");
  }

  if (!loaded.persisted) {
    const { data, error } = await db
      .from("engineering_workspaces")
      .insert({
        project_id: next.project.id,
        revision: next.revision,
        snapshot: next,
        saved_at: next.savedAt
      })
      .select("revision,snapshot")
      .maybeSingle();

    if (error) {
      if (error.code === "23505") throw new ApiError(409, "The workspace was initialized by another request. Reload and try again.");
      if (error.code === "42501") throw new ApiError(403, "Project policy denied saving this workspace.");
      throw new ApiError(503, "The workspace could not be initialized.");
    }
    if (!data) throw new ApiError(503, "The workspace could not be initialized.");
    return validateStoredSnapshot(data.snapshot, next.project.id, Number(data.revision));
  }

  const { data, error } = await db
    .from("engineering_workspaces")
    .update({
      revision: next.revision,
      snapshot: next,
      saved_at: next.savedAt
    })
    .eq("project_id", next.project.id)
    .eq("revision", loaded.rowRevision)
    .select("revision,snapshot")
    .maybeSingle();

  if (error) {
    if (error.code === "42501") throw new ApiError(403, "Project policy denied saving this workspace.");
    throw new ApiError(503, "The workspace could not be saved.");
  }
  if (!data) throw new ApiError(409, "The workspace changed during this request. Reload the latest state and retry.");
  return validateStoredSnapshot(data.snapshot, next.project.id, Number(data.revision));
}

async function authorizeProject(permission: "PROJECT.READ" | "PROJECT.WRITE", projectId: string) {
  try {
    return await authorizeSupabaseRequest(permission, projectId);
  } catch {
    throw new ApiError(503, "The project authorization service is unavailable. Check Supabase server configuration and sign-in state.");
  }
}

function getProjectId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) throw new ApiError(400, "projectId is required.");
  return value.trim();
}

function getBodyRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(400, "The request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function getInputRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError(400, "input must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function taskResponse(taskGraph: EngineeringWorkspaceSnapshot["taskGraph"], taskId?: string) {
  const task = taskId ? taskGraph.tasks.find((item) => item.id === taskId) : undefined;
  return { taskGraph, ...(task ? { task } : {}) };
}

function errorResponse(error: unknown, fallback = "Reasoning workbench request failed.") {
  if (error instanceof ApiError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: fallback }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projectId = getProjectId(url.searchParams.get("projectId"));
    const authorization = await authorizeProject("PROJECT.READ", projectId);
    if (!authorization.allowed) return NextResponse.json({ error: authorization.reason }, { status: 403 });

    const registry = createDefaultReasoningFrameworkRegistry();
    const loaded = await loadWorkspace(projectId, authorization.subject);
    return NextResponse.json({
      projectId,
      taskGraph: loaded.snapshot.taskGraph,
      workspaceRevision: loaded.snapshot.revision,
      frameworks: registry.list(),
      storageMode: loaded.storageMode,
      persisted: loaded.storageMode === "DURABLE" && loaded.persisted,
      modelConfigured: Boolean(
        process.env.ENGINEERING_REASONING_MODEL_URL?.trim() &&
        process.env.ENGINEERING_REASONING_MODEL_NAME?.trim()
      )
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      throw new ApiError(400, "The request body must be valid JSON.");
    }
    const body = getBodyRecord(parsed);
    const projectId = getProjectId(body.projectId);
    const action = body.action;
    if (!["CREATE_TASK", "UPDATE_INPUTS", "PROPOSE_REASONING"].includes(String(action))) {
      throw new ApiError(400, "action must be CREATE_TASK, UPDATE_INPUTS, or PROPOSE_REASONING.");
    }

    const authorization = await authorizeProject("PROJECT.WRITE", projectId);
    if (!authorization.allowed) return NextResponse.json({ error: authorization.reason }, { status: 403 });

    const loaded = await loadWorkspace(projectId, authorization.subject);
    const registry = createDefaultReasoningFrameworkRegistry();

    if (action === "CREATE_TASK") {
      const risk = body.risk;
      const uncertainty = body.uncertainty;
      const input = body.input === undefined ? {} : getInputRecord(body.input);
      let result: ReturnType<typeof createWorkspaceReasoningTask>;
      try {
        result = createWorkspaceReasoningTask(loaded.snapshot, {
          taskId: randomUUID(),
          name: body.name as string,
          goal: body.goal as string,
          taskType: body.taskType as string,
          risk: risk as EngineeringTask["risk"],
          uncertainty: uncertainty as "LOW" | "MEDIUM" | "HIGH",
          requestedFramework: body.frameworkId as string,
          requestedFrameworkVersion: body.frameworkVersion as string,
          input,
          approvalRequired: body.approvalRequired as boolean | undefined,
          evidenceRequired: body.evidenceRequired as boolean | undefined
        }, { frameworkRegistry: registry });
      } catch (error) {
        throw new ApiError(422, error instanceof Error ? error.message : "The task could not be created.");
      }
      const saved = await saveWorkspace(loaded, result.workspace);
      return NextResponse.json({
        ...taskResponse(saved.taskGraph, result.task.id),
        workspaceRevision: saved.revision,
        storageMode: loaded.storageMode,
        persisted: loaded.storageMode === "DURABLE"
      });
    }

    const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
    if (!taskId) throw new ApiError(400, "taskId is required.");

    if (action === "UPDATE_INPUTS") {
      let result: ReturnType<typeof updateWorkspaceReasoningTaskInputs>;
      try {
        result = updateWorkspaceReasoningTaskInputs(
          loaded.snapshot,
          taskId,
          getInputRecord(body.input),
          { frameworkRegistry: registry }
        );
      } catch (error) {
        throw new ApiError(422, error instanceof Error ? error.message : "Task inputs could not be updated.");
      }
      const saved = await saveWorkspace(loaded, result.workspace);
      return NextResponse.json({
        ...taskResponse(saved.taskGraph, taskId),
        workspaceRevision: saved.revision,
        storageMode: loaded.storageMode,
        persisted: loaded.storageMode === "DURABLE"
      });
    }

    let generator;
    try {
      generator = createConfiguredReasoningGenerator();
    } catch {
      throw new ApiError(503, "Reasoning model configuration is invalid. Check the server-side endpoint, model name, API key, and timeout values.");
    }
    if (!generator) {
      throw new ApiError(503, "No reasoning model is configured. Set the server-side ENGINEERING_REASONING_MODEL_URL and ENGINEERING_REASONING_MODEL_NAME values.");
    }
    const task = loaded.snapshot.taskGraph.tasks.find((item) => item.id === taskId);
    if (!task) throw new ApiError(404, `Engineering task not found: ${taskId}.`);
    if (task.reasoning?.routingDecision?.status !== "SELECTED") {
      throw new ApiError(422, "Select a supported, version-pinned reasoning framework and resolve its required inputs before requesting a proposal.");
    }

    let result;
    try {
      result = await proposeWorkspaceTaskReasoning(
        loaded.snapshot,
        taskId,
        new ModelBackedTaskReasoningProposer(generator),
        { frameworkRegistry: registry }
      );
    } catch (error) {
      if (error instanceof ModelTransportError) throw new ApiError(502, error.message);
      throw new ApiError(422, error instanceof Error ? error.message : "The model proposal failed validation.");
    }

    const saved = await saveWorkspace(loaded, result.workspace);
    const finalTask = saved.taskGraph.tasks.find((item) => item.id === taskId)!;
    const finalRecord = finalTask.reasoning?.records?.find((record) => record.recordId === result.record.recordId);
    return NextResponse.json({
      ...taskResponse(saved.taskGraph, taskId),
      record: finalRecord,
      workspaceRevision: saved.revision,
      storageMode: loaded.storageMode,
      persisted: loaded.storageMode === "DURABLE"
    });
  } catch (error) {
    return errorResponse(error);
  }
}
