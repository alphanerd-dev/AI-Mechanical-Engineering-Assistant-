# Product Brief — AI Mechanical Engineering Assistant

**Product category:** AI-assisted Mechanical Design Verification Workspace  
**Positioning anchor:** Engineering outcomes, not engineering overhead.  
**Review date:** 27 November 2026  
**Status:** Product direction adopted for focused validation; initial workflow and commercial fit remain hypotheses.

## 1. Product definition

The AI Mechanical Engineering Assistant helps mechanical engineers turn design requirements and supported engineering inputs into review-ready work packages containing calculations, supported geometry outputs, explicit checks and traceable evidence—while keeping engineering judgment and final approval with the responsible engineer.

It is a workflow product, not a generic engineering chatbot, a replacement for CAD/CAE/PLM, or an autonomous design authority. It should complement existing engineering tools and reduce the effort required to move from an engineering request to a defensible result.

> **Engineering outcomes, not engineering overhead.**

The product is differentiated by the connected workflow and its trust model—not by claiming a new LLM, CAD kernel, solver or universal engineering agent.

## 2. Target customers, users and buyers

These are initial customer hypotheses to validate, not established product-market fit.

| Role | Initial hypothesis |
|---|---|
| Primary customer | Small and mid-sized mechanical engineering consultancies, machine builders and OEM suppliers with recurring component design/review work |
| Primary user | Mechanical/design engineer preparing or reviewing a component design package |
| Economic buyer | Engineering manager, consultancy owner or engineering lead |
| Candidate use frequency | Repeatable engineering calculations, geometry preparation, design checks and review-package preparation |

The first customer segment may change if interviews and observed workflows show that another group has a more frequent, costly and budget-backed problem.

## 3. Job to be done and product outcome

**Job to be done:** Move from fragmented design requirements, engineering inputs and existing files to a review-ready work package with fewer repetitive preparation steps and avoidable handoffs.

**Primary outcome:** An engineer-accepted review package produced with less total effort, without reducing engineering quality, evidence quality or traceability.

The product must measure the total work required to reach an accepted result, including correction, review and rework. A fast calculation that moves work to the reviewer is not a successful outcome.

## 4. Initial workflow hypothesis

The leading candidate is a **rotating-equipment / shaft design-review package** for small mechanical consultancies, machine builders and OEM suppliers.

A preliminary candidate task is to prepare a shaft design-review package from specified power/torque, rotational speed, loading, material and geometry requirements. The current shaft calculation scope is limited: preliminary static-yield sizing is not complete shaft verification. Fatigue, deflection, critical speed, keyway checks, stress concentrations and other checks must be explicitly marked unsupported until implemented and independently accepted.

Do not lock the shaft workflow as the permanent market wedge yet. Customer discovery must compare it with at least two other recurring mechanical engineering workflows observed in actual practice. The selected first workflow must be frequent, painful, measurable, feasible with the current architecture and supported by a buyer willing to pilot it.

## 5. Core task journey

The product should present one coherent task-oriented experience. Conversation is a useful input and clarification method, but it is not the whole product. Guided forms, supported file intake and contextual engineering views should be available where they reduce effort or ambiguity.

1. **Intake:** Start from a guided request, conversation or supported engineering file. Capture requirements, units, loading, materials, geometry, service conditions and the design basis.
2. **Clarify:** Ask only for missing inputs that materially affect the task. Label assumptions and unknowns; never silently invent critical engineering data.
3. **Plan:** Present the proposed calculations, geometry operations, explicit checks, unsupported analyses, expected outputs and execution limits. Obtain authorization where required.
4. **Execute:** Run only registered, typed and permission-controlled capabilities through bounded workers. Preserve input and output versions.
5. **Check:** Run independent unit/dimensional, formula/reference, geometry and workflow-specific checks. A passing check proves only its declared criteria.
6. **Package:** Produce a review package containing inputs, units, assumptions, calculation method, outputs, geometry references, checks, exceptions, versions and provenance.
7. **Review:** Let the responsible engineer review, request changes or record an authorized decision. The product records review; it does not certify the design.

## 6. Current implementation baseline and maturity

The repository contains a substantive application and engineering foundation, but implementation maturity varies by capability.

| Area | Current baseline | Important boundary |
|---|---|---|
| Application | Next.js 16, React 19, TypeScript, Supabase SSR/Auth/Postgres/storage, assistant-ui and Vercel AI SDK | This foundation is not yet a complete customer workflow |
| Chat and task execution | Project-scoped conversational chat and a separate Engineering Core task surface | Chat does not currently dispatch privileged engineering tasks or mutate engineering projects |
| Calculations | Shaft torque, preliminary solid-shaft static-yield sizing, pump hydraulic/shaft-power calculations, unit/dimensional checks and constrained numerical methods | Shaft sizing is not complete design verification; method and unsupported checks must remain visible |
| CAD / geometry | Bounded build123d authoring, isolated OCCT BREP/STEP inspection and tessellation, independent BREP validation, GLB validation, read-only viewport, drawing ingestion and immutable geometry revisions | This is a bounded CAD path, not a general parametric CAD API or a proprietary kernel |
| FEA | Gmsh/CalculiX reference/pilot workflow | The reported cantilever displacement error is 29.63% against a 30% tolerance: a marginal pass, not broad solver qualification |
| CFD | OpenFOAM 14 plane-Poiseuille analytical benchmark worker/provider | One bounded benchmark; not a general production CFD workflow exposed end to end |
| Manufacturing | Readiness assessments and durable human APPROVED/REJECTED decision records | No CAM execution, MES dispatch, machine control or automatic production release |
| Perception | Isolated Open3D inspection/registration prototype | Not a production scan-upload or perception workflow |

**Repository and M2 status at review:** the product review inspected main at `c1c9de6cd9a940b7d73d557d29a2ec71b158e0e4`. PR [#188](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/188) was open and unmerged. Its description reports 175 test files and 1,006 tests passed plus other CI checks, but those are PR-author-reported checks, not independently rerun by the product review. M2 is not accepted: authenticated artifact/drawing and live viewport acceptance were not dispatched, the branch lacked its dedicated CAD worker URL, the exact-head deployment was blocked by a deployment quota, and physical desktop/Android benchmark trials had not been run. See the Implementation Plan and M2 status record for the exact boundary.

One authenticated production shaft-torque canary was previously completed and read back, then disabled. Durable production execution remains feature-gated; the production worker remains Manual with no schedule. This does not establish broad production availability of engineering execution.

## 7. First-release must-haves

- One complete, authenticated, task-oriented workflow from intake through review-ready package.
- Structured inputs with units, materials, constraints, load cases and required design basis.
- Explicit method/formula references and declared design criteria; no invented standards-compliance claims.
- Bounded, typed and reproducible calculation/geometry execution with clear failure states.
- Independent checks with known-answer/reference fixtures and declared tolerances.
- Supported geometry outputs only, with exact source/revision/digest lineage and independent validation where applicable.
- Review package exportable outside the application.
- Assumptions, missing data, unsupported checks, exceptions and limitations clearly displayed.
- Human review/approval records bound to the exact task and artifact revision.
- Secure project isolation, controlled workers, safe recovery and usable desktop/mobile web experience.
- A measured reduction in total engineer effort per accepted outcome in a real pilot.

## 8. Explicit first-release non-goals

- Replacing established CAD, CAE, PLM or engineering design authorities.
- A general-purpose autonomous engineering platform.
- A proprietary general-purpose CAD kernel as a first-release dependency or replacement for OCCT.
- Arbitrary FEA/CFD across geometries and physics.
- CAM toolpath execution, MES dispatch, PLC control or direct machine control.
- Robotics, embedded systems and industrial IoT as launch scope.
- Autonomous design certification, safety sign-off or universal standards-compliance claims.
- Broad provider catalogues or additional orchestration frameworks without demonstrated user need.

The existing Geometry Platform programme may continue as a separate, staged R&D workstream under its accepted ADR and conformance gates. It must not block the selected product workflow, duplicate the existing artifact/identity foundation or be presented as a launch capability before it qualifies.

## 9. Architecture and trust model

The governing operating doctrine is:

> **AI coordinates. Engineering tools execute. Independent checks assess. Evidence records. Engineers approve.**

- AI interprets intent, uses authorized context, identifies missing inputs and proposes a bounded plan. It does not invent design data or own engineering authority.
- Calculations, geometry operations and simulations use typed, versioned, permission-controlled capabilities and isolated workers. No arbitrary model-generated shell or Python execution is permitted in the product path.
- Independent checks assess explicit requirements, units, boundary conditions, benchmarks, solver convergence and workflow acceptance criteria.
- Evidence records inputs, assumptions, material data, method/standard selection, tool versions, geometry revision, solver configuration, check results, limitations and reviewer actions.
- Qualified human reviewers retain responsibility for design judgment, deviations, acceptance and release.
- Autonomy scales with risk. Ambiguous requirements, consequential actions, controlled engineering data and external release require confirmation or approval.
- Failures are explicit. Missing inputs, unsupported geometry, failed checks, solver instability and worker failures must never become a misleading green result.
- The experience hides unnecessary provider and subsystem complexity while retaining engineering detail needed for review.
- Existing CAD/CAE methods and file formats are complemented, not displaced.
- The north-star measure is total cost and elapsed time per accepted engineering outcome.

## 10. Roadmap and decision gates

The release plan is gate-based. Dates and broad capability versions do not override evidence.

| Stage | Focus | Exit gate |
|---|---|---|
| 0. Validate | Interview engineers and buyers; observe real workflows; compare the shaft candidate with at least two alternatives; measure current effort and quality | One frequent, painful, measurable workflow and a credible buyer/pilot commitment are identified |
| 1. Close the workflow | Complete one authenticated end-to-end task, supported calculations/geometry, independent checks, evidence package and human review | A real user can complete the selected task in staging; evidence persists; failures are visible; all declared checks are independently exercised |
| 2. Design-partner pilot | Run matched conventional and product-assisted tasks with 2–3 design partners | Repeat use, reviewer acceptance and net time/effort improvement without quality or traceability regression; credible paid-pilot interest |
| 3. Narrow commercialisation | Harden onboarding, permissions, support, exports, billing and team workflow around the selected task | Paid usage or concrete procurement progress, repeatable onboarding and credible unit economics |
| 4. Selective expansion | Add adjacent calculations, components, CAD/CAE providers or workflows | Retention, repeat use, buyer demand and measured economics justify each expansion |

Longer-term directions—multi-CAD, broader FEA/CFD, physical perception, manufacturing, dynamics, robotics and electromechanical workflows—remain modular options, not launch commitments. Add only where customer evidence and capability-specific acceptance justify them.

## 11. Business model hypothesis

Test individual-engineer and team subscriptions with controlled workflow/compute limits. Consider enterprise pricing only when integrations, governance, support or private deployment requirements justify it. Pricing and willingness to pay are unvalidated hypotheses; do not infer them from positive feedback alone.

## 12. Success measures

**North-star metric:** total engineer effort and cost per accepted engineering outcome.

Track:
- Net engineer time saved, including correction and review effort.
- First-pass reviewer acceptance without material rework or missing evidence.
- Rework rate and severity.
- Time from complete inputs to a reviewable result.
- Input clarification cycles and missing-input frequency.
- Repeat use of the same workflow.
- Pilot-to-paid conversion and the reason for conversion/non-conversion.
- Cost per accepted outcome, including model, compute, infrastructure, license, support and review costs.

The real-world outcome baseline remains **NOT MEASURED** until matched task trials are collected. Automated tests, benchmark fixtures and model usage are not evidence of customer productivity or willingness to pay.

## 13. Canonical references

- [Product Doctrine](product-doctrine.md)
- [Implementation Plan](implementation-plan.md)
- [Customer Validation and Pilot Plan](customer-validation-plan.md)
- [Product Experience and Architecture Alignment](product-experience-and-architecture-alignment.md)
- [Architecture and Trust Boundaries](architecture.md)
- [Engineering Capabilities and Provider Maturity](engineering-capabilities.md)
- [Outcome Baseline Method](outcome-baseline.md)
- [M2.2–M2.6 Implementation Status](m2-2-to-m2-6-implementation-status.md)
