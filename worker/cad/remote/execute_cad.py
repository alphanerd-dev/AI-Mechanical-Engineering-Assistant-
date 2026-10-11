#!/usr/bin/env python3
"""Generate only the bounded, deterministic cylinder/shaft CAD contract.

This worker deliberately does not execute the supplied source. It verifies that the
source is exactly the application's known deterministic template, then constructs
the specified primitive through the build123d API in this isolated child process.
"""
from __future__ import annotations

import json
import math
import os
import pathlib
import sys
import hashlib

from build123d import Align, Cylinder, Mesher, export_brep, export_step, export_stl

MAX_SOURCE_BYTES = 250_000
MAX_DIMENSION_MM = 10_000.0
MIN_DIMENSION_MM = 0.01


def finite_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def format_number(value: float) -> str:
    if not math.isfinite(value):
        raise ValueError("CAD dimensions must be finite.")
    rounded = float(f"{value:.9f}")
    if rounded == 0:
        return "0"
    return format(rounded, ".9f").rstrip("0").rstrip(".")


def expected_source(name: str, diameter_mm: float, length_mm: float) -> str:
    radius_mm = format_number(diameter_mm / 2)
    length_text = format_number(length_mm)
    source = [
        "from pathlib import Path",
        "import json",
        "import os",
        "from build123d import Align, Cylinder, Mesher, export_brep, export_step, export_stl",
        "",
        "output_dir = Path(os.environ['CAD_ARTIFACT_DIR'])",
        "part = Cylinder(radius=" + radius_mm + ", height=" + length_text + ", align=(Align.CENTER, Align.CENTER, Align.MIN))",
        "export_brep(part, output_dir / 'part.brep')",
        "export_step(part, output_dir / 'part.step')",
        "export_stl(part, output_dir / 'part.stl')",
        "mesher = Mesher()",
        "mesher.add_shape(part)",
        "mesher.write(output_dir / 'part.3mf')",
        "manifest = {",
        "    'schemaVersion': 1,",
        "    'artifacts': {",
        "        'solidArtifactPath': 'part.brep',",
        "        'stepArtifactPath': 'part.step',",
        "        'stlArtifactPath': 'part.stl',",
        "        'threeMfArtifactPath': 'part.3mf',",
        "    },",
        "}",
        "(output_dir / 'cad-artifacts.json').write_text(json.dumps(manifest), encoding='utf-8')",
        ""
    ]
    return "# Deterministic " + name + " generator; dimensions are millimetres.\n" + "\n".join(source)


def main() -> int:
    raw = sys.stdin.read(MAX_SOURCE_BYTES + 65_536)
    try:
        request = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("CAD execution request must be valid JSON.")
    if not isinstance(request, dict):
        raise ValueError("CAD execution request must be a JSON object.")

    source = request.get("source")
    if not isinstance(source, str) or not source or len(source.encode("utf-8")) > MAX_SOURCE_BYTES:
        raise ValueError("CAD source is missing or exceeds the bounded source size.")
    parameters = request.get("parameters")
    if not isinstance(parameters, dict):
        raise ValueError("A deterministic CAD specification is required.")
    if parameters.get("kind") != "CYLINDER" or parameters.get("name") not in ("shaft", "cylinder"):
        raise ValueError("Only a deterministic cylindrical shaft/cylinder is supported.")
    diameter = parameters.get("diameterMm")
    length = parameters.get("lengthMm")
    if not finite_number(diameter) or not finite_number(length):
        raise ValueError("Diameter and length must be finite numeric millimetre values.")
    diameter = float(diameter)
    length = float(length)
    if not (MIN_DIMENSION_MM <= diameter <= MAX_DIMENSION_MM and MIN_DIMENSION_MM <= length <= MAX_DIMENSION_MM):
        raise ValueError("Diameter and length must each be between 0.01 mm and 10000 mm.")

    expected = expected_source(parameters["name"], diameter, length)
    if source != expected:
        raise ValueError("CAD source does not match the trusted deterministic generator template; source execution is not permitted.")

    output_setting = os.environ.get("CAD_ARTIFACT_DIR", "").strip()
    if not output_setting or not pathlib.Path(output_setting).is_absolute():
        raise ValueError("A trusted absolute output directory is required.")
    output_dir = pathlib.Path(output_setting).resolve()
    output_dir.mkdir(mode=0o700, parents=True, exist_ok=False)
    (output_dir / "source.py").write_text(source, encoding="utf-8")
    os.environ["CAD_ARTIFACT_DIR"] = str(output_dir)

    part = Cylinder(
        radius=diameter / 2,
        height=length,
        align=(Align.CENTER, Align.CENTER, Align.MIN)
    )
    export_brep(part, output_dir / "part.brep")
    export_step(part, output_dir / "part.step")
    export_stl(part, output_dir / "part.stl")
    mesher = Mesher()
    mesher.add_shape(part)
    mesher.write(output_dir / "part.3mf")

    names = {
        "source": "source.py",
        "solid": "part.brep",
        "step": "part.step",
        "stl": "part.stl",
        "threeMf": "part.3mf"
    }
    manifest = {}
    for key, name in names.items():
        path = output_dir / name
        if not path.is_file() or path.stat().st_size < 1:
            raise RuntimeError("Generated artifact is missing or empty: " + key)
        if path.stat().st_size > 4 * 1024 * 1024:
            raise RuntimeError("Generated artifact exceeds the 4 MiB per-artifact limit: " + key)
        data = path.read_bytes()
        manifest[key] = {
            "filename": name,
            "contentBase64": __import__("base64").b64encode(data).decode("ascii"),
            "sha256": hashlib.sha256(data).hexdigest(),
            "sizeBytes": len(data)
        }
    if sum(item["sizeBytes"] for item in manifest.values()) > 8 * 1024 * 1024:
        raise RuntimeError("Generated artifact bundle exceeds the 8 MiB total limit.")

    print(json.dumps({
        "success": True,
        "backend": "build123d",
        "artifacts": manifest,
        "warnings": []
    }, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"success": False, "backend": "build123d", "error": str(exc), "warnings": []}), flush=True)
        raise SystemExit(0)
