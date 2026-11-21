# M2.2–M2.6 implementation and acceptance status

**Status date:** 21 November 2026  
**Implementation PR:** [#154](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/pull/154) — merged 14 November 2026  
**Current baseline:** `main` at `093843568c8e6800f8e0652d57d0e3c3f65369ae`  
**Closure branch:** `feat/m2-acceptance-closure`

## Executive status

**M2 implementation is merged. M2 acceptance is not yet complete.** The repository has the shared artifact/display-derivative contracts, bounded OCCT processing, GLB viewport, drawing ingestion and benchmark harness. The exact-head repository checks and production build passed on the merged implementation heads, and the implementation plan records the G2 revision persistence and manufacturing evidence migrations as deployed.

The M2-specific authenticated browser/database workflow, stale-source integration proof, and paired physical desktop/Android renderer trials remain release gates. The renderer remains deliberately unselected. Do not close M2 or describe the renderer as production-selected until the gates below have evidence.

The closure branch adds an authenticated M2 acceptance runner and protected manual workflow, plus viewport controls and WebGL 2/context-restoration support. Those branch changes are **implemented but unverified** until exact-head CI and live acceptance complete.

## Work-package status

| Work package | Implementation status | Acceptance status |
|---|---|---|
| M2.2 — artifact lineage and derivative persistence | Merged in PR #154. Immutable project-scoped derivative records, source digest/revision binding, conversion settings, private storage and signed read URLs are implemented. | Authenticated persistence, private storage, RLS, signed URL and audit-chain E2E remains open. |
| M2.3 — renderer benchmark | Babylon.js 9.35.0 and Three.js 0.187.0 harness and virtualized desktop trials exist. | Five paired virtualized trials do not represent physical hardware. Physical desktop and Android results, raw JSON and renderer decision remain open. |
| M2.4 — CAD viewport | Strict GLB v2 parser, digest/lineage verification, read-only viewport, orbit, zoom and reset are merged. | Physical-device interaction, visibility, selection, WebGL 2 and context-loss recovery need acceptance. This closure branch adds whole-body display selection, visibility toggling, WebGL 2-only context creation and context restoration; no face/edge topology mapping is claimed. |
| M2.5 — OCCT geometry runtime | BREP/STEP import, topology inspection and bounded tessellation through isolated workers are merged; worker build/smoke evidence exists. | Authenticated source-to-derivative workflow, stale-source rejection and representative malformed/resource-bound cases remain to be run together on the exact preview. |
| M2.6 — drawing ingestion | Authenticated PDF, safe-subset SVG and ASCII DXF upload/list/preview, private storage and metadata are merged. | Authenticated upload/list/download, malformed content, MIME spoofing, unauthorized and cross-project denial remain to be run together. |

## Closure-branch implementation

The branch adds:

- `scripts/m2-artifact-workflow-smoke.ts`: authenticated acceptance of a CAD completion, OCCT tessellation, GLB digest and lineage, private signed download, derivative inventory, PDF/SVG/DXF upload and retrieval, malformed SVG/MIME-spoof rejection, anonymous/cross-project denial, and persisted stale-source classification.
- `npm run smoke:m2-artifacts`: reproducible entry point for that acceptance runner.
- `.github/workflows/m2-artifact-acceptance.yml`: manually dispatched workflow bound to the protected `m2-artifact-acceptance` environment. It requires explicit confirmation that the target project and Supabase instance are disposable non-production resources.
- Exact-host allowlisting for the M2 preview; wildcard host matching is rejected.
- Viewport body selection/clear-selection and model visibility controls. These are display controls only and do not modify canonical geometry or validation state.
- WebGL 2-only viewport context creation and resource reinitialization after WebGL context restoration.

The live runner intentionally advances the CAD model revision through the service-role REST API to prove that an already persisted derivative becomes `STALE` and cannot be regenerated from the superseded completion. It is safe to run only against the exact allowlisted non-production app and Supabase hosts and a disposable test project. It must never be configured with production credentials.

## Database deployment and security evidence — 21 November 2026

Read-only Supabase checks confirmed that both the dedicated `AI-Mechanical-Engineering-Assistant-E2E` project and the production project contain the M2 migrations `20261113210000_m2_display_derivatives_and_drawings` and `20261115130000_m2_generated_drawing_lineage`, as well as the G2 geometry revision migrations.

The dedicated E2E project is `ACTIVE_HEALTHY`. Its M2 tables were checked directly:

| Table | RLS | anon SELECT | authenticated SELECT | Policies |
|---|---:|---:|---:|---:|
| `engineering_cad_display_derivatives` | enabled | denied | allowed | 1 |
| `engineering_cad_drawings` | enabled | denied | allowed | 1 |
| `engineering_geometry_revisions` | enabled | denied | denied | 0 |

The geometry-revision table is intentionally server-only: the migration grants table access to `service_role` and no direct `anon`/`authenticated` access. The public `get_current_geometry_revision_heads` SECURITY DEFINER RPC was reviewed: it rejects a missing `auth.uid()`, limits the requested model list, and verifies project membership before returning revision IDs. The Supabase advisor's warning for that RPC is therefore reviewed, not silently ignored. The advisor also reports other server-only tables with RLS and no policies; these are not a reason to add broad client policies.

No Supabase schema changes were made during this closure cycle. Production was inspected read-only; all planned mutation tests remain restricted to the dedicated E2E project.

## Preview worker configuration blocker

The Vercel preview for this branch builds the application, and the global Preview Supabase URL is configured for the dedicated E2E project. However, the branch has no branch-scoped `CAD_WORKER_API_TOKEN` (and no matching worker configuration) in Vercel. Existing worker credentials are scoped to other branches. The preview cannot safely execute the authenticated CAD completion → OCCT workflow until a dedicated non-production worker URL/token is configured for this branch.

Do not copy a secret from another branch, use the production worker/token, or point the test at production to bypass this blocker. The exact approval/configuration required is a branch-scoped non-production `CAD_WORKER_URL` and `CAD_WORKER_API_TOKEN`, with a token dedicated to this acceptance preview.

The GitHub Supabase Preview integration is disabled for new PR branches, but this is not a schema blocker: the separate E2E Supabase project already has the M2 migrations. The remaining blocker is the application-to-worker secret boundary and the protected live-acceptance session/test fixture configuration.

## Protected live-acceptance configuration

Create/configure the GitHub Environment named `m2-artifact-acceptance` only for this closure workflow.

Required environment variables:

- `CAD_WORKSPACE_BASE_URL` — exact HTTPS Vercel preview URL.
- `CAD_WORKSPACE_ALLOWED_HOST` — exact hostname only, no wildcard.
- `CAD_WORKSPACE_PROJECT_ID` — disposable project UUID.
- `CAD_WORKSPACE_MODEL_ID` — disposable CAD model UUID.
- `CAD_WORKSPACE_SUPABASE_URL` — dedicated non-production Supabase URL.
- `CAD_WORKSPACE_SUPABASE_ALLOWED_HOST` — exact Supabase hostname, no wildcard.

Required environment secrets:

- `CAD_WORKSPACE_COOKIE` — authenticated session for a project member allowed to execute CAD and upload drawings.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key for the dedicated non-production Supabase project only.

The runner creates CAD and drawing records and increments the disposable model revision. Do not reuse a production project, production Supabase URL or production service-role key. The workflow does not deploy to production, apply production migrations, enable a worker, or change production runtime flags.

## Acceptance gates and evidence required

1. **Canonical identity and immutability:** one project authorization path; canonical BREP bytes remain immutable; exact SHA-256 agrees between source record, storage download and validation receipt.
2. **Derivative lineage:** derivative records bind source artifact ID/digest, model revision, converter identity/version and tessellation settings. The exact private GLB bytes match the derivative digest.
3. **Private access and audit:** authenticated project member can read; anonymous and wrong-project users cannot; private storage is only accessed with short-lived signed URLs; audit persistence is verified.
4. **Stale-source behavior:** current derivative reports `CURRENT`; after model revision advancement it reports `STALE`; a new geometry operation using the superseded completion returns conflict and does not register a derivative as current.
5. **Drawing acceptance:** PDF, safe SVG and ASCII DXF upload/list/download; unsafe SVG, malformed inputs, MIME/extension spoofing, oversized files and unauthorized/cross-project access fail closed.
6. **Viewport acceptance:** WebGL 2, orbit/pan/zoom, fit/reset, body selection and visibility; no renderer error or horizontal overflow; resources are disposed on unmount; context loss/restoration recovers or reports a safe error.
7. **Renderer benchmark:** identical pre-tessellated fixtures and replayed interactions; at least five paired runs per workload on representative physical desktop and Android devices; retain raw JSON, device/OS/browser/GPU, frame-time percentiles, picking correctness/latency, memory observations, resource disposal and context recovery. Do not infer device metrics from a virtualized browser.
8. **Renderer decision:** update the renderer ADR only after mandatory correctness/mobile/recovery gates pass. If the evidence is insufficient or scores are close, explicitly defer selection rather than manufacture a winner.
9. **Exact-head release checks:** `npm ci`, `npm test`, `npm run build`, `npm run architecture:graph -- --strict`, worker checks, CodeQL/Codacy/CodeScene and relevant authenticated Playwright/browser acceptance on the exact candidate SHA.
10. **Deployment:** verify the exact Vercel preview SHA and worker revisions/readiness. Production rollout is a separate approval and is not part of M2 acceptance.

## Verification history

- PR #154 merged at merge commit `518b5e1efcedc2ca73d7185776accd3f7be09548`; PR head was `5afbb19a3fcede422f48c4db1dfc7186f932e480`.
- The implementation plan records successful exact-head CI/security/code-health/build checks on the merged M2 implementation heads and CAD/OCCT regression, worker build/smokes, CAD intent-to-verified-artifact E2E and production build in run [43562679787](https://github.com/alphanerd-dev/AI-Mechanical-Engineering-Assistant-/actions/runs/43562679787).
- These checks do not substitute for the authenticated M2 derivative/drawing workflow or physical-device renderer benchmark.
- The M2 closure-branch commits have not yet been verified by CI or live acceptance at the time of this status update.

## Explicit non-claims

- Tessellation and viewport rendering do not validate engineering geometry.
- Display derivatives are not canonical CAD artifacts.
- Whole-body display selection is not stable face/edge topology selection.
- PDF/SVG/DXF preview does not validate dimensions, drafting standards or manufacturing readiness.
- A virtualized benchmark is not physical-device evidence.
- A renderer is not selected until the accepted benchmark decision is recorded.
- A green build does not prove the complete M2 workflow.
