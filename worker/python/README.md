# Controlled Python Engineering Worker

Protocol: one JSON request on stdin and one JSON response on stdout.

Allowlisted capabilities:
- ANALYSIS.SHAFT_TORQUE
- ANALYSIS.SHAFT_SIZE

The worker does not execute arbitrary Python source, shell commands, or model-generated scripts.

Security status: this is a process-level worker, not yet a production sandbox. Production deployment should place it behind a job queue and isolated container/worker runtime with CPU, memory, filesystem, network and timeout controls. Treat worker output as untrusted until schema and engineering validation pass.
