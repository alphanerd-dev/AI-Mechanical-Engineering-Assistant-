# Controlled Python Engineering Worker

Protocol: one JSON request on stdin and one JSON response on stdout.

Allowlisted capabilities:
- ANALYSIS.SHAFT_TORQUE
- ANALYSIS.SHAFT_SIZE
- UNITS.CONVERT
- UNITS.CHECK_DIMENSIONS
- MATH.SYMBOLIC_SOLVE
- MATH.NUMERICAL_SOLVE
- MATH.OPTIMIZE

Providers:
- Pint for unit conversion and dimensional analysis
- SymPy for bounded symbolic solving
- NumPy/SciPy for bounded numerical solving and optimization

The worker does not execute arbitrary Python source, shell commands, or model-generated scripts.

Security status: this is a process-level worker, not yet a production sandbox. Production deployment should place it behind a job queue and isolated container/worker runtime with CPU, memory, filesystem, network and timeout controls. Treat worker output as untrusted until schema and engineering validation pass.

Mathematical correctness does not establish engineering correctness; assumptions, inputs, models, boundary conditions, material data and validation evidence remain separate concerns.
