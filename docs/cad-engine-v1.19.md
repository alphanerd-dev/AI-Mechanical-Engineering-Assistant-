# V1.19 — CAD validation, regression, diff and deterministic judging

V1.19 turns CAD validation from a single pass/fail geometry check into a structured measurement and comparison layer.

    Measured CAD geometry
            |
            +--> CAD.DIFF ----------------> structured geometry changes
            |
            +--> CAD.COMPARE -------------> regression tolerance result
            |
            +--> CAD.CHECK_WALL_THICKNESS -> explicit wall limit check
            |
            +--> CAD.CHECK_DFM -----------> explicit manufacturability-rule checks
            |
            +--> CAD.JUDGE ---------------> deterministic candidate ranking

## Engineering rule

The V1.19 layer only evaluates measurements supplied by a geometry provider. It does not infer missing geometry properties.

- Missing measurement -> INCOMPLETE
- Explicit rule violated -> FAIL
- Explicit rule satisfied -> PASS

Passing a geometry or DFM check is not equivalent to declaring a product safe or fully manufacturable.

## Geometry snapshot

A CADGeometrySnapshot identifies the artifact/backend and carries measured metrics such as volume, surface area, bounding box, solid count, watertightness, minimum wall thickness, overhang angle and mesh triangle count.

## Regression and diff

CAD.DIFF reports structured metric changes and optional source-hash changes.

CAD.COMPARE evaluates a baseline and candidate against explicit absolute and/or relative tolerances. No default tolerances are assumed.

## DFM

V1.19 supports measured checks for minimum wall thickness, maximum overhang angle, watertightness, envelope limits, and minimum solid count.

These are individual checks, not a universal manufacturability claim.

## Deterministic judging

CAD.JUDGE supports mandatory DFM criteria plus weighted minimization/maximization criteria. The winner is selected only from eligible candidates and only from explicitly supplied measurements.

The next integration target is connecting real OCCT/FreeCAD/CADGate-style measurement runtimes to these contracts.