# Google AI Studio implementation prompt

You are a senior frontend engineer implementing the Engineering OS UI from the attached v11.2 audited HTML prototype, screenshots, wireframes, design tokens, and handoff documentation. Build a production-quality React + Next.js App Router + TypeScript application. Treat the HTML as a visual/behavior reference, not as code to blindly port.

## Product intent
Build a project-centered AI-native mechanical engineering workspace. The workspace overview, project lifecycle, and AI Engineering Assistant are primary features. The engineering workbench (CAD/FEA/P&ID/calculations/reports) is one project sub-area and must not replace the full product shell.

## Must implement
1. Persistent responsive global shell with sidebar, topbar, global search, workspace navigation and project-context navigation.
2. Workspace overview, projects list, create project, review brief, templates, global assistant, activity and profile/AI/engineering settings.
3. Project overview, project-scoped AI chat, workbench, FEA, P&ID/PFD, calculations, files/artifacts, history, revisions/approvals, reports and project settings.
4. Independent conversation threads with stable IDs, per-thread messages and explicitly attached sources.
5. Project creation as a validated sequence: objective → review brief → create one project → open that project's chat.
6. CAD/FEA controls that visibly work when real data exists; otherwise label fixtures and unavailable integrations honestly.
7. Revision-bound runs, artifacts, validation receipts and approvals. Solver completion, validation and human approval are separate states.
8. Desktop and mobile responsive layouts using the supplied screenshots/wireframes.

## Technical constraints
- Use stable IDs in routes, not display names.
- Use typed domain models and isolated services.
- Do not store API keys/secrets in localStorage or client bundles.
- Do not invent a real solver, validated result, citation or approval.
- Provide loading, empty, error, permission-denied and stale-revision states.
- Keep accessible labels, keyboard interactions, visible focus and status text independent of color.
- Do not add dependencies until checking the project/package setup.

## Workflow
First inspect all supplied files. Create a route/component plan and data model. Then implement the shared shell and project/chat workflows before engineering sub-pages. Use screenshot references for visual QA at desktop 1440px and mobile 390px. Add unit tests for project selection, project creation, conversation switching, settings persistence and revision-state transitions. Report what is implemented versus stubbed. Do not claim production backend integrations unless actually connected.

## Acceptance criteria
- Every sidebar item routes to the correct page.
- Selecting project A never displays project B's data.
- Creating a project makes exactly one record and starts its own chat.
- Switching threads restores the correct messages and sources.
- Save/search/filter actions produce observable correct results.
- Desktop and mobile layout match the hierarchy in the supplied mockups.
- FEA legends display field, range and units; probes show coordinates/value; synthetic data is visibly labelled.
- Validation and approval states remain separate and revision-bound.
