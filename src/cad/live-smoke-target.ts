const APPROVED_NON_PRODUCTION_HOSTS = new Set([
  "ai-mechanical-engineering-assistant-eta.vercel.app",
]);
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The live CAD smoke creates durable completion and artifact records.
 * Fail closed: only a specifically approved isolated preview host or local
 * development is allowed. A blanket "not the main hostname" check would still
 * allow writes to an unknown production/custom domain.
 */
export function assertNonProductionCadSmokeTarget(baseUrl: URL): void {
  const hostname = baseUrl.hostname.toLowerCase();

  if (LOCAL_DEVELOPMENT_HOSTS.has(hostname)) return;
  if (APPROVED_NON_PRODUCTION_HOSTS.has(hostname)) return;

  throw new Error(
    "Refusing to run the authenticated CAD acceptance smoke against an unapproved host. " +
    "Use the allowlisted isolated E2E preview or local development; do not run write-producing CAD acceptance against production.",
  );
}
