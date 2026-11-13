# G2 Production Schema Audit — 13 November 2026

**Status:** Read-only schema review complete; G2 migration remains blocked pending migration-ledger reconciliation and explicit migration approval.
**Environment:** Production Supabase project, PostgreSQL 17.11.0.003 (GA).
**Method:** Supabase project metadata, migration ledger, `information_schema`, `pg_constraint`, `pg_indexes`, `pg_policies`, Storage bucket metadata and aggregate referential-integrity checks. No application rows, artifact bytes or Storage object contents were read. No database writes, migrations or project-setting changes were performed.

## 1. Verified existing ownership

The production schema contains these relevant relations:

- `engineering_projects` — project/tenant owner and lifecycle.
- `engineering_cad_models` — logical CAD model identity.
- `engineering_cad_completions` — execution/completion record and artifact/evidence manifest.
- `engineering_intent_sessions` — chat/session state.
- `engineering_audit_events` and `engineering_audit_chain_head` — audit evidence.
- `engineering_execution_jobs` — durable server-managed execution jobs.

There is **no normalized `engineering_artifacts` table**. Artifact metadata is currently embedded in `engineering_cad_completions.artifact_records` and `engineering_cad_completions.engineering_artifacts` JSONB arrays. The same completion row stores `evidence_records`, `validation_receipt` and `storage_objects` references. The actual bytes live in Supabase Storage.

This changes the G2 relational design: an artifact ID inside JSONB cannot be a normal foreign-key target. G2 must bind a geometry revision to its source completion row and validate the selected artifact ID, digest and Storage object against that completion's manifest. It must not invent or assume an existing relational artifact registry.

## 2. Existing CAD identity and completion constraints

### `engineering_cad_models`

- Primary key: `id`.
- Unique key: `(project_id, id)` — suitable as a composite foreign-key target for project-scoped model references.
- `project_id` references `engineering_projects(id)` with cascade on project deletion.
- `revision` is a positive `bigint`; it remains the existing model metadata revision and must not be reinterpreted as a geometry revision counter.
- `native_references` is a JSONB array.
- RLS is enabled. Authenticated project members can select; project ADMIN/ENGINEER roles can insert. There are no direct client update/delete policies in the audited policy set.

### `engineering_cad_completions`

- Primary key: `id`.
- `project_id` references `engineering_projects(id)` with cascade on project deletion.
- `model_identity_id` is nullable and references `engineering_cad_models(id)` with `ON DELETE SET NULL`.
- `execution_id` is nullable. A partial unique index already enforces `(project_id, execution_id)` when `execution_id` is not null.
- `artifact_records`, `engineering_artifacts` and `evidence_records` are JSONB arrays; `validation_receipt` is JSONB; `storage_objects` is a text array.
- A database check prevents an `ACCEPTED` completion unless evidence records, Storage object references and a validation receipt are present.
- RLS is enabled. Authenticated project members can select; project ADMIN/ENGINEER roles can insert. There are no direct client update/delete policies in the audited policy set.

The read-only aggregate preflight returned zero completions with a null model identity, zero orphaned model references and zero cross-project model mismatches at audit time. This is evidence for a composite-key migration rehearsal, not a substitute for repeating the preflight immediately before migration.

## 3. Existing Storage contract

The `engineering-cad-artifacts` bucket is private, has a 100 MiB per-object limit, has no configured MIME allowlist, and has Storage versioning disabled.

The existing `storage.objects` policies:

- allow project members to select objects in the CAD artifact bucket;
- allow project ADMIN/ENGINEER roles to insert and delete objects;
- derive project scope from the first path segment of the object name.

Consequences for G2:

1. Use object names whose first path segment is the project UUID.
2. Do not rely on Storage versioning for immutability; it is disabled.
3. Use a never-overwritten, revision-scoped object path and bind the exact bytes with SHA-256.
4. Validate content type and file size in the server-side artifact validator; the bucket currently has no MIME allowlist.
5. Do not add a foreign key into the Storage-managed `storage.objects` schema. Resolve the object through the existing Storage contract and server-side checks.

## 4. G2 relational design derived from the live schema

A dedicated `engineering_geometry_revisions` relation remains appropriate, but it is a **geometry lineage index**, not an artifact registry and not a blob store.

Recommended fields:

| Field | Purpose |
|---|---|
| `id` | Opaque immutable geometry revision ID |
| `project_id` | Project isolation |
| `model_identity_id` | Existing logical CAD model |
| `revision_number` | Positive monotonic geometry revision number per model |
| `parent_revision_id` | Previous geometry revision, nullable only for the initial revision |
| `source_completion_id` | Existing `engineering_cad_completions.id` that produced the canonical artifact |
| `source_operation_id` | Copy of the completion's `execution_id` for traceability/idempotency |
| `canonical_artifact_id` | ID resolved from the source completion's JSONB artifact manifest; not an FK |
| `canonical_artifact_sha256` | SHA-256 of the exact canonical artifact bytes |
| `storage_bucket`, `storage_object_name` | Private Storage location; bucket is initially `engineering-cad-artifacts` |
| `canonical_format`, `units`, `coordinate_frame_id` | Explicit representation contract; initial G1 output is BREP, mm, WORLD_Z_AXIS |
| `provider_id`, `provider_version`, `execution_backend` | Separate provider and execution provenance |
| `created_by`, `created_at` | Server-authored actor and timestamp |

Recommended constraints and transaction rules:

- Primary key on `id`.
- Unique `(project_id, model_identity_id, revision_number)`.
- Unique `(project_id, model_identity_id, id)` to support a same-model parent-revision foreign key.
- Composite FK `(project_id, model_identity_id)` to `engineering_cad_models(project_id, id)` with `ON DELETE RESTRICT`.
- Add a unique key on `engineering_cad_completions(project_id, model_identity_id, id)` and use a composite FK `(project_id, model_identity_id, source_completion_id)` to it. This prevents a revision from linking a completion belonging to a different project/model. The current `model_identity_id` FK is only on `id` and uses `ON DELETE SET NULL`; G2 must not inherit that weaker deletion behavior.
- Composite self-FK `(project_id, model_identity_id, parent_revision_id)` to `(project_id, model_identity_id, id)` with `ON DELETE RESTRICT`.
- Validate `canonical_artifact_id` against the source completion's `artifact_records` / `engineering_artifacts` JSONB and validate the exact Storage object and digest in the server. Do not pretend the JSONB ID is a relational FK.
- Keep revision writes server-only. Enable RLS, grant only the minimum required privileges, and use authenticated server routes for member reads. Do not expose the table directly through the Data API unless a separate review approves it.
- Make revisions append-only. No update/delete policy; no in-place artifact overwrite.

For revision allocation, lock the `engineering_cad_models` row with `SELECT ... FOR UPDATE`, read the current geometry head, compare the caller's expected parent, allocate `MAX(revision_number) + 1`, and insert the revision and audit event in one transaction. The unique constraint remains the final concurrency guard. Do not increment or repurpose `engineering_cad_models.revision` as the geometry revision number.

A content-addressed object path such as `{project_id}/{model_id}/revisions/{geometry_revision_id}/{sha256}.brep` is compatible with the current Storage project-prefix policy and avoids reliance on disabled object versioning. Exact extension and MIME policy remain subject to the canonical artifact validator.

## 5. Migration ledger discrepancy — blocking gate

The production migration ledger contains 17 entries. Its latest entry is:

- Production ledger: `20261105150148` — `engineering_chat_session_list_metadata`.
- Repository file on current `main`: `20261101200000_engineering_chat_session_list_metadata.sql`.

The production schema contains the expected `chat_title` and `message_count` columns and `engineering_chat_sessions_project_updated_idx`, so the resulting schema effect is present. However, the migration version differs from the checked-in filename. This is migration-history drift and must be reconciled before introducing a G2 migration. Tracking: [issue #145](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/issues/145).

Required resolution:

1. Compare the complete remote migration ledger with the checked-in migration history and deployment records.
2. Establish why the same migration name was applied under a different version.
3. Agree the canonical repository history and migration-repair procedure with the database owner.
4. Re-run a read-only remote migration status check and confirm the histories agree.
5. Rehearse the additive G2 migration against the E2E project/branch database before any production action.

Do not run `migration repair`, rename/rewrite an applied migration, or push a new production migration as part of this review. Those actions require explicit database-owner approval.

Supabase CLI v3 changed hosted database commands to target the local stack by default; hosted operations require explicit `--remote`, and non-interactive hosted mutations require `--yes`. See the [Supabase CLI v3 changelog](https://supabase.com/changelog?next=Y3Vyc29yOnYyOpK0MjAyNC0wMy0wNlQyMTo1NDo0MlrOAAGClUw%3D%3D&restPage=2). Use explicit project targeting and review the resolved target before any future migration command.

## 6. Security and operational observations

- The audited CAD model, completion and Storage policies are project-scoped. Keep the new revision relation behind the same server authorization boundary.
- `engineering_audit_events`, `engineering_audit_chain_head` and `engineering_execution_jobs` have RLS enabled but no client policies. This is consistent with server/service-role-only access; preserve that boundary and verify server routes before adding any direct policy.
- The authenticated `SECURITY DEFINER` function `update_engineering_project_name` was inspected. It uses an empty `search_path`, requires `auth.uid()`, checks project ownership and expected revision, locks the project row, and updates project/workspace state in one transaction. The advisor warning is therefore a review item, not an automatic reason to remove the function.
- Supabase's security advisor also reports leaked-password protection disabled. This is a separate Auth hardening task tracked in [issue #146](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/issues/146); no Auth setting was changed.
- Informational unused-index findings were not acted on. Low traffic/low row counts are not evidence that foreign-key or query-supporting indexes should be removed.

Supabase requires RLS on exposed tables; see [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security). Since 30 October 2026, new public tables are no longer automatically exposed through the Data API by default; see the [Data API exposure change](https://supabase.com/changelog?tags=data+apis). G2 should remain server-mediated and explicitly privilege-scoped.

## 7. Acceptance gates before G2 implementation

- [ ] Reconcile the production/repository migration ledger discrepancy.
- [ ] Capture and review a fresh production schema snapshot immediately before migration.
- [ ] Repeat the model/completion project-link preflight and verify no null, orphaned or cross-project references.
- [ ] Add/rehearse the composite model/completion foreign keys on the E2E database.
- [ ] Verify append-only RLS/grants and project-scoped Storage object paths for owner, engineer, reviewer, agent and outsider roles.
- [ ] Test concurrent revision creation, stale-parent rejection, idempotent replay and canonical-byte digest verification.
- [ ] Verify audit-chain append and geometry-revision insert commit or roll back atomically.
- [ ] Review rollback/forward-recovery and backup posture.
- [ ] Obtain explicit approval before production migration or route cutover.

**Audit conclusion:** The live schema supports an additive geometry-revision lineage relation without creating a second artifact registry. The migration-ledger discrepancy is the current blocker. No schema change has been made.
