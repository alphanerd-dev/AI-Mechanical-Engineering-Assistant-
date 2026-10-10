#!/usr/bin/env python3
"""Read-only OpenCascade BREP validator.

Protocol: one bounded JSON request on stdin -> one JSON validation result on stdout.
The request may name only a BREP file within CAD_ARTIFACT_DIR. This process does not
execute CAD source, mutate shapes, repair geometry, or write to the artifact mount.
"""

import json
import math
import os
import pathlib
import sys

from build123d import import_brep

MAX_REQUEST_BYTES = 16_384
MAX_ARTIFACT_BYTES = 100 * 1024 * 1024
VALIDATOR_ID = "occt.brepcheck"
VALIDATOR_VERSION = "build123d-0.13.0/OCCT-BRepCheck"


def result(valid, solid_count=0, warnings=None, **metrics):
    return {
        "valid": bool(valid),
        "solidCount": int(solid_count),
        "checkedBy": VALIDATOR_ID,
        "validatorVersion": VALIDATOR_VERSION,
        "warnings": list(warnings or []),
        **metrics,
    }


def fail(message):
    print(json.dumps(result(False, warnings=[message])))
    return 0


def finite_positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def main():
    raw = sys.stdin.read(MAX_REQUEST_BYTES + 1)
    if len(raw.encode("utf-8")) > MAX_REQUEST_BYTES:
        return fail("Validation request exceeds the 16384-byte limit.")
    try:
        request = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return fail("Validation request is not valid JSON.")
    if not isinstance(request, dict):
        return fail("Validation request must be a JSON object.")

    artifact_path = request.get("artifactPath")
    if not isinstance(artifact_path, str) or not artifact_path.startswith("/artifacts/"):
        return fail("artifactPath must identify a file inside /artifacts.")
    supplied_name = pathlib.PurePosixPath(artifact_path).name
    if supplied_name != artifact_path.removeprefix("/artifacts/") or not supplied_name.lower().endswith(".brep"):
        return fail("Only a direct-child BREP filename is accepted.")

    try:
        root = pathlib.Path(os.environ.get("CAD_ARTIFACT_DIR", "/artifacts")).resolve(strict=True)
        candidate = (root / supplied_name).resolve(strict=True)
        candidate.relative_to(root)
        if candidate.parent != root or not candidate.is_file():
            return fail("The BREP artifact is not a regular direct-child file.")
        if candidate.stat().st_size <= 0:
            return fail("The BREP artifact is empty.")
        if candidate.stat().st_size > MAX_ARTIFACT_BYTES:
            return fail("The BREP artifact exceeds the 100 MiB validation limit.")
    except (OSError, ValueError) as exc:
        return fail("The BREP artifact could not be resolved safely: " + str(exc))

    warnings = []
    try:
        shape = import_brep(str(candidate))
        if shape is None or shape.is_null:
            return fail("The BREP file imported as a null shape.")

        solid_shapes = list(shape.solids())
        solid_count = len(solid_shapes)
        topology_valid = bool(shape.is_valid)
        solid_validity = [bool(solid.is_valid) for solid in solid_shapes]
        volume_mm3 = float(shape.compute_volume())
        if not topology_valid:
            warnings.append("OpenCascade BRepCheck_Analyzer reported invalid topology or geometry.")
        if solid_count != 1:
            warnings.append("A single-solid part was required; found " + str(solid_count) + " solids.")
        if solid_count and not all(solid_validity):
            warnings.append("At least one extracted solid failed OpenCascade BREP validity checks.")
        if not math.isfinite(volume_mm3) or volume_mm3 <= 0:
            warnings.append("The imported shape has no finite positive volume.")

        bounds = shape.bounding_box().size
        bounding_box_mm = {
            "x": float(bounds.X),
            "y": float(bounds.Y),
            "z": float(bounds.Z),
        }
        if not all(math.isfinite(v) and v > 0 for v in bounding_box_mm.values()):
            warnings.append("The shape has invalid or degenerate 3D bounding-box dimensions.")

        dimension_checks = []
        dimension_checks_complete = False
        measured_volume_matches_expected = False
        expected = request.get("expected")
        if expected is None:
            warnings.append("Expected geometry constraints are required for this validator.")
        elif not isinstance(expected, dict):
            warnings.append("Expected geometry constraints must be a JSON object.")
        else:
            kind = expected.get("kind")
            tolerance_mm = expected.get("toleranceMm", 0.01)
            if not finite_positive(tolerance_mm) or tolerance_mm > 1:
                warnings.append("Geometry tolerance must be greater than 0 and no more than 1 mm.")
            elif kind == "CYLINDER":
                diameter_mm = expected.get("diameterMm")
                length_mm = expected.get("lengthMm")
                if not finite_positive(diameter_mm) or not finite_positive(length_mm):
                    warnings.append("Cylinder diameter and length must be finite positive millimetre values.")
                else:
                    checks = [
                        ("x", float(diameter_mm)),
                        ("y", float(diameter_mm)),
                        ("z", float(length_mm)),
                    ]
                    for axis, expected_value in checks:
                        actual_value = bounding_box_mm[axis]
                        passed = math.isclose(
                            actual_value,
                            expected_value,
                            rel_tol=1e-6,
                            abs_tol=float(tolerance_mm),
                        )
                        dimension_checks.append({
                            "axis": axis,
                            "actualMm": actual_value,
                            "expectedMm": expected_value,
                            "toleranceMm": float(tolerance_mm),
                            "passed": passed,
                        })
                        if not passed:
                            warnings.append(
                                "Measured " + axis.upper() + " extent does not match the requested part dimension."
                            )

                    expected_volume_mm3 = math.pi * (float(diameter_mm) / 2) ** 2 * float(length_mm)
                    volume_tolerance_mm3 = max(expected_volume_mm3 * 1e-3, 1e-9)
                    measured_volume_matches_expected = (
                        math.isfinite(volume_mm3)
                        and abs(volume_mm3 - expected_volume_mm3) <= volume_tolerance_mm3
                    )
                    if not measured_volume_matches_expected:
                        warnings.append("Measured solid volume does not match the requested cylindrical specification.")

                    dimension_checks_complete = (
                        len(dimension_checks) == 3
                        and all(check["passed"] for check in dimension_checks)
                    )
            else:
                warnings.append("The requested geometry kind has no deterministic dimension checker.")

        valid = (
            topology_valid
            and solid_count == 1
            and all(solid_validity)
            and math.isfinite(volume_mm3)
            and volume_mm3 > 0
            and all(math.isfinite(v) and v > 0 for v in bounding_box_mm.values())
            and dimension_checks_complete
            and measured_volume_matches_expected
            and not any("must be" in warning or "no deterministic" in warning or "are required" in warning for warning in warnings)
        )
        print(json.dumps(result(
            valid,
            solid_count,
            warnings,
            volumeMm3=volume_mm3,
            boundingBoxMm=bounding_box_mm,
            faceCount=len(shape.faces()),
            edgeCount=len(shape.edges()),
            dimensionChecks=dimension_checks,
        )))
        return 0
    except Exception as exc:
        return fail("OpenCascade BREP validation failed: " + type(exc).__name__ + ": " + str(exc))


if __name__ == "__main__":
    raise SystemExit(main())
