import type { CalculationArtifact } from "../artifacts/calculation-artifact.js";
import type { ProjectState } from "../core/types.js";
import type { EngineeringTaskGraph, EngineeringTaskStatus } from "../task-graph/types.js";

export type OverviewTone = "muted" | "info" | "warning" | "danger" | "success";
export interface ProjectOverviewSummary {
  execution: { label: string; detail: string; tone: OverviewTone; state: string };
  validation: { label: string; detail: string; tone: OverviewTone };
  review: { label: string; detail: string; tone: OverviewTone };
  artifactCount: number | null;
  objective: string | null;
  baseline: { name: string; id: string; revision: number; validator: string; validatedAt: string } | null;
  taskCounts: Record<EngineeringTaskStatus, number>;
}

const taskStatuses: EngineeringTaskStatus[] = [
  "PROPOSED", "READY", "RUNNING", "BLOCKED", "COMPLETED", "FAILED", "VERIFIED",
];

function problemStatementFromEvents(project: ProjectState): string | null {
  const events = [...(project.events ?? [])].reverse();
  for (const event of events) {
    if (event.action !== "PROBLEM_CAPTURED" || !event.input || typeof event.input !== "object") continue;
    const value = (event.input as Record<string, unknown>).problemStatement;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getExecutionSummary(tasks: EngineeringTaskGraph["tasks"]): ProjectOverviewSummary["execution"] {
  if (tasks.some(task => task.status === "RUNNING")) {
    return { label: "Executing", detail: "One or more engineering tasks are currently running.", tone: "info", state: "RUNNING" };
  }
  if (tasks.some(task => task.status === "FAILED")) {
    return { label: "Execution failed", detail: "A task reports failure. Inspect the task and its recorded evidence before retrying.", tone: "danger", state: "FAILED" };
  }
  if (tasks.some(task => task.status === "BLOCKED")) {
    return { label: "Execution blocked", detail: "A task is blocked. Review its dependencies and missing inputs.", tone: "warning", state: "BLOCKED" };
  }
  if (tasks.some(task => task.status === "READY")) {
    return { label: "Ready to execute", detail: "A task is ready; no execution is reported as running.", tone: "info", state: "READY" };
  }
  if (tasks.some(task => task.status === "PROPOSED")) {
    return { label: "Proposed work", detail: "Tasks have been proposed but have not entered execution.", tone: "muted", state: "PROPOSED" };
  }
  if (tasks.some(task => task.status === "COMPLETED")) {
    return { label: "Task execution completed", detail: "Task completion is recorded. Validation and human approval remain separate states.", tone: "success", state: "COMPLETED" };
  }
  if (tasks.some(task => task.status === "VERIFIED")) {
    return { label: "Task verified", detail: "A task reports verification. This does not imply project-wide approval.", tone: "success", state: "VERIFIED" };
  }
  return { label: "No execution recorded", detail: "No task in this workspace currently reports an execution state.", tone: "muted", state: "NOT_RECORDED" };
}

function getValidationSummary(artifacts: readonly CalculationArtifact[] | undefined): ProjectOverviewSummary["validation"] {
  if (!artifacts) return { label: "Not recorded", detail: "This workspace snapshot has no artifact registry field.", tone: "muted" };
  if (artifacts.length === 0) return { label: "No artifacts", detail: "No calculation artifacts are registered in this workspace.", tone: "muted" };
  if (artifacts.some(artifact => artifact.validationStatus === "FAILED")) {
    return { label: "Validation failed", detail: "At least one artifact has a failed validation receipt.", tone: "danger" };
  }
  if (artifacts.some(artifact => artifact.validationStatus === "INCOMPLETE")) {
    return { label: "Validation incomplete", detail: "At least one artifact has incomplete validation evidence.", tone: "warning" };
  }
  if (artifacts.every(artifact => artifact.validationStatus === "VALIDATED")) {
    return { label: "Validated artifacts", detail: "Every registered calculation artifact has a passing validation status. This is not design approval.", tone: "success" };
  }
  if (artifacts.some(artifact => artifact.validationStatus === "VALIDATED")) {
    return { label: "Partially validated", detail: "Some artifacts have passing validation receipts; inspect each artifact for its scope.", tone: "info" };
  }
  return { label: "Not validated", detail: "No registered artifact currently has a passing validation status.", tone: "muted" };
}

function getReviewSummary(artifacts: readonly CalculationArtifact[] | undefined): ProjectOverviewSummary["review"] {
  if (!artifacts) return { label: "Not recorded", detail: "The saved snapshot does not expose an artifact review state.", tone: "muted" };
  const required = artifacts.filter(artifact => artifact.approvalRequired);
  if (artifacts.length === 0) {
    return { label: "Not recorded", detail: "No artifact-level review or approval decision is stored in this project.", tone: "muted" };
  }
  if (required.length === 0) {
    return { label: "Not requested", detail: "No registered calculation artifact currently requires approval.", tone: "muted" };
  }
  if (required.some(artifact => artifact.approvalStatus === "REJECTED")) {
    return { label: "Rejected", detail: "At least one approval-required artifact has a recorded rejection.", tone: "danger" };
  }
  if (required.every(artifact => artifact.approvalStatus === "APPROVED")) {
    return { label: "Approved artifacts", detail: "All approval-required calculation artifacts are marked approved. Scope remains artifact-specific.", tone: "success" };
  }
  if (required.some(artifact => artifact.approvalStatus === "WAITING_APPROVAL")) {
    return { label: "Awaiting approval", detail: "At least one calculation artifact is waiting for an authorized human decision.", tone: "warning" };
  }
  return { label: "Not recorded", detail: "Approval is required, but no final approval decision is recorded.", tone: "warning" };
}

/** Derive display state from a persisted snapshot without inferring project-wide validation or approval. */
export function deriveProjectOverview(project: ProjectState, taskGraph?: EngineeringTaskGraph | null, artifacts?: readonly CalculationArtifact[] | null): ProjectOverviewSummary {
  const tasks = taskGraph?.tasks ?? [];
  const taskCounts = Object.fromEntries(taskStatuses.map(status => [status, tasks.filter(task => task.status === status).length])) as Record<EngineeringTaskStatus, number>;
  const validatedArtifacts = (artifacts ?? []).filter(artifact =>
    artifact.executionStatus === "COMPLETED" && artifact.validationStatus === "VALIDATED" &&
    artifact.validationReceipt.result === "PASS" && artifact.verificationStatus === "VERIFIED",
  ).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const baselineArtifact = validatedArtifacts[0];
  return {
    execution: getExecutionSummary(tasks),
    validation: getValidationSummary(artifacts ?? undefined),
    review: getReviewSummary(artifacts ?? undefined),
    artifactCount: artifacts === undefined || artifacts === null ? null : artifacts.length,
    objective: problemStatementFromEvents(project),
    baseline: baselineArtifact ? {
      name: baselineArtifact.name,
      id: baselineArtifact.id,
      revision: baselineArtifact.workspaceRevision,
      validator: baselineArtifact.validationReceipt.validatorId,
      validatedAt: baselineArtifact.validationReceipt.validatedAt,
    } : null,
    taskCounts,
  };
}
