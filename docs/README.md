# Documentation Guide

Use the current product and operational contracts below. Historical release-by-release notes that duplicated these contracts have been removed from the working documentation; Git history retains the prior documents.

## Canonical product and delivery documents

- [Product brief](product-brief.md) — agreed user experience, model stack, visualization scope, trust boundaries and exclusions.
- [Implementation plan and milestones](implementation-plan.md) — single source of truth for next work, acceptance gates, blockers and status.
- [Architecture and trust boundaries](architecture.md) — module responsibilities, authorization, deterministic execution and validation.
- [Engineering capabilities and maturity](engineering-capabilities.md) — current capability families, providers and evidence limitations.
- [Product doctrine](product-doctrine.md) — product promise, decision-state rules, outcome economics and feature acceptance gate.
- [Outcome baseline](outcome-baseline.md) — methodology for measuring useful accepted outcomes and engineering effort.

## Engineering and runtime references

- [Verified CAD workspace](v2-1-6-cad-verified-workspace.md) — bounded cylindrical CAD flow, private artifact storage, OCCT receipt binding, readiness and live acceptance.
- [CAD correction loop](cad-correction-loop.md) — bounded correction/retry policy and independent geometry validation.
- [Open FEA execution](fea-engine-v1.18.md) — Gmsh/CalculiX pilot boundary and solver limitations.
- [Persistent project workspace](v2-2-persistent-project-workspace.md) — Supabase project/workspace APIs, optimistic concurrency and project isolation.
- [Physical perception foundation](v2-2-physical-perception.md) — point-cloud provenance and registration prototype; not production perception approval.
- [Artifacts and evidence](artifacts-and-evidence.md) — evidence and information-status conventions.
- [Execution layer](execution-layer.md) — durable execution and idempotency contract.
- [Worker security](worker-security.md) — isolation, allowlists, limits and artifact handling.
- [Playwright and live acceptance](playwright-e2e.md) — safe non-production setup and current acceptance evidence.
- [Azure execution-worker deployment](deployment/azure-container-apps-execution-worker.md) — worker deployment runbook.
- [Durable execution E2E record](plans/2026-10-17-durable-execution-e2e-validation.md) — historical evidence from the dedicated E2E database.
- [Production migration reconciliation](architecture/2026-10-17-production-migration-ledger-reconciliation.md) — controlled migration-history reconciliation procedure.

## AI, providers and research

- [Reasoning-model provider stack](reasoning-model-provider-stack.md) — selected chat UI/SDK/endpoint direction and model-cost gates.
- [Intent-model transport](engineering-intent-model-transport.md) — existing bounded model-backed intent interpretation and its separate configuration.
- [Reasoning-framework architecture](engineering-reasoning-frameworks-architecture.md) — task/framework proposals and their trust boundary.
- [Reasoning hardening acceptance](reasoning-model-hardening-acceptance.md) — proposal provenance and live-provider acceptance limitations.
- [Provider promotion and benchmark gates](architecture/2026-10-14-provider-promotion-and-benchmark-gates.md) — licensing, isolation, benchmark and evidence requirements.
- [Engineering ecosystem inventory](engineering-ecosystem-inventory.md) and [candidate registry](architecture/engineering-ecosystem-registry.md) — research backlog, not installed or approved integrations.

## Documentation rule

Update the product brief when the intended experience or selected technology changes. Update the implementation plan when priority, sequence, status or exit criteria change. Keep provider-specific operational detail in a focused runbook only when it is needed to deploy, secure, test or maintain that provider. Do not add a dated milestone document when its durable contract belongs in one of the current references above.
