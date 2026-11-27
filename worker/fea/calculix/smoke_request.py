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
        "length":200.0,
        "width":20.0,
        "height":20.0
    },
    "elementSizeMm":3.0,
    "totalForceN":1000.0,
    "timeoutMs":120000
}
sys.stdout.write(json.dumps(request))
