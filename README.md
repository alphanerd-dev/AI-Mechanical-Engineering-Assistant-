# AI Mechanical Engineering Assistant

A provider-neutral Engineering Workspace and Engineering Core, starting with Mechanical Engineering. The product goal is to turn engineering intent into deterministic, validated and traceable outcomes—not to generate plausible answers or CAD files without proof.

**Core rule:** AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.

## Current status — 22 October 2026

- Main baseline: [5da2823](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/5da2823ff7792cb23e9ae36b193cd627f2d4d7ba).
- [Core CI](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39644040159), ESLint, CodeQL and Codacy passed on the reviewed revision.
- The latest reviewed live CAD acceptance attempt was [blocked during environment preflight](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39634636058) because CAD_WORKSPACE_BASE_URL was missing. The authenticated smoke test did not run, so current-revision live CAD readiness is **not verified**.
- Durable execution code and migrations exist; production schema parity, deployed worker behavior and end-to-end recovery must be demonstrated before enabling the feature in production.

These are revision-specific observations, not permanent deployment guarantees. See the [implementation plan and milestone exit gates](docs/implementation-plan.md).

## Architecture

Engineering user → engineering workspace/project context → engineering core → capability router → bounded deterministic providers/workers → independent validation → artifact/evidence/provenance → authorized approval where required.

The application uses Next.js, React and TypeScript with Supabase for identity, project/workspace data and persistence. CAD and numerical work run through bounded provider/worker contracts. A provider being present or returning success does not make its output verified.

## Supported scope and limits

Repository capabilities include project-scoped workspace foundations, provider-neutral intent routing, deterministic engineering calculations, bounded CAD/build123d paths, independent OCCT BREP validation, evidence/provenance contracts and reference numerical/FEA workflows. The presence of these components does not mean every provider is provisioned or every workflow is live-verified.

The first priority is one complete, authenticated shaft-to-CAD outcome with a matching validation receipt and exact persisted artifact digest. Broader geometry, general structural safety claims and additional engineering domains stay behind separate acceptance gates.

## Start here

- [Implementation plan and milestones](docs/implementation-plan.md) — sole source of truth for current work and acceptance gates.
- [Product doctrine](docs/product-doctrine.md) — intended product experience and decision rules.
- [Architecture and trust boundaries](docs/architecture.md) — module responsibilities, states and evidence boundaries.
- [Verified CAD workspace contract](docs/v2-1-6-cad-verified-workspace.md) — exact artifact/receipt binding and validation scope.
- [Playwright and live CAD acceptance runbook](docs/playwright-e2e.md) — safe non-production test setup and current evidence.
- [Worker security policy](docs/worker-security.md) — required worker controls.
- [Provider promotion and benchmark gates](docs/architecture/2026-10-14-provider-promotion-and-benchmark-gates.md) — rules for accepting providers and source reuse.
- [Outcome baseline methodology](docs/outcome-baseline.md) — measuring accepted outcomes and engineering effort.
- [Durable execution E2E record](docs/plans/2026-10-17-durable-execution-e2e-validation.md) and [production migration reconciliation procedure](docs/architecture/2026-10-17-production-migration-ledger-reconciliation.md).

## Development

1. Use a feature branch and pull request; do not push directly to main.
2. Run npm ci and the relevant scripts in package.json.
3. Require CI and review of the diff before merging.
4. Run live acceptance only against the dedicated non-production environment and its dedicated database. Never put secrets in source or logs.
5. Describe an outcome as verified only when the relevant independent validator passed and the retained evidence is bound to the exact artifact bytes and source/runtime revision.