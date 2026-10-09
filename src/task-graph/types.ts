import type { CapabilityRisk, ProjectState } from "../core/types.js";
import type {
  FrameworkReasoningRecord,
  FrameworkRoutingDecision,
  SkillManifest
} from "../reasoning-frameworks/types.js";

export type EngineeringTaskStatus = "PROPOSED" | "READY" | "RUNNING" | "BLOCKED" | "COMPLETED" | "FAILED" | "VERIFIED";

export interface EngineeringTaskReasoningState {
  /** When true, a selected framework must have a PROPOSED record before task readiness. */
  required?: boolean;
  taskType?: string;
  uncertainty?: "LOW" | "MEDIUM" | "HIGH";
  /** Immutable manifest snapshot pins the skill version and its declared authority. */
  skillManifest?: SkillManifest;
  routingDecision?: FrameworkRoutingDecision;
  records?: FrameworkReasoningRecord[];
}

export interface EngineeringTask {
  id: string;
  projectId: string;
  name: string;
  goal: string;
  capability?: string;
  risk: CapabilityRisk;
  input: Record<string, unknown>;
  dependsOn?: string[];
  requiredRequirementIds?: string[];
  approvalRequired?: boolean;
  approvalGranted?: boolean;
  evidenceRequired?: boolean;
  maxAttempts?: number;
  reasoning?: EngineeringTaskReasoningState;
  status: EngineeringTaskStatus;
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EngineeringTaskGraph {
  id: string;
  projectId: string;
  revision: number;
  tasks: EngineeringTask[];
}

export type EngineeringTaskTransition =
  "READY" | "RUNNING" | "BLOCKED" | "COMPLETED" | "FAILED" | "VERIFIED";

export interface ReadyTaskEvaluation {
  taskId: string;
  ready: boolean;
  reasons: string[];
}

export interface TaskGraphContext {
  project?: ProjectState;
}
