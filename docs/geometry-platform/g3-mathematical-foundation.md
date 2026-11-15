# G3 — Native mathematical foundation

**Status:** Initial implementation candidate on a focused feature branch; G3 is not complete or promoted.

## Coordinate and unit contract
- Point coordinates and rigid-transform translations are millimetres.
- Direction vectors are dimensionless and normalized at line/plane/circle construction boundaries.
- Angles are radians.
- Rotation matrices are row-major, orthonormal and right-handed.
- Rigid-transform composition (A ∘ B) applies B first, then A.
- Default tolerance policy is 10^-6 mm linear and 10^-9 rad angular.
- Rigid-transform validation tolerance is dimensionless and capped at 10^-3; callers cannot disable orthonormality/handedness checks by supplying an arbitrarily loose tolerance.

## Implemented in this candidate slice
Finite-safe vector arithmetic, scaled vector normalization, dot/cross products and point distance; lines, planes and circles; point projection onto lines/planes; axis-aligned bounds and tolerance-aware containment; rigid-transform validation, point/vector transforms, composition and inversion.

Overflowing arithmetic fails explicitly rather than returning non-finite coordinates. Vector normalization is scale-aware: it does not reject a non-zero direction solely because its magnitude is below a fixed default epsilon.

## Deliberate exclusions
General curves/surfaces, robust geometric predicates, topology, solid construction, intersections, Boolean operations, persistent topology references and a B-rep kernel are not implemented here. This does not replace OCCT or build123d. Arbitrary unit conversion and dimensional quantity algebra remain outside this module.

## Verification gates
The candidate adds analytical, degeneracy, overflow, tolerance-boundary, deterministic metamorphic and transform-invariant tests. G3 remains incomplete until:
1. Exact-head TypeScript/unit/build and architecture checks pass.
2. Property-based tests cover randomized magnitude scales and adversarial near-degenerate inputs.
3. Differential fixtures compare declared operations against an independent reference implementation.
4. CI evidence is retained against the exact candidate commit.
5. No existing CAD, artifact, authorization, validation or persistence workflow regresses.

Passing these primitive tests is not CAD validation, engineering verification or design approval.
