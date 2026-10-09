# Phase G: Live Model and Workspace Acceptance

## Goal

Verify the configured model transport and workspace integration with deterministic acceptance tests before enabling a real external model in a deployment. This phase does not claim a live vendor endpoint was exercised unless an explicitly configured deployment test records that evidence.

## Automated acceptance

The Vitest transport acceptance suite covers:

- Server-configured endpoint/model/credential, JSON-mode request, and response parsing.
- HTTP failures and network errors returning bounded errors without exposing upstream response bodies.
- Invalid transport JSON, malformed proposal JSON, and responses without message content.
- A provider response passing through `ModelBackedTaskReasoningProposer` and `executeTaskReasoning`.
- Rejection of provider attempts to claim `VERIFIED` or inject task/project/control fields.
- Trusted record identity, mandatory advisory limitation, `validationStatus: NOT_PERFORMED`, and unchanged task lifecycle state.

The existing configuration tests also verify that absent or blank timeout uses the documented 45-second default; explicit values outside the supported integer range of 1000–120000 ms and endpoints with embedded credentials fail closed.

## Live acceptance harness

`scripts/reasoning-model-live-acceptance.ts` sends a deliberately bounded, non-engineering test task to the configured endpoint and exercises the normal reasoning execution boundary. It passes only if the provider returns a valid `PROPOSED` record and the trusted identities, advisory limitation, validation status, and task lifecycle invariants remain intact.

The manually triggered workflow is `.github/workflows/reasoning-model-live-acceptance.yml`. It can run only from `main`, uses the `reasoning-model-acceptance` GitHub Environment, and uploads a redacted evidence artifact for 14 days. The workflow records outcome, model identifier, deployment revision, test timestamp, duration, reasoning status, validation status, and bounded error metadata. It does not log API keys, the raw prompt, or full model output.

Configure the GitHub Environment as documented in `docs/reasoning-model-provider-stack.md`. Restrict it to `main` and apply reviewer protection where needed. Trigger it from **Actions → Live Reasoning Model Acceptance → Run workflow**. A missing endpoint/model configuration must fail the live acceptance rather than silently skip it.

## Configuration hardening

The timeout parser uses its default only when the variable is absent or blank; invalid explicit values are rejected rather than normalized. Endpoint credentials must not be embedded in the URL. API credentials remain optional only for provider endpoints that explicitly support unauthenticated requests.

## Live deployment gate

A live-model acceptance run requires a configured deployment, an approved endpoint, and server-side credentials supplied through the GitHub Environment or deployment secret manager. Never use production secrets in repository fixtures. Preserve the redacted evidence artifact with model identifier, deployment revision, timestamp, duration, and pass/fail checks.

Until the workflow is successfully run against a configured provider, status remains **automated transport/configuration acceptance implemented; live external-provider acceptance pending**. An ordinary green CI run is not evidence that a real external endpoint was exercised.
