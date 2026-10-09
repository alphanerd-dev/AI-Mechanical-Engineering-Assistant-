import type { FrameworkReasoningRecord, ReasoningFrameworkManifest } from "../reasoning-frameworks/types";
import type { ReasoningFrameworkRegistry } from "../reasoning-frameworks/registry";
import { createFrameworkReasoningRecord } from "../reasoning-frameworks/records";
import { getReasoningFramework } from "../reasoning-frameworks/registry";
import type { EngineeringTask, EngineeringTaskGraph } from "./types";
import { appendTaskReasoningRecord } from "./reasoning";

export interface ReasoningProposal {
  status: "PROPOSED" | "INCOMPLETE" | "BLOCKED";
  assumptions: string[];
  output?: unknown;
  limitations: string[];
  evidenceReferences: string[];
  requiredGates: string[];
}

export interface TaskReasoningProposalRequest {
  readonly task: Readonly<EngineeringTask>;
  readonly framework: Readonly<ReasoningFrameworkManifest>;
  /** Snapshot assembled from task-graph state, never copied from provider output. */
  readonly inputs: Readonly<Record<string, unknown>>;
}

export interface TaskReasoningProposer {
  propose(request: TaskReasoningProposalRequest): Promise<unknown>;
}

export interface ExecuteTaskReasoningOptions {
  frameworkRegistry?: ReasoningFrameworkRegistry;
  now?: string;
  recordId?: string;
}

export interface ExecuteTaskReasoningResult {
  graph: EngineeringTaskGraph;
  record: FrameworkReasoningRecord;
}

/**
 * Runs one bounded advisory proposal against a task's already-selected framework.
 * This service never executes engineering capabilities, grants approval, changes
 * task status, or marks output as verified.
 */
export async function executeTaskReasoning(
  graph: EngineeringTaskGraph,
  taskId: string,
  proposer: TaskReasoningProposer,
  options: ExecuteTaskReasoningOptions = {}
): Promise<ExecuteTaskReasoningResult> {
  if (!graph || !Array.isArray(graph.tasks)) throw new Error("A valid engineering task graph is required.");
  const task = graph.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error(`Engineering task not found: ${taskId}.`);
  if (task.projectId !== graph.projectId) throw new Error("Task and graph project ids must match.");
  if (["READY", "RUNNING", "COMPLETED", "VERIFIED"].includes(task.status)) {
    throw new Error("Reasoning cannot be executed after a task becomes ready.");
  }
  if (!proposer || typeof proposer.propose !== "function") throw new Error("A reasoning proposer is required.");

  const decision = task.reasoning?.routingDecision;
  if (decision?.status !== "SELECTED" || !decision.frameworkId || !decision.frameworkVersion) {
    throw new Error("Task reasoning requires a selected, version-pinned framework before execution.");
  }

  const framework = options.frameworkRegistry
    ? options.frameworkRegistry.get(decision.frameworkId, decision.frameworkVersion)
    : getReasoningFramework(decision.frameworkId, decision.frameworkVersion);
  if (!framework) {
    throw new Error(`Selected framework is not registered at the pinned version: ${decision.frameworkId}@${decision.frameworkVersion}.`);
  }

  const inputs: Record<string, unknown> = {
    ...structuredClone(task.input ?? {}),
    ...(task.goal.trim() ? { task: task.goal } : {})
  };
  const missingInputs = framework.requiredInputs.filter((name) => isMissing(inputs[name]));
  if (missingInputs.length) {
    throw new Error(`Reasoning execution stopped; required inputs are missing: ${missingInputs.join(", ")}.`);
  }

  // The provider receives isolated snapshots. It cannot mutate the task graph or
  // choose the trusted task/project/framework identity attached to the record.
  const rawProposal = await proposer.propose({
    task: structuredClone(task),
    framework: structuredClone(framework),
    inputs: structuredClone(inputs)
  });
  const proposal = parseProposal(rawProposal);
  const createdAt = options.now ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("Reasoning execution timestamp must be valid.");
  const recordId = options.recordId ?? `reasoning-${task.id}-${Date.parse(createdAt)}-${(task.reasoning?.records ?? []).length + 1}`;

  const requiredGates = unique([
    ...proposal.requiredGates,
    "engineering-validation",
    ...(task.approvalRequired ? ["human-approval"] : []),
    ...(task.evidenceRequired ? ["evidence-validation"] : [])
  ]);
  const record = createFrameworkReasoningRecord({
    recordId,
    createdAt,
    projectId: task.projectId,
    taskId: task.id,
    taskType: task.reasoning?.taskType ?? task.name,
    frameworkId: decision.frameworkId,
    frameworkVersion: decision.frameworkVersion,
    status: proposal.status,
    inputs,
    assumptions: proposal.assumptions,
    ...(proposal.output === undefined ? {} : { output: proposal.output }),
    limitations: proposal.limitations,
    evidenceReferences: unique(proposal.evidenceReferences),
    requiredGates
  }, options.frameworkRegistry);

  const nextGraph = appendTaskReasoningRecord(graph, task.id, record, createdAt);
  return { graph: nextGraph, record };
}

function isMissing(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length === 0;
  return false;
}

function parseProposal(value: unknown): ReasoningProposal {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Reasoning provider output must be a structured proposal object.");
  }
  const proposal = value as Record<string, unknown>;
  const allowedKeys = new Set(["status", "assumptions", "output", "limitations", "evidenceReferences", "requiredGates"]);
  const extraKeys = Object.keys(proposal).filter((key) => !allowedKeys.has(key));
  if (extraKeys.length) throw new Error(`Reasoning provider output contains unsupported fields: ${extraKeys.join(", ")}.`);
  if (!["PROPOSED", "INCOMPLETE", "BLOCKED"].includes(String(proposal.status))) {
    throw new Error("Reasoning provider status must be PROPOSED, INCOMPLETE, or BLOCKED; VERIFIED is not allowed.");
  }
  for (const field of ["assumptions", "limitations", "evidenceReferences", "requiredGates"] as const) {
    if (!Array.isArray(proposal[field]) || !(proposal[field] as unknown[]).every((item) => typeof item === "string")) {
      throw new Error(`Reasoning provider field ${field} must be an array of strings.`);
    }
  }
  if ((proposal.limitations as string[]).some((item) => !item.trim())) {
    throw new Error("Reasoning provider limitations cannot contain empty strings.");
  }
  if (proposal.status === "PROPOSED" && proposal.output === undefined) {
    throw new Error("A PROPOSED reasoning provider response must include output.");
  }
  if (proposal.output !== undefined && !isJsonCompatible(proposal.output)) {
    throw new Error("Reasoning provider output must be finite, acyclic JSON-compatible data.");
  }
  for (const field of ["assumptions", "evidenceReferences", "requiredGates"] as const) {
    if ((proposal[field] as string[]).some((item) => !item.trim())) {
      throw new Error(`Reasoning provider field ${field} cannot contain empty strings.`);
    }
  }
  return {
    status: proposal.status as ReasoningProposal["status"],
    assumptions: [...proposal.assumptions as string[]],
    ...(proposal.output === undefined ? {} : { output: structuredClone(proposal.output) }),
    limitations: [...proposal.limitations as string[]],
    evidenceReferences: [...proposal.evidenceReferences as string[]],
    requiredGates: [...proposal.requiredGates as string[]]
  };
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function isJsonCompatible(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);
  let compatible = true;
  if (Array.isArray(value)) {
    compatible = Object.keys(value).length === value.length &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      value.every((item) => isJsonCompatible(item, seen));
  } else {
    const prototype = Object.getPrototypeOf(value);
    compatible = (prototype === Object.prototype || prototype === null) &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      Object.values(value as Record<string, unknown>).every((item) => isJsonCompatible(item, seen));
  }
  seen.delete(value);
  return compatible;
}
