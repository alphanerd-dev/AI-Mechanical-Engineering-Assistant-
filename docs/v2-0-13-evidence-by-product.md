# V2.0.13 — Evidence as a By-Product

V2.0.13 makes evidence generation a natural output of validated engineering execution rather than a separate user-requested step.

## Principle

> The AI proposes. Deterministic systems execute. Validation decides. Evidence proves.

The evidence producer sits after deterministic execution and validation. It does not perform engineering analysis and it does not upgrade an unvalidated result.

## Rules

1. No passing validation gate means no `VERIFIED` evidence.
2. Evidence may reference only artifacts produced by the validated execution context.
3. Evidence may reference only requirements attached to the current project.
4. Evidence IDs are unique within one production operation.
5. Evidence provenance is attached back to referenced artifacts automatically.
6. Human approval evidence remains a separate, explicit event; it is not conflated with deterministic evidence.

## Current integration

The V2.0.10 shaft completion unit now follows:

Requirements → deterministic execution → validated artifact → automatic evidence production → approval → final verification.

The caller never requests an `EVIDENCE` capability. Evidence appears as a by-product of the successful validation gate.

## Scope boundary

This milestone establishes the provider-neutral evidence-production primitive and integrates it into the canonical end-to-end completion workflow.

It does not introduce durable evidence storage. Durable artifact/evidence persistence remains a workspace persistence concern and may later be backed by Supabase or another provider without changing the evidence contract.
