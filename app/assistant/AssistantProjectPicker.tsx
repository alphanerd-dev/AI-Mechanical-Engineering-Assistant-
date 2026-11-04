"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  FolderKanban,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldAlert,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Project = {
  id: string;
  name: string;
  stage: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETE";
  revision: number;
  created_at: string;
  updated_at: string;
};
type ProjectsResponse = { projects?: unknown; error?: string; code?: string };
type ProjectFetchError = Error & { code?: string };

const projectStatusPresentation = {
  ACTIVE: { label: "Active", variant: "info" as const, Icon: CircleDot },
  BLOCKED: { label: "Blocked", variant: "warning" as const, Icon: AlertTriangle },
  COMPLETE: { label: "Complete", variant: "success" as const, Icon: CheckCircle2 },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasProjectIdentity(row: Record<string, unknown>) {
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.stage === "string";
}

function hasProjectStatus(row: Record<string, unknown>) {
  return row.status === "ACTIVE" || row.status === "BLOCKED" || row.status === "COMPLETE";
}

function hasProjectRevision(row: Record<string, unknown>) {
  return typeof row.revision === "number" && typeof row.created_at === "string" && typeof row.updated_at === "string";
}

function isProject(value: unknown): value is Project {
  return isRecord(value) && hasProjectIdentity(value) && hasProjectStatus(value) && hasProjectRevision(value);
}

function ProjectStatusBadge({ status }: { status: Project["status"] }) {
  const { label, variant, Icon } = projectStatusPresentation[status];
  return <Badge variant={variant}><Icon size={11} aria-hidden="true" />{label}</Badge>;
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Update time unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function fetchAssistantProjects(signal?: AbortSignal): Promise<Project[]> {
  const response = await fetch("/api/projects", {
    cache: "no-store",
    headers: { accept: "application/json" },
    signal,
  });
  const body = await response.json().catch(() => ({})) as ProjectsResponse;
  if (!response.ok) {
    const error = new Error(body.error || "Projects could not be loaded.") as ProjectFetchError;
    error.code = typeof body.code === "string" ? body.code : "";
    throw error;
  }
  return Array.isArray(body.projects) ? body.projects.filter(isProject) : [];
}

function getProjectLoadError(cause: unknown) {
  return {
    message: cause instanceof Error ? cause.message : "Projects could not be loaded.",
    code: typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code ?? "") : "",
  };
}

function useAssistantProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const applyProjects = useCallback((next: Project[]) => {
    setProjects(next);
    setSelectedId((current) => next.some((project) => project.id === current) ? current : next[0]?.id ?? "");
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError("");
    setErrorCode("");
    try {
      applyProjects(await fetchAssistantProjects());
    } catch (cause) {
      const failure = getProjectLoadError(cause);
      setError(failure.message);
      setErrorCode(failure.code);
    } finally {
      setRefreshing(false);
    }
  }, [applyProjects]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetchAssistantProjects(controller.signal)
      .then((next) => {
        if (!active) return;
        applyProjects(next);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        const failure = getProjectLoadError(cause);
        setError(failure.message);
        setErrorCode(failure.code);
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [applyProjects]);

  return { projects, selectedId, setSelectedId, loading, refreshing, error, errorCode, refresh };
}

function AssistantProjectList({ projects, selectedId, onSelect }: {
  projects: Project[]; selectedId: string; onSelect: (id: string) => void;
}) {
  return <div className="assistantPickerList" role="radiogroup" aria-label="Select a project">
    {projects.map((project) => <button
      key={project.id}
      type="button"
      className={"assistantPickerProject" + (selectedId === project.id ? " assistantPickerProjectSelected" : "")}
      role="radio"
      aria-checked={selectedId === project.id}
      onClick={() => onSelect(project.id)}
    >
      <span className="assistantPickerProjectIcon"><FolderKanban size={17} aria-hidden="true" /></span>
      <span className="assistantPickerProjectCopy"><strong>{project.name}</strong><small>{project.stage.replaceAll("_", " ")} · Revision {project.revision} · Updated {formatUpdated(project.updated_at)}</small></span>
      <ProjectStatusBadge status={project.status} />
      <span className="assistantPickerSelectedMark" aria-hidden="true">{selectedId === project.id ? "Selected" : "Select"}</span>
    </button>)}
  </div>;
}

function AssistantProjectResults({ loading, error, errorCode, projects, filteredProjects, query, selectedId, onSelect }: {
  loading: boolean; error: string; errorCode: string; projects: Project[]; filteredProjects: Project[]; query: string;
  selectedId: string; onSelect: (id: string) => void;
}) {
  if (loading) return <div className="assistantPickerState" role="status">Loading your persisted projects…</div>;
  if (error) return <div className="assistantPickerState assistantPickerError" role="alert">
    <ShieldAlert size={18} aria-hidden="true" />
    <div><strong>Projects unavailable</strong><p>{error}</p>{errorCode.toLowerCase().includes("auth") && <Link href="/login">Sign in again</Link>}</div>
  </div>;
  if (projects.length === 0) return <div className="assistantPickerState">
    <FolderKanban size={22} aria-hidden="true" /><strong>No projects yet</strong>
    <p>Create a project first. The assistant requires a real project context; it will not silently open a demo conversation.</p>
    <Link className="button workspacePrimaryAction" href="/projects">Go to projects <ArrowRight size={14} aria-hidden="true" /></Link>
  </div>;
  if (filteredProjects.length === 0) return <div className="assistantPickerState">No projects match “{query}”. Clear the search to see all projects.</div>;
  return <AssistantProjectList projects={filteredProjects} selectedId={selectedId} onSelect={onSelect} />;
}

function AssistantProjectFooter({ project }: { project: Project }) {
  const router = useRouter();
  const openSelectedProject = () => router.push(`/projects/${encodeURIComponent(project.id)}/engineering`);
  return <div className="assistantPickerFooter">
    <div><span>Selected project</span><strong>{project.name}</strong></div>
    <button className="button workspacePrimaryAction" type="button" onClick={openSelectedProject}>Open project chat <ArrowRight size={15} aria-hidden="true" /></button>
  </div>;
}

function filterAssistantProjects(projects: Project[], query: string): Project[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return projects;
  return projects.filter((project) => [
    project.name,
    project.stage.replaceAll("_", " "),
    project.status,
  ].some((value) => value.toLowerCase().includes(normalized)));
}

function AssistantProjectPanel({ projects, filteredProjects, selectedId, setSelectedId, loading, refreshing, error, errorCode, refresh, query, setQuery }: {
  projects: Project[]; filteredProjects: Project[]; selectedId: string; setSelectedId: (id: string) => void;
  loading: boolean; refreshing: boolean; error: string; errorCode: string; refresh: () => void;
  query: string; setQuery: (value: string) => void;
}) {
  const selectedProject = projects.find((project) => project.id === selectedId);
  return <section className="assistantPickerPanel" aria-labelledby="assistant-picker-title">
    <div className="assistantPickerPanelHeading">
      <span className="assistantPickerIcon"><Bot size={19} aria-hidden="true" /></span>
      <div><h2 id="assistant-picker-title">Your projects</h2><p>Choose a project to continue or start its project-scoped conversation.</p></div>
      <button className="assistantPickerRefresh" type="button" onClick={() => void refresh()} disabled={loading || refreshing}>
        <RefreshCw size={14} className={refreshing ? "assistantPickerSpin" : undefined} aria-hidden="true" />{refreshing ? "Refreshing" : "Refresh"}
      </button>
    </div>
    <label className="assistantPickerSearch"><Search size={15} aria-hidden="true" /><span className="sr-only">Search projects</span>
      <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by project, stage or status…" />
    </label>
    <AssistantProjectResults loading={loading} error={error} errorCode={errorCode} projects={projects} filteredProjects={filteredProjects} query={query} selectedId={selectedId} onSelect={setSelectedId} />
    {selectedProject && !loading && !error && <AssistantProjectFooter project={selectedProject} />}
  </section>;
}

export default function AssistantProjectPicker() {
  const router = useRouter();
  const { projects, selectedId, setSelectedId, loading, refreshing, error, errorCode, refresh } = useAssistantProjects();
  const [query, setQuery] = useState("");
  const filteredProjects = useMemo(() => filterAssistantProjects(projects, query), [projects, query]);
  const openProjectChat = useCallback((projectId: string) => {
    setSelectedId(projectId);
    router.push(`/projects/${encodeURIComponent(projectId)}/engineering`);
  }, [router, setSelectedId]);

  return <main className="assistantPickerPage">
    <header className="assistantPickerHeader">
      <div><p className="eyebrow">ENGINEERING OS / AI ASSISTANT</p><h1>Choose project context</h1>
        <p>Open a saved engineering conversation within its project. The assistant stays separate from deterministic calculations and execution workflows.</p>
      </div>
      <Link className="button secondaryButton" href="/projects"><FolderKanban size={15} aria-hidden="true" /> Projects</Link>
    </header>
    <AssistantProjectPanel projects={projects} filteredProjects={filteredProjects} selectedId={selectedId} setSelectedId={openProjectChat} loading={loading} refreshing={refreshing} error={error} errorCode={errorCode} refresh={refresh} query={query} setQuery={setQuery} />
    <aside className="assistantPickerNotice"><LockKeyhole size={16} aria-hidden="true" />
      <p><strong>Project context is explicit.</strong> Chat history is scoped to the project you select. AI responses do not execute calculations, CAD operations or solver jobs on their own.</p>
    </aside>
  </main>;
}
