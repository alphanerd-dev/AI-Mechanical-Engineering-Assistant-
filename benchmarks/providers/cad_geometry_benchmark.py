#!/usr/bin/env python3
"""Shared analytical CAD fixture and STEP export/re-import comparison.

Run one pinned CAD kernel per container. A pass is scoped to these fixtures;
it is not evidence of engineering safety, manufacturability, or universal support.
"""
from __future__ import annotations
import argparse, hashlib, json, math, os, platform, sys, time
from pathlib import Path
from typing import Any

def finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def load_backend(name: str):
    if name == "build123d":
        import build123d
        from build123d import Align, Box, Cylinder, export_step, import_step
        centered = (Align.CENTER, Align.CENTER, Align.CENTER)
        def construct(fixture):
            p = fixture["parameters"]
            if fixture["kind"] == "BOX":
                return Box(p["lengthMm"], p["widthMm"], p["heightMm"], align=centered)
            if fixture["kind"] == "CYLINDER":
                return Cylinder(p["radiusMm"], p["heightMm"], align=centered)
            if fixture["kind"] == "PLATE_WITH_THROUGH_HOLE":
                plate = Box(p["lengthMm"], p["widthMm"], p["thicknessMm"], align=centered)
                tool = Cylinder(p["holeRadiusMm"], p["thicknessMm"] + 2, align=centered)
                return plate - tool
            raise ValueError("Unsupported fixture kind")
        def export(shape, destination): export_step(shape, str(destination))
        def reload_shape(destination): return import_step(str(destination))
        def metrics(shape):
            bounds = shape.bounding_box().size
            return {"valid": bool(shape.is_valid), "solidCount": len(list(shape.solids())),
                    "volumeMm3": float(shape.compute_volume()),
                    "boundingBoxMm": {"x": float(bounds.X), "y": float(bounds.Y), "z": float(bounds.Z)}}
        return getattr(build123d, "__version__", "unknown"), construct, export, reload_shape, metrics

    if name == "cadquery":
        import cadquery as cq
        def construct(fixture):
            p = fixture["parameters"]
            if fixture["kind"] == "BOX":
                return cq.Workplane("XY").box(p["lengthMm"], p["widthMm"], p["heightMm"], centered=(True, True, True)).val()
            if fixture["kind"] == "CYLINDER":
                h = p["heightMm"]
                return cq.Workplane("XY").circle(p["radiusMm"]).extrude(h).translate((0, 0, -h / 2)).val()
            if fixture["kind"] == "PLATE_WITH_THROUGH_HOLE":
                t = p["thicknessMm"]
                plate = cq.Workplane("XY").box(p["lengthMm"], p["widthMm"], t, centered=(True, True, True))
                tool = cq.Workplane("XY").circle(p["holeRadiusMm"]).extrude(t + 2).translate((0, 0, -(t + 2) / 2))
                return plate.cut(tool).val()
            raise ValueError("Unsupported fixture kind")
        def export(shape, destination): cq.exporters.export(shape, str(destination), exportType="STEP")
        def reload_shape(destination): return cq.importers.importStep(str(destination)).val()
        def metrics(shape):
            bounds = shape.BoundingBox()
            return {"valid": bool(shape.isValid()), "solidCount": len(list(shape.Solids())),
                    "volumeMm3": float(shape.Volume()),
                    "boundingBoxMm": {"x": float(bounds.xlen), "y": float(bounds.ylen), "z": float(bounds.zlen)}}
        return getattr(cq, "__version__", "unknown"), construct, export, reload_shape, metrics
    raise ValueError("Unsupported backend: " + name)

def compare(fixture, measured):
    errors = []
    expected, tol = fixture["expected"], fixture["tolerance"]
    if measured.get("valid") is not expected["valid"]: errors.append("topology_validity_mismatch")
    if measured.get("solidCount") != expected["solidCount"]: errors.append("solid_count_mismatch")
    volume = measured.get("volumeMm3")
    limit = max(tol["volumeAbsoluteMm3"], abs(expected["volumeMm3"]) * tol["volumeRelative"])
    if not finite_number(volume) or abs(volume - expected["volumeMm3"]) > limit:
        errors.append("analytical_volume_out_of_tolerance")
    for axis, size in expected["boundingBoxMm"].items():
        value = measured.get("boundingBoxMm", {}).get(axis)
        if not finite_number(value) or abs(value - size) > tol["dimensionAbsoluteMm"]:
            errors.append("bounding_box_" + axis + "_out_of_tolerance")
    return errors

def run(backend, manifest_path, output_path):
    fixture_bytes = manifest_path.read_bytes()
    manifest = json.loads(fixture_bytes)
    if manifest.get("schemaVersion") != 1 or manifest.get("units") != "mm":
        raise ValueError("Unsupported fixture schema or units")
    version, construct, export, reload_shape, metrics = load_backend(backend)
    rows = []
    for fixture in manifest["geometry"]:
        item = {"fixtureId": fixture["id"], "kind": fixture["kind"], "errors": []}
        step_path = output_path.parent / (backend + "-" + fixture["id"] + ".step")
        try:
            original = construct(fixture)
            original_metrics = metrics(original)
            export(original, step_path)
            if not step_path.is_file() or step_path.stat().st_size <= 0:
                raise RuntimeError("STEP exporter produced no non-empty file")
            restored = reload_shape(step_path)
            restored_metrics = metrics(restored)
            errors = compare(fixture, original_metrics)
            errors.extend("roundtrip_" + e for e in compare(fixture, restored_metrics))
            item.update({"status": "PASS" if not errors else "FAIL",
                         "original": original_metrics, "stepRoundTrip": restored_metrics,
                         "stepBytes": step_path.stat().st_size,
                         "stepSha256": hashlib.sha256(step_path.read_bytes()).hexdigest(),
                         "errors": errors})
        except Exception as exc:
            item.update({"status": "ERROR", "errors": ["benchmark_exception"],
                         "errorType": type(exc).__name__, "error": str(exc)[:500]})
        rows.append(item)
    report = {
        "schemaVersion": 1, "benchmarkId": manifest["benchmarkId"], "backend": backend,
        "providerVersion": version, "pythonVersion": platform.python_version(),
        "platform": platform.platform(), "sourceRevision": os.environ.get("GITHUB_SHA", "local-unpinned"),
        "fixtureManifestSha256": hashlib.sha256(fixture_bytes).hexdigest(),
        "executedAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "fixtureCount": len(rows), "passed": sum(r["status"] == "PASS" for r in rows),
        "failed": sum(r["status"] != "PASS" for r in rows), "results": rows,
        "scopeNote": "Fixture-specific CAD geometry acceptance only; not manufacturability, stress safety, or generic provider certification."
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--backend", choices=("build123d", "cadquery"), required=True)
    parser.add_argument("--fixture-file", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = run(args.backend, args.fixture_file, args.output)
    print(json.dumps(report, indent=2, sort_keys=True))
    if report["failed"]: raise SystemExit(1)

if __name__ == "__main__": main()
