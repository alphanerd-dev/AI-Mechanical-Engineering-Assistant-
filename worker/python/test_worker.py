import json, subprocess, sys
from pathlib import Path
WORKER=Path(__file__).with_name("worker.py")
def run(capability,inputs):
    p=subprocess.run([sys.executable,str(WORKER)],input=json.dumps({"capability":capability,"inputs":inputs})+"\n",text=True,capture_output=True,check=False)
    assert p.stdout
    return json.loads(p.stdout)
def test_pint_conversion():
    r=run("UNITS.CONVERT",{"value":5,"fromUnit":"kW","toUnit":"W"})
    assert r["success"] and r["outputs"]["value"]==5000
def test_pint_dimensions():
    r=run("UNITS.CHECK_DIMENSIONS",{"quantities":[{"value":5,"unit":"kW"},{"value":5000,"unit":"W"}]})
    assert r["success"] and r["outputs"]["compatible"]
def test_sympy():
    r=run("MATH.SYMBOLIC_SOLVE",{"equation":"2*x+3=9","variable":"x"})
    assert r["success"] and "3" in r["outputs"]["solutions"]
def test_scipy_root():
    r=run("MATH.NUMERICAL_SOLVE",{"polynomialCoefficients":[1,0,-4],"bounds":[0,3]})
    assert r["success"] and abs(r["outputs"]["solution"]-2)<1e-7
def test_scipy_optimize():
    r=run("MATH.OPTIMIZE",{"objectiveQuadraticCoefficients":[1,-4,7],"bounds":[0,5]})
    assert r["success"] and abs(r["outputs"]["solution"]-2)<1e-5
