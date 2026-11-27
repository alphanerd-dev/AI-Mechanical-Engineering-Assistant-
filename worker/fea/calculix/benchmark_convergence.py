#!/usr/bin/env python3
"""Run a bounded three-mesh CalculiX convergence and analytical-reference gate."""
from __future__ import annotations

import argparse
import json
import math
import os
import pathlib
import subprocess
import sys
from typing import Any

MESH_SIZES_MM = (3.0, 2.5, 2.0)
MAX_REFERENCE_ERROR = 0.10
MAX_FINE_MESH_DELTA = 0.05
BASE_REQUEST: dict[str, Any] = {
    "analysis": "STATIC_STRUCTURAL",
    "benchmark": "cantilever_box",
    "material": {
        "name": "Steel",
        "youngsModulusMpa": 210000.0,
        "poissonRatio": 0.3,
        "yieldStrengthMpa": 250.0,
    },
    "dimensionsMm": {"length": 200.0, "width": 20.0, "height": 20.0},
    "totalForceN": 1000.0,
    "timeoutMs": 120000,
}


def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def read_worker_response(stdout: str) -> dict[str, Any]:
    for line in reversed([line.strip() for line in stdout.splitlines() if line.strip()]):
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict):
            return value
    raise ValueError("CalculiX worker did not emit a JSON result.")


def run_mesh_case(worker_path: pathlib.Path, artifact_root: pathlib.Path, mesh_size_mm: float) -> dict[str, Any]:
    case_dir = artifact_root / ("mesh-" + str(mesh_size_mm).replace(".", "_") + "mm")
    case_dir.mkdir(parents=True, exist_ok=True)
    request = dict(BASE_REQUEST)
    request["elementSizeMm"] = mesh_size_mm
    environment = dict(os.environ)
    environment["FEA_ARTIFACT_DIR"] = str(case_dir)
    completed = subprocess.run(
        [sys.executable, str(worker_path)],
        input=json.dumps(request, separators=(",", ":"), allow_nan=False),
        text=True,
        capture_output=True,
        timeout=130,
        cwd=str(case_dir),
        env=environment,
        check=False,
    )
    try:
        response = read_worker_response(completed.stdout)
    except ValueError as exc:
        response = {"success": False, "error": str(exc)}
    (case_dir / "response.json").write_text(
        json.dumps(response, indent=2, sort_keys=True, allow_nan=False),
        encoding="utf-8",
    )
    reference = response.get("benchmarkReference")
    if not isinstance(reference, dict):
        reference = {}
    mesh = response.get("mesh") if isinstance(response.get("mesh"), dict) else {}
    artifacts = response.get("artifacts") if isinstance(response.get("artifacts"), list) else []
    return {
        "meshSizeMm": mesh_size_mm,
        "workerExitCode": completed.returncode,
        "workerSuccess": response.get("success") is True,
        "referencePassed": reference.get("passed") is True,
        "nodeCount": mesh.get("nodeCount"),
        "elementCount": mesh.get("elementCount"),
        "measuredDisplacementMm": response.get("maxDisplacementMm"),
        "expectedDisplacementMm": reference.get("expectedTipDeflectionMm"),
        "displacementRelativeError": reference.get("displacementRelativeError"),
        "displacementRelativeTolerance": reference.get("displacementRelativeTolerance"),
        "reactionRelativeError": reference.get("reactionRelativeError"),
        "artifactDigests": [
            {"kind": item.get("kind"), "sha256": item.get("sha256")}
            for item in artifacts if isinstance(item, dict)
        ],
        "error": response.get("error"),
    }


def run_mesh_cases(worker_path: pathlib.Path, artifact_root: pathlib.Path) -> list[dict[str, Any]]:
    cases = []
    for mesh_size in MESH_SIZES_MM:
        try:
            case = run_mesh_case(worker_path, artifact_root, mesh_size)
        except (OSError, subprocess.TimeoutExpired, ValueError) as exc:
            case = {
                "meshSizeMm": mesh_size,
                "workerExitCode": None,
                "workerSuccess": False,
                "referencePassed": False,
                "error": str(exc)[:500],
                "artifactDigests": [],
            }
        cases.append(case)
    return cases


def calculate_fine_mesh_delta(cases: list[dict[str, Any]]) -> float | None:
    finest, second_finest = cases[-1], cases[-2]
    measured_fine = finest.get("measuredDisplacementMm")
    measured_medium = second_finest.get("measuredDisplacementMm")
    if not finite_number(measured_fine) or not finite_number(measured_medium):
        return None
    return abs(float(measured_fine) - float(measured_medium)) / max(abs(float(measured_fine)), 1e-12)


def case_passed(case: dict[str, Any]) -> bool:
    return (
        case.get("workerExitCode") == 0
        and case.get("workerSuccess") is True
        and case.get("referencePassed") is True
        and finite_number(case.get("displacementRelativeError"))
        and float(case["displacementRelativeError"]) <= MAX_REFERENCE_ERROR
        and finite_number(case.get("reactionRelativeError"))
        and float(case["reactionRelativeError"]) <= 0.01
    )


def build_summary(cases: list[dict[str, Any]], fine_mesh_delta: float | None) -> dict[str, Any]:
    all_cases_passed = all(case_passed(case) for case in cases)
    convergence_passed = fine_mesh_delta is not None and fine_mesh_delta <= MAX_FINE_MESH_DELTA
    return {
        "benchmark": "cantilever_box",
        "referenceId": "cantilever-box-euler-bernoulli-plus-timoshenko-v2",
        "units": {"length": "mm", "force": "N", "modulus": "MPa", "displacement": "mm"},
        "meshSizesMm": list(MESH_SIZES_MM),
        "maximumDisplacementRelativeError": MAX_REFERENCE_ERROR,
        "maximumReactionRelativeError": 0.01,
        "maximumFinestMeshRelativeDelta": MAX_FINE_MESH_DELTA,
        "finestMeshRelativeDelta": fine_mesh_delta,
        "allCasesPassed": all_cases_passed,
        "convergencePassed": convergence_passed,
        "passed": all_cases_passed and convergence_passed,
        "cases": cases,
    }


def write_summary(output_path: pathlib.Path, summary: dict[str, Any]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(summary, indent=2, sort_keys=True, allow_nan=False), encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/artifacts/fea-mesh-convergence.json")
    args = parser.parse_args()
    artifact_root = pathlib.Path(os.environ.get("FEA_ARTIFACT_DIR", "/artifacts")).resolve()
    artifact_root.mkdir(parents=True, exist_ok=True)
    worker_path = pathlib.Path(__file__).with_name("worker.py")
    cases = run_mesh_cases(worker_path, artifact_root)
    summary = build_summary(cases, calculate_fine_mesh_delta(cases))
    write_summary(pathlib.Path(args.output), summary)
    print(json.dumps(summary, separators=(",", ":"), allow_nan=False))
    return 0 if summary["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
