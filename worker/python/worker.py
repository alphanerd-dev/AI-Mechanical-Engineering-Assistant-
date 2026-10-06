#!/usr/bin/env python3
"""Allowlisted engineering computation worker. No arbitrary Python execution."""
import json, math, sys

try:
    import pint
    import sympy as sp
except ImportError:
    pint = None
    sp = None

UREG = pint.UnitRegistry() if pint else None

def finite(x, name):
    if isinstance(x, bool) or not isinstance(x, (int,float)) or not math.isfinite(x):
        raise ValueError(f"{name} must be a finite number")
    return float(x)

def units_convert(i):
    if UREG is None: raise RuntimeError("Pint is not installed in the worker image")
    q = finite(i["value"],"value") * UREG(i["fromUnit"])
    out = q.to(i["toUnit"])
    return {"value": float(out.magnitude), "unit": str(out.units), "status":"CALCULATED"}

def units_check(i):
    if UREG is None: raise RuntimeError("Pint is not installed in the worker image")
    qs=i.get("quantities")
    if not isinstance(qs,list) or not qs: raise ValueError("quantities must be a non-empty list")
    parsed=[finite(q["value"],"value")*UREG(q["unit"]) for q in qs]
    compatible=all(q.dimensionality == parsed[0].dimensionality for q in parsed)
    return {"compatible":compatible,"dimensions":[str(q.dimensionality) for q in parsed],"status":"CALCULATED"}

def symbolic_solve(i):
    if sp is None: raise RuntimeError("SymPy is not installed in the worker image")
    equation=i.get("equation"); variable=i.get("variable")
    if not isinstance(equation,str) or not isinstance(variable,str): raise ValueError("equation and variable are required")
    if not variable.replace("_","").isalnum() or not variable[0].isalpha(): raise ValueError("invalid variable")
    if len(equation)>500: raise ValueError("equation exceeds safety limit")
    allowed=set("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_+-*/().=^ ")
    if any(c not in allowed for c in equation): raise ValueError("unsupported equation syntax")
    x=sp.Symbol(variable)
    left,right=equation.split("=",1)
    expr=sp.sympify(left,locals={variable:x})-sp.sympify(right,locals={variable:x})
    sols=sp.solve(expr,x)
    if len(sols)>20: raise ValueError("too many solutions")
    return {"variable":variable,"solutions":[str(s) for s in sols],"status":"CALCULATED"}

OPS={
 "UNITS.CONVERT":units_convert,
 "UNITS.CHECK_DIMENSIONS":units_check,
 "MATH.SYMBOLIC_SOLVE":symbolic_solve,
}
def main():
    req=json.loads(sys.stdin.readline())
    cap=req.get("capability"); inputs=req.get("inputs",{})
    if cap not in OPS: raise ValueError(f"Unsupported capability: {cap}")
    out=OPS[cap](inputs)
    print(json.dumps({"success":True,"outputs":out,"warnings":[],"artifactIds":[]},separators=(",",":")),flush=True)
if __name__=="__main__":
    try: main()
    except Exception as e:
        print(json.dumps({"success":False,"outputs":{},"warnings":[str(e)],"artifactIds":[]},separators=(",",":")),flush=True)
        sys.exit(1)
