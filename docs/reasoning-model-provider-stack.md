# Reasoning Model Provider Stack

## Decision

Keep the provider-neutral `ModelReasoningGenerator` interface and the existing server-side Chat Completions-compatible transport for the first live-provider acceptance. Do not add a new model SDK or gateway solely to make the first real request.

The current implementation already supports a configured HTTP endpoint, model identifier, optional bearer credential, bounded timeout, JSON-object response mode, and response parsing. Its response remains untrusted input and is passed to the existing controlled reasoning service. That service continues to own proposal validation and record creation.

## Evaluated options

### Direct HTTP transport — use now

- No additional SDK dependency.
- Endpoint, model, and credential remain server-side configuration.
- Injected `fetch` makes transport behavior straightforward to test.
- Requires a Chat Completions-compatible request and response shape.

Reference: https://platform.openai.com/docs/api-reference/chat

### Vercel AI SDK — revisit when required

A strong candidate if the product needs more provider adapters, provider-native structured generation, streaming, tool integration, or consistent usage metadata. If adopted, implement it behind `ModelReasoningGenerator` and retain JSON Schema/Ajv as the canonical acceptance boundary. It must not create a path around controlled capability execution.

Reference: https://ai-sdk.dev/docs

### LiteLLM gateway — defer until centralized operations are needed

Consider a gateway when organization-level model routing, budgets, rate limits, provider fallback, centralized access control, or shared usage reporting become real requirements. It adds a separately operated service and is unnecessary solely to proxy the first provider.

Reference: https://docs.litellm.ai/docs/

### OpenTelemetry — stage after a telemetry destination is selected

OpenTelemetry is the preferred standards-based foundation for traces and metrics. A collector/exporter and a production telemetry destination have not yet been selected, so SDK instrumentation is deferred until the application can consume it operationally.

The current live acceptance harness records a redacted evidence result containing outcome, deployment revision, model identifier, timestamp, duration, reasoning status, and validation status. It does not store API keys, raw prompts, or full model output.

Reference: https://opentelemetry.io/docs/languages/js/

## Live-provider acceptance workflow

The manually triggered `.github/workflows/reasoning-model-live-acceptance.yml` workflow invokes `scripts/reasoning-model-live-acceptance.ts` from `main` only. It calls the configured provider, routes the response through the controlled reasoning service, and uploads a redacted result for 14 days.

Configure a GitHub Environment named `reasoning-model-acceptance` with:

| Name | Type | Required | Purpose |
|---|---|---:|---|
| `ENGINEERING_REASONING_MODEL_URL` | Environment variable | Yes | Approved Chat Completions-compatible endpoint |
| `ENGINEERING_REASONING_MODEL_NAME` | Environment variable | Yes | Model identifier accepted by the endpoint |
| `ENGINEERING_REASONING_MODEL_TIMEOUT_MS` | Environment variable | No | Integer from 1000 to 120000; blank uses 45000 |
| `ENGINEERING_REASONING_MODEL_API_KEY` | Environment secret | Provider-dependent | Server-side bearer token |

Restrict the environment to the `main` branch. Add required reviewer approval if the deployment policy calls for it. The workflow uses read-only repository permissions and has no pull-request trigger.

After setting up the environment, open **Actions → Live Reasoning Model Acceptance → Run workflow** and select `main`. Success requires a valid `PROPOSED` record through controlled validation, trusted identity preservation, `NOT_PERFORMED` validation status, unchanged `PROPOSED` task state, and the mandatory advisory limitation.

Green ordinary CI proves deterministic tests/builds passed; it does not replace a successful live-provider acceptance run.
