# AI Mechanical Engineering Assistant

A provider-neutral Engineering Workspace and Engineering Core, starting with Mechanical Engineering. The product turns engineering intent into usable, validated and traceable engineering outcomes—not plausible answers or files without proof.

**Core rule:** AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.

## Main-branch baseline — 22 October 2026

- Main is at [76425a0](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/76425a096d52c87741222645a65d616ff773460a), a documentation-only merge. The reviewed application-code baseline is [5da2823](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/5da2823ff7792cb23e9ae36b193cd627f2d4d7ba).
- Core CI, ESLint, CodeQL and Codacy passed on the reviewed code revision. These checks do not prove live provider readiness or broad engineering correctness.
- The latest reviewed live CAD acceptance run was [blocked during environment preflight](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39634636058) because CAD_WORKSPACE_BASE_URL was missing. Authenticated testing did not run; current-revision live CAD readiness is **not verified**.
- Existing source includes project/workspace persistence, provider-neutral routing, deterministic calculations, bounded cylindrical CAD/build123d, OCCT BREP validation, evidence/provenance contracts and reference/pilot numerical/FEA workflows.
- The selected assistant-ui + Vercel AI SDK streamed chat stack and interactive CAD/FEA/P&ID viewers are **planned**, not already integrated. Provider catalog entries do not mean their runtimes are deployed or accepted.

These are revision-specific observations; re-check exact source, deployed app/worker revisions and current workflow evidence before release.

## Current feature branch — 27 October 2026

The active implementation is tracked in [PR #121](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/121) and is not merged to `main`.

Implemented in that branch:
- A shared responsive Forge shell with route-aware workspace/project navigation, keyboard workspace search, mobile navigation and an authorized project-name label when project data loads.
- A review-before-create project flow. The review is derived only from submitted inputs; it does not invent an AI brief, technical assumptions, artifacts or approval.
- Explicit presentation for engineering proposal, execution, validation, verification, approval, failure and stale states.
- Draft-preserving recovery guidance when an intent request's final outcome is uncertain, plus a project-creation retry guard that requires checking the project list and explicit acknowledgement before retrying.
- The v11.2 design tokens, UX/component contracts, screen inventory, implementation prompt and source QA capture report under `docs/design/forge-v11.2/`.

Still blocked or not claimed:
- The original Vercel project’s automatic previews still fail before build events because its linked Supabase Marketplace resource `supabase-cerise-school` is suspended and points to a paused Supabase project. A separate protected recovery project now serves the Forge app; its latest recovery deployment is READY, but it is not a replacement for the original project’s integration.
- Four PR-triggered CI/security checks passed for branch head `0d65ba82fbde93c994be37c201e2884cda4615b7`. The authenticated Playwright run [40586963344](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/40586963344) failed at the shared project-list setup with “Durable authorization audit is unavailable.” The recovery Preview still needs the dedicated E2E Supabase `SUPABASE_SERVICE_ROLE_KEY` configured as a sensitive Preview-only variable.
- The isolated CAD worker URL and ephemeral artifact root are configured for the recovery Preview, but authenticated intent-to-verified-artifact acceptance has not run; the matching `CAD_WORKER_API_TOKEN` is still missing from Vercel Preview. Do not use production keys, data or cookies. Current visual/keyboard acceptance is not green while the shared persistence setup is blocked.
- M0's exit gate remains open. PR #121 stays draft. M1 streaming chat and M2–M4 CAD/FEA/P&ID viewers remain separate roadmap milestones.

## Start here

- [Product brief](docs/product-brief.md) — current product requirements and selected tools.
- [Implementation plan and milestones](docs/implementation-plan.md) — single source of truth for work priority and acceptance gates.
- [Documentation guide](docs/README.md) — canonical documents and focused runbooks.
- [Architecture and trust boundaries](docs/architecture.md) — system responsibilities and security boundaries.
- [Engineering capabilities and maturity](docs/engineering-capabilities.md) — implemented foundation versus pilot/experimental scope.
- [Product doctrine](docs/product-doctrine.md) — product promise, acceptance states and outcome economics.

Operational starting points: [verified CAD workspace](docs/v2-1-6-cad-verified-workspace.md), [Playwright/live acceptance](docs/playwright-e2e.md), [worker security](docs/worker-security.md), [provider promotion/benchmarks](docs/architecture/2026-10-14-provider-promotion-and-benchmark-gates.md) and [production migration reconciliation](docs/architecture/2026-10-17-production-migration-ledger-reconciliation.md).

## Development and trust boundaries

- Use a feature branch and pull request; do not push directly to main.
- Run npm ci, the relevant tests, npm run build, lint and architecture checks.
- Run live acceptance only against a dedicated non-production environment and database.
- Keep all provider credentials and service-role keys server-side. Never commit cookies or populated secrets.
- Long-running CAD/solver work belongs in bounded isolated workers, not the Next.js request process.
- Report a result as verified only when the capability-specific independent validator passed and retained evidence is bound to the exact artifact bytes and source/runtime lineage.
