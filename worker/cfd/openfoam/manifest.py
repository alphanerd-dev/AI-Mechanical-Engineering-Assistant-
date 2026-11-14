"""Strict request validation and deterministic OpenFOAM case generation."""

from __future__ import annotations

import math
from typing import Any

def finite_positive(value: Any) -> bool:
    return not isinstance(value, bool) and isinstance(value, (int, float)) and math.isfinite(value) and value > 0


def bounded_positive(value: Any, minimum: float, maximum: float) -> bool:
    return finite_positive(value) and minimum <= value <= maximum


ALLOWED_REQUEST_KEYS = {
    "caseId", "meanVelocityMps", "heightM", "depthM", "densityKgM3",
    "kinematicViscosityM2PerS", "mesh", "solver"
}
PHYSICAL_INPUT_BOUNDS = {
    "meanVelocityMps": (1e-4, 100.0),
    "heightM": (1e-4, 10.0),
    "depthM": (1e-4, 10.0),
    "densityKgM3": (0.1, 20000.0),
    "kinematicViscosityM2PerS": (1e-9, 1e-2),
}


def validate_request_identity(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if set(data) - ALLOWED_REQUEST_KEYS:
        errors.append("Request contains unsupported fields.")
    if data.get("caseId") != "laminar-channel-poiseuille-v1":
        errors.append("Unsupported caseId.")
    return errors


def validate_physical_inputs(data: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for field, (minimum, maximum) in PHYSICAL_INPUT_BOUNDS.items():
        if not bounded_positive(data.get(field), minimum, maximum):
            errors.append(f"{field} must be between {minimum:g} and {maximum:g}.")
    return errors


def validate_flow_physics(data: dict[str, Any]) -> list[str]:
    fields = ("meanVelocityMps", "heightM", "kinematicViscosityM2PerS")
    if not all(finite_positive(data.get(field)) for field in fields):
        return []
    velocity = data["meanVelocityMps"]
    height = data["heightM"]
    viscosity = data["kinematicViscosityM2PerS"]
    reynolds = 2 * height * velocity / viscosity
    body_force = 12 * viscosity * velocity / (height * height)
    errors: list[str] = []
    if not math.isfinite(reynolds) or reynolds >= 1000:
        errors.append("Hydraulic-diameter Reynolds number must be below 1000.")
    if not math.isfinite(body_force) or body_force <= 0:
        errors.append("Derived Poiseuille body-force acceleration is outside the finite numeric range.")
    return errors


def validate_mesh_keys(mesh: Any) -> list[str]:
    unsupported = isinstance(mesh, dict) and bool(set(mesh) - {"cellsVertical"})
    return ["mesh contains unsupported fields."] if unsupported else []


def is_integer_value(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def is_mesh_cell_count_in_range(value: int) -> bool:
    return 20 <= value <= 200


def validate_mesh_cell_count(mesh: Any) -> list[str]:
    cells = mesh.get("cellsVertical") if isinstance(mesh, dict) else None
    if not is_integer_value(cells):
        return ["mesh.cellsVertical must be an integer between 20 and 200."]
    if not is_mesh_cell_count_in_range(cells):
        return ["mesh.cellsVertical must be an integer between 20 and 200."]
    return []


def validate_mesh_settings(data: dict[str, Any]) -> list[str]:
    mesh = data.get("mesh")
    return validate_mesh_keys(mesh) + validate_mesh_cell_count(mesh)

def validate_solver_keys(solver: dict[str, Any]) -> list[str]:
    if set(solver) - {"maxIterations", "residualTolerance", "timeoutSeconds"}:
        return ["solver contains unsupported fields."]
    return []


def validate_max_iterations(solver: dict[str, Any]) -> list[str]:
    value = solver.get("maxIterations")
    valid = isinstance(value, int) and not isinstance(value, bool) and 50 <= value <= 10000
    return [] if valid else ["solver.maxIterations must be an integer between 50 and 10000."]


def validate_residual_tolerance(solver: dict[str, Any]) -> list[str]:
    value = solver.get("residualTolerance")
    valid = (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and 1e-10 <= value <= 1e-3
    )
    return [] if valid else ["solver.residualTolerance must be between 1e-10 and 1e-3."]


def validate_solver_timeout(solver: dict[str, Any]) -> list[str]:
    value = solver.get("timeoutSeconds")
    valid = isinstance(value, int) and not isinstance(value, bool) and 5 <= value <= 600
    return [] if valid else ["solver.timeoutSeconds must be an integer between 5 and 600."]


def validate_solver_settings(data: dict[str, Any]) -> list[str]:
    solver = data.get("solver")
    if not isinstance(solver, dict):
        return missing_solver_errors()
    return (
        validate_solver_keys(solver)
        + validate_max_iterations(solver)
        + validate_residual_tolerance(solver)
        + validate_solver_timeout(solver)
    )

def validate_request(data: Any) -> list[str]:
    if not isinstance(data, dict):
        return ["Request body must be a JSON object."]
    return (
        validate_request_identity(data)
        + validate_physical_inputs(data)
        + validate_flow_physics(data)
        + validate_mesh_settings(data)
        + validate_solver_settings(data)
    )
