import type { ReasoningFrameworkManifest } from "./types.js";
import type { TaskReasoningProposalRequest, TaskReasoningProposer } from "../task-graph/reasoning-execution.js";

/**
 * Host-owned model transport. A provider SDK, remote service, local model, or
 * deterministic test double can implement this interface without coupling the
 * Engineering Core to a vendor or introducing a second orchestration runtime.
 */
export interface ModelReasoningGenerationRequest {
  task: Readonly<TaskReasoningProposalRequest["task"]>;
  framework: Readonly<ReasoningFrameworkManifest>;
  inputs: Readonly<Record<string, unknown>>;
  instructions: string;
}

export interface ModelReasoningGenerator {
  generate(request: ModelReasoningGenerationRequest): Promise<unknown>;
}

export function buildModelReasoningInstructions(
  framework: ReasoningFrameworkManifest
): string {
  return [
    "Return one JSON object only; do not wrap it in markdown.",
    "Produce advisory reasoning for the supplied task using the supplied framework manifest.",
    "Do not calculate or certify engineering results, execute capabilities, approve actions, or claim validation was performed.",
    "Do not invent facts, input values, evidence, measurements, standards, or external references.",
    "Use only these top-level keys: status, assumptions, output, limitations, evidenceReferences, requiredGates.",
    "status must be PROPOSED, INCOMPLETE, or BLOCKED. VERIFIED is forbidden.",
    "assumptions, limitations, evidenceReferences, and requiredGates must be arrays of non-empty strings.",
    "PROPOSED requires an output. If material information is missing, use INCOMPLETE and describe what is missing.",
    "evidenceReferences are identifiers supplied as references only; never invent that evidence exists.",
    "Keep output JSON-compatible and limited to the reasoning task; never include task/project identity or verification-control fields.",
    `Selected framework: ${framework.id}@${framework.version} (${framework.name}).`,
    `Framework purpose: ${framework.purpose}`,
    `Required inputs: ${framework.requiredInputs.join(", ") || "(none declared)"}.`
  ].join(" ");
}

/**
 * Adapts an injected model transport to the existing controlled reasoning
 * execution boundary. Output validation and record creation remain owned by
 * executeTaskReasoning; this adapter cannot mutate task state or validate work.
 */
export class ModelBackedTaskReasoningProposer implements TaskReasoningProposer {
  constructor(private readonly generator: ModelReasoningGenerator) {
    if (!generator || typeof generator.generate !== "function") {
      throw new Error("A model reasoning generator is required.");
    }
  }

  async propose(request: TaskReasoningProposalRequest): Promise<unknown> {
    if (!request?.task || !request.framework || !request.inputs) {
      throw new Error("A complete task, framework, and inputs snapshot is required.");
    }
    const safeRequest: ModelReasoningGenerationRequest = {
      task: structuredClone(request.task),
      framework: structuredClone(request.framework),
      inputs: structuredClone(request.inputs),
      instructions: buildModelReasoningInstructions(request.framework)
    };
    return this.generator.generate(safeRequest);
  }
}

/** Deterministic fixture for tests and offline conformance checks only. */
export class StaticModelReasoningGenerator implements ModelReasoningGenerator {
  constructor(private readonly output: unknown) {}

  async generate(): Promise<unknown> {
    return structuredClone(this.output);
  }
}
