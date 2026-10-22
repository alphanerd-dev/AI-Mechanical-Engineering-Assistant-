# Conversational AI and Model Provider Stack

**Decision reviewed:** 22 October 2026  
**Status:** Selected stack; repository integration remains planned work.

## Decision

Implement the conversational AI experience using:

- **assistant-ui** for the chat interface and client-side conversation UX.
- **Vercel AI SDK** for model integration, streaming and typed tool calls.
- **A configurable OpenAI-compatible hosted endpoint** for initial model access.
- **Next.js server routes** as the authenticated boundary.
- **Supabase** for existing project authorization, workspace context and conversation persistence.
- **The existing Engineering Core** for capability routing, deterministic execution, validation, evidence and approvals.

The selected provider is an OpenAI-compatible endpoint, not Vercel AI Gateway. The hosted model has not been chosen yet; lowest practical API cost is the priority, subject to benchmarked tool correctness, engineering-task quality, latency and reliability.

The SDK and UI library are integration components. They do not replace authorization, domain policy, deterministic execution or independent validation.

## Existing transport is not streaming chat

The repository currently has a server-side structured reasoning transport configured through the ENGINEERING_REASONING_MODEL_* variables and a separate optional intent-interpreter transport configured through the ENGINEERING_INTENT_MODEL_* variables. The existing reasoning transport requests a structured proposal; the intent transport returns structured interpretation. Neither is equivalent to a complete streaming conversational API.

During implementation, define a canonical server-side configuration contract and a tested adapter for any legacy configuration names. Avoid creating conflicting model selections for chat, intent interpretation and structured proposal work where the same endpoint can safely serve those needs. Preserve existing contracts until migration tests demonstrate parity.

Never accept an endpoint, credential or privileged model-selection override from an ordinary browser request. Production endpoints must use HTTPS and a deployment-owned allowlist. Reject endpoint configurations that could access unintended internal services. Credentials must not use NEXT_PUBLIC_ names or appear in client bundles, logs, prompts, evidence artifacts or error responses.

## Model-selection and cost policy

1. Compare current provider pricing for input, output, cached tokens and any other billed features relevant to candidates.
2. Build a fixed task set that includes normal conversation, ambiguous requests, missing dimensions/material/load inputs, tool-call selection, structured output, refusal/unsupported work, timeout recovery and concise result explanation.
3. Score task correctness and required-input behavior before comparing cost; exclude candidates that fabricate evidence, validation or approval state.
4. Track measured tokens and latency when returned reliably, plus failures, retries and tool-call success. Do not invent cost numbers when provider usage/pricing data is unavailable.
5. Choose the least expensive model meeting the predeclared quality, latency and reliability thresholds. Re-run the benchmark after changing the default model.
6. Bound message history, output tokens, request duration, retries and per-user/project usage. Keep deterministic calculation and CAD/FEA execution outside the model.

## Controlled tool boundary

The model can request a typed, allowlisted capability, but the server independently authenticates the user, checks project membership and role, validates the tool schema and applies capability risk/approval policy.

Tool output should be returned to the conversation as structured, source-linked results. The model cannot invent an artifact ID, trusted provider identity, validation receipt, evidence ID or approval decision. Mutating calls need idempotency and safe retry semantics. Untrusted model output remains a proposal until the existing engineering service accepts it.

Never expose unrestricted Python, shell, SQL, filesystem, network or arbitrary provider URLs as chat tools. CAD and solver runtimes remain in bounded isolated workers.

## Streaming and conversation requirements

- Secure streamed text and typed tool-call lifecycle; explicit loading, cancellation and error state.
- Project-scoped history restored through authorized server APIs and existing revision/conflict protection.
- Bounded context: use authorized project facts and artifact references, not an indiscriminate dump of project records or raw storage URLs.
- Reliable persistence and recovery after aborted streams, provider timeouts, invalid responses and conflicting revisions.
- No duplicate execution when a tool call, client request or network response is retried.
- Explicit states for NEEDS_INPUT, UNSUPPORTED, BLOCKED, FAILED, EXECUTED, VALIDATED, VERIFIED and WAITING_APPROVAL wherever those states are returned by the engineering API.
- Usage/latency telemetry with secret and sensitive-content redaction.

## Acceptance distinction

The existing Live Reasoning Model Acceptance workflow tests a bounded structured proposal path and its provider provenance. It is not proof that streamed chat, assistant-ui, tool execution, long conversations or chat recovery work.

Add dedicated tests for streaming, endpoint/model compatibility, client abort, limits, authorization, tool allowlisting, duplicate requests, evidence spoofing, conversation persistence and model-cost measurement. The live provider acceptance workflow must test only its documented contract; do not claim production readiness from ordinary unit tests.

## References

- [Vercel AI SDK documentation](https://ai-sdk.dev/docs)
- [AI SDK OpenAI-compatible providers](https://ai-sdk.dev/providers/openai-compatible-providers)
- [assistant-ui AI SDK integration](https://www.assistant-ui.com/docs/integrations/frameworks/ai-sdk)
