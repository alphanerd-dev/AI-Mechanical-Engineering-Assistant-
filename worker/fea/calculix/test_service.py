#!/usr/bin/env python3
"""Unit tests for the asynchronous CalculiX worker service boundary."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import service


def valid_request():
    return {
        "id": "9f2dcb7b-bf1b-49a6-a0d2-9f4ccff1c233",
        "backend": "fea-worker",
        "capability": "ANALYSIS.STATIC_STRUCTURAL",
        "timeoutMs": 60000,
        "requestedOutputs": ["DISPLACEMENT", "STRESS", "REACTION_FORCE"],
        "inputs": {
            "analysis": "STATIC_STRUCTURAL",
            "benchmark": "cantilever_box",
            "dimensionsMm": {"length": 200.0, "width": 20.0, "height": 10.0},
            "material": {"youngsModulusMpa": 210000.0, "poissonRatio": 0.3},
            "totalForceN": 100.0,
            "elementSizeMm": 10.0,
        },
    }


class CalculixServiceTests(unittest.TestCase):
    def test_accepts_only_versioned_reference_benchmark_requests(self):
        job_id, timeout = service.validate_request(valid_request())
        self.assertEqual(job_id, valid_request()["id"])
        self.assertEqual(timeout, 60000)
        high_budget = valid_request()
        high_budget["timeoutMs"] = 150000
        self.assertEqual(service.validate_request(high_budget)[1], 150000)
        high_budget["timeoutMs"] = 150001
        with self.assertRaisesRegex(ValueError, "timeoutMs"):
            service.validate_request(high_budget)
        request = valid_request()
        request["inputs"]["benchmark"] = "arbitrary_mesh"
        with self.assertRaisesRegex(ValueError, "cantilever_box"):
            service.validate_request(request)

    def test_rejects_wrong_backend_capability_and_timeout(self):
        request = valid_request()
        request["backend"] = "python-worker"
        with self.assertRaisesRegex(ValueError, "fea-worker"):
            service.validate_request(request)
        request = valid_request()
        request["capability"] = "CODE.EXECUTE"
        with self.assertRaisesRegex(ValueError, "STATIC_STRUCTURAL"):
            service.validate_request(request)
        request = valid_request()
        request["timeoutMs"] = 120001
        with self.assertRaisesRegex(ValueError, "timeoutMs"):
            service.validate_request(request)

    def test_request_hash_is_stable_and_changes_with_input(self):
        request = valid_request()
        self.assertEqual(service.canonical_hash(request), service.canonical_hash(request))
        changed = valid_request()
        changed["inputs"]["totalForceN"] = 101.0
        self.assertNotEqual(service.canonical_hash(request), service.canonical_hash(changed))

    def test_worker_result_requires_process_success_and_analytical_acceptance(self):
        raw = {
            "success": True,
            "solverVersion": "2.20",
            "benchmarkReference": {"passed": True},
            "artifacts": [{"path": "model.inp", "sha256": "a" * 64}],
            "warnings": [],
        }
        result = service.parse_worker_result(json.dumps(raw), 0, valid_request())
        self.assertTrue(result["success"])
        self.assertEqual(result["provider"], "open.calculix")
        raw["benchmarkReference"]["passed"] = False
        result = service.parse_worker_result(json.dumps(raw), 1, valid_request())
        self.assertFalse(result["success"])
        self.assertTrue(result["warnings"])

    def test_recovery_marks_active_jobs_for_manual_reconciliation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            directory = root / valid_request()["id"]
            directory.mkdir()
            (directory / "job.json").write_text(json.dumps({
                "jobId": valid_request()["id"],
                "status": "RUNNING",
                "requestHash": "a" * 64,
                "cancelRequested": False,
            }), encoding="utf-8")
            original_root = service.ARTIFACT_ROOT
            original_jobs = dict(service.JOBS)
            try:
                service.ARTIFACT_ROOT = root
                service.JOBS.clear()
                service.restore_jobs()
                restored = service.JOBS[valid_request()["id"]]
                self.assertEqual(restored["status"], "FAILED")
                self.assertEqual(restored["errorCode"], "RECONCILIATION_REQUIRED")
            finally:
                service.ARTIFACT_ROOT = original_root
                service.JOBS.clear()
                service.JOBS.update(original_jobs)

    def test_artifact_resolver_rejects_path_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            job_id = valid_request()["id"]
            job_dir = root / job_id
            job_dir.mkdir()
            artifact = job_dir / "model.inp"
            artifact.write_text("*NODE", encoding="utf-8")
            original_root = service.ARTIFACT_ROOT
            try:
                service.ARTIFACT_ROOT = root
                self.assertEqual(service.resolve_artifact(job_id, "model.inp"), artifact)
                for unsafe_path in (
                    "../outside",
                    "nested/../outside",
                    "/etc/passwd",
                    "C:\\outside.inp",
                    "nested\\outside.inp",
                    "nested//outside.inp",
                    "nested/./outside.inp",
                ):
                    self.assertIsNone(service.resolve_artifact(job_id, unsafe_path), unsafe_path)
                outside = root / "outside.inp"
                outside.write_text("outside", encoding="utf-8")
                (job_dir / "escape.inp").symlink_to(outside)
                self.assertIsNone(service.resolve_artifact(job_id, "escape.inp"))
            finally:
                service.ARTIFACT_ROOT = original_root

    def test_external_bind_requires_api_token(self):
        with self.assertRaisesRegex(RuntimeError, "WORKER_API_TOKEN"):
            service.validate_server_configuration("0.0.0.0", "")
        service.validate_server_configuration("127.0.0.1", "")


if __name__ == "__main__":
    unittest.main()
