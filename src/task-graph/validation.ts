import type { EngineeringTaskGraph, EngineeringTask, EngineeringTaskTransition } from "./types.js";
import { validateFrameworkReasoningRecord, validateSkillManifest } from "../reasoning-frameworks/validation.js";
import { getTaskReasoningGateErrors } from "./reasoning.js";

const allowed: Record<EngineeringTask["status"], EngineeringTaskTransition[]> = {
  PROPOSED: ["READY", "BLOCKED"],
  READY: ["RUNNING", "BLOCKED"],
  RUNNING: ["COMPLETED", "FAILED", "BLOCKED"],
  BLOCKED: ["READY"],
  COMPLETED: ["VERIFIED"],
  FAILED: ["READY", "BLOCKED"],
  VERIFIED: []
};

const riskRank: Record<EngineeringTask["risk"], number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3
};

export function validateEngineeringTaskGraph(graph: EngineeringTaskGraph): string[] {
  const errors: string[] = [];
  if (!graph.id.trim()) errors.push("Task graph id is required.");
  if (!graph.projectId.trim()) errors.push("Task graph project id is required.");
  if (!Number.isInteger(graph.revision) || graph.revision < 1) errors.push("Task graph revision must be a positive integer.");

  const ids = new Set<string>();
  const reasoningRecordIds = new Set<string>();
  for (const task of graph.tasks) {
    if (!task.id.trim()) errors.push("Engineering task id is required.");
    if (ids.has(task.id)) errors.push(`Duplicate engineering task id: ${task.id}.`);
    ids.add(task.id);
    if (task.projectId !== graph.projectId) errors.push(`Engineering task belongs to another project: ${task.id}.`);
    if (!task.name.trim()) errors.push(`Engineering task name is required: ${task.id}.`);
    if (!task.goal.trim()) errors.push(`Engineering task goal is required: ${task.id}.`);
    if (!Number.isInteger(task.maxAttempts ?? 1) || (task.maxAttempts ?? 1) < 1)
      errors.push(`Engineering task maxAttempts must be a positive integer: ${task.id}.`);
    if (!Number.isInteger(Date.parse(task.createdAt)) || !Number.isInteger(Date.parse(task.updatedAt)))
      errors.push(`Engineering task timestamps must be valid: ${task.id}.`);

    for (const dependency of task.dependsOn ?? []) {
      if (dependency === task.id) errors.push(`Engineering task cannot depend on itself: ${task.id}.`);
    }
    for (const transition of allowed[task.status] ?? []) {
      if (!transition) errors.push(`Invalid task transition definition: ${task.id}.`);
    }

    const reasoning = task.reasoning;
    if (reasoning !== undefined) {
      if (!reasoning || typeof reasoning !== "object" || Array.isArray(reasoning)) {
        errors.push(`Engineering task reasoning state is invalid: ${task.id}.`);
        continue;
      }
      if (reasoning.required !== undefined && typeof reasoning.required !== "boolean")
        errors.push(`Engineering task reasoning.required must be boolean: ${task.id}.`);
      if (reasoning.taskType !== undefined && (typeof reasoning.taskType !== "string" || !reasoning.taskType.trim()))
        errors.push(`Engineering task reasoning.taskType must be a non-empty string: ${task.id}.`);
      if (reasoning.uncertainty !== undefined && !["LOW", "MEDIUM", "HIGH"].includes(reasoning.uncertainty))
        errors.push(`Engineering task reasoning.uncertainty is invalid: ${task.id}.`);

      const skill = reasoning.skillManifest;
      if (skill !== undefined) {
        const skillErrors = validateSkillManifest(skill);
        errors.push(...skillErrors.map((error) => `Engineering task ${task.id} skill manifest: ${error}`));
        if (skillErrors.length === 0) {
          if (riskRank[task.risk] > riskRank[skill.maximumRisk])
            errors.push(`Engineering task risk exceeds assigned skill maximum risk: ${task.id}.`);
          if (task.capability && !skill.allowedCapabilities.includes(task.capability))
            errors.push(`Engineering task capability is outside assigned skill authority: ${task.id}.`);
          if (skill.requiresApproval && !task.approvalRequired)
            errors.push(`Assigned skill requires human approval for task: ${task.id}.`);
        }
      }

      const decision = reasoning.routingDecision;
      if (decision !== undefined) {
        if (!decision || typeof decision !== "object" || !["SELECTED", "SKIPPED", "BLOCKED"].includes(decision.status))
          errors.push(`Engineering task reasoning routing decision is invalid: ${task.id}.`);
        else {
          if (!Array.isArray(decision.reasons) || !decision.reasons.every((reason) => typeof reason === "string"))
            errors.push(`Engineering task reasoning route reasons are invalid: ${task.id}.`);
          if (!Array.isArray(decision.missingInputs) || !decision.missingInputs.every((item) => typeof item === "string"))
            errors.push(`Engineering task reasoning missingInputs are invalid: ${task.id}.`);
          if (decision.status === "SELECTED" &&
            (typeof decision.frameworkId !== "string" || !decision.frameworkId.trim() ||
             typeof decision.frameworkVersion !== "string" || !decision.frameworkVersion.trim()))
            errors.push(`Selected reasoning framework must pin an id and version: ${task.id}.`);
        }
      }

      if (reasoning.records !== undefined && !Array.isArray(reasoning.records)) {
        errors.push(`Engineering task reasoning records must be an array: ${task.id}.`);
      } else {
        for (const record of reasoning.records ?? []) {
          const recordErrors = validateFrameworkReasoningRecord(record);
          errors.push(...recordErrors.map((error) => `Engineering task ${task.id} reasoning record: ${error}`));
          if (!record || typeof record !== "object" || Array.isArray(record)) continue;
          if (record.projectId !== task.projectId || record.taskId !== task.id)
            errors.push(`Reasoning record must reference its containing project and task: ${task.id}.`);
          if (typeof record.recordId === "string") {
            if (reasoningRecordIds.has(record.recordId))
              errors.push(`Duplicate reasoning record id: ${record.recordId}.`);
            reasoningRecordIds.add(record.recordId);
          }
          if (decision?.status !== "SELECTED" ||
            record.frameworkId !== decision.frameworkId ||
            record.frameworkVersion !== decision.frameworkVersion) {
            errors.push(`Reasoning record does not match the task's selected framework version: ${task.id}.`);
          }
        }
      }
    }
  }

  for (const task of graph.tasks) {
    for (const dependency of task.dependsOn ?? []) {
      if (!ids.has(dependency)) errors.push(`Engineering task dependency not found: ${task.id} -> ${dependency}.`);
    }
    for (const requirementId of task.requiredRequirementIds ?? []) {
      if (!requirementId.trim()) errors.push(`Engineering task requirement id must not be empty: ${task.id}.`);
    }
  }

  const byId = new Map(graph.tasks.map((task) => [task.id, task]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      errors.push(`Engineering task dependency cycle detected at: ${id}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) if (byId.has(dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of graph.tasks) visit(task.id);

  return [...new Set(errors)];
}

export function canTransitionTask(status: EngineeringTask["status"], to: EngineeringTaskTransition): boolean {
  return allowed[status].includes(to);
}

export function transitionTask(
  graph: EngineeringTaskGraph,
  taskId: string,
  to: EngineeringTaskTransition,
  updatedAt = new Date().toISOString()
): EngineeringTaskGraph {
  const errors = validateEngineeringTaskGraph(graph);
  if (errors.length) throw new Error(errors.join(" "));
  const index = graph.tasks.findIndex((task) => task.id === taskId);
  if (index < 0) throw new Error(`Engineering task not found: ${taskId}.`);
  const task = graph.tasks[index];
  if (!canTransitionTask(task.status, to)) throw new Error(`Invalid engineering task transition: ${task.status} -> ${to}.`);
  if (to === "READY") {
    const reasoningGateErrors = getTaskReasoningGateErrors(task);
    if (reasoningGateErrors.length) throw new Error(reasoningGateErrors.join(" "));
  }
  const next = structuredClone(graph);
  next.revision++;
  next.tasks[index] = {
    ...task,
    status: to,
    blockedReason: to === "BLOCKED" ? task.blockedReason : undefined,
    updatedAt
  };
  return next;
}
