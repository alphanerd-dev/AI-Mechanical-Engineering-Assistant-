# M2.1–M2.6 implementation and acceptance status

**Status date:** 22 November 2026  
**Merged foundation:** [PR #154](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/154) — merged 14 November 2026  
**Current closure candidate:** [PR #188](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/188)  
**Candidate branch:** `fix/m2-live-workbench-ux-2026-11-22`  
**Candidate source SHA:** `60165d7e6db3315cb0fda320b9aab58d1fddefb9`  
**Production:** unchanged

## Executive status

**M2 is substantially implemented, but M2 acceptance is not complete.** The merged foundation provides artifact lineage, private display derivatives, bounded OCCT processing, the read-only CAD viewport, drawing ingestion and the renderer benchmark harness. PR #188 adds revision-aware drawing generation, workbench/drawing UX corrections, expanded viewport controls, stronger live acceptance scripts and opt-in browser acceptance coverage.

The exact candidate SHA has passed the complete Engineering Core CI pipeline, the isolated local Supabase migration replay, ESLint and all three CodeQL language/workflow analyses. These are substantial implementation and automated-verification results. They do **not** prove the authenticated M2 persistence/drawing workflow, the live WebGL2 viewport path, or physical desktop/Android behavior. The renderer remains deliberately unselected.

The remaining blockers are explicit:
- No exact-head Vercel preview exists for candidate SHA `60165d7`; the latest READY branch preview is still on older commit `1895b105`.
- The Vercel branch has `CAD_WORKER_API_TOKEN` but no branch-scoped `CAD_WORKER_URL`.
- The protected M2 and browser acceptance workflows have not been dispatched. The connected GitHub tools do not expose a workflow-dispatch action.
- Physical desktop and Android benchmark/viewport trials remain outstanding. BrowserStack sessions are not being used.
- Model highlight is a display-only control; stable face/edge topology picking is not implemented.

Do not close M2 or select a production renderer until every required gate has exact-candidate evidence.

## Work-package status

| Work package | Implementation status | Acceptance status |
|---|---|---|
| M2.1 — artifact lineage and viewer policy | Source-to-BREP identity, digest binding, derivative relationships, read-only preview/download boundaries and explicit CURRENT/STALE presentation are implemented in the merged foundation. PR #188 strengthens drawing lineage and fail-closed behavior. | Full exact-candidate lineage and fail-closed behavior across the authenticated workbench remains to be proven by the live M2 workflow. |
| M2.2 — derivative persistence | Immutable project-scoped derivative records, source digest/revision binding, conversion settings, private storage, signed reads and audit evidence are implemented. The M2 smoke runner now also checks geometry-revision creation/reuse and drawing lineage. | Authenticated exact-candidate GLB/SVG persistence, private byte read-back, RLS, signed retrieval, audit-chain and CURRENT→STALE integration acceptance remain open. |
| M2.3 — renderer benchmark | Five paired trials, deterministic SHA-256-bound mechanical fixture, raw frame/pick samples, GPU metadata, picking accuracy, visibility toggles and context-recovery checks are in the canonical harness. The published public assets are now synchronized with the canonical source and guarded by a parity test. | The optional headless SwiftShader run is prepared but not executed. Product-derived workloads and physical desktop/Android trials remain mandatory. No production renderer is selected. |
| M2.4 — CAD viewport | Strict GLB parsing, digest/lineage verification and a read-only WebGL2 viewport are implemented. PR #188 adds orbit, bounded pan, wheel/pinch/button zoom, fit/reset, aspect-correct projection, visibility, display-only model highlight, pointer-capture cleanup and context restoration. | The opt-in live WebGL2 browser test is prepared but not executed. Physical-device interaction and resource-lifecycle acceptance remain open. No face/edge topology picking is claimed. |
| M2.5 — OCCT geometry runtime | BREP/STEP import, topology inspection and bounded tessellation through isolated workers are implemented. Current CI passed the pinned runtime build, authenticated worker HTTP smoke, build123d smoke, independent OCCT BREP validation and CAD intent-to-verified-artifact E2E. | Exact-preview source→OCCT→GLB→private persistence→signed read→viewport acceptance, including stale-source/malformed/resource-limit cases, remains open. |
| M2.6 — drawing ingestion | Authenticated PDF, safe-subset SVG and ASCII DXF ingestion, private storage, metadata and read-only preview are implemented. PR #188 adds revision-bound drawing generation and SVG paper-surface/pinch UX. | The exact-candidate authenticated upload/list/download, MIME spoofing, malformed content and unauthorized/cross-project acceptance workflow remains open. |

## PR #188 implementation

PR #188 coordinates the following implementation:

- `scripts/m2-artifact-workflow-smoke.ts`: authenticated acceptance of a CAD completion, derivative persistence/read-back, immutable geometry-revision creation/reuse, generated drawing bound to the exact geometry revision and canonical BREP digest, private signed SVG download/hash verification, audit provenance, inventory currentness and idempotent drawing-generation replay. It also exercises PDF/SVG/DXF ingestion, malformed SVG/MIME-spoof rejection, anonymous/cross-project denial and stale-source classification.
- `npm run smoke:m2-artifacts`: reproducible entry point for the live acceptance runner.
- `.github/workflows/m2-artifact-acceptance.yml`: manually dispatched workflow bound to the protected `cad-workspace-live-acceptance` environment. It reads exact app/Supabase origins and host allowlists from protected environment variables, rejects wildcard hosts and requires explicit disposable-target confirmation.
- Drawing/workbench UX: select the newest accepted completion for the chosen model, create/reuse the immutable geometry revision before drawing generation, bind the drawing to that exact revision, fail closed without an accepted completion, retain the mounted preview after derivative generation, improve drawing navigation/accessibility/mobile wrapping, and render sanitized SVG on a white paper surface with bounded zoom and pointer lifecycle handling.
- CAD viewport: orbit, bounded pan, pinch/scroll/button zoom, fit-to-view, reset, aspect-correct projection, model visibility, display-only model highlight, pointer-capture cleanup and WebGL context recovery. Source-keyed component identity resets display-only state when canonical source identity changes without resetting on signed-URL refresh.
- Renderer benchmark: the public `/benchmarks/renderers/` HTML/JavaScript/CSS assets now match the canonical benchmark source. Vitest enforces this parity.
- `.github/workflows/e2e-playwright.yml`: adds an opt-in `test_cad_viewport` path. When explicitly enabled with accepted-CAD execution and isolated-environment confirmation, it creates an accepted CAD completion, generates the OCCT GLB through the workbench, verifies WebGL2, exercises viewport controls and pointer gestures, tests context loss/restoration and unmount, and captures the five-pair headless SwiftShader benchmark JSON. This is CI/software-renderer evidence only, not physical-device acceptance.

The viewport highlight is intentionally labelled as a model highlight. It does not imply face/edge selection, stable topology IDs or canonical geometry modification.

## Exact-candidate automated verification — 22 November 2026

Candidate SHA: `60165d7e6db3315cb0fda320b9aab58d1fddefb9`.

| Check | Run | Result |
|---|---:|---|
| Engineering Core CI | [45029822832](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/45029822832) | <strong>Passed</strong> — verify job and isolated Supabase migration replay passed |
| ESLint | [45029822865](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/45029822865) | <strong>Passed</strong> — repository scan and changed-source enforcement |
| CodeQL Advanced | [45029822858](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/45029822858) | <strong>Passed</strong> — JavaScript/TypeScript, Python and Actions |
| Codacy Security Scan | [45029822838](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/45029822838) | Workflow succeeded, but Codacy CLI and SARIF upload were skipped because Codacy is not configured; **not counted as a completed Codacy scan** |

Engineering Core CI evidence:
- Vitest: **175 test files, 1,006 tests passed**.
- Python worker unit tests and HTTP idempotency/cancellation tests passed.
- Pinned build123d runtime built and its smoke test passed.
- OCCT validator acceptance and failure-path tests passed.
- Authenticated remote CAD worker image built; bearer-authenticated HTTP smoke passed, including deterministic artifact generation, SHA-256, BREP validation, BREP/STEP topology inspection/tessellation, unauthorized-request rejection and unapproved-source-execution rejection.
- Natural-language CAD intent generated BREP, STEP, STL and 3MF artifacts; independent OpenCascade validation and CAD intent-to-verified-artifact provider-adapter E2E passed.
- FEA runtime, worker tests, asynchronous CalculiX service and solver smoke passed. The reference case measured 999.99995 N against 1,000 N support reaction. Displacement relative error was 29.63% against a 30% tolerance: passing, but with a narrow margin that remains a numerical-quality watch item.
- OpenFOAM 14 image and analytical async smoke passed: solver status SUCCEEDED, 40 mesh cells and four returned artifacts.
- Bounded-execution worker container built successfully.
- `npm run build` passed TypeScript and Next.js production compilation; all 39 static pages generated.
- Every migration replayed successfully against an empty isolated local Supabase stack; the local stack was stopped afterward.
- E2E spec syntax checks and renderer benchmark syntax validation passed.

These checks verify the candidate's automated engineering core. The headless viewport/renderer acceptance workflow and live M2 artifact/drawing workflow were **not** run.

## Database deployment and security evidence

Read-only Supabase checks recorded on 21 November confirmed that both the dedicated `AI-Mechanical-Engineering-Assistant-E2E` project and production project contain the M2 migrations `20261113210000_m2_display_derivatives_and_drawings` and `20261115130000_m2_generated_drawing_lineage`, as well as the G2 geometry-revision migrations.

The dedicated E2E project was reported as `ACTIVE_HEALTHY`. Its M2 tables were checked directly:

| Table | RLS | anon SELECT | authenticated SELECT | Policies |
|---|---:|---:|---:|---:|
| `engineering_cad_display_derivatives` | enabled | denied | allowed | 1 |
| `engineering_cad_drawings` | enabled | denied | allowed | 1 |
| `engineering_geometry_revisions` | enabled | denied | denied | 0 |

The geometry-revision table is intentionally server-only: the migration grants table access to `service_role` and no direct `anon`/`authenticated` access. The public `get_current_geometry_revision_heads` SECURITY DEFINER RPC was reviewed: it rejects a missing `auth.uid()`, limits the requested model list and verifies project membership before returning revision IDs. The Supabase advisor warning for that RPC is reviewed, not silently ignored. Other server-only tables with RLS and no policies are not a reason to add broad client policies.

The 22 November CI migration replay was against an isolated local stack only. No remote Supabase schema changes were made during this closure cycle; production was inspected read-only.

## Exact-head preview deployment status

The latest READY Vercel preview is deployment `dpl_3b4JSgqjc4dQoVvp9YmXY4fZkXrA`:
- URL: [ai-mechanical-engineering-assistant-m0-preview-e8s4r7p3v.vercel.app](https://ai-mechanical-engineering-assistant-m0-preview-e8s4r7p3v.vercel.app)
- Stable branch alias: [ai-mechanical-engineering-assistant-m-git-9b7909-alphanerd-labs.vercel.app](https://ai-mechanical-engineering-assistant-m-git-9b7909-alphanerd-labs.vercel.app)
- Deployed commit: `1895b105becb6648940ccfe745755cfc2261d009`
- Candidate commit `60165d7e6db3315cb0fda320b9aab58d1fddefb9` has no matching Vercel deployment in the current deployment listing.

A previous exact-head preview attempt returned HTTP 402 because the Vercel team's daily deployment quota was exhausted. No retry, plan upgrade or billing change has been made. Do not treat the older READY preview as acceptance evidence for the current candidate.

## Preview worker configuration blocker

Read-only Vercel environment inspection for branch `fix/m2-live-workbench-ux-2026-11-22` confirms:
- `CAD_WORKER_API_TOKEN`: present as a branch-scoped variable/secret.
- `CAD_WORKER_URL`: absent.

Do not copy a worker URL/token from another branch, use the production worker, or point the test at production. The exact approval/configuration required is a dedicated non-production CAD worker URL for this branch, paired with the already branch-scoped token.

Render currently exposes a workspace named `My Workspace`. Inspection of its services is awaiting the user's explicit workspace approval. No Render service has been created, restarted or modified.

## Protected live-acceptance configuration

Reuse the protected GitHub Environment `cad-workspace-live-acceptance`. The M2 workflow requires:

Environment variables:
- `CAD_WORKSPACE_BASE_URL` — exact HTTPS URL of the candidate branch preview.
- `CAD_WORKSPACE_ALLOWED_HOST` — exact hostname matching that preview URL.
- `CAD_WORKSPACE_SUPABASE_URL` — exact HTTPS URL of the dedicated E2E Supabase project.
- `CAD_WORKSPACE_SUPABASE_ALLOWED_HOST` — exact hostname matching that Supabase URL.
- `CAD_WORKSPACE_PROJECT_ID` — disposable project UUID.
- `CAD_WORKSPACE_MODEL_ID` — disposable CAD model UUID.

Environment secrets:
- `CAD_WORKSPACE_COOKIE` — authenticated project-member session for the candidate preview.
- `CAD_WORKSPACE_E2E_SUPABASE_SERVICE_ROLE_KEY` — service-role key for the dedicated non-production Supabase project only.

The workflow fails closed if values are missing, a URL does not exactly match its HTTPS hostname allowlist, or a wildcard hostname is supplied. The current GitHub connector cannot inspect or write protected environment variables/secrets. Do not paste secrets into chat.

The opt-in Playwright workflow uses the protected `e2e-staging` environment, an exact allowlisted preview base URL, dedicated E2E Supabase credentials, test-user credentials and the Vercel automation-bypass secret. It requires explicit `confirm_isolated_environment`, `test_accepted_cad_completion) and `test_cad_viewport` confirmations. The connected GitHub tools do not expose a workflow-dispatch action, so neither manual acceptance workflow has been triggered from this session.

## Acceptance gates still open

1. **M2.1/M2.2 exact-candidate persistence:** run the authenticated M2 workflow on the exact candidate preview and disposable E2E project; verify canonical BREP bytes/digest, derivative GLB private storage/read-back, RLS, signed URL, audit chain, revision binding, drawing SVG bytes/digest, inventory and idempotent replay.
2. **Stale-source behavior:** verify CURRENT before revision advancement, STALE afterward, and conflict/fail-closed behavior for superseded completion.
3. **M2.4 live viewport:** execute the opt-in WebGL2 E2E path against a real accepted CAD completion; verify orbit/pan/zoom/fit/reset, visibility, model highlight, context recovery and cleanup. Then perform physical-device checks.
4. **M2.5 exact preview:** complete source→OCCT→GLB→private persistence→signed read→viewport on the exact candidate, including malformed and resource-bound negative cases.
5. **M2.6 drawing ingestion:** run authenticated PDF/SVG/DXF upload/list/download, unsafe/malformed/MIME-spoof/oversized rejection and anonymous/cross-project denial.
6. **M2.3 benchmark:** run the five-pair headless SwiftShader baseline and retain its raw JSON; separately run at least five paired trials on representative physical desktop and Android devices with product-derived CAD fixtures. Do not infer physical performance from headless metrics.
7. **Renderer decision:** update the renderer ADR only after mandatory correctness, mobile and recovery gates pass. If evidence is insufficient or scores are close, defer selection.
8. **Exact-head deployment:** obtain a READY preview for SHA `60165d7` without purchasing/upping the plan; verify the deployed commit and worker revision/readiness.
9. **Security provider:** configure Codacy if a Codacy scan is a required release gate; the current workflow's skipped CLI is not a scan.
10. **Production rollout:** separate approval only. No production deployment, production migration or production worker change is part of this closure.

## Explicit non-claims

- Tessellation and viewport rendering do not validate engineering geometry.
- Display derivatives are not canonical CAD artifacts.
- Model highlight is not stable face/edge topology selection.
- PDF/SVG/DXF preview does not validate dimensions, drafting standards or manufacturing readiness.
- The headless SwiftShader benchmark is not physical-device evidence.
- A renderer is not selected until the accepted benchmark decision is recorded.
- A green build does not prove the complete M2 workflow.
- M2 remains **not accepted** until the outstanding gates above have exact-candidate evidence.
