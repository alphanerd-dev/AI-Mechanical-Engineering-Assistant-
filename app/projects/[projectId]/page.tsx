import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Calculator,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock3,
  DraftingCompass,
  FileText,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { createClient } from "../../../lib/supabase/server";
import { deriveProjectOverview, type OverviewTone } from "../../../src/projects/project-overview";
import type { EngineeringWorkspaceSnapshot } from "../../../src/workspace/types";
import type { ProjectState } from "../../../src/core/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const modules = [
  { title: "Requirements", description: "Persist requirements, units, assumptions and verification methods.", slug: "requirements", icon: FileText },
  { title: "Analysis", description: "Run deterministic calculations and inspect calculation evidence.", slug: "analysis", icon: Calculator },
  { title: "CAD", description: "Generate geometry through a configured worker and independent validator.", slug: "cad", icon: DraftingCompass },
  { title: "Validation", description: "Inspect completeness gates, validation receipts and evidence.", slug: "validation", icon: ShieldCheck },
  { title: "AI project chat", description: "Discuss this project's engineering context with the assistant.", slug: "engineering", icon: MessageSquare },
  { title: "Reasoning workbench", description: "Structure decisions, dependencies and task reasoning.", slug: "reasoning", icon: Boxes },
] as const;

const badgeVariant: Record<OverviewTone, NonNullable<BadgeProps["variant"]>> = {
  muted: "muted",
  info: "info",
  warning: "warning",
  danger: "danger",
  success: "success",
};

function OverviewMetric({ label, value, detail, icon: Icon, tone = "muted" }: {
  label: string;
  value: string | number;
  detail: string;
  icon: typeof Activity;
  tone?: OverviewTone;
}) {
  return (
    <article className="projectOverviewMetric">
      <div><span>{label}</span><Icon size={16} aria-hidden="true" /></div>
      <strong>{value}</strong>
      <small data-tone={tone}>{detail}</small>
    </article>
  );
}

function formatTimestamp(value: string | undefined) {
  if (!value) return "Timestamp unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Timestamp unavailable" : date.toLocaleString();
}

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  if (projectId === "demo") return <DemoProjectPage />;
  if (!UUID.test(projectId)) notFound();

  let db: Awaited<ReturnType<typeof createClient>>;
  try { db = await createClient(); } catch { notFound(); }
  const { data: project, error } = await db
    .from("engineering_projects")
    .select("id,name,stage,status,revision,created_at,updated_at")
    .eq("id", projectId)
    .maybeSingle();
  if (error || !project) notFound();

  const { data: workspaceRow, error: workspaceError } = await db
    .from("engineering_workspaces")
    .select("revision,snapshot,saved_at")
    .eq("project_id", projectId)
    .maybeSingle();
  const savedSnapshot = workspaceRow?.snapshot as EngineeringWorkspaceSnapshot | undefined;
  const savedProject = savedSnapshot?.project;
  const projectState: ProjectState = savedProject?.id === projectId ? savedProject : {
    id: project.id,
    name: project.name,
    stage: project.stage,
    status: project.status,
    requirements: [],
    assumptions: [],
    openQuestions: [],
    unresolvedRisks: [],
    events: [],
  };
  const summary = deriveProjectOverview(
    projectState,
    savedSnapshot?.id === projectId ? savedSnapshot.taskGraph : undefined,
    savedSnapshot?.id === projectId ? savedSnapshot.artifacts : undefined,
  );
  const requirements = projectState.requirements ?? [];
  const openQuestions = projectState.openQuestions ?? [];
  const assumptions = projectState.assumptions ?? [];
  const unresolvedRisks = projectState.unresolvedRisks ?? [];
  const events = [...(projectState.events ?? [])].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)).slice(0, 6);
  const workspaceRevision = savedSnapshot?.id === projectId
    ? savedSnapshot.revision
    : workspaceRow?.revision ?? project.revision;
  const executionRoute = `/projects/${projectId}/analysis/execution`;
  const nextActions = summary.execution.state === "RUNNING"
    ? [
        { title: "Monitor current execution", description: "Inspect task state and available run details.", href: executionRoute, icon: Activity },
        { title: "Inspect validation evidence", description: "Review the separate validation receipts for this project.", href: `/projects/${projectId}/validation`, icon: ShieldCheck },
        { title: "Review project requirements", description: "Check the inputs and verification methods behind the work.", href: `/projects/${projectId}/requirements`, icon: FileText },
      ]
    : summary.execution.state === "FAILED" || summary.execution.state === "BLOCKED"
      ? [
          { title: "Inspect task blockers", description: "Review failed tasks, dependencies and missing inputs.", href: `/projects/${projectId}/analysis`, icon: AlertCircle },
          { title: "Review project requirements", description: "Check required values and verification methods.", href: `/projects/${projectId}/requirements`, icon: FileText },
          { title: "Ask the project assistant", description: "Discuss the recorded project context and unresolved questions.", href: `/projects/${projectId}/engineering`, icon: MessageSquare },
        ]
      : [
          { title: requirements.length === 0 ? "Define project requirements" : "Review project requirements", description: requirements.length === 0 ? "Capture inputs, units, assumptions and verification methods." : "Inspect requirement completeness and evidence needs.", href: `/projects/${projectId}/requirements`, icon: FileText },
          { title: "Ask the project assistant", description: "Discuss the project objective and open engineering questions.", href: `/projects/${projectId}/engineering`, icon: MessageSquare },
          { title: "Inspect validation and evidence", description: "Review recorded artifact receipts and current validation state.", href: `/projects/${projectId}/validation`, icon: ShieldCheck },
        ];

  return (
    <div className="shell projectOverviewPage">
      <div className="projectOverviewBreadcrumb" aria-label="Breadcrumb">
        <Link href="/">Workspace</Link><ChevronRight size={13} aria-hidden="true" />
        <Link href="/projects">Projects</Link><ChevronRight size={13} aria-hidden="true" />
        <span>{project.name}</span>
      </div>

      <header className="projectOverviewHeader">
        <div>
          <p className="eyebrow">PROJECT WORKSPACE</p>
          <h1>Project overview</h1>
          <p className="muted">A project-level home for state, outputs, decisions and next actions.</p>
        </div>
        <div className="projectOverviewHeaderActions">
          <Link className="button secondaryButton" href={`/projects/${projectId}/engineering`}>Ask AI about project <MessageSquare size={14} aria-hidden="true" /></Link>
          <Link className="button workspacePrimaryAction" href={`/projects/${projectId}/analysis`}>Open workbench <ArrowUpRight size={14} aria-hidden="true" /></Link>
        </div>
      </header>

      <nav className="projectOverviewTabs" aria-label="Project sections">
        <span aria-current="page">Overview</span>
        <Link href={`/projects/${projectId}/engineering`}>AI chat</Link>
        <Link href={`/projects/${projectId}/workbench`}>3D workbench</Link>
        <Link href={`/projects/${projectId}/analysis`}>Analysis</Link>
        <Link href={`/projects/${projectId}/calculations`}>Calculations</Link>
        <Link href={`/projects/${projectId}/requirements`}>Requirements</Link>
        <Link href={`/projects/${projectId}/cad`}>CAD</Link>
        <Link href={`/projects/${projectId}/fea`}>FEA</Link>
        <Link href={`/projects/${projectId}/pid`}>P&amp;ID</Link>
        <Link href={`/projects/${projectId}/validation`}>Validation</Link>
        <Link href={`/projects/${projectId}/research`}>Research</Link>
        <Link href={`/projects/${projectId}/files`}>Files</Link>
        <Link href={`/projects/${projectId}/reports`}>Reports</Link>
        <Link href={`/projects/${projectId}/history`}>History</Link>
        <Link href={`/projects/${projectId}/revisions`}>Revisions</Link>
        <Link href={`/projects/${projectId}/settings`}>Settings</Link>
      </nav>

      <section className={`projectExecutionBanner projectExecutionBanner-${summary.execution.tone}`} aria-label="Engineering execution state">
        <span className="projectExecutionIcon"><Activity size={17} aria-hidden="true" /></span>
        <div className="projectExecutionCopy"><strong>{summary.execution.label}</strong><p>{summary.execution.detail}</p></div>
        <Badge variant={badgeVariant[summary.execution.tone]}><Activity size={11} aria-hidden="true" />{summary.execution.state.replaceAll("_", " ")}</Badge>
        {summary.execution.state === "RUNNING" && <Link className="projectExecutionAction" href={executionRoute}>Monitor run <ArrowRight size={14} aria-hidden="true" /></Link>}
      </section>

      {workspaceError && <div className="projectOverviewNotice" role="status">The persisted workspace snapshot could not be loaded. Project metadata remains available; workspace-derived counts and evidence are not shown as confirmed.</div>}

      <section className="projectOverviewMetrics" aria-label="Project state summary">
        <OverviewMetric label="Current revision" value={`R${workspaceRevision}`} detail={workspaceRow ? `Saved ${formatTimestamp(workspaceRow.saved_at)}` : "Workspace revision not recorded"} icon={Clock3} />
        <OverviewMetric label="Project state" value={project.status} detail={project.stage.replaceAll("_", " ")} icon={CircleDot} tone={project.status === "ACTIVE" ? "info" : project.status === "BLOCKED" ? "warning" : "success"} />
        <OverviewMetric label="Calculation artifacts" value={summary.artifactCount === null ? "Not recorded" : summary.artifactCount} detail="Workspace artifact registry only" icon={FileText} />
        <OverviewMetric label="Review state" value={summary.review.label} detail={summary.review.detail} icon={ShieldCheck} tone={summary.review.tone} />
      </section>

      <section className="projectOverviewMainGrid">
        <article className="panel projectObjectivePanel">
          <header className="projectPanelHeader"><div><h2>Project objective</h2><p>Current scope and engineering constraints</p></div><Link className="projectEditLink" href={`/projects/${projectId}/requirements`}>Review scope <ArrowUpRight size={13} aria-hidden="true" /></Link></header>
          <div className="projectObjectiveBody">
            <p className="projectObjectiveText">{summary.objective ?? "No project objective has been captured yet. Record the problem statement and constraints before treating scope as defined."}</p>
            <div className="projectFactGrid">
              <div className="projectFact"><span className="projectFactIcon"><Boxes size={16} aria-hidden="true" /></span><div><strong>Engineering domain / stage</strong><p>{project.stage.replaceAll("_", " ")}</p></div></div>
              <div className="projectFact"><span className="projectFactIcon"><Clock3 size={16} aria-hidden="true" /></span><div><strong>Current revision</strong><p>R{workspaceRevision}</p></div></div>
              <div className="projectFact"><span className="projectFactIcon"><Activity size={16} aria-hidden="true" /></span><div><strong>Execution state</strong><p>{summary.execution.label}</p></div></div>
              <div className="projectFact"><span className="projectFactIcon"><ShieldCheck size={16} aria-hidden="true" /></span><div><strong>Validation state</strong><p>{summary.validation.label}</p></div></div>
            </div>
            <div className="projectBaselineCard">
              <span className="projectFactIcon"><CheckCircle2 size={16} aria-hidden="true" /></span>
              <div><strong>Verified baseline evidence</strong>{summary.baseline ? <p>{summary.baseline.name} · R{summary.baseline.revision} · {summary.baseline.validator} · {formatTimestamp(summary.baseline.validatedAt)}</p> : <p>No calculation artifact currently meets the completed, passing-validation and verified conditions for a baseline.</p>}</div>
              <Badge variant={summary.baseline ? "success" : "muted"}>{summary.baseline ? <CheckCircle2 size={11} aria-hidden="true" /> : <Clock3 size={11} aria-hidden="true" />}{summary.baseline ? "Verified" : "Not recorded"}</Badge>
            </div>
          </div>
        </article>

        <article className="panel projectSafeActionsPanel">
          <header className="projectPanelHeader"><div><h2>Next safe actions</h2><p>Suggested steps; nothing runs automatically.</p></div><Badge variant="muted"><ShieldCheck size={11} aria-hidden="true" />Guidance only</Badge></header>
          <div className="projectSafeActionsList">
            {nextActions.map(action => {
              const Icon = action.icon;
              return <Link className="projectSafeAction" href={action.href} key={action.title}>
                <span className="projectFactIcon"><Icon size={16} aria-hidden="true" /></span>
                <span><strong>{action.title}</strong><small>{action.description}</small></span>
                <ArrowRight size={14} aria-hidden="true" />
              </Link>;
            })}
          </div>
        </article>

        <article className="panel projectRecentActivityPanel">
          <header className="projectPanelHeader"><div><h2>Recent project activity</h2><p>Recorded revision and decision lineage</p></div><span className="projectActivityHeaderIcon"><HistoryIcon /></span></header>
          {events.length === 0 ? <p className="projectOverviewEmptyText">No project events are recorded in this workspace snapshot yet.</p> : <div className="projectOverviewActivityList">
            {events.map(event => <div className="projectOverviewActivityItem" key={event.id}>
              <span className="projectFactIcon"><Activity size={15} aria-hidden="true" /></span>
              <div><strong>{event.action.replaceAll("_", " ")}</strong><small>{event.actor} · {formatTimestamp(event.timestamp)}</small></div>
            </div>)}
          </div>}
        </article>

        <article className="panel projectNavigationPanel">
          <header className="projectPanelHeader"><div><h2>Project navigation</h2><p>Open an existing project workflow.</p></div></header>
          <div className="projectNavigationGrid">
            {modules.map(module => {
              const Icon = module.icon;
              return <Link className="projectNavigationLink" href={`/projects/${projectId}/${module.slug}`} key={module.slug}>
                <Icon size={15} aria-hidden="true" /><span>{module.title}</span><ArrowUpRight size={13} aria-hidden="true" />
              </Link>;
            })}
          </div>
          <div className="projectStateFootnote"><span>Requirements</span><strong>{requirements.length}</strong><span>Open questions</span><strong>{openQuestions.length}</strong><span>Assumptions</span><strong>{assumptions.length}</strong><span>Unresolved risks</span><strong>{unresolvedRisks.length}</strong></div>
        </article>
      </section>

      <p className="projectOverviewDataNote">Execution, validation, artifact and review indicators are derived from the saved task graph and calculation artifact registry. CAD file inventory and project-wide approval are not inferred from calculation artifacts.</p>
    </div>
  );
}

function HistoryIcon() {
  return <Clock3 size={17} aria-hidden="true" />;
}

function DemoProjectPage() {
  return <div className="shell projectOverviewPage projectDemoOverview">
    <div className="projectOverviewBreadcrumb"><Link href="/">Workspace</Link><ChevronRight size={13} aria-hidden="true" /><Link href="/projects">Projects</Link><ChevronRight size={13} aria-hidden="true" /><span>Demo sandbox</span></div>
    <header className="projectOverviewHeader"><div><p className="eyebrow">ILLUSTRATIVE SANDBOX</p><h1>Shaft Design Benchmark</h1><p className="muted">Example: 5 kW · 1500 rpm. This sample is not a registered project and its data may reset.</p></div><Link className="button workspacePrimaryAction" href="/#create-project">Create a real project <ArrowUpRight size={14} aria-hidden="true" /></Link></header>
    <section className="projectNotice projectNoticeWarning"><strong>Demo data only · no solver connected</strong><p>Use this area to explore the interface. Example values and results are illustrative and are not a calculation record, validation receipt or engineering approval.</p></section>
    <section className="projectNavigationGrid projectDemoNavigation">{modules.map(module => { const Icon=module.icon; return <Link className="projectNavigationLink" href={`/projects/demo/${module.slug}`} key={module.slug}><Icon size={15} aria-hidden="true" /><span>{module.title}</span><ArrowUpRight size={13} aria-hidden="true" /></Link>; })}</section>
  </div>;
}
