const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Enables durable execution globally or for one explicitly allowlisted project.
 * A malformed or missing canary project ID fails closed.
 */
export function isDurableExecutionEnabledForProject(projectId: unknown): boolean {
  if (process.env.DURABLE_EXECUTION_ENABLED === "true") return true;

  const canaryProjectId = process.env.DURABLE_EXECUTION_CANARY_PROJECT_ID?.trim();
  if (!canaryProjectId || !UUID.test(canaryProjectId)) return false;
  if (typeof projectId !== "string") return false;

  const candidate = projectId.trim();
  return UUID.test(candidate) && candidate.toLowerCase() === canaryProjectId.toLowerCase();
}
