#!/usr/bin/env python3
"""Regression tests for the read-only OCCT validator's acceptance boundary.

These tests replace build123d's geometry importer with deterministic fixtures, so
failure-path checks run quickly and reproducibly inside the pinned CAD image.
The separate CI smoke step still validates a real generated BREP with OpenCascade.
"""
import contextlib
import importlib.util
import io
import json
import math
import os
import pathlib
import sys
import types
import unittest
from unittest import mock

VALIDATOR_PATH = pathlib.Path(__file__).with_name("validate_brep.py")
SPEC = importlib.util.spec_from_file_location("validate_brep_under_test", VALIDATOR_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError("Could not load the trusted OCCT validator module.")
VALIDATOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VALIDATOR)


class FakeSolid:
    is_valid = True


class FakeBounds:
    def __init__(self, x=30.0, y=30.0, z=200.0):
        self.X, self.Y, self.Z = x, y, z


class FakeShape:
    is_null = False
    is_valid = True

    def __init__(self, volume=None, bounds=None, solid_count=1, valid=True):
        self.volume = math.pi * 15.0 * 15.0 * 200.0 if volume is None else volume
        self.bounds = bounds or FakeBounds()
        self.solid_count = solid_count
        self.is_valid = valid

    def solids(self):
        return [FakeSolid() for _ in range(self.solid_count)]

    def compute_volume(self):
        return self.volume

    def bounding_box(self):
        return types.SimpleNamespace(size=self.bounds)

    def faces(self):
        return [object(), object(), object()]

    def edges(self):
        return [object(), object(), object()]


class OCCTValidatorFailurePathTests(unittest.TestCase):
    def setUp(self):
        self.artifact_root = pathlib.Path(os.environ.get("CAD_ARTIFACT_DIR", "/artifacts"))
        self.artifact_root.mkdir(parents=True, exist_ok=True)
        self.artifact_path = self.artifact_root / "part.brep"
        self.artifact_path.write_bytes(b"fixture-brep")
        self.request = {
            "artifactPath": "/artifacts/part.brep",
            "expected": {
                "kind": "CYLINDER",
                "diameterMm": 30,
                "lengthMm": 200,
                "toleranceMm": 0.01,
            },
        }
        self.stdout = io.StringIO()
        self.stdin = io.StringIO(json.dumps(self.request))
        self.stdout_patch = mock.patch.object(sys, "stdout", self.stdout)
        self.stdin_patch = mock.patch.object(sys, "stdin", self.stdin)
        self.stdout_patch.start()
        self.stdin_patch.start()
        self.addCleanup(self.stdout_patch.stop)
        self.addCleanup(self.stdin_patch.stop)

    def run_validator(self, shape=None, importer_error=None):
        if importer_error is not None:
            importer = mock.Mock(side_effect=importer_error)
        else:
            importer = mock.Mock(return_value=shape or FakeShape())
        with mock.patch.object(VALIDATOR, "import_brep", importer):
            exit_code = VALIDATOR.main()
        self.assertEqual(exit_code, 0)
        output = json.loads(self.stdout.getvalue())
        self.assertIn("valid", output)
        return output

    def test_accepts_measured_single_cylinder_with_expected_volume_and_dimensions(self):
        result = self.run_validator()
        self.assertTrue(result["valid"], result)
        self.assertEqual(result["solidCount"], 1)
        self.assertEqual(result["checkedBy"], "occt.brepcheck")
        self.assertEqual(len(result["dimensionChecks"]), 3)
        self.assertTrue(all(item["passed"] for item in result["dimensionChecks"]))

    def test_rejects_volume_mismatch_even_when_bounding_box_matches(self):
        expected = math.pi * 15.0 * 15.0 * 200.0
        result = self.run_validator(FakeShape(volume=expected * 1.02))
        self.assertFalse(result["valid"])
        self.assertTrue(any("volume does not match" in item for item in result["warnings"]))

    def test_rejects_missing_expected_geometry_constraints(self):
        self.request.pop("expected")
        self.stdin = io.StringIO(json.dumps(self.request))
        with mock.patch.object(sys, "stdin", self.stdin):
            result = self.run_validator()
        self.assertFalse(result["valid"])
        self.assertTrue(any("constraints are required" in item for item in result["warnings"]))

    def test_rejects_bounding_box_dimension_mismatch(self):
        result = self.run_validator(FakeShape(bounds=FakeBounds(x=31.0)))
        self.assertFalse(result["valid"])
        self.assertTrue(any("X extent" in item for item in result["warnings"]))

    def test_rejects_relaxed_or_invalid_tolerance(self):
        self.request["expected"]["toleranceMm"] = 1.1
        self.stdin = io.StringIO(json.dumps(self.request))
        with mock.patch.object(sys, "stdin", self.stdin):
            result = self.run_validator()
        self.assertFalse(result["valid"])
        self.assertTrue(any("tolerance must be greater than 0" in item for item in result["warnings"]))

    def test_rejects_multiple_solids(self):
        result = self.run_validator(FakeShape(solid_count=2))
        self.assertFalse(result["valid"])
        self.assertTrue(any("single-solid part was required" in item for item in result["warnings"]))

    def test_rejects_importer_failure_without_claiming_validity(self):
        result = self.run_validator(importer_error=ValueError("corrupt BREP"))
        self.assertFalse(result["valid"])
        self.assertTrue(any("validation failed" in item for item in result["warnings"]))

    def tearDown(self):
        try:
            self.artifact_path.unlink(missing_ok=True)
        except OSError:
            pass


if __name__ == "__main__":
    unittest.main(verbosity=2)
