# Architecture Acceptance Evidence Reconciliation — 2026-10-13

## Purpose and rule

This matrix reconciles claims from the prior repository-hardening audit and the current architecture acceptance contract against the source and CI evidence available on the implementation branch. A green workflow proves only the checks it ran. It does not prove production behavior or engineering correctness outside those checks.

Product doctrine remains binding:

> Engineering outcomes, not engineering overhead. Turn engineering intent into a usable, evidence-backed result—with less manual work, less rework, and lower total cost.

> AI proposes. Deterministic systems execute. Validation decides. Evidence proves.

## Status vocabulary

- **implemented** — code or configuration exists in the reviewed revision.
- **partially implemented** — some contract exists, but at least one required behavior is missing.
- **verified at revision** — a named check passed for a specific commit/run; not a blanket readiness claim.
- **not verified** — available evidence does not establish the claim.
- **blocked** — the check requires a resource or permission not currently available.

## Evidence matrix

| Claim / requirement | Status | Evidence | Limitations / next action |
|---|---|---|---|
| TypeScript/JavaScript dependency graph checks | verified at revision | Engineering Core CI: https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38463542038 | Scanner scope is limited to configured TS/JS roots. Extend selectively to SQL/RLS, Python worker, and execution/config seams under P5. |
| ESLint / changed-source enforcement | verified at revision | https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38463542142 | Does not establish runtime authorization, durable persistence, or engineering validity. |
| CodeQL Advanced scan | verified at revision | https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38463542046 | Scan passed for configured Actions, Python, and JavaScript/TypeScript languages; not a penetration test. |
| Codacy security scan | verified at revision | https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38463542042 | Does not prove absence of security defects. |
| Server-side engineering intent interpretation persistence | implemented | `src/intent/session.ts`; migration `supabase/migrations/20261013125414_v2_0_22_durable_intent_sessions.sql` | Store persists interpretation scoped by project/session. UI does not yet restore visible conversation or reuse a stable session after remount. |
| Every session read/write is project-scoped | partially implemented | Supabase store filters by both `project_id` and `session_id`; migration applies RLS membership/role policies | Direct API tests for cross-project, malformed identifiers, storage outage, concurrency/conflict, and partial failure remain required. |
| Visible conversation survives refresh/remount | not verified | `app/projects/[projectId]/engineering/EngineeringInteraction.tsx` creates a session ID on mount and keeps messages in React state; intent route currently exposes POST only | Implement versioned server-side snapshot/restore and explicit recoverable errors; never silently replace a failed restore with a new session. |
| Durable audit trail across process restart | not verified | `src/audit/trail.ts` implements `InMemoryAuditTrail`; `src/auth/supabase-service.ts` uses it for diagnostics | Hash chaining detects edits within the in-memory sequence but is not durable. Add server-controlled persistent audit storage, append-only controls, concurrency-safe sequence/integrity, and restart/tamper tests. |
| Full browser auth and tenant isolation in isolated CI | not verified | Prior manual journey recorded in the implementation plan; shared Supabase project is not suitable for unattended mutation | Provision a dedicated non-production Supabase project and credentials before enabling automated Playwright. Keep shared-project workflow manual and allowlisted until then. |
| Engineering intent success / NEEDS_INPUT / provider-failure / evidence-state browser journeys | not verified | Existing unit and worker acceptance workflows cover only their own configured fixtures | Add E2E journeys and assert the returned status, validation state, and evidence references rather than UI text alone. |
| CAD/OCCT/FEA CI acceptance | verified at revision | Engineering Core CI run above includes CAD worker, OCCT validator, end-to-end CAD intent-to-verified artifact, and open FEA runtime checks | CI fixtures do not prove every production deployment or arbitrary model is safe/correct. Preserve independent validation and provenance. |
| Candidate ecosystem readiness / license compliance | not verified | Candidate registry is a research shortlist, not a promotion record | No candidate is promoted by inclusion in the registry. Pin revision, verify license/security/ownership, and run reproducible known-answer fixtures before pilot/support status. |
| Production readiness of this implementation | not verified | PR preview status is not production acceptance | No production deploy is authorized by this work. Require review, CI, isolated E2E, and deployment-specific evidence. |

## Priority ledger

1. **P1 — Evidence reconciliation:** this matrix records claims and their evidence limits. It is a living ledger; update links and revision identifiers as implementation PRs land.
2. **P2 — Resumable sessions:** durable interpretation storage exists, but user-visible conversation restoration and its tests remain open.
3. **P3 — Playwright and isolation:** gated until dedicated E2E Supabase exists; no shared/prod database automation.
4. **P4 — Durable audit/provenance:** in-memory trail remains unsuitable as the durable record; persistent storage and correlation chain remain open.
5. **P5 — Architecture/provider gates:** current TS/JS and runtime checks are useful but not exhaustive; SQL/RLS, provider contracts, known-answer benchmarks, license/security review remain open.

## Delivery constraints

- Use feature branches and pull requests; merge only after review and required CI.
- No production deploy as a side effect.
- No new external runtime dependency before its capability, license, security, and reproducibility gates pass.
- Do not treat a process exit, LLM judgment, solver exit code, or geometric validity alone as engineering verification.
- Record exact commit/run and environment for each future verified claim.
