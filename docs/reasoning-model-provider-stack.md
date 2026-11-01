# Conversational AI and Model Provider Stack

**Reviewed:** 1 November 2026  
**Status:** Streamed chat is implemented. Structured reasoning remains a separate model-backed proposal path.

## Current implementation: streamed engineering chat

The current project chat uses:

- **assistant-ui** for the conversation UI and thread controls.
- **Vercel AI SDK** for streaming and the UI-message stream contract.
- **Official AI SDK Google provider** for Gemini.
- **Streamdown** with the code plugin and math plugin, plus **KaTeX** for equation rendering.
- **Next.js server route** as the authenticated project and model boundary.
- **Existing Supabase/project conversation machinery** for project-scoped persistence and history.

The server route is `app/api/projects/[projectId]/engineering/chat/route.ts`. It authenticates the actor against the demo role or registered project membership, validates the project ID and message schema, rejects client-supplied provider/model/system/tool fields, and uses a server-controlled system instruction and provider configuration.

The current default chat model is `gemini-3.5-flash-lite`. Override it only through the server-side `ENGINEERING_REASONING_MODEL_NAME` setting. The chat route requires the server-side `ENGINEERING_REASONING_MODEL_API_KEY`; it does not accept a key or arbitrary endpoint from the browser. `ENGINEERING_REASONING_MODEL_TIMEOUT_MS` controls the bounded request timeout. The route caps output tokens and bounds provider retries, stream retries and execution time.

The chat is conversational. It may explain concepts, compare options, identify missing inputs and perform ordinary analytic calculations in the response. It currently exposes no privileged engineering tools and does not execute CAD/FEA, Python/shell, project mutations or formal validation. Use the separate Engineering Core interaction panel for registered deterministic workflows.

## Separate structured-reasoning transport

The project also contains a structured reasoning workbench for task/framework proposals. Its generator is host-owned and uses a separate configurable HTTP transport in `src/reasoning-frameworks/openai-compatible-generator.ts`. It uses the server-side `ENGINEERING_REASONING_MODEL_URL`, `ENGINEERING_REASONING_MODEL_NAME`, `ENGINEERING_REASONING_MODEL_API_KEY` and timeout settings.

That path sends typed task/framework inputs and validates the model's advisory JSON proposal through the existing Engineering Core. The model cannot execute a capability, certify a result, mutate task state, approve an operation or invent trusted evidence references.

Do not conflate this structured proposal endpoint with the streamed Gemini chat provider. They have different request/response contracts and acceptance tests, even where they share environment variable names for model/key selection.

## Model-selection and cost policy

The current default is an implementation default, not a claim that a comparative provider benchmark has selected the globally optimal model.

Before changing the default or adding another provider:

1. Compare current input/output/cached-token pricing for candidate models.
2. Use a fixed task set covering normal conversation, ambiguous requests, missing mechanical inputs, calculation explanation, unsupported requests, timeouts and recovery.
3. Score technical correctness, units, assumption handling, refusal/unsupported behavior and latency before comparing cost.
4. Exclude any model that fabricates provider execution, artifact IDs, validation, evidence or approval.
5. Measure token usage, retries, first-token latency, completion latency and error rate where the provider returns reliable data.
6. Choose the lowest-cost candidate that meets predeclared quality and reliability thresholds; retain the benchmark and rerun after changing the default.

The outcome metric is cost per accepted engineering outcome, not the cheapest individual response. Do not claim productivity or cost savings without matched real-task measurement.

## Security and operational rules

- Keep provider keys and endpoint configuration server-side.
- Do not accept browser-controlled model/provider/system prompt/tool declarations.
- Require authentication and project authorization before project chat requests.
- Bound message count/size, output tokens, request duration and retries.
- Redact credentials and avoid logging raw chat content unnecessarily.
- Treat model output and user-provided text as untrusted.
- Keep deterministic calculations, CAD/FEA execution, validation and artifact persistence in their existing controlled service boundaries.
- Do not expose unrestricted Python, shell, SQL, filesystem, network access or arbitrary provider URLs as chat tools.

## Acceptance distinction

The chat renderer's Playwright acceptance uses an intercepted/mock streamed response to verify client-side Markdown/math/code rendering, project scoping and desktop/mobile behavior. It does not validate live Gemini credentials, answer quality, live model latency/cost or chat-driven tool execution.

The structured reasoning live-acceptance workflow tests its own proposal/provenance contract. It is not a substitute for chat rendering acceptance. See [Playwright and Live Acceptance](playwright-e2e.md).

## References

- [Vercel AI SDK documentation](https://ai-sdk.dev/docs)
- [AI SDK Google provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [assistant-ui AI SDK integration](https://www.assistant-ui.com/docs/integrations/frameworks/ai-sdk)
- [Streamdown](https://streamdown.ai)
- [KaTeX](https://katex.org)
