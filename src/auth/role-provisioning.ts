import type { EngineeringRole } from "./types.js";

const ENGINEERING_ROLES: readonly EngineeringRole[] = ["ENGINEER", "REVIEWER", "ADMIN", "AGENT"];

export function provisionRoleForAuthenticatedUser(input: {
  userId: string;
  existingRoles: unknown;
  bootstrapAdminUserId?: string;
}): EngineeringRole | null {
  const { userId, existingRoles, bootstrapAdminUserId } = input;

  // The bootstrap identity is an explicit server-side allowlist entry. Never
  // accept this value from request input, user metadata, or query parameters.
  if (bootstrapAdminUserId?.trim() && userId === bootstrapAdminUserId.trim()) {
    return "ADMIN";
  }

  const roles = Array.isArray(existingRoles)
    ? existingRoles
    : existingRoles === undefined || existingRoles === null
      ? []
      : [existingRoles];

  if (roles.some((role): role is EngineeringRole =>
    typeof role === "string" && ENGINEERING_ROLES.includes(role as EngineeringRole)
  )) {
    return null;
  }

  return "ENGINEER";
}
