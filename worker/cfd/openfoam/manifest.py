"""Strict request validation and deterministic OpenFOAM case generation."""

from __future__ import annotations

import math
import re
from pathlib import Path
from typing import Any

from errors import WorkerError

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


def validate_mesh_settings(data: dict[str, Any]) -> list[str]:
    mesh = data.get("mesh")
    errors: list[str] = []
    if isinstance(mesh, dict) and set(mesh) - {"cellsVertical"}:
        errors.append("mesh contains unsupported fields.")
    cells = mesh.get("cellsVertical") if isinstance(mesh, dict) else None
    if not isinstance(cells, int) or isinstance(cells, bool) or not 20 <= cells <= 200:
        errors.append("mesh.cellsVertical must be an integer between 20 and 200.")
    return errors


def validate_solver_settings(data: dict[str, Any]) -> list[str]:
    solver = data.get("solver")
    if not isinstance(solver, dict):
        return [
            "solver must be an object.",
            "solver.maxIterations must be an integer between 50 and 10000.",
            "solver.residualTolerance must be between 1e-10 and 1e-3.",
            "solver.timeoutSeconds must be an integer between 5 and 600."
        ]
    errors: list[str] = []
    if set(solver) - {"maxIterations", "residualTolerance", "timeoutSeconds"}:
        errors.append("solver contains unsupported fields.")
    iterations = solver.get("maxIterations")
    if not isinstance(iterations, int) or isinstance(iterations, bool) or not 50 <= iterations <= 10000:
        errors.append("solver.maxIterations must be an integer between 50 and 10000.")
    tolerance = solver.get("residualTolerance")
    if (
        isinstance(tolerance, bool) or
        not isinstance(tolerance, (int, float)) or
        not math.isfinite(tolerance) or
        not 1e-10 <= tolerance <= 1e-3
    ):
        errors.append("solver.residualTolerance must be between 1e-10 and 1e-3.")
    timeout = solver.get("timeoutSeconds")
    if not isinstance(timeout, int) or isinstance(timeout, bool) or not 5 <= timeout <= 600:
        errors.append("solver.timeoutSeconds must be an integer between 5 and 600.")
    return errors


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

def foam_header(object_name: str, location: str, class_name: str) -> str:
    return f'''FoamFile
{{
    format      ascii;
    class       {class_name};
    location    "{location}";
    object      {object_name};
}}
'''


def write_case(case_dir: Path, request: dict[str, Any]) -> list[float]:
    height = float(request["heightM"])
    depth = float(request["depthM"])
    viscosity = float(request["kinematicViscosityM2PerS"])
    mean_velocity = float(request["meanVelocityMps"])
    cells = int(request["mesh"]["cellsVertical"])
    tolerance = float(request["solver"]["residualTolerance"])
    iterations = int(request["solver"]["maxIterations"])
    half_height = height / 2.0
    streamwise_length = height
    body_force = 12.0 * viscosity * mean_velocity / (height * height)
    y_samples = [(index + 0.5) * half_height / cells for index in range(cells)]

    for folder in ("0", "constant", "system"):
        (case_dir / folder).mkdir(parents=True, exist_ok=True)

    block_mesh = f'''{foam_header("blockMeshDict", "system", "dictionary")}
scale 1;

vertices
(
    ({-streamwise_length/2:.12g} 0 {-depth/2:.12g})
    ({streamwise_length/2:.12g} 0 {-depth/2:.12g})
    ({streamwise_length/2:.12g} {half_height:.12g} {-depth/2:.12g})
    ({-streamwise_length/2:.12g} {half_height:.12g} {-depth/2:.12g})
    ({-streamwise_length/2:.12g} 0 {depth/2:.12g})
    ({streamwise_length/2:.12g} 0 {depth/2:.12g})
    ({streamwise_length/2:.12g} {half_height:.12g} {depth/2:.12g})
    ({-streamwise_length/2:.12g} {half_height:.12g} {depth/2:.12g})
);

blocks
(
    hex (0 1 2 3 4 5 6 7) (1 {cells} 1) simpleGrading (1 1 1)
);

boundary
(
    left
    {{
        type cyclic;
        neighbourPatch right;
        transform translational;
        separationVector ({streamwise_length:.12g} 0 0);
        faces ((0 3 7 4));
    }}
    right
    {{
        type cyclic;
        neighbourPatch left;
        transform translational;
        separationVector ({-streamwise_length:.12g} 0 0);
        faces ((1 2 6 5));
    }}
    wall
    {{
        type wall;
        faces ((0 1 5 4));
    }}
    centreline
    {{
        type symmetryPlane;
        faces ((2 3 7 6));
    }}
    frontAndBack
    {{
        type empty;
        faces ((0 1 2 3) (4 5 6 7));
    }}
);
'''
    (case_dir / "system" / "blockMeshDict").write_text(block_mesh, encoding="utf-8")

    (case_dir / "0" / "U").write_text(
        foam_header("U", "0", "volVectorField")
        + '''dimensions      [velocity];
internalField   uniform (0 0 0);
boundaryField
{
    wall
    {
        type fixedValue;
        value uniform (0 0 0);
    }
    #includeEtc "caseDicts/setConstraintTypes"
}
''',
        encoding="utf-8",
    )
    (case_dir / "0" / "p").write_text(
        foam_header("p", "0", "volScalarField")
        + '''dimensions      [kinematicPressure];
internalField   uniform 0;
boundaryField
{
    wall
    {
        type zeroGradient;
    }
    #includeEtc "caseDicts/setConstraintTypes"
}
''',
        encoding="utf-8",
    )
    (case_dir / "constant" / "physicalProperties").write_text(
        foam_header("physicalProperties", "constant", "dictionary")
        + f"viscosityModel constant;\nnu {viscosity:.12g};\n",
        encoding="utf-8",
    )
    (case_dir / "constant" / "momentumTransport").write_text(
        foam_header("momentumTransport", "constant", "dictionary")
        + "simulationType laminar;\n",
        encoding="utf-8",
    )
    (case_dir / "constant" / "fvModels").write_text(
        foam_header("fvModels", "constant", "dictionary")
        + f'''momentumSource
{{
    type semiImplicitSource;
    selectionMode all;
    volumeMode specific;
    sources
    {{
        U
        {{
            explicit ({body_force:.12g} 0 0);
            implicit 0;
        }}
    }}
}}
''',
        encoding="utf-8",
    )
    (case_dir / "system" / "controlDict").write_text(
        foam_header("controlDict", "system", "dictionary")
        + f'''solver incompressibleFluid;
startFrom startTime;
startTime 0;
stopAt endTime;
endTime {iterations};
deltaT 1;
writeControl timeStep;
writeInterval 1;
purgeWrite 1;
writeFormat ascii;
writePrecision 12;
writeCompression off;
timeFormat general;
timePrecision 6;
runTimeModifiable false;
#include "functions"
''',
        encoding="utf-8",
    )
    (case_dir / "system" / "fvSchemes").write_text(
        foam_header("fvSchemes", "system", "dictionary")
        + '''ddtSchemes
{
    default steadyState;
}
gradSchemes
{
    default Gauss linear;
}
divSchemes
{
    default none;
    div(phi,U) bounded Gauss linearUpwind grad(U);
    div((nu*dev2(T(grad(U))))) Gauss linear;
}
laplacianSchemes
{
    default Gauss linear uncorrected;
}
interpolationSchemes
{
    default linear;
}
snGradSchemes
{
    default uncorrected;
}
''',
        encoding="utf-8",
    )
    (case_dir / "system" / "fvSolution").write_text(
        foam_header("fvSolution", "system", "dictionary")
        + f'''solvers
{{
    p
    {{
        solver GAMG;
        smoother DIC;
        tolerance {tolerance:.12g};
        relTol 0;
    }}
    U
    {{
        solver smoothSolver;
        smoother symGaussSeidel;
        tolerance {tolerance:.12g};
        relTol 0;
    }}
}}
SIMPLE
{{
    nNonOrthogonalCorrectors 0;
    consistent yes;
    pRefCell 0;
    pRefValue 0;
    residualControl
    {{
        p {tolerance:.12g};
        U {tolerance:.12g};
    }}
}}
relaxationFactors
{{
    equations
    {{
        U 0.9;
        ".*" 0.9;
    }}
}}
''',
        encoding="utf-8",
    )
    points = "\n".join(f"            (0 {y:.12g} 0)" for y in y_samples)
    (case_dir / "system" / "functions").write_text(
        f'''functions
{{
    velocityProfile
    {{
        type probes;
        libs (sampling);
        name velocityProfile;
        fields (U);
        probeLocations
        (
{points}
        );
        writeControl timeStep;
        writeInterval 1;
    }}
}}
''',
        encoding="utf-8",
    )
    return y_samples
