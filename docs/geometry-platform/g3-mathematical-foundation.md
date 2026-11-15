# G3 — Native mathematical foundation

**Status:** Initial implementation slice on the engineering-cycle branch; G3 is not complete.

## Coordinate and unit contract
- Point coordinates and rigid-transform translations are millimetres.
- Direction vectors are dimensionless and normalized at line/plane/circle construction boundaries.
- Angles are radians.
- Rotation matrices are row-major, orthonormal and right-handed.
- Rigid-transform composition (A \circ B) applies (B) first, then (A).
- Default tolerance is (10^{-6}) mm linear and (10^{-9}) rad angular; callers may supply a named policy.

## Implemented in this slice
Finite-safe vector arithmetic, dot/cross products, overflow-aware result checks, scale-stable normalization for very large finite vectors and point distance; lines, planes and circles; point projection onto lines/planes; axis-aligned bounds and tolerance-aware containment; rigid-transform validation, point/vector transforms, composition and inversion. The primitive test suite also covers unrepresentable arithmetic results and inclusive tolerance boundaries.

## Deliberate exclusions
General curves/surfaces, robust predicates, topology, solid construction, intersections, Boolean operations, persistent topology references and a B-rep kernel are not implemented here. This does not replace OCCT or build123d. Arbitrary unit conversion and dimensional quantity algebra remain outside this module.

## Promotion gates
G3 completion still requires property-based/metamorphic and differential fixtures against an independent reference, large/small magnitude and tolerance-boundary coverage, and exact-head CI. Passing primitive tests is not engineering verification or design approval.
