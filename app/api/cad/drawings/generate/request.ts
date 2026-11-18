import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { authorizationFailureStatus, authorizeSupabaseRequest } from "../../../../../src/auth/supabase-service";
import { DrawingGenerationError, fail } from "./errors";
export { DrawingGenerationError, fail } from "./errors";
export type { DrawingGenerationFailure } from "./errors";

export {
  MAX_DRAWING_GENERATION_REQUEST_BYTES,
  parseDrawingGenerationRequest
} from "./request-parser";
export type { DrawingGenerationInput } from "./request-parser";
type ProjectAuthorization = Awaited<ReturnType<typeof authorizeSupabaseRequest>>;
async function resolveProjectAuthorization(input: { projectId: string }): Promise<ProjectAuthorization> {
  let executionAuthorization: ProjectAuthorization;
  let evidenceAuthorization: ProjectAuthorization;
  try {
    executionAuthorization = await authorizeSupabaseRequest("TASK.EXECUTE", input.projectId);
    evidenceAuthorization = await authorizeSupabaseRequest("EVIDENCE.WRITE", input.projectId);
  } catch {
    fail({ message: "Project authorization is unavailable.", status: 503, code: "AUTHORIZATION_UNAVAILABLE" });
  }
  if (!executionAuthorization.allowed) {
    fail({ message: executionAuthorization.reason, status: authorizationFailureStatus(executionAuthorization), code: "PROJECT_ACCESS_DENIED" });
  }
  if (!evidenceAuthorization.allowed) {
    fail({ message: evidenceAuthorization.reason, status: authorizationFailureStatus(evidenceAuthorization), code: "EVIDENCE_WRITE_DENIED" });
  }
  if (executionAuthorization.subject !== evidenceAuthorization.subject) {
    fail({ message: "Execution and evidence-write authorization identities do not match.", status: 401, code: "SESSION_IDENTITY_MISMATCH" });
  }
  return executionAuthorization;
}
async function confirmSessionIdentity(input: { subject: string }) {
  const sessionDb = await createClient();
  const user = await sessionDb.auth.getUser();
  if (user.error) fail({ message: "Authenticated project identity could not be confirmed.", status: 401, code: "SESSION_IDENTITY_MISMATCH" });
  if (!user.data.user) fail({ message: "Authenticated project identity could not be confirmed.", status: 401, code: "SESSION_IDENTITY_MISMATCH" });
  if (user.data.user.id !== input.subject) fail({ message: "Authenticated project identity could not be confirmed.", status: 401, code: "SESSION_IDENTITY_MISMATCH" });
  return sessionDb;
}
export async function requireAuthorizedIdentity(input: { projectId: string }) {
  const authorization = await resolveProjectAuthorization({ projectId: input.projectId });
  if (!authorization.allowed) fail({ message: authorization.reason, status: authorizationFailureStatus(authorization), code: "PROJECT_ACCESS_DENIED" });
  if (!authorization.subject) fail({ message: "Authenticated project identity is unavailable.", status: 503, code: "IDENTITY_UNAVAILABLE" });
  const sessionDb = await confirmSessionIdentity({ subject: authorization.subject });
  return { subject: authorization.subject, sessionDb };
}
export function drawingGenerationErrorResponse(error: unknown): NextResponse {
  if (error instanceof DrawingGenerationError) {
    return NextResponse.json({ error: error.message, ...(error.code ? { code: error.code } : {}) }, {
      status: error.status, headers: { "cache-control": "no-store" }
    });
  }
  return NextResponse.json({ error: "CAD drawing generation failed without changing geometry validation or approval state." }, {
    status: 500, headers: { "cache-control": "no-store" }
  });
}
