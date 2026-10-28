/**
 * Messaging for an engineering intent request whose final outcome could not be
 * confirmed by the client. This is not a retry authorization or a run-status
 * determination; the caller must preserve the draft and direct the user to
 * inspect persisted history before an intentional resubmission.
 */
export function getEngineeringIntentRetryGuidance(errorMessage: string): string {
  const summary = errorMessage.trim() || "The engineering request did not return a usable decision.";
  return `${summary} Your request may have reached the server even though the response was lost. Your draft has been preserved. Review the project's execution history before intentionally resubmitting; a missing response does not prove that no work occurred.`;
}
