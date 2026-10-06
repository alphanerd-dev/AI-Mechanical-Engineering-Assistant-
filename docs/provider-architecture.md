# Provider Architecture

The Engineering Core speaks in capabilities; external systems speak in provider-specific APIs, MCP tools, SDKs, or executors.

## Capability metadata

Every capability can declare:
- domain
- purpose
- inputs and outputs
- risk
- provider candidates
- implementation status

Statuses are **EXPERIMENTAL**, **PILOT**, **VERIFIED**, **BLOCKED**, or **DEPRECATED**.

## Provider boundaries

Providers are thin adapters. They must not contain engineering policy or lifecycle decisions.

Current boundaries include:
- `cad.occt` — geometry validation/export boundary
- `ansys.pymechanical` — FEA/simulation boundary
- `plm.odooplm` — PLM/PDM boundary
- existing Onshape MCP adapters
- existing numerical analysis provider

These adapters do not assume that the external service is installed, authenticated, licensed, or reachable. Those concerns belong to the execution environment.

## Evidence

Results should eventually reference `EvidenceRecord` and `EngineeringArtifact` objects so the system can distinguish a calculated value from a verified engineering result.

## Design rule

The orchestrator asks for **what engineering capability is required**, not which vendor tool should be called.
