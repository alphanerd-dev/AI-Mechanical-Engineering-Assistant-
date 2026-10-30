const APPROVED_NON_PRODUCTION_HOSTS = new Set([
  // Branch-scoped M0 preview: dedicated E2E Supabase project and CAD worker
  // token/URL are configured on this exact preview branch. Do not replace this
  // with a generated deployment URL or the M0 project's stable production alias.
  "ai-mechanical-engineering-assistant-m-git-bd1610-alphanerd-labs.vercel.app",
]);
const LOCAL_DEVELOPMENT_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/**
 * The live CAD smoke creates durable completion and artifact records.
 * Fail closed: only the exact branch-scoped M0 E2E preview host or local
 * development is allowed. The M0 project's stable eta alias uses its
 * production-target environment and does not carry the branch-scoped CAD
 * worker configuration, so it is intentionally not an accepted smoke target.
 */
export function assertNonProductionCadSmokeTarget(baseUrl: URL): void {
  const hostname = baseUrl.hostname.toLowerCase();

  if (LOCAL_DEVELOPMENT_HOSTS.has(hostname)) return;
  if (APPROVED_NON_PRODUCTION_HOSTS.has(hostname)) return;

  throw new Error(
    "Refusing to run the authenticated CAD acceptance smoke against an unapproved host. " +
    "Use the exact branch-scoped M0 E2E preview or local development; do not run write-producing CAD acceptance against production.",
  );
}
