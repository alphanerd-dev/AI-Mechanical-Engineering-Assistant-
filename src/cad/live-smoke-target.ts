const PRODUCTION_CANONICAL_HOST = "ai-mechanical-engineering-assistant.vercel.app";
const PRODUCTION_TEAM_ALIAS_SUFFIX = "-alphanerd-labs.vercel.app";
const PRODUCTION_PROJECT_PREFIX = "ai-mechanical-engineering-assistant-";

/**
 * Prevent an authenticated, write-producing CAD acceptance smoke from targeting
 * the canonical production app or a team-scoped deployment alias.
 *
 * The smoke deliberately creates durable CAD completion/artifact records. It
 * must run only against a dedicated non-production deployment and test project.
 */
export function assertNonProductionCadSmokeTarget(baseUrl: URL): void {
  const hostname = baseUrl.hostname.toLowerCase();
  const isCanonicalProduction = hostname === PRODUCTION_CANONICAL_HOST;
  const isTeamScopedProjectAlias =
    hostname.startsWith(PRODUCTION_PROJECT_PREFIX) &&
    hostname.endsWith(PRODUCTION_TEAM_ALIAS_SUFFIX);

  if (isCanonicalProduction || isTeamScopedProjectAlias) {
    throw new Error(
      "Refusing to run the authenticated CAD acceptance smoke against a production project hostname. " +
      "Configure the dedicated non-production E2E deployment and test project before running this test.",
    );
  }
}
