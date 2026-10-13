# Engineering Ecosystem Inventory

**Canonical working inventory:** ChatGPT Project Library → `AI Mechanical Engineering Assistant`  
**Repository:** https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-  
**Review baseline:** 10 October 2026; this index is updated 13 October 2026.

## Saved project-library artifacts

- `engineering-ecosystem-registry.csv` — consolidated master registry. The saved review reports 167 unique source URLs across the original and prior-chat resource lists. This is catalog coverage, not 167 validated integrations.
- `engineering-ecosystem-review.md` — source-based review, findings, candidate comparisons, licensing/security cautions and recommended pilots.
- The prior-chat review material is summarized in the consolidated report. If a source identity, license, current maintenance state, or original URL is unresolved, treat it as unapproved for code/data reuse until checked.

## How to use the inventory

The inventory is a **research and due-diligence backlog**, not a dependency manifest, endorsement, or integration status report. Before adopting a candidate, record:

1. Canonical URL and resolved repository/product identity.
2. Exact reviewed commit/tag and review date.
3. Code, model, and dataset license separately; confirm commercial use and distribution/hosting obligations.
4. Maintenance, dependency/security posture, supported runtimes and actual public interfaces.
5. Threat model, arbitrary-code execution, permissions, isolation and resource limits.
6. A project-owned provider contract and reproducible known-answer tests.
7. Decision: REFERENCE, PILOT, APPROVED, BLOCKED, DEFERRED or REJECTED, with evidence and reviewer.

## Initial pilot order

1. **Current bounded build123d + OCCT workflow:** close failure-path, provenance, byte-integrity, authorization and persistence gaps before widening scope.
2. **Provider acceptance and benchmark contract:** establish comparable criteria for geometry, calculations, FEA, and research retrieval.
3. **One candidate at a time:** compare a FreeCAD-specific adapter and a single open FEA stack against the current contracts; do not integrate overlapping agents in parallel.

## Non-negotiable gates

- Unknown license means no code or dataset reuse approval.
- README claims and badges are leads, not verification.
- Process success is not engineering correctness.
- A model confidence score is not a correctness guarantee.
- External agent/MCP code must not receive unrestricted host, filesystem, database or machine access.
- Learned physics surrogates remain separate from deterministic solver results and must expose training-data/model provenance and applicability limits.
- Safety-sensitive CAM, machine instructions, and manufacturing actions require explicit operator/approval controls and domain-specific validation.

See [Architecture](architecture.md), [Implementation Plan](implementation-plan.md), and [Artifacts and Evidence](artifacts-and-evidence.md).
