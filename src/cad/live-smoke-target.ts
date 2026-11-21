const APPROVED_NON_PRODUCTION_HOSTS = new Set([
  // Historical branch-scoped M0 preview. M2 acceptance uses a separately
  // configured exact preview hostname supplied by the protected CI environment.
  "ai-mechanical-engineering-assistant-m-git-bd1610-alphanerd-labs.vercel.app",
]);
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const PRODUCTION_APP_HOSTS = new Set([
  "ai-mechanical-engineering-assistant.vercel.app",
  "ai-mechanical-engineering-assistant-alphanerd-labs.vercel.app",
  "ai-mechanical-engineering-assistant-git-main-alphanerd-labs.vercel.app",
  "ai-mechanical-engineering-assistant-eta.vercel.app",
]);

/**
 * Live CAD/M2 acceptance writes durable records. Fail closed: allow local
 * development, the historical isolated M0 preview, or one exact preview host
 * explicitly pinned by the protected CI environment. Wildcards are forbidden.
 */
export function assertNonProductionCadSmokeTarget(
  baseUrl: URL,
  configuredAllowedHost = process.env.CAD_WORKSPACE_ALLOWED_HOST,
): void {
  const hostname = baseUrl.hostname.toLowerCase();

  if (LOCAL_DEVELOPMENT_HOSTS.has(hostname)) return;
  if (baseUrl.protocol !== "https:") {
    throw new Error("Live CAD acceptance requires HTTPS outside local development.");
  }
  if (PRODUCTION_APP_HOSTS.has(hostname)) {
    throw new Error("Production application hosts are never valid for write-producing CAD/M2 acceptance.");
  }
  if (APPROVED_NON_PRODUCTION_HOSTS.has(hostname)) return;

  const allowedHost = configuredAllowedHost?.trim().toLowerCase();
  if (allowedHost && !allowedHost.includes("*") && hostname === allowedHost) return;

  throw new Error(
    "Refusing to run the authenticated CAD/M2 acceptance against an unapproved host. " +
    "Use the exact branch-scoped non-production preview configured by the protected CI environment; never use production.",
  );
}
