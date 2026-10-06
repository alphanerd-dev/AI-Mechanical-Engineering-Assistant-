#!/usr/bin/env python3
"""Bounded Gmsh -> CalculiX reference worker.

Protocol: one JSON request on stdin -> one JSON response on stdout.

V1.18 intentionally proves the open toolchain with a deterministic cantilever-box
benchmark. Generic CAD-to-mesh ingestion remains a later provider/runtime concern.
The outer container must enforce network, filesystem, CPU, memory and PID limits.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import re
import subprocess
import sys
import tempfile
from typing import Iterable

import gmsh

MAX_REQUEST_BYTES = 100_000
BENCHMARK = "cantilever_box"
GMSH_VERSION = "4.15.2"
ALLOWED_ANALYSIS = "STATIC_STRUCTURAL"
ALLOWED_ELEMENT_TYPE = "C3D4"

def fail(message: str) -> None:
    print(json.dumps({"success": False, "error": message, "warnings": []}))
    raise SystemExit(1)

def confined_path(root: pathlib.Path, relative: str) -> pathlib.Path:
    root = root.resolve()
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise ValueError("Artifact path escapes the artifact directory.") from exc
    return candidate

def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()

def run_command(command: list[str], cwd: pathlib.Path, timeout: float) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, cwd=str(cwd), capture_output=True, text=True, timeout=timeout, shell=False)

def calculix_version() -> str:
    result = subprocess.run(["ccx", "-v"], capture_output=True, text=True, shell=False)
    text = (result.stdout + "\n" + result.stderr).strip()
    match = re.search(r"(?i)version\s+([0-9]+\.[0-9]+)", text)
    return match.group(1) if match else "unknown"

def generate_tetra_mesh(length_mm: float, width_mm: float, height_mm: float, element_size_mm: float):
    gmsh.initialize()
    try:
        gmsh.option.setNumber("General.Terminal", 0)
        gmsh.option.setNumber("Mesh.ElementOrder", 1)
        gmsh.option.setNumber("Mesh.MeshSizeMin", element_size_mm)
        gmsh.option.setNumber("Mesh.MeshSizeMax", element_size_mm)
        gmsh.option.setNumber("Mesh.MeshSizeFromCurvature", 0)
        gmsh.option.setNumber("Mesh.MeshSizeExtendFromBoundary", 1)
        gmsh.model.add("cantilever_box")
        gmsh.model.occ.addBox(0.0, 0.0, 0.0, length_mm, width_mm, height_mm)
        gmsh.model.occ.synchronize()
        gmsh.model.mesh.generate(3)
        gmsh.model.mesh.setOrder(1)

        node_tags, coordinates, _ = gmsh.model.mesh.getNodes()
        element_tags, element_nodes = gmsh.model.mesh.getElementsByType(4)
        if len(node_tags) == 0 or len(element_tags) == 0:
            raise ValueError("Gmsh generated an empty tetrahedral mesh.")

        nodes = {}
        for index, tag in enumerate(node_tags):
            nodes[int(tag)] = (
                float(coordinates[index * 3]),
                float(coordinates[index * 3 + 1]),
                float(coordinates[index * 3 + 2]),
            )
        elements = []
        for index, tag in enumerate(element_tags):
            offset = index * 4
            elements.append((
                int(tag),
                [int(value) for value in element_nodes[offset:offset + 4]]
            ))

        min_x = min(value[0] for value in nodes.values())
        max_x = max(value[0] for value in nodes.values())
        tolerance = max(1e-8, element_size_mm * 1e-6)
        fixed_nodes = [tag for tag, point in nodes.items() if abs(point[0] - min_x) <= tolerance]
        load_nodes = [tag for tag, point in nodes.items() if abs(point[0] - max_x) <= tolerance]
        if not fixed_nodes or not load_nodes:
            raise ValueError("Gmsh mesh did not expose both boundary node sets.")

        return nodes, elements, fixed_nodes, load_nodes
    finally:
        gmsh.finalize()

def fmt(value: float) -> str:
    return f"{value:.12e}"

def write_inp(path: pathlib.Path, nodes: dict[int, tuple[float, float, float]], elements, fixed_nodes: Iterable[int], load_nodes: Iterable[int], youngs_modulus_mpa: float, poisson_ratio: float, total_force_n: float):
    fixed = list(fixed_nodes)
    loaded = list(load_nodes)
    if not loaded:
        raise ValueError("Load node set cannot be empty.")
    nodal_force = total_force_n / len(loaded)
    with path.open("w", encoding="utf-8") as handle:
        handle.write("*HEADING\n")
        handle.write("V1.18 Gmsh to CalculiX reference benchmark\n")
        handle.write("*NODE,NSET=NALL\n")
        for tag in sorted(nodes):
            x, y, z = nodes[tag]
            handle.write(f"{tag},{fmt(x)},{fmt(y)},{fmt(z)}\n")
        handle.write("*ELEMENT,TYPE=C3D4,ELSET=EALL\n")
        for tag, connectivity in elements:
            handle.write(f"{tag}," + ",".join(str(value) for value in connectivity) + "\n")
        handle.write("*NSET,NSET=FIXED\n")
        for start in range(0, len(fixed), 12):
            handle.write(",".join(str(value) for value in fixed[start:start + 12]) + "\n")
        handle.write("*NSET,NSET=LOAD\n")
        for start in range(0, len(loaded), 12):
            handle.write(",".join(str(value) for value in loaded[start:start + 12]) + "\n")
        handle.write("*MATERIAL,NAME=STEEL\n")
        handle.write("*ELASTIC\n")
        handle.write(f"{fmt(youngs_modulus_mpa)},{fmt(poisson_ratio)}\n")
        handle.write("*SOLID SECTION,ELSET=EALL,MATERIAL=STEEL\n")
        handle.write("*STEP\n")
        handle.write("*STATIC\n")
        handle.write("1.,1.,1e-8,1.\n")
        handle.write("*BOUNDARY\n")
        handle.write("FIXED,1,3,0.\n")
        handle.write("*CLOAD\n")
        for tag in loaded:
            handle.write(f"{tag},2,{fmt(-nodal_force)}\n")
        handle.write("*NODE PRINT,NSET=NALL\n")
        handle.write("U\n")
        handle.write("*NODE PRINT,NSET=FIXED\n")
        handle.write("RF\n")
        handle.write("*EL PRINT,ELSET=EALL\n")
        handle.write("S\n")
        handle.write("*NODE FILE\n")
        handle.write("U,RF\n")
        handle.write("*EL FILE\n")
        handle.write("S\n")
        handle.write("*END STEP\n")

def parse_dat(path: pathlib.Path):
    mode = None
    max_displacement = None
    max_von_mises = None
    reaction = [0.0, 0.0, 0.0]
    saw_displacement = False
    saw_stress = False
    saw_reaction = False

    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.strip()
        lower = line.lower()
        if lower.startswith("displacements"):
            mode = "u"
            saw_displacement = True
            continue
        if lower.startswith("stresses"):
            mode = "s"
            saw_stress = True
            continue
        if lower.startswith("reaction forces"):
            mode = "rf"
            saw_reaction = True
            continue
        if not line:
            mode = None
            continue
        if mode is None:
            continue
        parts = line.split()
        try:
            if mode == "u" and len(parts) >= 4:
                values = [float(value) for value in parts[1:4]]
                magnitude = math.sqrt(sum(value * value for value in values))
                max_displacement = magnitude if max_displacement is None else max(max_displacement, magnitude)
            elif mode == "rf" and len(parts) >= 4:
                for index in range(3):
                    reaction[index] += float(parts[index + 1])
            elif mode == "s" and len(parts) >= 8:
                sxx, syy, szz, sxy, sxz, syz = [float(value) for value in parts[2:8]]
                mises = math.sqrt(
                    0.5 * ((sxx - syy) ** 2 + (syy - szz) ** 2 + (szz - sxx) ** 2)
                    + 3.0 * (sxy ** 2 + sxz ** 2 + syz ** 2)
                )
                max_von_mises = mises if max_von_mises is None else max(max_von_mises, mises)
        except (TypeError, ValueError):
            continue

    if not saw_displacement or max_displacement is None:
        raise ValueError("CalculiX .dat output did not contain displacement results.")
    if not saw_stress or max_von_mises is None:
        raise ValueError("CalculiX .dat output did not contain stress results.")
    return max_displacement, max_von_mises, (reaction if saw_reaction else None)

def artifact(root: pathlib.Path, path: pathlib.Path, kind: str, media_type: str):
    relative = str(path.resolve().relative_to(root.resolve()))
    return {
        "kind": kind,
        "path": relative,
        "mediaType": media_type,
        "sha256": sha256_file(path),
    }

def main():
    raw = sys.stdin.read()
    if len(raw.encode("utf-8")) > MAX_REQUEST_BYTES:
        fail("Request exceeds worker limit.")
    try:
        request = json.loads(raw)
    except json.JSONDecodeError:
        fail("Invalid JSON request.")

    if request.get("analysis") != ALLOWED_ANALYSIS:
        fail("Only STATIC_STRUCTURAL analysis is supported.")
    if request.get("benchmark") != BENCHMARK:
        fail("The V1.18 reference runtime requires benchmark=cantilever_box.")
    material = request.get("material") or {}
    youngs_modulus_mpa = material.get("youngsModulusMpa")
    poisson_ratio = material.get("poissonRatio")
    total_force_n = request.get("totalForceN")
    dimensions = request.get("dimensionsMm") or {}
    element_size_mm = request.get("elementSizeMm")
    if not all(isinstance(value, (int, float)) and math.isfinite(value) and value > 0 for value in (youngs_modulus_mpa, total_force_n, element_size_mm)):
        fail("Material stiffness, total force and element size must be positive finite numbers.")
    if not isinstance(poisson_ratio, (int, float)) or not math.isfinite(poisson_ratio) or not -1 < poisson_ratio < 0.5:
        fail("Poisson ratio is invalid.")
    if not all(isinstance(dimensions.get(key), (int, float)) and math.isfinite(dimensions[key]) and dimensions[key] > 0 for key in ("length","width","height")):
        fail("All benchmark dimensions must be positive finite numbers.")

    artifact_dir = pathlib.Path(os.environ.get("FEA_ARTIFACT_DIR", tempfile.mkdtemp(prefix="fea-artifacts-")))
    artifact_dir.mkdir(parents=True, exist_ok=True)
    job_name = "v1_18_cantilever"
    inp_path = artifact_dir / f"{job_name}.inp"

    try:
        nodes, elements, fixed_nodes, load_nodes = generate_tetra_mesh(
            float(dimensions["length"]),
            float(dimensions["width"]),
            float(dimensions["height"]),
            float(element_size_mm),
        )
        write_inp(
            inp_path, nodes, elements, fixed_nodes, load_nodes,
            float(youngs_modulus_mpa), float(poisson_ratio), float(total_force_n)
        )
        completed = run_command(["ccx", "-i", job_name], artifact_dir, float(request.get("timeoutMs", 30000)) / 1000.0)
    except subprocess.TimeoutExpired:
        fail("CalculiX worker timed out.")
    except Exception as exc:
        fail(f"FEA worker failed: {exc}")

    dat_path = artifact_dir / f"{job_name}.dat"
    frd_path = artifact_dir / f"{job_name}.frd"
    sta_path = artifact_dir / f"{job_name}.sta"
    if completed.returncode != 0:
        print(json.dumps({
            "success": False,
            "analysis": ALLOWED_ANALYSIS,
            "solver": "calculix",
            "solverVersion": calculix_version(),
            "exitCode": completed.returncode,
            "stdout": completed.stdout[-20000:],
            "stderr": completed.stderr[-20000:],
            "warnings": [],
            "error": "CalculiX did not exit successfully.",
        }))
        raise SystemExit(1)

    try:
        max_displacement, max_von_mises, reaction = parse_dat(dat_path)
        required_files = [inp_path, dat_path, frd_path, sta_path]
        for path in required_files:
            if not path.is_file() or path.stat().st_size == 0:
                raise ValueError(f"Expected solver artifact is missing or empty: {path.name}.")
        result = {
            "success": True,
            "analysis": ALLOWED_ANALYSIS,
            "solver": "calculix",
            "solverVersion": calculix_version(),
            "converged": True,
            "exitCode": completed.returncode,
            "mesh": {
                "nodeCount": len(nodes),
                "elementCount": len(elements),
                "elementType": ALLOWED_ELEMENT_TYPE,
            },
            "maxVonMisesStressMpa": max_von_mises,
            "maxDisplacementMm": max_displacement,
            "reactionForcesN": None if reaction is None else {"x": reaction[0], "y": reaction[1], "z": reaction[2]},
            "artifacts": [
                artifact(artifact_dir, inp_path, "FEA_MODEL", "text/plain"),
                artifact(artifact_dir, dat_path, "FEA_RESULT", "text/plain"),
                artifact(artifact_dir, frd_path, "FEA_RESULT", "application/octet-stream"),
                artifact(artifact_dir, sta_path, "FEA_RESULT", "text/plain"),
            ],
            "warnings": [],
            "stdout": completed.stdout[-20000:],
            "stderr": completed.stderr[-20000:],
            "gmshVersion": GMSH_VERSION,
        }
        print(json.dumps(result))
    except Exception as exc:
        fail(f"FEA result normalization failed: {exc}")

if __name__ == "__main__":
    main()
