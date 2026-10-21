#!/usr/bin/env python3
"""Bounded, one-shot Open3D point-cloud worker. No network listener or shell execution."""
from __future__ import annotations
import hashlib, json, math, os, sys
from pathlib import Path, PurePosixPath
from typing import Any

MAX_REQUEST_BYTES = 32 * 1024
MAX_INPUT_BYTES = 256 * 1024 * 1024
MAX_POINTS = 2_000_000
MAX_PATH_LENGTH = 512
MAX_FRAME_LENGTH = 128
MAX_CORRESPONDENCE_MM = 5_000.0
MAX_ITERATIONS = 500
FORMATS = {".ply":"PLY", ".pcd":"PCD", ".xyz":"XYZ"}
UNIT_TO_MM = {"mm":1.0, "cm":10.0, "m":1000.0, "in":25.4}

class WorkerError(Exception):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code

def fail(code: str) -> None:
    raise WorkerError(code)

def finite_number(value: Any) -> bool:
    return isinstance(value,(int,float)) and not isinstance(value,bool) and math.isfinite(value)

def validate_units(value: Any) -> float:
    if value not in UNIT_TO_MM:
        fail("EXPLICIT_UNITS_REQUIRED")
    return UNIT_TO_MM[value]

def validate_frame(value: Any) -> str:
    if not isinstance(value,str) or not value.strip() or len(value)>MAX_FRAME_LENGTH:
        fail("INVALID_COORDINATE_FRAME")
    return value.strip()

def resolve_input(relative_path: Any, root: Path) -> Path:
    if not isinstance(relative_path,str) or not relative_path or len(relative_path)>MAX_PATH_LENGTH:
        fail("INVALID_INPUT_PATH")
    requested=PurePosixPath(relative_path)
    if requested.is_absolute() or any(part in ("",".","..") for part in requested.parts):
        fail("INVALID_INPUT_PATH")
    if "\\" in relative_path or "\x00" in relative_path:
        fail("INVALID_INPUT_PATH")
    candidate=(root/Path(*requested.parts)).resolve(strict=True)
    try:
        candidate.relative_to(root)
    except ValueError:
        fail("INPUT_PATH_OUTSIDE_ROOT")
    if not candidate.is_file():
        fail("INPUT_NOT_REGULAR_FILE")
    if candidate.suffix.lower() not in FORMATS:
        fail("UNSUPPORTED_POINT_CLOUD_FORMAT")
    if candidate.stat().st_size<=0 or candidate.stat().st_size>MAX_INPUT_BYTES:
        fail("INPUT_SIZE_OUT_OF_RANGE")
    return candidate

def file_digest(path: Path) -> str:
    digest=hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024*1024),b""):
            digest.update(chunk)
    return digest.hexdigest()

def load_point_cloud(relative_path: Any, units: Any, frame: Any, root: Path):
    import numpy as np
    import open3d as o3d
    unit_scale=validate_units(units)
    coordinate_frame=validate_frame(frame)
    path=resolve_input(relative_path,root)
    before=file_digest(path)
    cloud=o3d.io.read_point_cloud(str(path),remove_nan_points=False,remove_infinite_points=False)
    points=np.asarray(cloud.points,dtype=np.float64)
    if points.ndim!=2 or points.shape[1]!=3 or points.shape[0]<3:
        fail("POINT_CLOUD_REQUIRES_AT_LEAST_THREE_POINTS")
    if points.shape[0]>MAX_POINTS:
        fail("POINT_COUNT_EXCEEDS_LIMIT")
    if not np.isfinite(points).all():
        fail("NON_FINITE_POINT_COORDINATE")
    points_mm=points*unit_scale
    if not np.isfinite(points_mm).all():
        fail("UNIT_CONVERSION_OVERFLOW")
    after=file_digest(path)
    if before!=after:
        fail("INPUT_CHANGED_DURING_READ")
    cloud.points=o3d.utility.Vector3dVector(points_mm)
    return {"cloud":cloud,"pointsMm":points_mm,"digest":before,"format":FORMATS[path.suffix.lower()],"coordinateFrame":coordinate_frame,"units":units}

def point_metrics(points_mm):
    import numpy as np
    minimum=points_mm.min(axis=0); maximum=points_mm.max(axis=0); centroid=points_mm.mean(axis=0); extent=maximum-minimum
    return {"pointCount":int(points_mm.shape[0]),
            "boundsMm":{"min":[float(v) for v in minimum],"max":[float(v) for v in maximum],"extent":[float(v) for v in extent]},
            "centroidMm":[float(v) for v in centroid]}

def validate_transform(matrix):
    import numpy as np
    value=np.asarray(matrix,dtype=np.float64)
    if value.shape!=(4,4) or not np.isfinite(value).all(): fail("INVALID_INITIAL_TRANSFORM")
    if not np.allclose(value[3,:],[0,0,0,1],atol=1e-4,rtol=0): fail("INVALID_INITIAL_TRANSFORM")
    rotation=value[:3,:3]
    if not np.allclose(rotation.T@rotation,np.eye(3),atol=5e-3,rtol=0): fail("INITIAL_TRANSFORM_ROTATION_NOT_ORTHONORMAL")
    if abs(float(np.linalg.det(rotation))-1.0)>5e-3: fail("INITIAL_TRANSFORM_NOT_PROPER_RIGID")
    return value

def run(request: dict[str,Any], root: Path) -> dict[str,Any]:
    import open3d as o3d
    operation=request.get("operation")
    schemas={
      "inspect":{"operation","path","units","coordinateFrame"},
      "register":{"operation","sourcePath","referencePath","sourceUnits","referenceUnits","sourceFrame","referenceFrame","maxCorrespondenceDistanceMm","maxIterations","initialTransform"},
    }
    if operation not in schemas: fail("UNSUPPORTED_OPERATION")
    if set(request.keys())!=schemas[operation]: fail("UNEXPECTED_OR_MISSING_REQUEST_FIELDS")
    if operation=="inspect":
        loaded=load_point_cloud(request["path"],request["units"],request["coordinateFrame"],root)
        return {"status":"MEASURED","format":loaded["format"],"units":loaded["units"],"coordinateFrame":loaded["coordinateFrame"],
                "sourceSha256":loaded["digest"],**point_metrics(loaded["pointsMm"]),
                "worker":{"name":"Open3D","version":o3d.__version__},"engineeringDesignApproved":False}
    source=load_point_cloud(request["sourcePath"],request["sourceUnits"],request["sourceFrame"],root)
    reference=load_point_cloud(request["referencePath"],request["referenceUnits"],request["referenceFrame"],root)
    distance=request["maxCorrespondenceDistanceMm"]; iterations=request["maxIterations"]
    if not finite_number(distance) or distance<=0 or distance>MAX_CORRESPONDENCE_MM: fail("INVALID_MAX_CORRESPONDENCE_DISTANCE")
    if not isinstance(iterations,int) or isinstance(iterations,bool) or iterations<1 or iterations>MAX_ITERATIONS: fail("INVALID_MAX_ITERATIONS")
    initial=validate_transform(request["initialTransform"])
    result=o3d.pipelines.registration.registration_icp(
        source["cloud"],reference["cloud"],float(distance),initial,
        o3d.pipelines.registration.TransformationEstimationPointToPoint(),
        o3d.pipelines.registration.ICPConvergenceCriteria(max_iteration=iterations))
    transform=result.transformation.tolist(); fitness=float(result.fitness); rmse=float(result.inlier_rmse)
    count=len(result.correspondence_set)
    if not(math.isfinite(fitness) and math.isfinite(rmse) and 0<=fitness<=1 and rmse>=0): fail("REGISTRATION_RETURNED_INVALID_METRICS")
    validate_transform(transform)
    return {"status":"CANDIDATE","decisionStatus":"CANDIDATE",
            "source":{"sha256":source["digest"],"pointCount":int(source["pointsMm"].shape[0]),"coordinateFrame":source["coordinateFrame"],"units":source["units"]},
            "reference":{"sha256":reference["digest"],"pointCount":int(reference["pointsMm"].shape[0]),"coordinateFrame":reference["coordinateFrame"],"units":reference["units"]},
            "algorithm":"OPEN3D_ICP_POINT_TO_POINT","transformSourceToReference":transform,
            "metrics":{"fitness":fitness,"inlierRmseMm":rmse,"correspondenceCount":count,"maxCorrespondenceDistanceMm":float(distance),"maxIterations":iterations},
            "worker":{"name":"Open3D","version":o3d.__version__},"engineeringDesignApproved":False,
            "limitations":["ICP output is a registration candidate; it is not engineering-design approval.",
            "Host code must verify hashes against trusted stored bytes and apply explicit, reviewed thresholds.",
            "Registration does not reconstruct CAD or establish scan completeness."]}

def main() -> int:
    raw=sys.stdin.buffer.readline(MAX_REQUEST_BYTES+1)
    if not raw or len(raw)>MAX_REQUEST_BYTES or not raw.endswith(b"\n"):
        sys.stdout.write(json.dumps({"status":"FAILED","errorCode":"REQUEST_SIZE_OR_FRAMING_INVALID"})+"\n")
        return 2
    try:
        request=json.loads(raw.decode("utf-8"))
        if not isinstance(request,dict): fail("REQUEST_MUST_BE_OBJECT")
        root=Path(os.environ.get("PERCEPTION_INPUT_ROOT","/work/input")).resolve(strict=True)
        if not root.is_dir(): fail("INPUT_ROOT_NOT_DIRECTORY")
        response=run(request,root)
        sys.stdout.write(json.dumps(response,separators=(",",":"),allow_nan=False)+"\n")
        return 0
    except WorkerError as error:
        sys.stdout.write(json.dumps({"status":"FAILED","errorCode":error.code},separators=(",",":"))+"\n")
        return 2
    except Exception:
        sys.stdout.write(json.dumps({"status":"FAILED","errorCode":"WORKER_INTERNAL_ERROR"},separators=(",",":"))+"\n")
        return 3

if __name__=="__main__":
    raise SystemExit(main())
