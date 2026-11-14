"""Deterministic dictionary generation for the laminar-channel case."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class BlockMeshParameters:
    streamwise_length: float
    half_height: float
    depth: float
    cells: int


def foam_header(object_name: str, location: str, class_name: str) -> str:
    return f'''FoamFile
{{
    format      ascii;
    class       {class_name};
    location    "{location}";
    object      {object_name};
}}
'''


def write_block_mesh(case_dir: Path, parameters: BlockMeshParameters) -> None:
    streamwise_length = parameters.streamwise_length
    half_height = parameters.half_height
    depth = parameters.depth
    cells = parameters.cells
    content = f'''{foam_header("blockMeshDict", "system", "dictionary")}
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
    (case_dir / "system" / "blockMeshDict").write_text(content, encoding="utf-8")


def write_initial_fields(case_dir: Path) -> None:
    velocity = foam_header("U", "0", "volVectorField") + '''dimensions      [velocity];
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
'''
    pressure = foam_header("p", "0", "volScalarField") + '''dimensions      [kinematicPressure];
internalField   uniform 0;
boundaryField
{
    wall
    {
        type zeroGradient;
    }
    #includeEtc "caseDicts/setConstraintTypes"
}
'''
    (case_dir / "0" / "U").write_text(velocity, encoding="utf-8")
    (case_dir / "0" / "p").write_text(pressure, encoding="utf-8")


def write_physical_properties(case_dir: Path, viscosity: float) -> None:
    content = (
        foam_header("physicalProperties", "constant", "dictionary")
        + f"viscosityModel constant;\nnu {viscosity:.12g};\n"
    )
    (case_dir / "constant" / "physicalProperties").write_text(content, encoding="utf-8")


def write_momentum_transport(case_dir: Path) -> None:
    content = foam_header("momentumTransport", "constant", "dictionary") + "simulationType laminar;\n"
    (case_dir / "constant" / "momentumTransport").write_text(content, encoding="utf-8")


def write_body_force_model(case_dir: Path, body_force: float) -> None:
    content = foam_header("fvModels", "constant", "dictionary") + f'''momentumSource
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
'''
    (case_dir / "constant" / "fvModels").write_text(content, encoding="utf-8")


def write_control_dictionary(case_dir: Path, iterations: int) -> None:
    content = foam_header("controlDict", "system", "dictionary") + f'''solver incompressibleFluid;
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
'''
    (case_dir / "system" / "controlDict").write_text(content, encoding="utf-8")


def write_fv_schemes(case_dir: Path) -> None:
    content = foam_header("fvSchemes", "system", "dictionary") + '''ddtSchemes
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
'''
    (case_dir / "system" / "fvSchemes").write_text(content, encoding="utf-8")


def write_fv_solution(case_dir: Path, tolerance: float) -> None:
    content = foam_header("fvSolution", "system", "dictionary") + f'''solvers
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
'''
    (case_dir / "system" / "fvSolution").write_text(content, encoding="utf-8")


def write_velocity_probes(case_dir: Path, y_samples: list[float]) -> None:
    points = "\n".join(f"            (0 {y:.12g} 0)" for y in y_samples)
    content = f'''functions
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
'''
    (case_dir / "system" / "functions").write_text(content, encoding="utf-8")


def write_case(case_dir: Path, request: dict) -> list[float]:
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

    write_block_mesh(
        case_dir,
        BlockMeshParameters(streamwise_length, half_height, depth, cells)
    )
    write_initial_fields(case_dir)
    write_physical_properties(case_dir, viscosity)
    write_momentum_transport(case_dir)
    write_body_force_model(case_dir, body_force)
    write_control_dictionary(case_dir, iterations)
    write_fv_schemes(case_dir)
    write_fv_solution(case_dir, tolerance)
    write_velocity_probes(case_dir, y_samples)
    return y_samples
