# Implementation Plan: Evidence-Gated Engineering Capabilities

**Updated:** 13 October 2026  
**Status:** Prioritized implementation plan; roadmap items below are not claims of completed work.

## Delivery rules

- Keep changes on feature branches and open pull requests; do not push directly to `main`.
- Avoid a deployment for documentation-only or non-release work unless required by CI policy. Deploy after a reviewed PR merge or when a live acceptance run specifically requires a deployment.
- Every capability has an owner module, typed input/output contract, explicit status, deterministic acceptance criteria, provenance, failure semantics and an opt-out/rollback path.
- A passing unit test or CI workflow proves only the assertions it runs. A live provider test proves connectivity and its stated contract, not broad engineering correctness.
- Never promote a provider from EXPERIMENTAL/PILOT to VERIFIED based only on README claims, a successful process exit, or an LLM-generated assessment.

## Priority 1 — Strengthen the existing bounded CAD workflow

**Goal:** increase confidence in the current supported cylinder/shaft path before expanding geometric breadth.

1. Maintain the intent → typed specification → deterministic build123d source → isolated worker → artifact registration → independent OCCT validation → provenance-bound evidence path.
2. Add or tighten failure-injection coverage for worker timeout/non-zero exit, malformed manifest, unexpected/missing artifact, path traversal, oversized output, source/artifact digest mismatch, validator disagreement, persistence failure and cleanup failure.
3. Verify the exact persisted BREP bytes against the validator receipt and persisted metadata; retain a regression fixture for every corrected failure.
4. Extend geometry acceptance only when each new geometry family has explicit dimension/tolerance rules, analytic or known-answer checks, negative cases and independently reviewed fixtures.
5. Keep the initial cylindrical intent scope explicit. Unsupported geometry and missing critical inputs must not invoke the worker or emit VERIFIED evidence.
6. Review authorization on every model, completion, artifact, signed-URL and requirement lookup. Test cross-project access through both UI and direct API requests.

**Exit gate:** CI is green on the PR revision; tests prove negative/failure paths; a live CAD workspace acceptance run is green when the runtime is provisioned; artifact digest, receipt and project/model lineage match; limitations remain visible in the UI and docs.

## Priority 2 — Establish a reusable provider and benchmark contract

1. Define a provider acceptance manifest: capability ID/version, provider ID/version, required runtime/configuration, units and input schema, output schema, timeout/resource budgets, expected artifact kinds, evidence contract, license status and known limitations.
2. Standardize statuses: EXPERIMENTAL, PILOT, VERIFIED, BLOCKED, DEPRECATED. Promotion requires evidence and reviewer sign-off; provider availability remains a separate runtime property.
3. Create known-answer benchmark suites for one bounded family at a time:
   - CAD geometry: dimensions, volume, topology/solid count, tolerances, malformed/unsupported inputs.
   - FEA: canonical analytical cases, boundary-condition checks, mesh quality and convergence where applicable, solver/version/input provenance.
   - Thermofluids/calculations: dimensional analysis, unit conversion, independent formula cross-checks and valid-range/error behavior.
   - Research retrieval: source authority, citation-to-claim traceability, freshness, authorization filtering and prompt-injection resilience.
4. Keep deterministic engineering acceptance separate from model quality, UI usability, process execution, and knowledge retrieval scores.
5. Record benchmark fixtures, expected ranges, tolerances, exact software versions, test commands, artifacts and known exclusions. Use independent references; do not let a provider validate its own output without a separately trusted acceptance rule.

**Exit gate:** at least one candidate provider passes the same contract and benchmark as the current implementation; the scorecard records failures and exclusions; no provider is promoted solely on marketing claims.

## Priority 3 — Promote only the highest-value ecosystem candidates

Use the saved [ecosystem inventory](engineering-ecosystem-inventory.md) as a research backlog, not a dependency manifest. Reconfirm repository identity, current commit, maintenance, license, dependency tree, security posture and actual interfaces before code reuse.

| Candidate lane | Initial disposition | Pilot acceptance focus | Promotion blocker |
|---|---|---|---|
| CAD/CAE Copilot | Comparator/reference | Manifest/provenance, topology references, approval gates, analytical FEA tests | Overlap with current workflow; run comparable tests before adopting code |
| FreeCAD provider candidates, including AnkusDrive | Isolated adapter pilot | Headless execution, declared tool schemas, geometry/FEM fixtures, resource isolation | Arbitrary Python/macro execution, runtime/license and real test-corpus coverage |
| build123d / OCCT / CadQuery | Core geometry foundation / adapter options | Round-trip geometry, dimensions, topology, artifact bytes and deterministic failure behavior | Pin versions and define compatibility matrix |
| Gmsh + CalculiX (or one comparable FEA stack) | One solver pilot, not parallel broad integration | Analytical benchmark cases, mesh checks, BC/material provenance, convergence | No VERIFIED status without independently checked numerical results |
| Pint and deterministic calculation libraries | Core calculation support where already appropriate | Dimensional correctness, serialization and offset-unit/ambiguous-input handling | Avoid duplicate unit systems and undocumented conversion |
| Research/RAG sources and frameworks | Read-only pilot | Citation-level provenance, authorization filtering, source freshness and injection resistance | License/terms, access controls and evidence grounding |
| CAM, robotics, ECAD, CFD and physics-ML | Deferred expansion | Domain-specific acceptance plan first | Safety, licensing, data rights, runtime complexity and no generic validation baseline |

Do not add all candidates at once. Select the next pilot by user value, risk reduction, integration effort, licensing clarity and testability. Preserve a clean adapter seam and compare alternatives through the same contract.

## Cross-cutting engineering work

### Security and tenant isolation
- Recheck authn/authz on server routes and data access; enforce project membership in database policies and server logic.
- Treat metadata supplied by the browser as untrusted; derive role, provider, project scope and artifact paths from trusted server-side state.
- Test unauthenticated access, unauthorized role, cross-project IDs, guessed artifact keys, expired signed URLs and direct API calls.
- Keep service-role keys, worker cookies and provider secrets server-only; redact secrets and customer content from logs.

### Reliability and operations
- Set bounded timeouts, resource ceilings, idempotency behavior and cleanup policy for worker jobs and retries.
- Distinguish retryable transport failures from invalid inputs and deterministic validation failures. Do not retry a side effect unless it is safe/idempotent.
- Emit structured run IDs, sanitized provider/job states, latency, failure class and evidence references. Do not expose raw sensitive tool output to users.
- Add a health/readiness signal that separates application availability from individual provider readiness.

### UX and intuitive behavior
- Show supported input scope before execution; explain missing inputs and unsupported geometry in actionable language.
- Separate states for queued/running, executed, validation failed/passed, awaiting approval, persisted and unavailable.
- Keep critical errors visible; do not turn partial failures into success banners.
- Preserve reviewability: inputs, assumptions, units, provider/validator versions, artifact links, evidence and approval reason.

## Pull request and monitoring protocol

1. Inspect the exact branch diff and repository instructions.
2. Run targeted tests, full unit tests, type-check/build, lint and security workflows required by CI.
3. For worker or persistence changes, run the relevant isolated/live acceptance only with configured test credentials and provisioned runtimes.
4. Open a PR with scope, risk, evidence, test commands/results, limitations and rollback path.
5. Monitor every required check for the PR head SHA. Re-run only transient failures after classifying the cause; fix deterministic failures before merge.
6. Merge only when required checks pass and any mandatory review is satisfied. If deployment is necessary, wait for deployment readiness and run the relevant smoke test.
7. Report the exact PR/commit/run URLs, final status and any unverified claims. Do not claim continuous monitoring after the session ends.

## Rollback

- Disable a provider through trusted configuration/router status without deleting evidence or changing other providers.
- Revert the smallest PR/commit if a release introduces a regression.
- For schema/storage changes, document compatibility and cleanup before migration; do not delete artifacts or evidence as an automatic rollback.
- Keep previously accepted evidence immutable and auditable; new validation should create new records rather than silently rewriting prior claims.
