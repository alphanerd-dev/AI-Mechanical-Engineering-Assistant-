# Optional model-backed engineering intent

The main POST /api/engineering/intent entry now uses a runtime interpreter factory. The default remains deterministic; a provider-neutral OpenAI Chat Completions-compatible HTTP transport is used only when both required server-side environment variables are configured.

## Configuration

- ENGINEERING_INTENT_MODEL_URL: approved absolute HTTP(S) Chat Completions-compatible endpoint (use HTTPS in shared environments).
- ENGINEERING_INTENT_MODEL_NAME: model identifier accepted by that endpoint.
- ENGINEERING_INTENT_MODEL_API_KEY: optional server-side bearer token; never passed from the client request.
- ENGINEERING_INTENT_MODEL_TIMEOUT_MS: optional integer from 1000 through 120000; default 45000.

No SDK is required. If the URL/model pair is absent or only partially configured, the deterministic interpreter remains active. If a configured provider fails, times out, returns malformed JSON, or fails source-provenance validation, the request falls back to the deterministic interpreter. The returned interpretation.interpretationSource reports MODEL, DETERMINISTIC, or DETERMINISTIC_FALLBACK. The code does not log raw prompts, model output, or credentials.

## Safety boundary

- User-origin values must match their source text; context-origin values must exactly match a value supplied in the interpreter context; unknown inputs cannot contain values.
- Model output is structured interpretation only. The model cannot return engineering results, evidence IDs, approval decisions, or successful validation claims.
- The normal deterministic capability router, calculation/solver adapters, capability-specific validators, evidence generation and explicit approval gates still control completion.
- Model confidence is interpretation uncertainty, never engineering correctness.
- The HTTP request includes only bounded project ID/stage and up to 64 finite/string known inputs. Recent artifact/evidence lists and arbitrary nested context objects are not sent to the model.

The endpoint has not been live-tested from this preview. Until endpoint/model settings are explicitly configured, the route remains on the deterministic interpretation path.
