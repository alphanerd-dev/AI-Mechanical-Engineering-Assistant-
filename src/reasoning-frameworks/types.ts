import type { CapabilityRisk } from "../core/types.js";
export type ReasoningFrameworkId = "first-principles" | "weighted-decision-matrix" | "five-whys";
export interface ReasoningFrameworkManifest { schemaVersion: 1; id: ReasoningFrameworkId; version: string; name: string; purpose: string; suitableFor: string[]; requiredInputs: string[]; outputKind: "REASONING_RECORD"; }
export interface FrameworkRoutingRequest { taskType: string; risk: CapabilityRisk; uncertainty: "LOW" | "MEDIUM" | "HIGH"; availableInputs: string[]; requestedFramework?: ReasoningFrameworkId; }
export interface FrameworkRoutingDecision { status: "SELECTED" | "SKIPPED" | "BLOCKED"; frameworkId?: ReasoningFrameworkId; reasons: string[]; missingInputs: string[]; }
export interface SkillManifest { schemaVersion: 1; id: string; version: string; name: string; description: string; domains: string[]; requiredInputs: string[]; outputs: string[]; allowedCapabilities: string[]; maximumRisk: CapabilityRisk; requiresApproval: boolean; }
