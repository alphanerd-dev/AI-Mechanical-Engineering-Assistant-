# V2.2 — Physical Perception Foundation

## Scope

This increment introduces a provider-neutral contract for point-cloud provenance and bounded registration acceptance, plus an isolated Open3D worker prototype for point-cloud inspection and iterative closest point (ICP) registration. It does not yet provide an end-user scan-upload API or claim production perception readiness.

## Engineering lifecycle

Authorized scan source → bounded worker → measured cloud summary → registration candidate → host provenance checks → explicit acceptance criteria → engineering review.

The worker is a tool, not an authority. Host-owned code checks project/artifact identity and SHA-256 against trusted stored bytes, explicit coordinate frames, threshold criteria and review. A good ICP score cannot prove dimensional conformity or scan completeness.

## Input and measurement contract

- Supported initial formats: PLY, PCD and XYZ.
- Units must be explicitly declared as mm, cm, m or in and normalized to mm for reported measurements.
- Coordinate frame is an explicit identifier; the worker never infers world, fixture or part coordinates.
- Input paths are relative keys under a dedicated directory, not browser-supplied local paths or storage URLs.
- Limits: 256 MiB per file, 2,000,000 points, 32 KiB request, single-shot execution and no caller-supplied code.
- Traversal, symlink escape, unsupported formats, empty clouds, NaN/Inf coordinates, unknown request fields and changed input bytes fail closed.
- A signed URL is a transport credential, not an artifact identity.

## Registration acceptance

The prototype uses Open3D point-to-point ICP with an initial rigid transform, max correspondence distance and iteration cap. It returns fitness, inlier RMSE (mm), correspondence count, transform and source/reference digests.

The host acceptance API returns INCOMPLETE if provenance, transform, project isolation or criteria are invalid; FAIL if measured metrics miss explicit thresholds; PASS if those numeric criteria pass. Even PASS means only that this registration gate passed. The output remains a CANDIDATE and engineering design approval remains false.

## Promotion gates

1. Add known-transform fixtures with independent ground truth, noise and outlier cases.
2. Validate metrics and thresholds against representative scans; do not select production thresholds from synthetic self-registration alone.
3. Integrate uploads through authenticated project routes and private project-scoped storage with explicit file, point-count, time and retention limits.
4. Persist source hashes, exact worker/Open3D version, units, coordinate frames, transform and measurements.
5. Require an authorized review before registration informs CAD edits or safety-critical decisions.
