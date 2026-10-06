#!/usr/bin/env python3
"""Controlled numerical worker: one JSON request in, one JSON response out."""
import json
import math
import sys

def number(inputs, name, positive=False, nonnegative=False):
    value = inputs.get(name)
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError(f"{name} must be a finite number")
    if positive and value <= 0:
        raise ValueError(f"{name} must be > 0")
    if nonnegative and value < 0:
        raise ValueError(f"{name} must be >= 0")
    return float(value)

def shaft_torque(inputs):
    p = number(inputs, "powerKw", positive=True)
    n = number(inputs, "speedRpm", positive=True)
    t = 9550.0 * p / n
    return {"powerKw": p, "speedRpm": n, "torqueNm": t,
            "torque": {"value": t, "unit": "N*m"},
            "equation": "T = 9550 P(kW) / n(rpm)", "status": "CALCULATED"}

def shaft_size(inputs):
    p = number(inputs, "powerKw", positive=True)
    n = number(inputs, "speedRpm", positive=True)
    tau = number(inputs, "allowableStressMpa", positive=True)
    m = number(inputs, "bendingMomentNm", nonnegative=True)
    kb = number(inputs, "kb", positive=True)
    kt = number(inputs, "kt", positive=True)
    t = 9550.0 * p / n
    te = math.sqrt((kb * m) ** 2 + (kt * t) ** 2)
    d_mm = (16.0 * te / (math.pi * tau)) ** (1.0 / 3.0) * 1000.0
    return {"torqueNm": t, "equivalentTorqueNm": te, "diameterMm": d_mm,
            "status": "PRELIMINARY",
            "warning": "Preliminary sizing only; verify load cases, fatigue, stress concentrations, deflection, critical speed, keys/couplings, tolerances and standards."}

OPERATIONS = {"ANALYSIS.SHAFT_TORQUE": shaft_torque, "ANALYSIS.SHAFT_SIZE": shaft_size}

def main():
    line = sys.stdin.readline()
    if not line:
        raise ValueError("No JSON request received")
    request = json.loads(line)
    capability = request.get("capability")
    inputs = request.get("inputs")
    if not isinstance(capability, str) or not isinstance(inputs, dict):
        raise ValueError("Request requires string capability and object inputs")
    operation = OPERATIONS.get(capability)
    if operation is None:
        raise ValueError(f"Unsupported capability: {capability}")
    print(json.dumps({"success": True, "outputs": operation(inputs), "warnings": [], "artifactIds": []},
                     separators=(",", ":")), flush=True)

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(json.dumps({"success": False, "outputs": {}, "warnings": [str(exc)], "artifactIds": []},
                         separators=(",", ":")), flush=True)
        sys.exit(1)
