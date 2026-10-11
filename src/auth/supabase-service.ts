import { createClient } from "../../lib/supabase/server";
import { InMemoryAuditTrail } from "../audit/trail";
import { type AuditActor, type AuditAction, type AuditOutcome } from "../audit/types";
import { authorize } from "./policy";
import type { AuthenticatedIdentity, EngineeringPermission } from "./types";
import { identityFromSupabaseUser, type SupabaseClaims } from "./supabase-identity";

const globalKey = "__ENGINEERING_SUPABASE_AUTH_AUDIT__";
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
  if (userError || !userData.user) return null;

  return identityFromSupabaseUser(userData.user, claims);
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
