# V2.0.7 — Engineering audit trail

V2.0.7 adds a provider-neutral append-only audit boundary for security-sensitive engineering activity.

## Guarantees

- Every event has a sequence number.
- Events form a SHA-256 hash chain through `previousHash`.
- Stored events are never updated or deleted by the audit interface.
- Reads return defensive copies.
- The complete chain can be verified deterministically.
- Events can be filtered by project without changing global sequence/hash lineage.
- Invalid actor, timestamp, and project metadata are rejected.
- The audit contract stores identity metadata, not credentials or session secrets.

## Boundary

The audit trail is separate from `ProjectState.events`. Project events remain engineering-domain history; audit events are security/accountability records.

The reference implementation is in-memory, matching the repository's existing provider-neutral persistence pattern. A production implementation should persist the same contract to durable append-only storage and retain independent access controls.

## Scope

This milestone establishes the audit primitive. Subsequent integration work should emit audit records at authentication/authorization boundaries, task execution/delegation, approvals, workspace mutations, and evidence changes. The audit trail must not become a second engineering source of truth.
