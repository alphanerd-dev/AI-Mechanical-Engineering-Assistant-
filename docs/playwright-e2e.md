# Playwright end-to-end acceptance

This suite exercises the deployed browser workflow rather than checking whether pages merely return HTTP 200.

## Coverage

- Sign in as a dedicated staging user through the login form.
- Create a uniquely named engineering project through the workspace UI.
- Reload the project and return to the board to prove the record persists.
- Sign out through the UI and assert an unauthenticated request to `/api/projects` is denied with HTTP 403.
- Sign in as a second user, verify the first user's project is absent, and attempt direct URL access; the current ownership contract expects HTTP 404.
- Capture browser diagnostics, HTTP 5xx responses, Playwright traces, screenshots, and an HTML report.

This is an acceptance slice, not proof that every workflow or email-confirmation path is correct. Registration and email-confirmation testing should be added as a separate journey once the staging email workflow is configured.

## Safety requirements

**Preferred:** run against a dedicated non-production deployment and a separate non-production Supabase project. The test creates a persisted project with an `E2E ownership verification` name; it does not delete that project. Use two dedicated test accounts with standard engineering access. Do not use personal accounts.

**Temporary pre-launch option:** when the product has no real users and the shared Supabase project contains no important real-user data, the workflow also supports `prelaunch-shared-supabase`. This mode is intentionally less isolated: the E2E journey writes persistent test data to the Supabase project configured for the selected Preview deployment. Only use it before real users/data exist, with two dedicated test accounts, and expect E2E project records to remain until manually removed. Do not use the production deployment URL; select an allowlisted Vercel Preview URL.

In GitHub repository Settings → Environments, create an environment named `e2e-staging` and configure these environment secrets there. Add a required reviewer to that environment if you want a human approval gate before the test can access its credentials:

- `E2E_USER_A_EMAIL`
- `E2E_USER_A_PASSWORD`
- `E2E_USER_B_EMAIL`
- `E2E_USER_B_PASSWORD`

Configure the repository Actions variable `E2E_ALLOWED_HOSTS` with the exact hostname(s) permitted for this workflow, comma-separated and without a scheme or path. For shared pre-launch mode, allowlist the Vercel Preview hostname only—not the production hostname. Exact matches are required; wildcard entries are not supported.

This is a manual **post-merge** acceptance workflow, not a pre-merge gate. After merging the workflow to `main`, open Actions → **Playwright User Journey E2E** → Run workflow. Choose `isolated-staging` and confirm the separate test database, or choose `prelaunch-shared-supabase` and explicitly acknowledge persistent writes to the shared database. The workflow validates the URL host, allowlist, confirmations, and credentials, but cannot independently inspect which Supabase project the deployment uses. It does not run on every pull request and does not deploy the app.

## Run locally

Install the repository dependencies, then install the pinned test runner without modifying the lockfile:

`npm ci`

`npm install --no-save --package-lock=false @playwright/test@1.64.0`

`npx playwright install chromium`

Set `E2E_BASE_URL`, `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`, `E2E_USER_B_EMAIL`, and `E2E_USER_B_PASSWORD`, then run `npm run test:e2e`.

## Interpreting results

A green run verifies only the assertions above on the selected deployment at that time. It does not prove general engineering correctness, complete database policy coverage, or that all possible direct API paths are secure. Review the uploaded Playwright report and trace on failures, then add focused tests for any failure or missing path.
