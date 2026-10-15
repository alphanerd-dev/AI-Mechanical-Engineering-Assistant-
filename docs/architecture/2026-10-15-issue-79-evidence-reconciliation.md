# Issue #79 evidence reconciliation

**Review date:** 15 October 2026  
**Scope:** P1–P5 acceptance evidence for [issue #79](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/issues/79).  
**Environment rule:** the dedicated E2E Supabase project is for disposable Playwright acceptance only. Application/schema work is authored and reviewed in GitHub; production changes are applied from reviewed migrations, never copied by mutating the E2E database.

## Status vocabulary

- **IMPLEMENTED** — relevant code or schema is present; this alone does not prove it works.
- **VERIFIED AT REVISION** — evidence passed on the exact linked commit/run.
- **PARTIAL** — a scoped slice is proven, but the full acceptance condition is not.
- **NOT VERIFIED** — no retained, exact-revision evidence was found.
- **BLOCKED** — a named prerequisite must be resolved before safe promotion or claiming completion.

## Acceptance matrix

| Priority | Claim | Status | Evidence | Remaining gate |
|---|---|---|---|---|
| P1 — evidence reconciliation | Classify claims rather than treating code presence as proof. | IMPLEMENTED by this matrix; independent review still required. | This file; issue #79 links prior commits, test runs and retained Playwright artifacts. | Keep every status tied to an exact revision/run and update it when evidence changes. |
| P2 — resumable intent | Versioned, project-scoped snapshots; validated persisted payloads; monotonic revision/CAS; fail-closed restoration. | PARTIAL | [Store validation tests](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/tests/intent-session-store.test.ts); [route tests](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/tests/engineering-intent-session-route.test.ts); [previous isolated E2E run #21, 9/9](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38703092953). | Reconfirm at the current branch head; keep malformed server snapshot, cross-project denial, storage/network outage and stale-write cases explicit. |
| P3 — isolated acceptance | Playwright cannot target production/shared Supabase and ownership/lifecycle endpoints are checked. | PARTIAL | [Manual isolated workflow](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/.github/workflows/e2e-playwright.yml); [E2E runbook](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/docs/testing/isolated-playwright-e2e.md); previous run #21 passed 9/9. | Retain a successful current-head run that opts in to real accepted CAD completion; verify artifact readback, independent chain verification and cleanup. Do not infer untested resource routes are covered. |
| P4 — durable audit/evidence | Server-controlled append, hash chain, verifier, authorization, and atomic CAD-completion/audit transaction. | PARTIAL pending current-head accepted-CAD evidence and production application rollout. | [Durable audit server tests](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/tests/durable-audit-server.test.ts); [store tests](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/tests/durable-audit-store.test.ts); [audit API](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/app/api/engineering/audit/route.ts). | Prove the accepted CAD route against the isolated preview and E2E database. Production Vercel has not been deployed with the route integration; do not claim the live production app uses the atomic RPC yet. |
| P5 — provider gates | Shared analytic CAD fixtures compare build123d and CadQuery; FEA smoke checks compare results to a reference. | PARTIAL | [Provider benchmark workflow](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38697962184) passed 3/3 fixtures on both backends; [Engineering Core CI](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38697962156) passed the current recorded CAD/FEA checks. | Before any provider is VERIFIED, finish immutable image/source digest pinning, transitive license closure, security review, mesh/convergence and provenance evidence, and human promotion approval. Narrow benchmarks do not confer safety certification. |

## Supabase production/E2E parity

### Database state verified on 15 October 2026

The production project `mepmogsqhxxasahwhete` and E2E project `mpbrlegwrrrfpeumtqhi` both record migrations named V2.0.23–V2.0.28. Inspection confirmed the same core public-table structure for projects, workspaces, CAD models/completions, intent sessions, audit events and the global audit-chain head.

Production's existing data counts after migration remained 15 projects, 15 workspaces, 0 intent sessions, 0 CAD completions and 0 audit events. E2E contains disposable acceptance data and is intentionally not expected to have matching row counts. The production chain verifier returned a valid empty chain (sequence 0) at the time of migration verification.

- [Production Supabase dashboard](https://supabase.com/dashboard/project/mepmogsqhxxasahwhete)
- [Dedicated E2E Supabase dashboard](https://supabase.com/dashboard/project/mpbrlegwrrrfpeumtqhi)
- [Production migration record in issue #79](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/issues/79#issuecomment-6187708194)

### BLOCKED: migration-ledger timestamp reconciliation

The Management API applied migrations to each project and generated different remote migration-version timestamps. The remote histories show the same migration **names**, but those version IDs do not match the prefixes in the repository migration filenames, and the E2E and production version IDs differ from one another.

**Do not run `supabase db push` until this drift has been reconciled.** Use the supported Supabase CLI migration-repair workflow to align both remote ledgers to the reviewed canonical repository migration versions without replaying already-applied SQL; then run `supabase migration list` against both projects and retain the output. Do not edit Supabase's internal migration ledger with ad-hoc SQL. The schema is currently aligned, but migration bookkeeping is not yet proven reproducible.

### Security-advisor notes

- The production and E2E advisors report leaked-password protection disabled. This is a genuine Auth hardening item and should be enabled through reviewed Auth configuration.
- The no-policy informational findings on `engineering_audit_events` and `engineering_audit_chain_head` are intentional only while direct client table grants remain revoked and callers use the audited server-side functions. Recheck grants and function execution privileges after any schema change.

## Promotion/deployment boundary

Production V2.0.23–V2.0.28 database migrations are applied, with schema, data-count, audit-chain, and privilege checks recorded above. That does **not** mean production Vercel has the corresponding route code. Production Vercel remains on main commit `cbc804253162f7209b75c7ec70a14b6b33f82313`; the branch's CAD-completion route uses the atomic completion/audit function, but the running production application has not been deployed with this integration.

Do not call the live production feature complete until an explicitly approved production release is deployed and health/authorization/audit checks pass. Keep the E2E workflow manual, allowlisted, and guarded by unequal E2E/production project references.

**Product doctrine:** AI proposes. Deterministic systems execute. Validation decides. Evidence proves.
