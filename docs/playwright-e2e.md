# Playwright and Live Acceptance Runbook

These workflows test different boundaries. A unit/CI test, a browser sign-in journey, a CAD worker smoke test and a production-ready engineering outcome are not interchangeable claims.

## Mandatory safety boundary

- Use a dedicated non-production deployment, dedicated E2E Supabase project and disposable test accounts. Never target production or shared-development data.
- Confirm the E2E and production Supabase project references are different before dispatch.
- Only use exact HTTPS hostnames in the protected `E2E_ALLOWED_HOSTS` allowlist.
- Review the target deployment's actual Supabase configuration; GitHub environment variables alone do not prove what the deployment uses.
- Keep authentication tokens, cookies and session-bearing Playwright traces out of logs, issues, committed files and uploaded artifacts.
- Never copy E2E data into production.

## Browser user-journey workflow

Workflow: `.github/workflows/e2e-playwright.yml`, shown in Actions as **Playwright User Journey E2E**. It is manually dispatched and does not deploy the application.

The protected GitHub Environment `e2e-staging` must contain:

- `E2E_ALLOWED_HOSTS` — comma-separated exact non-production hostnames without scheme/path.
- `E2E_CANONICAL_BASE_URL` — canonical HTTPS origin for authentication redirects.
- `E2E_SUPABASE_PROJECT_REF` and `E2E_SUPABASE_PUBLISHABLE_KEY` — the dedicated E2E project reference and publishable key.
- `PRODUCTION_SUPABASE_PROJECT_REF` — production reference used for a strict inequality check.

Environment secrets:

- `E2E_USER_A_EMAIL` and `E2E_USER_A_PASSWORD`.
- `E2E_USER_B_EMAIL` and `E2E_USER_B_PASSWORD`.

The workflow validates non-production isolation, exact hostname allowlisting and explicit confirmation before it runs. It also validates the target deployment's Supabase project reference. Keep the CAD accepted-completion option disabled unless the dedicated E2E worker and data environment are intentionally prepared for that test.

### Suites

- **public-ui-smoke:** read-only public workspace and auth-form checks plus authenticated engineering chat rendering. The chat test signs in with an isolated E2E account, intercepts the chat POST with a controlled streamed UI-message response and checks the client renderer; it does not call the live model or execute CAD.
- **full:** the broader authenticated user-journey suite, including project ownership/persistence boundaries. Accepted CAD completion is a separate opt-in and requires a ready non-production worker.

The workflow installs the pinned Playwright/axe helpers and Chromium. Before uploading artifacts it removes session-bearing trace archives; only sanitized evidence should remain.

### Preview hostname and auth redirect rule

For a Vercel preview, use the **unique deployment hostname** returned by Vercel when the application derives authentication redirects from `VERCEL_URL`. A branch alias can redirect a browser to the unique deployment hostname after sign-in, which changes the host-scoped session-cookie context. In that case, allowlist the unique deployment hostname and pass that exact HTTPS URL as `base_url`. Do not weaken the origin/allowlist check or change the canonical origin just to make a test pass.

Add only the intended non-production preview hostname to `E2E_ALLOWED_HOSTS`. After the run, remove temporary entries and verify the variable has returned to its prior value. Never add a production host for this workflow.

## Current chat renderer acceptance evidence

On 1 November 2026, the chat implementation revision `ed2b4b7229dc5c845123fd9db0db5c150c79ffc2` passed Playwright run [41298598698](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/41298598698): **4/4 tests passed**. Coverage included mobile sign-in/sign-up layout, authenticated streamed chat Markdown/equations/code/tables/currency at desktop and mobile sizes, and public workspace keyboard/mobile navigation. The axe result contained zero violations.

The chat response in this suite is mocked. This evidence proves the authenticated client rendering and responsive UI assertions on that source revision; it does not prove live Gemini credentials, model answer quality, production latency, CAD execution or FEA correctness. Re-run the workflow against the exact release candidate after any source or deployment change.

## Authenticated CAD workspace live acceptance

The CAD workspace live acceptance workflow is separate from the UI smoke suite. Its protected environment requires:

- `CAD_WORKSPACE_BASE_URL`
- `CAD_WORKSPACE_PROJECT_ID`
- `CAD_WORKSPACE_MODEL_ID`
- `CAD_WORKSPACE_COOKIE` as a secret

Stop at preflight if any required value is missing. The cookie must never be printed. Acceptance must execute only the supported bounded CAD task, independently validate the BREP, persist artifact/evidence and read it back with a matching digest and project/model lineage. A missing-input test must prove the workflow stops before CAD execution.

## Running and reviewing

For every run, record the workflow URL, commit SHA, environment, which tests actually executed, retained sanitized report, failures and follow-up. A preflight failure, skipped test or mocked response is not a live-provider pass. A green run proves only the assertions that ran on that exact revision and environment.
