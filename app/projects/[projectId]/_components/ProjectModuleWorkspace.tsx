"use client";

import Link from "next/link";
import StlViewport from "../workbench/StlViewport";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Activity, AlertCircle, ArrowDownToLine, ArrowRight, ArrowUpRight, Box,
  CheckCircle2, ChevronRight, Clock3, FileCheck2, FileText, GitBranch,
  History, Info, Layers3, LockKeyhole, MessageSquare, RefreshCw,
  ShieldCheck, Table2
} from "lucide-react";
import type { EngineeringWorkspaceSnapshot } from "../../../../src/workspace/types";
import type { CalculationArtifact } from "../../../../src/artifacts/calculation-artifact";

type ModuleKey = "workbench" | "fea" | "pid" | "calculations" | "files" | "history" | "revisions" | "reports" | "settings";
type ProjectRecord = {
  id: string; name: string; stage: string; status: "ACTIVE" | "BLOCKED" | "COMPLETE";
  revision: number; created_at: string; updated_at: string;
};
type CadModel = { id: string; projectId: string; name: string; nativeReferences: unknown[]; createdAt: string; updatedAt: string };
type CadArtifactRecord = { id: string; kind: string; name: string; uri?: string; validationStatus?: string; informationStatus?: string };
type CadCompletionRecord = { id: string; status: string; created_at: string; artifact_records?: CadArtifactRecord[] | null; signedUrls?: Record<string, string> };
type ApiState = { project: ProjectRecord | null; snapshot: EngineeringWorkspaceSnapshot | null; cadModels: CadModel[]; cadCompletions: CadCompletionRecord[]; loading: boolean; error: string | null };

const projectTabs = [
  ["Overview", ""], ["AI chat", "engineering"], ["Workbench", "workbench"],
  ["Files & artifacts", "files"], ["History", "history"], ["Revisions", "revisions"],
  ["Reports", "reports"], ["Settings", "settings"]
] as const;
const engineeringTabs = [
  ["3D / CAD", "cad"], ["FEA results", "fea"], ["P&ID / PFD", "pid"],
  ["Calculations", "calculations"], ["Requirements", "requirements"],
  ["Analysis", "analysis"], ["Validation", "validation"]
] as const;

const config: Record<ModuleKey, { title: string; description: string; eyebrow: string }> = {
  workbench: { title: "Engineering workbench", description: "Inspect project geometry, calculation outputs and validation evidence in one place.", eyebrow: "PROJECT WORKSPACE" },
  fea: { title: "FEA results", description: "Finite-element runs, model assumptions, mesh quality and result evidence.", eyebrow: "ENGINEERING ANALYSIS" },
  pid: { title: "P&ID / PFD", description: "Process equipment, instruments, flow paths and revision-controlled diagram records.", eyebrow: "PROCESS ENGINEERING" },
  calculations: { title: "Calculations", description: "Deterministic calculation artefacts and their validation receipts.", eyebrow: "ENGINEERING RECORDS" },
  files: { title: "Files & artifacts", description: "Project records, CAD model identities and saved calculation outputs.", eyebrow: "PROJECT RECORDS" },
  history: { title: "Project history", description: "Chronological project events and task-state changes captured in the workspace.", eyebrow: "PROJECT LINEAGE" },
  revisions: { title: "Revisions & approvals", description: "Revision references, review state and approval requirements for saved outputs.", eyebrow: "CONFIGURATION CONTROL" },
  reports: { title: "Reports", description: "Export a traceable snapshot of the records currently saved for this project.", eyebrow: "ENGINEERING COMMUNICATION" },
  settings: { title: "Project settings", description: "Manage the project identity and inspect its current configuration.", eyebrow: "PROJECT CONFIGURATION" }
};

function formatDate(value?: string) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}
function readable(value: string) {
  return value.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function toneForStatus(value?: string): "neutral" | "success" | "danger" | "warning" {
  if (!value) return "neutral";
  if (["PASS", "VALIDATED", "APPROVED", "VERIFIED", "COMPLETED", "COMPLETE"].includes(value)) return "success";
  if (["FAIL", "FAILED", "REJECTED", "BLOCKED"].includes(value)) return "danger";
  if (["WAITING_APPROVAL", "INCOMPLETE", "RUNNING", "PROPOSED", "READY"].includes(value)) return "warning";
  return "neutral";
}
function StateLabel({ value }: { value: string }) {
  const tone = toneForStatus(value);
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" || tone === "danger" ? AlertCircle : Clock3;
  return <span className="moduleState" data-tone={tone}><Icon size={10} aria-hidden="true" />{readable(value)}</span>;
}
function EmptyState({ icon: Icon, title, detail, action }: { icon: typeof Box; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="moduleEmptyState">
    <span className="moduleEmptyIcon"><Icon size={22} aria-hidden="true" /></span>
    <strong>{title}</strong><p>{detail}</p>{action}
  </div>;
}
function Metric({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail: string; icon: typeof Activity }) {
  return <article className="moduleMetric"><div><span>{label}</span><Icon size={15} aria-hidden="true" /></div><strong>{value}</strong><small>{detail}</small></article>;
}
function Panel({ title, detail, action, children }: { title: string; detail?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="modulePanel"><header className="modulePanelHeader"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{action}</header>{children}</section>;
}

export default function ProjectModuleWorkspace({ projectId, module }: { projectId: string; module: ModuleKey }) {
  const [data, setData] = useState<ApiState>({ project: null, snapshot: null, cadModels: [], cadCompletions: [], loading: true, error: null });
  const [refresh, setRefresh] = useState(0);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const isDemo = projectId === "demo";
  const path = "/projects/" + projectId;
  const page = config[module];

  const load = useCallback(async (signal: AbortSignal) => {
    if (isDemo) {
      setData({ project: null, snapshot: null, cadModels: [], cadCompletions: [], loading: false, error: null });
      return;
    }
    setData((current) => ({ ...current, loading: true, error: null }));
    try {
      const [projectResponse, workspaceResponse, cadResponse, completionResponse] = await Promise.all([
        fetch("/api/projects/" + encodeURIComponent(projectId), { cache: "no-store", signal }),
        fetch("/api/projects/" + encodeURIComponent(projectId) + "/workspace", { cache: "no-store", signal }),
        fetch("/api/cad/models?projectId=" + encodeURIComponent(projectId), { cache: "no-store", signal }),
        fetch("/api/cad/completions?projectId=" + encodeURIComponent(projectId), { cache: "no-store", signal })
      ]);
      const projectBody = await projectResponse.json().catch(() => ({}));
      const workspaceBody = await workspaceResponse.json().catch(() => ({}));
      const cadBody = await cadResponse.json().catch(() => ({}));
      const completionBody = await completionResponse.json().catch(() => ({}));
      if (!projectResponse.ok) throw new Error(typeof projectBody.error === "string" ? projectBody.error : "Project access could not be confirmed.");
      if (!workspaceResponse.ok) throw new Error(typeof workspaceBody.error === "string" ? workspaceBody.error : "The saved workspace could not be loaded.");
      if (signal.aborted) return;
      const project = projectBody.project as ProjectRecord;
      const snapshot = workspaceBody.snapshot as EngineeringWorkspaceSnapshot;
      const models = cadResponse.ok && Array.isArray(cadBody.models) ? cadBody.models as CadModel[] : [];
      const cadCompletions = completionResponse.ok && Array.isArray(completionBody.completions) ? completionBody.completions as CadCompletionRecord[] : [];
      const cadLoadError = cadResponse.ok && completionResponse.ok ? null : "Some CAD records could not be loaded; geometry preview may be unavailable.";
      setData({ project, snapshot, cadModels: models, cadCompletions, loading: false, error: cadLoadError });
      setNameDraft(project.name);
    } catch (error) {
      if (signal.aborted) return;
      setData((current) => ({ ...current, loading: false, error: error instanceof Error ? error.message : "Project workspace is unavailable." }));
    }
  }, [isDemo, projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, refresh]);

  const snapshot = data.snapshot;
  const projectState = snapshot?.project;
  const tasks = snapshot?.taskGraph.tasks ?? [];
  const artifacts = (snapshot?.artifacts ?? []) as CalculationArtifact[];
  const events = useMemo(() => [...(projectState?.events ?? [])].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp)), [projectState?.events]);
  const completedTasks = tasks.filter((task) => task.status === "COMPLETED" || task.status === "VERIFIED").length;
  const runningTasks = tasks.filter((task) => task.status === "RUNNING").length;
  const failedTasks = tasks.filter((task) => task.status === "FAILED" || task.status === "BLOCKED").length;

  async function saveProjectName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data.project || savingName) return;
    setSavingName(true); setSettingsError(null); setSettingsMessage(null);
    try {
      const response = await fetch("/api/projects/" + encodeURIComponent(projectId), {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: nameDraft.trim(), expectedRevision: data.project.revision })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.project) throw new Error(typeof body.error === "string" ? body.error : "Project rename could not be confirmed.");
      setData((current) => ({ ...current, project: body.project }));
      setNameDraft(body.project.name);
      setSettingsMessage("Project name saved.");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Project rename failed.");
    } finally { setSavingName(false); }
  }

  function exportSnapshot() {
    if (!data.project || !snapshot) return;
    const payload = {
      documentType: "engineering-workspace-snapshot",
      schemaVersion: snapshot.schemaVersion,
      exportedAt: new Date().toISOString(),
      project: data.project,
      workspace: snapshot,
      exportLimitations: [
        "This is a JSON export of the currently saved workspace snapshot.",
        "It does not include binary CAD files, storage objects, or external solver result files.",
        "A saved calculation and its validation receipt do not imply human approval."
      ]
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = projectId + "-workspace-r" + snapshot.revision + ".json";
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url);
    setExportMessage("Workspace snapshot exported.");
  }

  const navLinks = [...projectTabs, ...engineeringTabs];
  const activeTab = module === "settings" ? "project-settings" : module === "workbench" ? "workbench"
    : module === "fea" ? "fea"
      : module === "pid" ? "pid"
        : module === "calculations" ? "calculations"
          : module;
  const projectName = data.project?.name ?? (isDemo ? "Demo sandbox" : "Project workspace");

  return <div className="shell moduleWorkspace">
    <div className="moduleBreadcrumb"><Link href="/">Workspace</Link><ChevronRight size={12} /><Link href="/projects">Projects</Link><ChevronRight size={12} /><Link href={path}>{projectName}</Link><ChevronRight size={12} /><span>{page.title}</span></div>
    <header className="modulePageHeader">
      <div><p className="eyebrow">{page.eyebrow}</p><h1>{page.title}</h1><p className="moduleLead">{page.description}</p></div>
      <div className="moduleHeaderActions">
        <Link className="button secondaryButton" href={path + "/engineering"}><MessageSquare size={14} /> Open AI chat</Link>
        <Link className="button workspacePrimaryAction" href={path}><ArrowUpRight size={14} /> Project overview</Link>
      </div>
    </header>

    <nav className="moduleTabs" aria-label="Project sections">
      {navLinks.map(([label, slug]) => <Link key={label} href={slug ? path + "/" + slug : path} aria-current={activeTab === (slug || "overview") ? "page" : undefined}>{label}</Link>)}
    </nav>

    {data.loading ? <div className="moduleLoading" role="status"><RefreshCw size={16} className="moduleSpin" /> Loading saved project records…</div>
      : data.error && !snapshot ? <div className="moduleError" role="alert"><AlertCircle size={17} /><div><strong>Project data could not be loaded</strong><p>{data.error}</p></div><button type="button" className="button secondaryButton" onClick={() => setRefresh((value) => value + 1)}>Retry</button></div>
      : isDemo ? <div className="moduleNotice" role="note"><Info size={16} /><span>This is the demo route. It has no durable project record, so no saved artefacts, solver results or revisions are displayed as real project data.</span></div>
      : null}

    {!data.loading && snapshot && <div className="moduleContent">
      {data.error && <div className="moduleNotice" role="status"><Info size={15} />{data.error}</div>}
      {module === "workbench" && <WorkbenchContent project={data.project!} snapshot={snapshot} tasks={tasks} artifacts={artifacts} models={data.cadModels} completions={data.cadCompletions} onRefresh={() => setRefresh((value) => value + 1)} completedTasks={completedTasks} runningTasks={runningTasks} failedTasks={failedTasks} />}
      {module === "fea" && <UnsupportedEngineeringModule title="No FEA result is attached" detail="This project has no recorded finite-element run or result artifact. The current UI does not launch a solver or infer a result from CAD geometry." requirements={["A native or neutral geometry artifact linked to this project revision", "Material properties, contacts, constraints and load cases", "A configured solver run with mesh and convergence evidence", "Independent validation of result quality and model assumptions"]} />}
      {module === "pid" && <UnsupportedEngineeringModule title="No P&ID / PFD document is attached" detail="The current project data model has no persisted process-diagram canvas or symbol-library records. No editable diagram is being simulated here." requirements={["A project-scoped diagram document and revision model", "Equipment, instrument and line-number registry", "Connection validation and diagram export"]} />}
      {module === "calculations" && <CalculationsContent artifacts={artifacts} />}
      {module === "files" && <FilesContent artifacts={artifacts} models={data.cadModels} />}
      {module === "history" && <HistoryContent events={events} tasks={tasks} createdAt={data.project?.created_at} updatedAt={data.project?.updated_at} />}
      {module === "revisions" && <RevisionsContent project={data.project!} snapshot={snapshot} artifacts={artifacts} />}
      {module === "reports" && <ReportsContent project={data.project!} snapshot={snapshot} exportMessage={exportMessage} onExport={exportSnapshot} />}
      {module === "settings" && <SettingsContent project={data.project!} nameDraft={nameDraft} onNameChange={setNameDraft} onSubmit={saveProjectName} saving={savingName} message={settingsMessage} error={settingsError} />}
    </div>}
  </div>;
}

type LatestStlPreview = { artifact: CadArtifactRecord; url: string; completion: CadCompletionRecord };
type ViewVisibility = { geometry: boolean; annotations: boolean; labels: boolean };

function findLatestStlPreview(completions: CadCompletionRecord[]): LatestStlPreview | null {
  const accepted = completions
    .filter((completion) => completion.status === "ACCEPTED")
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  for (const completion of accepted) {
    const artifact = completion.artifact_records?.find((item) => item.kind === "STL" && typeof item.uri === "string");
    const prefix = "storage://engineering-cad-artifacts/";
    if (!artifact?.uri?.startsWith(prefix)) continue;
    const objectPath = artifact.uri.slice(prefix.length);
    const url = completion.signedUrls?.[objectPath];
    if (typeof url === "string" && url.startsWith("https://")) return { artifact, url, completion };
  }
  return null;
}

function getTaskExecutionState(tasks: number, completed: number, running: number, failed: number) {
  if (tasks === 0) return "NOT_RECORDED";
  if (failed > 0) return "BLOCKED";
  if (running > 0) return "RUNNING";
  return completed === tasks ? "COMPLETED" : "IN_PROGRESS";
}

function WorkbenchContent({ project, snapshot, tasks, artifacts, models, completions, onRefresh, completedTasks, runningTasks, failedTasks }: {
  project: ProjectRecord; snapshot: EngineeringWorkspaceSnapshot; tasks: EngineeringWorkspaceSnapshot["taskGraph"]["tasks"];
  artifacts: CalculationArtifact[]; models: CadModel[]; completions: CadCompletionRecord[]; onRefresh: () => void;
  completedTasks: number; runningTasks: number; failedTasks: number;
}) {
  const [visibility, setVisibility] = useState<ViewVisibility>({ geometry: true, annotations: true, labels: true });
  const latestArtifact = [...artifacts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const acceptedCompletions = completions.filter((completion) => completion.status === "ACCEPTED");
  const latestStlPreview = findLatestStlPreview(completions);
  const executionState = getTaskExecutionState(tasks.length, completedTasks, runningTasks, failedTasks);

  return <div className="workbenchPage">
    <div className="workbenchSubnav" aria-label="Workbench views"><span aria-current="page">3D / CAD</span><Link href={"/projects/" + project.id + "/fea"}>FEA results</Link><Link href={"/projects/" + project.id + "/pid"}>P&amp;ID / PFD</Link><Link href={"/projects/" + project.id + "/calculations"}>Calculations</Link><Link href={"/projects/" + project.id + "/reports"}>Reports</Link></div>
    <div className="workbenchMetaRow"><span className="modulePill">PROJECT · {project.id.slice(0, 8).toUpperCase()}</span><span>Project revision <strong>R{project.revision}</strong></span><span>Workspace revision <strong>R{snapshot.revision}</strong></span></div>
    <RevisionStateBanner project={project} snapshot={snapshot} />
    <WorkflowStrip tasks={tasks} completedTasks={completedTasks} runningTasks={runningTasks} failedTasks={failedTasks} acceptedCount={acceptedCompletions.length} latestArtifact={latestArtifact} executionState={executionState} />
    <p className="workflowBoundaryNote"><ShieldCheck size={12} aria-hidden="true" />CAD acceptance, artifact validation and human approval are separate records. This view does not infer a solver result or approval.</p>
    <div className="workbenchThreePane">
      <ArtifactExplorer projectId={project.id} models={models} artifacts={artifacts} completions={completions} />
      <WorkbenchViewport projectId={project.id} models={models} latestStlPreview={latestStlPreview} visibility={visibility} onRefresh={onRefresh} />
      <WorkbenchInspector models={models} artifacts={artifacts} acceptedCount={acceptedCompletions.length} latestStlPreview={latestStlPreview} tasks={tasks} completedTasks={completedTasks} runningTasks={runningTasks} failedTasks={failedTasks} latestArtifact={latestArtifact} visibility={visibility} onVisibilityChange={(key, checked) => setVisibility((current) => ({ ...current, [key]: checked }))} />
    </div>
  </div>;
}

function RevisionStateBanner({ project, snapshot }: { project: ProjectRecord; snapshot: EngineeringWorkspaceSnapshot }) {
  const aligned = project.revision === snapshot.revision;
  return <section className="revisionStateBanner" data-state={aligned ? "aligned" : "different"} aria-label="Revision state">
    <span className="revisionStateIcon"><GitBranch size={16} aria-hidden="true" /></span>
    <div><strong>Revision references {aligned ? "aligned" : "differ"}</strong><p>Project R{project.revision} · Workspace snapshot R{snapshot.revision}. Alignment does not establish validation or approval.</p></div>
    <StateLabel value={aligned ? "REFERENCES_ALIGNED" : "REVIEW_REVISION_REFERENCES"} />
    <Link href={"/projects/" + project.id + "/revisions"} className="moduleTextLink">Review revisions <ArrowUpRight size={12} /></Link>
  </section>;
}

function WorkflowStrip({ tasks, completedTasks, runningTasks, failedTasks, acceptedCount, latestArtifact, executionState }: {
  tasks: EngineeringWorkspaceSnapshot["taskGraph"]["tasks"]; completedTasks: number; runningTasks: number; failedTasks: number;
  acceptedCount: number; latestArtifact?: CalculationArtifact; executionState: string;
}) {
  return <section className="workflowStrip" aria-label="Independent workflow states">
    <div className="workflowStep"><span className="workflowStepNumber">01</span><div><strong>Task execution</strong><small>{tasks.length} recorded tasks · {runningTasks} running · {failedTasks} blocked or failed</small></div><StateLabel value={executionState} /></div>
    <div className="workflowStep"><span className="workflowStepNumber">02</span><div><strong>CAD completion</strong><small>{acceptedCount} accepted CAD completion records</small></div><StateLabel value={acceptedCount ? "ACCEPTED" : "NOT_RECORDED"} /></div>
    <div className="workflowStep"><span className="workflowStepNumber">03</span><div><strong>Artifact validation</strong><small>{latestArtifact ? "Latest calculation artifact only" : "No calculation artifact is recorded"}</small></div><StateLabel value={latestArtifact?.validationStatus ?? "NOT_RECORDED"} /></div>
    <div className="workflowStep"><span className="workflowStepNumber">04</span><div><strong>Human approval</strong><small>Approval state is not surfaced by this workbench snapshot.</small></div><StateLabel value="NOT_RECORDED" /></div>
  </section>;
}

function ArtifactExplorer({ projectId, models, artifacts, completions }: {
  projectId: string; models: CadModel[]; artifacts: CalculationArtifact[]; completions: CadCompletionRecord[];
}) {
  return <aside className="workbenchExplorer" aria-label="Artifact explorer">
    <Panel title="Artifact explorer" detail="Project-scoped records, not a filesystem mirror." action={<Link href={"/projects/" + projectId + "/files"} className="moduleTextLink">All files <ArrowUpRight size={12} /></Link>}>
      <section className="workbenchExplorerSection">
        <header><strong>CAD model identities</strong><span>{models.length}</span></header>
        {models.length === 0 ? <p className="workbenchExplorerEmpty">No CAD model identities are registered.</p> : models.slice(0, 6).map((model) => <div className="workbenchExplorerRow" key={model.id}><Box size={13} aria-hidden="true" /><div><strong>{model.name}</strong><small>{model.nativeReferences.length ? "Native references attached" : "Identity only"} · {formatDate(model.updatedAt)}</small></div><StateLabel value={model.nativeReferences.length ? "REFERENCES_ATTACHED" : "IDENTITY_ONLY"} /></div>)}
      </section>
      <section className="workbenchExplorerSection">
        <header><strong>Calculation artifacts</strong><span>{artifacts.length}</span></header>
        {artifacts.length === 0 ? <p className="workbenchExplorerEmpty">No calculation artifact is recorded.</p> : [...artifacts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, 5).map((artifact) => <div className="workbenchExplorerRow" key={artifact.id}><FileText size={13} aria-hidden="true" /><div><strong>{artifact.name}</strong><small>Workspace R{artifact.workspaceRevision} · {formatDate(artifact.createdAt)}</small></div><StateLabel value={artifact.validationStatus ?? "NOT_RECORDED"} /></div>)}
      </section>
      <section className="workbenchExplorerSection">
        <header><strong>CAD completions</strong><span>{completions.length}</span></header>
        {completions.length === 0 ? <p className="workbenchExplorerEmpty">No CAD completion record is attached to this project.</p> : [...completions].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5).map((completion) => <div className="workbenchExplorerRow" key={completion.id}><Layers3 size={13} aria-hidden="true" /><div><strong>CAD completion · {completion.id.slice(0, 8).toUpperCase()}</strong><small>{formatDate(completion.created_at)}</small></div><StateLabel value={completion.status} /></div>)}
      </section>
    </Panel>
  </aside>;
}

function WorkbenchViewport({ projectId, models, latestStlPreview, visibility, onRefresh }: {
  projectId: string; models: CadModel[]; latestStlPreview: LatestStlPreview | null; visibility: ViewVisibility; onRefresh: () => void;
}) {
  return <main className="workbenchViewportPane">
    <Panel title="Geometry viewport" detail="Read-only STL visual preview from the latest accepted CAD completion." action={<div className="moduleHeaderActions"><button type="button" className="button secondaryButton" onClick={onRefresh}>Refresh preview URL</button><Link href={"/projects/" + projectId + "/cad"} className="moduleTextLink">Open CAD registry <ArrowUpRight size={12} /></Link></div>}>
      <div className="workbenchViewport">
        <div className="viewportToolbar"><span><Layers3 size={13} aria-hidden="true" /> CAD source</span><span>Units: source-defined</span></div>
        <div className="viewportScene">
          <div className="viewportGridPattern" aria-hidden="true" />
          <div className="viewportAxis viewportAxisX">X</div><div className="viewportAxis viewportAxisY">Y</div><div className="viewportAxis viewportAxisZ">Z</div>
          {latestStlPreview && visibility.geometry ? <StlViewport src={latestStlPreview.url} label={latestStlPreview.artifact.name} /> : <div className="viewportEmptyCopy"><Box size={28} aria-hidden="true" /><strong>{latestStlPreview && !visibility.geometry ? "Geometry is hidden" : "No accepted STL preview available"}</strong><p>{latestStlPreview && !visibility.geometry ? "Enable the geometry preference to display this read-only preview." : models.length ? "CAD model identities exist, but no accepted completion with an accessible STL artifact is available for preview." : "No CAD model identity or accepted STL artifact is registered for this project yet."}</p></div>}
        </div>
        <div className="viewportFooter"><span>{latestStlPreview ? "STL visual preview only · does not independently certify mesh quality." : "Display remains empty until an accepted CAD completion includes an accessible STL artifact."}</span><span>View state does not modify source artifacts.</span></div>
      </div>
    </Panel>
  </main>;
}

function WorkbenchInspector({ models, artifacts, acceptedCount, latestStlPreview, tasks, completedTasks, runningTasks, failedTasks, latestArtifact, visibility, onVisibilityChange }: {
  models: CadModel[]; artifacts: CalculationArtifact[]; acceptedCount: number; latestStlPreview: LatestStlPreview | null;
  tasks: EngineeringWorkspaceSnapshot["taskGraph"]["tasks"]; completedTasks: number; runningTasks: number; failedTasks: number;
  latestArtifact?: CalculationArtifact; visibility: ViewVisibility; onVisibilityChange: (key: keyof ViewVisibility, checked: boolean) => void;
}) {
  return <aside className="workbenchInspector" aria-label="Workbench inspector">
    <div className="workbenchSide">
      <Panel title="Inspector" detail="Current project geometry registry">
        <div className="moduleKeyValue"><span>CAD model identities</span><strong>{models.length}</strong></div>
        <div className="moduleKeyValue"><span>Calculation artifacts</span><strong>{artifacts.length}</strong></div>
        <div className="moduleKeyValue"><span>Accepted CAD completions</span><strong>{acceptedCount}</strong></div>
        <div className="moduleKeyValue"><span>STL preview source</span><StateLabel value={latestStlPreview ? "PREVIEW_AVAILABLE" : "NOT_AVAILABLE"} /></div>
        <div className="moduleVisibility">
          <h3>Temporary view preferences</h3><p className="moduleSmallNote">Preferences are local to this screen. Geometry visibility controls the STL preview; annotation and label overlays are not yet connected to persisted metadata.</p>
          {(["geometry", "annotations", "labels"] as const).map((key) => <label key={key}><span>{readable(key)}</span><input type="checkbox" checked={visibility[key]} onChange={(event) => onVisibilityChange(key, event.target.checked)} /></label>)}
        </div>
      </Panel>
      <Panel title="Execution and review" detail="Independent project states; no automatic approval.">
        <div className="moduleKeyValue"><span>Tasks recorded</span><strong>{tasks.length}</strong></div>
        <div className="moduleKeyValue"><span>Completed tasks</span><strong>{completedTasks}</strong></div>
        <div className="moduleKeyValue"><span>Running tasks</span><strong>{runningTasks}</strong></div>
        <div className="moduleKeyValue"><span>Blocked / failed tasks</span><strong>{failedTasks}</strong></div>
        <div className="moduleKeyValue"><span>Latest artifact validation</span><StateLabel value={latestArtifact?.validationStatus ?? "NOT_RECORDED"} /></div>
        <div className="moduleKeyValue"><span>Human approval</span><StateLabel value="NOT_RECORDED" /></div>
        {latestArtifact ? <div className="latestEvidence"><span>Latest calculation record</span><strong>{latestArtifact.name}</strong><small>R{latestArtifact.workspaceRevision} · {readable(latestArtifact.validationStatus)}</small></div> : <p className="moduleSmallNote">No calculation result has been saved to this workspace.</p>}
      </Panel>
    </div>
  </aside>;
}

function UnsupportedEngineeringModule({ title, detail, requirements }: { title: string; detail: string; requirements: string[] }) {
  return <div className="moduleTwoColumn">
    <Panel title="Current availability" detail="No solver or diagram execution is triggered from this screen.">
      <EmptyState icon={LockKeyhole} title={title} detail={detail} />
    </Panel>
    <Panel title="Required before this becomes executable" detail="These are implementation and evidence requirements, not completed checks.">
      <ol className="moduleRequirementList">{requirements.map((item) => <li key={item}>{item}</li>)}</ol>
    </Panel>
  </div>;
}

function CalculationsContent({ artifacts }: { artifacts: CalculationArtifact[] }) {
  const passed = artifacts.filter((item) => item.validationStatus === "VALIDATED").length;
  const waiting = artifacts.filter((item) => item.approvalStatus === "WAITING_APPROVAL").length;
  return <div className="moduleStack">
    <div className="moduleMetrics"><Metric label="Calculation records" value={artifacts.length} detail="Saved in workspace snapshot" icon={Table2} /><Metric label="Validated" value={passed} detail="Passing validation receipt" icon={CheckCircle2} /><Metric label="Awaiting approval" value={waiting} detail="Human review still required" icon={Clock3} /><Metric label="Verified baseline" value={artifacts.filter((item) => item.verificationStatus === "VERIFIED" && item.validationStatus === "VALIDATED" && item.approvalStatus === "APPROVED").length} detail="Verified and approved outputs" icon={ShieldCheck} /></div>
    <Panel title="Calculation register" detail="Each row is a saved artifact with its own execution, validation and approval state.">
      {artifacts.length === 0 ? <EmptyState icon={Table2} title="No calculation artifacts saved" detail="Run a supported deterministic calculation from the Analysis workspace. A conversation response alone does not create a calculation artifact." action={<Link className="button secondaryButton" href="../analysis">Open analysis</Link>} /> : <div className="moduleTableWrap"><table className="moduleTable"><thead><tr><th>Calculation</th><th>Revision</th><th>Execution</th><th>Validation</th><th>Approval</th><th>Verification</th><th>Created</th></tr></thead><tbody>{artifacts.map((artifact) => <tr key={artifact.id}><td><strong>{artifact.name}</strong><small>{artifact.capability} · {artifact.providerId}</small></td><td>R{artifact.workspaceRevision}</td><td><StateLabel value={artifact.executionStatus} /></td><td><StateLabel value={artifact.validationStatus} /></td><td><StateLabel value={artifact.approvalStatus} /></td><td><StateLabel value={artifact.verificationStatus} /></td><td>{formatDate(artifact.createdAt)}</td></tr>)}</tbody></table></div>}
    </Panel>
  </div>;
}

function FilesContent({ artifacts, models }: { artifacts: CalculationArtifact[]; models: CadModel[] }) {
  return <div className="moduleStack">
    <div className="moduleMetrics"><Metric label="Calculation artefacts" value={artifacts.length} detail="Structured result records" icon={FileCheck2} /><Metric label="CAD model identities" value={models.length} detail="Geometry files may still be absent" icon={Box} /><Metric label="Native references" value={models.reduce((sum, model) => sum + model.nativeReferences.length, 0)} detail="References recorded on models" icon={Layers3} /><Metric label="File downloads" value="Not exposed" detail="No generic project file browser API" icon={LockKeyhole} /></div>
    <div className="moduleTwoColumn">
      <Panel title="Calculation records" detail="Data and validation receipts stored in the workspace snapshot.">
        {artifacts.length === 0 ? <EmptyState icon={FileText} title="No saved calculation records" detail="Calculation artefacts will appear here after a supported analysis has been executed and persisted." /> : <div className="moduleSimpleList">{artifacts.map((artifact) => <div className="moduleListRow" key={artifact.id}><FileCheck2 size={16} /><div><strong>{artifact.name}</strong><small>{artifact.id} · R{artifact.workspaceRevision}</small></div><StateLabel value={artifact.validationStatus} /></div>)}</div>}
      </Panel>
      <Panel title="CAD model identities" detail="A model identity is a registry record; it does not guarantee a stored geometry file.">
        {models.length === 0 ? <EmptyState icon={Box} title="No model identities" detail="Create a project model identity in the CAD workspace before attaching source or generated files." action={<Link className="button secondaryButton" href="../cad">Open CAD workspace</Link>} /> : <div className="moduleSimpleList">{models.map((model) => <div className="moduleListRow" key={model.id}><Box size={16} /><div><strong>{model.name}</strong><small>{model.id} · {model.nativeReferences.length} native references</small></div><StateLabel value={model.nativeReferences.length ? "REFERENCES_ATTACHED" : "IDENTITY_ONLY"} /></div>)}</div>}
      </Panel>
    </div>
    <p className="moduleSmallNote">Binary storage objects are not listed here because this release does not expose a generic, project-scoped file inventory endpoint. No file presence is inferred from an artefact title or model identity.</p>
  </div>;
}

function HistoryContent({ events, tasks, createdAt, updatedAt }: { events: EngineeringWorkspaceSnapshot["project"]["events"]; tasks: EngineeringWorkspaceSnapshot["taskGraph"]["tasks"]; createdAt?: string; updatedAt?: string }) {
  const timeline = events.map((event) => ({ id: event.id, timestamp: event.timestamp, title: readable(event.action), detail: event.actor, kind: "EVENT" as const }));
  const taskTimeline = tasks.map((task) => ({ id: task.id, timestamp: task.updatedAt, title: "Task state · " + task.name, detail: readable(task.status) + (task.blockedReason ? " · " + task.blockedReason : ""), kind: "TASK" as const }));
  const combined = [...timeline, ...taskTimeline].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  return <div className="moduleTwoColumn">
    <Panel title="Recorded activity" detail="Only persisted project events and task-state timestamps are shown.">
      {combined.length === 0 ? <EmptyState icon={History} title="No project events recorded" detail="Requirements edits, calculations and task transitions will appear here when they are persisted." /> : <div className="moduleTimeline">{combined.map((item) => <article className="moduleTimelineItem" key={item.kind + item.id}><span className="moduleTimelineDot" data-kind={item.kind.toLowerCase()} /><div><div className="moduleTimelineHead"><strong>{item.title}</strong><small>{formatDate(item.timestamp)}</small></div><p>{item.kind === "EVENT" ? "Actor: " : "Task: "}{item.detail}</p></div></article>)}</div>}
    </Panel>
    <Panel title="Project lifecycle" detail="Project metadata timestamps.">
      <div className="moduleKeyValue"><span>Project created</span><strong>{formatDate(createdAt)}</strong></div>
      <div className="moduleKeyValue"><span>Project last updated</span><strong>{formatDate(updatedAt)}</strong></div>
      <div className="moduleKeyValue"><span>Workspace records</span><strong>{events.length + tasks.length}</strong></div>
      <p className="moduleSmallNote">This is an event view, not a complete audit-log export. The full authorization audit store is separate from the workspace event list.</p>
    </Panel>
  </div>;
}

function RevisionsContent({ project, snapshot, artifacts }: { project: ProjectRecord; snapshot: EngineeringWorkspaceSnapshot; artifacts: CalculationArtifact[] }) {
  const references = [...artifacts].sort((a, b) => b.workspaceRevision - a.workspaceRevision || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <div className="moduleStack">
    <div className="moduleMetrics"><Metric label="Project revision" value={"R" + project.revision} detail="Project metadata revision" icon={GitBranch} /><Metric label="Workspace revision" value={"R" + snapshot.revision} detail="Current persisted snapshot" icon={Layers3} /><Metric label="Review required" value={artifacts.filter((item) => item.approvalRequired && item.approvalStatus === "WAITING_APPROVAL").length} detail="Artifacts awaiting approval" icon={Clock3} /><Metric label="Approved artifacts" value={artifacts.filter((item) => item.approvalStatus === "APPROVED").length} detail="Explicit approval status only" icon={ShieldCheck} /></div>
    <Panel title="Revision-linked artefacts" detail="The current snapshot retains source/workspace revision references on each calculation artifact.">
      {references.length === 0 ? <EmptyState icon={GitBranch} title="No revision-linked calculation artifacts" detail="Calculation artefacts will carry the source revision and saved workspace revision when created." /> : <div className="moduleTableWrap"><table className="moduleTable"><thead><tr><th>Artifact</th><th>Source revision</th><th>Saved revision</th><th>Review</th><th>Verification</th></tr></thead><tbody>{references.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.id}</small></td><td>R{item.sourceRevision}</td><td>R{item.workspaceRevision}</td><td><StateLabel value={item.approvalStatus} /></td><td><StateLabel value={item.verificationStatus} /></td></tr>)}</tbody></table></div>}
    </Panel>
    <div className="moduleNotice"><Info size={15} /><span>Historical point-in-time workspace snapshots and revision comparison are not yet persisted by this release. This view reports the current revision and the revision links stored inside artifacts; it does not reconstruct missing historical snapshots.</span></div>
  </div>;
}

function ReportsContent({ project, snapshot, exportMessage, onExport }: { project: ProjectRecord; snapshot: EngineeringWorkspaceSnapshot; exportMessage: string | null; onExport: () => void }) {
  return <div className="moduleTwoColumn">
    <Panel title="Workspace snapshot export" detail="A portable JSON record of the current saved project workspace.">
      <div className="moduleReportPreview"><FileText size={24} /><div><strong>{project.name} — workspace snapshot</strong><small>Project {project.id} · Workspace R{snapshot.revision} · Schema v{snapshot.schemaVersion}</small></div><StateLabel value="EXPORT_AVAILABLE" /></div>
      <div className="moduleReportStats"><div><strong>{snapshot.project.requirements.length}</strong><span>Requirements</span></div><div><strong>{snapshot.taskGraph.tasks.length}</strong><span>Tasks</span></div><div><strong>{snapshot.artifacts?.length ?? 0}</strong><span>Calculation records</span></div><div><strong>{snapshot.project.events.length}</strong><span>Project events</span></div></div>
      <button type="button" className="button workspacePrimaryAction" onClick={onExport}><ArrowDownToLine size={14} /> Export JSON snapshot</button>
      {exportMessage && <p className="moduleSuccessMessage" role="status">{exportMessage}</p>}
    </Panel>
    <Panel title="Export boundary" detail="Do not treat this JSON export as a complete engineering dossier.">
      <ul className="moduleRequirementList"><li>Includes project metadata and the current saved workspace snapshot.</li><li>Includes recorded calculation inputs, outputs, validation receipts and approval status.</li><li>Excludes binary CAD files, object-storage assets, solver output files and external references.</li><li>Does not certify the design or replace a signed engineering report.</li></ul>
    </Panel>
  </div>;
}

function SettingsContent({ project, nameDraft, onNameChange, onSubmit, saving, message, error }: {
  project: ProjectRecord; nameDraft: string; onNameChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; message: string | null; error: string | null;
}) {
  return <div className="moduleTwoColumn">
    <Panel title="Project identity" detail="Rename uses the project API's compare-and-set revision check.">
      <form className="moduleSettingsForm" onSubmit={onSubmit}>
        <label htmlFor="project-name">Project name</label><input id="project-name" value={nameDraft} onChange={(event) => onNameChange(event.target.value)} minLength={2} maxLength={120} required />
        <div className="moduleKeyValue"><span>Project revision</span><strong>R{project.revision}</strong></div>
        <div className="moduleKeyValue"><span>Project ID</span><strong className="moduleMono">{project.id}</strong></div>
        <button className="button workspacePrimaryAction" disabled={saving || nameDraft.trim().length < 2 || nameDraft.trim() === project.name}>{saving ? "Saving…" : "Save project name"}</button>
        {message && <p className="moduleSuccessMessage" role="status">{message}</p>}
        {error && <p className="moduleFormError" role="alert">{error}</p>}
      </form>
    </Panel>
    <Panel title="Project configuration" detail="Read-only values from the registered project record.">
      <div className="moduleKeyValue"><span>Project stage</span><strong>{readable(project.stage)}</strong></div>
      <div className="moduleKeyValue"><span>Lifecycle status</span><StateLabel value={project.status} /></div>
      <div className="moduleKeyValue"><span>Created</span><strong>{formatDate(project.created_at)}</strong></div>
      <div className="moduleKeyValue"><span>Last updated</span><strong>{formatDate(project.updated_at)}</strong></div>
      <p className="moduleSmallNote">Units, default material libraries, tolerance policies and project collaborators are not yet exposed by a persisted settings API. They are not presented as editable in this release.</p>
    </Panel>
  </div>;
}
