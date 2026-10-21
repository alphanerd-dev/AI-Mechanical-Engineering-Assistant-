export type CADDecisionTone = "success" | "question" | "warning" | "error" | "neutral";
export interface CADDecisionNotice {
  message: string;
  tone: CADDecisionTone;
}

export function getCADDecisionNotice(input: {
  status: string;
  verified: boolean;
  nextQuestion?: string;
  reason?: string;
}): CADDecisionNotice {
  if (input.status === "ACCEPTED" && input.verified) {
    return {
      tone: "success",
      message: "Accepted. The solid passed independent geometry validation and its evidence and artifacts were persisted. This is not engineering design approval.",
    };
  }
  if (input.status === "NEEDS_INPUT") {
    return {
      tone: "question",
      message: input.nextQuestion ?? "More dimensional input is required before geometry generation.",
    };
  }
  if (input.status === "UNSUPPORTED") {
    return {
      tone: "warning",
      message: input.reason ?? "This reference workflow does not support that geometry yet.",
    };
  }
  if (input.status === "WAITING_APPROVAL") {
    return {
      tone: "warning",
      message: "The result is waiting for an authorized human approval. It is not released or complete.",
    };
  }
  if (["FAILED", "REJECTED", "BLOCKED", "INCOMPLETE"].includes(input.status)) {
    return {
      tone: "error",
      message: "The request ended as " + input.status + ". Review the recorded reason and next action before deciding whether to revise and resubmit.",
    };
  }
  return {
    tone: "neutral",
    message: "Decision recorded as " + input.status + ". Review its validation and evidence status below.",
  };
}

export function getCADRetryGuidance(kind: "network" | "no_decision"): string {
  if (kind === "network") {
    return "The connection ended before a response was received. Your draft is preserved. Refresh completion history before retrying; the server may have received the request even though its response was lost.";
  }
  return "Your draft is preserved. Refresh completion history before retrying. Do not assume that a missing response means no server-side work occurred.";
}
