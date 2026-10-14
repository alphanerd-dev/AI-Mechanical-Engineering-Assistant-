# Isolated Playwright E2E acceptance runbook

## Safety contract

The Playwright workflow is manual-only. It must target a dedicated, non-production E2E deployment backed by a dedicated Supabase project and disposable test accounts. It must not target production or the shared development Supabase project. There is no shared-database override.

The workflow's project-reference comparison is a guardrail, not proof of the target deployment's runtime configuration. An operator must verify the E2E deployment uses the project identified by `E2E_SUPABASE_PROJECT_REF` before dispatching the workflow. Never run the browser suite until that verification is complete.

## GitHub Actions environment

Create a protected GitHub Actions environment named `e2e-staging`. Configure these environment variables:

- `E2E_ALLOWED_HOSTS`: comma-separated exact hostnames for dedicated E2E deployments only (no URL scheme, path, wildcard, or production host).
- `E2E_SUPABASE_PROJECT_REF`: the dedicated E2E Supabase project reference.
- `PRODUCTION_SUPABASE_PROJECT_REF`: the production Supabase project reference, used only for a fail-closed inequality check.

Configure these environment secrets using two disposable E2E accounts in the isolated project:

- `E2E_USER_A_EMAIL`
- `E2E_USER_A_PASSWORD`
- `E2E_USER_B_EMAIL`
- `E2E_USER_B_PASSWORD`

Do not reuse personal, production, or real-user accounts. Restrict who can use the `e2e-staging` environment.

## Verify the target deployment before running

1. Provision the dedicated Supabase E2E project and apply the repository migrations.
2. Create two disposable test users and provision the expected ENGINEER role using the same supported setup path used by the application.
3. Configure the dedicated E2E deployment's Supabase URL and keys to that E2E project. Do not copy production secrets.
4. Verify the project reference in the deployment configuration matches `E2E_SUPABASE_PROJECT_REF`; separately verify it differs from `PRODUCTION_SUPABASE_PROJECT_REF`.
5. Confirm `E2E_BASE_URL` is an exact hostname listed in `E2E_ALLOWED_HOSTS`, and that it resolves to the E2E deployment.
6. Dispatch **Playwright User Journey E2E** in GitHub Actions and set `confirm_isolated_environment` to true only after completing these checks.
7. Retain the workflow run, HTML report, traces, screenshots, and diagnostics as acceptance evidence.

If any check is uncertain, do not dispatch the workflow. The workflow installs the pinned runner version `@playwright/test@1.64.0` after `npm ci`; the application lockfile remains unchanged. Node.js 22 and Chromium are used by CI.

## Current coverage and follow-up

### Verified acceptance evidence (14 October 2026)

- **Latest successful isolated run:** [Playwright User Journey E2E #9](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38551269683) — **2 passed in 38.9 seconds**.
- **Retained report/traces/diagnostics:** [playwright-e2e-evidence artifact](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38551269683/artifacts/11886891828).
- The run was dispatched on branch `implementation/p3-isolated-browser-acceptance-2026-10-14`, commit `1f0cdaa010032c48a74230e02cb352fb9b926754`, to the explicitly allowlisted stable branch-preview hostname and the dedicated E2E Supabase project. The preflight confirmed the E2E project ref differs from the configured production project ref.
- `user-journey.e2e.mjs` verifies sign-in, project creation and persistence after reload, sign-out/anonymous API denial, and cross-user project isolation.
- `workspace-intent-acceptance.e2e.mjs` verifies durable workspace reads/writes, stale workspace-revision rejection, deterministic shaft-torque output with linked evidence, engineering-intent NEEDS_INPUT / validated WAITING_APPROVAL / invalid-proposal failure, conversation save/restore and session revision conflicts, plus user-B and anonymous direct API denial.
- [Engineering Core CI #676](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38551113321) passed, including `npm test`, the Python worker tests, CAD/FEA runtime smoke tests, and the production-provider CAD acceptance path. ESLint, CodeQL Advanced, and Codacy Security Scan also passed for this commit.

The acceptance work found and fixed two session-revision defects: the conversation-save route now passes the incremented snapshot revision to the store, and the Supabase session read projection now includes `snapshot_revision`. The store test double now respects selected columns and asserts that an updated session restores at revision 2.

### Remaining coverage gaps

A green run proves only the assertions above. Follow-up acceptance work remains for the complete direct-API list/read/update/delete matrix, provider/network failure browser journeys, real browser refresh/resume (as distinct from API save/restore), accessibility checks, and additional malformed-input/storage-outage cases. Do not interpret this run as a full security audit or proof that all features are production-ready.
