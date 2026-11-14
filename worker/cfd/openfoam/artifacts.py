"""Content-addressed artifact packaging and retention."""

from __future__ import annotations

import hashlib
import re
import shutil
import tarfile
from pathlib import Path
from typing import Any

def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def latest_time_directory(case_dir: Path) -> Path:
    candidates: list[tuple[float, Path]] = []
    for child in case_dir.iterdir():
        if child.is_dir():
            try:
                candidates.append((float(child.name), child))
            except ValueError:
                continue
    if not candidates:
        raise WorkerError("OpenFOAM did not write a final time directory.")
    return max(candidates, key=lambda item: item[0])[1]


def make_artifact(artifact_dir: Path, kind: str, filename: str, media_type: str) -> dict[str, str]:
    path = artifact_dir / filename
    return {
        "kind": kind,
        "path": f"artifacts/{filename}",
        "mediaType": media_type,
        "sha256": sha256_file(path),
    }


def prune_artifacts(artifact_root: Path, keep_latest: int = 50) -> None:
    directories = [
        child for child in artifact_root.iterdir()
        if child.is_dir() and re.fullmatch(r"[a-f0-9]{32}", child.name)
    ]
    directories.sort(key=lambda child: child.stat().st_mtime, reverse=True)
    for stale in directories[keep_latest:]:
        shutil.rmtree(stale, ignore_errors=True)
