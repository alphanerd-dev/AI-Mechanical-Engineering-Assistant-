# Forge phased implementation plan — repository continuation

**Date:** 29 October 2026  
**Baseline:** main at commit 3579fcdc64c20745e5490177d31e1eb1d67e6e9b  
**Implementation path:** Continue the existing alphanerd-dev/AI-Mechanical-Engineering-Assistant- repository. Do not generate a second application or replace the established backend.

## Source authority and conflict resolution

The precedence is: (1) original product brief/doctrine and accepted architecture decisions; (2) code, migrations, tests, and verified runtime evidence in this repository; (3) Forge v11.2 visual references and behavior handoff; (4) the master implementation prompt.

| Conflict or choice | Decision |
|---|---|
| “Build from scratch” versus an existing intended production repository | Extend the repository in-place through feature branches and pull requests. Preserve reusable modules and migration history. |
| Some prompt sections name Firebase, later clauses require retaining Supabase | Keep Supabase Auth, PostgreSQL, RLS and private Storage. Do not add Firebase or a parallel database. This is the explicit architecture-preserving resolution. |
| Suggested /app routes differ from current routes | Keep existing routes where they already provide the equivalent capability; add or remap routes only with a proven product requirement and non-inert destination. |
| AI-provider examples mention Gemini/Google AI Studio | Preserve the current server-side provider-neutral/configurable transport. Gemini can be added through the adapter when configured and tested; no model provider is claimed connected solely because an API shape exists. |
| Prototype depicts rich CAD/FEA/P&ID results | Treat the prototype as a visual/interaction reference. Synthetic values remain fixtures; actual capability status comes from code, worker readiness and capability-specific evidence. |
| Wide schema list asks for new tables | First map existing persistence and migrations. Reuse project/workspace snapshots, engineering runs, CAD records and audit/evidence stores where they satisfy the contract. Add a table only for an evidenced gap and through a migration. |

## Phase A — Inspection and reconciliation

**Status: COMPLETE**

Inspected and reconciled:
- Repository metadata, main revision, all 712 tree entries, route/API inventory, package.json, existing tests and all 16 SQL migration files.
- docs/product-brief.md, docs/implementation-plan.md, docs/architecture.md, and the existing idempotent project-creation ADR.
- Forge v11.2 ZIP and audited HTML. Verified their SHA-256 hashes match the pinned handoff README: ZIP f52bc8f9877f7512edc5fdc95732f6ffe4a90119d78a841c7853857021498b31; prototype a6d37e004d9d04167457a01174b839d40b998e4463af1b680e008b2b98e24d66. The ZIP contains desktop/mobile captures, token files, wireframes, UX, component, accessibility, IA and implementation documents. Its capture report is not a production acceptance result.
- Main-branch check runs at the baseline SHA: eight listed checks completed successfully, including CI/security checks and the isolated authenticated E2E workflow.
- Live, read-only browser journeys against the canonical URL. The public workspace and login routes render and the public link audit checked 7/7 links. The 390-pixel login layout has a real form-flow defect documented in the main implementation plan update and addressed by the associated feature change.

### Current repository map

- **Application:** Next.js App Router, React and TypeScript. Existing pages include workspace overview, login/signup, project overview, engineering analysis/execution, CAD, requirements, research, reasoning and validation.
- **API:** Auth/session routes, project lifecycle and workspace routes, engineering intent/reasoning/audit, CAD readiness/models/completions, durable execution, and research verification.
- **Persistence/security:** Supabase SSR/client adapters; 16 version-controlled migrations covering project/workspace state, owner lifecycle, durable intent/conversation, audit/evidence, CAD completion, durable jobs/leases, server-only snapshot writes, project-create idempotency and guarded rename.
- **Engineering:** Deterministic pump hydraulic/shaft-power pilot; bounded cylindrical CAD build123d worker and independent OCCT validation path; execution/validation/evidence state separation and revision lineage.
- **Existing checks:** Vitest unit/integration coverage, Playwright public and opt-in authenticated E2E, Python worker tests, ESLint, type/build checks, CodeQL and Codacy.
- **Genuine gaps:** No assistant-ui or Vercel AI SDK package and no dedicated assistant streaming route is present at the baseline; the full interactive Three.js CAD viewer, VTK FEA result viewer, and structured persistent P&ID/PFD editor are not complete connected features. Current outcome-baseline tests validate aggregation logic against fixtures; they do not establish a real operational KPI baseline.

## Capability maturity baseline

| Capability | Evidence-backed status at baseline | Do not claim |
|---|---|---|
| Authentication and private project/workspace API | Supabase-backed integration exists; auth page render verified; existing auth/persistence E2E passes on the isolated environment | Successful sign-in with a real user was not exercised by the recent read-only browser run |
| Pump hydraulic/shaft-power calculation | Deterministic pilot, validation and digest-bound persisted evidence; unit and tampering tests exist | Certified sizing, motor selection or blanket engineering approval |
| Cylindrical CAD workflow | Actual isolated worker, build123d/OCCT validation, private artifact persistence and correlated audit evidence passed isolated E2E | General free-form CAD/assemblies, geometry repair for arbitrary files or production manufacturing |
| FEA/Gmsh/CalculiX/PyMechanical | Provider contracts/pilot paths and worker tests exist; each runtime/format must be verified for the chosen deployment | Certified safety, convergence or physical adequacy without the specific evidence/review |
| Global/project streamed AI chat | Existing persisted intent/conversation and configurable structured reasoning transport | Finished assistant-ui streaming experience; assistant-ui/Vercel AI SDK are not yet installed |
| CAD/FEA viewers and P&ID/PFD editor | Design and typed artifact/viewer direction documented | Rendered/validated connected implementation; prototype data is not real output |
| Outcome baseline | Aggregation helper and fixture-based tests exist | Measured real user-time savings or production cost-per-accepted-outcome |

## Phase B — Full-stack foundation and responsive auth correction

**Status: IN PROGRESS — first targeted implementation slice**

- Preserve the existing Next.js, strict TypeScript, CSS token system, Supabase server-side boundaries and migration history.
- Fix the verified mobile auth defect by scoping a vertical authForm layout to sign-in/sign-up, adding labelled-control spacing, 44px control targets, consistent control widths, and retaining visible keyboard focus.
- Add Playwright regression coverage for login and signup at the 390×844 design viewport. The tests must assert form stacking, label/input geometry, touch target size, keyboard order/focus and no horizontal overflow.
- Never submit auth forms or use test accounts against the production host in the read-only browser check. The E2E regression must run on a dedicated non-production deployment.
- Keep branch-specific secrets and E2E database settings isolated; do not create Firebase resources or change production settings.

## Phase C — Core product workflows

Priorities after the Phase B regression passes:
1. Reconcile actual route coverage against docs/design/forge-v11.2/INFORMATION_ARCHITECTURE.md; retain the global workspace shell and stable project-scoped destinations.
2. Verify project brief review -> explicit confirmation -> exactly one idempotent project create -> redirect into that project's context using current persisted server state.
3. Inspect existing persisted intent/conversation records and source/context contracts before adding chat tables. Add new-thread and thread-switch semantics only where a real gap exists.
4. Add streamed assistant UI through a provider-neutral server-side adapter after compatibility research and tool-call authorization tests. Do not bypass existing structured intent logic or persist hidden chain-of-thought.
5. Implement activity, artifact, revision and settings pages only against real persisted services; every unavailable integration must have an honest disabled/unavailable state, never a fake success.

## Phase D — Engineering capabilities

1. Preserve and re-test the existing deterministic pump power vertical slice: validated unit-aware inputs -> deterministic equation -> persisted result/artifact -> capability-specific validation -> provenance/evidence.
2. Preserve and re-test bounded cylindrical CAD: grounded typed intent -> deterministic source -> isolated build123d/OCCT worker -> artifact registration -> independent geometry validation -> revision-bound receipt/audit chain.
3. Verify the artifact contract and the file/Storage access boundary before integrating a viewer. Do not accept a display derivative as canonical engineering truth.
4. Implement Three.js CAD viewing only for verified supported artifact types/derivatives and known lineage.
5. Implement VTK.js FEA viewing only after accepted solver formats and source-value fixtures are established. Keep synthetic fixtures labelled and separated from real solver results.
6. Implement P&ID/PFD structured persistence and validation only against a versioned schema. Do not claim standard compliance without a real applicable rule set and checks.
7. Keep long-running work in durable job/worker infrastructure; do not move calculations/validation into the UI or language model.

## Phase E — Verification

On the exact feature-branch SHA:
- npm ci, npm test, the repository build/type-check script, ESLint and architecture checks.
- Run Playwright in the dedicated E2E deployment, including auth/persistence/ownership, public and mobile navigation, and the new 390px auth form test.
- Run applicable CAD worker/OCCT and computation tests; inspect the returned current-SHA check runs and artifacts, not a green run from an older revision.
- Recheck keyboard order/focus and axe scan results. A zero-violation axe run is not a substitute for verifying the previously misaligned form or inconclusive checks.
- Confirm all test-created objects and storage files were removed from the isolated environment. Do not direct tests at production or claim production auth/persistence tests if only staging ran.

## Phase F — Handoff

- Keep this plan and docs/architecture.md as architectural sources of truth; add ADRs for consequential design choices.
- Record changed files, commit and PR SHA, actual command/run outcomes, deployment revision, migration state and evidence links.
- List capabilities as implemented, tested, configured-but-not-connected, pilot, or planned.
- Document required environment variables by name only, setup/migration/test/rollback steps and unconfigured external dependencies.
- Do not claim completion of routes, AI provider, solver, viewer or savings before evidence exists.

## Project route map and schema strategy

The current repository deliberately uses route paths such as /, /login, /signup, /projects/[projectId], /projects/[projectId]/analysis, /projects/[projectId]/cad, /projects/[projectId]/reasoning, /projects/[projectId]/research, and /projects/[projectId]/validation. The handoff routes are target information architecture, not proof that those paths exist today. Any route migration must be deliberate, tested and preserve working destinations.

The 16 current SQL migrations should be inspected as a set before adding new profiles, workspaces, messages, files, artifacts, engineering_runs, validation_receipts or approvals tables. First map current workspace snapshot, project owner/member, durable intent/conversation, CAD model/completion, execution job/lease and audit/evidence records to each desired entity. Implement only the missing contract, with foreign keys, indexes, RLS/role grants, migration reconciliation and isolated E2E. Do not create duplicate persistence tables solely to match prompt naming.

## Release posture

The baseline main revision has passing repository checks and a 12/12 isolated authenticated acceptance run, including actual accepted CAD. That does not make the entire product complete. The new branch's responsive-auth tests and documentation changes must pass on their exact SHA. The real outcome-measurement baseline, streamed chat, full viewers and structured P&ID/PFD workflow remain explicit follow-up gates.

