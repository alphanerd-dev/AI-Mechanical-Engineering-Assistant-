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
| P1 — evidence reconciliation | Distinguish implementation from exact-revision verification. | VERIFIED at commit `c4acf0dbbc5017a50b262c3983564fa33f420306` for the current feature-branch evidence set. | This matrix, [current Playwright run #38733136266](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38733136266), [Core CI #38732924543](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38732924543), and linked security/benchmark workflows. | Human review still required before merge; status remains scoped to tested features, not engineering safety certification. |
| P2 — resumable intent | Versioned project-scoped snapshots, monotonic revision/CAS, reload restoration, cross-user/project ownership, malformed-input handling, and fail-closed recovery. | VERIFIED for the exercised browser/API matrix at `c4acf0dbbc5017a50b262c3983564fa33f420306`; broader partial-failure combinations remain PARTIAL. | [Current isolated E2E #38733136266](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38733136266) passed session round-trip, provider outage, existing-session restore outage, initial save outage, stale/revision-guarded writes, and API ownership cases. | Add any missing malformed *persisted server snapshot* fixtures and multi-failure combinations before claiming the entire session state space is exhaustive. |
| P3 — isolated acceptance | Playwright is isolated from production/shared Supabase and the authenticated project/session/workspace/accepted-CAD journeys pass. | VERIFIED for the current browser suite; PARTIAL for unimplemented/uncovered resource APIs beyond this suite. | [Current E2E run #38733136266](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38733136266) passed 11/11, including owner-scoped/revision-guarded project GET/PATCH/DELETE, artifact cleanup, accepted CAD-to-audit verification, and axe WCAG 2.1/2.2 AA scans. Preflight asserted an exact allowlisted HTTPS host and distinct E2E/production project refs. | Add direct API tests for any future/resource-specific routes not represented in the current API surface. Never run the mutation suite against production. |
| P4 — durable audit/evidence | Durable server-controlled audit append, content hash chain, independent verifier, authorization, and atomic CAD-completion/audit transaction. | VERIFIED for the isolated accepted-CAD transaction at the current branch head; production *application* integration remains NOT VERIFIED because main has not been redeployed. | [Current live E2E #38733136266](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38733136266) exercised accepted completion, private artifact digest/readback, independent OCCT receipt, correlated durable event, chain verification, and cleanup; [audit server tests](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/tests/durable-audit-server.test.ts) and [store tests](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/tests/durable-audit-store.test.ts) cover authorization/failure/tamper cases. | Production Vercel remains on main commit `cbc804253162f7209b75c7ec70a14b6b33f82313`; do not claim its deployed route uses the atomic RPC. A separately approved app release and safe post-deploy checks remain. |
| P5 — provider gates | Shared analytical CAD fixtures compare build123d and CadQuery; CalculiX has a cantilever known-answer/reference check. | PARTIAL / PROMOTION BLOCKED by design. | [Current provider gate run #38732924630](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38732924630) passed its benchmark suite; [Core CI #38732924543](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38732924543) passed CAD/OCCT and FEA reference checks. The [promotion manifest](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/blob/implementation/p3-isolated-browser-acceptance-2026-10-14/src/providers/promotion-manifest.ts) fail-closes on missing pinned revision/digest, license closure, security evidence, known-answer validation, and human approval. | Do not set any provider to VERIFIED until immutable upstream source/runtime digests, transitive license closure, security evidence, FEA mesh/convergence and run provenance, and reviewer approval are present. Predictive maintenance remains a separate candidate requiring labeled healthy/fault signals. |

## Exact-head evidence (15 October 2026)

- Feature branch head tested: `c4acf0dbbc5017a50b262c3983564fa33f420306`.
- [Guarded Playwright run #38733136266](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38733136266) passed **11/11**. Retained [artifact #11970674031](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38733136266/artifacts/11970674031), SHA-256 `f5763f6e687ca0b7a52b4e33609c5e2acd151a0b690cfef35744aa64d3c96c46`, expires 29 October 2026.
- [Engineering Core CI #38732924543](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38732924543), [ESLint #38732924562](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38732924562), [CodeQL #38732924661](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38732924661), [Codacy #38732924640](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38732924640), and [Provider Benchmark Gates #38732924630](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38732924630) passed on this source head.
- Supabase post-test checks found zero leftover accepted-CAD projects and zero CAD-completion rows in E2E. Production stayed at 15 projects, 15 workspaces, 0 CAD completions, 0 sessions, and 0 audit events; Playwright never targeted production.
- Fixed during acceptance: the readiness request timeout now accommodates the bounded worker cold start; CAD completion declares a 120-second bounded Vercel route duration; manual Playwright runs are serialized to avoid overlapping the single-slot E2E worker.
- **Still blocked:** production app deployment is intentionally separate; production migration-ledger version timestamps need supported CLI repair/reconciliation before future `supabase db push`; leaked-password protection remains disabled; provider promotion still requires immutable source/runtime digest, license closure, security and FEA provenance evidence plus human approval.

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

## P5 — predictive-maintenance synthetic screening gate

PR [#85](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/85) adds a dependency-free evaluator, a versioned synthetic labelled-signal fixture, unit tests, and a dedicated CI workflow. Its declared screening contract is sensitivity ≥ 0.90, specificity ≥ 0.90, false-alarm rate ≤ 0.10, with all out-of-domain examples rejected.

- The fixture is hand-authored synthetic data (10 HEALTHY and 10 FAULT records), not field measurements or customer telemetry.
- Expected results for that fixture are 9 true positives, 1 false positive, 9 true negatives, and 1 false negative; three out-of-domain records must be rejected.
- The evaluator validates nested schema sections, numeric rule/gate bounds, record object/label types, strict schema-version type, and unique IDs across known and out-of-domain cases. Invalid configuration fails closed.
- A passing report verifies only this synthetic evaluator contract. It does not validate field accuracy, establish diagnostic safety, or promote/register a predictive-maintenance provider. A measured, labelled, representative dataset and independent domain review remain required.

### Exact-head verification — 15 October 2026

- Tested source revision: `4e41ee93fc1b7925585d90449af5c2a66de96563`.
- [Predictive Maintenance Candidate Evaluation run #38738897807](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38738897807) passed unit tests and evaluated the declared synthetic fixture. Retained report: [artifact #11974024911](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38738897807/artifacts/11974024911), SHA-256 `a3dda3e8e5fee4116d56970c914a7df4c41a1fe9875559fb3f53b0d2c6c51d87` (expires 14 November 2026).
- [Engineering Core CI run #38738897806](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38738897806) passed, including unit tests, CAD worker build/smokes, natural-language CAD generation, independent OpenCascade validation, end-to-end intent-to-verified-artifact acceptance, FEA worker tests, and `npm run build`.
- [Provider Benchmark Gates run #38738897817](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38738897817) passed build123d and CadQuery geometry/STEP round-trip fixtures. [CodeQL Advanced #38738897808](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38738897808), [ESLint #38738897803](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38738897803), and [Codacy #38738897819](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/38738897819) passed.
- Status: **VERIFIED AT REVISION** for the evaluator's declared synthetic screening contract only. This does not establish field accuracy, diagnostic safety, or promotion readiness; measured, labelled machinery data and independent domain review remain required.

