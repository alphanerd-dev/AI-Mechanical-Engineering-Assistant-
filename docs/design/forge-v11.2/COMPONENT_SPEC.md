# Component specification

## Shared shell
AppShell, GlobalSidebar, TopBar, ProjectContextNav, Breadcrumbs, CommandSearch, ToastRegion and ResponsiveNavDrawer. The persistent shell is shared across application routes; authentication screens may opt out.

## Workspace and project
WorkspaceOverview, ProjectList, ProjectCard, ProjectFilters, CreateProjectForm, BriefReview, ProjectOverview, ProjectHistoryTimeline, ArtifactTable, RevisionComparison and ProjectSettingsForm. All use stable IDs and typed states.

## AI
AssistantLayout, ThreadList, ConversationView, MessageBubble, ToolExecutionCard, ContextSourceList, ContextPicker, ChatComposer, AttachmentTray and CitationLink. The thread list, message list and context must be driven by one selected thread record.

## Engineering
EngineeringWorkbench, ArtifactExplorer, CadViewerToolbar, CadViewport, FeaFieldSelector, ResultLegend, UnitSelector, ProbeReadout, MeshToggle, PidLayerPanel, ValidationEvidenceTable, WorkflowStrip and RevisionStateBanner. Viewer controls must perform their advertised actions or be disabled with an explanation.

## Component quality
Use semantic HTML, keyboard support, visible focus, accessible names, status text beyond color, loading/empty/error states, responsive variants and unit tests for state transitions.
