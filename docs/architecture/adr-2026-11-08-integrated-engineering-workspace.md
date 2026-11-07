# ADR — Integrated engineering workspace product strategy

- **Status:** Accepted — product and architectural direction.
- **Decision date:** 8 November 2026
- **Owners:** Product and engineering architecture
- **Scope:** Product boundary, engineering capability domains and shared platform foundations.

## Context

The product has an implemented Next.js/React/TypeScript workspace, Supabase project identity and persistence, project-scoped conversational chat, a separate provider-neutral Engineering Core, deterministic calculation paths, bounded CAD generation/validation, a reference FEA worker and an isolated physical-perception prototype.

The product should become more valuable than a chat interface, isolated CAD viewer or loose collection of solver integrations. At the same time, implementing full CAD, CAE, robotics, manufacturing and industrial lifecycle systems simultaneously would create excessive delivery, validation and maintenance scope.

## Decision

Build an **integrated, modular engineering workspace** that coordinates engineering intent, design, analysis, simulation, manufacturing and engineering decisions through shared contracts and evidence.

The workspace has six capability domains:

1. **Engineering intelligence:** intent interpretation, reasoning, bounded planning, project context and controlled agent orchestration.
2. **CAD and geometry:** parametric authoring, parts/assemblies, interchange, topology, constraints and geometry validation.
3. **CAE and simulation:** structural, thermal, fluid and multibody analyses, with capability-specific numerical validation.
4. **Physical perception:** point clouds, scanning, inspection, registration and traceable Scan-to-CAD workflows.
5. **Manufacturing and industrial systems:** design for manufacturing, process planning, quality/inspection, maintenance and reliability.
6. **Engineering data and lifecycle:** artifact identity, BOMs, revisions, requirements, digital-thread relationships, evidence and approvals.

These are modular domains, not a commitment to deliver them concurrently. They share:
- project identity, authorization and workspace persistence;
- typed task/capability contracts and risk policy;
- provider-neutral execution adapters and isolated workers;
- canonical artifact identity, revisions and derivative lineage;
- independent validation, evidence/provenance and human approval;
- observability, recovery and measurable outcome economics.

## Product and system boundaries

- The conversational assistant remains the explanation, problem-framing and interaction surface. A chat response is not an executed engineering task or validated artifact.
- The Engineering Core remains the explicit path for registered deterministic capabilities. Models and agents propose or orchestrate bounded work; they do not become engineering authorities.
- CAD and CAE providers remain separate from the renderer. The viewer displays authorized artifacts and results; it does not execute CAD/solver work or decide validation state.
- Canonical engineering artifacts remain separate from display derivatives. The digital thread must preserve exact source, revision, checksum, provider/runtime and conversion lineage.
- A viewer or conversion failure must not change a canonical artifact's validation state.
- Human review and approval remain explicit for risk-bearing or release-critical decisions.

## Options considered

| Option | Advantages | Disadvantages | Decision |
|---|---|---|---|
| AI chatbot with a small set of engineering tools | Fast to build and simple to explain | Does not provide durable artifact lifecycle, cross-domain workflows or independent evidence | Insufficient as the long-term product |
| Standalone browser CAD/CAE viewer | Focused, easier to scope | Crowded category; does not coordinate engineering execution, validation or industrial workflows | Treat as a subsystem, not product strategy |
| Full monolithic CAD/CAE suite | Broad functionality in one product | Excessive scope, coupled release cycles and difficult provider/license maintenance | Reject |
| Modular integrated engineering workspace | Shared project/artifact/evidence model with independently staged capability domains | Requires disciplined shared contracts and phased integration | Adopt |

## Delivery strategy

The cross-cutting implementation milestones are:
- **M2:** shared artifact contracts, viewer registry, 3D renderer benchmark, interactive CAD visualization and drawing-viewer foundation.
- **M3:** scientific mesh and FEA result visualization, with field fidelity, units and numerical evidence kept separate from rendering.
- **M4:** typed P&ID/PFD data model and diagram viewer.
- **M5:** an evidence-backed end-to-end provider pilot selected from demonstrated user demand.

The strategic product capability roadmap is:
- **V2.0:** bounded autonomous engineering workspace, building on the existing Engineering Core and artifact-aware orchestration.
- **V2.1:** multi-CAD interoperability through provider adapters.
- **V2.2:** physical perception and traceable Scan-to-CAD.
- **V2.3:** advanced CFD.
- **V2.4:** multibody dynamics and robotics.
- **V2.5:** electromechanical integration.

M2 is the immediate foundation priority. V2.0 expands only in bounded, capability-specific workflows and must not enable unrestricted model-driven execution. The V2.x directions are targets, not claims of completed releases.

## Consequences

### Positive
- Gives the product a coherent strategic identity beyond chat or visualization.
- Reuses the current Engineering Core, project boundary and validation/evidence doctrine.
- Enables capability domains to be developed and integrated independently.
- Makes CAD-to-CAE and other cross-domain workflows traceable through shared artifacts.
- Keeps AI reasoning, deterministic execution, visualization and engineering approval separate.

### Negative / costs
- Shared artifact and lineage contracts require careful design and migration of existing records.
- Each new provider/domain requires licensing, deployment, security, conformance and evidence work.
- End-to-end workflows inherit the weakest upstream capability; one successful step cannot certify the whole chain.
- Product value and economics must be measured on matched engineering tasks rather than inferred from feature count.

## Success measures

Measure total cost per accepted engineering outcome, net engineering time saved, time to first accepted result, validation completeness, recovery quality, rework and repeat use. The current real-world outcome baseline remains **NOT MEASURED** until matched user trials are performed.

## Follow-up actions

1. Preserve existing product doctrine and trust boundaries.
2. Complete M2 artifact contract audit and renderer benchmark before selecting a production renderer.
3. Implement one connected CAD-to-CAE pilot with exact artifact lineage and independent validation.
4. Promote capability domains only after their user workflow, license/security, runtime, benchmark and evidence gates pass.
5. Update canonical product/architecture documents when actual source implementation or tested maturity changes.

## Related documents

- [Product Doctrine](../product-doctrine.md)
- [Product Brief](../product-brief.md)
- [Architecture](../architecture.md)
- [Implementation Plan](../implementation-plan.md)
- [Engineering Capabilities](../engineering-capabilities.md)
