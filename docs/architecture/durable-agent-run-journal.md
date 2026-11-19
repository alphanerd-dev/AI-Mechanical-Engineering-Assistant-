# Durable agent-run journal (V2.0.31)

## Status — 18 November 2026
The journal schema is applied to both the production Supabase project and the dedicated E2E project. The repository migrations V2.0.31, V2.0.32 and V2.0.33 are present in both migration ledgers at their canonical file versions.

- V2.0.31 creates the project-scoped journal and six narrowly scoped RPCs.
- V2.0.32 removes broad default service-role table rights; `service_role` has only `SELECT` and `INSERT` on the journal table.
- V2.0.33 corrects the approval-evidence comparison between the audit table's text project ID and the RPC's UUID project ID.
- The table has RLS enabled and no client policies. The six RPCs are `SECURITY DEFINER`, use an empty `search_path`, and are executable only by `service_role`.
- Production and E2E currently contain zero agent-run rows.

The journal remains a persistence primitive. It is not an enabled public model-directed execution endpoint. Production `DURABLE_EXECUTION_ENABLED` is set to `false`; the synchronous execution path remains in use. No persistent durable-execution worker service is deployed.

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
1. Provision a dedicated persistent worker and securely configure `SUPABASE_SERVICE_ROLE_KEY`. The prepared Render Blueprint requires a paid Starter worker; no paid resource has been created.
2. Implement server orchestration that creates a bounded plan, obtains a claim, calls beginAction, dispatches only allowlisted host capabilities, checkpoints outcomes and renews leases.
3. Add authenticated approval/reconciliation endpoints that persist the approval audit event before invoking the resume RPC.
4. Promote the E2E database checks into automated integration tests covering concurrent claims, lease fencing, cancellation races, expired-lease reconciliation and duplicate idempotency.
5. Run an authenticated product workflow through the deployed worker, then perform independent human review and exact-head release verification.
6. Only after those gates pass may the production feature flag be enabled.

### E2E database acceptance completed
A rollback-only SQL acceptance test on the dedicated E2E database passed:
- claim and lease renewal;
- begin-action intent persistence and duplicate in-flight response;
- checkpoint and cancellation;
- expired lease with in-flight action transitioning to `RECONCILIATION_REQUIRED` rather than replay;
- rejection when approval evidence is missing;
- acceptance of a correctly correlated, audited user approval event.

Synthetic run rows and the synthetic audit-chain append were rolled back. The E2E and production journal tables remain empty. These database-level checks do not replace the missing persistent worker or authenticated application workflow.

This journal is a persistence primitive, not permission to let the model execute arbitrary code or call arbitrary providers.
