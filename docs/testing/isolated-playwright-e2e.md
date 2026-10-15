# Isolated Playwright E2E acceptance runbook

**Last reviewed:** 15 October 2026

## Safety contract

Playwright is manual-only and must target a dedicated, non-production E2E deployment backed by the dedicated Supabase E2E project and disposable test accounts. It must not target production or shared-development Supabase. There is no shared-database override.

The exact run-time hostname allowlist, canonical authentication origin, E2E/production project-reference inequality and explicit confirmation are fail-closed guardrails. They do not substitute for verifying the deployment's runtime Supabase configuration. Do not run browser tests unless the deployment is confirmed to use the dedicated E2E project.

**Environment policy:** the E2E Supabase project is for acceptance testing only, not feature development. Author application and schema changes on the feature branch as reviewed source and migration files. Apply reviewed migrations to production separately. Never copy E2E test records into production.

## GitHub Actions environment

The protected Actions environment is named `e2e-staging`.

Required environment variables:
- `E2E_ALLOWED_HOSTS`: exact dedicated E2E hostnames only; no wildcard and no production hostname.
- `E2E_CANONICAL_BASE_URL`: canonical HTTPS origin used by authentication redirects.
- `E2E_SUPABASE_PROJECT_REF`: dedicated E2E Supabase project reference.
- `E2E_SUPABASE_PUBLISHABLE_KEY`: E2E public/publishable key.
- `PRODUCTION_SUPABASE_PROJECT_REF`: production project reference for an explicit inequality check.

Required disposable-account secrets:
- `E2E_USER_A_EMAIL`
- `E2E_USER_A_PASSWORD`
- `E2E_USER_B_EMAIL`
- `E2E_USER_B_PASSWORD`

Restrict who can use `e2e-staging`. Never reuse personal, production or real-user accounts.

## Current isolated environment

- E2E Supabase project: [AI-Mechanical-Engineering-Assistant-E2E](https://supabase.com/dashboard/project/mpbrlegwrrrfpeumtqhi), ref `mpbrlegwrrrfpeumtqhi`.
- Production Supabase project: [AI Mechanical Engineering Assistant](https://supabase.com/dashboard/project/mepmogsqhxxasahwhete), ref `mepmogsqhxxasahwhete`.
- Dedicated E2E Preview: [isolated branch preview](https://ai-mechanical-engineering-assistan-git-730bea-ahmtechs-projects.vercel.app).
- Feature branch: `implementation/p3-isolated-browser-acceptance-2026-10-14`.

Before dispatching a workflow, check the supplied base URL uses HTTPS, contains no credentials/query/fragment, matches the canonical auth origin, and its exact host is on the allowlist. Verify the deployment uses the E2E ref shown above and that the configured production reference is different. Confirm only after all checks pass.

## Latest acceptance evidence

- **Isolated user-journey run:** [workflow run #21](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38703092953) passed 9/9 tests at source head `bace5106e5440694406ff9faecb7e27aa617f122`. The retained [Playwright report, traces, screenshots and diagnostics](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38703092953/artifacts/11957421947) has SHA-256 `d2b77e0445b41e301be6290263b7e5dbd401c43980b7958e7e63913269517ccd` and was scheduled to expire 29 October 2026.
- **Opt-in accepted CAD path:** [workflow run #38729950415](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38729950415) ran on 15 October 2026 at source head `11ffdf6b02e9dd6a2e47f725f70419da95bcf03e`, with `test_accepted_cad_completion=true`. Isolation preflight and setup passed; **10 tests passed and 1 failed**. The opt-in accepted-CAD test timed out after 15 seconds waiting for `/api/cad/readiness`, before the actual accepted CAD completion was submitted. The route deliberately bounds Render worker cold-start probing at 45 seconds; the test request's default 15-second timeout was too short. Report/traces retained in [artifact 11969909130](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38729950415/artifacts/11969909130), SHA-256 `548e8e1ca0b8f4a639f59c8c229ab1b2081d2ffd2e5bc14424f38f5943641f4d`. A targeted test fix in commit [`2a2a8bb`](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/2a2a8bb17bdbaf0696e4b83143ee7ca0403ab176) now allows 60 seconds for readiness (45-second bounded probe plus headroom); the rerun is pending the matching Preview deployment. **Do not mark the live accepted CAD-to-audit path VERIFIED until a rerun succeeds and its retained artifact is inspected.**
- [Engineering Core CI](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38697962156), [ESLint](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38697962186), [CodeQL Advanced](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38697962076), [Codacy](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38697962185), and [Provider Benchmark Gates](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38697962184) passed at the earlier source head recorded in the PR. The CAD benchmark ran three analytic fixtures on build123d 0.13.0 and CadQuery 2.8.0. This small regression suite does not itself certify either provider for safety-critical use.

The current browser suite includes:
- Accessible keyboard sign-in/sign-out, sign-in and owner-scoped project persistence, and cross-user isolation.
- Durable workspace/session round-trip over full browser reload; revision conflict and stale-write coverage.
- Provider-request and session-restoration outage behavior, including not silently substituting a new session.
- CAD NEEDS_INPUT durability/audit correlation without executing the CAD worker.
- Owner-scoped and revision-guarded project GET/PATCH/DELETE, artifact cleanup and post-delete checks.
- An opt-in live accepted CAD path validating readiness, a project-scoped CAD model, a fully specified cylindrical shaft, accepted completion, private artifact readback and SHA-256, independent geometry validation receipt, correlated durable audit event, audit-chain verification and project/artifact cleanup.
- An axe WCAG 2.1/2.2 AA automated scan for login, authenticated project list and engineering workspace.

A green run proves only the checks that actually ran. Keep unrun or failed tests visible and retain the exact commit SHA, workflow URL and evidence artifact.

## Supabase migration history warning

Both production and E2E report migration names V2.0.23–V2.0.28 as applied, and the core public schema was checked for parity. Their *remote migration-version timestamps* differ from the canonical timestamps in repository migration filenames, and also differ between each remote project.

Do not run `supabase db push` until the local/remote histories are reconciled. Use the official [Supabase migration list and repair workflow](https://supabase.com/docs/reference/cli/supabase-migration-list) to inspect and correct the remote ledger with `supabase migration repair`, which changes migration tracking rather than re-executing migration SQL. Repair each project independently, then run `supabase migration list` and retain both outputs. Do not edit Supabase's internal migration-history table with ad-hoc SQL. Schema parity is not proof that future deploys are reproducible until the ledger check passes.

## Production release boundary

Production Supabase V2.0.23–V2.0.28 have been applied and verified. Production Vercel has **not** been redeployed with the feature-branch route changes and remains on main commit `cbc804253162f7209b75c7ec70a14b6b33f82313`. The deployed route therefore must not be described as using the newer atomic CAD-completion/audit integration yet.

Merge/release only after the issue's acceptance gates and review are complete. A production application deployment is a separate, explicit release step, not a side effect of testing. After release, verify production health, access control, project ownership and audit-chain behavior with safe, non-destructive checks; never run the Playwright mutation suite against production.
