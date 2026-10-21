# Playwright and live CAD acceptance runbook

These workflows test different boundaries. A passing unit/CI test, a browser sign-in journey, a CAD worker smoke test and a production-ready engineering outcome are not interchangeable claims.

## Mandatory safety boundary

- Use a dedicated non-production deployment, dedicated E2E Supabase project and disposable test accounts. Never target production or shared-development data.
- Confirm the E2E and production Supabase project references are different before dispatch. Do not use personal or real-user credentials.
- Only use exact HTTPS hostnames in the allowlist. The requested base URL must match the canonical authentication origin and must contain no credentials, query string or fragment.
- Review the target deployment's actual Supabase configuration; configured GitHub variables alone cannot prove what the deployment uses.
- Do not copy E2E data into production. Keep migration work in reviewed source/migration files and use the documented production migration workflow.
- The Playwright workflow strips session-bearing trace archives/videos before artifact upload. Keep authentication tokens and cookie values out of logs, issues and committed files.

## 1. Browser user-journey acceptance

Workflow: .github/workflows/e2e-playwright.yml, shown in Actions as **Playwright User Journey E2E**. It is manually dispatched and does not deploy the application.

The protected GitHub Environment e2e-staging must contain these variables:

- E2E_ALLOWED_HOSTS — exact allowed non-production hostname(s), comma-separated, without scheme or path.
- E2E_CANONICAL_BASE_URL — canonical HTTPS origin configured for auth redirects.
- E2E_SUPABASE_PROJECT_REF — dedicated E2E project reference.
- E2E_SUPABASE_PUBLISHABLE_KEY — E2E public/publishable key.
- PRODUCTION_SUPABASE_PROJECT_REF — production reference used for a strict inequality check.

Environment secrets:

- E2E_USER_A_EMAIL and E2E_USER_A_PASSWORD
- E2E_USER_B_EMAIL and E2E_USER_B_PASSWORD

Dispatch only after checking these values and verifying the real deployment uses the dedicated E2E database. Set the workflow's isolation confirmation to true. Opt into test_accepted_cad_completion only when the current worker is reachable and the dedicated E2E environment is ready. The single-slot CAD worker is intentionally serialized; do not run overlapping accepted-CAD tests.

The journey covers accessible authentication, persisted project creation, sign-out/authorization and cross-user project isolation. It does not prove every API authorization path or general engineering correctness.

## 2. Authenticated CAD workspace live acceptance

Workflow: .github/workflows/cad-workspace-live-acceptance.yml, shown in Actions as **CAD Workspace Live Acceptance**. Its protected GitHub Environment is cad-workspace-live-acceptance.

Required environment variables:

- CAD_WORKSPACE_BASE_URL
- CAD_WORKSPACE_PROJECT_ID
- CAD_WORKSPACE_MODEL_ID

Required secret:

- CAD_WORKSPACE_COOKIE

The workflow must stop at preflight if any value is missing. The cookie is a secret and must not be printed. Its current-revision acceptance criterion is an authenticated request that executes the supported task, independently validates the BREP, persists the artifact and evidence, and reads the artifact back with matching digest and project/model lineage. The optional missing-input test must prove the workflow stops before CAD execution.

## Current evidence snapshot

- Main baseline reviewed on 22 October 2026: [5da2823](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/5da2823ff7792cb23e9ae36b193cd627f2d4d7ba). CI results are linked in the root README and implementation plan.
- [CAD Workspace Live Acceptance run 39634636058](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39634636058) was blocked because CAD_WORKSPACE_BASE_URL was not configured in the GitHub Environment; the authenticated test step did not execute. Do not classify this as a CAD algorithm failure or as a live pass.
- Earlier accepted-CAD evidence exists for source head c4acf0dbbc5017a50b262c3983564fa33f420306: [run 38733136266](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38733136266). It is useful historical evidence, not a substitute for rerunning the current revision.

## Running and reviewing

For local browser tests, install dependencies with npm ci, install the pinned Playwright helpers without updating the lockfile, install Chromium, set the dedicated E2E environment variables, then run npm run test:e2e.

For every run, record the workflow URL, commit SHA, environment, which test paths actually executed, retained report, failures and follow-up. A preflight failure or skipped test is not a pass. A green run proves only the assertions that ran on that exact revision and environment.