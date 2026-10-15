# Architecture Review — Implementation Plan and Acceptance Contract

**Date:** 2026-10-13  
**Baseline reviewed:** `043b22c299d8c821f57b591c4f5ea86aea9f3dd6`  
**Execution rule:** work on a feature branch, preserve the deterministic Engineering Core, require CI and review before merge, and never claim a result is verified without a linked artifact or test receipt.

## Product doctrine

> Engineering outcomes, not engineering overhead. Turn engineering intent into a usable, evidence-backed result—with less manual work, less rework, and lower total cost.

The intended experience is: “I stated the problem. I got a checked result and a clear decision.”

Architecture invariants:

- AI proposes. Deterministic systems execute. Validation decides. Evidence proves.
- Fast by default. Rigorous when it matters. Explicit when risk increases.
- Never claim success without evidence.
- Fail closed when required validation, authorization or provenance is missing.
- Treat external repositories, user input, generated code and provider output as untrusted.
- Add an external dependency only when it fills a measured product capability gap.

## Current evidence snapshot

The reviewed `main` revision is `043b22c`. At that revision, the recorded CI run passed 98 test files. The architecture scanner reported 322 modules, 963 internal dependency edges, zero unresolved relative imports, zero dependency cycles and zero violations under its current rules. The manually triggered Playwright journey passed for sign-in, project creation/persistence, sign-out and basic cross-user/anonymous denial checks.

These results do not establish full product readiness. The architecture scanner covers TypeScript/JavaScript under `app/`, `components/`, `lib/` and `src/`; it does not scan Python workers, SQL migrations, runtime configuration or authorization behavior. The Playwright workflow uses a pre-launch shared Supabase project and its unique test project records persist. Keep that workflow explicitly gated until isolated staging is available.

## Priority 1 — Reconcile current evidence and acceptance doctrine

### Deliverables
- Keep this contract and the ecosystem registry as the current reference for follow-up work.
- Reconcile the earlier hardening audit and Product Doctrine Acceptance Matrix against the current source revision.
- For every claim, label it `implemented`, `partially implemented`, `verified at revision`, `not verified`, or `blocked`.
- Link evidence to a commit, CI run, test case, migration or reviewed file; record environment and limitations.

### Acceptance
- No stale statement presented as current fact.
- No architectural claim marked verified solely because a unit test or process exit succeeded.
- Registry candidate state does not imply a repository was installed or its license/build independently audited.

## Priority 2 — Make engineering intent sessions truly resumable

### Required design
- Distinguish browser interaction ID, durable session ID, project ID and task/run ID.
- Persist only the state required to resume, with a versioned schema and timestamps.
- Authorize every read/write against the authenticated user and project membership; never trust a client-supplied project ID/session ID as proof of access.
- Use a durable store adapter behind a small interface. Keep in-memory storage as a test adapter only.
- Define conflict behavior for concurrent tabs, retention/deletion semantics, schema migration behavior, and recovery when persistence is unavailable.
- Do not silently create a fresh session when resume fails. Return a recoverable error and state whether the last turn was saved.
- Do not store secrets or unnecessary sensitive content in conversation state.

### Required tests
- Refresh/remount restores the same authorized session and conversation.
- Another project member/user cannot read or overwrite a session without the required role.
- Invalid, missing, oversized and malformed identifiers fail closed.
- Persistence outage, conflict and partial-write failures are visible and recoverable.
- A new conversation is created only by explicit new-session intent.
- UI distinguishes unsaved, saving, saved and failed states where relevant.

### Acceptance
- End-to-end browser evidence demonstrates submit → persisted state → refresh → restoration.
- Direct API tests verify unauthorized and cross-project access is denied.
- CI uses isolated test storage, not a shared production database.

## Priority 3 — Expand Playwright acceptance and safe environment isolation

### Required journeys
1. Sign-up/sign-in/sign-out and auth callback correctness for the configured test environment.
2. Create/open/reload a project and verify persistence.
3. User A cannot list, open, mutate or delete User B's project through UI or direct API calls.
4. Submit an engineering intent with sufficient inputs and verify the actual result status, validation state and evidence references.
5. Submit an incomplete task and verify the assistant asks only for material missing inputs and preserves context.
6. Simulate provider timeout/failure and verify no false success or `VERIFIED` status is emitted.
7. Resume a durable session after reload and recover gracefully from a storage error.
8. Verify keyboard navigation, accessible labels, focus/error handling and responsive primary-task completion.

### Environment rules
- Provision a dedicated E2E Supabase project before making the full E2E suite automatic on pull requests.
- Store E2E credentials as least-privilege CI secrets; never print them.
- Use deterministic fixture users and unique test records; clean up only records owned by that test.
- Until isolation exists, keep shared-database tests manual, allowlisted and explicitly non-destructive. Do not use real customer data.

### Acceptance
- Browser assertions check outcomes and trust signals, not merely page text or HTTP 200.
- Test artifacts include commit SHA, environment, test names, failures and trace/screenshots where appropriate.
- A clean developer install can execute the documented test command; pin the Playwright dependency and lockfile or encapsulate the install explicitly.

## Priority 4 — Durable audit, provenance and evidence

### Required design
- Define one correlation chain: request → task/run → capability/provider → input/artifact hashes → execution status → validation receipt → decision.
- Persist audit records using server-controlled writes and restricted read access.
- Record actor, project/resource, action, outcome, timestamp, request/run ID, provider/version and references to evidence.
- Separate operational logs from engineering evidence. Logs show what happened; validation artifacts support whether a result met acceptance criteria.
- Keep credentials, tokens and sensitive request payloads out of logs. Define retention and deletion policy.
- A hash chain may supplement integrity controls, but does not alone prove authenticity, durable storage or engineering correctness.
- Ensure validator errors, missing evidence and untrusted provider outputs fail closed.

### Required tests
- Restart/redeployment does not silently erase persisted audit history.
- Tampered/missing evidence references are detected or the result is marked unverifiable.
- Provider timeout, rejected output and validation failure have distinct statuses.
- Concurrent/retried requests have correlation and idempotency behavior.
- Authorization prevents cross-project audit disclosure.

### Acceptance
- One successful and one failed engineering run can be traced end-to-end from the stored decision to retained evidence.
- UI reports validation and evidence states truthfully; no unsupported claim of safety or manufacturability.

## Priority 5 — Architecture boundaries and provider promotion gates

### Dependency design
- Keep the current strict graph check, then add rules only for demonstrated architectural risks.
- Add checks or targeted reviews for Python worker imports, SQL/RLS invariants, environment configuration and generated-code execution paths.
- Prefer deep modules: small interfaces, substantial behavior hidden behind them, dependencies injected at seams, and tests through the same interface used by callers.
- Do not create a new abstraction for one hypothetical implementation; add a seam where variation is real or operationally likely.
- Keep API composition thin; keep engineering rules in the core; keep provider-specific behavior inside adapters.

### Ecosystem gate
- Use `docs/architecture/engineering-ecosystem-registry.md` as the canonical candidate triage record.
- Run the CAD comparison: build123d versus one alternative, using the same geometry fixtures and export/reload/validation contract.
- Run the Gmsh/CalculiX pilot only on known-answer analytical/reference cases with recorded mesh, materials, loads, constraints, solver version and convergence criteria.
- Run reliability analysis separately using known healthy/fault fixtures and uncertainty/false-alarm reporting.
- Verify exact license and revision before code reuse, packaging or deployment. Keep uncertain-license candidates reference-only.
- Do not add a candidate to the runtime dependency set unless it improves a measured acceptance criterion.

### Acceptance
- Architecture CI fails on new forbidden imports, unresolved imports or cycles.
- Provider contract tests are reusable across providers.
- Every pilot has reproducible fixture, expected result, tolerance, environment and evidence link.
- Unsupported providers remain disabled; external code execution remains isolated with resource, filesystem and network restrictions.

## Delivery sequence

1. Evidence reconciliation and canonical registry (documentation only; low risk).
2. Session restoration vertical slice with store contract, API authorization and browser test.
3. E2E isolation and expanded browser acceptance.
4. Durable audit/provenance contract and one traced success/failure run.
5. Extended architecture rules and three ecosystem pilots, promoting only candidates that pass.

Keep changes small enough to review. Open a pull request, wait for CI, inspect the diff and evidence, and merge only when acceptance criteria pass. Do not deploy production as a side effect of this review.
