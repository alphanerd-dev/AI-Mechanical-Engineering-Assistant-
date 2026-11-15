# Source-bound shaft orthographic drawing generation

## Status
A deterministic preliminary SVG generator and authenticated API route have been implemented on the engineering-cycle branch. The route is not production-verified until both additive migrations are applied and authenticated E2E passes.

## Workflow
1. Require both TASK.EXECUTE and EVIDENCE.WRITE project permissions and confirm the session subject.
2. Resolve the requested geometry revision and reject it unless it is the current model head.
3. Load the accepted CAD completion and verify the canonical solid's artifact identity, validation receipt and source lineage.
4. Download the canonical BREP bytes from private storage and independently recompute SHA-256.
5. Derive nominal shaft diameter and length from the accepted geometry receipt's world-axis-aligned bounding box. The X/Y extents must agree within 0.02 mm; Z is the shaft length.
6. Generate an A4 landscape SVG with side/end views, nominal dimensions, source artifact reference and an explicit preliminary/not-for-manufacture warning.
7. Store the SVG privately, persist generator and source revision lineage, and write an audit event.
8. Return a short-lived signed URL. Repeated identical output for the same source revision/generator version resolves to the existing artifact.
9. Drawing history reports generated artifacts as stale when their source geometry revision is no longer the current head.

## Deliberate limitations
- Only cylindrical shaft geometry aligned to the world Z axis is supported.
- Only nominal diameter and length are dimensioned.
- No tolerances, datums, GD&T, surface finish, material callouts, fit specification, title-block approval, or drafting-standard conformance are claimed.
- The output is preliminary engineering communication, not a manufacturing or inspection release.
- General drawing generation from arbitrary B-rep topology remains future work.

## Verification requirements
- Generator unit tests and safe SVG-subset inspection.
- Migration tests for source FK, immutable revision/digest matching, current-head race guard and idempotent generated artifact index.
- Authenticated API integration tests covering authorization, stale revision, invalid receipt, source digest mismatch, upload/metadata/audit ambiguity and duplicate request replay.
- Visual acceptance on desktop and mobile before enabling the feature in the workspace.
