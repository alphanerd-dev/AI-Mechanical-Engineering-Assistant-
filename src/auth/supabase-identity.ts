import type { AuthenticatedIdentity, EngineeringRole } from "./types.js";

const ENGINEERING_ROLES: readonly EngineeringRole[] = ["ENGINEER", "REVIEWER", "ADMIN", "AGENT"];

function isEngineeringRole(value: unknown): value is EngineeringRole {
  return typeof value === "string" && ENGINEERING_ROLES.includes(value as EngineeringRole);
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return values.length > 0 ? values : undefined;
}

export interface SupabaseClaims {
  sub?: unknown;
  session_id?: unknown;
  auth_time?: unknown;
  app_metadata?: unknown;
}

export interface SupabaseVerifiedUser {
  id?: unknown;
  app_metadata?: unknown;
  // Exposed only to make the trust boundary explicit; never used for roles.
  user_metadata?: unknown;
}

export function identityFromSupabaseClaims(claims: SupabaseClaims, now = new Date()): AuthenticatedIdentity | null {
  if (typeof claims.sub !== "string" || !claims.sub.trim()) return null;

  const appMetadata = claims.app_metadata && typeof claims.app_metadata === "object"
    ? claims.app_metadata as Record<string, unknown>
    : {};

  const rawRoles = Array.isArray(appMetadata.engineering_roles)
    ? appMetadata.engineering_roles
    : appMetadata.engineering_role !== undefined
      ? [appMetadata.engineering_role]
      : [];

  const roles = rawRoles.filter(isEngineeringRole);
  if (roles.length === 0) return null;

  const authTime = typeof claims.auth_time === "number"
    ? new Date(claims.auth_time * 1000).toISOString()
    : now.toISOString();

  return {
    subject: claims.sub,
    roles,
    projectIds: asStringArray(appMetadata.engineering_project_ids),
    sessionId: typeof claims.session_id === "string" ? claims.session_id : undefined,
    authenticatedAt: authTime,
  };
}

/**
 * Builds an engineering identity from the user record verified by Supabase Auth.
 * The verified user's server-managed app_metadata takes precedence over JWT claims
 * because access tokens can retain older role claims after server-side role changes.
 * User-editable user_metadata is intentionally never consulted.
 */
export function identityFromSupabaseUser(
  user: SupabaseVerifiedUser,
  claims?: SupabaseClaims,
  now = new Date(),
): AuthenticatedIdentity | null {
  if (typeof user.id !== "string" || !user.id.trim()) return null;

  return identityFromSupabaseClaims({
    ...claims,
    sub: user.id,
    app_metadata: user.app_metadata,
  }, now);
}
