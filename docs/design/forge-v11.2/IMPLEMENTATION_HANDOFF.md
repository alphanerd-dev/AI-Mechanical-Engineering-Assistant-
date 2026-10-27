# React / Next.js implementation handoff

## Recommended architecture
- Next.js App Router + React + TypeScript; shared route layouts for workspace and project shell.
- Server Components for data-first pages where useful; Client Components for chat, pane resizing and viewer interaction.
- Zod or equivalent to validate form/API payloads.
- Separate domain state/services from presentation; keep route/data business logic out of visual components.
- Use an accessible component library only after confirming the repository's existing dependencies and theme.

## Suggested route map
/workspace, /projects, /projects/new, /projects/new/review, /assistant, /templates, /activity, /settings/profile, /settings/ai, /settings/engineering, /projects/[projectId], /projects/[projectId]/chat, /projects/[projectId]/workbench, /projects/[projectId]/fea, /projects/[projectId]/pid, /projects/[projectId]/calculations, /projects/[projectId]/files, /projects/[projectId]/history, /projects/[projectId]/revisions, /projects/[projectId]/reports and /projects/[projectId]/settings.

These are design target routes, not an assertion that every route is already implemented in the current codebase. Reconcile route differences deliberately rather than adding links to nonexistent pages.

## Minimum domain model
- Project: id, code, name, domain, objective, units, status, currentRevisionId, createdAt, updatedAt.
- Conversation: id, scope, projectId nullable, title, createdAt, updatedAt.
- Message: id, conversationId, role, content, createdAt, status, citations, toolCallIds.
- Artifact: id, projectId, revisionId, kind, title, source, status, units, metadata.
- Run: id, projectId, revisionId, solver, status, startedAt, completedAt, outputArtifactIds.
- ValidationReceipt: id, projectId, revisionId, runId, checks, result, createdAt, validatorVersion.
- Approval: id, projectId, revisionId, actorId, decision, rationale, createdAt.

## Engineering rules
1. Use stable IDs rather than project names for route identity.
2. Use server persistence for production project/thread/settings data.
3. Keep AI orchestration distinct from deterministic calculation/solver services.
4. Treat model output as proposals until validated by appropriate deterministic systems.
5. Never infer approval from a green status or successful solver exit.
6. Version artifacts and bind validation evidence to exact revisions/runs.

## Delivery sequence
App shell and route map; projects and creation flow; thread model and AI chat; project overview/history/files/revisions/settings; engineering viewer contracts; auth, persistence, permissions and real services; accessibility, responsive and end-to-end tests.
