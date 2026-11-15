#!/usr/bin/env python3
"""Unit tests for the asynchronous OpenFOAM service boundary (no solver required)."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import service


def valid_request(job_id="9f2dcb7b-bf1b-49a6-a0d2-9f4ccff1c233"):
    return {
        "id": job_id,
        "backend": "cfd-worker",
        "capability": "ANALYSIS.CFD_LAMINAR_CHANNEL",
        "timeoutMs": 125000,
        "requestedOutputs": ["VELOCITY_PROFILE", "MASS_FLOW", "RESIDUALS", "ARTIFACTS"],
        "inputs": {
            "caseId": "laminar-channel-poiseuille-v1",
            "meanVelocityMps": 0.2,
            "heightM": 0.01,
            "depthM": 0.001,
            "densityKgM3": 1000.0,
            "kinematicViscosityM2PerS": 1e-5,
            "mesh": {"cellsVertical": 40},
            "solver": {
                "maxIterations": 2000,
                "residualTolerance": 1e-7,
                "timeoutSeconds": 5,
            },
        },
    }


class FakePool:
    def __init__(self):
        self.submitted = []

    def submit(self, function, *args):
        self.submitted.append((function, args))


class OpenFOAMServiceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.old_root = service.ARTIFACT_ROOT
        self.old_state_root = service.JOB_STATE_ROOT
        self.old_jobs = dict(service.JOBS)
        self.old_pool = service.POOL
        service.ARTIFACT_ROOT = self.root / "artifacts"
        service.JOB_STATE_ROOT = service.ARTIFACT_ROOT / ".jobs"
        service.JOBS.clear()
        service.POOL = FakePool()

    def tearDown(self):
        service.ARTIFACT_ROOT = self.old_root
        service.JOB_STATE_ROOT = self.old_state_root
        service.JOBS.clear()
        service.JOBS.update(self.old_jobs)
        service.POOL = self.old_pool
        self.temporary.cleanup()

    def test_accepts_only_bounded_openfoam_requests(self):
        job_id, timeout = service.validate_request(valid_request())
        self.assertEqual(job_id, valid_request()["id"])
        self.assertEqual(timeout, 125000)

    def test_execution_timeout_matches_worker_budget_ceiling(self):
        request = valid_request()
        request["timeoutMs"] = 730000
        self.assertEqual(service.validate_request(request)[1], 730000)
        request["timeoutMs"] = 730001
        with self.assertRaisesRegex(ValueError, "730000"):
            service.validate_request(request)

    def test_rejects_wrong_backend_capability_and_insufficient_timeout(self):
        request = valid_request()
        request["backend"] = "fea-worker"
        with self.assertRaisesRegex(ValueError, "cfd-worker"):
            service.validate_request(request)
        request = valid_request()
        request["capability"] = "CODE.EXECUTE"
        with self.assertRaisesRegex(ValueError, "CFD_LAMINAR_CHANNEL"):
            service.validate_request(request)
        request = valid_request()
        request["timeoutMs"] = 120000
        with self.assertRaisesRegex(ValueError, "reserve the solver timeout"):
            service.validate_request(request)

    def test_rejects_manifest_outside_supported_physics_or_resource_bounds(self):
        request = valid_request()
        request["inputs"]["meanVelocityMps"] = 200
        with self.assertRaisesRegex(ValueError, "meanVelocityMps"):
            service.validate_request(request)
        request = valid_request()
        request["inputs"]["mesh"]["cellsVertical"] = 1000
        with self.assertRaisesRegex(ValueError, "cellsVertical"):
            service.validate_request(request)
        request = valid_request()
        request["inputs"]["unexpected"] = "arbitrary OpenFOAM dictionary"
        with self.assertRaisesRegex(ValueError, "unsupported fields"):
            service.validate_request(request)

    def test_submission_is_idempotent_and_rejects_id_reuse_with_changed_input(self):
        request = valid_request()
        status, first = service.submit_job(request)
        self.assertEqual(status, 202)
        self.assertTrue(first["accepted"])
        self.assertEqual(first["status"], "QUEUED")
        self.assertEqual(len(service.POOL.submitted), 1)

        replay_status, replay = service.submit_job(request)
        self.assertEqual(replay_status, 202)
        self.assertEqual(replay["jobId"], first["jobId"])
        self.assertEqual(len(service.POOL.submitted), 1)

        changed = valid_request()
        changed["inputs"]["meanVelocityMps"] = 0.21
        conflict_status, conflict = service.submit_job(changed)
        self.assertEqual(conflict_status, 409)
        self.assertFalse(conflict["accepted"])
        self.assertIn("different request", conflict["error"])

    def test_worker_result_requires_solver_success_and_finite_values(self):
        raw = {
            "status": "COMPLETED",
            "solver": "OpenFOAM",
            "solverVersion": "14",
            "converged": True,
            "meshCells": 40,
            "massFluxKgS": 0.002,
            "velocityProfile": [{"yM": 0.00025, "axialVelocityMps": 0.1}],
            "artifacts": [],
            "warnings": [],
        }
        result = service.parse_worker_result(json.dumps(raw), 0, valid_request())
        self.assertTrue(result["success"])
        self.assertEqual(result["provider"], "openfoam14")
        raw["massFluxKgS"] = float("nan")
        with self.assertRaisesRegex(RuntimeError, "non-finite"):
            service.parse_worker_result(json.dumps(raw), 0, valid_request())

    def test_restart_marks_active_jobs_for_reconciliation_not_replay(self):
        job_id = valid_request()["id"]
        state_dir = service.JOB_STATE_ROOT / job_id
        state_dir.mkdir(parents=True)
        (state_dir / "job.json").write_text(json.dumps({
            "jobId": job_id,
            "status": "RUNNING",
            "requestHash": "a" * 64,
            "cancelRequested": False,
        }), encoding="utf-8")
        service.restore_jobs()
        restored = service.JOBS[job_id]
        self.assertEqual(restored["status"], "FAILED")
        self.assertEqual(restored["errorCode"], "RECONCILIATION_REQUIRED")

    def test_queued_cancellation_is_persisted_without_spawning_solver(self):
        request = valid_request()
        service.submit_job(request)
        cancelled = service.cancel_job(request["id"])
        self.assertEqual(cancelled["status"], "CANCELLED")
        self.assertTrue(cancelled["cancelRequested"])
        self.assertEqual(len(service.POOL.submitted), 1)

    def test_artifact_resolution_rejects_path_traversal_and_symlink_escape(self):
        job_id = valid_request()["id"]
        job_dir = service.ARTIFACT_ROOT / __import__("uuid").UUID(job_id).hex
        job_dir.mkdir(parents=True)
        artifact = job_dir / "solver.log"
        artifact.write_text("OpenFOAM log", encoding="utf-8")
        self.assertEqual(service.resolve_artifact(job_id, "solver.log"), artifact)
        for unsafe_path in (
            "../solver.log",
            "/etc/passwd",
            "C:\\solver.log",
            "nested\\solver.log",
            "artifacts/../solver.log",
            "unknown.bin",
        ):
            self.assertIsNone(service.resolve_artifact(job_id, unsafe_path), unsafe_path)
        outside = service.ARTIFACT_ROOT / "outside.log"
        outside.write_text("outside", encoding="utf-8")
        (job_dir / "escape.log").symlink_to(outside)
        self.assertIsNone(service.resolve_artifact(job_id, "escape.log"))

    def test_external_bind_requires_api_token_and_loopback_is_allowed(self):
        with self.assertRaisesRegex(RuntimeError, "WORKER_API_TOKEN"):
            service.validate_server_configuration("0.0.0.0", "")
        service.validate_server_configuration("127.0.0.1", "")


if __name__ == "__main__":
    unittest.main()
