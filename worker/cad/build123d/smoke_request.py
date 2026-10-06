#!/usr/bin/env python3
import json

SOURCE="""from pathlib import Path
import json
import os
from build123d import Box, Cylinder, Mesher, export_brep, export_step, export_stl

out=Path(os.environ["CAD_ARTIFACT_DIR"])
part=Box(20,30,10)-Cylinder(4,10)

export_brep(part,out/"part.brep")
export_step(part,out/"part.step")
export_stl(part,out/"part.stl")

mesher=Mesher()
mesher.add_shape(part)
mesher.write(out/"part.3mf")

(out/"cad-artifacts.json").write_text(
    json.dumps({
        "schemaVersion":1,
        "artifacts":{
            "solidArtifactPath":"part.brep",
            "stepArtifactPath":"part.step",
            "stlArtifactPath":"part.stl",
            "threeMfArtifactPath":"part.3mf"
        }
    }),
    encoding="utf-8"
)
"""

print(json.dumps({
    "id":"build123d-smoke",
    "backend":"build123d",
    "source":SOURCE,
    "filename":"generated_smoke.py",
    "timeoutMs":30000
}))
