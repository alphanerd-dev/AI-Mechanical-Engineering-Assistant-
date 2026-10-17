# Production Supabase migration-ledger reconciliation

**Review date:** 17 October 2026  
**Target:** production project `mepmogsqhxxasahwhete` only  
**Status:** remediation workflow authored; production changes have not been executed by this document.

## Verified state

The repository contains both execution migrations:

- `20261017104855_v2_0_29_durable_execution_jobs.sql`
- `20261017105801_v2_0_30_database_clock_execution_leases.sql`

Production's recorded history currently ends at V2.0.28. Its schema was previously inspected and does not yet contain `public.engineering_execution_jobs` or the V2.0.30 lease-renewal function. The E2E project has its own V2.0.29/V2.0.30 history; E2E evidence is not used to declare production applied.

Six older production history rows carry a timestamp different from the canonical repository filenames, even though the recorded migration names match:

| Recorded production version | Canonical repository version | Migration |
|---|---|---|
| `20261015081705` | `20261013220000` | V2.0.23 resumable intent conversation |
| `20261015081715` | `20261014120000` | V2.0.24 owner project lifecycle |
| `20261015081723` | `20261014170000` | V2.0.25 durable audit provenance |
| `20261015081746` | `20261014190000` | V2.0.26 audit-chain atomic CAD completion |
| `20261015081755` | `20261015010000` | V2.0.27 CAD specification null normalization |
| `20261015081804` | `20261015011000` | V2.0.28 atomic CAD-audit correlation |

## Guarded remediation workflow

`.github/workflows/production-supabase-migration-reconciliation.yml` is manual-only and targets a fixed production project reference. It pins the Supabase CLI and supports two modes:

1. **`audit`** — captures the local/remote migration list and a `db push --dry-run` diagnostic. It does not modify migration history or schema.
2. **`reconcile_and_apply`** — requires the exact input `APPLY_V2_0_29_AND_V2_0_30_TO_PRODUCTION`; checks the expected migration files, migration-history state, and the relevant current schema objects; uses `supabase migration repair` to normalize the six known timestamps; then requires the CLI dry-run to contain only the pending V2.0.29/V2.0.30 migrations before running `supabase db push`. It verifies final migration history and the expected table/functions and uploads diagnostic evidence.

The repair adds each canonical version before removing its legacy timestamp so a retry is less likely to leave both versions absent. If the observed state differs from the known migration set or ledger and schema disagree, the workflow fails closed.

## Required GitHub configuration

Before running either mode, configure the GitHub Actions environment named `production` with environment-scoped secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`

Configure required reviewers on that environment as an additional production approval gate. Do not put secret values in workflow inputs or logs.

## Safety boundaries

- Do not manually edit `supabase_migrations.schema_migrations` through SQL.
- Do not use `supabase db reset` or `--include-all` for this production repair.
- Review the audit artifact before selecting the write mode.
- The workflow must stop if the dry-run would apply anything beyond the expected pending execution migrations.
- Applying V2.0.29/V2.0.30 does **not** make durable execution production-ready. Keep `DURABLE_EXECUTION_ENABLED` disabled until the dedicated worker is deployed and authenticated end-to-end smoke tests and post-deploy checks pass.

**Product doctrine:** AI proposes. Deterministic systems execute. Validation decides. Evidence proves.
