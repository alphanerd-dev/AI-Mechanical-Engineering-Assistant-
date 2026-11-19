const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * True only when the global switch is off and one exact project is allowlisted.
 * A malformed or missing canary project ID fails closed.
 */
export function isDurableExecutionCanaryProject(projectId: unknown): boolean {
  if (process.env.DURABLE_EXECUTION_ENABLED === "true") return false;

  const canaryProjectId = process.env.DURABLE_EXECUTION_CANARY_PROJECT_ID?.trim();
  if (!canaryProjectId || !UUID.test(canaryProjectId)) return false;
  if (typeof projectId !== "string") return false;

  const candidate = projectId.trim();
  return UUID.test(candidate) && candidate.toLowerCase() === canaryProjectId.toLowerCase();
}

/**
 * Enables durable execution globally or for one explicitly allowlisted project.
 */
export function isDurableExecutionEnabledForProject(projectId: unknown): boolean {
  return process.env.DURABLE_EXECUTION_ENABLED === "true" ||
    isDurableExecutionCanaryProject(projectId);
}
