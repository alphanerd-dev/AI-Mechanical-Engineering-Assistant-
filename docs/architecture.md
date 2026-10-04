# Architecture

```
USER
  ↓
ENGINEERING AGENT
  ↓
PROJECT STATE + MEMORY
  ↓
PLANNER
  ↓
CAPABILITY ROUTER
  ↓
PROVIDERS
  ├─ Analysis
  ├─ CAD
  ├─ Research
  └─ future manufacturing/test systems
  ↓
VALIDATION
  ↓
STATE + MEMORY
```

The engineering core never depends on a vendor-specific tool name. It asks for capabilities such as `CAD.CREATE_PART` or `ANALYSIS.SHAFT_TORQUE`.

Providers translate those capability requests into concrete tools.

This separation is the foundation for supporting Onshape MCP providers now and other CAD/simulation systems later.
