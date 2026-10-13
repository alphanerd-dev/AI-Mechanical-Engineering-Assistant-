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

Run only against a dedicated **non-production deployment and non-production Supabase project**. The test creates a persisted project with an `E2E ownership verification` name; no project-delete API is assumed. The two accounts must be dedicated test accounts, confirmed in Supabase Auth, and able to sign in with standard engineering access. Do not use personal accounts.

In GitHub repository Settings → Environments, create an environment named `e2e-staging` and configure these environment secrets there. Add a required reviewer to that environment if you want a human approval gate before the test can access its credentials:

- `E2E_USER_A_EMAIL`
- `E2E_USER_A_PASSWORD`
- `E2E_USER_B_EMAIL`
- `E2E_USER_B_PASSWORD`

Also configure the repository Actions variable `E2E_ALLOWED_HOSTS` with the exact non-production hostnames permitted for this workflow, comma-separated and without a scheme or path (for example, a dedicated Render test hostname). Do not put the production hostname in this allowlist. The workflow rejects targets that are not an exact allowlist match; wildcard entries are not supported.

This is a manual **post-merge** acceptance workflow, not a pre-merge gate: GitHub exposes the standard `workflow_dispatch` Run workflow control for workflows on the default branch. Merge this workflow to `main` first, then open Actions → **Playwright User Journey E2E** → Run workflow. Supply the HTTPS URL of the non-production deployment and explicitly confirm the non-production target. The workflow fails closed if the confirmation, allowlist, or any credential is missing. The allowlist limits accidental targeting but does not inspect the target's Supabase configuration, so maintainers must ensure each allowlisted deployment uses a dedicated non-production Supabase project. The workflow does not run on every pull request and does not deploy the app.

## Run locally

Install the repository dependencies, then install the pinned test runner without modifying the lockfile:

`npm ci`

`npm install --no-save --package-lock=false @playwright/test@1.64.0`

`npx playwright install chromium`

Set `E2E_BASE_URL`, `E2E_USER_A_EMAIL`, `E2E_USER_A_PASSWORD`, `E2E_USER_B_EMAIL`, and `E2E_USER_B_PASSWORD`, then run `npm run test:e2e`.

## Interpreting results

A green run verifies only the assertions above on the selected deployment at that time. It does not prove general engineering correctness, complete database policy coverage, or that all possible direct API paths are secure. Review the uploaded Playwright report and trace on failures, then add focused tests for any failure or missing path.
