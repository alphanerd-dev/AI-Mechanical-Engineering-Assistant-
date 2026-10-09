import type { CapabilityRisk } from "../core/types.js";

export type ReasoningFrameworkId = string;
export type FrameworkReasoningStatus = "PROPOSED" | "INCOMPLETE" | "BLOCKED";

export interface ReasoningFrameworkManifest {
  schemaVersion: 1;
  id: ReasoningFrameworkId;
  version: string;
  name: string;
  purpose: string;
  suitableFor: string[];
  requiredInputs: string[];
  outputKind: "REASONING_RECORD";
}

export interface FrameworkRoutingRequest {
  taskType: string;
  risk: CapabilityRisk;
  uncertainty: "LOW" | "MEDIUM" | "HIGH";
  availableInputs: string[];
  requestedFramework?: ReasoningFrameworkId;
  requestedFrameworkVersion?: string;
}

export interface FrameworkRoutingDecision {
  status: "SELECTED" | "SKIPPED" | "BLOCKED";
  frameworkId?: ReasoningFrameworkId;
  frameworkVersion?: string;
  reasons: string[];
  missingInputs: string[];
}

export interface SkillManifest {
  schemaVersion: 1;
  id: string;
  version: string;
  name: string;
  description: string;
  domains: string[];
  requiredInputs: string[];
  outputs: string[];
  allowedCapabilities: string[];
  maximumRisk: CapabilityRisk;
  requiresApproval: boolean;
}

export interface FrameworkReasoningRecord {
  schemaVersion: 1;
  recordId: string;
  createdAt: string;
  projectId?: string;
  taskId?: string;
  taskType: string;
  frameworkId: string;
  frameworkVersion: string;
  status: FrameworkReasoningStatus;
  inputs: Record<string, unknown>;
  assumptions: string[];
  output?: unknown;
  limitations: string[];
  evidenceReferences: string[];
  /** Reasoning records never certify engineering correctness. Validation remains external. */
  validationStatus: "NOT_PERFORMED";
  requiredGates: string[];
}

export interface CreateFrameworkReasoningRecordInput {
  recordId: string;
  createdAt: string;
  projectId?: string;
  taskId?: string;
  taskType: string;
  frameworkId: ReasoningFrameworkId;
  frameworkVersion?: string;
  status: FrameworkReasoningStatus;
  inputs: Record<string, unknown>;
  assumptions: string[];
  output?: unknown;
  limitations: string[];
  evidenceReferences: string[];
  requiredGates: string[];
}
