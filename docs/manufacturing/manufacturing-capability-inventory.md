# Manufacturing capability inventory and first workflow

**Review date:** 13 November 2026  
**Implementation branch:** `feat/manufacturing-readiness-pilot`  
**Status convention:** Implemented means deterministic code and tests exist; Pilot means a bounded provider capability is registered and test-covered; Experimental means a provider boundary or limited evaluation exists but is not production-integrated; Research-only means no executable product capability is present.

## Capability inventory

| Capability | Current implementation | Classification | Evidence and boundary |
|---|---|---|---|
| Process-plan validation | Validates operation identity, process type, sequence continuity, predecessor references and acceptance criteria | Pilot | `src/manufacturing/validation.ts`; `tests/manufacturing.test.ts` |
| Inspection acceptance | Compares an explicit measured value against nominal/tolerance or one-sided limits; rejects implicit unit conversion | Pilot | `src/manufacturing/validation.ts`; unit, tolerance and rejection tests in `tests/manufacturing.test.ts` |
| Geometry DFM | Evaluates explicit measured wall thickness, overhang, watertightness, envelope and solid-count rules | Pilot | `src/cad/dfm.ts`, `src/manufacturing/dfm.ts`; `tests/v1-19.test.ts`, `tests/v1-21.test.ts` |
| BOM generation | Aggregates repeated part/revision lines deterministically and validates quantity, unit and identity | Pilot | `src/manufacturing/bom.ts`; `tests/v1-21.test.ts` |
| Manufacturing economics | Estimates material, setup/cycle time, machine and labour cost from explicit rates | Experimental | `src/manufacturing/estimation.ts`; missing/invalid rates fail closed |
| Manufacturing release gate | Evaluates process plan, BOM, artifact linkage and explicit human approval | Experimental | `src/manufacturing/release.ts`; no MES/ERP release action or durable release record |
| Manufacturing evidence bridge | Creates in-memory process/inspection artifacts and verified evidence only after acceptance | Pilot | `src/manufacturing/evidence-bridge.ts`; `tests/manufacturing.test.ts` |
| CAM / additive slicing | Provider boundary exists but reports `UNAVAILABLE` without a configured toolpath runtime | Experimental boundary | `src/providers/cam-boundary.ts`; `tests/v1-21.test.ts` |
| Machine capability matching and scheduling | No machine-resource catalog, capability matching, capacity scheduling or dispatch implementation found | Research-only | `workCenter` is currently descriptive plan metadata, not a machine resource model |
| Quality nonconformance / corrective action | No persistent NCR, disposition, corrective-action or calibrated metrology workflow found | Research-only | Inspection evaluation is a single deterministic acceptance check |
| ERP / MES / supplier integration | No production order, inventory, supplier, purchasing or shop-floor execution integration found | Research-only | No external system action is performed |
| Maintenance / reliability intelligence | No integrated asset telemetry, failure-mode or maintenance work-order workflow in the manufacturing provider | Research-only | Predictive-maintenance integration remains a separate research candidate |

## First bounded workflow: machined-part manufacturing readiness

The first workflow composes existing deterministic capabilities into one release-readiness assessment:

1. Evaluate measured CAD geometry against explicit DFM rules.
2. Validate the manufacturing process plan and operation dependencies.
3. Generate and structurally validate the BOM.
4. Evaluate one explicit inspection criterion and measured result.
5. Verify that every required CAD/BOM artifact is linked to the process plan or BOM and included in the release bundle.
6. Return `READY_FOR_HUMAN_APPROVAL`, `BLOCKED` or `INCOMPLETE` with the underlying checks and reasons.

The new capability is `MANUFACTURING.ASSESS_READINESS`, routed through `manufacturing.intelligence`.

### Safety and scope boundaries

- The workflow is deterministic; an LLM may help prepare inputs but does not determine acceptance.
- It never executes CAM toolpaths, machine instructions, additive slicing, MES dispatch or production release.
- It never treats a readiness result as a signed quality certificate.
- `productionReleasePerformed` is always `false`; a human approval is still required.
- The current workflow is stateless. Durable inspection/release records and audit journaling are separate future work and require schema/authorization review.

## Next increments

1. Verify the new readiness workflow through exact-head CI and provider-router tests.
2. Add durable inspection and release records only after migration-history reconciliation in issue #145 and an E2E rehearsal.
3. Add a machine capability model (process, work envelope, material, tooling, tolerances, availability) before attempting scheduling.
4. Add a nonconformance workflow with explicit disposition and corrective-action evidence.
5. Integrate CAM only after a real, sandboxed toolpath provider is configured and independently validated.
6. Connect ERP/MES systems only through provider-neutral adapters, project-scoped authorization and human approval gates.
