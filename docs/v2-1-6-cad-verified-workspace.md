# V2.1.6 — Verified CAD workspace and durable artifact evidence

## Scope

V2.1.6 adds a first project-scoped CAD workspace to the V2.1.5 completion workflow. The reference generator remains intentionally bounded to cylindrical parts with explicit dimensions and units. This release does not imply generic natural-language solid modeling, assembly design, manufacturing readiness, structural safety, or standards compliance.

The product invariant remains: **AI proposes. Deterministic systems execute. Validation decides. Evidence proves.**

## Acceptance boundary

The CAD completion path does not accept a boolean `valid: true` on its own. A completion can be accepted only when all of the following agree:

1. The intent parser returns a supported, typed part specification.
2. The trusted build123d provider executes generated source in the restricted CAD worker and emits the expected artifact manifest and model/execution provenance.
3. A different, host-selected `cad.occt` provider validates the exact BREP solid in a constrained, read-only validator container.
4. The validator reports one valid solid, positive volume, all three finite measured bounding-box extents, three cylinder-axis checks using the host-selected 0.01 mm tolerance, explicit checker/version identity, and no dimension contradiction against the requested millimetre specification. The host also cross-checks measured volume against the analytical cylinder volume within 0.1% (with a 1e-9 mm³ numerical floor). Missing axes, relaxed/altered tolerances, or contradictory volume claims fail closed.
5. The host computes SHA-256 of the BREP file before and after validation. If the bytes change, validation fails. Before persistence, the API reads the exact file bytes once, hashes that buffer, compares it with the validation receipt, and uploads that same buffer.
6. The artifact bridge checks the receipt against the exact solid artifact, project, model, source digest, backend, execution provider, validator provider, validator version, and output digest.
7. The API persists the accepted metadata, receipt and evidence only after the artifact bytes have been uploaded to the private project-scoped bucket. The database writer is server-only; ordinary authenticated clients have no INSERT grant on the completion table.
8. Any upload or metadata-write failure triggers best-effort object cleanup and returns an error. It never returns an accepted/persisted result while required storage writes have failed.

The workflow requires a single solid because its initial intent language only describes a single cylinder/shaft. This restriction belongs in that completion workflow, not the generic geometry acceptance contract for future multi-solid assemblies.

## APIs and workspace

- `GET/POST /api/cad/models` — lists or creates project-scoped canonical model identities.
- `GET/POST /api/cad/completions` — reads recent history with time-limited signed artifact URLs, or submits a bounded intent to the trusted CAD workflow.
- `/projects/[projectId]/cad` — UI for selecting/creating a model identity, submitting supported intent, and reviewing completion status, artifacts and evidence.

Both routes require a registered project UUID and project-scoped authorization. Request bodies are size-limited; text and arrays have explicit limits. Every referenced model and requirement is resolved against the selected project rather than trusted from browser-supplied display metadata.

Ambiguous/missing dimensions may be recorded as `NEEDS_INPUT`; unsupported shapes may be recorded as `UNSUPPORTED`. Neither case invokes the CAD runtime or creates a verified artifact. A host with no runtime configuration returns an explicit `503` for an otherwise executable request.

## Durable schema and storage

Migration: `supabase/migrations/20261010053000_v2_1_6_cad_workspace_acceptance.sql`

The migration adds `engineering_cad_models` and append-style `engineering_cad_completions` tables, a private `engineering-cad-artifacts` bucket, project-membership-scoped read policies and engineer/admin upload/delete policies. Accepted rows must include a validation receipt, verified evidence and at least one storage object. The completion table grants read access to authenticated users but grants INSERT only to `service_role`, avoiding a direct authenticated-client path to forged `ACCEPTED` records.

Object keys are derived from server-resolved UUIDs and artifact kind:

`<project-uuid>/<model-uuid>/<execution-uuid>/<kind>.<extension>`

Original host filesystem paths are not written to completion artifact records. The app persists `storage://engineering-cad-artifacts/...` URIs and serves private objects through signed URLs with a five-minute expiry. The independently validated BREP is the only artifact marked PASS/VERIFIED by this workflow; STEP/STL/3MF exports are retained as unvalidated representations unless a separate validator provides evidence for them.

## Server runtime configuration

Required server-side values:

- `CAD_BUILD123D_IMAGE` — trusted, pre-provisioned build123d worker image.
- `CAD_OCCT_IMAGE` — trusted, pre-provisioned image containing the pinned build123d/OCP OpenCascade bindings.
- `CAD_ARTIFACT_ROOT` — absolute, writable host directory for restricted CAD run artifacts.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only privileged key used only after project authorization to write accepted completion/evidence records. It must never use a `NEXT_PUBLIC_` name or be sent to the browser.

Optional:
- `CAD_DOCKER_BINARY` — trusted host Docker executable; defaults to `docker`.
- `CAD_OCCT_WORKER_PATH` — trusted validator script path; defaults to `worker/cad/occt/validate_brep.py`.

In production, both CAD images must be pinned by immutable `@sha256:<digest>` references. The runtime checks these requirements before executing. Configure the Docker daemon and artifact root as a trusted host boundary; do not expose arbitrary image references, filesystem paths, command strings or source code to request input.

The API uses the authenticated Supabase client for project reads and storage uploads so project RLS remains active. Only completion-record INSERT uses the server-only service-role client after the route has checked the user and project. Keep that key in server deployment secrets and rotate it according to the deployment's secret-management policy.

## Next.js source-module resolution

The web app uses `next dev --webpack` and `next build --webpack` for now. The reusable engineering-core TypeScript modules use explicit Node-compatible `.js` import specifiers; Next 16's default Turbopack does not currently resolve those explicit specifiers to corresponding `.ts` sources. The Next configuration therefore uses Webpack's `resolve.extensionAlias` to map `.js` imports to TypeScript source while preserving the core's ESM import convention. This is a deliberate, supported bundler selection rather than a code-path-specific import rewrite.

## Runtime readiness and live acceptance

- `GET /api/cad/readiness?projectId=<project-uuid>` checks server-side image configuration and pinning, artifact-root access, validator script presence, Docker daemon reachability, availability of both local pinned images, the privileged Supabase client, CAD tables and private bucket. It requires an authenticated project member and returns only pass/fail diagnostics; it never returns environment values, image names, filesystem paths, or raw provider errors.
- `npm run smoke:cad-live` performs an authenticated HTTP-level acceptance run. It requires the environment variables below and does not print the cookie or signed URL:
  - `CAD_WORKSPACE_BASE_URL` — deployed application origin (HTTPS outside localhost).
  - `CAD_WORKSPACE_PROJECT_ID` — an existing project UUID where the user can execute tasks.
  - `CAD_WORKSPACE_MODEL_ID` — an existing CAD model identity UUID in that project.
  - `CAD_WORKSPACE_COOKIE` — the full authenticated session Cookie header value from a safe, short-lived test session. Keep it out of source control, CI logs, chat and tickets; unset it immediately after the test.
  - Optional `CAD_WORKSPACE_TEST_NEEDS_INPUT=1` to additionally verify that missing dimensions are recorded as `NEEDS_INPUT` without producing CAD artifacts.
- The smoke runner checks readiness, posts the supported cylinder request, verifies the persisted accepted status, checks that a full geometry measurement set is present in the stored receipt, downloads the BREP from its private signed URL, recomputes SHA-256 over the downloaded bytes and compares it with the stored receipt/artifact record, and confirms the accepted completion can be read back from history.

## Deployment checklist

Before enabling this workspace in a deployment:

1. Review and apply the migration to the target Supabase project.
2. Verify the `engineering_projects` and `engineering_project_memberships` table names, helper functions and `ADMIN`/`ENGINEER` enum values match the existing V2.0.9 authorization migration.
3. Set the server-only runtime/storage variables and pin image digests for production. The V2.1.6 migration is already applied to the currently connected Supabase project; verify the target environment separately.
4. Build and provision the pinned build123d and OpenCascade-capable worker images on the same Docker daemon that the application can reach; verify the actual artifact root is mounted at a path the Docker daemon can access and the configured non-root worker/read-only validator can read it.
5. Run the authenticated readiness endpoint and ensure every check is PASS.
6. Confirm a project member can read only that project's model/completion rows and storage objects; confirm a viewer cannot create a model or upload artifacts.
7. Run `npm run smoke:cad-live` against a non-production test project. Compare the BREP digest in the host validation receipt, geometry evidence, artifact metadata and the exact bytes downloaded from private storage.
8. Exercise unsupported geometry, dimension mismatch, empty/corrupt BREP, multiple solids, malformed validator results, BREP mutation, storage upload failure and database failure. In all negative paths, no accepted/verified row or surviving unreferenced uploaded object should be left behind.
9. Verify signed URLs expire and that no public object URL, user cookie, secret or host filesystem path is persisted.

## Verification and limitations

Automated tests cover host digest agreement, receipt/provider mismatch, exactly-one-solid completion, path traversal and acceptance bundle consistency. Repository CI passed at commit `c5463c3`, including the production-provider CAD intent-to-verified-artifact path, independent OpenCascade BREP validation, repository tests, and the Next.js production build plus TypeScript check. A deployment-level smoke test remains necessary after applying the migration and configuring the target environment.

The migration being committed does not mean it has been applied to the live Supabase project. The presence of the API/UI does not mean Docker or production image configuration is available. Until a real project request has been executed and its persisted evidence inspected, report the capability as implemented in the repository but not production-verified.
