/** True only for the explicit API response that indicates a missing engineering role. */
export function isEngineeringRoleRequiredFailure(status: unknown, code: unknown): boolean {
  return status === 403 && code === "ENGINEERING_ROLE_REQUIRED";
}
