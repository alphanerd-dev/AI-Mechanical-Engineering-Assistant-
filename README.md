# AI Mechanical Engineering Assistant

A provider-neutral Engineering Workspace and Engineering Core, starting with Mechanical Engineering. The product turns engineering intent into usable, validated and traceable engineering outcomes—not plausible answers or files without proof.

**Core rule:** AI proposes. Deterministic engineering systems execute. Validation decides. Evidence proves.

## Current status — 22 October 2026

- Main is at [76425a0](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/76425a096d52c87741222645a65d616ff773460a), a documentation-only merge. The reviewed application-code baseline is [5da2823](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/commit/5da2823ff7792cb23e9ae36b193cd627f2d4d7ba).
- Core CI, ESLint, CodeQL and Codacy passed on the reviewed code revision. These checks do not prove live provider readiness or broad engineering correctness.
- The latest reviewed live CAD acceptance run was [blocked during environment preflight](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/39634636058) because CAD_WORKSPACE_BASE_URL was missing. Authenticated testing did not run; current-revision live CAD readiness is **not verified**.
- Existing source includes project/workspace persistence, provider-neutral routing, deterministic calculations, bounded cylindrical CAD/build123d, OCCT BREP validation, evidence/provenance contracts and reference/pilot numerical/FEA workflows.
- The selected assistant-ui + Vercel AI SDK streamed chat stack and interactive CAD/FEA/P&ID viewers are **planned**, not already integrated. Provider catalog entries do not mean their runtimes are deployed or accepted.

These are revision-specific observations; re-check exact source, deployed app/worker revisions and current workflow evidence before release.

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
