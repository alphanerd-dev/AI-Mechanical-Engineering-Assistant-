import type { FrameworkRoutingDecision, FrameworkRoutingRequest, ReasoningFrameworkId } from "./types.js";
import { getReasoningFramework, type ReasoningFrameworkRegistry } from "./registry";

/** Selects a reasoning method only; it never executes engineering capabilities or verifies results. */
export function routeReasoningFramework(
  request: FrameworkRoutingRequest,
  registry?: ReasoningFrameworkRegistry
): FrameworkRoutingDecision {
  const candidates: ReasoningFrameworkId[] = request.requestedFramework
    ? [request.requestedFramework]
    : infer(request.taskType, request.uncertainty, request.risk);

  if (!candidates.length) {
    return {
      status: "SKIPPED",
      reasons: ["No material benefit from framework overhead was identified."],
      missingInputs: []
    };
  }

  const id = candidates[0];
  const manifest = registry
    ? registry.get(id, request.requestedFrameworkVersion)
    : getReasoningFramework(id, request.requestedFrameworkVersion);

  if (!manifest) {
    return {
      status: "BLOCKED",
      frameworkId: id,
      reasons: ["Unsupported framework or ambiguous/missing framework version."],
      missingInputs: []
    };
  }

  const missingInputs = manifest.requiredInputs.filter((input) => !request.availableInputs.includes(input));
  if (missingInputs.length) {
    return {
      status: "BLOCKED",
      frameworkId: id,
      frameworkVersion: manifest.version,
      reasons: ["Required inputs are missing; do not invent them."],
      missingInputs
    };
  }

  return {
    status: "SELECTED",
    frameworkId: id,
    frameworkVersion: manifest.version,
    reasons: [
      request.risk === "HIGH" || request.risk === "CRITICAL"
        ? "High-risk context: existing validation and approval gates remain mandatory."
        : "Output is a reasoning record, not verified evidence."
    ],
    missingInputs: []
  };
}

function infer(
  type: string,
  uncertainty: FrameworkRoutingRequest["uncertainty"],
  risk: FrameworkRoutingRequest["risk"]
): ReasoningFrameworkId[] {
  const normalized = type.toLowerCase();
  if (/failure|root-cause|incident|recurring-issue/.test(normalized)) return ["five-whys"];
  if (/trade-study|option-selection|architecture-decision/.test(normalized)) return ["weighted-decision-matrix"];
  if (/novel-design|constraint-analysis|problem-framing/.test(normalized)) return ["first-principles"];
  if (uncertainty === "HIGH" || risk === "HIGH" || risk === "CRITICAL") return ["first-principles"];
  return [];
}
