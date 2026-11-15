# Durable agent-run journal (V2.0.31)

## Status
Infrastructure implementation is present on the engineering-cycle branch. It is not yet exposed as a public model-directed execution endpoint, and its migration has not been applied to a shared database.

## Trust boundary
- Model output is an untrusted proposal, not an execution instruction.
- The server persists the bounded plan, graph revision, policy/limit snapshot and deterministic plan digest before claiming work.
- Only the service role can read/insert journal rows. Table updates are performed through narrowly scoped security-definer RPCs with an empty search path.
- Each action has a stable sequence, action digest and idempotency key. The persisted action key is recomputed from the run ID, sequence index and digest prefix during decoding.
- The decoder rejects non-contiguous action history, history/index disagreement, malformed in-flight identities and invalid action timestamps before a worker can resume a run.
- The begin-action RPC persists the action intent before an external side effect.
- The checkpoint-action RPC atomically appends the result, advances the graph revision and increments the next action index.
- Worker leases are fenced by worker ID, UUID lease token and database-clock expiry.
- Cancellation is persisted. Approval resume requires a user identity, approval-evidence identifier and an unchanged task-graph revision.

## Recovery semantics
A worker that loses its lease before beginning an action can be replaced. An expired lease with a persisted in-flight action transitions to RECONCILIATION_REQUIRED; the action is never automatically replayed. This is deliberately conservative until each provider has a verifiable idempotency/reconciliation contract.

## Limits
- Maximum 25 planned actions.
- Plan snapshot: 1 MiB.
- In-flight action: 64 KiB.
- Action outcome: 64 KiB.
- Checkpoint: 256 KiB.
- Action history: 4 MiB.

## Release gates still outstanding
1. Apply the additive migration to a disposable Supabase environment and verify RPC signatures, RLS, grants and lease race behavior.
2. Add server orchestration that creates a plan, obtains a claim, calls beginAction, dispatches only allowlisted host capabilities, checkpoints outcomes and renews leases.
3. Add authenticated approval/reconciliation endpoints that persist audit evidence before invoking the corresponding RPC.
4. Add concurrent-worker, cancellation-race, expired-lease and duplicate-idempotency integration tests.
5. Run exact-head CI and authenticated E2E before enabling any user-facing route.

This journal is a persistence primitive, not permission to let the model execute arbitrary code or call arbitrary providers.
