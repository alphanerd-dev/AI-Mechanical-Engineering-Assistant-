from __future__ import annotations
import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path
import numpy as np
import open3d as o3d

WORKER=Path(__file__).with_name("open3d_worker.py")

class Open3DWorkerTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.env={**os.environ,"PERCEPTION_INPUT_ROOT":str(self.root)}
        grid=np.array([[x*10.0,y*10.0,z*10.0] for x in range(4) for y in range(4) for z in range(4)],dtype=np.float64)
        cloud=o3d.geometry.PointCloud()
        cloud.points=o3d.utility.Vector3dVector(grid)
        self.cloud_path=self.root/"fixture.ply"
        self.assertTrue(o3d.io.write_point_cloud(str(self.cloud_path),cloud,write_ascii=False))

    def tearDown(self):
        self.temp.cleanup()

    def invoke(self,request):
        completed=subprocess.run([sys.executable,"-I",str(WORKER)],
            input=json.dumps(request).encode("utf-8")+b"\n",stdout=subprocess.PIPE,stderr=subprocess.PIPE,
            env=self.env,timeout=90,check=False)
        self.assertEqual(completed.stderr,b"","Worker must not emit raw diagnostics to stderr.")
        self.assertLessEqual(len(completed.stdout),64*1024)
        return completed.returncode,json.loads(completed.stdout.decode("utf-8"))

    def test_inspect_returns_explicit_units_and_metrics(self):
        code,response=self.invoke({"operation":"inspect","path":"fixture.ply","units":"mm","coordinateFrame":"fixture-frame"})
        self.assertEqual(code,0)
        self.assertEqual(response["status"],"MEASURED")
        self.assertEqual(response["pointCount"],64)
        self.assertEqual(response["boundsMm"]["extent"],[30.0,30.0,30.0])
        self.assertEqual(len(response["sourceSha256"]),64)
        self.assertFalse(response["engineeringDesignApproved"])

    def test_registration_is_candidate_only(self):
        code,response=self.invoke({"operation":"register","sourcePath":"fixture.ply","referencePath":"fixture.ply",
            "sourceUnits":"mm","referenceUnits":"mm","sourceFrame":"scan-frame","referenceFrame":"reference-frame",
            "maxCorrespondenceDistanceMm":1.0,"maxIterations":10,
            "initialTransform":[[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]]})
        self.assertEqual(code,0)
        self.assertEqual(response["status"],"CANDIDATE")
        self.assertGreaterEqual(response["metrics"]["fitness"],0.99)
        self.assertLessEqual(response["metrics"]["inlierRmseMm"],1e-9)
        self.assertEqual(response["metrics"]["correspondenceCount"],64)
        self.assertFalse(response["engineeringDesignApproved"])

    def test_bad_units_and_traversal_fail_closed(self):
        code,response=self.invoke({"operation":"inspect","path":"fixture.ply","units":"unknown","coordinateFrame":"fixture-frame"})
        self.assertNotEqual(code,0)
        self.assertEqual(response["errorCode"],"EXPLICIT_UNITS_REQUIRED")
        code,response=self.invoke({"operation":"inspect","path":"../outside.ply","units":"mm","coordinateFrame":"fixture-frame"})
        self.assertNotEqual(code,0)
        self.assertEqual(response["errorCode"],"INVALID_INPUT_PATH")

    def test_unknown_fields_rejected(self):
        code,response=self.invoke({"operation":"inspect","path":"fixture.ply","units":"mm","coordinateFrame":"frame","futureFlag":True})
        self.assertNotEqual(code,0)
        self.assertEqual(response["errorCode"],"UNEXPECTED_OR_MISSING_REQUEST_FIELDS")

if __name__=="__main__":
    unittest.main(verbosity=2)
