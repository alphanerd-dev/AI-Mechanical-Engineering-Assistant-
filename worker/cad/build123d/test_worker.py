import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).parents[1]))

from build123d_worker import read_artifact_manifest


class Build123dWorkerManifestTests(unittest.TestCase):
    def test_valid_manifest_returns_only_existing_confined_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"part.step").write_bytes(b"step")
            (root/"part.stl").write_bytes(b"stl")
            (root/"cad-artifacts.json").write_text(json.dumps({
                "schemaVersion":1,
                "artifacts":{
                    "stepArtifactPath":"part.step",
                    "stlArtifactPath":"part.stl"
                }
            }))
            result=read_artifact_manifest(root)
            self.assertEqual(result["stepArtifactPath"],str(root/"part.step"))
            self.assertEqual(result["stlArtifactPath"],str(root/"part.stl"))

    def test_manifest_rejects_path_escape(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"cad-artifacts.json").write_text(json.dumps({
                "schemaVersion":1,
                "artifacts":{"stepArtifactPath":"../outside.step"}
            }))
            with self.assertRaises(ValueError):
                read_artifact_manifest(root)

    def test_manifest_rejects_missing_artifact(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            (root/"cad-artifacts.json").write_text(json.dumps({
                "schemaVersion":1,
                "artifacts":{"stepArtifactPath":"missing.step"}
            }))
            with self.assertRaises(ValueError):
                read_artifact_manifest(root)

    def test_missing_manifest_is_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertEqual(read_artifact_manifest(Path(tmp)),{})


if __name__=="__main__":
    unittest.main()
