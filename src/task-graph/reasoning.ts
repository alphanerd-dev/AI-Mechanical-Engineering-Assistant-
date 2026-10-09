import type {
  FrameworkReasoningRecord,
  FrameworkRoutingDecision,
  ReasoningFrameworkRegistry,
  SkillManifestRegistry
} from "../reasoning-frameworks/index.js";
import { routeReasoningFramework } from "../reasoning-frameworks/router.js";
import { parseFrameworkReasoningRecord, validateFrameworkReasoningRecord } from "../reasoning-frameworks/validation.js";
import type { EngineeringTask, EngineeringTaskGraph } from "./types.js";

export interface RouteTaskReasoningOptions {
  taskType?: string;
  uncertainty?: "LOW" | "MEDIUM" | "HIGH";
  requestedFramework?: string;
  requestedFrameworkVersion?: string;
  required?: boolean;
  now?: string;
  frameworkRegistry?: ReasoningFrameworkRegistry;
}

const riskRank = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 } as const;

function getMutableTask(graph: EngineeringTaskGraph, taskId: string): { task: EngineeringTask; index: number } {
  if (!graph || !Array.isArray(graph.tasks) || !Number.isInteger(graph.revision) || graph.revision < 1) {
    throw new Error("A valid engineering task graph is required.");
  }
  const index = graph.tasks.findIndex((item) => item.id === taskId);
  if (index < 0) throw new Error(`Engineering task not found: ${taskId}.`);
  const task = graph.tasks[index];
  if (task.projectId !== graph.projectId) throw new Error("Task and graph project ids must match.");
  if (["RUNNING", "COMPLETED", "VERIFIED"].includes(task.status)) {
    throw new Error(`Reasoning metadata cannot be changed after execution starts: ${task.id}.`);
  }
  return { task, index };
}

function updateTaskGraph(
  graph: EngineeringTaskGraph,
  taskIndex: number,
  task: EngineeringTask,
  updatedAt: string
): EngineeringTaskGraph {
  if (Number.isNaN(Date.parse(updatedAt))) throw new Error("Task reasoning timestamp must be valid.");
  const next = structuredClone(graph);
  next.revision += 1;
  next.tasks[taskIndex] = { ...structuredClone(task), updatedAt };
  return next;
}

/** Bind a registered, version-pinned skill snapshot to a task without executing it. */
export function assignTaskSkillManifest(
  graph: EngineeringTaskGraph,
  taskId: string,
  skillId: string,
  skillVersion: string,
  registry: SkillManifestRegistry,
  now = new Date().toISOString()
): EngineeringTaskGraph {
  const { task, index } = getMutableTask(graph, taskId);
  const skill = registry.get(skillId, skillVersion);
  if (!skill) throw new Error(`Registered skill manifest not found: ${skillId}@${skillVersion}.`);
  if (riskRank[task.risk] > riskRank[skill.maximumRisk]) {
    throw new Error(`Task risk exceeds the skill's maximum risk: ${task.risk} > ${skill.maximumRisk}.`);
  }
  if (task.capability && !skill.allowedCapabilities.includes(task.capability)) {
    throw new Error(`Task capability is outside the skill's allowedCapabilities: ${task.capability}.`);
  }

  const sameSkill = task.reasoning?.skillManifest?.id === skill.id &&
    task.reasoning?.skillManifest?.version === skill.version;
  const reasoning = {
    ...task.reasoning,
    skillManifest: skill,
    records: sameSkill ? [...(task.reasoning?.records ?? [])] : []
  };
  const nextTask: EngineeringTask = {
    ...task,
    reasoning,
    // Approval is monotonic here: assigning a skill may add a gate but never remove one.
    approvalRequired: task.approvalRequired === true || skill.requiresApproval
  };
  return updateTaskGraph(graph, index, nextTask, now);
}

/** Route a task through the framework selector and persist the decision on task state. */
export function routeTaskReasoning(
  graph: EngineeringTaskGraph,
  taskId: string,
  options: RouteTaskReasoningOptions = {}
): { graph: EngineeringTaskGraph; decision: FrameworkRoutingDecision } {
  const { task, index } = getMutableTask(graph, taskId);
  const taskType = options.taskType ?? task.reasoning?.taskType ?? task.name;
  const uncertainty = options.uncertainty ?? task.reasoning?.uncertainty ?? "LOW";
  const availableInputs = new Set(Object.keys(task.input ?? {}));
  // The task's non-empty goal is explicit structured input, not a model-invented fact.
  if (task.goal.trim()) availableInputs.add("task");

  const decision = routeReasoningFramework({
    taskType,
    risk: task.risk,
    uncertainty,
    availableInputs: [...availableInputs],
    requestedFramework: options.requestedFramework,
    requestedFrameworkVersion: options.requestedFrameworkVersion
  }, options.frameworkRegistry);

  const reasoning = {
    ...task.reasoning,
    required: options.required ?? task.reasoning?.required ?? false,
    taskType,
    uncertainty,
    routingDecision: decision,
    // Every explicit re-route invalidates prior records so changes in task inputs
    // cannot accidentally reuse reasoning generated against an earlier context.
    records: []
  };

  const nextTask: EngineeringTask = { ...task, reasoning };
  const nextGraph = updateTaskGraph(graph, index, nextTask, options.now ?? new Date().toISOString());
  return { graph: nextGraph, decision: structuredClone(decision) };
}

/** Attach an advisory record only when it matches the task's selected framework/version. */
export function appendTaskReasoningRecord(
  graph: EngineeringTaskGraph,
  taskId: string,
  inputRecord: FrameworkReasoningRecord,
  now = new Date().toISOString()
): EngineeringTaskGraph {
  const { task, index } = getMutableTask(graph, taskId);
  const selection = task.reasoning?.routingDecision;
  if (selection?.status !== "SELECTED" || !selection.frameworkId || !selection.frameworkVersion) {
    throw new Error("A task must have a selected, version-pinned reasoning framework before attaching a record.");
  }
  if (inputRecord.frameworkId !== selection.frameworkId || inputRecord.frameworkVersion !== selection.frameworkVersion) {
    throw new Error("Reasoning record framework/version does not match the task's selected framework.");
  }
  if (inputRecord.taskId !== undefined && inputRecord.taskId !== task.id) {
    throw new Error("Reasoning record taskId does not match the target task.");
  }
  if (inputRecord.projectId !== undefined && inputRecord.projectId !== task.projectId) {
    throw new Error("Reasoning record projectId does not match the target project.");
  }
  const existing = task.reasoning?.records ?? [];
  if (existing.some((record) => record.recordId === inputRecord.recordId)) {
    throw new Error(`Reasoning record id is already attached to task: ${inputRecord.recordId}.`);
  }

  const record = parseFrameworkReasoningRecord({
    ...inputRecord,
    projectId: task.projectId,
    taskId: task.id
  });
  const errors = validateFrameworkReasoningRecord(record);
  if (errors.length) throw new Error("Invalid task reasoning record: " + errors.join("; "));

  const nextTask: EngineeringTask = {
    ...task,
    reasoning: {
      ...task.reasoning,
      routingDecision: selection,
      records: [...existing, record]
    }
  };
  return updateTaskGraph(graph, index, nextTask, now);
}

/**
 * Called by task readiness and READY transitions. A required reasoning method is
 * complete for planning purposes only after a PROPOSED record exists; downstream
 * engineering validation/evidence gates remain independent.
 */
export function getTaskReasoningGateErrors(task: EngineeringTask): string[] {
  const reasoning = task.reasoning;
  if (!reasoning?.required) return [];
  const decision = reasoning.routingDecision;
  if (!decision) return ["Required reasoning framework has not been routed."];
  if (decision.status !== "SELECTED" || !decision.frameworkId || !decision.frameworkVersion) {
    return ["Required reasoning framework is blocked or skipped; required inputs must be resolved."];
  }
  const hasProposedRecord = (reasoning.records ?? []).some((record) =>
    record.frameworkId === decision.frameworkId &&
    record.frameworkVersion === decision.frameworkVersion &&
    record.status === "PROPOSED"
  );
  return hasProposedRecord ? [] : ["Required reasoning record is missing; create a PROPOSED record before readiness."];
}
