import type { ReasoningFrameworkId, ReasoningFrameworkManifest } from "./types.js";

export const REASONING_FRAMEWORKS: readonly ReasoningFrameworkManifest[] = [
  {
    schemaVersion: 1,
    id: "first-principles",
    version: "1.0.0",
    name: "First-Principles Thinking",
    purpose: "Separate foundational facts, assumptions, and derived constraints.",
    suitableFor: ["problem-framing", "novel-design", "constraint-analysis"],
    requiredInputs: ["task"],
    outputKind: "REASONING_RECORD"
  },
  {
    schemaVersion: 1,
    id: "weighted-decision-matrix",
    version: "1.0.0",
    name: "Weighted Decision Matrix",
    purpose: "Compare alternatives against explicit criteria while exposing uncertainty.",
    suitableFor: ["option-selection", "trade-study", "architecture-decision"],
    requiredInputs: ["alternatives", "criteria"],
    outputKind: "REASONING_RECORD"
  },
  {
    schemaVersion: 1,
    id: "five-whys",
    version: "1.0.0",
    name: "5 Whys",
    purpose: "Explore a possible causal chain; proposed causes require independent evidence.",
    suitableFor: ["failure-analysis", "problem-investigation", "recurring-issue"],
    requiredInputs: ["problem-statement"],
    outputKind: "REASONING_RECORD"
  }
] as const;

export function getReasoningFramework(id: ReasoningFrameworkId): ReasoningFrameworkManifest | undefined {
  return REASONING_FRAMEWORKS.find((item) => item.id === id);
}
