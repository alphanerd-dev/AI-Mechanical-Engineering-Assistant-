#!/usr/bin/env python3
"""Isolated, read-only OpenCascade import, topology inspection and tessellation worker.

Protocol: one bounded JSON request on stdin -> one JSON response on stdout.
Input artifacts must be direct-child files under CAD_ARTIFACT_DIR. The worker never
executes CAD source, mutates source geometry, repairs topology or writes to the mount.
"""
import base64
import json
import math
import os
import pathlib
import struct
import sys

from build123d import import_brep, import_step

MAX_REQUEST_BYTES = 16_384
MAX_ARTIFACT_BYTES = 100 * 1024 * 1024
MAX_VERTICES = 750_000
MAX_TRIANGLES = 250_000
WORKER_ID = "occt.geometry-kernel"
WORKER_VERSION = "build123d-0.13.0/OCP"


def emit(status, **values):
    print(json.dumps({
        "status": status,
        "providerId": WORKER_ID,
        "providerVersion": WORKER_VERSION,
        "errors": [],
        "limitations": [],
        **values,
    }, separators=(",", ":")))
    return 0


def fail(message):
    return emit("FAILED", errors=[message])


def finite_positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def read_request_bytes():
    raw = sys.stdin.read(MAX_REQUEST_BYTES + 1)
    if len(raw.encode("utf-8")) > MAX_REQUEST_BYTES:
        raise ValueError("Geometry request exceeds the 16384-byte limit.")
    return raw


def parse_request_object(raw):
    request = json.loads(raw)
    if not isinstance(request, dict):
        raise ValueError("Geometry request must be a JSON object.")
    return request


def validate_request_fields(request):
    allowed = {"operation", "format", "artifactPath", "linearDeflectionMm", "angularDeflectionRad"}
    unknown = sorted(set(request) - allowed)
    if unknown:
        raise ValueError("Geometry request contains unsupported fields: " + ", ".join(unknown))


def validate_request_operation(request):
    if request.get("operation") not in {"INSPECT", "TESSELLATE"}:
        raise ValueError("Geometry operation must be INSPECT or TESSELLATE.")
    if request.get("format") not in {"BREP", "STEP"}:
        raise ValueError("Geometry format must be BREP or STEP.")


def read_request():
    request = parse_request_object(read_request_bytes())
    validate_request_fields(request)
    validate_request_operation(request)
    return request


def validate_artifact_name(artifact_path, expected_format):
    if not isinstance(artifact_path, str) or not artifact_path.startswith("/artifacts/"):
        raise ValueError("artifactPath must identify a file inside /artifacts.")
    name = pathlib.PurePosixPath(artifact_path).name
    if name != artifact_path.removeprefix("/artifacts/"):
        raise ValueError("Only a direct-child geometry artifact is accepted.")
    suffix = ".brep" if expected_format == "BREP" else ".step"
    if not name.lower().endswith(suffix):
        raise ValueError("Geometry artifact extension does not match the declared format.")
    return name


def resolve_artifact_root():
    return pathlib.Path(os.environ.get("CAD_ARTIFACT_DIR", "/artifacts")).resolve(strict=True)


def validate_artifact_file(root, name):
    candidate = (root / name).resolve(strict=True)
    candidate.relative_to(root)
    if candidate.parent != root or not candidate.is_file():
        raise ValueError("Geometry artifact must be a regular direct-child file.")
    size = candidate.stat().st_size
    if size <= 0 or size > MAX_ARTIFACT_BYTES:
        raise ValueError("Geometry artifact must contain 1 byte to 100 MiB.")
    return candidate


def resolve_artifact(artifact_path, expected_format):
    name = validate_artifact_name(artifact_path, expected_format)
    root = resolve_artifact_root()
    return validate_artifact_file(root, name)


def import_shape(path, geometry_format):
    shape = import_brep(str(path)) if geometry_format == "BREP" else import_step(str(path))
    if shape is None or shape.is_null:
        raise ValueError("OpenCascade imported a null geometry shape.")
    return shape


def inspect_shape(shape):
    return {
        "solids": len(shape.solids()),
        "shells": len(shape.shells()),
        "faces": len(shape.faces()),
        "edges": len(shape.edges()),
        "vertices": len(shape.vertices()),
        "valid": bool(shape.is_valid),
    }


def pack_float32(values):
    if not values or not all(math.isfinite(float(value)) for value in values):
        raise ValueError("Tessellation produced empty or non-finite coordinate data.")
    return struct.pack("<" + "f" * len(values), *(float(value) for value in values))


def validate_linear_deflection(value):
    if isinstance(value, bool) or not finite_positive(value) or value < 0.001 or value > 5:
        raise ValueError("linearDeflectionMm must be between 0.001 and 5 mm.")
    return float(value)


def validate_angular_deflection(value):
    if isinstance(value, bool) or not finite_positive(value) or value < 0.01 or value > 1.5707963267948966:
        raise ValueError("angularDeflectionRad must be between 0.01 and pi/2 radians.")
    return float(value)


def validate_deflection(request):
    linear = validate_linear_deflection(request.get("linearDeflectionMm", 0.1))
    angular = validate_angular_deflection(request.get("angularDeflectionRad", 0.35))
    return linear, angular


def validate_tessellation_counts(positions, triangles, normals):
    vertex_count = len(positions)
    triangle_count = len(triangles)
    if vertex_count < 3 or vertex_count > MAX_VERTICES:
        raise ValueError("Tessellation vertex count is outside the supported 3 to 750000 range.")
    if triangle_count < 1 or triangle_count > MAX_TRIANGLES:
        raise ValueError("Tessellation triangle count is outside the supported 1 to 250000 range.")
    if len(normals) != vertex_count:
        raise ValueError("Tessellation normals do not align one-to-one with vertices.")
    return vertex_count, triangle_count


def flatten_vectors(vectors):
    return [component for vector in vectors for component in (vector.X, vector.Y, vector.Z)]


def flatten_triangle_indices(triangles):
    return [index for triangle in triangles for index in triangle]


def validate_triangle_indices(indices, vertex_count):
    if any(not isinstance(index, int) or isinstance(index, bool) or index < 0 or index >= vertex_count
           for index in indices):
        raise ValueError("Tessellation contains an out-of-range triangle index.")


def flatten_and_validate_indices(triangles, vertex_count):
    indices = flatten_triangle_indices(triangles)
    if len(indices) != len(triangles) * 3:
        raise ValueError("Tessellation contains malformed triangle data.")
    validate_triangle_indices(indices, vertex_count)
    return indices


def serialize_tessellation(positions, normals, triangles, linear, angular):
    vertex_count, triangle_count = validate_tessellation_counts(positions, triangles, normals)
    flat_positions = flatten_vectors(positions)
    flat_normals = flatten_vectors(normals)
    flat_indices = flatten_and_validate_indices(triangles, vertex_count)
    position_bytes = pack_float32(flat_positions)
    normal_bytes = pack_float32(flat_normals)
    index_bytes = struct.pack("<" + "I" * len(flat_indices), *flat_indices)
    return {
        "vertexCount": vertex_count,
        "triangleCount": triangle_count,
        "positionsFloat32LE": base64.b64encode(position_bytes).decode("ascii"),
        "normalsFloat32LE": base64.b64encode(normal_bytes).decode("ascii"),
        "indicesUint32LE": base64.b64encode(index_bytes).decode("ascii"),
        "linearDeflectionMm": linear,
        "angularDeflectionRad": angular,
        "relativeDeflection": False,
        "units": "mm",
        "coordinateFrame": "MODEL",
    }


def tessellate_shape(shape, request):
    linear, angular = validate_deflection(request)
    positions, triangles, normals, _uvs = shape.tessellate_with_uvs(
        linear, angular, atlas_packing=False
    )
    return serialize_tessellation(positions, normals, triangles, linear, angular)


def main():
    try:
        request = read_request()
        artifact = resolve_artifact(request.get("artifactPath"), request["format"])
        shape = import_shape(artifact, request["format"])
        topology = inspect_shape(shape)
        if request["operation"] == "INSPECT":
            return emit("COMPLETED", topology=topology, sourceFormat=request["format"])
        mesh = tessellate_shape(shape, request)
        return emit("COMPLETED", topology=topology, tessellation=mesh, sourceFormat=request["format"])
    except (ValueError, OSError, json.JSONDecodeError, UnicodeDecodeError) as exc:
        return fail(str(exc))
    except Exception as exc:
        return fail("OpenCascade geometry operation failed: " + type(exc).__name__ + ": " + str(exc))


if __name__ == "__main__":
    raise SystemExit(main())
