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
