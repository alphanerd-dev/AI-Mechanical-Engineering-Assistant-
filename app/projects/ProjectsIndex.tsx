"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, CircleDot, FolderKanban, Plus, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { filterProjectIndex, summarizeProjectStatuses } from "@/src/projects/project-dashboard";

type Project = {
  id: string;
  name: string;
  stage: string;
  status: "ACTIVE" | "BLOCKED" | "COMPLETE";
  revision: number;
  created_at: string;
  updated_at: string;
};
type ProjectFilter = "ALL" | Project["status"];
type ApiBody = { projects?: Project[]; error?: string };
const filterOptions: { value: ProjectFilter; label: string }[] = [
  { value: "ALL", label: "All projects" },
  { value: "ACTIVE", label: "Active" },
  { value: "BLOCKED", label: "Blocked" },
  { value: "COMPLETE", label: "Complete" },
];

const projectStatusPresentation = {
  ACTIVE: { variant: "info" as const, label: "Active", Icon: CircleDot },
  BLOCKED: { variant: "warning" as const, label: "Blocked", Icon: AlertTriangle },
  COMPLETE: { variant: "success" as const, label: "Complete", Icon: CheckCircle2 },
};

function ProjectStatus({ status }: { status: Project["status"] }) {
  const { variant, label, Icon } = projectStatusPresentation[status];
  return <Badge variant={variant}><Icon size={11} aria-hidden="true" />{label}</Badge>;
}

function formatUpdated(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleString();
}

function ProjectCards({ projects }: { projects: Project[] }) {
  return <div className="projectsIndexCards">
    {projects.map(project => <Link className="projectsIndexCard" href={`/projects/${project.id}`} key={project.id}>
      <div className="projectsIndexCardTop"><span className="projectsIndexProjectIcon"><FolderKanban size={17} aria-hidden="true" /></span><ProjectStatus status={project.status} /></div>
      <h2>{project.name}</h2>
      <p>{project.stage.replaceAll("_", " ")}</p>
      <div className="projectsIndexCardMeta"><span>Revision {project.revision}</span><span>{formatUpdated(project.updated_at)}</span></div>
      <span className="projectsIndexCardAction">Open project <ArrowUpRight size={14} aria-hidden="true" /></span>
    </Link>)}
  </div>;
}

function ProjectTable({ projects }: { projects: Project[] }) {
  return <section className="projectsIndexTable panel">
    <div className="projectsIndexTableHeader"><div><h2>Project index</h2><p className="muted">Persisted project records. Open a row to inspect project context and its current revision.</p></div></div>
    <div className="projectsIndexTableScroll">
      <table>
        <thead><tr><th scope="col">Project</th><th scope="col">Stage</th><th scope="col">Current revision</th><th scope="col">Status</th><th scope="col">Last updated</th><th scope="col"><span className="sr-only">Action</span></th></tr></thead>
        <tbody>{projects.map(project => <tr key={project.id}>
          <th scope="row"><Link className="projectsIndexNameLink" href={`/projects/${project.id}`}>{project.name}<small>{project.id}</small></Link></th>
          <td>{project.stage.replaceAll("_", " ")}</td><td>R{project.revision}</td>
          <td><ProjectStatus status={project.status} /></td><td>{formatUpdated(project.updated_at)}</td>
          <td><Link className="projectsIndexOpenLink" href={`/projects/${project.id}`}>Open <ArrowUpRight size={13} aria-hidden="true" /></Link></td>
        </tr>)}</tbody>
      </table>
    </div>
  </section>;
}

function useProjectIndexData() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const body = await response.json().catch(() => ({})) as ApiBody;
      if (!response.ok) throw new Error(body.error || "Projects could not be loaded.");
      setProjects(Array.isArray(body.projects) ? body.projects : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Projects could not be loaded.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { projects, loading, refreshing, error, refresh: () => load(true) };
}

function ProjectFilterBar({ filter, setFilter, query, setQuery, counts }: {
  filter: ProjectFilter; setFilter: (value: ProjectFilter) => void; query: string; setQuery: (value: string) => void;
  counts: ReturnType<typeof summarizeProjectStatuses>;
}) {
  return <section className="projectsIndexToolbar panel" aria-label="Project filters">
    <div className="projectsIndexFilters" role="group" aria-label="Filter projects by status">
      {filterOptions.map(option => <button key={option.value} type="button"
        className={filter === option.value ? "projectsFilter projectsFilterActive" : "projectsFilter"}
        aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}>
        {option.label}<span>{countByFilter[option.value]}</span>
      </button>)}
    </div>
    <label className="projectsIndexSearch"><span className="sr-only">Search projects</span><Search size={15} aria-hidden="true" />
      <Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search projects…" />
    </label>
  </section>;
}

function ProjectIndexResults({ loading, error, projects, visibleProjects }: {
  loading: boolean; error: string; projects: Project[]; visibleProjects: Project[];
}) {
  if (loading) return <div className="moduleLoading"><RefreshCw size={15} className="moduleSpin" />Loading persisted projects…</div>;
  if (error) return <section className="projectError" role="alert">{error}</section>;
  if (visibleProjects.length === 0) return <section className="projectsIndexEmpty panel">
    <FolderKanban size={25} aria-hidden="true" />
    <h2>{projects.length === 0 ? "No persisted projects yet" : "No matching projects"}</h2>
    <p className="muted">{projects.length === 0 ? "Create a project to establish durable project context and revision history. The demo sandbox remains separate." : "Change the status filter or search phrase."}</p>
    {projects.length === 0 && <Link className="button" href="/#create-project">Create a project</Link>}
  </section>;
  return <><ProjectCards projects={visibleProjects} /><ProjectTable projects={visibleProjects} /></>;
}

export default function ProjectsIndex() {
  const { projects, loading, refreshing, error, refresh } = useProjectIndexData();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProjectFilter>("ALL");
  const visibleProjects = useMemo(() => filterProjectIndex(projects, query, filter), [filter, projects, query]);
  const counts = useMemo(() => summarizeProjectStatuses(projects), [projects]);

  return <div className="projectsIndexPage projectsIndex">
    <header className="projectsIndexHeader">
      <div><p className="eyebrow">ENGINEERING OS</p><h1>Projects</h1><p className="muted">Organize engineering work by objective, project state, revision and last update.</p></div>
      <Link className="button" href="/#create-project"><Plus size={16} aria-hidden="true" />Create project</Link>
    </header>
    <ProjectFilterBar filter={filter} setFilter={setFilter} query={query} setQuery={setQuery} counts={counts} />
    <div className="projectsIndexResultLine">
      <p>{loading ? "Loading persisted projects…" : `${visibleProjects.length} of ${projects.length} persisted projects`}</p>
      <button className="projectsRefreshButton" type="button" onClick={() => void refresh()} disabled={loading || refreshing}>
        <RefreshCw size={14} aria-hidden="true" className={refreshing ? "projectsRefreshSpin" : undefined} />{refreshing ? "Refreshing" : "Refresh"}
      </button>
    </div>
    <ProjectIndexResults loading={loading} error={error} projects={projects} visibleProjects={visibleProjects} />
  </div>;
}
