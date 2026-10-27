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
