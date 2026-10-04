# AI Mechanical Engineering Assistant

Portable AI-native engineering intelligence for mechanical R&D.

The system is designed around the engineering lifecycle:

**Problem → Requirements → Research → Analysis → Design → CAD → Manufacturing → Test → Validation → Iteration**

## V1.1 Engineering Core

This first implementation provides:
- structured engineering intent and project state
- requirements and engineering events
- capability registry and provider-independent routing
- mock CAD provider
- shaft-design calculation benchmark
- validation hooks
- traceability-oriented memory

The CAD layer is intentionally provider-agnostic. Real Onshape MCP adapters will be added after the core is stable.

## Benchmark

Input: "Design a shaft that transmits 5 kW at 1500 rpm."

The core calculates torque (~31.83 N·m) and reports critical missing design inputs rather than inventing them.

## Development

```bash
npm install
npm test
npm run build
```

See `docs/architecture.md` and `docs/roadmap.md`.
