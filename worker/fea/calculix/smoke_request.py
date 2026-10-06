import json
import sys

request={
    "analysis":"STATIC_STRUCTURAL",
    "benchmark":"cantilever_box",
    "material":{
        "name":"Steel",
        "youngsModulusMpa":210000.0,
        "poissonRatio":0.3,
        "yieldStrengthMpa":250.0
    },
    "dimensionsMm":{
        "length":100.0,
        "width":20.0,
        "height":20.0
    },
    "elementSizeMm":8.0,
    "totalForceN":1000.0,
    "timeoutMs":30000
}
sys.stdout.write(json.dumps(request))
