#!/usr/bin/env python3
"""Deterministic protocol tests for the OCCT geometry-kernel worker."""
import base64
import contextlib
import io
import json
import os
import pathlib
import sys
import tempfile
import types
import unittest
from unittest import mock

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import geometry_kernel


class FakeShape:
    is_null = False
    is_valid = True

    def solids(self): return [object()]
    def shells(self): return [object()]
    def faces(self): return [object(), object()]
    def edges(self): return [object(), object(), object()]
    def vertices(self): return [object(), object(), object(), object()]

    def tessellate_with_uvs(self, linear, angular, atlas_packing=True):
        vectors = [
            types.SimpleNamespace(X=0.0, Y=0.0, Z=0.0),
            types.SimpleNamespace(X=1.0, Y=0.0, Z=0.0),
            types.SimpleNamespace(X=0.0, Y=1.0, Z=0.0),
        ]
        normals = [types.SimpleNamespace(X=0.0, Y=0.0, Z=1.0) for _ in vectors]
        return vectors, [(0, 1, 2)], normals, [(0.0, 0.0)] * 3


class GeometryKernelWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = pathlib.Path(self.temp.name)
        self.artifact = self.root / "part.brep"
        self.artifact.write_bytes(b"test-brep")
        self.env = mock.patch.dict(os.environ, {"CAD_ARTIFACT_DIR": str(self.root)})
        self.env.start()
        self.addCleanup(self.env.stop)
        self.addCleanup(self.temp.cleanup)

    def run_request(self, request, imported_shape=None):
        stdin = io.StringIO(json.dumps(request))
        stdout = io.StringIO()
        with mock.patch.object(sys, "stdin", stdin), mock.patch.object(sys, "stdout", stdout):
            with mock.patch.object(geometry_kernel, "import_brep", return_value=imported_shape or FakeShape()):
                geometry_kernel.main()
        return json.loads(stdout.getvalue())

    def request(self, operation="INSPECT", **extra):
        return {
            "operation": operation,
            "format": "BREP",
            "artifactPath": "/artifacts/part.brep",
            **extra,
        }

    def test_inspects_real_imported_shape_topology(self):
        result = self.run_request(self.request())
        self.assertEqual(result["status"], "COMPLETED")
        self.assertEqual(result["topology"], {
            "solids": 1, "shells": 1, "faces": 2, "edges": 3, "vertices": 4, "valid": True
        })

    def test_tessellates_and_returns_bounded_little_endian_buffers(self):
        result = self.run_request(self.request(
            "TESSELLATE", linearDeflectionMm=0.2, angularDeflectionRad=0.3
        ))
        self.assertEqual(result["status"], "COMPLETED")
        mesh = result["tessellation"]
        self.assertEqual(mesh["vertexCount"], 3)
        self.assertEqual(mesh["triangleCount"], 1)
        self.assertEqual(len(base64.b64decode(mesh["positionsFloat32LE"])), 3 * 3 * 4)
        self.assertEqual(len(base64.b64decode(mesh["normalsFloat32LE"])), 3 * 3 * 4)
        self.assertEqual(len(base64.b64decode(mesh["indicesUint32LE"])), 3 * 4)
        self.assertEqual(mesh["units"], "mm")

    def test_rejects_traversal_and_format_extension_mismatch(self):
        traversal = self.run_request(self.request(artifactPath="/artifacts/../outside.brep"))
        self.assertEqual(traversal["status"], "FAILED")
        self.assertTrue(traversal["errors"])
        mismatch = self.run_request({**self.request(), "format": "STEP"})
        self.assertEqual(mismatch["status"], "FAILED")
        self.assertIn("extension", mismatch["errors"][0])

    def test_rejects_unbounded_tessellation_parameters(self):
        result = self.run_request(self.request("TESSELLATE", linearDeflectionMm=100))
        self.assertEqual(result["status"], "FAILED")
        self.assertIn("linearDeflectionMm", result["errors"][0])

    def test_rejects_unknown_request_fields_and_unsupported_operations(self):
        unknown = self.run_request({**self.request(), "shellCommand": "echo unsafe"})
        self.assertEqual(unknown["status"], "FAILED")
        unsupported = self.run_request(self.request("REPAIR"))
        self.assertEqual(unsupported["status"], "FAILED")

    def test_rejects_empty_and_oversized_artifacts(self):
        self.artifact.write_bytes(b"")
        empty = self.run_request(self.request())
        self.assertEqual(empty["status"], "FAILED")
        self.artifact.write_bytes(b"x" * (geometry_kernel.MAX_ARTIFACT_BYTES + 1))
        oversized = self.run_request(self.request())
        self.assertEqual(oversized["status"], "FAILED")


if __name__ == "__main__":
    unittest.main(verbosity=2)
