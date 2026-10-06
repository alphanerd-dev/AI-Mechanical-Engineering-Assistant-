#!/usr/bin/env python3
"""Allowlisted engineering computation worker. No arbitrary Python execution."""
import json, math, sys
import pint, sympy as sp, numpy as np
from scipy import optimize
ureg=pint.UnitRegistry()
def finite(x,n):
    if isinstance(x,bool) or not isinstance(x,(int,float)) or not math.isfinite(x): raise ValueError(f"{n} must be finite")
    return float(x)
def units_convert(i):
    q=finite(i["value"],"value")*ureg(i["fromUnit"]); o=q.to(i["toUnit"]); return {"value":float(o.magnitude),"unit":str(o.units),"status":"CALCULATED"}
def units_check(i):
    qs=i.get("quantities")
    if not isinstance(qs,list) or not qs: raise ValueError("quantities must be non-empty")
    p=[finite(q["value"],"value")*ureg(q["unit"]) for q in qs]
    return {"compatible":all(q.dimensionality==p[0].dimensionality for q in p),"dimensions":[str(q.dimensionality) for q in p],"status":"CALCULATED"}
def symbolic_solve(i):
    eq=i["equation"]; var=i["variable"]
    if len(eq)>500 or len(var)>64: raise ValueError("symbolic input too large")
    allowed=set("0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_+-*/().=^ ")
    if any(c not in allowed for c in eq): raise ValueError("unsupported equation syntax")
    x=sp.Symbol(var); left,right=eq.split("=",1); sols=sp.solve(sp.sympify(left,locals={var:x})-sp.sympify(right,locals={var:x}),x)
    if len(sols)>20: raise ValueError("too many solutions")
    return {"variable":var,"solutions":[str(s) for s in sols],"status":"CALCULATED"}
def numerical_solve(i):
    c=[finite(x,"coefficient") for x in i["polynomialCoefficients"]]; b=i.get("bounds",[-1e6,1e6])
    if len(c)>20 or len(b)!=2: raise ValueError("bounded polynomial input required")
    lo,hi=finite(b[0],"lower"),finite(b[1],"upper"); f=lambda x:float(np.polyval(c,x))
    s=optimize.root_scalar(f,bracket=[lo,hi])
    if not s.converged: raise ValueError("root solver did not converge")
    return {"solution":float(s.root),"residual":abs(f(s.root)),"status":"CALCULATED","method":"scipy.root_scalar"}
def optimize_quadratic(i):
    c=[finite(x,"coefficient") for x in i["objectiveQuadraticCoefficients"]]; b=i["bounds"]
    if len(c)!=3 or len(b)!=2: raise ValueError("quadratic objective and bounds required")
    lo,hi=finite(b[0],"lower"),finite(b[1],"upper")
    if lo>=hi: raise ValueError("invalid bounds")
    f=lambda x:c[0]*x*x+c[1]*x+c[2]; s=optimize.minimize_scalar(f,bounds=(lo,hi),method="bounded")
    return {"solution":float(s.x),"objectiveValue":float(s.fun),"status":"CALCULATED","method":"scipy.minimize_scalar"}
OPS={"UNITS.CONVERT":units_convert,"UNITS.CHECK_DIMENSIONS":units_check,"MATH.SYMBOLIC_SOLVE":symbolic_solve,"MATH.NUMERICAL_SOLVE":numerical_solve,"MATH.OPTIMIZE":optimize_quadratic}
def main():
    r=json.loads(sys.stdin.readline()); cap=r.get("capability")
    if cap not in OPS: raise ValueError("Unsupported capability: "+str(cap))
    print(json.dumps({"success":True,"outputs":OPS[cap](r.get("inputs",{})),"warnings":[],"artifactIds":[]},separators=(",",":")),flush=True)
if __name__=="__main__":
    try: main()
    except Exception as e: print(json.dumps({"success":False,"outputs":{},"warnings":[str(e)],"artifactIds":[]},separators=(",",":"))); sys.exit(1)
