# Implementation Plan and Milestones

**Updated:** 1 November 2026  
**Status:** M0 is complete with its stated limitation. The M1 conversational chat foundation is implemented and browser-accepted on the tested revision. M2 and later viewer/integration milestones remain planned.

This document is the current source of truth for priority, milestone status and exit gates. Historical dated records remain under `docs/plans/`; they preserve what was known at the time and do not override this current status.

## Product and engineering rule

**AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.**

Preserve the existing Next.js/React/TypeScript control plane, Supabase project/workspace and authorization boundaries, provider-neutral Engineering Core, deterministic providers, isolated workers, validators and artifact/evidence contracts. Add libraries and abstractions only when they close an evidenced gap.

## Current baseline

| Area | Current state | Boundary |
|---|---|---|
| Web workspace | Next.js 16 App Router, React 19 and TypeScript. Forge workspace shell, responsive navigation, project routes and authenticated account surfaces. | The UI is not the Engineering Core; authorization remains server-side. |
| Identity and persistence | Supabase SSR/client integration, server auth routes, protected project APIs, project/workspace persistence and conversation/session history. | Do not treat a browser session or public key as project authorization. |
| Conversational chat | assistant-ui + Vercel AI SDK; streamed project chat route; project-scoped history; Gemini provider; Markdown/code/math rendering; edit/copy/regenerate/stop controls. | Conversational answers do not execute CAD/FEA, privileged tools, project mutations or formal validation. |
| Engineering task interaction | Separate Engineering Core panel for existing registered deterministic workflows and decision states. | It is not an LLM tool-call executor. A capability must be explicitly implemented and validated before it is exposed. |
| Deterministic calculations | Shaft and pump-power calculation paths, unit-aware handling, input checks and evidence/validation contracts. | Bounded calculation capabilities; not complete machine design or approval. |
| CAD | Explicit cylindrical/shaft generation using deterministic build123d code, separate remote worker, artifact registration and independent OCCT BREP checks. | Do not infer general CAD/assembly support or automatic validation of every exported format. |
| FEA | Reference Gmsh/CalculiX cantilever benchmark worker and related adapter contracts. | Pilot/reference scope; no general FEA mesh/result viewer or broad structural certification. |
| Physical perception | Isolated Open3D inspection/ICP registration prototype. | No public scan upload, persistent artifact registry integration or production perception claim. |
| CI and browser evidence | Core CI includes tests, worker checks, security analysis and production build. The isolated Playwright public UI suite includes the authenticated chat-rendering test. | Each run proves only the assertions that ran on its exact SHA and environment. |
| Outcome economics | Collection methodology exists. | Engineering time saved, cost per accepted outcome and ROI remain NOT MEASURED until real matched trials exist. |

## M0 — Trustworthy decisions, recovery and evidence

**Status: COMPLETE WITH LIMITATION.** The bounded deterministic calculation, project/workspace persistence, result-state separation, idempotency and artifact/evidence foundations are implemented. The economic outcome baseline remains **NOT MEASURED**. This milestone does not certify all mechanical engineering outputs, all CAD or FEA workflows, or measurable productivity improvement.

## M1 — Conversational chat foundation

**Status: IMPLEMENTED AND BROWSER-ACCEPTED for the current chat scope.**

### Delivered

- assistant-ui conversation UI integrated with the Vercel AI SDK runtime.
- Authenticated server-side stream route at `/api/projects/[projectId]/engineering/chat`.
- Server-side Gemini provider; default model `gemini-3.5-flash-lite`; browser requests cannot control provider, model, system prompt or tools.
- Project-scoped remote thread identity and persistence through the existing project conversation/session machinery.
- Streaming-aware Markdown rendering with headings, emphasis, links, code blocks, tables and currency-safe text.
- LaTeX normalization and display-math block repair, fenced-code preservation, Streamdown math plugin and KaTeX styles.
- Chat controls for edit, copy, regenerate and stop generation; composer suggestions; responsive desktop/mobile layout.
- Dedicated regression tests and authenticated Playwright assertions for Markdown, inline/display math, code, tables and currency.

### Acceptance evidence on the chat implementation revision

The chat implementation commit `ed2b4b7229dc5c845123fd9db0db5c150c79ffc2` was checked by Engineering Core CI run [41296615951](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/41296615951). All 34 job steps passed, including the unit test suite, worker/runtime checks and production Next.js build.

The isolated authenticated Playwright run [41298598698](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/41298598698) passed 4/4 tests. The chat test verified streamed Markdown, inline and display equations, code, tables and currency at desktop and mobile widths. The axe scan returned zero violations. The stream response was mocked in the browser test: this proves the chat client/rendering path, not live Gemini response quality or live CAD execution.

### M1 limitations still open

- Chat responses do not invoke deterministic engineering tools or CAD/FEA workers. The Engineering Core interaction panel remains separate.
- Live model-provider behavior, production credential availability, model-quality benchmarking, cost per accepted answer and production latency must be measured independently.
- Chat is not a general-purpose engineering agent and must not claim formal validation, evidence persistence or approval from its text response.

## Next milestones

| ID | Milestone | Status | Main exit gate |
|---|---|---|---|
| M2 | Shared artifact contract/viewer registry and interactive CAD visualization | NEXT / PLANNED | Supported canonical CAD artifacts and display derivatives render with source lineage, authorization and stale-revision handling; CAD viewer failure cannot change validation state. |
| M3 | FEA mesh and result-field visualization | PLANNED | Supported mesh/field fixtures render with correct source values, units and legends; malformed or incomplete data fails closed; convergence and engineering review remain distinct. |
| M4 | Typed P&ID/PFD data model and viewer | PLANNED | Diagram IDs and connectivity round-trip; references are authorized; unsupported symbols/invalid connections are explicit. |
| M5 | Additional artifact viewers and one evidence-backed provider pilot | DEFERRED | A concrete user need, measured outcome, provider/license review, benchmark, independent validator, runtime isolation and rollback plan exist. |

Physical perception remains a separately staged roadmap path: the current Open3D worker is a one-shot prototype. Before product integration it needs authenticated upload, private project storage, known-transform/noise/outlier fixtures, provenance, limits and human review.

## M2 — CAD visualization work

1. Define a versioned artifact/viewer contract for artifact ID, type/format, project/source revision, checksum, originating operation, provider/runtime, units/coordinate frame, validation receipt and limitations.
2. Add a viewer registry that selects a renderer only from trusted artifact metadata. Unknown formats must produce a clear unsupported/conversion/download state.
3. Integrate a 3D renderer only after supported canonical formats and display derivatives are defined and tested on representative models.
4. Keep canonical CAD bytes authoritative; bind every display derivative to its source ID, revision, digest and conversion metadata.
5. Preserve private Supabase Storage, server-side authorization, short-lived access and safe failure states.
6. Re-run the bounded CAD/OCCT acceptance suite for each release; do not widen the supported geometry scope by implication.

## M3 — FEA visualization work

1. Define accepted mesh/result formats for the Gmsh/CalculiX reference path.
2. Evaluate VTK.js and a normalized result format against known fixtures before selecting the browser reader.
3. Display units, legends, field locations, solver/version, convergence status and known limitations.
4. Keep execution integrity, numerical validation, mesh convergence and engineering approval as distinct states.
5. Test invalid topology, non-finite results, missing fields, unit mismatch, oversized files and conversion failures.

## M4 — P&ID/PFD visualization work

1. Define a typed diagram schema for equipment, ports, line segments, connectivity, flow direction, tags, layers, coordinate/layout data, schema version and source revision.
2. Build an accessible SVG/canvas renderer with pan/zoom, fit-to-view, element selection and tag search.
3. Validate connectivity and identifiers before labeling a diagram accepted.
4. Keep standards compliance explicit; do not claim compliance until the applicable symbol/drafting rules and fixtures are implemented and reviewed.

## Non-negotiable release gates

- Use a feature branch and pull request; do not push application changes directly to `main`.
- Run `npm ci`, `npm test`, `npm run build`, `npm run architecture:graph -- --strict`, worker checks and the relevant Playwright acceptance on the exact candidate revision.
- Run authenticated browser acceptance only against the dedicated non-production Supabase project, disposable test accounts and exact allowlisted preview deployment host.
- Check the exact Vercel deployment and separate worker revisions/readiness before enabling a production capability.
- Do not replay ambiguous mutations without checking idempotency/completion state.
- Do not claim user productivity, time savings, accuracy or ROI without matched real-world measurement.

See [Architecture](architecture.md), [Engineering Capabilities](engineering-capabilities.md), [Playwright Runbook](playwright-e2e.md) and [Product Doctrine](product-doctrine.md).
