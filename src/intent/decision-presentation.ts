export type EngineeringDecisionTone = "positive" | "attention" | "danger" | "neutral";

export interface EngineeringDecisionPresentation {
  tone: EngineeringDecisionTone;
  title: string;
  message: string;
  evidenceMessage: string;
}

/**
 * Converts a persisted engineering decision into cautious, user-facing copy.
 * This is presentation logic only: it never validates a computation or changes
 * the status supplied by the engineering domain.
 */
export function getEngineeringDecisionPresentation(input: {
  status: string;
  validationPassed: boolean;
  evidenceIds: readonly string[];
  nextQuestion?: string;
  nextAction?: string;
}): EngineeringDecisionPresentation {
  const status = input.status.trim().toUpperCase();
  const evidenceCount = input.evidenceIds.length;
  const evidenceMessage = evidenceCount === 0
    ? "No evidence is linked to this decision. Do not treat it as verified unless the capability-specific evidence contract is satisfied."
    : `${evidenceCount} evidence record${evidenceCount === 1 ? "" : "s"} linked. Open the records and confirm that their scope matches this result.`;

  switch (status) {
    case "NEEDS_INPUT":
      return {
        tone: "attention",
        title: "More input required",
        message: input.nextQuestion?.trim() || "The task needs material input before it can proceed. No engineering completion is implied.",
        evidenceMessage,
      };
    case "WAITING_APPROVAL":
      return {
        tone: "attention",
        title: "Awaiting human approval",
        message: input.validationPassed
          ? "The response reports passing checks, but an authorized human decision is still outstanding. This result is not released."
          : "An authorized human decision is still outstanding, and passing checks have not been confirmed. This result is not released.",
        evidenceMessage,
      };
    case "COMPLETE":
      if (!input.validationPassed) {
        return {
          tone: "attention",
          title: "Completion reported; checks not confirmed",
          message: "The workflow reports completion, but the decision does not confirm that the required checks passed. Do not treat this result as validated.",
          evidenceMessage,
        };
      }
      if (evidenceCount === 0) {
        return {
          tone: "attention",
          title: "Completion reported; evidence missing",
          message: "The response reports passing checks, but no evidence records are linked. The result is not traceably verified.",
          evidenceMessage,
        };
      }
      return {
        tone: "positive",
        title: "Completion reported; evidence linked",
        message: "The response reports passing checks and links evidence for review. Confirm the checks' scope and limitations; this is not design, regulatory, or safety approval.",
        evidenceMessage,
      };
    case "PROPOSED":
      return {
        tone: "neutral",
        title: "Proposal only",
        message: "This is a proposed operation. It has not been executed, validated, or approved by this status.",
        evidenceMessage,
      };
    case "EXECUTED":
    case "COMPLETED":
      return {
        tone: "attention",
        title: "Execution reported; validation is separate",
        message: "The executor reports that the operation completed. This does not by itself establish engineering correctness, validation, verification, or approval.",
        evidenceMessage,
      };
    case "VALIDATED":
      return {
        tone: input.validationPassed ? "attention" : "danger",
        title: input.validationPassed ? "Validation reported" : "Validation status conflicts with checks",
        message: input.validationPassed
          ? "The response reports that the capability-specific checks passed. Human approval and release are separate decisions; review the linked receipt and its limitations."
          : "The status says VALIDATED, but the response does not confirm passing checks. Treat this as a status inconsistency and do not release the result.",
        evidenceMessage,
      };
    case "VERIFIED":
      return {
        tone: "attention",
        title: evidenceCount > 0 ? "Verification reported; inspect the receipt" : "Verification status lacks linked evidence",
        message: evidenceCount > 0
          ? "The service reports VERIFIED and links evidence identifiers. Inspect the underlying capability-specific receipt, input and artifact revision before relying on the result. This is not design, regulatory, or safety approval."
          : "The service reports VERIFIED but provides no linked evidence identifiers. Verification is not traceable from this response; do not treat it as accepted.",
        evidenceMessage,
      };
    case "APPROVED":
      return {
        tone: "attention",
        title: "Approval decision reported",
        message: input.validationPassed
          ? "The response reports approval and passing checks. Confirm the authorized reviewer, exact revision, and linked validation evidence; approval is scoped to that record."
          : "The response reports approval, but passing validation checks are not confirmed here. Do not interpret approval as proof of engineering correctness.",
        evidenceMessage,
      };
    case "CANCELLED":
    case "CANCELED":
      return {
        tone: "attention",
        title: "Operation cancelled",
        message: "The operation is recorded as cancelled. Inspect the execution history to confirm which outputs, if any, were persisted before cancellation.",
        evidenceMessage,
      };
    case "STALE":
      return {
        tone: "attention",
        title: "Result is stale",
        message: "The input or source revision has changed. Do not use this result as current until its dependencies are re-evaluated and the applicable checks are rerun.",
        evidenceMessage,
      };
    case "READY":
      return {
        tone: "neutral",
        title: "Decision ready for review",
        message: "The intent is ready for the next step. This status does not mean an engineering operation has executed.",
        evidenceMessage,
      };
    case "FAILED":
      return {
        tone: "danger",
        title: "Engineering operation failed",
        message: "This request did not produce a completed engineering outcome. Review the recorded reason and preserved session before retrying.",
        evidenceMessage,
      };
    case "UNSUPPORTED":
    case "BLOCKED":
      return {
        tone: "attention",
        title: status === "UNSUPPORTED" ? "Capability not supported" : "Operation blocked",
        message: input.nextAction?.trim() || "The operation cannot proceed in the current state. Review the missing capability or blocking requirement before continuing.",
        evidenceMessage,
      };
    default:
      return {
        tone: "neutral",
        title: `Decision status: ${status || "UNKNOWN"}`,
        message: input.nextAction?.trim() || "Review the decision details and evidence before taking the next action.",
        evidenceMessage,
      };
  }
}
