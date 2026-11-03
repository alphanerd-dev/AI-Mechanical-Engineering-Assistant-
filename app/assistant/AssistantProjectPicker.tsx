"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bot,
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

type ProjectsResponse = {
  projects?: Project[];
  error?: string;
  code?: string;
};

function isProject(value: unknown): value is Project {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string"
    && typeof row.name === "string"
    && typeof row.stage === "string"
    && (row.status === "ACTIVE" || row.status === "BLOCKED" || row.status === "COMPLETE")
    && typeof row.revision === "number"
    && typeof row.created_at === "string"
    && typeof row.updated_at === "string";
}

function projectStatusLabel(status: Project["status"]): string {
  if (status === "BLOCKED") return "Blocked";
  if (status === "COMPLETE") return "Complete";
  return "Active";
}

function projectStatusVariant(status: Project["status"]): "info" | "warning" | "success" {
  if (status === "BLOCKED") return "warning";
  if (status === "COMPLETE") return "success";
  return "info";
}

function formatUpdated(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Update time unavailable"
    : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AssistantProjectPicker() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [errorCode, setErrorCode] = useState("");

  const loadProjects = useCallback(async (refresh = false, signal?: AbortSignal) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    setErrorCode("");

    try {
      const response = await fetch("/api/projects", {
        cache: "no-store",
        headers: { accept: "application/json" },
        signal,
      });
      const body = await response.json().catch(() => ({})) as ProjectsResponse;
      if (!response.ok) {
        setErrorCode(typeof body.code === "string" ? body.code : "");
        throw new Error(body.error || "Projects could not be loaded.");
      }

      const nextProjects = Array.isArray(body.projects) ? body.projects.filter(isProject) : [];
      setProjects(nextProjects);
      setSelectedId((current) => nextProjects.some((project) => project.id === current)
        ? current
        : nextProjects[0]?.id ?? "");
    } catch (cause) {
      if (signal?.aborted) return;
      setError(cause instanceof Error ? cause.message : "Projects could not be loaded.");
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadProjects(false, controller.signal);
    return () => controller.abort();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return projects;
    return projects.filter((project) =>
      project.name.toLowerCase().includes(normalized)
      || project.stage.toLowerCase().replaceAll("_", " ").includes(normalized)
      || project.status.toLowerCase().includes(normalized),
    );
  }, [projects, query]);

  const selectedProject = projects.find((project) => project.id === selectedId);

  function openSelectedProject() {
    if (!selectedProject) return;
    router.push(`/projects/${encodeURIComponent(selectedProject.id)}/engineering`);
  }

  return (
    <main className="assistantPickerPage">
      <header className="assistantPickerHeader">
        <div>
          <p className="eyebrow">ENGINEERING OS / AI ASSISTANT</p>
          <h1>Choose project context</h1>
          <p>Open a saved engineering conversation within its project. The assistant stays separate from deterministic calculations and execution workflows.</p>
        </div>
        <Link className="button secondaryButton" href="/projects">
          <FolderKanban size={15} aria-hidden="true" /> Projects
        </Link>
      </header>

      <section className="assistantPickerPanel" aria-labelledby="assistant-picker-title">
        <div className="assistantPickerPanelHeading">
          <span className="assistantPickerIcon"><Bot size={19} aria-hidden="true" /></span>
          <div>
            <h2 id="assistant-picker-title">Your projects</h2>
            <p>Choose a project to continue or start its project-scoped conversation.</p>
          </div>
          <button className="assistantPickerRefresh" type="button" onClick={() => void loadProjects(true)} disabled={loading || refreshing}>
            <RefreshCw size={14} className={refreshing ? "assistantPickerSpin" : undefined} aria-hidden="true" />
            {refreshing ? "Refreshing" : "Refresh"}
          </button>
        </div>

        <label className="assistantPickerSearch">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">Search projects</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by project, stage or status…" />
        </label>

        {loading ? (
          <div className="assistantPickerState" role="status">Loading your persisted projects…</div>
        ) : error ? (
          <div className="assistantPickerState assistantPickerError" role="alert">
            <ShieldAlert size={18} aria-hidden="true" />
            <div><strong>Projects unavailable</strong><p>{error}</p>
              {errorCode.toLowerCase().includes("auth") && <Link href="/login">Sign in again</Link>}
            </div>
          </div>
        ) : projects.length === 0 ? (
          <div className="assistantPickerState">
            <FolderKanban size={22} aria-hidden="true" />
            <strong>No projects yet</strong>
            <p>Create a project first. The assistant requires a real project context; it will not silently open a demo conversation.</p>
            <Link className="button workspacePrimaryAction" href="/projects">Go to projects <ArrowRight size={14} aria-hidden="true" /></Link>
          </div>
        ) : filteredProjects.length === 0 ? (
          <div className="assistantPickerState">No projects match “{query}”. Clear the search to see all projects.</div>
        ) : (
          <div className="assistantPickerList" role="radiogroup" aria-label="Select a project">
            {filteredProjects.map((project) => (
              <button
                key={project.id}
                type="button"
                className={"assistantPickerProject" + (selectedId === project.id ? " assistantPickerProjectSelected" : "")}
                role="radio"
                aria-checked={selectedId === project.id}
                onClick={() => setSelectedId(project.id)}
              >
                <span className="assistantPickerProjectIcon"><FolderKanban size={17} aria-hidden="true" /></span>
                <span className="assistantPickerProjectCopy">
                  <strong>{project.name}</strong>
                  <small>{project.stage.replaceAll("_", " ")} · Revision {project.revision} · Updated {formatUpdated(project.updated_at)}</small>
                </span>
                <Badge variant={projectStatusVariant(project.status)}>{projectStatusLabel(project.status)}</Badge>
                <span className="assistantPickerSelectedMark" aria-hidden="true">{selectedId === project.id ? "Selected" : "Select"}</span>
              </button>
            ))}
          </div>
        )}

        {selectedProject && !loading && !error && (
          <div className="assistantPickerFooter">
            <div><span>Selected project</span><strong>{selectedProject.name}</strong></div>
            <button className="button workspacePrimaryAction" type="button" onClick={openSelectedProject}>
              Open project chat <ArrowRight size={15} aria-hidden="true" />
            </button>
          </div>
        )}
      </section>

      <aside className="assistantPickerNotice">
        <LockKeyhole size={16} aria-hidden="true" />
        <p><strong>Project context is explicit.</strong> Chat history is scoped to the project you select. AI responses do not execute calculations, CAD operations or solver jobs on their own.</p>
      </aside>
    </main>
  );
}
