# Numerical Analysis Engine

V1.2 introduces a provider boundary for engineering calculations.

## Principles

1. The engineering core requests a capability, not a library.
2. Numerical calculations return equations, inputs and engineering results.
3. Results are validated before they become trusted project state.
4. Missing physical inputs remain explicit.
5. A preliminary calculation is not a final design.

## Current capabilities

- `ANALYSIS.SHAFT_TORQUE`
- `ANALYSIS.SHAFT_SIZE`

The shaft sizing function uses an equivalent-torque approach for a solid circular shaft:

`Te = √((Kb M)^2 + (Kt T)^2)`

`d = [16 Te / (π τallow)]^(1/3)`

This is a preliminary sizing calculation. Real shaft design still requires bearing reactions, load cases, stress concentration, fatigue, deflection, critical speed, keys/couplings, manufacturing tolerances and applicable design standards.
