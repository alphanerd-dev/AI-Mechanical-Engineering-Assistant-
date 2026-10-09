# AI Mechanical Engineering Assistant

Portable AI-native engineering intelligence for mechanical R&D.

The system is designed around the engineering lifecycle:

**Problem → Requirements → Research → Analysis → Design → CAD → Simulation → Manufacturing → Test → Validation → Iteration → Release**

## Architecture

The Engineering Core is provider-independent. It requests capabilities such as geometry validation, static structural analysis, or PLM revision management and routes those capabilities to adapters.

Current architectural boundaries include:
- **CAD/geometry:** OCCT, build123d, CadQuery, FreeCAD, Onshape
- **Simulation:** Python/numerical analysis and Ansys Mechanical via PyMechanical
- **PLM/PDM:** OdooPLM
- **Evidence:** structured engineering artifacts and provenance records

External systems are represented as adapters. This repository does not claim that a provider is installed, authenticated, licensed, or reachable merely because an adapter exists.

## V1.3

V1.3 introduces:
- rich capability definitions with risk/status/provider metadata
- provider SDK contracts for CAD, simulation, and PLM
- engineering artifact and evidence models
- OCCT geometry-provider boundary
- PyMechanical simulation-provider boundary
- OdooPLM PLM-provider boundary
- provider-priority routing

See:
- `docs/provider-architecture.md`
- `docs/artifacts-and-evidence.md`
- `docs/roadmap.md`

## Benchmark

Input: "Design a shaft that transmits 5 kW at 1500 rpm."

The core calculates torque (~31.83 N·m) and reports critical missing design inputs rather than inventing them.

## Live reasoning model acceptance

The configured model transport is optional during development. To run the real-provider acceptance, configure the GitHub Environment and follow [the provider stack decision and setup guide](docs/reasoning-model-provider-stack.md). Trigger **Actions → Live Reasoning Model Acceptance** on `main`; the workflow calls the real endpoint and uploads redacted evidence. Ordinary CI uses deterministic fixtures and never requires a live API key.

See also [Phase G acceptance scope](docs/reasoning-frameworks-phase-g.md).

## Development

```bash
npm ci
npm test
npm run build
```
