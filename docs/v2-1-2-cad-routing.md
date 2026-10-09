# V2.1.2 — Multi-CAD capability routing

## Objective

Add CAD-specific routing policy on top of the existing provider-neutral capability registry. The route decision selects a registered provider for a CAD capability, records which alternatives were eligible, and reports when a fallback was used.

## Routing contract

- Provider priority comes from the existing capability catalog; explicit provider preferences can reorder that list.
- A host must explicitly declare provider availability. A registered adapter is not automatically assumed configured, reachable, authenticated, or production-ready.
- Provider profiles can mark a provider AVAILABLE, UNAVAILABLE, PLANNED, or MOCK. Planned, unavailable, and mock providers are excluded by default.
- A required provider is a hard pin. If it cannot execute, routing fails closed without trying another provider.
- By default, LOW and MEDIUM risk requests may fall back after a provider failure. HIGH and CRITICAL requests make only one provider attempt unless fallback is explicitly allowed. An explicit required-provider pin always disables fallback.
- Provider exceptions, unsuccessful results, mismatched provider/capability identities, and success responses without output are rejected as execution failures.
- The route receipt records ordered candidates, exclusions, attempts, selected provider, and whether fallback occurred.

## Trust boundary

Routing is not CAD geometry validation. An execution success means only that an eligible provider returned a structurally acceptable result. The caller must still validate geometry, artifact provenance, units, requirements, and downstream engineering constraints before treating the model as accepted or verified.

## Deliberate limitations

This milestone does not install CAD runtimes, create credentials, implement native provider transport, synchronize CAD documents, or persist route receipts. Provider availability profiles must be supplied by trusted host configuration. Durable audit storage and geometry/artifact provenance are separate milestones.

## Verification

The acceptance tests exercise catalog priority, explicit preference, hard pinning, risk-sensitive fallback, fallback evidence, host-availability requirements, mock-provider exclusion, provider identity checks, invalid capability handling, and duplicate profile rejection.
