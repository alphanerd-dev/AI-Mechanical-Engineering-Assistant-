# Reasoning Model Hardening and Evidence Traceability

## Purpose

This acceptance layer protects the boundary between a model-authored proposal and trusted engineering execution. The model may propose content; the host validates the proposal, supplies identity and provenance, and controls which existing evidence identifiers may be referenced. A successful proposal is never engineering verification.

## Enforced contracts

- Only the statuses `PROPOSED`, `INCOMPLETE`, and `BLOCKED` are accepted. Provider output cannot add record-control fields such as project identity, task identity, provider provenance, or validation status.
- Trusted project/task/framework identity and provider provenance are host-authored. The model cannot select or overwrite them.
- Evidence references must exactly match an explicit host-supplied allowlist. The allowlist defaults to empty. A model-generated identifier not in the allowlist rejects the proposal rather than creating a plausible-looking reference.
- Even an allowlisted reference remains a reference, not proof of correctness. Reasoning records retain `validationStatus: "NOT_PERFORMED"`; engineering validation, evidence validation, and approval gates remain independent.
- The adapter receives isolated task, framework, and input snapshots. Provider-side mutations do not modify the caller's graph or trusted identity.
- The same pinned framework, input context, response, timestamp, record ID, and provenance produce the same record. Production calls still receive unique record IDs and timestamps.
- Invalid structures, unsupported fields, empty required strings, invalid status values, non-finite numbers, circular objects, and missing outputs are rejected before a record is attached.
- Transport timeouts and upstream failures return bounded errors without exposing response bodies, credential values, or raw network exceptions.

## Provider provenance

Each workspace reasoning record can carry host-authored provenance:

```json
{
  "mode": "MODEL_BACKED",
  "providerId": "openai-compatible-http",
  "modelId": "configured-model",
  "deploymentRevision": "deployment-commit"
}
```

The UI renders the provider, model, mode, and deployment revision alongside the record. The provenance object is schema-validated and rejects unsupported fields. Secrets and full endpoint URLs are deliberately not recorded.

The current HTTP route passes an empty evidence-reference allowlist because the workspace's authoritative artifact/evidence registry is not yet wired into this proposal endpoint. Do not populate that list from request-body values or model output. Future wiring must resolve IDs from a trusted server-side evidence registry and pass only the returned identifiers.

## Security-scan configuration

The repository's Codacy workflow requires a configured `CODACY_PROJECT_TOKEN` to load project-specific analysis rules. If the secret is absent, the workflow records an explicit **SKIPPED** status in the Actions summary; it must not describe this as a passing Codacy scan. The dedicated ESLint and CodeQL checks run independently. If a token is configured but the scanner fails, that failure remains visible and must be investigated rather than silently swallowed.

## Test coverage

`tests/reasoning-model-hardening.test.ts` covers invented evidence rejection, the allowlist boundary, host-only provenance, malicious control-field injection, malformed/non-JSON output, input snapshot isolation, repeatability, and invalid host context. The transport acceptance suite additionally exercises a real `AbortSignal.timeout` expiration with an injected test transport; no external provider is needed for that test.

The manual live-provider workflow remains a separate integration check. Its redacted artifact records provider identity acceptance alongside endpoint contact, proposal acceptance, immutable task status, and `NOT_PERFORMED` validation. A live pass does not replace deterministic CI or engineering validation.
