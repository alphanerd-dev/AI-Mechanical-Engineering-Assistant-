import { createClient } from "../../lib/supabase/server";
import { InMemoryAuditTrail } from "../audit/trail";
import { type AuditActor, type AuditAction, type AuditOutcome } from "../audit/types";
import { authorize } from "./policy";
import type { AuthenticatedIdentity, EngineeringPermission, EngineeringRole } from "./types";
import { identityFromSupabaseUser, type SupabaseClaims } from "./supabase-identity";

const globalKey = "__ENGINEERING_SUPABASE_AUTH_AUDIT__";
const KNOWN_ENGINEERING_ROLES: readonly EngineeringRole[] = ["ENGINEER", "REVIEWER", "ADMIN", "AGENT"];

function roleNamesFromMetadata(metadata: unknown): EngineeringRole[] {
  if (!metadata || typeof metadata !== "object") return [];
  const record = metadata as Record<string, unknown>;
  const candidate = record.engineering_roles ?? record.engineering_role;
  const values = Array.isArray(candidate) ? candidate : candidate === undefined ? [] : [candidate];
  return values.filter((value): value is EngineeringRole =>
    typeof value === "string" && KNOWN_ENGINEERING_ROLES.includes(value as EngineeringRole)
  );
}

function diagnosticsContext() {
  let projectRef = "unknown";
  try {
    const value = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (value) projectRef = new URL(value).hostname.split(".")[0] || "unknown";
  } catch {
    // Do not log or propagate malformed environment values.
  }
  const provider = process.env.VERCEL === "1"
    ? "vercel"
    : process.env.RENDER === "true"
      ? "render"
      : "node";
  return { provider, projectRef };
}

function userIdSuffix(value: unknown): string | undefined {
  return typeof value === "string" && value.length >= 6 ? value.slice(-6) : undefined;
}

function logAuthDiagnostic(event: string, details: Record<string, unknown>) {
  console.warn("[engineering-auth-diagnostic]", JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...diagnosticsContext(),
    ...details,
  }));
}
type GlobalWithAudit = typeof globalThis & { [globalKey]?: InMemoryAuditTrail };

function auditTrail() {
  const holder = globalThis as GlobalWithAudit;
  holder[globalKey] ??= new InMemoryAuditTrail();
  return holder[globalKey];
}

function actorType(identity: AuthenticatedIdentity): AuditActor["actorType"] {
  return identity.roles.includes("AGENT") ? "AGENT" : "USER";
}

function audit(
  action: AuditAction,
  outcome: AuditOutcome,
  subject: string,
  reason: string,
  metadata: Record<string, unknown>,
  identity?: AuthenticatedIdentity,
) {
  auditTrail()?.append({
    timestamp: new Date().toISOString(),
    actor: {
      subject,
      actorType: identity ? actorType(identity) : "SYSTEM",
      roles: identity?.roles,
    },
    action,
    outcome,
    reason,
    metadata,
  });
}

export async function getAuthenticatedIdentity(): Promise<AuthenticatedIdentity | null> {
  const supabase = await createClient();

  // Claims retain useful session context for auditing, but are snapshots. Never
  // authorize from them alone because an otherwise valid JWT can retain revoked
  // or missing engineering role claims after app_metadata changes.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const claims = !claimsError && claimsData?.claims ? claimsData.claims as SupabaseClaims : undefined;

  // Fetch the current user from Supabase Auth for every protected authorization
  // decision. identityFromSupabaseUser trusts only this verified user's
  // server-managed app_metadata, not the JWT's possibly stale roles or user_metadata.
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  const identity = user ? identityFromSupabaseUser(user, claims) : null;

  if (!identity) {
    logAuthDiagnostic("identity_unavailable", {
      claimsLookupSucceeded: !claimsError,
      claimsRoleNames: roleNamesFromMetadata(claims?.app_metadata),
      userLookupSucceeded: !userError && Boolean(user),
      userLookupErrorCode: typeof userError?.code === "string" ? userError.code : undefined,
      userLookupStatus: typeof userError?.status === "number" ? userError.status : undefined,
      trustedAppMetadataRoleNames: roleNamesFromMetadata(user?.app_metadata),
      userIdSuffix: userIdSuffix(user?.id),
    });
  }

  return identity;
}

export async function authorizeSupabaseRequest(
  permission: EngineeringPermission,
  projectId?: string,
) {
  const identity = await getAuthenticatedIdentity();
  if (!identity) {
    const decision = {
      allowed: false,
      reason: "Authenticated engineering identity is missing or has no assigned engineering role.",
      permission,
      subject: "anonymous",
      projectId,
    };
    audit("AUTHORIZATION", "DENIED", "anonymous", decision.reason, { permission, projectId });
    return decision;
  }

  const decision = authorize({ identity, permission, projectId });
  if (!decision.allowed) {
    logAuthDiagnostic("authorization_denied", {
      permission,
      trustedRoleNames: identity.roles,
      userIdSuffix: userIdSuffix(identity.subject),
      projectIdProvided: Boolean(projectId),
    });
  }
  audit(
    "AUTHORIZATION",
    decision.allowed ? "ALLOWED" : "DENIED",
    identity.subject,
    decision.reason,
    { permission, projectId, sessionId: identity.sessionId ?? "unknown" },
    identity,
  );
  return decision;
}

export function getAuthenticationAuditTrail() {
  return auditTrail();
}
