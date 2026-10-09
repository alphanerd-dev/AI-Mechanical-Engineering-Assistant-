import type { ReasoningFrameworkRegistry, FrameworkReasoningRecord } from "../reasoning-frameworks/index.js";
import type { TaskReasoningProposer } from "../task-graph/reasoning-execution.js";
import { executeTaskReasoning } from "../task-graph/reasoning-execution.js";
import { routeTaskReasoning } from "../task-graph/reasoning.js";
import type { EngineeringTask, EngineeringTaskGraph } from "../task-graph/types.js";
import type { EngineeringWorkspaceSnapshot } from "./types.js";
import { validateEngineeringWorkspaceSnapshot } from "./validation.js";

export interface CreateWorkspaceReasoningTaskInput {
  taskId: string;
  name: string;
  goal: string;
  taskType: string;
  risk: EngineeringTask["risk"];
  uncertainty: "LOW" | "MEDIUM" | "HIGH";
  requestedFramework: string;
  requestedFrameworkVersion: string;
  input: Record<string, unknown>;
  approvalRequired?: boolean;
  evidenceRequired?: boolean;
}

export interface WorkspaceReasoningOptions {
  now?: string;
  frameworkRegistry?: ReasoningFrameworkRegistry;
}

export interface WorkspaceTaskMutationResult {
  workspace: EngineeringWorkspaceSnapshot;
  task: EngineeringTask;
}

export interface WorkspaceReasoningProposalResult {
  workspace: EngineeringWorkspaceSnapshot;
  task: EngineeringTask;
  record: FrameworkReasoningRecord;
}

const allowedRisks = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
const allowedUncertainty = new Set(["LOW", "MEDIUM", "HIGH"]);

function assertNonEmpty(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
}

function assertJsonRecord(value: unknown, name: string): asserts value is Record<string, unknown> {
  if (!isPlainRecord(value) || !isJsonCompatible(value)) {
    throw new Error(`${name} must be a JSON-compatible object.`);
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);

  let compatible: boolean;
  if (Array.isArray(value)) {
    compatible = Object.keys(value).length === value.length &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      value.every((item) => isJsonCompatible(item, seen));
  } else {
    compatible = isPlainRecord(value) &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      Object.values(value as Record<string, unknown>).every((item) => isJsonCompatible(item, seen));
  }
  seen.delete(value);
  return compatible;
}

function assertSnapshot(snapshot: EngineeringWorkspaceSnapshot): void {
  validateEngineeringWorkspaceSnapshot(snapshot);
}

function findTask(graph: EngineeringTaskGraph, taskId: string): EngineeringTask {
  assertNonEmpty(taskId, "taskId");
  const task = graph.tasks.find((item) => item.id === taskId);
  if (!task) throw new Error(`Engineering task not found: ${taskId}.`);
  if (task.projectId !== graph.projectId) throw new Error("Task and graph project ids must match.");
  return task;
}

/** Creates and routes an advisory task inside an existing workspace snapshot. */
export function createWorkspaceReasoningTask(
  snapshot: EngineeringWorkspaceSnapshot,
  input: CreateWorkspaceReasoningTaskInput,
  options: WorkspaceReasoningOptions = {}
): WorkspaceTaskMutationResult {
  assertSnapshot(snapshot);
  assertNonEmpty(input.taskId, "taskId");
  assertNonEmpty(input.name, "task name");
  assertNonEmpty(input.goal, "task goal");
  assertNonEmpty(input.taskType, "taskType");
  assertNonEmpty(input.requestedFramework, "requestedFramework");
  assertNonEmpty(input.requestedFrameworkVersion, "requestedFrameworkVersion");
  assertJsonRecord(input.input, "task input");
  if (!allowedRisks.has(input.risk)) throw new Error("Task risk must be LOW, MEDIUM, HIGH, or CRITICAL.");
  if (!allowedUncertainty.has(input.uncertainty)) throw new Error("Task uncertainty must be LOW, MEDIUM, or HIGH.");
  if (input.approvalRequired !== undefined && typeof input.approvalRequired !== "boolean") {
    throw new Error("approvalRequired must be a boolean.");
  }
  if (input.evidenceRequired !== undefined && typeof input.evidenceRequired !== "boolean") {
    throw new Error("evidenceRequired must be a boolean.");
  }

  const now = options.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(now))) throw new Error("Task timestamp must be a valid date-time.");
  if (snapshot.taskGraph.tasks.some((task) => task.id === input.taskId)) {
    throw new Error(`Engineering task id already exists: ${input.taskId}.`);
  }

  const task: EngineeringTask = {
    id: input.taskId,
    projectId: snapshot.project.id,
    name: input.name.trim(),
    goal: input.goal.trim(),
    risk: input.risk,
    input: structuredClone(input.input),
    approvalRequired: input.approvalRequired ?? false,
    evidenceRequired: input.evidenceRequired ?? false,
    reasoning: {
      required: true,
      taskType: input.taskType.trim(),
      uncertainty: input.uncertainty,
      records: []
    },
    status: "PROPOSED",
    createdAt: now,
    updatedAt: now
  };

  const graph: EngineeringTaskGraph = {
    ...structuredClone(snapshot.taskGraph),
    revision: snapshot.taskGraph.revision + 1,
    tasks: [...structuredClone(snapshot.taskGraph.tasks), task]
  };
  const routed = routeTaskReasoning(graph, task.id, {
    taskType: input.taskType.trim(),
    uncertainty: input.uncertainty,
    requestedFramework: input.requestedFramework,
    requestedFrameworkVersion: input.requestedFrameworkVersion,
    required: true,
    frameworkRegistry: options.frameworkRegistry,
    now
  });
  const workspace: EngineeringWorkspaceSnapshot = {
    ...structuredClone(snapshot),
    taskGraph: routed.graph
  };
  assertSnapshot(workspace);
  return { workspace, task: structuredClone(workspace.taskGraph.tasks.find((item) => item.id === task.id)!) };
}

/** Replaces editable task inputs and re-routes against the same exact framework version. */
export function updateWorkspaceReasoningTaskInputs(
  snapshot: EngineeringWorkspaceSnapshot,
  taskId: string,
  input: Record<string, unknown>,
  options: WorkspaceReasoningOptions = {}
): WorkspaceTaskMutationResult {
  assertSnapshot(snapshot);
  assertJsonRecord(input, "task input");
  const selectedTask = findTask(snapshot.taskGraph, taskId);
  const selection = selectedTask.reasoning?.routingDecision;
  if (selection?.status !== "SELECTED" || !selection.frameworkId || !selection.frameworkVersion) {
    throw new Error("Task must have a selected, version-pinned framework before its inputs can be updated.");
  }

  const now = options.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(now))) throw new Error("Task timestamp must be a valid date-time.");
  const graph = structuredClone(snapshot.taskGraph);
  graph.revision += 1;
  const index = graph.tasks.findIndex((task) => task.id === taskId);
  graph.tasks[index] = {
    ...graph.tasks[index],
    input: structuredClone(input),
    updatedAt: now
  };

  const routed = routeTaskReasoning(graph, taskId, {
    taskType: selectedTask.reasoning?.taskType ?? selectedTask.name,
    uncertainty: selectedTask.reasoning?.uncertainty ?? "LOW",
    requestedFramework: selection.frameworkId,
    requestedFrameworkVersion: selection.frameworkVersion,
    required: selectedTask.reasoning?.required ?? true,
    frameworkRegistry: options.frameworkRegistry,
    now
  });
  const workspace: EngineeringWorkspaceSnapshot = {
    ...structuredClone(snapshot),
    taskGraph: routed.graph
  };
  assertSnapshot(workspace);
  return { workspace, task: structuredClone(workspace.taskGraph.tasks.find((task) => task.id === taskId)!) };
}

/** Executes one model proposal through the controlled task-graph boundary. */
export async function proposeWorkspaceTaskReasoning(
  snapshot: EngineeringWorkspaceSnapshot,
  taskId: string,
  proposer: TaskReasoningProposer,
  options: WorkspaceReasoningOptions = {}
): Promise<WorkspaceReasoningProposalResult> {
  assertSnapshot(snapshot);
  findTask(snapshot.taskGraph, taskId);
  const result = await executeTaskReasoning(snapshot.taskGraph, taskId, proposer, {
    frameworkRegistry: options.frameworkRegistry,
    now: options.now
  });
  const workspace: EngineeringWorkspaceSnapshot = {
    ...structuredClone(snapshot),
    taskGraph: result.graph
  };
  assertSnapshot(workspace);
  const task = workspace.taskGraph.tasks.find((item) => item.id === taskId)!;
  return { workspace, task: structuredClone(task), record: structuredClone(result.record) };
}
