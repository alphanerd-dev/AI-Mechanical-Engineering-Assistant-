# Documentation Guide

This index points to the current product and operational contracts. It also distinguishes those contracts from historical decision records, dated acceptance reports and design-source artifacts.

## Canonical product and delivery documents

- [Product brief](product-brief.md) — current user experience, target users, chat/task separation and product scope.
- [Implementation plan and milestones](implementation-plan.md) — current status, next priorities, dependencies and exit gates.
- [Parallel development programme](parallel-development-programme.md) — coordinated workstreams for Engineering AI, CAD/CAE, manufacturing, product UX and the proprietary Geometry Platform.
- [Architecture and trust boundaries](architecture.md) — system layers, authorization, model boundaries, execution, validation and evidence.
- [Engineering capabilities and maturity](engineering-capabilities.md) — what is implemented, pilot, experimental or still unavailable.
- [Product doctrine](product-doctrine.md) — product promise, result states and feature acceptance rules.
- [Outcome baseline](outcome-baseline.md) — methodology for measuring accepted outcomes; do not infer savings from tests or fixtures.

## Architecture decision records

- [ADR — Renderer benchmark and abstraction](architecture/adr-2026-11-08-renderer-benchmark.md) — Babylon.js vs Three.js benchmark; WebGL 2 baseline; no production renderer selected yet.
- [ADR — OCCT-first hybrid geometry foundation](architecture/adr-2026-11-08-hybrid-geometry-foundation.md) — initial OCCT provider, provider adapters and canonical/display geometry separation; remains valid for the initial provider direction.
- [ADR — Proprietary geometry platform and progressive kernel ownership](architecture/adr-2026-11-08-proprietary-geometry-platform.md) — supersedes the earlier decision not to pursue a proprietary kernel; approves a product-owned platform and staged native algorithm development.
- [Geometry Platform Charter](geometry-platform/README.md) — ownership boundaries, repository placement, conformance suite and G0–G7 delivery sequence.
- [G2 Identity, Revision and Canonical Representation Design](geometry-platform/g2-identity-revision-design.md) — immutable geometry revision contract, artifact digest binding, concurrency and migration gates.
- [G2 Production and E2E Schema Audit](geometry-platform/g2-production-schema-audit.md) — read-only production/E2E schema comparison, artifact ownership, Storage/RLS contracts and migration-ledger blocker.
- [G0 Repository Audit](geometry-platform/g0-repository-audit.md) — current CAD architecture inventory, gaps, worker trust boundaries and G1 contract proposal.
- [ADR — Integrated engineering workspace strategy](architecture/adr-2026-11-08-integrated-engineering-workspace.md) — modular CAD/CAE/perception/manufacturing/lifecycle domains under shared engineering contracts.

These ADRs record accepted architectural directions. They do not imply that proposed libraries are installed, that candidate runtimes are production-ready or that planned capabilities have shipped. Current implementation status remains in the canonical documents above.

## Application, chat and acceptance

- [Next.js Engineering Workspace](nextjs-workspace.md) — routes, UI composition, dependency boundaries and development commands.
- [Conversational AI and model/provider stack](reasoning-model-provider-stack.md) — Gemini streamed chat and the distinct structured-reasoning transport.
- [Playwright and live acceptance](playwright-e2e.md) — protected non-production browser testing and evidence interpretation.
- [Engineering intent model transport](engineering-intent-model-transport.md) — structured intent interpretation contract.
- [Reasoning-framework architecture](engineering-reasoning-frameworks-architecture.md) — task/framework proposals and their trust boundary.
- [Reasoning hardening acceptance](reasoning-model-hardening-acceptance.md) — separate live provider acceptance for structured proposals.

## Engineering capabilities and runtime references

- [Verified CAD workspace](v2-1-6-cad-verified-workspace.md) — bounded cylinder/shaft flow, worker, artifact storage and OCCT receipt.
- [CAD correction loop](cad-correction-loop.md) — bounded correction and independent geometry validation.
- [Open FEA execution](fea-engine-v1.18.md) — Gmsh/CalculiX cantilever benchmark and solver limitations.
- [Persistent project workspace](v2-2-persistent-project-workspace.md) — Supabase project/workspace APIs, optimistic concurrency and isolation.
- [Physical perception foundation](v2-2-physical-perception.md) — isolated Open3D inspection/registration prototype; not a production scan-upload feature.
- [Execution layer](execution-layer.md) — durable job submission, leases, retries and worker contract.
- [Artifacts and evidence](artifacts-and-evidence.md) — provenance, evidence and information-status conventions.
- [Worker security](worker-security.md) — worker isolation, limits, allowlists and artifact handling.
- [Azure execution-worker deployment](deployment/azure-container-apps-execution-worker.md) — separate worker deployment runbook.

## Provider and research references

- [Engineering ecosystem inventory](engineering-ecosystem-inventory.md) and [candidate registry](architecture/engineering-ecosystem-registry.md) — research candidates, not approved or deployed integrations.
- [Provider promotion and benchmark gates](architecture/2026-10-14-provider-promotion-and-benchmark-gates.md) — licensing, benchmark, isolation and evidence criteria.
- [Production migration reconciliation](architecture/2026-10-17-production-migration-ledger-reconciliation.md) — controlled migration-history reconciliation procedure.

## Historical records and design-source files

Documents under `docs/architecture/adr-*`, `docs/plans/`, dated architecture records and `docs/design/forge-v11.2/` preserve the decision, design or implementation state at the time they were written. They are not automatically current product-status documents. Do not rewrite a historical ADR or acceptance record to make it appear that a later implementation existed at the time.

Use the canonical documents above for current status. When a capability, dependency, route, runtime, milestone or acceptance gate changes, update the relevant canonical contract and this index if the navigation changes.

## Documentation rules

1. Describe the current source and tested behavior, not intended or catalog-only capabilities.
2. Separate implementation presence, isolated test success, live provider readiness and production readiness.
3. Pin claims about acceptance to the tested commit, test path and environment.
4. Do not publish secrets, cookies, service-role keys, signed URLs or private test data.
5. Keep historical records intact; move current status into canonical docs rather than appending contradictory snapshots.
