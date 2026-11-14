"""OpenFOAM utility execution and numerical output parsing."""

from __future__ import annotations

import math
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from errors import WorkerError

NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")

def detect_openfoam_version(foam_env: str) -> str:
    completed = subprocess.run(
        [foam_env, "--version"],
        capture_output=True,
        text=True,
        timeout=10,
        check=False,
        env=os.environ.copy(),
    )
    version_output = completed.stdout + completed.stderr
    match = re.search(r"OpenFOAM-(\d+)", version_output)
    if completed.returncode != 0 or not match or match.group(1) != "14":
        raise RuntimeError("The worker requires the OpenFOAM Foundation 14 runtime.")
    return match.group(1)


def run_tool(case_dir: Path, tool: str, timeout: float, foam_env: str) -> subprocess.CompletedProcess[str]:
    if tool not in {"blockMesh", "checkMesh", "foamRun"}:
        raise WorkerError("Unsupported OpenFOAM utility.")
    return subprocess.run(
        [foam_env, tool, "-case", str(case_dir)],
        cwd=case_dir,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
        env={**os.environ, "OMP_NUM_THREADS": "1", "FOAM_SIGFPE": "1", "FOAM_SETNAN": "1"},
    )


def parse_mesh_cell_count(output: str) -> int:
    matches = re.findall(r"^\s*cells:\s*(\d+)", output, flags=re.MULTILINE)
    if not matches:
        raise WorkerError("OpenFOAM checkMesh output did not contain a cell count.")
    return int(matches[-1])


def read_last_probe_line(probe_file: Path) -> str:
    if not probe_file.is_file():
        raise WorkerError("OpenFOAM velocity probe output is missing.")
    data_lines = [
        line.strip()
        for line in probe_file.read_text(encoding="utf-8", errors="replace").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    ]
    if not data_lines:
        raise WorkerError("OpenFOAM velocity probe output contains no samples.")
    return data_lines[-1]


def parse_probe_row(line: str) -> list[float]:
    values = [float(value) for value in NUMBER.findall(line)]
    if not all(math.isfinite(value) for value in values):
        raise WorkerError("OpenFOAM velocity probe output contains non-finite values.")
    return values


def extract_axial_velocity(values: list[float], expected_samples: int) -> list[float]:
    expected_count = 1 + 3 * expected_samples
    if len(values) < expected_count:
        raise WorkerError("OpenFOAM velocity probe output has an unexpected column count.")
    return [values[1 + index * 3] for index in range(expected_samples)]


def last_probe_values(probe_file: Path, expected_samples: int) -> list[float]:
    return extract_axial_velocity(
        parse_probe_row(read_last_probe_line(probe_file)),
        expected_samples
    )


def final_residuals(log_text: str) -> dict[str, float]:
    p_matches = re.findall(
        r"Solving for p, Initial residual = [^,]+, Final residual = (" + NUMBER.pattern + r")",
        log_text,
    )
    u_matches = re.findall(
        r"Solving for (U[xyz]), Initial residual = [^,]+, Final residual = (" + NUMBER.pattern + r")",
        log_text,
    )
    if not p_matches or not u_matches:
        raise WorkerError("Could not extract final pressure and velocity residuals from the solver log.")
    final_velocity_residuals: dict[str, float] = {}
    for component, value in u_matches:
        final_velocity_residuals[component] = float(value)
    return {
        "pressure": float(p_matches[-1]),
        "velocity": max(final_velocity_residuals.values()),
    }


@dataclass(frozen=True)
class MassFlowInput:
    y_samples: list[float]
    velocities: list[float]
    channel_height_m: float
    depth_m: float
    density_kg_m3: float


def integrate_mass_flux(inputs: MassFlowInput) -> float:
    half_height = inputs.channel_height_m / 2.0
    points = [(0.0, 0.0), *zip(inputs.y_samples, inputs.velocities)]
    points.append((half_height, inputs.velocities[-1]))
    integral = 0.0
    for (y0, u0), (y1, u1) in zip(points, points[1:]):
        integral += (y1 - y0) * (u0 + u1) / 2.0
    return 2.0 * inputs.density_kg_m3 * inputs.depth_m * integral
